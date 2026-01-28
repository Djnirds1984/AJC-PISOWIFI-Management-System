import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig, CoinSlotConfig, NodeMCUDevice } from '../../types';
import { apiClient } from '../../lib/api';
import { 
  Save, 
  Cpu,
  Monitor,
  Wifi,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Edit2
} from 'lucide-react';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const isDeviceOnline = (lastSeen: string) => {
    const now = new Date().getTime();
    const last = new Date(lastSeen).getTime();
    return (now - last) < 65000;
  };

  const [coinSlots, setCoinSlots] = useState<CoinSlotConfig[]>([]);
  const [nodemcuDevices, setNodemcuDevices] = useState<NodeMCUDevice[]>([]);
  const [registrationKey, setRegistrationKey] = useState<string>('7B3F1A9');
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

  const handleUpdateDeviceConfig = async (deviceId: string, name: string, pin: number) => {
    try {
      await apiClient.sendNodeMCUConfig(deviceId, { name, pin });
      loadNodemcuDevices();
    } catch (e) {
      alert('Failed to update device configuration');
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
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Hardware Architecture (Legacy/Main Board) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
             <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
               <Cpu size={16} className="text-slate-700" /> Main Controller
             </h3>
          </div>
          <div className="p-6 space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setBoard('raspberry_pi')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${board === 'raspberry_pi' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-xs font-black uppercase tracking-wide mb-1">Raspberry Pi</div>
                  <div className="text-[10px] text-slate-500">Direct BCM GPIO</div>
                </button>
                <button 
                  onClick={() => setBoard('orange_pi')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${board === 'orange_pi' ? 'border-orange-500 bg-orange-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-xs font-black uppercase tracking-wide mb-1">Orange Pi</div>
                  <div className="text-[10px] text-slate-500">Physical Pin Map</div>
                </button>
                
                <button 
                  onClick={() => setBoard('x64_pc')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${board === 'x64_pc' ? 'border-green-600 bg-green-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-xs font-black uppercase tracking-wide mb-1">x64 PC</div>
                  <div className="text-[10px] text-slate-500">Serial Bridge</div>
                </button>
                
                <button 
                  onClick={() => setBoard('none')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${board === 'none' ? 'border-slate-400 bg-slate-50' : 'border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="text-xs font-black uppercase tracking-wide mb-1">Simulated</div>
                  <div className="text-[10px] text-slate-500">No Hardware</div>
                </button>
             </div>

             <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
               <div className="flex justify-between items-center mb-2">
                 <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Coin Pin (Main)</label>
                 <div className="text-xs font-bold text-slate-900 bg-white px-2 py-1 rounded border border-slate-200">GPIO {pin}</div>
               </div>
               <input 
                 type="range" 
                 min="2" 
                 max="27" 
                 value={pin} 
                 onChange={(e) => setPin(parseInt(e.target.value))}
                 className="w-full accent-slate-900"
               />
             </div>

             <button
               onClick={handleSave}
               disabled={saving}
               className="w-full py-4 rounded-xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2"
             >
               {saving ? 'Saving...' : 'Save Controller Config'}
             </button>
          </div>
        </div>

        {/* System Monitor */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
             <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
               <Monitor size={16} className="text-slate-700" /> System Monitor
             </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Configuration</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Board Type:</span>
                  <span className="font-mono text-slate-900">{board}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Coin Pin:</span>
                  <span className="font-mono text-slate-900">GPIO {pin}</span>
                </div>
                {board === 'orange_pi' && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Model:</span>
                    <span className="font-mono text-slate-900">{boardModel}</span>
                  </div>
                )}
              </div>
            </div>

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="text-green-800 text-xs font-bold">Configuration saved successfully!</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-Vendo Controller Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-950 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-600/20">
              <Wifi size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">
                Sub-Vendo Controller
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                {nodemcuDevices.length} Connected Devices
              </p>
            </div>
          </div>
          
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex items-center gap-6">
            <div>
              <div className="text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-1">System Auth Key</div>
              <div className="text-xl font-black text-white tracking-widest font-mono">
                {registrationKey}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => {
                  const newKey = prompt('Enter new System Authentication Key:', registrationKey);
                  if (newKey && newKey.trim()) {
                    setRegistrationKey(newKey.trim());
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2"
              >
                <Edit2 size={12} /> Change
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                <Save size={12} /> {saving ? 'Saving...' : 'Save Key'}
              </button>
            </div>
          </div>
        </div>
        <div className="p-6">
          {nodemcuDevices.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <div className="text-slate-300 mb-2 flex justify-center"><Wifi size={48} /></div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No NodeMCU devices detected</p>
              <p className="text-[10px] text-slate-400 mt-1">Make sure your NodeMCU is running the firmware and connected to the network</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {nodemcuDevices.map((device) => (
                <div key={device.id} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-start">
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Device Name</div>
                      <div className="text-xs font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                        {device.name}
                        {device.status === 'accepted' ? (
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        ) : (
                          <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Status</div>
                      <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        device.status === 'accepted' ? 'bg-green-100 text-green-700' : 
                        device.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                        'bg-red-100 text-red-700'
                      }`}>
                        {device.status}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${isDeviceOnline(device.lastSeen) ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className={`text-[8px] font-black uppercase tracking-widest ${isDeviceOnline(device.lastSeen) ? 'text-green-600' : 'text-red-600'}`}>
                          {isDeviceOnline(device.lastSeen) ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 space-y-3 flex-grow">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">IP Address</div>
                        <div className="text-[10px] font-mono text-slate-700">{device.ipAddress}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">MAC Address</div>
                        <div className="text-[10px] font-mono text-slate-700">{device.macAddress}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Revenue</div>
                        <div className="text-xs font-black text-slate-900 tracking-tight">₱{device.totalRevenue}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Total Pulses</div>
                        <div className="text-xs font-black text-slate-900 tracking-tight">{device.totalPulses}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                       <div className="flex items-center gap-1.5 text-slate-500">
                          <Clock size={12} />
                          <span className="text-[9px] font-bold uppercase tracking-widest">
                            Seen {new Date(device.lastSeen).toLocaleTimeString()}
                          </span>
                       </div>
                       <div className="flex items-center gap-1.5 text-slate-500">
                          <Cpu size={12} />
                          <span className="text-[9px] font-bold uppercase tracking-widest">
                            GPIO {device.pin}
                          </span>
                       </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white border-t border-slate-100 grid grid-cols-2 gap-2">
                    {device.status === 'pending' ? (
                      <>
                        <button 
                          onClick={() => handleUpdateDeviceStatus(device.id, 'accepted')}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-green-700 transition-all active:scale-95"
                        >
                          <CheckCircle size={12} /> Accept
                        </button>
                        <button 
                          onClick={() => handleUpdateDeviceStatus(device.id, 'rejected')}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => {
                            const newName = prompt('Enter device name:', device.name);
                            if (newName) handleUpdateDeviceConfig(device.id, newName, device.pin);
                          }}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                        >
                          <Edit2 size={12} /> Rename
                        </button>
                        <button 
                          onClick={() => handleDeleteDevice(device.id)}
                          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest hover:bg-red-100 transition-all active:scale-95"
                        >
                          <Trash2 size={12} /> Remove
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
    </div>
  );
};

export default HardwareManager;