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

async function initFirewall() {
  console.log('[NET] Re-initializing AJC Firewall (Stable Mode)...');
  try {
    await execPromise('sysctl -w net.ipv4.ip_forward=1');
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    
    const ifaces = await getInterfaces();
    const wan = ifaces.find(i => i.type === 'ethernet' && i.status === 'up')?.name || 'eth0';
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    await execPromise('iptables -t nat -A PREROUTING -p udp --dport 53 -j ACCEPT');
    await execPromise('iptables -t nat -A PREROUTING -p tcp --dport 53 -j ACCEPT');

    console.log(`[NET] Firewall initialized on WAN: ${wan}`);
  } catch (e) {
    console.error('[NET] Firewall Init Error:', e.message);
  }
}

async function whitelistMAC(mac) {
  if (!mac) return;
  console.log(`[NET] Authorizing Client: ${mac}`);
  try {
    await execPromise(`iptables -t nat -I PREROUTING 1 -m mac --mac-source ${mac} -j ACCEPT`);
    await execPromise(`iptables -I FORWARD 1 -m mac --mac-source ${mac} -j ACCEPT`);
  } catch (e) {
    console.error(`[NET] Whitelist error:`, e.message);
  }
}

async function blockMAC(mac) {
  if (!mac) return;
  try {
    await execPromise(`iptables -t nat -D PREROUTING -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
    await execPromise(`iptables -D FORWARD -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
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
    await execPromise(`systemctl stop hostapd || killall hostapd || true`);
    await execPromise(`hostapd -B ${configPath}`);
    console.log(`[WIFI] Broadcast started on ${interface}: ${ssid}`);
  } catch (e) { 
    console.error(`[WIFI] Failed to deploy AP:`, e.message);
    throw e; 
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
  cleanupAllNetworkSettings: async () => {
    await execPromise('iptables -F');
    await execPromise('iptables -t nat -F');
    await execPromise('systemctl restart dnsmasq');
    await execPromise('rm -f /etc/dnsmasq.d/ajc_*.conf');
    await execPromise('killall hostapd').catch(() => {});
  }
};