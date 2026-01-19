import React, { useState, useEffect } from 'react';
import { WifiDevice } from '../../types';
import { apiClient } from '../../lib/api';

const DeviceManager: React.FC = () => {
  const [devices, setDevices] = useState<WifiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [sessionTime, setSessionTime] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({
    mac: '',
    ip: '',
    hostname: '',
    interface: '',
    ssid: '',
    signal: 0,
    customName: ''
  });

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getWifiDevices();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  const scanDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/devices/scan', { method: 'POST' });
      if (!res.ok) throw new Error('Scan failed');
      const data = await res.json();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan devices');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (deviceId: string) => {
    try {
      await apiClient.connectDevice(deviceId);
      fetchDevices();
    } catch (err) {
      alert(`Failed to connect device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    try {
      await apiClient.disconnectDevice(deviceId);
      fetchDevices();
    } catch (err) {
      alert(`Failed to disconnect device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleRename = async (deviceId: string) => {
    if (!newDeviceName.trim()) return;
    
    try {
      await apiClient.updateWifiDevice(deviceId, { customName: newDeviceName });
      setEditingDevice(null);
      setNewDeviceName('');
      fetchDevices();
    } catch (err) {
      alert(`Failed to rename device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSetSessionTime = async (deviceId: string) => {
    if (!sessionTime || isNaN(Number(sessionTime))) return;
    
    try {
      await apiClient.updateWifiDevice(deviceId, { sessionTime: Number(sessionTime) * 60 });
      setSessionTime('');
      fetchDevices();
    } catch (err) {
      alert(`Failed to set session time: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;
    
    try {
      await apiClient.deleteWifiDevice(deviceId);
      fetchDevices();
    } catch (err) {
      alert(`Failed to delete device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddDevice = async () => {
    if (!newDevice.mac || !newDevice.ip || !newDevice.interface) {
      alert('Please fill in required fields (MAC, IP, Interface)');
      return;
    }

    try {
      await apiClient.createWifiDevice({
        ...newDevice,
        signal: Number(newDevice.signal) || 0
      });
      setShowAddDevice(false);
      setNewDevice({
        mac: '',
        ip: '',
        hostname: '',
        interface: '',
        ssid: '',
        signal: 0,
        customName: ''
      });
      fetchDevices();
    } catch (err) {
      alert(`Failed to add device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-600">Loading devices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800">{error}</div>
        <button 
          onClick={fetchDevices}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">WiFi Device Management</h2>
        <div className="flex gap-2">
          <button
            onClick={scanDevices}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Scanning...' : 'Scan Devices'}
          </button>
          <button
            onClick={() => setShowAddDevice(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add Device
          </button>
        </div>
      </div>

      {showAddDevice && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Add New Device</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="MAC Address"
              value={newDevice.mac}
              onChange={(e) => setNewDevice({...newDevice, mac: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="IP Address"
              value={newDevice.ip}
              onChange={(e) => setNewDevice({...newDevice, ip: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Interface (e.g., wlan0)"
              value={newDevice.interface}
              onChange={(e) => setNewDevice({...newDevice, interface: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="SSID"
              value={newDevice.ssid}
              onChange={(e) => setNewDevice({...newDevice, ssid: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Hostname"
              value={newDevice.hostname}
              onChange={(e) => setNewDevice({...newDevice, hostname: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              placeholder="Signal Strength"
              value={newDevice.signal}
              onChange={(e) => setNewDevice({...newDevice, signal: Number(e.target.value)})}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddDevice}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Add Device
            </button>
            <button
              onClick={() => setShowAddDevice(false)}
              className="px-4 py-2 bg-slate-400 text-white rounded hover:bg-slate-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Connected Devices ({devices.length})</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">MAC Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Interface</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Signal</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Connected</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Session Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {devices.map((device) => (
                <tr key={device.id} className={device.isActive ? '' : 'opacity-50'}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {device.customName || device.hostname || 'Unknown Device'}
                      </div>
                      <div className="text-sm text-slate-500">{device.ssid}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{device.mac}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{device.ip}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">{device.interface}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 ${
                        device.signal > -50 ? 'bg-green-500' : 
                        device.signal > -70 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-sm text-slate-900">{device.signal} dBm</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {formatDate(device.connectedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                    {device.sessionTime ? formatTime(device.sessionTime) : 'Unlimited'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    {device.isActive ? (
                      <button
                        onClick={() => handleDisconnect(device.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(device.id)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Connect
                      </button>
                    )}
                    
                    {editingDevice === device.id ? (
                      <div className="flex space-x-1">
                        <input
                          type="text"
                          value={newDeviceName}
                          onChange={(e) => setNewDeviceName(e.target.value)}
                          placeholder="New name"
                          className="px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => handleRename(device.id)}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingDevice(null)}
                          className="px-2 py-1 bg-slate-400 text-white rounded text-xs hover:bg-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingDevice(device.id);
                          setNewDeviceName(device.customName || device.hostname || '');
                        }}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                      >
                        Rename
                      </button>
                    )}

                    <input
                      type="number"
                      placeholder="Minutes"
                      value={sessionTime}
                      onChange={(e) => setSessionTime(e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-16"
                    />
                    <button
                      onClick={() => handleSetSessionTime(device.id)}
                      className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                    >
                      Set Time
                    </button>

                    <button
                      onClick={() => handleDelete(device.id)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {devices.length === 0 && (
            <div className="text-center py-12">
              <div className="text-slate-500">No WiFi devices found</div>
              <button
                onClick={fetchDevices}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceManager;