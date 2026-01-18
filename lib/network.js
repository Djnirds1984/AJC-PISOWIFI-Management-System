
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function getInterfaces() {
  try {
    // Parsing 'ip addr show' would be more robust, using a simplified mock-like response 
    // that would be populated by real shell data in a production helper.
    const { stdout } = await execPromise('ip -j addr');
    const data = JSON.parse(stdout);
    
    return data.map(iface => ({
      name: iface.ifname,
      type: iface.link_type === 'ether' ? 'ethernet' : 'wifi',
      status: iface.operstate.toLowerCase(),
      ip: iface.addr_info[0]?.local || null,
      mac: iface.address
    }));
  } catch (err) {
    console.error('Error getting interfaces:', err);
    return [];
  }
}

async function createBridge(name, members) {
  const commands = [
    `ip link add name ${name} type bridge`,
    ...members.map(iface => `ip link set ${iface} master ${name}`),
    `ip link set dev ${name} up`
  ];

  let output = '';
  for (const cmd of commands) {
    const { stdout, stderr } = await execPromise(cmd);
    output += stdout + stderr;
  }
  return output;
}

async function whitelistMAC(mac) {
  // Real iptables command to allow a MAC address past the captive portal
  await execPromise(`iptables -t nat -I PREROUTING -m mac --mac-source ${mac} -j ACCEPT`);
}

module.exports = { getInterfaces, createBridge, whitelistMAC };
