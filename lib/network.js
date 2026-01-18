const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('node:path');
const execPromise = util.promisify(exec);

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

async function setInterfaceStatus(name, status) {
  try {
    await execPromise(`ip link set ${name} ${status}`);
  } catch (e) {
    console.error(`[NET] Failed to set ${name} status:`, e.message);
    throw e;
  }
}

/**
 * Initialize the firewall structure. 
 * Creates custom chains to prevent 'iptables -F' from wiping user sessions 
 * and enables kernel IP forwarding.
 */
async function initFirewall() {
  console.log('[NET] Initializing AJC Firewall Engine...');
  try {
    // 1. Enable IPv4 Forwarding (Crucial for Internet)
    await execPromise('sysctl -w net.ipv4.ip_forward=1');
    
    // 2. Create AJC-AUTH chains if they don't exist
    await execPromise('iptables -t nat -N AJC_AUTH').catch(() => {});
    await execPromise('iptables -N AJC_AUTH').catch(() => {});

    // 3. Insert AJC_AUTH at the top of PREROUTING (NAT) and FORWARD (Filter)
    // We check existence first to avoid duplicate jumps
    const checkNat = await execPromise('iptables -t nat -C PREROUTING -j AJC_AUTH').catch(() => false);
    if (!checkNat) await execPromise('iptables -t nat -I PREROUTING 1 -j AJC_AUTH');

    const checkForward = await execPromise('iptables -C FORWARD -j AJC_AUTH').catch(() => false);
    if (!checkForward) await execPromise('iptables -I FORWARD 1 -j AJC_AUTH');

    // 4. Ensure WAN Masquerade is active
    // Try to detect WAN interface, default to eth0
    const ifaces = await getInterfaces();
    const wan = ifaces.find(i => i.type === 'ethernet' && i.status === 'up')?.name || 'eth0';
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    console.log(`[NET] Firewall Engine Ready. WAN: ${wan}`);
  } catch (e) {
    console.error('[NET] Firewall Init Error:', e.message);
  }
}

async function whitelistMAC(mac) {
  if (!mac) return;
  console.log(`[NET] Authenticating client: ${mac}`);
  try {
    // 1. Add to NAT whitelist (Bypasses Redirection)
    await execPromise(`iptables -t nat -I AJC_AUTH 1 -m mac --mac-source ${mac} -j ACCEPT`);
    // 2. Add to FILTER whitelist (Permits Internet Traffic)
    await execPromise(`iptables -I AJC_AUTH 1 -m mac --mac-source ${mac} -j ACCEPT`);
  } catch (e) {
    console.error(`[NET] Whitelist error for ${mac}:`, e.message);
  }
}

async function blockMAC(mac) {
  if (!mac) return;
  console.log(`[NET] Revoking access: ${mac}`);
  try {
    await execPromise(`iptables -t nat -D AJC_AUTH -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -D AJC_AUTH -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
  } catch (e) {
    console.error(`[NET] Block error for ${mac}:`, e.message);
  }
}

async function cleanupAllNetworkSettings() {
  console.log('[NET] Performing deep hardware cleanup...');
  try {
    await execPromise('systemctl stop hostapd dnsmasq || true');
    const configDirs = ['/etc/dnsmasq.d/', '/etc/hostapd/'];
    for (const dir of configDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('ajc_') || file.startsWith('hostapd_')) {
            const filePath = path.join(dir, file);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        }
      }
    }
    
    // Flush main chains but keep our custom jumps if possible, 
    // or just clear everything for factory reset.
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    await execPromise('iptables -X AJC_AUTH').catch(() => {});
    await execPromise('iptables -t nat -X AJC_AUTH').catch(() => {});
    
    const interfaces = await getInterfaces();
    for (const iface of interfaces) {
      if (iface.type === 'bridge' || iface.type === 'vlan') {
        await execPromise(`ip link delete ${iface.name} || true`);
      }
    }
    await execPromise('systemctl start dnsmasq || true');
    // Re-init basic firewall structure
    await initFirewall();
  } catch (e) { throw e; }
}

async function configureWifiAP(config) {
  const { interface, ssid, password, channel, hw_mode, bridge } = config;
  try {
    await setInterfaceStatus(interface, 'up');
    const hostapdConfig = `
interface=${interface}
${bridge ? `bridge=${bridge}` : ''}
driver=nl80211
ssid=${ssid}
hw_mode=${hw_mode || 'g'}
channel=${channel || 1}
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
${password ? `wpa=2\nwpa_passphrase=${password}\nwpa_key_mgmt=WPA-PSK\nwpa_pairwise=TKIP\nrsn_pairwise=CCMP` : ''}
    `.trim();
    const configPath = `/etc/hostapd/hostapd_${interface}.conf`;
    fs.writeFileSync(configPath, hostapdConfig);
    await execPromise(`systemctl stop hostapd || true`);
    if (bridge) await execPromise(`ip addr flush dev ${interface}`).catch(() => {});
    await execPromise(`hostapd -B ${configPath}`);
  } catch (e) { throw e; }
}

async function createVlan(parent, id, name) {
  try {
    await execPromise(`ip link add link ${parent} name ${name} type vlan id ${id}`);
    await execPromise(`ip link set ${name} up`);
  } catch (e) { throw e; }
}

async function createBridge(name, members, stp = false) {
  try {
    await execPromise(`ip link add name ${name} type bridge`).catch(() => {});
    if (stp) await execPromise(`brctl stp ${name} on`).catch(() => {});
    for (const member of members) {
      await execPromise(`ip addr flush dev ${member}`).catch(() => {});
      await execPromise(`ip link set ${member} master ${name}`);
      await execPromise(`ip link set ${member} up`);
    }
    await execPromise(`ip link set dev ${name} up`);
    return `Bridge ${name} active.`;
  } catch (e) { throw e; }
}

async function setupHotspot(config) {
  const { interface, ip_address, dhcp_range } = config;
  try {
    await setInterfaceStatus(interface, 'up');
    await execPromise(`ip addr flush dev ${interface}`);
    await execPromise(`ip addr add ${ip_address}/24 dev ${interface}`);
    
    const dnsConfig = `
interface=${interface}
dhcp-range=${dhcp_range},12h
dhcp-option=3,${ip_address}
dhcp-option=6,${ip_address}
address=/#/${ip_address}
    `.trim();
    
    fs.writeFileSync(`/etc/dnsmasq.d/ajc_${interface}.conf`, dnsConfig);
    
    // IMPORTANT: Only clear rules related to THIS interface's redirection, 
    // don't flush AJC_AUTH which contains our active sessions.
    
    // 1. Redirection rule for unauthenticated traffic on this interface
    // Note: This rule stays at the BOTTOM of the chain logic because whitelists are at the TOP.
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});

    // 2. Allow DNS and Web Portal locally
    await execPromise(`iptables -t nat -I PREROUTING 1 -i ${interface} -p udp --dport 53 -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -t nat -I PREROUTING 1 -i ${interface} -d ${ip_address} -j ACCEPT`).catch(() => {});

    await execPromise(`systemctl restart dnsmasq`);
    console.log(`[HOTSPOT] Portal Segment Live on ${interface} @ http://${ip_address}`);
  } catch (e) { 
    console.error(`[HOTSPOT] Setup failed:`, e.message);
    throw e; 
  }
}

async function removeHotspot(interface) {
  try {
    const configPath = `/etc/dnsmasq.d/ajc_${interface}.conf`;
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    // Remove the redirection rule for this interface
    await execPromise(`iptables -t nat -D PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});
    await execPromise(`systemctl restart dnsmasq`);
  } catch (e) { throw e; }
}

module.exports = { 
  getInterfaces, 
  setInterfaceStatus, 
  setupHotspot, 
  removeHotspot,
  createVlan,
  configureWifiAP,
  createBridge,
  cleanupAllNetworkSettings,
  whitelistMAC,
  blockMAC,
  initFirewall
};