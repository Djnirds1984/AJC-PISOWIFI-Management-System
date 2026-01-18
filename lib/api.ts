
import { Rate, NetworkInterface } from '../types';

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

  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    console.error('Expected JSON but received:', text.substring(0, 100));
    throw new Error('Invalid server response (Expected JSON, received HTML/Text). Is the backend server running?');
  }

  return res.json();
};

export const apiClient = {
  async getRates(): Promise<Rate[]> {
    try {
      const res = await fetch(`${API_BASE}/rates`);
      return handleResponse(res);
    } catch (err) {
      console.error('apiClient.getRates error:', err);
      throw err;
    }
  },

  async addRate(pesos: number, minutes: number): Promise<Rate> {
    const res = await fetch(`${API_BASE}/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pesos, minutes })
    });
    return handleResponse(res);
  },

  async deleteRate(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/rates/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete rate');
  },

  async getInterfaces(): Promise<NetworkInterface[]> {
    const res = await fetch(`${API_BASE}/interfaces`);
    return handleResponse(res);
  },

  async createBridge(name: string, members: string[]): Promise<string> {
    const res = await fetch(`${API_BASE}/network/bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, members })
    });
    const data = await handleResponse(res);
    return data.output;
  }
};
