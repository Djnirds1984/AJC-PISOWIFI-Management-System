
import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig } from '../../types';
import { apiClient } from '../../lib/api';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const HardwareSetup: React.FC<Props> = ({ onClose, onSaved }) => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(3);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.getConfig().then(cfg => {
      setBoard(cfg.boardType);
      setPin(cfg.coinPin);
      if (cfg.boardModel) setBoardModel(cfg.boardModel);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.saveConfig({ 
        boardType: board, 
        coinPin: pin,
        boardModel: board === 'orange_pi' ? boardModel : null
      });
      onSaved();
      onClose();
    } catch (e) {
      alert('Failed to save hardware configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-slate-950/80 backdrop-blur-xl">
      <div className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Hardware Interface</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Configure GPIO & Controller</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors">✕</button>
        </div>

        <div className="p-8 space-y-8">
          {/* Board Selection */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Target Board Architecture</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BoardCard 
                active={board === 'raspberry_pi'} 
                onClick={() => setBoard('raspberry_pi')}
                title="Raspberry Pi"
                sub="All Models"
                icon="🍓"
              />
              <BoardCard 
                active={board === 'orange_pi'} 
                onClick={() => setBoard('orange_pi')}
                title="Orange Pi"
                sub="All Models"
                icon="🍊"
              />
              <BoardCard 
                active={board === 'none'} 
                onClick={() => setBoard('none')}
                title="No GPIO"
                sub="Simulation"
                icon="💻"
              />
            </div>
            
            {board === 'orange_pi' && (
              <div className="mt-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Orange Pi Model</label>
                <select 
                   value={boardModel} 
                   onChange={(e) => setBoardModel(e.target.value)}
                   className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                >
                   <option value="orange_pi_one">Orange Pi One</option>
                   <option value="orange_pi_zero_3">Orange Pi Zero 3</option>
                   <option value="orange_pi_pc">Orange Pi PC</option>
                   <option value="orange_pi_5">Orange Pi 5</option>
                </select>
              </div>
            )}
          </div>

          {/* Pin Selection */}
          <div className={`${board === 'none' ? 'opacity-40 pointer-events-none' : ''}`}>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Coin Slot GPIO Pin (Physical)</label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {[2, 3, 4, 7, 8, 10, 11, 14, 15, 17, 18, 22, 23, 24, 25, 27].map(p => (
                <button
                  key={p}
                  onClick={() => setPin(p)}
                  className={`py-3 rounded-xl border text-xs font-black transition-all ${
                    pin === p 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20 scale-105' 
                      : 'border-slate-200 text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-4 font-bold flex items-center gap-1.5">
              <span>⚠️</span> Note: Ensure your wiring matches the physical pin number selected.
            </p>
          </div>
        </div>

        <div className="p-6 pb-10 flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black text-lg tracking-tight hover:bg-black transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
          >
            {saving ? 'UPDATING KERNEL MODULES...' : 'COMMIT HARDWARE CHANGES'}
          </button>
        </div>
      </div>
    </div>
  );
};

const BoardCard: React.FC<{ active: boolean; onClick: () => void; title: string; sub: string; icon: string }> = ({ active, onClick, title, sub, icon }) => (
  <button
    onClick={onClick}
    className={`p-4 rounded-2xl border-2 text-left transition-all group ${
      active 
        ? 'bg-blue-50 border-blue-600 shadow-lg shadow-blue-500/10 scale-[1.02]' 
        : 'bg-white border-slate-100 hover:border-slate-300'
    }`}
  >
    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{icon}</div>
    <div className={`text-sm font-black tracking-tight ${active ? 'text-blue-700' : 'text-slate-800'}`}>{title}</div>
    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{sub}</div>
  </button>
);

export default HardwareSetup;
