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
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    const interfaces = await getInterfaces();
    for (const iface of interfaces) {
      if (iface.type === 'bridge' || iface.type === 'vlan') {
        await execPromise(`ip link delete ${iface.name} || true`);
      }
    }
    await execPromise('systemctl start dnsmasq || true');
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
    
    // 1. CLEAR PREVIOUS RULES
    await execPromise(`iptables -t nat -F PREROUTING`).catch(() => {});

    // 2. ALLOW DNS (Port 53) - MUST BE FIRST
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p udp --dport 53 -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p tcp --dport 53 -j ACCEPT`).catch(() => {});

    // 3. WHITELIST THE GATEWAY IP (This is the "Secret Sauce" for beautiful UI)
    // Allows any protocol (HTTP, Socket.io) to reach the server itself without redirection
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -d ${ip_address} -j ACCEPT`).catch(() => {});
    
    // 4. REDIRECT all other HTTP traffic (Port 80) to the Portal
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`);
    
    // 5. WAN MASQUERADE
    await execPromise(`iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE`).catch(() => {}); 
    
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
    await execPromise(`iptables -t nat -F`).catch(() => {});
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
  cleanupAllNetworkSettings
};