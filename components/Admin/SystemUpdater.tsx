import React, { useState, useRef } from 'react';

const SystemUpdater: React.FC = () => {
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [isUpdateLoading, setIsUpdateLoading] = useState(false);
  
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsBackupLoading(true);
    try {
      // Trigger download using a temporary anchor tag to allow auth headers if needed (though browser download usually uses cookies)
      // Since we use Bearer token in headers for API, we might need a way to pass it for download.
      // However, usually downloads are GET requests. If requireAdmin checks header, window.location won't work easily if auth is only in header.
      // Let's check how requireAdmin works. It checks `req.headers.authorization`.
      // Browser navigation doesn't send custom headers.
      // WE NEED A WORKAROUND:
      // 1. Pass token in query param? (Less secure but common for downloads)
      // 2. Fetch blob and download? (Better)
      
      const token = localStorage.getItem('ajc_admin_token');
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/system/backup', {
          headers
      });

      if (!res.ok) throw new Error('Backup failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Get filename from header if possible, or generate one
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'backup.nxs';
      if (contentDisposition) {
          const match = contentDisposition.match(/filename=(.+)/);
          if (match) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      console.error(error);
      alert('Backup failed');
    } finally {
        setIsBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    const file = restoreFileRef.current?.files?.[0];
    if (!file) {
      alert('Please select a .nxs backup file first');
      return;
    }

    if (!confirm('WARNING: This will overwrite the entire system database and configuration. This action cannot be undone. Are you sure?')) {
        return;
    }

    setIsRestoreLoading(true);
    try {
        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem('ajc_admin_token');
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/system/restore', {
            method: 'POST',
            headers,
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('System restore initiated. The system will restart automatically.');
            window.location.reload();
        } else {
            throw new Error(data.error || 'Restore failed');
        }
    } catch (error: any) {
        alert(error.message);
    } finally {
        setIsRestoreLoading(false);
    }
  };

  const handleUpdate = async () => {
    const file = updateFileRef.current?.files?.[0];
    if (!file) {
      alert('Please select a .nxs update file first');
      return;
    }

    setIsUpdateLoading(true);
    try {
        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem('ajc_admin_token');
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/system/update', {
            method: 'POST',
            headers,
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('System update initiated. The system will restart automatically.');
            window.location.reload();
        } else {
            throw new Error(data.error || 'Update failed');
        }
    } catch (error: any) {
        alert(error.message);
    } finally {
        setIsUpdateLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* Backup Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">System Backup</h3>
            <p className="text-sm text-slate-500">Download a full system backup (.nxs file) including database and configuration.</p>
          </div>
        </div>
        
        <button
          onClick={handleBackup}
          disabled={isBackupLoading}
          className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
        >
          {isBackupLoading ? 'Creating Backup...' : 'Download Backup (.nxs)'}
        </button>
      </div>

      {/* Restore Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
             </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">System Restore</h3>
            <p className="text-sm text-slate-500">Restore the system from a previous backup (.nxs file). This will overwrite the database.</p>
          </div>
        </div>

        <div className="flex gap-4 items-end">
            <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Backup File (.nxs)</label>
                <input 
                    type="file" 
                    ref={restoreFileRef}
                    accept=".nxs"
                    className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-xs file:font-semibold
                    file:bg-amber-50 file:text-amber-700
                    hover:file:bg-amber-100
                    cursor-pointer"
                />
            </div>
            <button
            onClick={handleRestore}
            disabled={isRestoreLoading}
            className="bg-amber-600 text-white px-6 py-2 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-amber-700 transition-all shadow-md disabled:opacity-50"
            >
            {isRestoreLoading ? 'Restoring...' : 'Restore System'}
            </button>
        </div>
      </div>

      {/* Update Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">System Update</h3>
            <p className="text-sm text-slate-500">Update the system software using a provided update package (.nxs). Database will be preserved.</p>
          </div>
        </div>

        <div className="flex gap-4 items-end">
            <div className="flex-1">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Update Package (.nxs)</label>
                <input 
                    type="file" 
                    ref={updateFileRef}
                    accept=".nxs"
                    className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-xs file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100
                    cursor-pointer"
                />
            </div>
            <button
            onClick={handleUpdate}
            disabled={isUpdateLoading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold text-sm uppercase tracking-wide hover:bg-blue-700 transition-all shadow-md disabled:opacity-50"
            >
            {isUpdateLoading ? 'Updating...' : 'Update System'}
            </button>
        </div>
      </div>

    </div>
  );
};

export default SystemUpdater;
