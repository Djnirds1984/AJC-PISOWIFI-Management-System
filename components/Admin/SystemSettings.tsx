import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';

const SystemSettings: React.FC = () => {
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [systemStats, setSystemStats] = useState({
    uptime: 'Loading...',
    memory: 'Loading...',
    cpu: 'Loading...',
    disk: 'Loading...'
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await apiClient.getSystemStats();
        setSystemStats({
          uptime: 'System Online',
          memory: `${(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)}GB / ${(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)}GB (${stats.memory.percentage}%)`,
          cpu: `${stats.cpu.load}% Load`,
          disk: `${(stats.storage.used / 1024 / 1024 / 1024).toFixed(1)}GB / ${(stats.storage.total / 1024 / 1024 / 1024).toFixed(1)}GB`
        });
      } catch (e) {
        console.error('Failed to fetch system stats', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    if (confirmText !== 'FACTORY RESET') return;
    
    setIsResetting(true);
    setShowConfirm(false);
    
    try {
      await apiClient.factoryReset();
      alert('System successfully reset. Application will now refresh to initial state.');
      window.location.href = '/';
    } catch (e: any) {
      console.error('Reset fetch error:', e);
      alert('Reset failed: ' + (e.message || 'Unknown server error'));
    } finally {
      setIsResetting(false);
      setConfirmText('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* System Diagnostics Card */}
      <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">System Diagnostics</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Live Hardware Monitor</p>
          </div>
          <div className="flex gap-2">
            <span className="bg-green-100 text-green-600 text-[8px] font-black px-2 py-1 rounded-md uppercase">Kernel: 5.15.0-v8+</span>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
          <DiagItem label="Uptime" value={systemStats.uptime} icon="⏱️" />
          <DiagItem label="Memory" value={systemStats.memory} icon="🧠" />
          <DiagItem label="CPU Usage" value={systemStats.cpu} icon="📟" />
          <DiagItem label="Storage" value={systemStats.disk} icon="💾" />
        </div>
      </section>

      {/* Security Settings Card */}
      <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden p-8">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Admin Security</h3>
        <ChangePasswordForm />
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-red-50/30">
          <h3 className="text-xs font-black text-red-600 uppercase tracking-widest">Danger Zone</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Irreversible System Actions</p>
        </div>
        
        <div className="p-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 bg-red-50 rounded-3xl border border-red-100">
            <div className="flex-1">
              <h4 className="text-sm font-black text-red-900 uppercase tracking-tight">Factory Reset System</h4>
              <p className="text-[10px] text-red-700/70 font-bold mt-2 leading-relaxed uppercase tracking-tight">
                This will wipe all network configurations, bridges, VLAN tags, pricing rates, and active user sessions. 
                The system kernel networking state will be flushed and restored to hardware defaults.
              </p>
            </div>
            <button 
              onClick={() => setShowConfirm(true)}
              disabled={isResetting}
              className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-red-600/20 hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {isResetting ? 'Wiping Engine...' : 'Wipe System'}
            </button>
          </div>
        </div>
      </section>

      {/* Manual Controls Card */}
      <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Service Management</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <ServiceButton label="Restart App" icon="🔄" />
           <ServiceButton label="Clear Logs" icon="🧹" />
           <ServiceButton label="Export DB" icon="💾" />
           <ServiceButton label="Kernel Check" icon="🔬" />
        </div>
      </section>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-10 text-center shadow-2xl animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">⚠️</div>
            <h3 className="text-xl font-black text-slate-900 uppercase">Absolute Confirmation</h3>
            <p className="text-xs text-slate-500 font-bold mt-4 uppercase leading-relaxed">
              To proceed with wiping all AJC PISOWIFI settings, type <span className="text-red-600 font-black">FACTORY RESET</span> below.
            </p>
            
            <input 
              type="text" 
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full mt-6 bg-slate-50 border-2 border-slate-200 rounded-2xl px-6 py-4 text-center font-black text-sm outline-none focus:border-red-600 transition-all uppercase"
              placeholder="Type here..."
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3 mt-8">
              <button 
                onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                className="bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Abort
              </button>
              <button 
                onClick={handleReset}
                disabled={confirmText !== 'FACTORY RESET'}
                className="bg-red-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-red-600/20 disabled:opacity-30"
              >
                Execute Wipe
              </button>
            </div>
          </div>
        </div>
      )}

      {isResetting && (
        <div className="fixed inset-0 z-[300] bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mb-6"></div>
          <p className="text-white font-black text-xs uppercase tracking-[0.3em] mb-2">Restoring Kernel State...</p>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">Applying network flush and database truncate</p>
        </div>
      )}
    </div>
  );
};

const DiagItem: React.FC<{ label: string; value: string; icon: string }> = ({ label, value, icon }) => (
  <div className="p-6 flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <span className="text-sm">{icon}</span>
      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    </div>
    <span className="text-xs font-black text-slate-800 tracking-tight">{value}</span>
  </div>
);

const ServiceButton: React.FC<{ label: string; icon: string }> = ({ label, icon }) => (
  <button className="bg-slate-50 border border-slate-200 p-6 rounded-3xl flex flex-col items-center gap-3 hover:bg-white hover:shadow-lg transition-all active:scale-95 group">
    <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
  </button>
);

const ChangePasswordForm: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await apiClient.changePassword(oldPassword, newPassword);
      setMessage('✅ Password updated successfully');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      setMessage(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Password</label>
        <input 
          type="password" 
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          placeholder="••••••••"
        />
      </div>
      <div>
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">New Password</label>
        <input 
          type="password" 
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
          placeholder="••••••••"
        />
      </div>
      {message && <p className="text-xs font-bold">{message}</p>}
      <button 
        type="submit" 
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 disabled:opacity-50"
      >
        {loading ? 'Updating...' : 'Update Password'}
      </button>
    </form>
  );
};

export default SystemSettings;