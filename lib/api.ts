
import { Rate, NetworkInterface, SystemConfig, WanConfig, VlanConfig, WifiDevice, DeviceSession, PPPoEServerConfig, PPPoEUser, PPPoESession, QoSConfig } from '../types';

const API_BASE = '/api';

const getHeaders = (customHeaders: HeadersInit = {}) => {
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json',
    ...customHeaders as Record<string, string>
  };
  const token = localStorage.getItem('ajc_admin_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const handleResponse = async (res: Response) => {
  const contentType = res.headers.get('content-type');
  if (!res.ok) {
    let errorMsg = `Server error: ${res.status}`;
    try {
      if (contentType?.includes('application/json')) {
        const errJson = await res.json();
        errorMsg = errJson.error || errorMsg;
      }
    } catch (e) { /* ignore */ }
    throw new Error(errorMsg);
  }
  return res.json();
};

export const apiClient = {
  // Fetch all rates from the database
  async getRates(): Promise<Rate[]> {
    const res = await fetch(`${API_BASE}/rates`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Add a new rate definition (fixing error in RatesManager)
  async addRate(pesos: number, minutes: number): Promise<void> {
    const res = await fetch(`${API_BASE}/rates`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ pesos, minutes })
    });
    await handleResponse(res);
  },

  // Delete an existing rate definition (fixing error in RatesManager)
  async deleteRate(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rates/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  // Get current system hardware configuration (fixing error in HardwareSetup)
  async getConfig(): Promise<SystemConfig> {
    const res = await fetch(`${API_BASE}/config`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Save hardware configuration changes (fixing error in HardwareSetup)
  async saveConfig(config: SystemConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(config)
    });
    await handleResponse(res);
  },

  // Get Portal Configuration
  async getPortalConfig(): Promise<any> {
    const res = await fetch(`${API_BASE}/portal/config`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Save Portal Configuration
  async savePortalConfig(config: any): Promise<void> {
    const res = await fetch(`${API_BASE}/portal/config`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(config)
    });
    await handleResponse(res);
  },

  // Get QoS Configuration
  async getQoSConfig(): Promise<QoSConfig> {
    const res = await fetch(`${API_BASE}/config/qos`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Save QoS Configuration
  async saveQoSConfig(discipline: 'cake' | 'fq_codel'): Promise<void> {
    const res = await fetch(`${API_BASE}/config/qos`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ discipline })
    });
    await handleResponse(res);
  },

  // Fetch available network interfaces from the kernel
  async getInterfaces(): Promise<NetworkInterface[]> {
    const res = await fetch(`${API_BASE}/interfaces`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async whoAmI(): Promise<{ ip: string; mac: string }> {
    const res = await fetch(`${API_BASE}/whoami`);
    return handleResponse(res);
  },

  // Toggle interface up/down status
  async setInterfaceStatus(name: string, status: 'up' | 'down'): Promise<void> {
    const res = await fetch(`${API_BASE}/network/status`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, status })
    });
    await handleResponse(res);
  },

  // Update WAN configuration (DHCP or Static)
  async saveWanConfig(config: WanConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/network/wan`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(config)
    });
    await handleResponse(res);
  },

  // Create a new VLAN tagged interface
  async createVlan(vlan: VlanConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/network/vlan`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ parent: vlan.parentInterface, id: vlan.id, name: vlan.name })
    });
    await handleResponse(res);
  },

  async getVlans(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/network/vlans`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async deleteVlan(name: string): Promise<void> {
    const res = await fetch(`${API_BASE}/network/vlan/${name}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  // Create a software bridge interface with member ports
  async createBridge(name: string, members: string[], stp: boolean): Promise<string> {
    const res = await fetch(`${API_BASE}/network/bridge`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, members, stp })
    });
    const data = await handleResponse(res);
    return data.output;
  },

  async getBridges(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/network/bridges`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async deleteBridge(name: string): Promise<void> {
    const res = await fetch(`${API_BASE}/network/bridge/${name}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  // Device Management APIs
  async getWifiDevices(): Promise<WifiDevice[]> {
    const res = await fetch(`${API_BASE}/devices`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getWifiDevice(id: string): Promise<WifiDevice> {
    const res = await fetch(`${API_BASE}/devices/${id}`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async createWifiDevice(device: Omit<WifiDevice, 'id' | 'connectedAt' | 'lastSeen'>): Promise<WifiDevice> {
    const res = await fetch(`${API_BASE}/devices`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(device)
    });
    return handleResponse(res);
  },

  async updateWifiDevice(id: string, updates: Partial<WifiDevice>): Promise<WifiDevice> {
    const res = await fetch(`${API_BASE}/devices/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates)
    });
    return handleResponse(res);
  },

  async deleteWifiDevice(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/devices/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  async connectDevice(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/devices/${id}/connect`, {
      method: 'POST',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  async disconnectDevice(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/devices/${id}/disconnect`, {
      method: 'POST',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  async getDeviceSessions(deviceId: string): Promise<DeviceSession[]> {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/sessions`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Network refresh function to help devices reconnect after session creation
  async refreshNetworkConnection(): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/network/refresh`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // System Stats API
  async getSystemStats(): Promise<any> {
    const res = await fetch(`${API_BASE}/system/stats`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getSystemInfo(): Promise<any> {
    const res = await fetch(`${API_BASE}/system/info`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getSystemInterfaces(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/system/interfaces`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getMachineStatus(): Promise<any> {
    const res = await fetch(`${API_BASE}/machine/status`, { headers: getHeaders() });
    return handleResponse(res);
  },

  // Hotspot Management APIs
  async getHotspots(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/hotspots`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async createHotspot(hotspot: any): Promise<void> {
    const res = await fetch(`${API_BASE}/hotspots`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(hotspot)
    });
    await handleResponse(res);
  },

  async deleteHotspot(interfaceName: string): Promise<void> {
    const res = await fetch(`${API_BASE}/hotspots/${interfaceName}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  // Wireless Management APIs
  async getWirelessConfigs(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/network/wireless`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async saveWirelessConfig(config: any): Promise<void> {
    const res = await fetch(`${API_BASE}/network/wireless`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(config)
    });
    await handleResponse(res);
  },

  // Device Scan & Refresh APIs
  async scanDevices(): Promise<WifiDevice[]> {
    const res = await fetch(`${API_BASE}/devices/scan`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  async refreshDevice(deviceId: string): Promise<WifiDevice> {
    const res = await fetch(`${API_BASE}/devices/${deviceId}/refresh`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // System Management
  async factoryReset(): Promise<void> {
    const res = await fetch(`${API_BASE}/system/reset`, {
      method: 'POST',
      headers: getHeaders()
    });
    await handleResponse(res);
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/change-password`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldPassword, newPassword })
    });
    await handleResponse(res);
  },

  async getSessions(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/sessions`);
    return handleResponse(res);
  },

  // PPPoE Server Management APIs
  async getPPPoEServerStatus(): Promise<any> {
    const res = await fetch(`${API_BASE}/network/pppoe/status`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async startPPPoEServer(config: PPPoEServerConfig): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/network/pppoe/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(config)
    });
    return handleResponse(res);
  },

  async stopPPPoEServer(interfaceName: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/network/pppoe/stop`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ interface: interfaceName })
    });
    return handleResponse(res);
  },

  async getPPPoESessions(): Promise<PPPoESession[]> {
    const res = await fetch(`${API_BASE}/network/pppoe/sessions`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async getPPPoEUsers(): Promise<PPPoEUser[]> {
    const res = await fetch(`${API_BASE}/network/pppoe/users`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async addPPPoEUser(username: string, password: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/network/pppoe/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password })
    });
    return handleResponse(res);
  },

  async updatePPPoEUser(id: number, updates: Partial<PPPoEUser>): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/network/pppoe/users/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updates)
    });
    return handleResponse(res);
  },

  async deletePPPoEUser(id: number): Promise<{ success: boolean }> {
    const res = await fetch(`${API_BASE}/network/pppoe/users/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  // Bandwidth Management APIs
  async getBandwidthSettings(): Promise<any> {
    const res = await fetch(`${API_BASE}/bandwidth/settings`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async saveBandwidthSettings(settings: any): Promise<void> {
    const res = await fetch(`${API_BASE}/bandwidth/settings`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(settings)
    });
    await handleResponse(res);
  },

  // NodeMCU Device Management APIs
  async registerNodeMCU(macAddress: string, ipAddress: string, authenticationKey: string): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ macAddress, ipAddress, authenticationKey })
    });
    return handleResponse(res);
  },

  async authenticateNodeMCU(macAddress: string, authenticationKey: string): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/authenticate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ macAddress, authenticationKey })
    });
    return handleResponse(res);
  },

  async updateNodeMCUStatus(deviceId: string, status: 'pending' | 'accepted' | 'rejected'): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/${deviceId}/status`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ status })
    });
    return handleResponse(res);
  },

  async acceptNodeMCUDevice(deviceId: string): Promise<any> {
    return this.updateNodeMCUStatus(deviceId, 'accepted');
  },

  async rejectNodeMCUDevice(deviceId: string): Promise<any> {
    return this.updateNodeMCUStatus(deviceId, 'rejected');
  },

  async removeNodeMCUDevice(deviceId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/${deviceId}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  async updateNodeMCURates(deviceId: string, rates: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/${deviceId}/rates`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ rates })
    });
    return handleResponse(res);
  },

  async getNodeMCUDevices(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/nodemcu/devices`, { headers: getHeaders() });
    return handleResponse(res);
  },

  async sendNodeMCUConfig(deviceId: string, config: any): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/${deviceId}/config`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(config)
    });
    return handleResponse(res);
  },

  async getNodeMCUDevice(deviceId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/nodemcu/${deviceId}`, { headers: getHeaders() });
    return handleResponse(res);
  }
};
