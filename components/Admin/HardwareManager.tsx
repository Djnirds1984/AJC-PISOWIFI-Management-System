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
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Hardware Architecture</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Select the Single Board Computer (SBC) or PC bridge</p>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">Bus Active</span>
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <BoardCard active={board === 'raspberry_pi'} onClick={() => setBoard('raspberry_pi')} title="Raspberry Pi" sub="BCM Mapping" icon="🍓" />
            <BoardCard active={board === 'orange_pi'} onClick={() => setBoard('orange_pi')} title="Orange Pi" sub="PA/PG Mapping" icon="🍊" />
            <BoardCard active={board === 'x64_pc'} onClick={() => setBoard('x64_pc')} title="x64 (PC)" sub="Serial Bridge" icon="⚡" />
            <BoardCard active={board === 'none'} onClick={() => setBoard('none')} title="Simulated" sub="No Hardware" icon="💻" />
          </div>

          <div className={`${board === 'none' ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-end mb-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {board === 'x64_pc' ? 'Serial Communication' : 'SOC Pin Assignment (BCM)'}
              </label>
              <div className="flex gap-2">
                 {board === 'raspberry_pi' && <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase">Auto-calculating Offset</span>}
                 <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-tighter">Selected BCM: {pin}</span>
              </div>
            </div>
            
            {board !== 'x64_pc' && (
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                {[2, 3, 4, 17, 27, 22, 10, 9, 11, 5, 6, 13, 19, 26, 14, 15].map(p => (
                  <button
                    key={p}
                    onClick={() => setPin(p)}
                    className={`py-4 rounded-xl border text-xs font-black transition-all flex flex-col items-center justify-center ${
                      pin === p 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xl shadow-blue-500/20 scale-105' 
                        : 'border-slate-200 text-slate-400 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <span>{p}</span>
                    <span className="text-[7px] opacity-60">BCM</span>
                  </button>
                ))}
              </div>
            )}

            {board === 'x64_pc' && (
              <div className="p-10 bg-slate-50 rounded-[2rem] border border-slate-200 text-center">
                <div className="text-3xl mb-3">📡</div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  Listening on <code className="bg-slate-200 px-2 py-1 rounded">/dev/ttyUSB0</code>.
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">Connect your Arduino/NodeMCU via USB</p>
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-[10px] font-black text-blue-800 uppercase tracking-tight">Standard Pins</p>
                  <span className="text-[8px] bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase font-black">Recommended</span>
                </div>
                <div className="flex gap-2">
                  <PinBadge bcm={4} phys={7} desc="Safe" />
                  <PinBadge bcm={17} phys={11} desc="Safe" />
                  <PinBadge bcm={27} phys={13} desc="Safe" />
                </div>
              </div>
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-tight mb-2">Diagnostic Notes</p>
                <ul className="text-[9px] font-bold text-slate-500 uppercase space-y-1">
                  <li>• Raspberry Pi 4/5 uses a +512 offset for sysfs.</li>
                  <li>• Pin 3 is hardware I2C; ensure it's disabled.</li>
                  <li>• System automatically detects the GPIO base.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {success && (
              <div className="flex items-center gap-2 text-[10px] font-black text-green-600 uppercase animate-in slide-in-from-left-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Hardware Kernel Stack Updated
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-10 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
          >
            {saving ? 'CONFIGURING KERNEL...' : 'COMMIT SYSTEM CHANGES'}
          </button>
        </div>
      </div>
    </div>
  );
};

const PinBadge: React.FC<{ bcm: number; phys: number; desc: string; danger?: boolean }> = ({ bcm, phys, desc, danger }) => (
  <div className={`flex flex-col items-center px-3 py-2 rounded-lg border ${danger ? 'bg-red-100 border-red-200' : 'bg-white border-blue-100 shadow-sm'}`}>
    <span className={`text-[10px] font-black ${danger ? 'text-red-600' : 'text-blue-600'}`}>BCM {bcm}</span>
    <span className="text-[8px] font-bold text-slate-400 uppercase">Phys {phys}</span>
    <span className={`text-[7px] font-black uppercase tracking-widest mt-1 ${danger ? 'text-red-400' : 'text-blue-400'}`}>{desc}</span>
  </div>
);

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
  </button>
);

export default HardwareManager;