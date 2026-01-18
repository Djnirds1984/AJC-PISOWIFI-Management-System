
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { UserSession, AnalyticsData } from '../../types';

const data: AnalyticsData[] = [
  { date: '2023-10-01', earnings: 120, users: 15 },
  { date: '2023-10-02', earnings: 450, users: 42 },
  { date: '2023-10-03', earnings: 300, users: 28 },
  { date: '2023-10-04', earnings: 600, users: 55 },
  { date: '2023-10-05', earnings: 850, users: 70 },
  { date: '2023-10-06', earnings: 400, users: 35 },
  { date: '2023-10-07', earnings: 950, users: 82 },
];

const Analytics: React.FC<{ sessions: UserSession[] }> = ({ sessions }) => {
  const totalEarnings = data.reduce((acc, curr) => acc + curr.earnings, 0);
  
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Total Monthly Earnings" value={`₱${totalEarnings.toLocaleString()}`} icon="💰" color="text-green-600" />
        <StatCard title="Active Users" value={sessions.length.toString()} icon="👥" color="text-blue-600" />
        <StatCard title="System Uptime" value="12d 4h 32m" icon="⏱️" color="text-purple-600" />
      </div>

      {/* Chart */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6">Earnings Overview</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" hide />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <Area 
                type="monotone" 
                dataKey="earnings" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorEarnings)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Active Sessions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Active Sessions</h3>
          <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">REAL-TIME</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
              <tr>
                <th className="px-6 py-3">MAC Address</th>
                <th className="px-6 py-3">IP Address</th>
                <th className="px-6 py-3">Remaining Time</th>
                <th className="px-6 py-3">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length > 0 ? sessions.map((s, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm">{s.mac}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{s.ip}</td>
                  <td className="px-6 py-4 text-sm font-medium text-blue-600">
                    {Math.floor(s.remainingSeconds / 60)}m {s.remainingSeconds % 60}s
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">₱{s.totalPaid}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400 text-sm">No active sessions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; icon: string; color: string }> = ({ 
  title, value, icon, color 
}) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
    <div>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
      <h4 className={`text-2xl font-bold ${color}`}>{value}</h4>
    </div>
    <div className="text-2xl opacity-80">{icon}</div>
  </div>
);

export default Analytics;
