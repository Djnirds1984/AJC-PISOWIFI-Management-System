import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig, CoinSlotConfig } from '../../types';
import { apiClient } from '../../lib/api';
import { 
  Save, 
  Cpu,
  Monitor
} from 'lucide-react';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const [coinSlots, setCoinSlots] = useState<CoinSlotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

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
    </div>
  );
};

export default HardwareManager;