import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';

interface LicenseStatus {
  hardwareId: string;
  isLicensed: boolean;
  isRevoked?: boolean;
  licenseKey?: string;
  trial: {
    isActive: boolean;
    hasEnded: boolean;
    daysRemaining: number;
    expiresAt: string | null;
  };
  canOperate: boolean;
}

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
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);

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

    const fetchLicenseStatus = async () => {
      try {
        const res = await fetch('/api/license/status');
        const data = await res.json();
        setLicenseStatus(data);
      } catch (e) {
        console.error('Failed to fetch license status', e);
      }
    };

    fetchStats();
    fetchLicenseStatus();
    
    const interval = setInterval(fetchStats, 5000);
    const licenseInterval = setInterval(fetchLicenseStatus, 30000);
    
    return () => {
      clearInterval(interval);
      clearInterval(licenseInterval);
    };
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

  const handleServiceAction = async (action: string) => {
    if (action === 'export-db') {
        window.open('/api/system/export-db', '_blank');
        return;
    }

    if (!confirm(`Are you sure you want to ${action.replace('-', ' ')}?`)) return;
    
    try {
      let endpoint = '';
      let method = 'POST';
      
      switch (action) {
        case 'restart': endpoint = '/api/system/restart'; break;
        case 'clear-logs': endpoint = '/api/system/clear-logs'; break;
        case 'sync': endpoint = '/api/system/sync'; break;
        case 'kernel-check': 
          endpoint = '/api/system/kernel-check'; 
          method = 'GET';
          break;
      }
      
      const res = await fetch(endpoint, { method });
      const data = await res.json();
      
      if (data.success) {
        if (action === 'kernel-check' && data.kernel) {
            alert(`Kernel Version: ${data.kernel}`);
        } else {
            alert(data.message || 'Action completed successfully');
        }
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e: any) {
      alert('Failed: ' + e.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-10">
      {/* License Status Card */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-blue-50/30 flex justify-between items-center">
          <div>
            <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest">License & Trial Status</h3>
          </div>
          {licenseStatus && (
            <div className="flex gap-2">
              {licenseStatus.isRevoked ? (
                <span className="bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded font-bold uppercase animate-pulse">Revoked</span>
              ) : licenseStatus.isLicensed ? (
                <span className="bg-green-100 text-green-600 text-[8px] font-black px-2 py-1 rounded font-bold uppercase">Licensed</span>
              ) : licenseStatus.trial.isActive ? (
                <span className="bg-yellow-100 text-yellow-600 text-[8px] font-black px-2 py-1 rounded font-bold uppercase">
                  Trial: {licenseStatus.trial.daysRemaining}d
                </span>
              ) : (
                <span className="bg-red-100 text-red-600 text-[8px] font-black px-2 py-1 rounded font-bold uppercase">Expired</span>
              )}
            </div>
          )}
        </div>
        <div className="p-4">
          <LicenseActivation licenseStatus={licenseStatus} onActivated={() => {
            fetch('/api/license/status')
              .then(res => res.json())
              .then(data => setLicenseStatus(data))
              .catch(e => console.error('Failed to refresh license status', e));
          }} />
        </div>
      </section>

      {/* System Diagnostics Card */}
      <section className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${licenseStatus?.isRevoked ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Diagnostics</h3>
          <span className="bg-green-100 text-green-600 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase">Kernel: 5.15.0</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
          <DiagItem label="Uptime" value={systemStats.uptime} icon="⏱️" />
          <DiagItem label="Memory" value={systemStats.memory} icon="🧠" />
          <DiagItem label="CPU" value={systemStats.cpu} icon="📟" />
          <DiagItem label="Storage" value={systemStats.disk} icon="💾" />
        </div>
      </section>

      {/* Security & Service Controls */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 transition-all ${licenseStatus?.isRevoked ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
        {/* Security Settings Card */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Admin Security</h3>
          <ChangePasswordForm />
        </section>

        {/* Manual Controls Card */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Service Management</h3>
          <div className="grid grid-cols-2 gap-2">
             <ServiceButton label="Restart App" icon="🔄" onClick={() => handleServiceAction('restart')} />
             <ServiceButton label="Clear Logs" icon="🧹" onClick={() => handleServiceAction('clear-logs')} />
             <ServiceButton label="Export DB" icon="💾" onClick={() => handleServiceAction('export-db')} />
             <ServiceButton label="Kernel Check" icon="🔬" onClick={() => handleServiceAction('kernel-check')} />
             <div className="col-span-2 mt-2">
                <button 
                  onClick={() => handleServiceAction('sync')}
                  className="w-full bg-indigo-600 text-white p-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 hover:shadow-lg transition-all active:scale-95 group shadow-indigo-200"
                >
                   <span className="text-lg group-hover:rotate-180 transition-transform duration-500">♻️</span>
                   <span className="text-[10px] font-black uppercase tracking-widest">Sync & Save Settings</span>
                </button>
             </div>
          </div>
        </section>
      </div>

      <LogTerminal />

      <section className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all ${licenseStatus?.isRevoked ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
        <div className="px-4 py-2 border-b border-slate-100 bg-red-50/30">
          <h3 className="text-[10px] font-black text-red-600 uppercase tracking-widest">Danger Zone</h3>
        </div>
        
        <div className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-red-50 rounded-xl border border-red-100">
            <div className="flex-1">
              <h4 className="text-xs font-black text-red-900 uppercase">Factory Reset System</h4>
              <p className="text-[9px] text-red-700/70 font-bold mt-1 uppercase tracking-tight">
                Wipe all configurations and user sessions. This action is irreversible.
              </p>
            </div>
            <button 
              onClick={() => setShowConfirm(true)}
              disabled={isResetting}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest shadow-md shadow-red-600/10 hover:bg-red-700 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {isResetting ? 'Wiping...' : 'Wipe System'}
            </button>
          </div>
        </div>
      </section>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl border border-slate-200">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl">⚠️</div>
            <h3 className="text-sm font-black text-slate-900 uppercase">Confirm Wipe</h3>
            <p className="text-[10px] text-slate-500 font-bold mt-2 uppercase leading-relaxed">
              Type <span className="text-red-600 font-black">FACTORY RESET</span> to proceed.
            </p>
            
            <input 
              type="text" 
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full mt-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-center font-black text-sm outline-none focus:border-red-600 transition-all uppercase"
              placeholder="..."
              autoFocus
            />

            <div className="grid grid-cols-2 gap-2 mt-6">
              <button 
                onClick={() => { setShowConfirm(false); setConfirmText(''); }}
                className="bg-slate-100 text-slate-600 py-2.5 rounded-lg font-black text-[10px] uppercase"
              >
                Abort
              </button>
              <button 
                onClick={handleReset}
                disabled={confirmText !== 'FACTORY RESET'}
                className="bg-red-600 text-white py-2.5 rounded-lg font-black text-[10px] uppercase shadow-md shadow-red-600/10 disabled:opacity-30"
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {isResetting && (
        <div className="fixed inset-0 z-[300] bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
          <p className="text-white font-black text-[10px] uppercase tracking-widest">Restoring Kernel State...</p>
        </div>
      )}
    </div>
  );
};

const DiagItem: React.FC<{ label: string; value: string; icon: string }> = ({ label, value, icon }) => (
  <div className="p-3 flex flex-col gap-1">
    <div className="flex items-center gap-1.5">
      <span className="text-xs">{icon}</span>
      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-[10px] font-black text-slate-800 tracking-tight">{value}</span>
  </div>
);

const ServiceButton: React.FC<{ label: string; icon: string; onClick?: () => void }> = ({ label, icon, onClick }) => (
  <button 
    onClick={onClick}
    className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col items-center gap-1.5 hover:bg-white hover:shadow-md transition-all active:scale-95 group"
  >
    <span className="text-lg group-hover:scale-110 transition-transform">{icon}</span>
    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
  </button>
);

const LogTerminal: React.FC = () => {
  const [logs, setLogs] = useState('Loading logs...');
  
  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/system/logs');
      const data = await res.json();
      setLogs(data.logs);
    } catch (e) {
      setLogs('Failed to load logs.');
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mt-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Logs</h3>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
        </div>
      </div>
      <div className="font-mono text-[9px] text-green-400 h-48 overflow-auto whitespace-pre-wrap leading-tight opacity-90">
        {logs}
      </div>
    </div>
  );
};

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
      setMessage('✅ Updated');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      setMessage(err.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleChangePassword} className="space-y-3">
      <div>
        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Current</label>
        <input 
          type="password" 
          value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          placeholder="••••••••"
        />
      </div>
      <div>
        <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">New</label>
        <input 
          type="password" 
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
          placeholder="••••••••"
        />
      </div>
      {message && <p className="text-[10px] font-bold">{message}</p>}
      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest shadow-md shadow-blue-600/10 disabled:opacity-50"
      >
        {loading ? '...' : 'Update Password'}
      </button>
    </form>
  );
};

const LicenseActivation: React.FC<{ licenseStatus: LicenseStatus | null; onActivated: () => void }> = ({ licenseStatus, onActivated }) => {
  const [licenseKey, setLicenseKey] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: licenseKey.trim() })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setMessage('✅ ' + data.message);
        setLicenseKey('');
        onActivated();
        
        // Show success alert
        setTimeout(() => {
          alert('License activated successfully! Please restart the system for changes to take effect.');
        }, 500);
      } else {
        setMessage('❌ ' + data.error);
      }
    } catch (err: any) {
      setMessage('❌ Activation failed: ' + (err.message || 'Network error'));
    } finally {
      setLoading(false);
    }
  };

  if (!licenseStatus) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[10px] text-slate-500 font-bold uppercase">Loading License Status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hardware ID Display */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Hardware ID</label>
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono font-bold text-slate-800">
            {licenseStatus.hardwareId}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(licenseStatus.hardwareId);
              alert('Hardware ID copied to clipboard!');
            }}
            className="bg-slate-600 text-white px-4 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-700 active:scale-95 transition-all"
          >
            Copy
          </button>
        </div>
        <p className="text-[9px] text-slate-500 font-bold uppercase mt-2">
          Provide this ID to your vendor when requesting a license key
        </p>
      </div>

      {/* Status Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">License Status</p>
          <p className={`text-sm font-black uppercase ${licenseStatus.isLicensed ? 'text-green-600' : 'text-slate-500'}`}>
            {licenseStatus.isLicensed ? '✓ ACTIVE' : 'Not Activated'}
          </p>
        </div>
        
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Trial Status</p>
          <p className={`text-sm font-black uppercase ${licenseStatus.trial.isActive ? 'text-yellow-600' : licenseStatus.trial.hasEnded ? 'text-red-600' : 'text-slate-500'}`}>
            {licenseStatus.trial.isActive ? `${licenseStatus.trial.daysRemaining} Days Left` : licenseStatus.trial.hasEnded ? 'Expired' : 'N/A'}
          </p>
        </div>
        
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Can Operate</p>
          <p className={`text-sm font-black uppercase ${licenseStatus.canOperate ? 'text-green-600' : 'text-red-600'}`}>
            {licenseStatus.canOperate ? '✓ YES' : '✗ NO'}
          </p>
        </div>
      </div>

      {/* Activation Form - Only show if not licensed */}
      {!licenseStatus.isLicensed && (
        <form onSubmit={handleActivate} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
              Enter License Key
            </label>
            <input 
              type="text" 
              value={licenseKey}
              onChange={e => setLicenseKey(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs uppercase"
              placeholder="AJC-XXXX-YYYY-ZZZZ"
              required
            />
          </div>
          
          {message && (
            <div className={`p-4 rounded-xl border text-xs font-bold ${
              message.startsWith('✅') 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {message}
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={loading || !licenseKey.trim()}
            className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'Activating...' : 'Activate License'}
          </button>
          
          <p className="text-[9px] text-slate-500 font-bold uppercase text-center leading-relaxed">
            Don't have a license key? Contact your vendor or check the SUPABASE_SETUP.md file for instructions.
          </p>
        </form>
      )}

      {/* Licensed Message */}
      {licenseStatus.isLicensed && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">✓</div>
          <p className="text-sm font-black text-green-900 uppercase tracking-tight mb-2">
            License Activated
          </p>
          {licenseStatus.licenseKey && (
            <div className="mb-4">
              <p className="text-[9px] text-green-700 font-bold uppercase mb-1">Active License Key</p>
              <code className="bg-white/50 border border-green-200 text-green-800 px-4 py-2 rounded-xl text-xs font-mono font-bold inline-block">
                {licenseStatus.licenseKey}
              </code>
            </div>
          )}
          <p className="text-[10px] text-green-700 font-bold uppercase">
            Your device is fully licensed and operational. Thank you for your support!
          </p>
        </div>
      )}
    </div>
  );
};

export default SystemSettings;