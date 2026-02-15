import React, { useState, useEffect } from 'react';
import { WifiDevice, UserSession } from '../../types';
import { apiClient } from '../../lib/api';

interface Props {
  sessions?: UserSession[];
  refreshSessions?: () => void;
  refreshDevices?: () => void;
}

const DeviceManager: React.FC<Props> = ({ sessions = [], refreshSessions, refreshDevices }) => {
  const [devices, setDevices] = useState<WifiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [refreshingDevices, setRefreshingDevices] = useState<Set<string>>(new Set());
  
  // Edit Modal State
  const [editingDevice, setEditingDevice] = useState<WifiDevice | null>(null);
  const [editForm, setEditForm] = useState({
    customName: '',
    sessionTime: '',
    downloadLimit: '',
    uploadLimit: ''
  });

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
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDevices();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.scanDevices();
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
      const data = await apiClient.scanDevices();
      setDevices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan devices');
    } finally {
      setLoading(false);
    }
  };

  const refreshDevice = async (deviceId: string) => {
    setRefreshingDevices(prev => new Set(prev).add(deviceId));
    try {
      const updatedDevice = await apiClient.refreshDevice(deviceId);
      
      // Update the device in the list
      setDevices(prev => prev.map(device => 
        device.id === deviceId ? updatedDevice : device
      ));
      
      // Refresh device list if refreshDevices function is provided
      if (refreshDevices) {
        refreshDevices();
      }
    } catch (err) {
      alert(`Failed to refresh device: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRefreshingDevices(prev => {
        const newSet = new Set(prev);
        newSet.delete(deviceId);
        return newSet;
      });
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

  const openEditModal = (device: WifiDevice) => {
    setEditingDevice(device);
    
    // Use live session data if available, otherwise fall back to device data
    const liveSession = sessions.find(s => s.mac.toUpperCase() === device.mac.toUpperCase());
    const displayTime = liveSession ? liveSession.remainingSeconds : device.sessionTime;
    
    setEditForm({
      customName: device.customName || device.hostname || '',
      sessionTime: displayTime ? Math.floor(displayTime / 60).toString() : '',
      downloadLimit: device.downloadLimit ? device.downloadLimit.toString() : '',
      uploadLimit: device.uploadLimit ? device.uploadLimit.toString() : ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingDevice) return;
    
    try {
      await apiClient.updateWifiDevice(editingDevice.id, { 
        customName: editForm.customName,
        sessionTime: editForm.sessionTime ? Number(editForm.sessionTime) * 60 : undefined,
        downloadLimit: editForm.downloadLimit ? Number(editForm.downloadLimit) : 0,
        uploadLimit: editForm.uploadLimit ? Number(editForm.uploadLimit) : 0
      });
      setEditingDevice(null);
      fetchDevices();
      // Refresh sessions to ensure live data is updated
      if (refreshSessions) {
        refreshSessions();
      }
    } catch (err) {
      alert(`Failed to update device: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  const formatDate = (timestamp: number | string | undefined) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) return 'Invalid Date';
      return date.toLocaleString();
    } catch (e) {
      return 'Invalid Date';
    }
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
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">WiFi Device Management</h2>
        <div className="flex gap-2">
          <button
            onClick={scanDevices}
            disabled={loading}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-bold hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Scanning...' : 'Scan Devices'}
          </button>
          <button
            onClick={() => setShowAddDevice(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700"
          >
            Add Device
          </button>
        </div>
      </div>

      {editingDevice && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-2xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-tight">Edit Device</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Device Name</label>
                <input
                  type="text"
                  value={editForm.customName}
                  onChange={(e) => setEditForm({...editForm, customName: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  placeholder="Custom Name"
                />
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Session (Mins)</label>
                <input
                  type="number"
                  value={editForm.sessionTime}
                  onChange={(e) => setEditForm({...editForm, sessionTime: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">DL (Mbps)</label>
                  <input
                    type="number"
                    value={editForm.downloadLimit}
                    onChange={(e) => setEditForm({...editForm, downloadLimit: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">UL (Mbps)</label>
                  <input
                    type="number"
                    value={editForm.uploadLimit}
                    onChange={(e) => setEditForm({...editForm, uploadLimit: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setEditingDevice(null)}
                  className="px-4 py-2 text-slate-500 text-[10px] font-bold uppercase"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase shadow-lg shadow-blue-600/20"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddDevice && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-xs font-bold text-slate-800 mb-4 uppercase tracking-tight">Add New Device</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="MAC Address"
              value={newDevice.mac}
              onChange={(e) => setNewDevice({...newDevice, mac: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <input
              type="text"
              placeholder="IP Address"
              value={newDevice.ip}
              onChange={(e) => setNewDevice({...newDevice, ip: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <input
              type="text"
              placeholder="Interface (e.g., wlan0)"
              value={newDevice.interface}
              onChange={(e) => setNewDevice({...newDevice, interface: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddDevice}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase shadow-lg shadow-blue-600/20"
            >
              Add Device
            </button>
            <button
              onClick={() => setShowAddDevice(false)}
              className="px-4 py-2 text-slate-500 text-[10px] font-bold uppercase"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-800">Connected Devices ({devices.length})</h3>
          <button onClick={fetchDevices} className="text-[10px] font-bold text-blue-600 uppercase">Refresh All</button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[9px] uppercase font-bold tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-4 py-2">Device</th>
                <th className="px-4 py-2">Network</th>
                <th className="px-4 py-2">Signal</th>
                <th className="px-4 py-2">Session</th>
                <th className="px-4 py-2">Limit</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((device) => {
                // Check if device has live active session
                const liveSession = sessions.find(s => s.mac.toUpperCase() === device.mac.toUpperCase());
                const isDeviceActive = device.isActive || (liveSession && liveSession.remainingSeconds > 0);
                
                return (
                <tr key={device.id} className={`hover:bg-slate-50 transition-colors ${!isDeviceActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isDeviceActive ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-900">
                          {device.customName || device.hostname || 'Unknown'}
                        </div>
                        <div className="text-[9px] text-slate-500 uppercase">{device.mac}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="text-[10px] font-bold text-slate-700">{device.ip || '-'}</div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-tighter">{device.interface || '-'}</div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1 h-3 rounded-full ${
                        device.signal > -50 ? 'bg-green-500' : 
                        device.signal > -70 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <span className="text-[10px] font-bold text-slate-700">{device.signal} dBm</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {(() => {
                      // Get live session data for this device
                      const liveSession = sessions.find(s => s.mac.toUpperCase() === device.mac.toUpperCase());
                      const displayTime = liveSession ? liveSession.remainingSeconds : device.sessionTime;
                      const displayPaid = liveSession ? liveSession.totalPaid : device.totalPaid;
                      
                      return (
                        <>
                          <div className="text-[10px] font-bold text-blue-600">
                            {displayTime ? formatTime(displayTime) : 'None'}
                          </div>
                          {displayPaid ? (
                            <div className="text-[9px] text-green-600 font-bold">
                              ₱{displayPaid}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <div className="text-[9px] font-bold text-slate-600">
                      <div>DL: {device.downloadLimit ? `${device.downloadLimit}M` : '∞'}</div>
                      <div>UL: {device.uploadLimit ? `${device.uploadLimit}M` : '∞'}</div>
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-right space-x-1">
                    <button
                      onClick={() => refreshDevice(device.id)}
                      disabled={refreshingDevices.has(device.id)}
                      className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-md transition-colors"
                      title="Refresh"
                    >
                      {refreshingDevices.has(device.id) ? '...' : '🔄'}
                    </button>
                    {isDeviceActive ? (
                      <button
                        onClick={() => handleDisconnect(device.id)}
                        className="p-1.5 hover:bg-red-50 text-red-600 rounded-md transition-colors"
                        title="Disconnect"
                      >
                        🚫
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(device.id)}
                        className="p-1.5 hover:bg-green-50 text-green-600 rounded-md transition-colors"
                        title="Connect"
                      >
                        ✅
                      </button>
                    )}
                    
                    <button
                      onClick={() => openEditModal(device)}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-md transition-colors"
                      title="Edit"
                    >
                      ✏️
                    </button>
  
                    <button
                      onClick={() => handleDelete(device.id)}
                      className="p-1.5 hover:bg-red-50 text-red-600 rounded-md transition-colors"
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          
          {devices.length === 0 && (
            <div className="text-center py-10">
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">No devices found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceManager;
