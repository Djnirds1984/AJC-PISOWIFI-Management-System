import React, { useState, useEffect } from 'react';
import { WifiDevice, Rate, BandwidthSettings } from '../../types';
import { apiClient } from '../../lib/api';

interface Props {
  devices: WifiDevice[];
  rates: Rate[];
}

const BandwidthManager: React.FC<Props> = ({ devices, rates }) => {
  const [defaultDownloadLimit, setDefaultDownloadLimit] = useState<number>(5);
  const [defaultUploadLimit, setDefaultUploadLimit] = useState<number>(5);
  const [autoApplyToNew, setAutoApplyToNew] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Load current default settings
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const settings = await apiClient.getBandwidthSettings();
        setDefaultDownloadLimit(settings.defaultDownloadLimit);
        setDefaultUploadLimit(settings.defaultUploadLimit);
        setAutoApplyToNew(settings.autoApplyToNew);
      } catch (err) {
        console.error('Error loading bandwidth settings:', err);
        setError('Failed to load bandwidth settings');
      }
    };

    loadDefaults();
  }, []);

  const handleSaveDefaults = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiClient.saveBandwidthSettings({
        defaultDownloadLimit,
        defaultUploadLimit,
        autoApplyToNew
      });
      
      setMessage('Default bandwidth settings saved successfully!');
      
      // Apply to all existing devices if requested
      if (autoApplyToNew) {
        await applyToAllDevices();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save bandwidth settings');
    } finally {
      setLoading(false);
    }
  };

  const applyToAllDevices = async () => {
    setLoading(true);
    try {
      // Update all devices with the default limits
      for (const device of devices) {
        await apiClient.updateWifiDevice(device.id, {
          downloadLimit: defaultDownloadLimit,
          uploadLimit: defaultUploadLimit
        });
      }
      
      setMessage('Bandwidth limits applied to all devices successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to apply limits to devices');
    } finally {
      setLoading(false);
    }
  };

  const applyToDevice = async (deviceId: string, downloadLimit: number, uploadLimit: number) => {
    setLoading(true);
    try {
      await apiClient.updateWifiDevice(deviceId, {
        downloadLimit,
        uploadLimit
      });
      
      setMessage('Device bandwidth updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update device bandwidth');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Bandwidth Management</h3>
        <p className="text-xs text-slate-500 font-medium">
          Configure default bandwidth limits for all hotspot devices and manage individual device limits.
        </p>
      </div>

      {/* Default Settings Card */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Default Bandwidth Settings</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Default Download Limit (Mbps)</label>
            <input 
              type="number" 
              value={defaultDownloadLimit}
              onChange={(e) => setDefaultDownloadLimit(Number(e.target.value))}
              min="0"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold"
              placeholder="Download limit in Mbps"
            />
            <p className="text-[9px] text-slate-400 mt-1">Set to 0 for unlimited</p>
          </div>
          
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Default Upload Limit (Mbps)</label>
            <input 
              type="number" 
              value={defaultUploadLimit}
              onChange={(e) => setDefaultUploadLimit(Number(e.target.value))}
              min="0"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold"
              placeholder="Upload limit in Mbps"
            />
            <p className="text-[9px] text-slate-400 mt-1">Set to 0 for unlimited</p>
          </div>
        </div>

        <div className="mb-6">
          <label className="flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={autoApplyToNew}
              onChange={(e) => setAutoApplyToNew(e.target.checked)}
              className="sr-only"
            />
            <div className={`relative w-10 h-6 flex items-center rounded-full p-1 transition-colors ${autoApplyToNew ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${autoApplyToNew ? 'translate-x-4' : ''}`}></div>
            </div>
            <span className="ml-3 text-sm font-bold text-slate-700">Automatically apply default limits to new devices</span>
          </label>
          <p className="text-[9px] text-slate-400 mt-1 ml-13">When enabled, all newly detected devices will automatically receive the default bandwidth limits</p>
        </div>

        <div className="flex gap-4">
          <button 
            onClick={handleSaveDefaults}
            disabled={loading}
            className="bg-blue-600 text-white py-3.5 px-6 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {loading ? 'SAVING...' : 'SAVE DEFAULTS'}
          </button>
          
          <button 
            onClick={applyToAllDevices}
            disabled={loading}
            className="bg-slate-800 text-white py-3.5 px-6 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-slate-800/20 disabled:opacity-50"
          >
            {loading ? 'APPLYING...' : 'APPLY TO ALL DEVICES'}
          </button>
        </div>
      </div>

      {/* Active Sessions Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Active Device Bandwidth</h3>
          <p className="text-xs text-slate-500 mt-1">Manage individual device bandwidth limits for connected devices</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-black tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-5">Device</th>
                <th className="px-6 py-5">MAC Address</th>
                <th className="px-6 py-5">IP Address</th>
                <th className="px-6 py-5">Current Limits (DL/UL)</th>
                <th className="px-6 py-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices && devices.length > 0 ? (
                devices.map((device) => (
                  <tr key={device.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mr-3">
                          <span className="text-slate-600 text-lg">📱</span>
                        </div>
                        <div>
                          <div className="font-black text-slate-900">{device.customName || device.hostname}</div>
                          <div className="text-xs text-slate-500">{device.interface}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{device.mac}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{device.ip}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="text-xs">
                          <div className="font-bold text-slate-900">
                            {device.downloadLimit ? `${device.downloadLimit} Mbps` : 'Unlimited'}
                          </div>
                          <div className="text-slate-500">DL</div>
                        </div>
                        <div className="text-xs">
                          <div className="font-bold text-slate-900">
                            {device.uploadLimit ? `${device.uploadLimit} Mbps` : 'Unlimited'}
                          </div>
                          <div className="text-slate-500">UL</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => applyToDevice(device.id, defaultDownloadLimit, defaultUploadLimit)}
                          disabled={loading}
                          className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider hover:bg-blue-200 transition-colors disabled:opacity-50"
                        >
                          Apply Default
                        </button>
                        <button 
                          onClick={() => applyToDevice(device.id, 0, 0)}
                          disabled={loading}
                          className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          Remove Limit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400 text-xs font-black uppercase">
                    No active devices found. Devices will appear here when connected to the hotspot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Messages */}
      {(message || error) && (
        <div className={`p-4 rounded-xl border ${
          error 
            ? 'bg-red-50 border-red-200 text-red-700' 
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          <p className="text-sm font-bold">{error || message}</p>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200">
        <h4 className="font-black text-blue-900 text-sm uppercase tracking-widest mb-2">How Bandwidth Management Works</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Default limits are applied to all new devices that connect to your hotspot</li>
          <li>• Individual device limits override the default settings</li>
          <li>• Bandwidth is enforced using Linux TC (Traffic Control) with HTB queuing discipline</li>
          <li>• Upload and download speeds are controlled separately for optimal performance</li>
        </ul>
      </div>
    </div>
  );
};

export default BandwidthManager;