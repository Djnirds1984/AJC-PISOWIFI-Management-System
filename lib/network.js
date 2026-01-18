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
  console.log('[NET] Initializing Real-Hardware Firewall Engine...');
  try {
    // 1. Enable IPv4 Forwarding (Crucial for Internet)
    await execPromise('sysctl -w net.ipv4.ip_forward=1');
    
    // 2. Setup Clean Chains
    await execPromise('iptables -t nat -F AJC_AUTH').catch(() => {});
    await execPromise('iptables -F AJC_AUTH').catch(() => {});
    await execPromise('iptables -t nat -N AJC_AUTH').catch(() => {});
    await execPromise('iptables -N AJC_AUTH').catch(() => {});

    // 3. Global Jump to AJC_AUTH
    const checkNat = await execPromise('iptables -t nat -C PREROUTING -j AJC_AUTH').catch(() => false);
    if (!checkNat) await execPromise('iptables -t nat -I PREROUTING 1 -j AJC_AUTH');

    const checkForward = await execPromise('iptables -C FORWARD -j AJC_AUTH').catch(() => false);
    if (!checkForward) await execPromise('iptables -I FORWARD 1 -j AJC_AUTH');

    // 4. WAN Masquerade
    const ifaces = await getInterfaces();
    const wan = ifaces.find(i => i.type === 'ethernet' && i.status === 'up')?.name || 'eth0';
    await execPromise(`iptables -t nat -A POSTROUTING -o ${wan} -j MASQUERADE`).catch(() => {});

    // 5. Basic AJC_AUTH Rules (Allow DNS & Local Portal access for everyone)
    await execPromise('iptables -t nat -A AJC_AUTH -p udp --dport 53 -j ACCEPT');
    await execPromise('iptables -t nat -A AJC_AUTH -p tcp --dport 53 -j ACCEPT');

    console.log(`[NET] Firewall Engine Ready. WAN: ${wan}`);
  } catch (e) {
    console.error('[NET] Firewall Init Error:', e.message);
  }
}

async function whitelistMAC(mac) {
  if (!mac) return;
  console.log(`[NET] REAL-WHITELIST: Granting internet to ${mac}`);
  try {
    // 1. NAT Bypass: Return from AJC_AUTH so user doesn't hit the REDIRECT rule at the bottom
    await execPromise(`iptables -t nat -I AJC_AUTH 1 -m mac --mac-source ${mac} -j RETURN`);
    // 2. FORWARD Accept: Allow traffic through the router
    await execPromise(`iptables -I AJC_AUTH 1 -m mac --mac-source ${mac} -j ACCEPT`);
  } catch (e) {
    console.error(`[NET] Whitelist error for ${mac}:`, e.message);
  }
}

async function blockMAC(mac) {
  if (!mac) return;
  console.log(`[NET] REAL-BLOCK: Removing internet for ${mac}`);
  try {
    await execPromise(`iptables -t nat -D AJC_AUTH -m mac --mac-source ${mac} -j RETURN`).catch(() => {});
    await execPromise(`iptables -D AJC_AUTH -m mac --mac-source ${mac} -j ACCEPT`).catch(() => {});
  } catch (e) {
    console.error(`[NET] Block error for ${mac}:`, e.message);
  }
}

async function setupHotspot(config) {
  const { interface, ip_address, dhcp_range } = config;
  try {
    await execPromise(`ip link set ${interface} up`);
    await execPromise(`ip addr flush dev ${interface}`);
    await execPromise(`ip addr add ${ip_address}/24 dev ${interface}`);
    
    // Redirection rule: Place it at the END of the AJC_AUTH nat chain
    // This way, the RETURN rules (whitelists) at the TOP take precedence.
    await execPromise(`iptables -t nat -A AJC_AUTH -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});

    // Dnsmasq config
    const dnsConfig = `interface=${interface}\ndhcp-range=${dhcp_range},12h\ndhcp-option=3,${ip_address}\ndhcp-option=6,${ip_address}\naddress=/#/${ip_address}`;
    fs.writeFileSync(`/etc/dnsmasq.d/ajc_${interface}.conf`, dnsConfig);
    
    await execPromise(`systemctl restart dnsmasq`);
    console.log(`[HOTSPOT] Segment Live: ${interface}`);
  } catch (e) { throw e; }
}

async function removeHotspot(interface) {
  try {
    const configPath = `/etc/dnsmasq.d/ajc_${interface}.conf`;
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    await execPromise(`iptables -t nat -D AJC_AUTH -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 80`).catch(() => {});
    await execPromise(`systemctl restart dnsmasq`);
  } catch (e) { throw e; }
}

async function configureWifiAP(config) {
  const { interface, ssid, password, bridge } = config;
  try {
    await execPromise(`ip link set ${interface} up`);
    const hostapdConfig = `interface=${interface}\n${bridge ? `bridge=${bridge}` : ''}\ndriver=nl80211\nssid=${ssid}\nhw_mode=g\nchannel=1\nwmm_enabled=0\nmacaddr_acl=0\nauth_algs=1\nignore_broadcast_ssid=0\n${password ? `wpa=2\nwpa_passphrase=${password}\nwpa_key_mgmt=WPA-PSK\nwpa_pairwise=TKIP\nrsn_pairwise=CCMP` : ''}`;
    fs.writeFileSync(`/etc/hostapd/hostapd_${interface}.conf`, hostapdConfig);
    await execPromise(`systemctl stop hostapd || true`);
    if (bridge) await execPromise(`ip addr flush dev ${interface}`);
    await execPromise(`hostapd -B /etc/hostapd/hostapd_${interface}.conf`);
  } catch (e) { throw e; }
}

module.exports = { 
  getInterfaces, 
  setupHotspot, 
  removeHotspot,
  configureWifiAP,
  whitelistMAC,
  blockMAC,
  initFirewall,
  cleanupAllNetworkSettings: async () => { /* reuse existing logic if needed */ }
};