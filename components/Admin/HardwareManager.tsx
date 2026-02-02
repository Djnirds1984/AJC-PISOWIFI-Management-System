import React, { useState, useEffect } from 'react';
import { BoardType, CoinSlotConfig, NodeMCUDevice } from '../../types';
import { apiClient } from '../../lib/api';
import { 
  Save, 
  Cpu,
  Monitor,
  Wifi,
  CheckCircle,
  Edit2,
  ChevronDown
} from 'lucide-react';
import NodeMCUManager from './NodeMCUManager';

// Import pin mappings
const { mappings } = require('../../lib/opi_pinout.js');

const HardwareManager: React.FC = () => {
  const [board, setBoard] = useState<BoardType>('none');
  const [pin, setPin] = useState(2);
  const [boardModel, setBoardModel] = useState<string>('orange_pi_one');
  const [showPinDropdown, setShowPinDropdown] = useState(false);
  
  const [coinSlots, setCoinSlots] = useState<CoinSlotConfig[]>([]);
  const [nodemcuDevices, setNodemcuDevices] = useState<NodeMCUDevice[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Pin mapping definitions
  const raspberryPiPins = [
    { physical: 3, gpio: 2, name: 'SDA1' },
    { physical: 5, gpio: 3, name: 'SCL1' },
    { physical: 7, gpio: 4, name: 'GPIO4' },
    { physical: 8, gpio: 14, name: 'TXD0' },
    { physical: 10, gpio: 15, name: 'RXD0' },
    { physical: 11, gpio: 17, name: 'GPIO17' },
    { physical: 12, gpio: 18, name: 'GPIO18' },
    { physical: 13, gpio: 27, name: 'GPIO27' },
    { physical: 15, gpio: 22, name: 'GPIO22' },
    { physical: 16, gpio: 23, name: 'GPIO23' },
    { physical: 18, gpio: 24, name: 'GPIO24' },
    { physical: 19, gpio: 10, name: 'SPI_MOSI' },
    { physical: 21, gpio: 9, name: 'SPI_MISO' },
    { physical: 22, gpio: 25, name: 'GPIO25' },
    { physical: 23, gpio: 11, name: 'SPI_CLK' },
    { physical: 24, gpio: 8, name: 'SPI_CE0_N' },
    { physical: 26, gpio: 7, name: 'SPI_CE1_N' },
    { physical: 29, gpio: 5, name: 'GPIO5' },
    { physical: 31, gpio: 6, name: 'GPIO6' },
    { physical: 32, gpio: 12, name: 'GPIO12' },
    { physical: 33, gpio: 13, name: 'GPIO13' },
    { physical: 35, gpio: 19, name: 'GPIO19' },
    { physical: 36, gpio: 16, name: 'GPIO16' },
    { physical: 37, gpio: 26, name: 'GPIO26' },
    { physical: 38, gpio: 20, name: 'GPIO20' },
    { physical: 40, gpio: 21, name: 'GPIO21' }
  ];

  const orangePiModels = [
    { id: 'orange_pi_one', name: 'Orange Pi One' },
    { id: 'orange_pi_zero_3', name: 'Orange Pi Zero 3' },
    { id: 'orange_pi_pc', name: 'Orange Pi PC' },
    { id: 'orange_pi_5', name: 'Orange Pi 5' }
  ];

  const getAvailablePins = () => {
    if (board === 'raspberry_pi') {
      return raspberryPiPins;
    } else if (board === 'orange_pi') {
      const modelMapping = mappings[boardModel];
      if (!modelMapping) return [];
      
      return Object.entries(modelMapping.pins).map(([physical, gpio]) => ({
        physical: parseInt(physical),
        gpio: gpio as number,
        name: `Pin ${physical}`
      })).sort((a, b) => a.physical - b.physical);
    }
    return [];
  };

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
      
      // Convert stored GPIO number to physical pin number for Orange Pi
      if (cfg.boardType === 'orange_pi' && cfg.boardModel && cfg.coinPin) {
        const modelMapping = mappings[cfg.boardModel];
        if (modelMapping) {
          // Find physical pin that maps to this GPIO
          const entry = Object.entries(modelMapping.pins).find(([_, gpio]) => gpio === cfg.coinPin);
          if (entry) {
            setPin(parseInt(entry[0])); // Set physical pin number
          } else {
            setPin(cfg.coinPin); // Fallback to GPIO if no mapping found
          }
        } else {
          setPin(cfg.coinPin);
        }
      } else {
        setPin(cfg.coinPin);
      }
      
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

  const loadNodemcuDevices = async () => {
    try {
      const devices = await apiClient.getNodeMCUDevices();
      setNodemcuDevices(devices);
    } catch (e) {
      console.error('Failed to load NodeMCU devices');
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
                  onClick={() => {
                    setBoard('orange_pi');
                    if (pin === 2) setPin(3);
                  }}
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
               {/* Board Model Selection */}
               {board === 'orange_pi' && (
                 <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200">
                   <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Board Model</label>
                   <select 
                     value={boardModel}
                     onChange={(e) => setBoardModel(e.target.value)}
                     className="w-full text-[10px] font-bold bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 uppercase tracking-wider"
                   >
                     {orangePiModels.map(model => (
                       <option key={model.id} value={model.id}>{model.name}</option>
                     ))}
                   </select>
                 </div>
               )}
               
               {/* Pin Selection Dropdown */}
               <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-200 relative">
                 <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Coin Pin (Main)</label>
                 <div className="relative">
                   <button
                     onClick={() => setShowPinDropdown(!showPinDropdown)}
                     className="w-full text-left text-[10px] font-bold bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 flex justify-between items-center uppercase tracking-wider"
                   >
                     <span>
                       {board === 'raspberry_pi' || board === 'orange_pi' 
                         ? (() => {
                             const pins = getAvailablePins();
                             const selectedPin = pins.find(p => p.physical === pin);
                             return selectedPin 
                               ? `PIN ${selectedPin.physical} (GPIO ${selectedPin.gpio})`
                               : `Physical Pin ${pin}`;
                           })()
                         : `GPIO ${pin}`
                       }
                     </span>
                     <ChevronDown size={12} className="text-slate-500" />
                   </button>
                   
                   {showPinDropdown && (
                     <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-lg max-h-48 overflow-y-auto z-10">
                       {(board === 'raspberry_pi' || board === 'orange_pi' 
                         ? getAvailablePins()
                         : [{ physical: pin, gpio: pin, name: `GPIO ${pin}` }]
                       ).map(pinOption => (
                         <button
                           key={pinOption.physical}
                           onClick={() => {
                             setPin(pinOption.physical);
                             setShowPinDropdown(false);
                           }}
                           className={`w-full text-left px-3 py-2 text-[9px] font-bold hover:bg-slate-100 transition-colors ${
                             pin === pinOption.physical ? 'bg-slate-200 text-slate-900' : 'text-slate-700'
                           }`}
                         >
                           PIN {pinOption.physical} (GPIO {pinOption.gpio})
                           {pinOption.name && (
                             <span className="ml-2 text-slate-500 font-normal">{pinOption.name}</span>
                           )}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
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
             
             {/* Physical Pin Mapping Display */}
             {(board === 'raspberry_pi' || board === 'orange_pi') && (
               <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                 <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Available Pins</div>
                 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 max-h-32 overflow-y-auto">
                   {getAvailablePins().slice(0, 16).map(pinOption => (
                     <div 
                       key={pinOption.gpio}
                       className={`text-[8px] font-bold px-2 py-1 rounded border ${
                         pin === pinOption.gpio 
                           ? 'bg-slate-900 text-white border-slate-900' 
                           : 'bg-white text-slate-700 border-slate-200'
                       }`}
                     >
                       P{pinOption.physical}<br/>GPIO{pinOption.gpio}
                     </div>
                   ))}
                 </div>
                 {getAvailablePins().length > 16 && (
                   <div className="text-[8px] text-slate-500 mt-2 text-center">
                     Showing first 16 of {getAvailablePins().length} available pins
                   </div>
                 )}
               </div>
             )}
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
                  <span className="font-bold text-slate-900">
                    {board === 'raspberry_pi' || board === 'orange_pi' 
                      ? (() => {
                          const pins = getAvailablePins();
                          const selectedPin = pins.find(p => p.physical === pin);
                          return selectedPin 
                            ? `PIN ${selectedPin.physical} (GPIO ${selectedPin.gpio})`
                            : `Physical Pin ${pin}`;
                        })()
                      : `GPIO ${pin}`
                    }
                  </span>
                </div>
                {board === 'orange_pi' && (
                  <div className="flex justify-between border-b border-slate-200/50 pb-1">
                    <span className="text-slate-500 uppercase">Model:</span>
                    <span className="font-bold text-slate-900">{orangePiModels.find(m => m.id === boardModel)?.name || boardModel}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 uppercase">Method:</span>
                  <span className="font-bold text-slate-900">
                    {board === 'raspberry_pi' ? 'BCM GPIO' : 
                     board === 'orange_pi' ? 'Physical Pin' : 
                     board === 'x64_pc' ? 'Serial Bridge' : 'Virtual'}
                  </span>
                </div>
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

      {/* Sub-Vendo Controller Section - NODEMCU SECTION LEFT UNTOUCHED AS REQUESTED */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-950 flex items-center justify-between">
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
          
          <div className="bg-white/5 rounded-lg px-3 py-2 border border-white/10">
            <div className="text-[8px] font-black text-blue-400 uppercase tracking-wider mb-0.5">License System</div>
            <div className="text-sm font-black text-white tracking-widest font-mono">
              HYBRID
            </div>
          </div>
        </div>
        <div className="p-4">
            <NodeMCUManager devices={nodemcuDevices} onUpdateDevices={setNodemcuDevices} />
        </div>
      </div>
    </div>
  );
};

export default HardwareManager;