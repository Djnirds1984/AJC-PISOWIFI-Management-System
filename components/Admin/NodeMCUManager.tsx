import React, { useState, useEffect } from 'react';
import { NodeMCUDevice, Rate } from '../../types';
import { apiClient } from '../../lib/api';
import { NODEMCU_D_PINS, gpioToDPin, normalizeDPinLabel } from '../../lib/nodemcuPins';
import NodeMCULicenseManager from './NodeMCULicenseManager';

interface NodeMCUManagerProps {
  devices: NodeMCUDevice[];
  onUpdateDevices: (devices: NodeMCUDevice[]) => void;
}

const NodeMCUManager: React.FC<NodeMCUManagerProps> = ({ devices, onUpdateDevices }) => {
  const [localDevices, setLocalDevices] = useState<NodeMCUDevice[]>(devices);
  const [selectedDevice, setSelectedDevice] = useState<NodeMCUDevice | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'devices' | 'licenses'>('devices');

  useEffect(() => {
    setLocalDevices(devices);
  }, [devices]);

  const handleDownloadFirmware = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch('/api/firmware/nodemcu', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to download firmware');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NodeMCU_ESP8266.ino';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('Firmware downloaded successfully!');
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download firmware. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUpdateFirmware = async (deviceId: string, file: File) => {
    setIsUpdating(deviceId);
    try {
      const response = await apiClient.updateNodeMCUFirmware(deviceId, file);
      if (response.success) {
        alert('Firmware update started! The device will reboot once finished.');
      } else {
        throw new Error(response.error || 'Failed to update firmware');
      }
    } catch (error: any) {
      console.error('Update failed:', error);
      alert(error.message || 'Failed to update firmware. Make sure the device is online.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleAcceptDevice = async (deviceId: string) => {
    try {
      await apiClient.acceptNodeMCUDevice(deviceId);
      
      const updatedDevices = localDevices.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'accepted' as const } 
          : device
      );
      
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to accept NodeMCU device:', error);
      alert('Failed to accept NodeMCU device');
    }
  };

  const handleRejectDevice = async (deviceId: string) => {
    try {
      await apiClient.rejectNodeMCUDevice(deviceId);
      
      const updatedDevices = localDevices.map(device => 
        device.id === deviceId 
          ? { ...device, status: 'rejected' as const } 
          : device
      );
      
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to reject NodeMCU device:', error);
      alert('Failed to reject NodeMCU device');
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await apiClient.removeNodeMCUDevice(deviceId);
      
      const updatedDevices = localDevices.filter(device => device.id !== deviceId);
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to remove NodeMCU device:', error);
      alert('Failed to remove NodeMCU device');
    }
  };

  const handleUpdateRates = async (deviceId: string, rates: Rate[]) => {
    try {
      await apiClient.updateNodeMCURates(deviceId, rates);
      
      const updatedDevices = localDevices.map(device => 
        device.id === deviceId 
          ? { ...device, rates } 
          : device
      );
      
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);
    } catch (error) {
      console.error('Failed to update NodeMCU rates:', error);
      alert('Failed to update NodeMCU rates');
    }
  };

  const handleSaveDeviceConfig = async (device: NodeMCUDevice) => {
    const coinPinLabel = normalizeDPinLabel(device.coinPinLabel) || 'D6';
    const relayPinLabel = normalizeDPinLabel(device.relayPinLabel) || 'D5';

    try {
      await apiClient.updateNodeMCURates(device.id, device.rates);
      const configResponse = await apiClient.sendNodeMCUConfig(device.id, {
        name: device.name,
        coinPinLabel,
        relayPinLabel
      });

      const updatedDevices = localDevices.map(d =>
        d.id === device.id
          ? { ...d, ...configResponse.device, rates: device.rates }
          : d
      );
      setLocalDevices(updatedDevices);
      onUpdateDevices(updatedDevices);

      if (configResponse?.applied?.ok) {
        alert('Na-save ang config. Nagre-reboot ang NodeMCU para ma-apply ang pin settings.');
      } else if (configResponse?.applied && configResponse.applied.ok === false) {
        alert(`Na-save ang config, pero hindi na-push sa NodeMCU: ${configResponse.applied.error || 'unknown error'}`);
      } else {
        alert('Na-save ang config.');
      }
    } catch (error: any) {
      console.error('Failed to save NodeMCU config:', error);
      alert(error?.message || 'Failed to save NodeMCU configuration');
    }
  };

  const pendingDevices = localDevices.filter(device => device.status === 'pending');
  const acceptedDevices = localDevices.filter(device => device.status === 'accepted');

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-20 animate-in fade-in duration-500">
      {/* Tab Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setActiveTab('devices')}
            className={`flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'devices'
                ? 'bg-slate-900 text-white border-b-2 border-slate-900'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            Device Management
          </button>
          <button
            onClick={() => setActiveTab('licenses')}
            className={`flex-1 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'licenses'
                ? 'bg-slate-900 text-white border-b-2 border-slate-900'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            License Management
          </button>
        </div>
      </div>

      {/* Device Management Tab */}
      {activeTab === 'devices' && (
        <>
      {/* Firmware Download Section */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-widest">NodeMCU Firmware</h3>
              <p className="text-[8px] text-blue-600 font-bold uppercase tracking-tighter">ESP8266 Core v2.4.1</p>
            </div>
          </div>
          <button
            onClick={handleDownloadFirmware}
            disabled={isDownloading}
            className={`px-6 py-2 rounded-lg font-black text-[9px] uppercase tracking-widest text-white transition-all shadow-md ${
              isDownloading 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
            }`}
          >
            {isDownloading ? 'Downloading...' : 'Download Source'}
          </button>
        </div>
      </div>

      {/* Pending Devices Section */}
      {pendingDevices.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <h3 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-3">Pending Nodes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingDevices.map(device => (
              <div key={device.id} className="bg-white rounded-lg border border-amber-200 p-3 flex justify-between items-center shadow-sm">
                <div>
                  <div className="text-[10px] font-black text-slate-900 uppercase">{device.name}</div>
                  <div className="text-[8px] text-slate-400 font-mono mt-0.5">
                    {device.ipAddress} • {device.macAddress}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => handleAcceptDevice(device.id)}
                    className="p-1.5 bg-emerald-500 text-white rounded hover:bg-emerald-600 transition-colors"
                    title="Accept"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleRejectDevice(device.id)}
                    className="p-1.5 bg-rose-500 text-white rounded hover:bg-rose-600 transition-colors"
                    title="Reject"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted Devices Section */}
      {acceptedDevices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Registered Nodes</h3>
            <span className="text-[8px] font-black text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{acceptedDevices.length} ACTIVE</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/30">
                <tr>
                  <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Identity</th>
                  <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Network Info</th>
                  <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Performance</th>
                  <th className="px-4 py-2 text-right text-[8px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {acceptedDevices.map(device => (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2">
                      <div className="text-[10px] font-black text-slate-900 uppercase">{device.name}</div>
                      <div className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                        Seen {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-[9px] font-mono text-slate-600">{device.ipAddress}</div>
                      <div className="text-[8px] font-mono text-slate-400 tracking-tighter">{device.macAddress}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter leading-none">Revenue</div>
                          <div className="text-[10px] font-black text-emerald-600">₱{device.totalRevenue.toFixed(2)}</div>
                        </div>
                        <div className="w-px h-6 bg-slate-100"></div>
                        <div>
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter leading-none">Pulses</div>
                          <div className="text-[10px] font-black text-slate-900">{device.totalPulses}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => {
                            const coinLabel = normalizeDPinLabel(device.coinPinLabel) || gpioToDPin(device.coinPin ?? device.pin) || 'D6';
                            const relayLabel = normalizeDPinLabel(device.relayPinLabel) || gpioToDPin(device.relayPin ?? 14) || 'D5';
                            setSelectedDevice({
                              ...device,
                              coinPinLabel: coinLabel,
                              relayPinLabel: relayLabel
                            });
                          }}
                          className="px-2 py-1 bg-slate-900 text-white text-[8px] font-black uppercase tracking-widest rounded hover:bg-black transition-all"
                        >
                          Config
                        </button>
                        <label className="px-2 py-1 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded hover:bg-blue-100 transition-all cursor-pointer border border-blue-100">
                          {isUpdating === device.id ? 'Busy' : 'Firmware'}
                          <input 
                            type="file" 
                            className="hidden" 
                            accept=".bin"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpdateFirmware(device.id, file);
                              e.target.value = '';
                            }}
                            disabled={isUpdating !== null}
                          />
                        </label>
                        <button 
                          onClick={() => handleRemoveDevice(device.id)}
                          className="p-1 text-rose-400 hover:text-rose-600 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {selectedDevice && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Configure Node</h3>
              <button onClick={() => setSelectedDevice(null)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={selectedDevice.name}
                  onChange={(e) => setSelectedDevice({ ...selectedDevice, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Coin Pulse Pin</label>
                  <select
                    value={normalizeDPinLabel(selectedDevice.coinPinLabel) || 'D6'}
                    onChange={(e) => setSelectedDevice({ ...selectedDevice, coinPinLabel: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none"
                  >
                    {NODEMCU_D_PINS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Relay Pin</label>
                  <select
                    value={normalizeDPinLabel(selectedDevice.relayPinLabel) || 'D5'}
                    onChange={(e) => setSelectedDevice({ ...selectedDevice, relayPinLabel: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none"
                  >
                    {NODEMCU_D_PINS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Pricing Matrix</label>
                  <button
                    onClick={() => {
                      const newRate: Rate = { id: Date.now().toString(), pesos: 1, minutes: 1 };
                      setSelectedDevice({ ...selectedDevice, rates: [...selectedDevice.rates, newRate] });
                    }}
                    className="text-[8px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    + Add Rate
                  </button>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                  {selectedDevice.rates.map((rate, index) => (
                    <div key={index} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div className="flex-1 flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">₱</span>
                          <input
                            type="number"
                            value={rate.pesos}
                            onChange={(e) => {
                              const updatedRates = [...selectedDevice.rates];
                              updatedRates[index].pesos = Number(e.target.value);
                              setSelectedDevice({ ...selectedDevice, rates: updatedRates });
                            }}
                            className="w-full pl-5 pr-2 py-1.5 bg-white border border-slate-200 rounded text-[10px] font-black outline-none"
                          />
                        </div>
                        <div className="relative flex-1">
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">MIN</span>
                          <input
                            type="number"
                            value={rate.minutes}
                            onChange={(e) => {
                              const updatedRates = [...selectedDevice.rates];
                              updatedRates[index].minutes = Number(e.target.value);
                              setSelectedDevice({ ...selectedDevice, rates: updatedRates });
                            }}
                            className="w-full pl-2 pr-7 py-1.5 bg-white border border-slate-200 rounded text-[10px] font-black outline-none"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const updatedRates = selectedDevice.rates.filter((_, i) => i !== index);
                          setSelectedDevice({ ...selectedDevice, rates: updatedRates });
                        }}
                        className="p-1.5 text-rose-400 hover:text-rose-600 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    handleSaveDeviceConfig(selectedDevice);
                    setSelectedDevice(null);
                  }}
                  className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
                >
                  Save Configuration
                </button>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Devices Message */}
      {localDevices.length === 0 && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2 opacity-20">📡</div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No NodeMCU devices detected</p>
          <p className="text-[8px] text-slate-400 uppercase tracking-tighter mt-1">Connect your boards using the system authentication key</p>
        </div>
      )}
      </>
      )}

      {/* License Management Tab */}
      {activeTab === 'licenses' && (
        <NodeMCULicenseManager devices={localDevices} />
      )}
    </div>
  );
};

export default NodeMCUManager;
