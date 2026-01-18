
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function getInterfaces() {
  try {
    const { stdout } = await execPromise('ip -j addr');
    const data = JSON.parse(stdout);
    
    return data.map(iface => ({
      name: iface.ifname,
      type: iface.link_type === 'ether' ? 'ethernet' : iface.link_type === 'loopback' ? 'loopback' : 'wifi',
      status: iface.operstate.toLowerCase() === 'up' ? 'up' : 'down',
      ip: iface.addr_info[0]?.local || null,
      mac: iface.address,
      isLoopback: iface.ifname === 'lo'
    }));
  } catch (err) {
    console.error('Error getting interfaces:', err);
    return [];
  }
}

async function setInterfaceStatus(name, status) {
  await execPromise(`ip link set ${name} ${status}`);
}

async function configureWan(config) {
  if (config.proto === 'dhcp') {
    await execPromise(`udhcpc -i eth0`); // Example WAN interface
  } else {
    await execPromise(`ip addr flush dev eth0`);
    await execPromise(`ip addr add ${config.ipaddr}/${config.netmask} dev eth0`);
    await execPromise(`ip route add default via ${config.gateway}`);
  }
}

async function createBridge(name, members, stp = false) {
  const commands = [
    `ip link add name ${name} type bridge`,
    ...members.map(iface => `ip link set ${iface} master ${name}`),
    `ip link set dev ${name} type bridge stp_state ${stp ? 1 : 0}`,
    `ip link set dev ${name} up`
  ];

  let output = '';
  for (const cmd of commands) {
    const { stdout, stderr } = await execPromise(cmd);
    output += stdout + stderr;
  }
  return output;
}

async function createVlan(parent, id, name) {
  await execPromise(`ip link add link ${parent} name ${name} type vlan id ${id}`);
  await execPromise(`ip link set ${name} up`);
}

async function configureHotspot(config) {
  // Real logic would involve editing hostapd.conf and restarting service
  console.log('Configuring hostapd with:', config);
  // Example shell command:
  // await execPromise(`systemctl restart hostapd`);
}

module.exports = { 
  getInterfaces, 
  setInterfaceStatus, 
  configureWan, 
  createBridge, 
  createVlan, 
  configureHotspot 
};
