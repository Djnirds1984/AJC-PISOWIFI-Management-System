const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('node:path');
const execPromise = util.promisify(exec);

const isValidIp = (ip) => {
  if (!ip || ip === 'AUTO' || ip === 'unknown') return false;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  return ipv4Regex.test(ip);
};

async function getInterfaces() {
  try {
    const { stdout } = await execPromise('ip -j addr');
    const data = JSON.parse(stdout);
    return data.map(iface => {
      const ifname = (iface.ifname || iface.name || '').toLowerCase();
      const linkType = (iface.link_type || '').toLowerCase();
      const operstate = (iface.operstate || '').toLowerCase();
      let type = 'ethernet';
      if (ifname.startsWith('wlan') || ifname.startsWith('ap') || ifname.startsWith('ra')) {
        type = 'wifi';
      } else if (linkType === 'loopback' || ifname === 'lo') {
        type = 'loopback';
      } else if (ifname.startsWith('br') || linkType === 'bridge') {
        type = 'bridge';
      } else if (ifname.includes('.') || linkType === 'vlan') {
        type = 'vlan';
      }
      const status = (operstate === 'up' || operstate === 'unknown') ? 'up' : 'down';
      return {
        name: iface.ifname || iface.name,
        type: type,
        status: status,
        ip: iface.addr_info?.[0]?.local || null,
        mac: iface.address,
        isLoopback: ifname === 'lo'
      };
    });
  } catch (err) {
    console.error('Error getting interfaces:', err);
    return [];
  }
}

async function initFirewall() {
  console.log('[NET] Re-initializing AJC Firewall (Aggressive Mode)...');
  try {
    await execPromise('sysctl -w net.ipv4.ip_forward=1');
    
    // Flush all rules
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -X').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    await execPromise('iptables -t nat -X').catch(() => {});
    await execPromise('iptables -t mangle -F').catch(() => {});
    await execPromise('iptables -t mangle -X').catch(() => {});

    // Set Default Policies
    await execPromise('iptables -P INPUT ACCEPT').catch(() => {});
    await execPromise('iptables -P OUTPUT ACCEPT').catch(() => {});
    await execPromise('iptables -P FORWARD DROP').catch(() => {}); // BLOCK EVERYTHING BY DEFAULT

    const ifaces = await getInterfaces();
    const wan = ifaces.find(i => i.type === 'ethernet' && i.status === 'up')?.name || 'eth0';
    const lan = ifaces.find(i => i.type === 'wifi' && i.status === 'up')?.name || 'wlan0';

    // Masquerade for WAN
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    // Allow established/related traffic
    await execPromise('iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT').catch(() => {});

    // Allow DNS (UDP/TCP 53) from everyone to the router itself
    await execPromise('iptables -A INPUT -p udp --dport 53 -j ACCEPT').catch(() => {});
    await execPromise('iptables -A INPUT -p tcp --dport 53 -j ACCEPT').catch(() => {});
    
    // Allow DHCP
    await execPromise('iptables -A INPUT -p udp --dport 67:68 --sport 67:68 -j ACCEPT').catch(() => {});

    // Allow HTTP/HTTPS to the router itself (for the portal)
    await execPromise('iptables -A INPUT -p tcp -m multiport --dports 80,443,3000 -j ACCEPT').catch(() => {});

    // CAPTIVE PORTAL REDIRECT: Redirect all HTTP (port 80) to the local portal (port 80/3000)
    // This only applies to clients NOT already whitelisted (because whitelist rules are at the top)
    await execPromise(`iptables -t nat -A PREROUTING -i ${lan} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});

    console.log(`[NET] Firewall initialized. WAN: ${wan}, LAN: ${lan}. Default Policy: DROP`);
  } catch (e) {
    console.error('[NET] Firewall Aggressive Init Error:', e.message);
  }
}

async function whitelistMAC(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Authorizing Client: ${mac} (${ip || 'no-ip'})`);
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    
    // 1. Add to FORWARD chain (at the top)
    await execPromise(`iptables -I FORWARD 1 -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
    
    // 2. Clear any PREROUTING redirect for this MAC
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});

    // 3. Transparent Refresh (No Disconnect)
    await forceNetworkRefresh(mac, ip);
    
  } catch (e) {
    console.error(`[NET] Whitelist error:`, e.message);
  }
}

async function blockMAC(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Blocking Client: ${mac} (${ip || 'no-ip'})`);
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    
    // 1. Remove whitelist rules
    await execPromise(`iptables -D FORWARD -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
    
    // 2. Add REJECT rule to kill active connections immediately
    await execPromise(`iptables -I FORWARD 1 -m mac --mac-source ${mac} ${ipFilter} -j REJECT`).catch(() => {});
    
    // 3. Clear conntrack entries so the REJECT rule applies instantly to existing flows
    if (isValidIp(ip)) {
      await execPromise(`conntrack -D -s ${ip} 2>/dev/null || true`).catch(() => {});
      await execPromise(`conntrack -D -d ${ip} 2>/dev/null || true`).catch(() => {});
    }
  } catch (e) {
    console.error(`[NET] Block error:`, e.message);
  }
}

async function forceNetworkRefresh(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Refreshing connection for ${mac} (${ip || 'no-ip'})...`);
  
  try {
    if (isValidIp(ip)) {
      // 1. Clear conntrack entries (Transparently resets active TCP/UDP flows)
      await execPromise(`conntrack -D -s ${ip} 2>/dev/null || true`).catch(() => {});
      await execPromise(`conntrack -D -d ${ip} 2>/dev/null || true`).catch(() => {});

      // 2. Connectivity Nudge: Pings and UDP triggers to wake up OS network detection
      // Pinging the device forces the device's kernel to re-evaluate its gateway
      await execPromise(`ping -c 2 -W 1 ${ip}`).catch(() => {});
      
      // 3. ARP Flush & Refresh (Forces the device to re-ARP for the gateway)
      const { stdout: ifaceInfo } = await execPromise('ip -j addr show').catch(() => ({ stdout: '[]' }));
      const interfaces = JSON.parse(ifaceInfo);
      const activeIface = interfaces.find(iface => 
        iface.addr_info?.some(addr => addr.local && addr.local.split('.')[0] === ip.split('.')[0])
      );

      if (activeIface) {
        // Send Gratuitous ARP (Forces device to update its ARP cache without disconnecting)
        const ourIp = activeIface.addr_info.find(addr => addr.local.split('.')[0] === ip.split('.')[0]).local;
        await execPromise(`arping -U -c 2 -I ${activeIface.ifname} -s ${ourIp} ${ip}`).catch(() => {});
      }
    }
    
    console.log(`[NET] Connection refreshed for ${mac} without SSID disconnect.`);
  } catch (e) {
    console.error(`[NET] Refresh error:`, e.message);
  }
}

async function createVlan({ parent, id, name }) {
  console.log(`[NET] Creating VLAN ${name} on ${parent} ID ${id}`);
  try {
    await execPromise(`ip link add link ${parent} name ${name} type vlan id ${id}`);
    await execPromise(`ip link set dev ${name} up`);
  } catch (e) { throw e; }
}

async function createBridge({ name, members, stp }) {
  console.log(`[NET] Creating Bridge ${name} with members: ${members.join(', ')}`);
  try {
    await execPromise(`brctl addbr ${name}`).catch(() => {});
    for (const member of members) {
      await execPromise(`ip link set dev ${member} down`).catch(() => {});
      await execPromise(`brctl addif ${name} ${member}`).catch(() => {});
      await execPromise(`ip link set dev ${member} up`).catch(() => {});
    }
    if (stp) await execPromise(`brctl stp ${name} on`);
    await execPromise(`ip link set dev ${name} up`);
    return `Bridge ${name} active.`;
  } catch (e) { throw e; }
}

async function setupHotspot(config) {
  const { interface, ip_address, dhcp_range } = config;
  try {
    await execPromise(`ip link set ${interface} up`);
    await execPromise(`ip addr flush dev ${interface}`);
    await execPromise(`ip addr add ${ip_address}/24 dev ${interface}`);
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});

    const dnsConfig = `interface=${interface}\ndhcp-range=${dhcp_range},12h\ndhcp-option=3,${ip_address}\ndhcp-option=6,${ip_address}\naddress=/#/${ip_address}`;
    fs.writeFileSync(`/etc/dnsmasq.d/ajc_${interface}.conf`, dnsConfig);
    
    await execPromise(`systemctl restart dnsmasq`);
    console.log(`[HOTSPOT] Segment Live on ${interface}`);
  } catch (e) { throw e; }
}

async function removeHotspot(interface) {
  try {
    const configPath = `/etc/dnsmasq.d/ajc_${interface}.conf`;
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    await execPromise(`iptables -t nat -D PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});
    await execPromise(`systemctl restart dnsmasq`);
  } catch (e) { throw e; }
}

async function configureWifiAP(config) {
  const { interface, ssid, password, bridge } = config;
  try {
    await execPromise(`ip link set ${interface} up`);
    const hostapdConfig = `interface=${interface}\n${bridge ? `bridge=${bridge}` : ''}\ndriver=nl80211\nssid=${ssid}\nhw_mode=g\nchannel=1\nwmm_enabled=0\nmacaddr_acl=0\nauth_algs=1\nignore_broadcast_ssid=0\n${password ? `wpa=2\nwpa_passphrase=${password}\nwpa_key_mgmt=WPA-PSK\nwpa_pairwise=TKIP\nrsn_pairwise=CCMP` : ''}`;
    
    const configPath = `/etc/hostapd/hostapd_${interface}.conf`;
    fs.writeFileSync(configPath, hostapdConfig);
    
    // Ensure interface is not managed by wpa_supplicant and kill existing hostapd
    await execPromise(`systemctl stop hostapd || true`);
    await execPromise(`killall hostapd || true`);
    await execPromise(`nmcli device set ${interface} managed no || true`);
    await execPromise(`rfkill unblock wifi || true`);
    
    await execPromise(`hostapd -B ${configPath}`);
    console.log(`[WIFI] Broadcast started on ${interface}: ${ssid}`);
  } catch (e) { 
    console.error(`[WIFI] Failed to deploy AP on ${interface}:`, e.message);
    throw e; 
  }
}

async function scanWifiDevices() {
  console.log('[WIFI] Scanning for connected WiFi devices...');
  const devices = [];
  
  try {
    // Get all interfaces
    const interfaces = await getInterfaces();
    const wifiInterfaces = interfaces.filter(iface => iface.type === 'wifi' && iface.status === 'up');
    
    for (const wifiInterface of wifiInterfaces) {
      try {
        // Get associated stations using iw
        const { stdout: stationsOutput } = await execPromise(`iw dev ${wifiInterface.name} station dump`).catch(() => ({ stdout: '' }));
        
        if (stationsOutput) {
          const stations = stationsOutput.split('\n\n').filter(station => station.trim());
          
          for (const station of stations) {
            const macMatch = station.match(/^Station ([a-fA-F0-9:]{17})/);
            if (macMatch) {
              const mac = macMatch[1].toUpperCase();
              
              // Get signal strength
              const signalMatch = station.match(/signal:\s*(-?\d+)/);
              const signal = signalMatch ? parseInt(signalMatch[1]) : -50;
              
              // Get IP from ARP table with better error handling
              let ip = 'Unknown';
              try {
                // Try multiple ARP commands
                const arpCommands = [
                  `ip neigh show | grep -i ${mac}`,
                  `arp -n | grep -i ${mac}`,
                  `cat /proc/net/arp | grep -i ${mac}`
                ];
                
                for (const cmd of arpCommands) {
                  try {
                    const { stdout: arpOutput } = await execPromise(cmd).catch(() => ({ stdout: '' }));
                    const arpMatch = arpOutput.match(/(\d+\.\d+\.\d+\.\d+)/);
                    if (arpMatch && arpMatch[1]) {
                      ip = arpMatch[1];
                      break;
                    }
                  } catch (e) {}
                }
              } catch (e) {}
              
              // Get hostname from DHCP leases with better parsing
              let hostname = 'Unknown';
              try {
                const leaseFiles = ['/tmp/dhcp.leases', '/var/lib/dnsmasq/dnsmasq.leases', '/var/lib/dhcp/dhcpd.leases'];
                for (const leaseFile of leaseFiles) {
                  if (fs.existsSync(leaseFile)) {
                    const leaseContent = fs.readFileSync(leaseFile, 'utf8');
                    // Look for MAC address in lease file
                    const lines = leaseContent.split('\n');
                    for (const line of lines) {
                      if (line.toLowerCase().includes(mac.toLowerCase())) {
                        // Try to extract hostname from different lease formats
                        const parts = line.split(/\s+/);
                        if (parts.length >= 4) {
                          // Common format: lease_mac ip hostname lease_time
                          hostname = parts[3] || 'Unknown';
                          break;
                        }
                      }
                    }
                    if (hostname !== 'Unknown') break;
                  }
                }
              } catch (e) {}
              
              devices.push({
                mac,
                ip: ip || 'Unknown',
                hostname: hostname || 'Unknown',
                interface: wifiInterface.name,
                ssid: wifiInterface.name,
                signal,
                connectedAt: Date.now(),
                lastSeen: Date.now(),
                isActive: true
              });
            }
          }
        }
      } catch (e) {
        console.error(`[WIFI] Error scanning interface ${wifiInterface.name}:`, e.message);
      }
    }
    
    // Also scan for devices in ARP table that might be on WiFi bridges
    try {
      const { stdout: arpOutput } = await execPromise('ip neigh show').catch(() => ({ stdout: '' }));
      const arpLines = arpOutput.split('\n').filter(line => line.trim());
      
      for (const line of arpLines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 5 && parts[3] && parts[3] !== '00:00:00:00:00:00') {
          const ip = parts[0];
          const mac = parts[3].toUpperCase();
          const state = parts[4];
          
          // Skip if already found or not reachable
          if (devices.find(d => d.mac === mac) || state !== 'REACHABLE') continue;
          
          // Check if this MAC is on a WiFi interface or bridge
          let isWifiDevice = false;
          for (const iface of interfaces) {
            if ((iface.type === 'wifi' || iface.type === 'bridge') && iface.status === 'up') {
              isWifiDevice = true;
              break;
            }
          }
          
          if (isWifiDevice) {
            devices.push({
              mac,
              ip,
              hostname: 'Unknown',
              interface: 'wifi-bridge',
              ssid: 'Unknown',
              signal: -60,
              connectedAt: Date.now(),
              lastSeen: Date.now(),
              isActive: true
            });
          }
        }
      }
    } catch (e) {}
    
    console.log(`[WIFI] Found ${devices.length} WiFi devices`);
    return devices;
  } catch (err) {
    console.error('[WIFI] Error scanning for devices:', err.message);
    return [];
  }
}

module.exports = { 
  getInterfaces, 
  setupHotspot, 
  removeHotspot,
  configureWifiAP,
  whitelistMAC,
  blockMAC,
  createVlan,
  createBridge,
  initFirewall,
  scanWifiDevices,
  forceNetworkRefresh,
  cleanupAllNetworkSettings: async () => {
    await execPromise('iptables -F');
    await execPromise('iptables -t nat -F');
    await execPromise('systemctl restart dnsmasq');
    await execPromise('rm -f /etc/dnsmasq.d/ajc_*.conf');
    await execPromise('killall hostapd').catch(() => {});
  }
};