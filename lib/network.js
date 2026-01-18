const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
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

      // Linux reports many virtual/bridge devices as UNKNOWN even when working perfectly
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
    console.log(`[NET] Interface ${name} set to ${status}`);
  } catch (e) {
    console.error(`[NET] Failed to set ${name} status:`, e.message);
    throw e;
  }
}

async function configureWifiAP(config) {
  const { interface, ssid, password, channel, hw_mode, bridge } = config;
  console.log(`[WIFI] Configuring AP on ${interface} (SSID: ${ssid}${bridge ? `, Bridge: ${bridge}` : ''})...`);

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
    // If bridging, the member interface must NOT have an IP. hostapd will handle bridge attachment.
    if (bridge) {
      await execPromise(`ip addr flush dev ${interface}`).catch(() => {});
    }
    
    await execPromise(`hostapd -B ${configPath}`);
    console.log(`[WIFI] AP ${interface} broadcasting.`);
  } catch (e) {
    console.error(`[WIFI] AP Config Error:`, e.message);
    throw e;
  }
}

async function createVlan(parent, id, name) {
  try {
    await execPromise(`ip link add link ${parent} name ${name} type vlan id ${id}`);
    await execPromise(`ip link set ${name} up`);
    console.log(`[NET] VLAN Created: ${name} on ${parent}`);
  } catch (e) {
    console.error(`[NET] VLAN Error:`, e.message);
    throw e;
  }
}

async function createBridge(name, members, stp = false) {
  try {
    // Create bridge if not exists
    await execPromise(`ip link add name ${name} type bridge`).catch(() => {});
    if (stp) await execPromise(`brctl stp ${name} on`).catch(() => {});
    
    for (const member of members) {
      // CRITICAL: Flush IP from member before adding to bridge to prevent routing conflicts
      console.log(`[NET] Flushing IP and adding ${member} to ${name}...`);
      await execPromise(`ip addr flush dev ${member}`).catch(() => {});
      await execPromise(`ip link set ${member} master ${name}`);
      await execPromise(`ip link set ${member} up`);
    }
    
    await execPromise(`ip link set dev ${name} up`);
    console.log(`[NET] Bridge ${name} is active.`);
    return `Bridge ${name} active. Members: ${members.join(', ')}`;
  } catch (e) {
    console.error(`[NET] Bridge Error:`, e.message);
    throw e;
  }
}

async function setupHotspot(config) {
  const { interface, ip_address, dhcp_range } = config;
  console.log(`[HOTSPOT] Provisioning portal on ${interface} (${ip_address})...`);

  try {
    await setInterfaceStatus(interface, 'up');
    // Ensure the interface itself has the IP, and it's not duplicated on members
    await execPromise(`ip addr flush dev ${interface}`);
    await execPromise(`ip addr add ${ip_address}/24 dev ${interface}`);

    const dnsConfig = `
interface=${interface}
dhcp-range=${dhcp_range},12h
dhcp-option=3,${ip_address}
dhcp-option=6,8.8.8.8,8.8.4.4
    `;
    fs.writeFileSync(`/etc/dnsmasq.d/ajc_${interface}.conf`, dnsConfig);

    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 3000`);
    await execPromise(`iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE`).catch(() => {}); 
    
    await execPromise(`systemctl restart dnsmasq`);
    console.log(`[HOTSPOT] Portal layer active on ${interface}`);
  } catch (e) {
    console.error(`[HOTSPOT] Setup failed:`, e.message);
    throw e;
  }
}

async function removeHotspot(interface) {
  console.log(`[HOTSPOT] Removing portal on ${interface}...`);
  try {
    const configPath = `/etc/dnsmasq.d/ajc_${interface}.conf`;
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    await execPromise(`iptables -t nat -D PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 3000`).catch(() => {});
    await execPromise(`systemctl restart dnsmasq`);
  } catch (e) {
    console.warn(`[HOTSPOT] Cleanup warning:`, e.message);
  }
}

module.exports = { 
  getInterfaces, 
  setInterfaceStatus, 
  setupHotspot, 
  removeHotspot,
  createVlan,
  configureWifiAP,
  createBridge
};