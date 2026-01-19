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
  console.log('[NET] Re-initializing AJC Firewall (Stable Mode)...');
  try {
    await execPromise('sysctl -w net.ipv4.ip_forward=1');
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    
    const ifaces = await getInterfaces();
    const wan = ifaces.find(i => i.type === 'ethernet' && i.status === 'up')?.name || 'eth0';
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    // Allow return traffic for established connections
    await execPromise('iptables -I FORWARD 1 -m state --state ESTABLISHED,RELATED -j ACCEPT').catch(() => {});

    // Allow DNS queries from internal networks
    await execPromise('iptables -t nat -A PREROUTING -p udp --dport 53 -j ACCEPT').catch(() => {});
    await execPromise('iptables -t nat -A PREROUTING -p tcp --dport 53 -j ACCEPT').catch(() => {});
    
    // Allow DNS forwarding
    await execPromise('iptables -A FORWARD -p udp --dport 53 -j ACCEPT').catch(() => {});
    await execPromise('iptables -A FORWARD -p tcp --dport 53 -j ACCEPT').catch(() => {});

    console.log(`[NET] Firewall initialized on WAN: ${wan}`);
  } catch (e) {
    console.error('[NET] Firewall Init Error:', e.message);
  }
}

async function whitelistMAC(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Authorizing Client: ${mac} (${ip || 'no-ip'})`);
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    
    // Allow all traffic from this MAC/IP combination
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -I FORWARD 1 -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
    
    // Also allow DNS queries from authorized clients
    await execPromise(`iptables -I FORWARD 2 -m mac --mac-source ${mac} ${ipFilter} -p udp --dport 53 -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -I FORWARD 3 -m mac --mac-source ${mac} ${ipFilter} -p tcp --dport 53 -j ACCEPT`).catch(() => {});
    
    // Allow HTTP/HTTPS traffic
    await execPromise(`iptables -I FORWARD 4 -m mac --mac-source ${mac} ${ipFilter} -p tcp -m multiport --dports 80,443 -j ACCEPT`).catch(() => {});
    
  } catch (e) {
    console.error(`[NET] Whitelist error:`, e.message);
  }
}

async function blockMAC(mac, ip) {
  if (!mac) return;
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -D FORWARD -m mac --mac-source ${mac} ${ipFilter} -j ACCEPT`).catch(() => {});
  } catch (e) {
    console.error(`[NET] Block error:`, e.message);
  }
}

async function forceNetworkRefresh(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Forcing network refresh for device: ${mac} (${ip || 'no-ip'})`);
  
  try {
    // Method 1: Send ICMP redirect to force device to re-ARP
    if (isValidIp(ip)) {
      // Send ICMP redirect packet to force the device to update its routing
      await execPromise(`ping -c 1 -W 1 ${ip}`).catch(() => {});
      
      // Force ARP table update by pinging the gateway from the device IP
      const { stdout: routeOutput } = await execPromise('ip route show').catch(() => ({ stdout: '' }));
      const defaultRoute = routeOutput.match(/default via (\d+\.\d+\.\d+\.\d+)/);
      if (defaultRoute && defaultRoute[1]) {
        const gateway = defaultRoute[1];
        // Send ARP request to refresh device ARP entry
        await execPromise(`arping -c 2 -I $(ip route get ${ip} | grep -oP 'dev \K\w+') ${ip}`).catch(() => {});
      }
    }
    
    // Method 2: Force DHCP lease renewal by sending DHCP NAK (if we control DHCP)
    try {
      // Check if dnsmasq is running and send DHCP release/renew
      const { stdout: dhcpLeases } = await execPromise('cat /tmp/dhcp.leases 2>/dev/null || cat /var/lib/dnsmasq/dnsmasq.leases 2>/dev/null || echo ""').catch(() => ({ stdout: '' }));
      if (dhcpLeases.includes(mac.toLowerCase())) {
        // Restart dnsmasq to force lease renewal for all clients
        await execPromise('systemctl reload dnsmasq 2>/dev/null || service dnsmasq reload 2>/dev/null || pkill -HUP dnsmasq 2>/dev/null').catch(() => {});
        console.log(`[NET] DHCP service reloaded to force lease renewal`);
      }
    } catch (e) {
      console.log(`[NET] DHCP refresh not available:`, e.message);
    }
    
    // Method 3: Clear conntrack entries for this device to force new connections
    if (isValidIp(ip)) {
      await execPromise(`conntrack -D -s ${ip} 2>/dev/null || true`).catch(() => {});
      await execPromise(`conntrack -D -d ${ip} 2>/dev/null || true`).catch(() => {});
    }
    
    // Method 4: Send gratuitous ARP to update device ARP table
    if (isValidIp(ip)) {
      // Get our interface MAC and IP
      const { stdout: ifaceInfo } = await execPromise('ip -j addr show').catch(() => ({ stdout: '[]' }));
      try {
        const interfaces = JSON.parse(ifaceInfo);
        const activeIface = interfaces.find(iface => 
          iface.addr_info?.some(addr => addr.local && addr.local.split('.')[0] === ip.split('.')[0])
        );
        if (activeIface && activeIface.address) {
          const ourMac = activeIface.address;
          const ourIp = activeIface.addr_info.find(addr => addr.local.split('.')[0] === ip.split('.')[0]).local;
          // Send gratuitous ARP
          await execPromise(`arping -U -c 2 -I ${activeIface.ifname} -s ${ourIp} ${ip}`).catch(() => {});
        }
      } catch (e) {
        console.log(`[NET] Gratuitous ARP failed:`, e.message);
      }
    }
    
    console.log(`[NET] Network refresh completed for ${mac}`);
    
    // Give devices time to process the network changes
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (e) {
    console.error(`[NET] Network refresh error for ${mac}:`, e.message);
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