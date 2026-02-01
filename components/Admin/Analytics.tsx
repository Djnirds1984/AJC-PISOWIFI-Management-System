import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { UserSession, SystemStats } from '../../types';
import { apiClient } from '../../lib/api';

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
        const [ifaceData, infoData] = await Promise.all([
          apiClient.getSystemInterfaces(),
          apiClient.getSystemInfo()
        ]);
        
        setAvailableInterfaces(ifaceData);
        setSysInfo(infoData);
      } catch (err) {
        console.error('Failed to fetch init data', err);
      }
    };
    fetchInitData();

    const fetchStats = async () => {
      try {
        const data: SystemStats = await apiClient.getSystemStats();
        setStats(data);
        
        // Update history
        const now = new Date().toLocaleTimeString();
        setHistory(prev => {
          const newHistory = { ...prev };
          data.network.forEach(net => {
            if (!newHistory[net.iface]) newHistory[net.iface] = [];
            // Calculate speed (bytes per second) - systeminformation returns bytes/sec in rx_sec/tx_sec
            // We'll convert to Mb/s (Megabits per second) for display
            // Bytes * 8 = bits
            newHistory[net.iface] = [
              ...newHistory[net.iface],
              { 
                time: now, 
                rx: (net.rx_sec * 8) / 1024 / 1024, // Mb/s
                tx: (net.tx_sec * 8) / 1024 / 1024  // Mb/s
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CPU Card */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
           <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-[10px] font-medium text-muted uppercase tracking-wide">Processor</h3>
                {sysInfo && (
                    <div className="text-[10px] font-bold text-blue-600 mt-0.5">
                        {sysInfo.manufacturer} {sysInfo.model}
                    </div>
                )}
                <p className="text-sm font-bold text-main mt-0.5">{stats.cpu?.brand || 'CPU'}</p>
              </div>
              <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                <span className="text-lg">⚡</span>
              </div>
           </div>
           
           <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-medium text-muted">
                 <span>Load</span>
                 <span>{stats.cpu?.load?.toFixed(1) || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                 <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.cpu?.load || 0}%` }}></div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-200">
                 <StatItem label="Cores" value={stats.cpu?.cores?.toString() || 'N/A'} />
                 <StatItem label="Speed" value={`${stats.cpu?.speed || 'N/A'} GHz`} />
                 <StatItem label="Temp" value={`${stats.cpu?.temp?.toFixed(1) || 'N/A'}°C`} />
              </div>
           </div>
        </div>

        {/* Memory Card */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
           <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-[10px] font-medium text-muted uppercase tracking-wide">Memory</h3>
                <p className="text-sm font-bold text-main mt-0.5">{(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB Total</p>
              </div>
              <div className="bg-purple-50 text-purple-600 p-2 rounded-lg">
                <span className="text-lg">🧠</span>
              </div>
           </div>
           
           <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-medium text-muted">
                 <span>Used</span>
                 <span>{((stats.memory.used / stats.memory.total) * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                 <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${(stats.memory.used / stats.memory.total) * 100}%` }}></div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-200">
                 <StatItem label="Free" value={`${(stats.memory.free / 1024 / 1024 / 1024).toFixed(1)} GB`} />
                 <StatItem label="Active" value={`${(stats.memory.active / 1024 / 1024 / 1024).toFixed(1)} GB`} />
                 <StatItem label="Avail" value={`${(stats.memory.available / 1024 / 1024 / 1024).toFixed(1)} GB`} />
              </div>
           </div>
        </div>
      </div>

      {/* Interface Graphs */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-main">Network Interfaces</h3>
            
            <div className="relative">
                <button 
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
                >
                    <span>+ Add Graph</span>
                </button>
                {isDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-10 max-h-48 overflow-y-auto">
                        {availableInterfaces.filter(i => !activeGraphs.includes(i)).map(iface => (
                            <button  
                                key={iface}
                                onClick={() => addGraph(iface)}
                                className="w-full text-left px-3 py-2 text-[10px] font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            >
                                {iface}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
            {activeGraphs.map(iface => (
                <div key={iface} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                            <h3 className="text-xs font-bold text-main">{iface}</h3>
                        </div>
                        <button 
                            onClick={() => removeGraph(iface)}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-md"
                        >
                            <span className="text-lg">×</span>
                        </button>
                    </div>
                    <div className="h-[150px]">
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
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="time" hide />
                                <YAxis 
                                    tickFormatter={(val) => `${val.toFixed(1)}M`} 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fill: '#6b7280', fontSize: 9}} 
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }}
                                    formatter={(val: number) => [`${val.toFixed(2)} Mb/s`]}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="rx" 
                                    stroke="#3b82f6" 
                                    strokeWidth={1.5}
                                    fill={`url(#gradRx-${iface})`} 
                                    isAnimationActive={false}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="tx" 
                                    stroke="#10b981" 
                                    strokeWidth={1.5}
                                    fill={`url(#gradTx-${iface})`} 
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ))}
            {activeGraphs.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                    <p className="text-gray-500 text-[10px] font-medium">No active graphs. Add one to monitor traffic.</p>
                </div>
            )}
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-xs font-bold text-main">Active Sessions</h3>
          <span className="bg-green-100 text-green-700 text-[8px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">Live</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-500 text-[9px] uppercase font-medium tracking-wide">
              <tr>
                <th className="px-4 py-2">MAC</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Time Remaining</th>
                <th className="px-4 py-2">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sessions.length > 0 ? sessions.map((s, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2 font-mono text-[10px] font-bold text-main">{s.mac}</td>
                  <td className="px-4 py-2 text-[10px] font-medium text-muted">{s.ip}</td>
                  <td className="px-4 py-2 text-[10px] font-bold text-blue-600">
                    {Math.floor(s.remainingSeconds / 60)}m {s.remainingSeconds % 60}s
                  </td>
                  <td className="px-4 py-2 text-[10px] font-medium text-muted">₱{s.totalPaid}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted text-[10px] font-medium uppercase tracking-wide">No active sessions</td>
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
    <div className="min-w-0">
        <span className="block text-[10px] font-medium text-muted uppercase tracking-wide mb-1 truncate">{label}</span>
        <span className="block text-sm font-bold text-main truncate">{value}</span>
    </div>
);

export default Analytics;
