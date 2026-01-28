import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig, CoinSlotConfig, NodeMCUDevice, Rate } from '../../types';
import { apiClient } from '../../lib/api';
import { 
  MoreVertical, 
  Trash2, 
  Settings, 
  Edit2, 
  Check, 
  X, 
  RefreshCw, 
  Wifi, 
  Server, 
  Activity,
  Plus,
  Save,
  Cpu,
  Monitor
} from 'lucide-react';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const [coinSlots, setCoinSlots] = useState<CoinSlotConfig[]>([]);
  const [nodemcuDevices, setNodemcuDevices] = useState<NodeMCUDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Modal states
  const [editingDevice, setEditingDevice] = useState<NodeMCUDevice | null>(null);
  const [showRatesModal, setShowRatesModal] = useState(false);
  const [ratesForm, setRatesForm] = useState<Rate[]>([]);
  const [newRate, setNewRate] = useState<Partial<Rate>>({ pesos: 1, minutes: 10 });
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [acceptName, setAcceptName] = useState<string>('');
  const [acceptVlanId, setAcceptVlanId] = useState<number>(13);
  const [vlans, setVlans] = useState<{ name: string; id: number }[]>([]);
  const [pendingAcceptDevice, setPendingAcceptDevice] = useState<NodeMCUDevice | null>(null);

  const REGISTRATION_KEY = "2C0209ACD0D2E0";

  useEffect(() => {
    loadConfig();
    loadNodeMCUDevices();
    const interval = setInterval(loadNodeMCUDevices, 5000); // Auto refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const loadNodeMCUDevices = async () => {
    try {
      const devices = await apiClient.getNodeMCUDevices();
      setNodemcuDevices(devices);
    } catch (e) {
      console.error('Failed to load NodeMCU devices');
    }
  };

  const loadConfig = async () => {
    try {
      const cfg = await apiClient.getConfig();
      setBoard(cfg.boardType);
      setPin(cfg.coinPin);
      if (cfg.boardModel) setBoardModel(cfg.boardModel);
      if (cfg.coinSlots && cfg.coinSlots.length > 0) {
        setCoinSlots(cfg.coinSlots);
      }
    } catch (e) {
      console.error('Failed to load hardware config');
    } finally {
      setLoading(false);
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
        coinSlots: coinSlots
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      alert('Failed to save hardware configuration.');
    } finally {
      setSaving(false);
    }
  };

  const openAcceptModal = async (device: NodeMCUDevice) => {
    setPendingAcceptDevice(device);
    setAcceptName(`Node-${device.macAddress.replace(/[:]/g, '').substring(0, 6)}`);
    try {
      const vlanRows = await apiClient.getVlans();
      setVlans(vlanRows.map((v: any) => ({ name: v.name, id: v.id })));
      setAcceptVlanId(vlanRows.length > 0 ? vlanRows[0].id : 13);
    } catch (e) {
      setVlans([]);
      setAcceptVlanId(13);
    }
    setShowAcceptModal(true);
  };

  const handleConfirmAccept = async () => {
    if (!pendingAcceptDevice) return;
    try {
      await apiClient.acceptNodeMCUDevice(pendingAcceptDevice.id);
      await apiClient.sendNodeMCUConfig(pendingAcceptDevice.id, { name: acceptName, vlanId: acceptVlanId });
      setShowAcceptModal(false);
      setPendingAcceptDevice(null);
      loadNodeMCUDevices();
    } catch (e) {
      alert('Failed to accept and configure device');
    }
  };

  const handleRejectDevice = async (device: NodeMCUDevice) => {
    if (!confirm('Are you sure you want to reject this device?')) return;
    try {
      await apiClient.rejectNodeMCUDevice(device.id);
      loadNodeMCUDevices();
    } catch (e) {
      alert('Failed to reject device');
    }
  };

  const handleDeleteDevice = async (device: NodeMCUDevice) => {
    if (!confirm('Are you sure you want to delete this device? This action cannot be undone.')) return;
    try {
      await apiClient.removeNodeMCUDevice(device.id);
      loadNodeMCUDevices();
    } catch (e) {
      alert('Failed to delete device');
    }
  };

  const openRatesModal = (device: NodeMCUDevice) => {
    setEditingDevice(device);
    setRatesForm(device.rates || []);
    setShowRatesModal(true);
  };

  const handleSaveRates = async () => {
    if (!editingDevice) return;
    try {
      await apiClient.updateNodeMCURates(editingDevice.id, ratesForm);
      setShowRatesModal(false);
      setEditingDevice(null);
      loadNodeMCUDevices();
    } catch (e) {
      alert('Failed to save rates');
    }
  };

  const addRate = () => {
    if (!newRate.pesos || !newRate.minutes) return;
    const rate: Rate = {
      id: Date.now().toString(),
      pesos: newRate.pesos,
      minutes: newRate.minutes,
      download_limit: newRate.download_limit || 0,
      upload_limit: newRate.upload_limit || 0
    };
    setRatesForm([...ratesForm, rate]);
    setNewRate({ pesos: 1, minutes: 10 });
  };

  const removeRate = (id: string) => {
    setRatesForm(ratesForm.filter(r => r.id !== id));
  };

  const pendingDevices = nodemcuDevices.filter(d => d.status === 'pending');
  const acceptedDevices = nodemcuDevices.filter(d => d.status === 'accepted');

  if (loading) return (
    <div className="p-12 text-center text-slate-400 text-xs font-black uppercase tracking-widest animate-pulse">
      Probing Hardware Bus...
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      
      {/* Vendo List Section (only for x64 Ubuntu) */}
      {board === 'x64_pc' && (
      <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Server size={16} className="text-blue-500" /> Vendo List
          </h3>
          <button 
            onClick={loadNodeMCUDevices}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <th className="p-4 pl-6">Name</th>
                <th className="p-4">MAC</th>
                <th className="p-4">ID</th>
                <th className="p-4">Status</th>
                <th className="p-4">Interface</th>
                <th className="p-4">Last Active</th>
                <th className="p-4 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {acceptedDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-600 text-xs">
                    No active vendo units found. Accept pending requests to add them here.
                  </td>
                </tr>
              ) : (
                acceptedDevices.map(device => (
                  <tr key={device.id} className="group hover:bg-slate-800/50 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="font-bold text-slate-200 text-sm">{device.name}</div>
                      <div className="text-[10px] text-slate-500">{device.ipAddress}</div>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-400">{device.macAddress}</td>
                    <td className="p-4 font-mono text-xs text-slate-500">{device.id.substring(0, 8)}...</td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-500 text-[10px] font-bold uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        Online
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-300">vlan.{device.vlanId || 13}</td>
                    <td className="p-4 text-xs text-slate-500">{new Date(device.lastSeen).toLocaleString()}</td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openRatesModal(device)}
                          className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                          title="Configure Rates"
                        >
                          <Activity size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteDevice(device)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                          title="Delete Device"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Sub Vendo Request List (only for x64 Ubuntu) */}
        {board === 'x64_pc' && (
        <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-xl h-full">
          <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Wifi size={16} className="text-amber-500" /> Sub Vendo Request List
            </h3>
            <div className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700 flex items-center gap-2">
              <span className="text-slate-500">Key:</span>
              <span className="text-amber-500 font-bold">{REGISTRATION_KEY}</span>
              <Edit2 size={10} className="cursor-pointer hover:text-white" />
            </div>
          </div>
          
          <div className="p-6">
            {pendingDevices.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-800 rounded-2xl">
                <div className="text-2xl mb-2">📡</div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">No pending requests</p>
                <p className="text-[10px] text-slate-600 mt-1">Connect NodeMCU with Key: {REGISTRATION_KEY}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDevices.map(device => (
                  <div key={device.id} className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 flex justify-between items-center group">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-500 font-bold text-sm">NEW REQUEST</span>
                        <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">{device.ipAddress}</span>
                      </div>
                      <div className="font-mono text-xs text-slate-300 mt-1">{device.macAddress}</div>
                      <div className="text-[10px] text-slate-500 mt-1">Requesting access via {REGISTRATION_KEY}</div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => openAcceptModal(device)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition-colors shadow-lg shadow-green-900/20"
                      >
                        Accept
                      </button>
                      <button 
                        onClick={() => handleRejectDevice(device)}
                        className="p-2 bg-slate-700 hover:bg-red-900/30 hover:text-red-400 text-slate-400 rounded-lg transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

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
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${board === 'x64_pc' ? 'border-purple-600 bg-purple-50' : 'border-slate-100 hover:border-slate-300'}`}
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
               {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
               {saving ? 'Saving...' : 'Save Controller Config'}
             </button>
          </div>
        </div>

      </div>

      {/* Rates Modal */}
      {showRatesModal && editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-3xl border border-slate-700 w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">Pricing Rates</h3>
                <p className="text-xs text-slate-400">Configure pulse rates for {editingDevice.name}</p>
              </div>
              <button 
                onClick={() => setShowRatesModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Add New Rate */}
                <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4">Add New Rate</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Amount (Pesos)</label>
                      <input 
                        type="number" 
                        value={newRate.pesos}
                        onChange={(e) => setNewRate({...newRate, pesos: parseInt(e.target.value)})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-mono text-sm focus:border-blue-500 outline-none transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Time (Minutes)</label>
                      <input 
                        type="number" 
                        value={newRate.minutes}
                        onChange={(e) => setNewRate({...newRate, minutes: parseInt(e.target.value)})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-mono text-sm focus:border-blue-500 outline-none transition-colors"
                      />
                    </div>
                    <button 
                      onClick={addRate}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus size={14} /> Add Rate
                    </button>
                  </div>
                </div>

                {/* Current Rates List */}
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 sticky top-0 bg-slate-900 py-2">Current Rates</h4>
                  {ratesForm.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 text-xs">No rates configured</div>
                  ) : (
                    ratesForm.map((rate) => (
                      <div key={rate.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border border-slate-700 group">
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-700 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-sm">
                            ₱{rate.pesos}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-200">{rate.minutes} Minutes</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Rate ID: {rate.id.slice(-4)}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => removeRate(rate.id)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
              <button 
                onClick={() => setShowRatesModal(false)}
                className="px-6 py-3 text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveRates}
                className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-green-900/20 transition-colors flex items-center gap-2"
              >
                <Save size={14} /> Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accept Modal */}
      {showAcceptModal && pendingAcceptDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 rounded-3xl border border-slate-700 w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Accept Sub Vendo</h3>
              <button 
                onClick={() => setShowAcceptModal(false)}
                className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Name</label>
                <input 
                  type="text"
                  value={acceptName}
                  onChange={(e) => setAcceptName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white font-mono text-sm focus:border-blue-500 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">VLAN Interface</label>
                <select
                  value={acceptVlanId}
                  onChange={(e) => setAcceptVlanId(parseInt(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:border-blue-500 outline-none transition-colors"
                >
                  {vlans.length === 0 && <option value={13}>vlan.13 (default)</option>}
                  {vlans.map(v => (
                    <option key={v.id} value={v.id}>{`vlan.${v.id} (${v.name})`}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={handleConfirmAccept}
                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
              >
                <Check size={14} /> Accept & Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HardwareManager;
