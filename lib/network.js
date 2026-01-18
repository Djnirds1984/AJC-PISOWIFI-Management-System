const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('node:path'); // Using node: prefix for clarity
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
    console.log(`[NET] Interface ${name} set to ${status}`);
  } catch (e) {
    console.error(`[NET] Failed to set ${name} status:`, e.message);
    throw e;
  }
}

async function cleanupAllNetworkSettings() {
  console.log('[NET] Performing deep hardware cleanup...');
  try {
    // 1. Stop services
    console.log('[NET] Stopping hostapd and dnsmasq...');
    await execPromise('systemctl stop hostapd dnsmasq || true');
    
    // 2. Remove config files
    const configDirs = ['/etc/dnsmasq.d/', '/etc/hostapd/'];
    for (const dir of configDirs) {
      if (fs.existsSync(dir)) {
        console.log(`[NET] Cleaning directory: ${dir}`);
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('ajc_') || file.startsWith('hostapd_')) {
            // Re-verify 'path' is in scope here
            const filePath = path.join(dir, file);
            console.log(`[NET] Deleting config: ${filePath}`);
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (unlinkErr) {
              console.error(`[NET] Failed to delete ${filePath}:`, unlinkErr.message);
            }
          }
        }
      }
    }

    // 3. Flush iptables (with catch to ignore "Table does not exist" errors)
    console.log('[NET] Flushing iptables...');
    await execPromise('iptables -F').catch(() => {});
    await execPromise('iptables -t nat -F').catch(() => {});
    await execPromise('iptables -t mangle -F').catch(() => {});
    
    // 4. Delete virtual interfaces (bridges and VLANs)
    const interfaces = await getInterfaces();
    for (const iface of interfaces) {
      if (iface.type === 'bridge' || iface.type === 'vlan') {
        console.log(`[NET] Deleting virtual interface: ${iface.name}`);
        await execPromise(`ip link delete ${iface.name} || true`);
      }
    }

    // 5. Restart basic networking
    console.log('[NET] Restarting dnsmasq...');
    await execPromise('systemctl start dnsmasq || true');
    console.log('[NET] Cleanup complete.');
  } catch (e) {
    console.error('[NET] Cleanup Error in cleanupAllNetworkSettings:', e);
    throw e;
  }
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
    const dnsConfig = `interface=${interface}\ndhcp-range=${dhcp_range},12h\ndhcp-option=3,${ip_address}\ndhcp-option=6,8.8.8.8,8.8.4.4`;
    fs.writeFileSync(`/etc/dnsmasq.d/ajc_${interface}.conf`, dnsConfig);
    await execPromise(`iptables -t nat -A PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 3000`);
    await execPromise(`iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE`).catch(() => {}); 
    await execPromise(`systemctl restart dnsmasq`);
  } catch (e) { throw e; }
}

async function removeHotspot(interface) {
  try {
    const configPath = `/etc/dnsmasq.d/ajc_${interface}.conf`;
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    await execPromise(`iptables -t nat -D PREROUTING -i ${interface} -p tcp --dport 80 -j REDIRECT --to-ports 3000`).catch(() => {});
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