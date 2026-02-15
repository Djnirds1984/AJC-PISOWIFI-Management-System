import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
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
  const [pppoeOnline, setPppoeOnline] = useState<number>(0);
  const [machineMetrics, setMachineMetrics] = useState<{ cpuTemp?: number; uptime?: number; storageUsed?: number; storageTotal?: number } | null>(null);
  const [cpuHistory, setCpuHistory] = useState<{ time: string; load: number }[]>([]);

  useEffect(() => {
    // Fetch available interfaces and system info once on mount
    const fetchInitData = async () => {
      try {
        const [ifaceData, infoData, pppoeData, machineData] = await Promise.all([
          apiClient.getSystemInterfaces(),
          apiClient.getSystemInfo(),
          apiClient.getPPPoESessions().catch(() => []),
          apiClient.getMachineStatus().catch(() => null)
        ]);
        
        setAvailableInterfaces(ifaceData);
        setSysInfo(infoData);
        setPppoeOnline(Array.isArray(pppoeData) ? pppoeData.length : 0);
        if (machineData && machineData.metrics) {
          const m = machineData.metrics;
          setMachineMetrics({
            cpuTemp: m.cpuTemp ?? m.cpu_temp,
            uptime: m.uptime ?? m.uptime_seconds,
            storageUsed: m.storageUsed ?? m.storage_used,
            storageTotal: m.storageTotal ?? m.storage_total
          });
        }
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
        setCpuHistory(prev => [...prev, { time: now, load: data.cpu?.load || 0 }].slice(-30));
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

  const aggHistory = useMemo(() => {
    const times: string[] = [];
    Object.values(history).forEach(arr => arr.forEach(p => { if (!times.includes(p.time)) times.push(p.time); }));
    return times.map(t => {
      let rx = 0;
      let tx = 0;
      Object.values(history).forEach(arr => {
        const found = arr.find(p => p.time === t);
        if (found) {
          rx += found.rx;
          tx += found.tx;
        }
      });
      return { time: t, rx, tx };
    });
  }, [history]);

  const sumRevenue = (range: 'today' | '7d' | 'month' | 'year') => {
    const now = new Date();
    return sessions
      .filter(s => {
        const d = new Date(s.connectedAt);
        if (range === 'today') {
          return d.toDateString() === now.toDateString();
        }
        if (range === '7d') {
          const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
          return diff <= 7;
        }
        if (range === 'month') {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        return d.getFullYear() === now.getFullYear();
      })
      .reduce((acc, s) => acc + (s.totalPaid || 0), 0);
  };

  const hotspotConnected = sessions.filter(s => !s.isPaused && s.remainingSeconds > 0).length;
  const hotspotPaused = sessions.filter(s => s.isPaused).length;
  const hotspotDisconnected = 0;

  if (!stats) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
        <div className="animate-spin text-4xl mb-4">⚙️</div>
        <p className="text-xs font-black uppercase tracking-widest">Loading System Stats...</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Info</h3>
              <div className="text-sm font-black text-slate-800 mt-0.5">{sysInfo ? `${sysInfo.manufacturer} ${sysInfo.model}` : 'Device'}</div>
              <div className="text-[10px] font-bold text-slate-500 mt-0.5">{sysInfo ? `${sysInfo.distro} / ${sysInfo.arch}` : ''}</div>
            </div>
            <div className="bg-slate-100 text-slate-700 p-2 rounded-lg">🖥️</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatItem label="CPU Temp" value={`${(stats.cpu?.temp ?? machineMetrics?.cpuTemp ?? 0).toFixed ? (stats.cpu?.temp ?? machineMetrics?.cpuTemp ?? 0).toFixed(1) : stats.cpu?.temp ?? machineMetrics?.cpuTemp ?? 'N/A'}°C`} />
            <StatItem label="RAM Usage" value={`${((stats.memory.used / stats.memory.total) * 100).toFixed(1)}%`} />
            <StatItem label="Storage" value={
              machineMetrics?.storageTotal && machineMetrics?.storageUsed !== undefined
                ? `Used: ${((machineMetrics.storageUsed / 1024 / 1024 / 1024)).toFixed(1)} / ${(machineMetrics.storageTotal / 1024 / 1024 / 1024).toFixed(1)} GB`
                : 'N/A'
            } />
            <StatItem label="Uptime" value={
              machineMetrics?.uptime
                ? (() => { const s = machineMetrics.uptime as number; const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); return d > 0 ? `${d}d ${h}h` : `${h}h`; })()
                : 'N/A'
            } />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">CPU Usage</h3>
              <div className="text-sm font-black text-slate-800 mt-0.5">AVG</div>
            </div>
            <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">⚡</div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.cpu?.load || 0}%` }}></div>
            </div>
            <div className="text-[10px] font-bold text-slate-600">{stats.cpu?.load?.toFixed(1) || 0}%</div>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuHistory}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" hide />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9}} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }} formatter={(val: number) => [`${val.toFixed(1)}%`]} />
                <Line type="monotone" dataKey="load" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
            <StatItem label="Cores" value={stats.cpu?.cores?.toString() || 'N/A'} />
            <StatItem label="Speed" value={`${stats.cpu?.speed || 'N/A'} GHz`} />
            <StatItem label="Brand" value={stats.cpu?.brand || 'CPU'} />
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Clients Status</h3>
            </div>
            <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">👥</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Hotspot</div>
              <div className="grid grid-cols-3 gap-2">
                <StatItem label="Connected" value={String(hotspotConnected)} />
                <StatItem label="Paused" value={String(hotspotPaused)} />
                <StatItem label="Disconnected" value={String(hotspotDisconnected)} />
              </div>
            </div>
            <div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">PPPoE</div>
              <div className="grid grid-cols-3 gap-2">
                <StatItem label="Online" value={String(pppoeOnline)} />
                <StatItem label="Offline" value="0" />
                <StatItem label="Expired" value="0" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RevenueCard title="Daily Revenue" amount={sumRevenue('today')} subtitle="Today" />
        <RevenueCard title="Weekly Revenue" amount={sumRevenue('7d')} subtitle="Last 7 Days" />
        <RevenueCard title="Monthly Revenue" amount={sumRevenue('month')} subtitle="This Month" />
        <RevenueCard title="Yearly Revenue" amount={sumRevenue('year')} subtitle="This Year" />
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Traffic Overview</div>
            <div className="text-[10px] font-bold text-slate-500">All Interfaces (Aggregate)</div>
          </div>
        </div>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={aggHistory}>
              <defs>
                <linearGradient id={`gradRx-agg`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id={`gradTx-agg`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" hide />
              <YAxis tickFormatter={(val) => `${Number(val).toFixed(1)}M`} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9}} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '10px' }} formatter={(val: number) => [`${val.toFixed(2)} Mb/s`]} />
              <Area type="monotone" dataKey="rx" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#gradRx-agg)`} isAnimationActive={false} />
              <Area type="monotone" dataKey="tx" stroke="#10b981" strokeWidth={1.5} fill={`url(#gradTx-agg)`} isAnimationActive={false} />
              <Legend />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top Vendo</div>
            <select className="text-[10px] border border-slate-200 rounded-md px-2 py-1">
              <option>This Month</option>
              <option>Today</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm font-black text-slate-800">Main Vendo</div>
            <div className="text-sm font-black text-slate-800">₱{sumRevenue('month').toFixed(2)}</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Top 5 Clients by Sales</div>
            <select className="text-[10px] border border-slate-200 rounded-md px-2 py-1">
              <option>This Month</option>
              <option>Today</option>
            </select>
          </div>
          <div className="space-y-2">
            {sessions
              .slice()
              .sort((a, b) => (b.totalPaid || 0) - (a.totalPaid || 0))
              .slice(0, 5)
              .map((s, idx) => (
                <div key={idx} className="flex items-center justify-between border border-slate-100 rounded-lg p-2">
                  <div className="text-[10px] font-bold text-slate-600">User: {s.mac}</div>
                  <div className="text-[10px] font-black text-slate-800">₱{(s.totalPaid || 0).toFixed(2)}</div>
                </div>
              ))
            }
            {sessions.length === 0 && (
              <div className="text-center text-[10px] font-bold text-slate-400">No data</div>
            )}
          </div>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-800">Active Sessions</h3>
          <span className="bg-green-100 text-green-700 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Live</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[9px] uppercase font-bold tracking-wider">
              <tr>
                <th className="px-4 py-2">MAC</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Time Remaining</th>
                <th className="px-4 py-2">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length > 0 ? sessions.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2 font-mono text-[10px] font-bold text-slate-700">{s.mac}</td>
                  <td className="px-4 py-2 text-[10px] font-bold text-slate-500">{s.ip}</td>
                  <td className="px-4 py-2 text-[10px] font-black text-blue-600">
                    {Math.floor(s.remainingSeconds / 60)}m {s.remainingSeconds % 60}s
                  </td>
                  <td className="px-4 py-2 text-[10px] font-bold text-slate-600">₱{s.totalPaid}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">No active sessions</td>
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
        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate">{label}</span>
        <span className="block text-sm font-bold text-slate-700 truncate">{value}</span>
    </div>
);

const RevenueCard: React.FC<{ title: string; amount: number; subtitle: string }> = ({ title, amount, subtitle }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</div>
    <div className="text-2xl font-black text-slate-800">₱{amount.toFixed(2)}</div>
    <div className="text-[10px] font-bold text-slate-400 mt-1">{subtitle}</div>
  </div>
);

export default Analytics;
