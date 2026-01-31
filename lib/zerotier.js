const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Helper to run commands with sudo
async function runCommand(command) {
  try {
    // We assume the user has sudo privileges without password or is root
    // If permission denied issues persist, the system configuration needs to be checked
    const { stdout, stderr } = await execPromise(`sudo ${command}`);
    return { success: true, stdout: stdout.trim(), stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

class ZeroTierManager {
  async isInstalled() {
    try {
      const { success } = await runCommand('which zerotier-cli');
      return success;
    } catch (e) {
      return false;
    }
  }

  async getStatus() {
    // zerotier-cli info
    // Output: 200 info <node_id> <version> <status>
    const { success, stdout } = await runCommand('zerotier-cli info');
    if (!success) return { running: false };

    const parts = stdout.split(' ');
    if (parts.length >= 5 && parts[1] === 'info') {
      return {
        running: true,
        nodeId: parts[2],
        version: parts[3],
        status: parts[4]
      };
    }
    return { running: false };
  }

  async install() {
    // Using the official install script
    // Note: This might be interactive or slow, so we should handle it carefully
    // Adding -s for silent mode if possible, but the curl | bash is standard
    // We'll use the standard one-liner
    return await runCommand('curl -s https://install.zerotier.com | sudo bash');
  }

  async listNetworks() {
    // zerotier-cli listnetworks -j
    const { success, stdout } = await runCommand('zerotier-cli listnetworks -j');
    if (!success) return [];
    
    try {
      // The output might contain headers or other text, but -j should return JSON
      // Sometimes zerotier-cli output isn't pure JSON if there are warnings
      // We'll try to parse the first array we find
      const jsonStart = stdout.indexOf('[');
      const jsonEnd = stdout.lastIndexOf(']');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(stdout.substring(jsonStart, jsonEnd + 1));
      }
      return JSON.parse(stdout);
    } catch (e) {
      console.error('Error parsing ZeroTier networks:', e);
      return [];
    }
  }

  async joinNetwork(networkId) {
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId)) {
      throw new Error('Invalid Network ID');
    }
    return await runCommand(`zerotier-cli join ${networkId}`);
  }

  async leaveNetwork(networkId) {
    if (!networkId || !/^[0-9a-fA-F]{16}$/.test(networkId)) {
      throw new Error('Invalid Network ID');
    }
    return await runCommand(`zerotier-cli leave ${networkId}`);
  }
}

module.exports = new ZeroTierManager();
