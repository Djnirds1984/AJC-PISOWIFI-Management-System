
import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig } from '../../types';
import { apiClient } from '../../lib/api';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(3);
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
      await apiClient.saveConfig({ boardType: board, coinPin: pin });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      alert('Failed to save hardware configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="p-12 text-center text-slate-400 text-xs font-black uppercase tracking-widest">
      Probing Hardware Bus...
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Hardware Architecture</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Select the Single Board Computer (SBC) or PC bridge</p>
        </div>

        <div className="p-8 space-y-8">
          {/* Board Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <BoardCard 
              active={board === 'raspberry_pi'} 
              onClick={() => setBoard('raspberry_pi')}
              title="Raspberry Pi"
              sub="RPI 3/4/5 Models"
              icon="🍓"
            />
            <BoardCard 
              active={board === 'orange_pi'} 
              onClick={() => setBoard('orange_pi')}
              title="Orange Pi"
              sub="H3/H5/RK Models"
              icon="🍊"
            />
            <BoardCard 
              active={board === 'x64_pc'} 
              onClick={() => setBoard('x64_pc')}
              title="x64 (PC)"
              sub="NodeMCU Bridge"
              icon="⚡"
            />
            <BoardCard 
              active={board === 'none'} 
              onClick={() => setBoard('none')}
              title="No Hardware"
              sub="Virtual Mode"
              icon="💻"
            />
          </div>

          {/* Pin Selection */}
          <div className={`${board === 'none' ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-end mb-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {board === 'x64_pc' ? 'Bridge Protocol (GPIO 0-15 Mapping)' : 'Coin Slot GPIO Pin (Physical BCM/Header)'}
              </label>
              <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase">Current: {board === 'x64_pc' ? 'SERIAL BRIDGE' : `PIN ${pin}`}</span>
            </div>
            {board !== 'x64_pc' && (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {[2, 3, 4, 7, 8, 10, 11, 14, 15, 17, 18, 22, 23, 24, 25, 27].map(p => (
                  <button
                    key={p}
                    onClick={() => setPin(p)}
                    className={`py-4 rounded-xl border text-xs font-black transition-all ${
                      pin === p 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20 scale-105' 
                        : 'border-slate-200 text-slate-400 hover:border-slate-400 bg-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            {board === 'x64_pc' && (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  Serial communication is active on <code className="bg-slate-200 px-2 py-0.5 rounded">/dev/ttyUSB0</code>.
                  Ensure your NodeMCU is flashed with the AJC Bridge firmware.
                </p>
              </div>
            )}
            <div className="mt-6 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-tight mb-1">Caution: Kernel Interaction</p>
                <p className="text-[10px] text-amber-700 font-bold leading-relaxed uppercase opacity-80">
                  Changing architecture will instantly switch driver logic (GPIO vs Serial). {board === 'x64_pc' ? 'Ensure your NodeMCU is connected via USB.' : 'Ensure physical wiring matches BCM pin mapping.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {success && (
              <span className="text-[10px] font-black text-green-600 uppercase animate-in slide-in-from-left-2">
                ✓ Hardware Stack Rebuilt Successfully
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
          >
            {saving ? 'UPDATING KERNEL...' : 'COMMIT HARDWARE CHANGES'}
          </button>
        </div>
      </div>
    </div>
  );
};

const BoardCard: React.FC<{ active: boolean; onClick: () => void; title: string; sub: string; icon: string }> = ({ active, onClick, title, sub, icon }) => (
  <button
    onClick={onClick}
    className={`p-5 rounded-[2rem] border-2 text-left transition-all group relative overflow-hidden ${
      active 
        ? 'bg-blue-50 border-blue-600 shadow-2xl shadow-blue-500/10 scale-[1.02]' 
        : 'bg-white border-slate-100 hover:border-slate-300'
    }`}
  >
    <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">{icon}</div>
    <div className={`text-xs font-black tracking-tight ${active ? 'text-blue-700' : 'text-slate-800'}`}>{title}</div>
    <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{sub}</div>
    {active && (
      <div className="absolute top-3 right-3 text-blue-600">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
      </div>
    )}
  </button>
);

const PulseRow: React.FC<{ label: string; count: string }> = ({ label, count }) => (
  <div className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
    <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
    <span className="text-[10px] font-black text-slate-900 uppercase">{count}</span>
  </div>
);

export default HardwareManager;
