import React, { useState, useEffect } from 'react';
import { BoardType, SystemConfig, CoinSlotConfig } from '../../types';
import { apiClient } from '../../lib/api';

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const [espIpAddress, setEspIpAddress] = useState<string>('192.168.4.1');
  const [espPort, setEspPort] = useState<number>(80);
  const [coinSlots, setCoinSlots] = useState<CoinSlotConfig[]>([
    { id: 1, enabled: true, pin: 4, denomination: 1, name: '1 Peso Slot' },
    { id: 2, enabled: true, pin: 5, denomination: 5, name: '5 Peso Slot' },
    { id: 3, enabled: false, pin: 12, denomination: 10, name: '10 Peso Slot' },
    { id: 4, enabled: false, pin: 13, denomination: 1, name: 'Extra Slot' }
  ]);
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
      if (cfg.espIpAddress) setEspIpAddress(cfg.espIpAddress);
      if (cfg.espPort) setEspPort(cfg.espPort);
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
        espIpAddress: board === 'nodemcu_esp' ? espIpAddress : null,
        espPort: board === 'nodemcu_esp' ? espPort : null,
        coinSlots: board === 'nodemcu_esp' ? coinSlots : null
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
            <BoardCard active={board === 'nodemcu_esp'} onClick={() => setBoard('nodemcu_esp')} title="NodeMCU ESP" sub="ESP8266/ESP32" icon="📡" />
            <BoardCard active={board === 'none'} onClick={() => setBoard('none')} title="Simulated" sub="No Hardware" icon="💻" />
          </div>

          <div className={`${board === 'none' ? 'opacity-40 pointer-events-none' : ''} grid grid-cols-1 lg:grid-cols-3 gap-8`}>
            <div className="lg:col-span-2 space-y-6">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {board === 'x64_pc' ? 'Serial Communication' : (board === 'orange_pi' ? 'Select Physical Pin' : 'Select BCM Pin')}
                </label>
                <div className="flex gap-2">
                   <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-tighter">Current: {pin}</span>
                </div>
              </div>
              
              {board === 'orange_pi' && (
                <div className="mb-4 bg-orange-50 p-4 rounded-2xl border border-orange-100">
                   <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block mb-2">Select Orange Pi Model</label>
                   <select 
                     value={boardModel} 
                     onChange={(e) => setBoardModel(e.target.value)}
                     className="w-full p-3 rounded-xl border border-orange-200 text-xs font-bold text-slate-700 outline-none focus:border-orange-500 bg-white"
                   >
                     <option value="orange_pi_one">Orange Pi One</option>
                     <option value="orange_pi_zero_3">Orange Pi Zero 3</option>
                     <option value="orange_pi_pc">Orange Pi PC</option>
                     <option value="orange_pi_5">Orange Pi 5</option>
                   </select>
                   <p className="text-[9px] text-orange-400/80 font-bold mt-2 uppercase tracking-wide">
                     * Maps Physical Pins to correct GPIO Sysfs numbers for {boardModel.replace(/_/g, ' ')}.
                   </p>
                </div>
              )}
              
              {board === 'nodemcu_esp' && (
                <div className="mb-6 space-y-6">
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2">ESP WiFi Connection</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">IP Address</label>
                        <input 
                          type="text" 
                          value={espIpAddress}
                          onChange={(e) => setEspIpAddress(e.target.value)}
                          placeholder="192.168.4.1"
                          className="w-full p-3 rounded-xl border border-blue-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Port</label>
                        <input 
                          type="number" 
                          value={espPort}
                          onChange={(e) => setEspPort(parseInt(e.target.value) || 80)}
                          min="1" 
                          max="65535"
                          className="w-full p-3 rounded-xl border border-blue-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 bg-white"
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-blue-400/80 font-bold mt-2 uppercase tracking-wide">
                      * ESP8266/ESP32 must be connected to the same WiFi network
                    </p>
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">Multi-Coin Slots Configuration</label>
                    <div className="space-y-4">
                      {coinSlots.map((slot) => (
                        <div key={slot.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-sm text-slate-800">Slot {slot.id}</h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={slot.enabled}
                                onChange={(e) => {
                                  const updated = [...coinSlots];
                                  updated[slot.id - 1].enabled = e.target.checked;
                                  setCoinSlots(updated);
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                          </div>
                          
                          {slot.enabled && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">GPIO Pin</label>
                                <select 
                                  value={slot.pin}
                                  onChange={(e) => {
                                    const updated = [...coinSlots];
                                    updated[slot.id - 1].pin = parseInt(e.target.value);
                                    setCoinSlots(updated);
                                  }}
                                  className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                                >
                                  <option value="0">GPIO 0 (D3)</option>
                                  <option value="4">GPIO 4 (D2)</option>
                                  <option value="5">GPIO 5 (D1)</option>
                                  <option value="12">GPIO 12 (D6)</option>
                                  <option value="13">GPIO 13 (D7)</option>
                                  <option value="14">GPIO 14 (D5)</option>
                                  <option value="15">GPIO 15 (D8)</option>
                                  <option value="16">GPIO 16 (D0)</option>
                                </select>
                              </div>
                              
                              <div>
                                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Denomination</label>
                                <select 
                                  value={slot.denomination}
                                  onChange={(e) => {
                                    const updated = [...coinSlots];
                                    updated[slot.id - 1].denomination = parseInt(e.target.value);
                                    setCoinSlots(updated);
                                  }}
                                  className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"
                                >
                                  <option value="1">1 Peso</option>
                                  <option value="5">5 Pesos</option>
                                  <option value="10">10 Pesos</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-700 leading-relaxed">
                        <span className="font-black">💡 ESP8266/ESP32 Setup:</span> Connect coin acceptors to the selected GPIO pins. Each slot can be configured for different denominations.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {board !== 'x64_pc' && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {(board === 'orange_pi' 
                    ? [3, 5, 7, 8, 10, 11, 12, 13, 15, 16, 18, 19, 21, 22, 23, 24, 26] 
                    : [2, 3, 4, 17, 27, 22, 10, 9, 11, 5, 6, 13, 19, 26, 14, 15]
                  ).map(p => (
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
                      <span className="text-[7px] opacity-60">{board === 'orange_pi' ? 'PHYS' : 'BCM'}</span>
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

            {/* Pinout Reference Table - Only show for RPi as OPi uses direct physical mapping now */}
            {board === 'raspberry_pi' && (
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
            )}
            
            {board === 'orange_pi' && (
              <div className="bg-orange-50/50 rounded-3xl p-6 border border-orange-100">
                <h4 className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🍊</span> Orange Pi Guide
                </h4>
                <p className="text-[10px] text-slate-600 leading-relaxed mb-4">
                  For <strong>{boardModel.replace(/_/g, ' ')}</strong>, the system automatically maps the selected Physical Pin to the correct internal GPIO number.
                </p>
                <div className="p-4 bg-white rounded-xl border border-orange-100 shadow-sm">
                  <p className="text-[9px] font-bold text-orange-700 leading-relaxed uppercase">
                    Recommended: Use Physical Pin 3, 5, or 7 for Coin Acceptor pulse input.
                  </p>
                </div>
              </div>
            )}
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