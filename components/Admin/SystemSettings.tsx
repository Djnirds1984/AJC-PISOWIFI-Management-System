import React, { useState, useEffect } from 'react';

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
    // Simulate fetching system stats
    const timer = setTimeout(() => {
      setSystemStats({
        uptime: '12d 4h 32m',
        memory: '512MB / 2GB (25%)',
        cpu: '15% Load',
        disk: '1.2GB / 16GB used'
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleReset = async () => {
    if (confirmText !== 'FACTORY RESET') return;
    
    setIsResetting(true);
    setShowConfirm(false);
    
    try {
      const res = await fetch('/api/system/reset', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data.success) {
        alert('System successfully reset. Application will now refresh to initial state.');
        window.location.href = '/';
      } else {
        alert('Reset failed: ' + (data.error || 'Unknown server error'));
      }
    } catch (e) {
      console.error('Reset fetch error:', e);
      alert('Network error during reset. Check if the server crashed.');
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

export default SystemSettings;