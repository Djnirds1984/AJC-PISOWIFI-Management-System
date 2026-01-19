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
  console.log('[NET] Overhauling Firewall (DNS-Control Mode)...');
  try {
    await execPromise('sysctl -w net.ipv4.ip_forward=1');
    
    // 1. Reset Everything
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -X').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    await execPromise('iptables -t nat -X').catch(() => {});
    await execPromise('iptables -t mangle -F').catch(() => {});

    // 2. Default Policies
    await execPromise('iptables -P INPUT ACCEPT').catch(() => {});
    await execPromise('iptables -P FORWARD DROP').catch(() => {}); // Block external traffic by default
    await execPromise('iptables -P OUTPUT ACCEPT').catch(() => {});

    const ifaces = await getInterfaces();
    const wan = ifaces.find(i => i.type === 'ethernet' && i.status === 'up')?.name || 'eth0';
    const lan = ifaces.find(i => i.type === 'wifi' && i.status === 'up')?.name || 'wlan0';

    // 3. Masquerade for internet access
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    // 4. Global Allowed Traffic (Internal)
    // Allow everything to the portal itself (Assets/UI)
    // Prefer bridge interface if available as it handles aggregated traffic
    const bridge = ifaces.find(i => i.type === 'bridge' && i.status === 'up');
    const actualLan = bridge ? bridge.name : lan;
    
    await execPromise(`iptables -A INPUT -i ${actualLan} -j ACCEPT`).catch(() => {});
    
    // Allow established connections
    await execPromise('iptables -A FORWARD -m state --state ESTABLISHED,RELATED -j ACCEPT').catch(() => {});

    // 5. Captive Portal Redirect (HTTP Port 80)
    // Non-authorized clients hit this to see the portal
    await execPromise(`iptables -t nat -A PREROUTING -i ${actualLan} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});
    
    console.log(`[NET] Firewall ready. LAN: ${actualLan}, WAN: ${wan}. Authorized users will use 8.8.8.8.`);
  } catch (e) {
    console.error('[NET] Firewall overhaul error:', e.message);
  }
}

async function whitelistMAC(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Unblocking Device (Forcing 8.8.8.8 DNS): ${mac}`);
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    
    // 1. Allow all traffic in FORWARD chain
    await execPromise(`iptables -I FORWARD 1 -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
    
    // 2. Bypass Portal Redirection
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});

    // 3. Force DNS to 8.8.8.8 for this authorized client
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} -p udp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});
    await execPromise(`iptables -t nat -I PREROUTING 2 -m mac --mac-source ${mac} -p tcp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});

    // 4. Instant State Reset
    if (isValidIp(ip)) {
      await execPromise(`conntrack -D -s ${ip} 2>/dev/null || true`).catch(() => {});
      await execPromise(`conntrack -D -d ${ip} 2>/dev/null || true`).catch(() => {});
    }
  } catch (e) {
    console.error(`[NET] Whitelist error:`, e.message);
  }
}

async function blockMAC(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Blocking Device (Redirecting to Portal): ${mac}`);
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    
    // 1. Clean up whitelist rules
    await execPromise(`iptables -D FORWARD -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -p udp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});
    await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -p tcp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});

    // 2. Redirect DNS to Portal IP (Captive Portal Trigger)
    // We let the default PREROUTING REDIRECT handle HTTP
    // And let the default FORWARD DROP handle the rest
    
    // 3. Instant State Reset
    if (isValidIp(ip)) {
      await execPromise(`conntrack -D -s ${ip} 2>/dev/null || true`).catch(() => {});
      await execPromise(`conntrack -D -d ${ip} 2>/dev/null || true`).catch(() => {});
    }
  } catch (e) {
    console.error(`[NET] Block error:`, e.message);
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
  let { interface, ip_address, dhcp_range } = config;
  try {
    // Check if interface is bridged (slave)
    try {
      const { stdout } = await execPromise(`ip -j link show ${interface}`);
      const linkInfo = JSON.parse(stdout)[0];
      if (linkInfo && linkInfo.master) {
        console.log(`[HOTSPOT] Interface ${interface} is bridged to ${linkInfo.master}. Redirecting config to bridge.`);
        // Flush IP on the slave interface to avoid conflicts
        await execPromise(`ip addr flush dev ${interface}`).catch(() => {});
        // Use the bridge interface instead
        interface = linkInfo.master;
      }
    } catch (e) {}

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
    let targetInterface = interface;
    // Check if interface is bridged to find the correct target
    try {
      const { stdout } = await execPromise(`ip -j link show ${interface}`);
      const linkInfo = JSON.parse(stdout)[0];
      if (linkInfo && linkInfo.master) {
         targetInterface = linkInfo.master;
      }
    } catch (e) {}

    // Clean up possible config files (bridge or direct)
    const filesToCheck = [
      `/etc/dnsmasq.d/ajc_${targetInterface}.conf`,
      `/etc/dnsmasq.d/ajc_${interface}.conf`
    ];
    
    for (const file of filesToCheck) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }

    // Clean up iptables rules for both potentially
    await execPromise(`iptables -t nat -D PREROUTING -i ${targetInterface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});
    if (targetInterface !== interface) {
      await execPromise(`iptables -t nat -D PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});
    }

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
  cleanupAllNetworkSettings: async () => {
    await execPromise('iptables -F');
    await execPromise('iptables -t nat -F');
    await execPromise('systemctl restart dnsmasq');
    await execPromise('rm -f /etc/dnsmasq.d/ajc_*.conf');
    await execPromise('killall hostapd').catch(() => {});
  }
};