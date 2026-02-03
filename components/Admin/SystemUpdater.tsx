import React, { useState, useRef } from 'react';

const SystemUpdater: React.FC = () => {
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [isRestoreLoading, setIsRestoreLoading] = useState(false);
  const [isUpdateLoading, setIsUpdateLoading] = useState(false);
  const [restorePreview, setRestorePreview] = useState<{ name: string; size: number } | null>(null);
  
  const restoreFileRef = useRef<HTMLInputElement>(null);
  const updateFileRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const handleBackup = async () => {
    setIsBackupLoading(true);
    try {
      const token = localStorage.getItem('ajc_admin_token');
      if (!token) {
        alert('No admin token found. Please login to admin panel first.');
        setIsBackupLoading(false);
        return;
      }
      
      const headers: HeadersInit = {
        'Authorization': `Bearer ${token}`
      };

      const res = await fetch('/api/system/backup', {
          headers
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Backup failed with status ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const contentDisposition = res.headers.get('Content-Disposition');
      let filename = 'pisowifi-backup.nxs';
      if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          if (match) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert(`Backup created successfully! Size: ${formatFileSize(blob.size)}`);
      
    } catch (error) {
      console.error('Backup error:', error);
      alert('Backup failed: ' + (error as Error).message);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleFilePreview = async (file: File) => {
    // Set basic file info without parsing the zip contents
    // This avoids importing adm-zip in the frontend which causes build issues
    setRestorePreview({
      name: file.name,
      size: file.size
    });
    
    // Note: Full metadata parsing would require server-side processing
    // or using a browser-compatible zip library like JSZip
  };

  const handleRestore = async () => {
    const file = restoreFileRef.current?.files?.[0];
    if (!file) {
      alert('Please select a .nxs backup file first');
      return;
    }

    // Show confirmation with basic file info
    let confirmMsg = `WARNING: This will overwrite the entire system database and configuration.\n\n`;
    confirmMsg += `Selected Backup: ${restorePreview?.name}\n`;
    confirmMsg += `File Size: ${formatFileSize(restorePreview?.size || 0)}\n`;
    confirmMsg += `\nThis action cannot be undone. Are you sure?`;

    if (!confirm(confirmMsg)) {
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
            let successMsg = 'System restore initiated successfully!\n\n';
            if (data.backupInfo) {
              successMsg += `Restored from backup:\n`;
              successMsg += `- System: ${data.backupInfo.hostname}\n`;
              successMsg += `- Created: ${formatDate(data.backupInfo.timestamp)}\n`;
            }
            successMsg += `\nThe system will restart automatically.`;
            alert(successMsg);
            window.location.reload();
        } else {
            throw new Error(data.error || 'Restore failed');
        }
    } catch (error: any) {
        alert('Restore failed: ' + error.message);
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

    if (!confirm('This will update the system software. Your database and configuration will be preserved. Continue?')) {
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
            alert('System update initiated successfully!\n\nThe system will restart automatically.');
            window.location.reload();
        } else {
            throw new Error(data.error || 'Update failed');
        }
    } catch (error: any) {
        alert('Update failed: ' + error.message);
    } finally {
        setIsUpdateLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold mb-2">System Management</h1>
        <p className="text-slate-300">Backup, restore, and update your PisoWifi system</p>
      </div>

      {/* Backup Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Create System Backup</h3>
            <p className="text-sm text-slate-500 mt-1">Download a complete backup including database, configuration, and application files</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              <span>Full system backup</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span>Database included</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              <span>Configuration files</span>
            </div>
          </div>
          
          <button
            onClick={handleBackup}
            disabled={isBackupLoading}
            className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold text-base uppercase tracking-wide hover:bg-emerald-700 transition-all shadow-md flex items-center gap-3 disabled:opacity-50"
          >
            {isBackupLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating Backup...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Backup (.nxs)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Restore Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
             </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Restore System</h3>
            <p className="text-sm text-slate-500 mt-1">Restore your system from a previous backup. This will overwrite all current data.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Backup File (.nxs)</label>
            <input 
              type="file" 
              ref={restoreFileRef}
              accept=".nxs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFilePreview(file);
                }
              }}
              className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-xs file:font-semibold
              file:bg-amber-50 file:text-amber-700
              hover:file:bg-amber-100
              cursor-pointer"
            />
          </div>

          {restorePreview && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Selected Backup
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-slate-500">Filename:</span>
                  <div className="font-mono text-slate-800 truncate">{restorePreview.name}</div>
                </div>
                <div>
                  <span className="text-slate-500">Size:</span>
                  <div className="font-medium">{formatFileSize(restorePreview.size)}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-amber-700">
                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Full backup metadata will be displayed during restore process
              </div>
            </div>
          )}

          <button
            onClick={handleRestore}
            disabled={isRestoreLoading || !restorePreview}
            className="bg-amber-600 text-white px-8 py-3 rounded-lg font-bold text-base uppercase tracking-wide hover:bg-amber-700 transition-all shadow-md disabled:opacity-50 flex items-center gap-3"
          >
            {isRestoreLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Restoring System...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Restore System
              </>
            )}
          </button>
        </div>
      </div>

      {/* Update Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">Update System</h3>
            <p className="text-sm text-slate-500 mt-1">Install system updates while preserving your database and configuration</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
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
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold text-base uppercase tracking-wide hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 flex items-center gap-3"
          >
            {isUpdateLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating System...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Update System
              </>
            )}
          </button>
        </div>
      </div>

      {/* Warning Notice */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-100 text-red-600 rounded-lg flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h4 className="font-bold text-red-800 mb-1">Important Safety Notice</h4>
            <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
              <li>Always create a backup before performing restore or update operations</li>
              <li>Restore operations will overwrite your entire database and configuration</li>
              <li>Update operations preserve your data but may change system behavior</li>
              <li>Ensure you have a stable power supply during these operations</li>
            </ul>
          </div>
        </div>
      </div>

    </div>
  );
};

export default SystemUpdater;
