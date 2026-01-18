import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig } from '../../types';
import { apiClient } from '../../lib/api';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
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
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
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

          <div className={`${board === 'none' ? 'opacity-40 pointer-events-none' : ''} grid grid-cols-1 lg:grid-cols-3 gap-8`}>
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {board === 'x64_pc' ? 'Serial Communication' : 'Select BCM Pin'}
                </label>
                <div className="flex gap-2">
                   <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-tighter">Current BCM: {pin}</span>
                </div>
              </div>
              
              {board !== 'x64_pc' && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
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
                </div>
              )}
            </div>

            {/* Pinout Reference Table */}
            <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span>📋</span> Pinout Reference
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-tighter border-b border-slate-200 pb-2 mb-2">
                  <span>Physical Pin</span>
                  <span>BCM Number</span>
                </div>
                <MappingRow physical={3} bcm={2} label="SDA (Coin Input)" active={pin === 2} />
                <MappingRow physical={5} bcm={3} label="SCL" active={pin === 3} />
                <MappingRow physical={7} bcm={4} label="GPCLK0 (Safe)" active={pin === 4} />
                <MappingRow physical={11} bcm={17} label="GPIO 17 (Safe)" active={pin === 17} />
                <MappingRow physical={13} bcm={27} label="GPIO 27 (Safe)" active={pin === 27} />
                <MappingRow physical={15} bcm={22} label="GPIO 22 (Safe)" active={pin === 22} />
              </div>
              <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-[9px] font-bold text-amber-700 leading-relaxed uppercase">
                  ⚠️ Note: Physical Pin 3 is BCM 2. Physical Pin 5 is BCM 3. Ensure I2C is disabled to use these pins.
                </p>
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

const MappingRow: React.FC<{ physical: number; bcm: number; label: string; active: boolean }> = ({ physical, bcm, label, active }) => (
  <div className={`flex justify-between items-center px-3 py-2.5 rounded-xl border transition-all ${active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
    <div className="flex flex-col">
      <span className="text-[11px] font-black">Pin {physical}</span>
      <span className={`text-[8px] font-bold uppercase ${active ? 'text-blue-200' : 'text-slate-400'}`}>{label}</span>
    </div>
    <span className="text-sm font-black">BCM {bcm}</span>
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