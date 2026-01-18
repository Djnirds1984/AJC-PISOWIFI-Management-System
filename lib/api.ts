
import { Rate, NetworkInterface, SystemConfig, WanConfig, VlanConfig } from '../types';

const API_BASE = '/api';

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pesos, minutes })
    });
    await handleResponse(res);
  },

  // Delete an existing rate definition (fixing error in RatesManager)
  async deleteRate(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rates/${id}`, {
      method: 'DELETE'
    });
    await handleResponse(res);
  },

  // Get current system hardware configuration (fixing error in HardwareSetup)
  async getConfig(): Promise<SystemConfig> {
    const res = await fetch(`${API_BASE}/config`);
    return handleResponse(res);
  },

  // Save hardware configuration changes (fixing error in HardwareSetup)
  async saveConfig(config: SystemConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    await handleResponse(res);
  },

  // Fetch available network interfaces from the kernel
  async getInterfaces(): Promise<NetworkInterface[]> {
    const res = await fetch(`${API_BASE}/interfaces`);
    return handleResponse(res);
  },

  // Toggle interface up/down status
  async setInterfaceStatus(name: string, status: 'up' | 'down'): Promise<void> {
    const res = await fetch(`${API_BASE}/network/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, status })
    });
    await handleResponse(res);
  },

  // Update WAN configuration (DHCP or Static)
  async saveWanConfig(config: WanConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/network/wan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    await handleResponse(res);
  },

  // Create a new VLAN tagged interface
  async createVlan(vlan: VlanConfig): Promise<void> {
    const res = await fetch(`${API_BASE}/network/vlan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: vlan.parentInterface, id: vlan.id, name: vlan.name })
    });
    await handleResponse(res);
  },

  // Create a software bridge interface with member ports
  async createBridge(name: string, members: string[], stp: boolean): Promise<string> {
    const res = await fetch(`${API_BASE}/network/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, members, stp })
    });
    const data = await handleResponse(res);
    return data.output;
  }
};
