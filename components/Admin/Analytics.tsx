import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { UserSession, SystemStats } from '../../types';

interface AnalyticsProps {
  sessions: UserSession[];
}

interface InterfaceDataPoint {
  time: string;
  rx: number;
  tx: number;
}

const Analytics: React.FC<AnalyticsProps> = ({ sessions }) => {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [sysInfo, setSysInfo] = useState<{manufacturer: string, model: string, distro: string, arch: string} | null>(null);
  const [activeGraphs, setActiveGraphs] = useState<string[]>([]);
  const [history, setHistory] = useState<Record<string, InterfaceDataPoint[]>>({});
  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    // Fetch available interfaces and system info once on mount
    const fetchInitData = async () => {
      try {
        const [ifaceRes, infoRes] = await Promise.all([
          fetch('/api/system/interfaces'),
          fetch('/api/system/info')
        ]);
        
        const ifaceData = await ifaceRes.json();
        setAvailableInterfaces(ifaceData);

        const infoData = await infoRes.json();
        setSysInfo(infoData);
      } catch (err) {
        console.error('Failed to fetch init data', err);
      }
    };
    fetchInitData();

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system/stats');
        const data: SystemStats = await res.json();
        setStats(data);
        
        // Update history
        const now = new Date().toLocaleTimeString();
        setHistory(prev => {
          const newHistory = { ...prev };
          data.network.forEach(net => {
            if (!newHistory[net.iface]) newHistory[net.iface] = [];
            // Calculate speed (bytes per second) - systeminformation returns bytes/sec in rx_sec/tx_sec
            // We'll convert to KB/s for display
            newHistory[net.iface] = [
              ...newHistory[net.iface],
              { 
                time: now, 
                rx: net.rx_sec / 1024, // KB/s
                tx: net.tx_sec / 1024  // KB/s
              }
            ].slice(-20); // Keep last 20 points
          });
          return newHistory;
        });

      } catch (err) {
        console.error('Failed to fetch system stats', err);
      }
    };

    const interval = setInterval(fetchStats, 2000);
    fetchStats();
    return () => clearInterval(interval);
  }, []);

  const addGraph = (iface: string) => {
    if (!activeGraphs.includes(iface)) {
      setActiveGraphs([...activeGraphs, iface]);
    }
    setIsDropdownOpen(false);
  };

  const removeGraph = (iface: string) => {
    setActiveGraphs(activeGraphs.filter(g => g !== iface));
  };

  if (!stats) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <div className="animate-spin text-4xl mb-4">⚙️</div>
        <p className="text-xs font-black uppercase tracking-widest">Loading System Stats...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      
      {/* System Hardware Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CPU Card */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
           <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Processor</h3>
                {sysInfo && (
                    <div className="text-xs font-bold text-blue-600 mt-1">
                        {sysInfo.manufacturer} {sysInfo.model} ({sysInfo.distro} {sysInfo.arch})
                    </div>
                )}
                <p className="text-lg font-black text-slate-800 mt-1">{stats.cpu.manufacturer} {stats.cpu.brand}</p>
              </div>
              <div className="bg-blue-50 text-blue-600 p-3 rounded-2xl">
                <span className="text-2xl">⚡</span>
              </div>
           </div>
           
           <div className="space-y-4">
              <div className="flex justify-between text-xs font-bold text-slate-500">
                 <span>Load</span>
                 <span>{stats.cpu.load.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                 <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.cpu.load}%` }}></div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                 <StatItem label="Cores" value={stats.cpu.cores.toString()} />
                 <StatItem label="Speed" value={`${stats.cpu.speed} GHz`} />
                 <StatItem label="Temp" value={`${stats.cpu.temp?.toFixed(1) || 'N/A'}°C`} />
              </div>
           </div>
        </div>

        {/* Memory Card */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
           <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Memory</h3>
                <p className="text-lg font-black text-slate-800 mt-1">{(stats.memory.total / 1024 / 1024 / 1024).toFixed(2)} GB Total</p>
              </div>
              <div className="bg-purple-50 text-purple-600 p-3 rounded-2xl">
                <span className="text-2xl">🧠</span>
              </div>
           </div>
           
           <div className="space-y-4">
              <div className="flex justify-between text-xs font-bold text-slate-500">
                 <span>Used</span>
                 <span>{((stats.memory.used / stats.memory.total) * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                 <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${(stats.memory.used / stats.memory.total) * 100}%` }}></div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
                 <StatItem label="Free" value={`${(stats.memory.free / 1024 / 1024 / 1024).toFixed(2)} GB`} />
                 <StatItem label="Active" value={`${(stats.memory.active / 1024 / 1024 / 1024).toFixed(2)} GB`} />
                 <StatItem label="Available" value={`${(stats.memory.available / 1024 / 1024 / 1024).toFixed(2)} GB`} />
              </div>
           </div>
        </div>
      </div>

      {/* Interface Graphs */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="text-lg font-black text-slate-800">Network Interfaces</h3>
            
            <div className="relative">
                <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-2 shadow-lg shadow-slate-200"
                >
                    <span>+ Add Graph</span>
                </button>
                {isDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-10 max-h-64 overflow-y-auto">
                        {availableInterfaces.filter(i => !activeGraphs.includes(i)).map(iface => (
                            <button  
                                key={iface}
                                onClick={() => addGraph(iface)}
                                className="w-full text-left px-4 py-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                            >
                                {iface}
                            </button>
                        ))}
                        {availableInterfaces.filter(i => !activeGraphs.includes(i)).length === 0 && (
                            <div className="px-4 py-3 text-xs text-slate-400 text-center font-bold">No more interfaces</div>
                        )}
                    </div>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
            {activeGraphs.map(iface => (
                <div key={iface} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <h3 className="font-bold text-slate-700">{iface}</h3>
                        </div>
                        <button 
                            onClick={() => removeGraph(iface)}
                            className="text-slate-400 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full"
                        >
                            <span className="text-xl">×</span>
                        </button>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history[iface] || []}>
                                <defs>
                                    <linearGradient id={`gradRx-${iface}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id={`gradTx-${iface}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="time" hide />
                                <YAxis 
                                    tickFormatter={(val) => `${val.toFixed(0)} KB/s`} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fill: '#94a3b8', fontSize: 10}} 
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    formatter={(val: number) => [`${val.toFixed(2)} KB/s`]}
                                />
                                <Legend />
                                <Area 
                                    type="monotone" 
                                    dataKey="rx" 
                                    name="Download"
                                    stroke="#3b82f6" 
                                    strokeWidth={2}
                                    fill={`url(#gradRx-${iface})`} 
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="tx" 
                                    name="Upload"
                                    stroke="#10b981" 
                                    strokeWidth={2}
                                    fill={`url(#gradTx-${iface})`} 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ))}
            {activeGraphs.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <div className="text-4xl mb-3">📊</div>
                    <p className="text-slate-500 text-sm font-bold">No active graphs</p>
                    <p className="text-slate-400 text-xs mt-1">Click "Add Graph" to monitor live network traffic</p>
                </div>
            )}
        </div>
      </div>

      {/* Active Sessions (Existing) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800">Active Sessions</h3>
            <p className="text-xs text-slate-500 mt-1">Connected devices with active time</p>
          </div>
          <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded-md font-black uppercase tracking-widest">Live</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">MAC Address</th>
                <th className="px-6 py-4">IP Address</th>
                <th className="px-6 py-4">Remaining Time</th>
                <th className="px-6 py-4">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length > 0 ? sessions.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{s.mac}</td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-500">{s.ip}</td>
                  <td className="px-6 py-4 text-xs font-black text-blue-600">
                    {Math.floor(s.remainingSeconds / 60)}m {s.remainingSeconds % 60}s
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-600">₱{s.totalPaid}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No active sessions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div>
        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</span>
        <span className="block text-sm font-bold text-slate-700">{value}</span>
    </div>
);

export default Analytics;
