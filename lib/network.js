const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const execPromise = util.promisify(exec);

async function getInterfaces() {
  try {
    const { stdout } = await execPromise('ip -j addr');
    const data = JSON.parse(stdout);
    
    return data.map(iface => {
      let type = 'ethernet';
      if (iface.ifname.startsWith('wlan') || iface.ifname.startsWith('ap')) {
        type = 'wifi';
      } else if (iface.link_type === 'loopback') {
        type = 'loopback';
      } else if (iface.ifname.startsWith('br')) {
        type = 'bridge';
      } else if (iface.ifname.includes('.')) {
        type = 'vlan';
      } else if (iface.link_type === 'ether') {
        type = 'ethernet';
      }

      return {
        name: iface.ifname,
        type: type,
        status: iface.operstate.toLowerCase() === 'up' ? 'up' : 'down',
        ip: iface.addr_info[0]?.local || null,
        mac: iface.address,
        isLoopback: iface.ifname === 'lo'
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
  const { interface, ssid, password, channel, hw_mode } = config;
  console.log(`[WIFI] Configuring AP on ${interface} (SSID: ${ssid})...`);

  try {
    // Ensure interface is UP before hostapd
    await setInterfaceStatus(interface, 'up');
    
    const hostapdConfig = `
interface=${interface}
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

    fs.writeFileSync(`/etc/hostapd/hostapd_${interface}.conf`, hostapdConfig);
    
    await execPromise(`systemctl stop hostapd || true`);
    await execPromise(`hostapd -B /etc/hostapd/hostapd_${interface}.conf`);
    
    console.log(`[WIFI] AP ${interface} is now broadcasting.`);
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
    await execPromise(`ip link add name ${name} type bridge`);
    if (stp) await execPromise(`brctl stp ${name} on`);
    
    for (const member of members) {
      await execPromise(`ip link set ${member} master ${name}`);
    }
    
    await execPromise(`ip link set dev ${name} up`);
    console.log(`[NET] Bridge Created: ${name} with members ${members.join(', ')}`);
    return `Bridge ${name} active.`;
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
    if (fs.existsSync(`/etc/dnsmasq.d/ajc_${interface}.conf`)) fs.unlinkSync(`/etc/dnsmasq.d/ajc_${interface}.conf`);
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