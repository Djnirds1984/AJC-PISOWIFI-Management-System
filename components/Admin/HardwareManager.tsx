import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig, CoinSlotConfig, NodeMCUDevice } from '../../types';
import { apiClient } from '../../lib/api';
import { NODEMCU_D_PINS, gpioToDPin, normalizeDPinLabel } from '../../lib/nodemcuPins';
import { 
  Save, 
  Cpu,
  Monitor,
  Wifi,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Edit2,
  Upload
} from 'lucide-react';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const isDeviceOnline = (lastSeen: string) => {
    const now = new Date().getTime();
    const last = new Date(lastSeen).getTime();
    return (now - last) < 15000; // 15 seconds threshold
  };

  const [coinSlots, setCoinSlots] = useState<CoinSlotConfig[]>([]);
  const [nodemcuDevices, setNodemcuDevices] = useState<NodeMCUDevice[]>([]);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [registrationKey, setRegistrationKey] = useState<string>('7B3F1A9');
  const [selectedNode, setSelectedNode] = useState<NodeMCUDevice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadConfig();
    loadNodemcuDevices();
    
    // Refresh device list periodically
    const interval = setInterval(loadNodemcuDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await apiClient.getConfig();
      setBoard(cfg.boardType);
      setPin(cfg.coinPin);
      if (cfg.boardModel) setBoardModel(cfg.boardModel);
      if (cfg.registrationKey) setRegistrationKey(cfg.registrationKey);
      if (cfg.coinSlots && cfg.coinSlots.length > 0) {
        setCoinSlots(cfg.coinSlots);
      }
    } catch (e) {
      console.error('Failed to load hardware config');
    } finally {
      setLoading(false);
    }
  };

  const loadNodemcuDevices = async () => {
    try {
      const devices = await apiClient.getNodeMCUDevices();
      setNodemcuDevices(devices);
    } catch (e) {
      console.error('Failed to load NodeMCU devices');
    }
  };

  const handleUpdateDeviceStatus = async (deviceId: string, status: 'accepted' | 'rejected') => {
    try {
      await apiClient.updateNodeMCUStatus(deviceId, status);
      loadNodemcuDevices();
    } catch (e) {
      alert('Failed to update device status');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to remove this device?')) return;
    try {
      await apiClient.removeNodeMCUDevice(deviceId);
      loadNodemcuDevices();
    } catch (e) {
      alert('Failed to delete device');
    }
  };

  const openNodeEditor = (device: NodeMCUDevice) => {
    const coinLabel = normalizeDPinLabel(device.coinPinLabel) || gpioToDPin(device.coinPin ?? device.pin) || 'D6';
    const relayLabel = normalizeDPinLabel(device.relayPinLabel) || gpioToDPin(device.relayPin ?? 14) || 'D5';
    setSelectedNode({
      ...device,
      coinPinLabel: coinLabel,
      relayPinLabel: relayLabel
    });
  };

  const handleSaveNodePins = async (device: NodeMCUDevice) => {
    const coinPinLabel = normalizeDPinLabel(device.coinPinLabel) || 'D6';
    const relayPinLabel = normalizeDPinLabel(device.relayPinLabel) || 'D5';
    try {
      const response = await apiClient.sendNodeMCUConfig(device.id, {
        name: device.name,
        coinPinLabel,
        relayPinLabel
      });
      await loadNodemcuDevices();

      if (response?.applied?.ok) {
        alert('Na-save ang pins. Nagre-reboot ang NodeMCU para ma-apply.');
      } else if (response?.applied && response.applied.ok === false) {
        alert(`Na-save ang pins, pero hindi na-push sa NodeMCU: ${response.applied.error || 'unknown error'}`);
      } else {
        alert('Na-save ang pins.');
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to save NodeMCU pins');
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

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await apiClient.saveConfig({ 
        boardType: board, 
        coinPin: pin,
        boardModel: board === 'orange_pi' ? boardModel : null,
        coinSlots: coinSlots,
        registrationKey: registrationKey
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      alert('Failed to save hardware configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="p-12 text-center text-slate-400 text-xs font-black uppercase tracking-widest animate-pulse">
      Probing Hardware Bus...
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-4 animate-in fade-in duration-500 pb-20">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Hardware Architecture (Legacy/Main Board) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
             <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
               <Cpu size={14} className="text-slate-700" /> Main Controller
             </h3>
             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Hardware Selection</span>
          </div>
          <div className="p-4 space-y-4">
             <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button 
                  onClick={() => setBoard('raspberry_pi')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${board === 'raspberry_pi' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-[10px] font-black uppercase tracking-wide mb-0.5">Raspberry Pi</div>
                  <div className="text-[9px] text-slate-500">BCM GPIO</div>
                </button>
                <button 
                  onClick={() => setBoard('orange_pi')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${board === 'orange_pi' ? 'border-orange-500 bg-orange-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-[10px] font-black uppercase tracking-wide mb-0.5">Orange Pi</div>
                  <div className="text-[9px] text-slate-500">Physical Map</div>
                </button>
                
                <button 
                  onClick={() => setBoard('x64_pc')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${board === 'x64_pc' ? 'border-green-600 bg-green-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-[10px] font-black uppercase tracking-wide mb-0.5">x64 PC</div>
                  <div className="text-[9px] text-slate-500">Serial Bridge</div>
                </button>
                
                <button 
                  onClick={() => setBoard('none')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${board === 'none' ? 'border-slate-400 bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-[10px] font-black uppercase tracking-wide mb-0.5">Simulated</div>
                  <div className="text-[9px] text-slate-500">Virtual</div>
                </button>
             </div>

             <div className="flex flex-col sm:flex-row gap-4">
               <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                 <div className="flex justify-between items-center mb-2">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Coin Pin (Main)</label>
                   <div className="text-[10px] font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">GPIO {pin}</div>
                 </div>
                 <input 
                   type="range" 
                   min="2" 
                   max="27" 
                   value={pin} 
                   onChange={(e) => setPin(parseInt(e.target.value))}
                   className="w-full accent-slate-900 h-1.5 rounded-lg appearance-none bg-slate-200 cursor-pointer"
                 />
               </div>
               
               <button
                 onClick={handleSave}
                 disabled={saving}
                 className="sm:w-48 py-3 rounded-lg bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
               >
                 <Save size={12} />
                 {saving ? 'Saving...' : 'Apply Config'}
               </button>
             </div>
          </div>
        </div>

        {/* System Monitor */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
             <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
               <Monitor size={14} className="text-slate-700" /> Monitor
             </h3>
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Active Spec</div>
              <div className="space-y-1.5 text-[10px]">
                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                  <span className="text-slate-500 uppercase">Board:</span>
                  <span className="font-bold text-slate-900">{board.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200/50 pb-1">
                  <span className="text-slate-500 uppercase">Input:</span>
                  <span className="font-bold text-slate-900">GPIO {pin}</span>
                </div>
                {board === 'orange_pi' && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 uppercase">Model:</span>
                    <span className="font-bold text-slate-900">{boardModel}</span>
                  </div>
                )}
              </div>
            </div>

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex items-center gap-2">
                <CheckCircle size={12} className="text-green-600" />
                <div className="text-green-800 text-[9px] font-bold uppercase tracking-tight">Saved successfully</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Vendo Controller Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-950 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <Wifi size={16} />
            </div>
            <div>
              <h3 className="text-[10px] font-black text-white uppercase tracking-widest">
                Sub-Vendo Bridge
              </h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">
                {nodemcuDevices.length} ACTIVE NODES
              </p>
            </div>
          </div>
          
          <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/10 flex items-center gap-4 w-full sm:w-auto">
            <div>
              <div className="text-[8px] font-black text-blue-400 uppercase tracking-wider mb-0.5">System Auth</div>
              <div className="text-sm font-black text-white tracking-widest font-mono">
                {registrationKey}
              </div>
            </div>
            <div className="flex gap-1 ml-auto">
              <button 
                onClick={() => {
                  const newKey = prompt('Enter new System Authentication Key:', registrationKey);
                  if (newKey && newKey.trim()) {
                    setRegistrationKey(newKey.trim());
                  }
                }}
                className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 transition-all"
                title="Change Key"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
                title="Save Key"
              >
                <Save size={12} />
              </button>
            </div>
          </div>
        </div>
        <div className="p-4">
          {nodemcuDevices.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              <div className="text-slate-300 mb-1 flex justify-center"><Wifi size={24} /></div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No nodes detected</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-tighter mt-0.5">Ensure NodeMCU is powered and connected</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {nodemcuDevices.map((device) => (
                <div key={device.id} className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-3 py-2 border-b border-slate-200 bg-white flex justify-between items-center">
                    <div className="flex flex-col">
                      <div className="text-[10px] font-black text-slate-900 uppercase truncate max-w-[120px]">
                        {device.name}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${isDeviceOnline(device.lastSeen) ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                          {isDeviceOnline(device.lastSeen) ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    </div>
                    <div className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                      device.status === 'accepted' ? 'bg-green-100 text-green-700' : 
                      device.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                      'bg-red-100 text-red-700'
                    }`}>
                      {device.status}
                    </div>
                  </div>
                  
                  <div className="p-3 space-y-2 flex-grow">
                    <div className="grid grid-cols-2 gap-2 text-[9px]">
                      <div>
                        <div className="text-slate-400 uppercase font-bold tracking-tighter">IP</div>
                        <div className="font-mono text-slate-700 truncate">{device.ipAddress}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 uppercase font-bold tracking-tighter">MAC</div>
                        <div className="font-mono text-slate-700 truncate">{device.macAddress}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-white/50 p-2 rounded border border-slate-100">
                      <div>
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Revenue</div>
                        <div className="text-[10px] font-black text-slate-900">₱{device.totalRevenue}</div>
                      </div>
                      <div>
                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Pulses</div>
                        <div className="text-[10px] font-black text-slate-900">{device.totalPulses}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase pt-1">
                       <div className="flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </div>
                       <div className="flex items-center gap-1">
                          <Cpu size={10} />
                          {device.coinPinLabel || gpioToDPin(device.coinPin ?? device.pin) || 'D6'}
                       </div>
                    </div>
                  </div>

                  <div className="p-2 bg-white border-t border-slate-100 flex gap-1">
                    {device.status === 'pending' ? (
                      <>
                        <button 
                          onClick={() => handleUpdateDeviceStatus(device.id, 'accepted')}
                          className="flex-1 py-1.5 rounded bg-green-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-green-700 transition-all"
                        >
                          Accept
                        </button>
                        <button 
                          onClick={() => handleUpdateDeviceStatus(device.id, 'rejected')}
                          className="flex-1 py-1.5 rounded bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => {
                            openNodeEditor(device);
                          }}
                          className="p-1.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                          title="Edit"
                        >
                          <Edit2 size={12} />
                        </button>

                        <label className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-blue-50 text-blue-600 text-[9px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all cursor-pointer">
                          {isUpdating === device.id ? (
                            <div className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <>
                              <Upload size={12} /> Firmware
                            </>
                          )}
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
                          onClick={() => handleDeleteDevice(device.id)}
                          className="p-1.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-all"
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedNode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">NodeMCU Pins</h3>
              <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Device Name</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => setSelectedNode({ ...selectedNode, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Coin Pulse Pin</label>
                  <select
                    value={normalizeDPinLabel(selectedNode.coinPinLabel) || 'D6'}
                    onChange={(e) => setSelectedNode({ ...selectedNode, coinPinLabel: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none"
                  >
                    {NODEMCU_D_PINS.filter(p => p !== 'D0').map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Relay Pin</label>
                  <select
                    value={normalizeDPinLabel(selectedNode.relayPinLabel) || 'D5'}
                    onChange={(e) => setSelectedNode({ ...selectedNode, relayPinLabel: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none"
                  >
                    {NODEMCU_D_PINS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    handleSaveNodePins(selectedNode);
                    setSelectedNode(null);
                  }}
                  className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95"
                >
                  Save
                </button>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HardwareManager;
