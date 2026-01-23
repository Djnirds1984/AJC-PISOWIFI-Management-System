const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('node:path');
const db = require('./db');
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

/**
 * Smartly detects which interface is WAN and which are LAN candidates.
 * WAN Priority:
 * 1. Interface with valid external IP (not 10.0.0.1/24)
 * 2. Interface with status 'up'
 * 3. Onboard interface names (eno*, enp*)
 * 4. Fallback to first ethernet found
 */
function classifyInterfaces(interfaces) {
  const ethernet = interfaces.filter(i => i.type === 'ethernet' && !i.isLoopback);
  const wifi = interfaces.filter(i => i.type === 'wifi');
  
  // Find WAN
  let wan = null;
  
  // 1. Check for active upstream IP (ignore our own 10.0.0.1 or empty)
  const withExternalIp = ethernet.find(i => i.ip && !i.ip.startsWith('10.0.0.'));
  
  if (withExternalIp) {
    wan = withExternalIp;
  } else {
    // 2. Check for active link status
    const activeLinks = ethernet.filter(i => i.status === 'up');
    
    if (activeLinks.length > 0) {
      // Prefer onboard names if multiple are up
      const onboard = activeLinks.find(i => i.name.startsWith('en') || i.name.startsWith('eth0'));
      wan = onboard || activeLinks[0];
    } else {
      // 3. Fallback to name heuristic
      wan = ethernet.find(i => i.name.startsWith('en') || i.name === 'eth0') || ethernet[0];
    }
  }

  // Fallback if absolutely no ethernet found
  const wanName = wan ? wan.name : 'eth0';

  // LAN Candidates: All OTHER ethernet interfaces + Primary Wifi
  const lanMembers = [];
  
  // Add Wifi
  const wlan0 = wifi.find(i => i.name === 'wlan0') || wifi[0];
  if (wlan0) lanMembers.push(wlan0.name);
  
  // Add other ethernets (USB adapters, secondary ports)
  ethernet.forEach(e => {
    if (e.name !== wanName) {
      lanMembers.push(e.name);
    }
  });

  return { wanName, lanMembers };
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
    const { wanName } = classifyInterfaces(ifaces);
    const wan = wanName;
    console.log(`[NET] Detected WAN Interface: ${wan}`);

    // 3. Masquerade for internet access
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    // 4. Global Allowed Traffic (Internal)
    // Allow everything to the portal itself (Assets/UI)
    // Prefer bridge interface if available as it handles aggregated traffic
    const bridge = ifaces.find(i => i.type === 'bridge' && i.status === 'up');
    const actualLan = bridge ? bridge.name : (ifaces.find(i => i.type === 'wifi')?.name || 'wlan0');
    
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

async function getInterfaceForIp(ip) {
  try {
    const { stdout } = await execPromise(`ip route get ${ip}`);
    // Output format: "10.0.13.57 dev eth0.13 src 10.0.13.1 uid 0"
    const match = stdout.match(/dev\s+(\S+)/);
    return match ? match[1] : null;
  } catch (e) {
    console.error(`[NET] Error finding interface for IP ${ip}:`, e.message);
    return null;
  }
}

async function setSpeedLimit(mac, ip, downloadMbps, uploadMbps) {
  if (!mac || !ip) return;
  
  // Dynamically find the correct interface for this client IP (e.g., VLAN interface)
  const lan = await getInterfaceForIp(ip);
  if (!lan) {
    console.error(`[QoS] Could not determine interface for IP ${ip}, aborting limit.`);
    return;
  }

  const discipline = (await db.get("SELECT value FROM config WHERE key = 'qos_discipline'"))?.value || 'cake';
  
  console.log(`[QoS] Setting limit for ${mac} (${ip}) on ${lan}: DL=${downloadMbps}M, UL=${uploadMbps}M`);
  
  const ipParts = ip.split('.');
  const classId = parseInt(ipParts[3]);
  const dlHandle = `1:${classId}0`; // Download class: 1:1600, 1:1601, etc.
  const ulHandle = `1:${classId}1`; // Upload class: 1:1601, 1:1602, etc.
  
  await removeSpeedLimit(mac, ip);
  
  // Ensure QoS root exists on this specific interface
  try {
    await execPromise(`tc qdisc show dev ${lan} | grep -q "parent 1:10"`);
  } catch (e) {
    // Root qdisc missing or different, initialize it
    console.log(`[QoS] Initializing missing QoS root on ${lan}`);
    await initQoS(lan, discipline);
  }

  // Download Limiting (traffic destined to the device - match ip dst)
  if (downloadMbps > 0) {
    try {
      await execPromise(`tc class add dev ${lan} parent 1: classid ${dlHandle} htb rate ${downloadMbps}mbit ceil ${downloadMbps}mbit`);
      await execPromise(`tc qdisc add dev ${lan} parent ${dlHandle} handle ${classId}0: ${discipline} bandwidth ${downloadMbps}mbit`);
      await execPromise(`tc filter add dev ${lan} protocol ip parent 1:0 prio 1 u32 match ip dst ${ip} flowid ${dlHandle}`);
    } catch (e) {
      console.error(`[QoS] Download Limit error:`, e.message);
    }
  }
  
  // Upload Limiting (traffic sourced from the device - match ip src)
  if (uploadMbps > 0) {
    try {
      await execPromise(`tc class add dev ${lan} parent 1: classid ${ulHandle} htb rate ${uploadMbps}mbit ceil ${uploadMbps}mbit`);
      await execPromise(`tc qdisc add dev ${lan} parent ${ulHandle} handle ${classId}1: ${discipline} bandwidth ${uploadMbps}mbit`);
      await execPromise(`tc filter add dev ${lan} protocol ip parent 1:0 prio 2 u32 match ip src ${ip} flowid ${ulHandle}`);
    } catch (e) {
      console.error(`[QoS] Upload Limit error:`, e.message);
    }
  }
}

async function removeSpeedLimit(mac, ip) {
  if (!ip) return;
  const lan = await getInterfaceForIp(ip); // Use dynamic interface lookup
  if (!lan) return;

  const ipParts = ip.split('.');
  const classId = parseInt(ipParts[3]);
  const dlHandle = `1:${classId}0`; // Download class
  const ulHandle = `1:${classId}1`; // Upload class
  
  try {
    // Remove download filters and classes
    await execPromise(`tc filter del dev ${lan} protocol ip parent 1:0 prio 1 u32 match ip dst ${ip} flowid ${dlHandle}`).catch(() => {});
    await execPromise(`tc qdisc del dev ${lan} parent ${dlHandle} handle ${classId}0:`).catch(() => {});
    await execPromise(`tc class del dev ${lan} parent 1: classid ${dlHandle}`).catch(() => {});
    
    // Remove upload filters and classes
    await execPromise(`tc filter del dev ${lan} protocol ip parent 1:0 prio 2 u32 match ip src ${ip} flowid ${ulHandle}`).catch(() => {});
    await execPromise(`tc qdisc del dev ${lan} parent ${ulHandle} handle ${classId}1:`).catch(() => {});
    await execPromise(`tc class del dev ${lan} parent 1: classid ${ulHandle}`).catch(() => {});
  } catch (e) {
    // Ignore errors if class doesn't exist
  }
}

async function whitelistMAC(mac, ip) {
  if (!mac) return;
  console.log(`[NET] Unblocking Device (Forcing 8.8.8.8 DNS): ${mac}`);
  try {
    const ipFilter = isValidIp(ip) ? `-s ${ip}` : '';
    
    // 1. Clean up ANY existing rules first to prevent duplicates
    // We try to delete multiple times just in case
    for (let i = 0; i < 3; i++) {
        await execPromise(`iptables -D FORWARD -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
        await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
        await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -p udp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});
        await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -p tcp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});
    }

    // 2. Allow all traffic in FORWARD chain
    await execPromise(`iptables -I FORWARD 1 -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
    
    // 3. Bypass Portal Redirection
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});

    // 4. Force DNS to 8.8.8.8 for this authorized client
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} -p udp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});
    await execPromise(`iptables -t nat -I PREROUTING 2 -m mac --mac-source ${mac} -p tcp --dport 53 -j DNAT --to-destination 8.8.8.8:53`).catch(() => {});

    // 5. Instant State Reset
    if (isValidIp(ip)) {
      await execPromise(`conntrack -D -s ${ip} 2>/dev/null || true`).catch(() => {});
      await execPromise(`conntrack -D -d ${ip} 2>/dev/null || true`).catch(() => {});
      
      // Apply Speed Limit
      // Priority: Device Limit (Manual Override) > Session Limit (Plan)
      const device = await db.get('SELECT download_limit, upload_limit FROM wifi_devices WHERE mac = ?', [mac]);
      const session = await db.get('SELECT download_limit, upload_limit FROM sessions WHERE mac = ?', [mac]);
      
      let dl = 0, ul = 0;
      
      if (device && (device.download_limit > 0 || device.upload_limit > 0)) {
        dl = device.download_limit;
        ul = device.upload_limit;
      } else if (session) {
        dl = session.download_limit;
        ul = session.upload_limit;
      }
      
      if (dl > 0 || ul > 0) {
        await setSpeedLimit(mac, ip, dl, ul);
      }
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
    
    // Remove Speed Limit
    await removeSpeedLimit(mac, ip);

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
  } catch (e) { 
    if (e.message.includes('File exists')) {
      // It's okay, just ensure it's up
      await execPromise(`ip link set dev ${name} up`).catch(() => {});
    } else {
      throw e; 
    }
  }
}

async function deleteVlan(name) {
  console.log(`[NET] Deleting VLAN ${name}`);
  try {
    await execPromise(`ip link delete dev ${name}`);
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

async function deleteBridge(name) {
  console.log(`[NET] Deleting Bridge ${name}`);
  try {
    await execPromise(`ip link set dev ${name} down`);
    await execPromise(`brctl delbr ${name}`);
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

    const dnsConfig = `interface=${interface}\nbind-interfaces\ndhcp-range=${dhcp_range},12h\ndhcp-option=3,${ip_address}\ndhcp-option=6,${ip_address}\naddress=/#/${ip_address}`;
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
    // Get allowed interfaces (hotspots and their bridge members)
    const hotspotRows = await db.all('SELECT interface FROM hotspots WHERE enabled = 1');
    const bridgeRows = await db.all('SELECT * FROM bridges');
    
    const allowedInterfaces = new Set();
    hotspotRows.forEach(h => allowedInterfaces.add(h.interface));
    
    bridgeRows.forEach(b => {
      if (allowedInterfaces.has(b.name)) {
        try {
          const members = JSON.parse(b.members);
          members.forEach(m => allowedInterfaces.add(m));
        } catch (e) {}
      }
    });

    // Get all interfaces
    const interfaces = await getInterfaces();
    const wifiInterfaces = interfaces.filter(iface => 
      iface.type === 'wifi' && 
      iface.status === 'up' &&
      allowedInterfaces.has(iface.name)
    );
    
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
        // Robust parsing using regex
        // Matches: IP dev IFACE [lladdr] MAC STATE
        const match = line.match(/^(\S+)\s+dev\s+(\S+)\s+(?:lladdr\s+)?([0-9a-fA-F:]{17})\s+(\S+)/);
        
        if (match) {
          const ip = match[1];
          const ifaceName = match[2];
          const mac = match[3].toUpperCase();
          const state = match[4].toUpperCase(); // REACHABLE, STALE, DELAY, etc.
          
          // Skip if already found in iw dump
          if (devices.find(d => d.mac === mac)) continue;

          // Accept more states than just REACHABLE
          // STALE means the entry is valid but hasn't been verified recently (common for quiet devices)
          const validStates = ['REACHABLE', 'STALE', 'DELAY', 'PROBE'];
          if (!validStates.includes(state)) continue;
          
          // Check if this interface is relevant (WiFi, Bridge, VLAN, or Ethernet) AND is allowed
          const relevantInterface = interfaces.find(i => 
            (i.name === ifaceName) && 
            (i.type === 'wifi' || i.type === 'bridge' || i.type === 'vlan' || i.type === 'ethernet') &&
            allowedInterfaces.has(i.name)
          );
          
          if (relevantInterface) {
             // Try to resolve hostname
             let hostname = 'Unknown';
             try {
               const leaseFiles = ['/tmp/dhcp.leases', '/var/lib/dnsmasq/dnsmasq.leases', '/var/lib/dhcp/dhcpd.leases'];
               for (const leaseFile of leaseFiles) {
                 if (fs.existsSync(leaseFile)) {
                   const content = fs.readFileSync(leaseFile, 'utf8');
                   if (content.toLowerCase().includes(mac.toLowerCase())) {
                     const leaseLine = content.split('\n').find(l => l.toLowerCase().includes(mac.toLowerCase()));
                     if (leaseLine) {
                        const parts = leaseLine.split(/\s+/);
                        if (parts.length >= 4) hostname = parts[3] || 'Unknown';
                     }
                   }
                 }
               }
             } catch (e) {}

            devices.push({
              mac,
              ip,
              hostname,
              interface: ifaceName,
              ssid: relevantInterface.type === 'vlan' ? 'VLAN' : 'Bridge/Wired',
              signal: -60, // Dummy signal for bridged devices
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

async function restoreNetworkConfig() {
  console.log('[NET] Restoring Network Configuration...');
  try {
    // 1. Restore VLANs
    const vlans = await db.all('SELECT * FROM vlans');
    for (const vlan of vlans) {
      try {
        await createVlan(vlan);
      } catch (e) {
        // Ignore "File exists" error
        if (!e.message.includes('File exists')) {
          console.error(`[NET] Failed to restore VLAN ${vlan.name}:`, e.message);
        }
      }
    }

    // 2. Restore Bridges
    const bridges = await db.all('SELECT * FROM bridges');
    for (const bridge of bridges) {
      try {
        const members = JSON.parse(bridge.members);
        await createBridge({ ...bridge, members });
      } catch (e) {
        if (!e.message.includes('File exists')) {
          console.error(`[NET] Failed to restore Bridge ${bridge.name}:`, e.message);
        }
      }
    }
    
    // 3. Restore Hotspots
    const hotspots = await db.all('SELECT * FROM hotspots WHERE enabled = 1');
    for (const hotspot of hotspots) {
      try {
        await setupHotspot(hotspot);
      } catch (e) {
         console.error(`[NET] Failed to restore Hotspot ${hotspot.interface}:`, e.message);
      }
    }

    // 4. Restore Wireless APs
    const wireless = await db.all('SELECT * FROM wireless_settings');
    for (const wifi of wireless) {
      try {
        await configureWifiAP(wifi);
      } catch (e) {
         console.error(`[NET] Failed to restore WiFi ${wifi.interface}:`, e.message);
      }
    }
    
    // 5. Initialize Firewall
    await initFirewall();

  } catch (err) {
    console.error('[NET] Restore error:', err.message);
  }
}

async function autoProvisionNetwork() {
  console.log('[NET] Starting Auto-Provisioning...');
  try {
    const interfaces = await getInterfaces();
    
    // 1. Detect Interfaces using Smart Classification
    const { wanName, lanMembers } = classifyInterfaces(interfaces);
    
    // --- Auto-Configure VLANs on WAN ---
    if (wanName) {
      console.log(`[NET] Auto-configuring VLANs on WAN (${wanName})...`);
      const vlanConfigs = [
        { id: 13, ip: '10.0.13.1', name: `${wanName}.13` },
        { id: 22, ip: '10.0.22.1', name: `${wanName}.22` }
      ];
      
      for (const vlan of vlanConfigs) {
        try {
          // Create VLAN (ignore if exists)
          await createVlan({ parent: wanName, id: vlan.id, name: vlan.name }).catch(() => {});
          
          // Set IP
          await execPromise(`ip addr flush dev ${vlan.name}`);
          await execPromise(`ip addr add ${vlan.ip}/24 dev ${vlan.name}`);
          
          // Ensure UP and Independent (Not Bridged)
          await execPromise(`ip link set dev ${vlan.name} up`);
          await execPromise(`ip link set dev ${vlan.name} nomaster`).catch(() => {});
          
          // Persist to DB
          await db.run('INSERT OR REPLACE INTO vlans (name, parent, id) VALUES (?, ?, ?)', 
            [vlan.name, wanName, vlan.id]);

          // Configure as independent Hotspot Segment
          const parts = vlan.ip.split('.');
          parts.pop(); // remove last octet
          const prefix = parts.join('.');
          const dhcpStart = `${prefix}.50`;
          const dhcpEnd = `${prefix}.250`;
          const dhcpRange = `${dhcpStart},${dhcpEnd}`;

          await db.run('INSERT OR REPLACE INTO hotspots (interface, ip_address, dhcp_range, enabled) VALUES (?, ?, ?, 1)', 
            [vlan.name, vlan.ip, dhcpRange]);
            
          console.log(`[NET] Configured ${vlan.name} with IP ${vlan.ip} as independent Hotspot segment.`);
        } catch (e) {
          console.error(`[NET] Failed to configure ${vlan.name}:`, e.message);
        }
      }
    }

    console.log(`[NET] Auto-Provision: WAN=${wanName}, LAN/Bridge Candidates=[${lanMembers.join(', ')}]`);
    
    if (lanMembers.length === 0) {
      console.log('[NET] No suitable LAN/Wifi interfaces found for auto-provisioning.');
      return;
    }

    const bridgeName = 'br0';
    console.log(`[NET] Auto-provisioning bridge ${bridgeName} with members: ${lanMembers.join(', ')}`);

    // 2. Create Bridge
    await createBridge({ name: bridgeName, members: lanMembers, stp: false });
    // Update DB to persist
    await db.run('INSERT OR REPLACE INTO bridges (name, members, stp) VALUES (?, ?, ?)', 
      [bridgeName, JSON.stringify(lanMembers), 0]);

    // 3. Configure Hotspot (IP/DHCP) on Bridge
    const hotspotIP = '10.0.0.1';
    const dhcpRange = '10.0.0.50,10.0.0.250';
    
    // Just update DB, let bootupRestore handle the actual service startup
    await db.run('INSERT OR REPLACE INTO hotspots (interface, ip_address, dhcp_range, enabled) VALUES (?, ?, ?, 1)', 
        [bridgeName, hotspotIP, dhcpRange]);

    // 4. Configure Wireless AP (SSID) on wlan0 (if it exists in the members)
    const wlanInterface = lanMembers.find(m => m.startsWith('wlan') || m.startsWith('ra') || m.startsWith('ap'));
    
    if (wlanInterface) {
        const ssid = 'AJC_PisoWifi_Hotspot';
        // Check if we already have a custom SSID in DB
        const wifiInDb = await db.get('SELECT * FROM wireless_settings WHERE interface = ?', [wlanInterface]);
        const finalSsid = wifiInDb ? wifiInDb.ssid : ssid;
        const finalPass = wifiInDb ? wifiInDb.password : '';
        
        // Just update DB
        await db.run('INSERT OR REPLACE INTO wireless_settings (interface, ssid, password, bridge) VALUES (?, ?, ?, ?)', 
          [wlanInterface, finalSsid, finalPass, bridgeName]);
    }

    console.log('[NET] Auto-Provisioning DB Updated. Services will start during restore phase.');
  } catch (e) {
    console.error('[NET] Auto-Provisioning Error:', e.message);
  }
}

async function getLanInterface() {
  const interfaces = await getInterfaces();
  const bridge = interfaces.find(i => i.type === 'bridge' && i.status === 'up');
  // Return bridge if exists, otherwise first wifi or ethernet that isn't WAN
  if (bridge) return bridge.name;
  
  const { wanName } = classifyInterfaces(interfaces);
  const lan = interfaces.find(i => i.name !== wanName && (i.type === 'wifi' || i.type === 'ethernet'));
  return lan ? lan.name : 'wlan0';
}

async function initQoS(interface, discipline = 'cake') {
  console.log(`[QoS] Initializing ${discipline} on ${interface}...`);
  try {
    // Clear existing root qdisc
    await execPromise(`tc qdisc del dev ${interface} root`).catch(() => {});
    
    // Add HTB root
    await execPromise(`tc qdisc add dev ${interface} root handle 1: htb default 10`);
    
    // Add default class (unlimited)
    await execPromise(`tc class add dev ${interface} parent 1: classid 1:10 htb rate 1000mbit ceil 1000mbit`);
    
    // Add qdisc for default class
    await execPromise(`tc qdisc add dev ${interface} parent 1:10 handle 10: ${discipline} bandwidth 1000mbit`);
    
    console.log(`[QoS] Active on ${interface}`);
  } catch (e) {
    console.error(`[QoS] Init error:`, e.message);
  }
}


module.exports = { 
  autoProvisionNetwork,
  restoreNetworkConfig,
  getInterfaces, 
  setupHotspot, 
  removeHotspot,
  configureWifiAP,
  whitelistMAC,
  blockMAC,
  createVlan,
  deleteVlan,
  createBridge,
  deleteBridge,
  initFirewall,
  scanWifiDevices,
  initQoS,
  setSpeedLimit,
  removeSpeedLimit,
  getLanInterface,
  forceNetworkRefresh: async (mac, ip) => {
    console.log(`[NET] Forcing Network Refresh for ${mac} (${ip})`);
    try {
      // Re-apply whitelist rules
      await whitelistMAC(mac, ip);
      // Try to wake up the device in ARP table
      try { await execPromise(`ping -c 1 -W 1 ${ip}`); } catch (e) {}
      return true;
    } catch (e) {
      console.error(`[NET] Force Refresh Error:`, e.message);
      return false;
    }
  },
  detectNetworkConfig: async () => {
    try {
      const { stdout } = await execPromise('ip -j link show');
      const links = JSON.parse(stdout);
      
      const vlans = links
        .filter(l => l.link_info && l.link_info.info_kind === 'vlan')
        .map(l => {
          let parent = 'unknown';
          const parentLink = links.find(p => p.ifindex === l.link);
          if (parentLink) parent = parentLink.ifname;
          return { name: l.ifname, parent, id: l.link_info.info_data.id };
        });

      const bridges = links
        .filter(l => l.link_info && l.link_info.info_kind === 'bridge')
        .map(b => ({
          name: b.ifname,
          members: links.filter(l => l.master === b.ifname).map(l => l.ifname),
          stp: 0 // Default, parsing STP state from ip-link is complex
        }));

      return { vlans, bridges };
    } catch (e) {
      console.error('[NET] Detect Config Error:', e.message);
      return { vlans: [], bridges: [] };
    }
  },
  cleanupAllNetworkSettings: async () => {
    await execPromise('iptables -F');
    await execPromise('iptables -t nat -F');
    await execPromise('systemctl restart dnsmasq');
    await execPromise('rm -f /etc/dnsmasq.d/ajc_*.conf');
    await execPromise('killall hostapd').catch(() => {});
  }
};