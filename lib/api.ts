
import { Rate, NetworkInterface, SystemConfig, WanConfig, VlanConfig, WifiDevice, DeviceSession } from '../types';

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
    const res = await fetch(`${API_BASE}/rates`);
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

  // Fetch available network interfaces from the kernel
  async getInterfaces(): Promise<NetworkInterface[]> {
    const res = await fetch(`${API_BASE}/interfaces`);
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
  }
};
