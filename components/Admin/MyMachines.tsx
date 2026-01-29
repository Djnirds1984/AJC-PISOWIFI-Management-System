import React, { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';
import { VendorMachine } from '../../types';

export const MyMachines: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [machineStatus, setMachineStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      // Don't set loading to true on background refreshes to avoid flicker
      if (!machineStatus) setLoading(true);
      const status = await apiClient.getMachineStatus();
      setMachineStatus(status);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching machine status:', err);
      // Only set error if we don't have data yet
      if (!machineStatus) setError(err.message || 'Failed to fetch machine status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading && !machineStatus) {
    return (
      <div className="max-w-7xl mx-auto p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Initializing Machine Link...</p>
        </div>
      </div>
    );
  }

  if (error && !machineStatus) {
    return (
      <div className="max-w-7xl mx-auto p-4 flex items-center justify-center min-h-[400px]">
        <div className="text-center bg-white p-6 rounded-xl border border-red-100 shadow-sm max-w-sm">
          <div className="text-2xl mb-2">⚠️</div>
          <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-4">{error}</p>
          <button onClick={fetchStatus} className="w-full py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all">Retry Link</button>
        </div>
      </div>
    );
  }

  const { hardwareId, vendorId, metrics } = machineStatus || {};
  const isPending = !vendorId;

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* Current Machine Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg text-white ${isPending ? 'bg-amber-500' : 'bg-emerald-500'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div>
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none">Local Machine Identity</h3>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-1">Hardware Bus v2.1</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
              isPending ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
            }`}>
              {isPending ? 'Activation Required' : 'Verified System'}
            </div>
            {!isPending && (
              <div className="text-[8px] font-black text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded uppercase">
                Vendor: <span className="font-mono text-slate-900">{vendorId}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-900 rounded-lg p-3 text-white border border-white/5">
            <div className="flex-1">
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Hardware ID (System UUID)</div>
              <div className="text-sm font-black tracking-widest font-mono text-blue-400 break-all">
                {hardwareId}
              </div>
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(hardwareId);
                alert('Hardware ID copied to clipboard');
              }}
              className="px-3 py-1.5 rounded bg-white/10 text-[9px] font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2 shrink-0"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy ID
            </button>
          </div>

          {isPending && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 flex gap-3">
              <div className="text-amber-500 shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h4 className="text-[9px] font-black text-amber-900 uppercase tracking-tight">Activation Pending</h4>
                <p className="text-[8px] text-amber-800/70 font-bold uppercase tracking-tighter leading-normal mt-0.5">
                  Link this Hardware ID to your vendor account in the cloud dashboard to enable remote monitoring and management.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { 
                label: 'CPU Temperature', 
                value: metrics?.cpuTemp ? `${metrics.cpuTemp.toFixed(1)}°C` : 'N/A', 
                color: 'blue', 
                icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
              },
              { 
                label: 'System Uptime', 
                value: metrics?.uptime ? formatUptime(metrics.uptime) : 'N/A', 
                color: 'emerald', 
                icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
              },
              { 
                label: 'Active Sessions', 
                value: metrics?.activeSessions ?? 0, 
                color: 'indigo', 
                icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z'
              }
            ].map((stat) => (
              <div key={stat.label} className={`bg-${stat.color}-50 border border-${stat.color}-100 rounded-lg p-3 flex flex-col justify-between h-20`}>
                <div className={`text-${stat.color}-600 text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={stat.icon} />
                  </svg>
                  {stat.label}
                </div>
                <div className="text-xl font-black text-slate-900 tracking-tighter">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
