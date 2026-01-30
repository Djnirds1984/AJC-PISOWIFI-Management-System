import React, { useState, useEffect } from 'react';
import { NodeMCUDevice } from '../../types';
import { initializeNodeMCULicenseManager, getNodeMCULicenseManager } from '../../lib/nodemcu-license';
import { toast } from 'sonner';

interface NodeMCULicenseManagerProps {
  devices: NodeMCUDevice[];
  vendorId?: string;
}

const NodeMCULicenseManager: React.FC<NodeMCULicenseManagerProps> = ({ devices, vendorId }) => {
  const [licenses, setLicenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<NodeMCUDevice | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateCount, setGenerateCount] = useState(5);
  const [licenseType, setLicenseType] = useState<'standard' | 'premium'>('standard');
  const [expirationMonths, setExpirationMonths] = useState<number>(12);

  const licenseManager = getNodeMCULicenseManager();

  useEffect(() => {
    if (licenseManager.isConfigured()) {
      loadLicenses();
    }
  }, []);

  const loadLicenses = async () => {
    setLoading(true);
    try {
      const vendorLicenses = await licenseManager.getVendorLicenses();
      setLicenses(vendorLicenses);
    } catch (error) {
      console.error('Failed to load licenses:', error);
      toast.error('Failed to load NodeMCU licenses');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrial = async (device: NodeMCUDevice) => {
    try {
      const result = await licenseManager.startTrial(device.macAddress);
      if (result.success) {
        toast.success('Trial started successfully!');
        loadLicenses();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Trial start error:', error);
      toast.error('Failed to start trial');
    }
  };

  const handleActivateLicense = async () => {
    if (!selectedDevice || !licenseKey.trim()) {
      toast.error('Please select a device and enter a license key');
      return;
    }

    try {
      const result = await licenseManager.activateLicense(licenseKey.trim(), selectedDevice.macAddress);
      if (result.success) {
        toast.success('License activated successfully!');
        setLicenseKey('');
        setSelectedDevice(null);
        loadLicenses();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('License activation error:', error);
      toast.error('Failed to activate license');
    }
  };

  const handleRevokeLicense = async (licenseKey: string) => {
    if (!confirm('Are you sure you want to revoke this license?')) {
      return;
    }

    try {
      const result = await licenseManager.revokeLicense(licenseKey);
      if (result.success) {
        toast.success('License revoked successfully');
        loadLicenses();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('License revocation error:', error);
      toast.error('Failed to revoke license');
    }
  };

  const handleGenerateLicenses = async () => {
    try {
      const generatedLicenses = await licenseManager.generateLicenses(generateCount, licenseType, expirationMonths);
      if (generatedLicenses.length > 0) {
        toast.success(`Generated ${generatedLicenses.length} ${licenseType} licenses`);
        loadLicenses();
        setShowGenerateModal(false);
      } else {
        toast.error('Failed to generate licenses');
      }
    } catch (error) {
      console.error('License generation error:', error);
      toast.error('Failed to generate licenses');
    }
  };

  const getLicenseStatus = (license: any) => {
    if (!license.is_active) {
      return { text: 'Unassigned', color: 'bg-slate-100 text-slate-600' };
    }
    
    if (license.expires_at) {
      const expiresAt = new Date(license.expires_at);
      const now = new Date();
      const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (expiresAt < now) {
        return { text: 'Expired', color: 'bg-red-100 text-red-700' };
      } else if (daysRemaining <= 7) {
        return { text: `${daysRemaining}d left`, color: 'bg-amber-100 text-amber-700' };
      } else {
        return { text: `${daysRemaining}d left`, color: 'bg-emerald-100 text-emerald-700' };
      }
    }
    
    return { text: 'Active', color: 'bg-emerald-100 text-emerald-700' };
  };

  const getDeviceLicenseStatus = (device: NodeMCUDevice) => {
    const deviceLicense = licenses.find(lic => lic.device_id === device.id && lic.is_active);
    
    if (!deviceLicense) {
      return { 
        hasLicense: false, 
        canStartTrial: true,
        status: { text: 'No License', color: 'bg-red-100 text-red-700' }
      };
    }

    const status = getLicenseStatus(deviceLicense);
    const isExpired = status.text === 'Expired';
    
    return {
      hasLicense: true,
      license: deviceLicense,
      isExpired,
      canStartTrial: false,
      status
    };
  };

  if (!licenseManager.isConfigured()) {
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 rounded-lg text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-[10px] font-black text-amber-900 uppercase tracking-widest">License System Not Configured</h3>
            <p className="text-[8px] text-amber-600 font-bold uppercase tracking-tighter">Please configure Supabase credentials to enable NodeMCU licensing</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* License Management Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">NodeMCU License Management</h3>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Manage licenses for your NodeMCU/Subvendo devices</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-3 py-2 bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-700 transition-all"
            >
              Generate Licenses
            </button>
            <button
              onClick={loadLicenses}
              disabled={loading}
              className="px-3 py-2 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* License Activation Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-3">Activate License</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Select Device</label>
            <select
              value={selectedDevice?.id || ''}
              onChange={(e) => {
                const device = devices.find(d => d.id === e.target.value);
                setSelectedDevice(device || null);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a device...</option>
              {devices.filter(d => d.status === 'accepted').map(device => (
                <option key={device.id} value={device.id}>
                  {device.name} ({device.macAddress})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">License Key</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                placeholder="NODEMCU-XXXX-XXXX"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={handleActivateLicense}
                disabled={!selectedDevice || !licenseKey.trim()}
                className="px-4 py-2 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Activate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Devices with License Status */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Device License Status</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/30">
              <tr>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Device</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">MAC Address</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">License Status</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">License Key</th>
                <th className="px-4 py-2 text-right text-[8px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {devices.filter(d => d.status === 'accepted').map(device => {
                const licenseInfo = getDeviceLicenseStatus(device);
                return (
                  <tr key={device.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-[10px] font-black text-slate-900 uppercase">{device.name}</div>
                      <div className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">
                        Revenue: ₱{device.totalRevenue.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[9px] font-mono text-slate-600">{device.macAddress}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${licenseInfo.status.color}`}>
                        {licenseInfo.status.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {licenseInfo.hasLicense ? (
                        <div className="text-[9px] font-mono text-slate-600">
                          {licenseInfo.license.license_key}
                          {licenseInfo.license.license_type === 'trial' && (
                            <span className="ml-2 px-1 py-0.5 bg-blue-100 text-blue-700 text-[7px] font-black rounded">TRIAL</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-400">No license assigned</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {licenseInfo.hasLicense ? (
                          <>
                            {!licenseInfo.isExpired && (
                              <button
                                onClick={() => licenseInfo.license && handleRevokeLicense(licenseInfo.license.license_key)}
                                className="px-2 py-1 bg-rose-100 text-rose-700 text-[8px] font-black uppercase tracking-wider rounded hover:bg-rose-200 transition-all"
                              >
                                Revoke
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            onClick={() => handleStartTrial(device)}
                            className="px-2 py-1 bg-blue-100 text-blue-700 text-[8px] font-black uppercase tracking-wider rounded hover:bg-blue-200 transition-all"
                          >
                            Start Trial
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Licenses */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Available Licenses</h4>
          <span className="text-[8px] font-black text-slate-400 bg-white border border-slate-200 px-2 py-1 rounded">
            {licenses.filter(lic => !lic.is_active).length} Available
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/30">
              <tr>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">License Key</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Created</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Expires</th>
                <th className="px-4 py-2 text-left text-[8px] font-black text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {licenses.filter(lic => !lic.is_active).map(license => (
                <tr key={license.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-[9px] font-mono text-slate-600">{license.license_key}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider ${
                      license.license_type === 'premium' ? 'bg-purple-100 text-purple-700' :
                      license.license_type === 'trial' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {license.license_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[9px] text-slate-600">
                      {new Date(license.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[9px] text-slate-600">
                      {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Never'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-[8px] font-black uppercase tracking-wider">
                      Available
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Licenses Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Generate Licenses</h3>
              <button onClick={() => setShowGenerateModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">✕</button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</label>
                <input
                  type="number"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">License Type</label>
                <select
                  value={licenseType}
                  onChange={(e) => setLicenseType(e.target.value as 'standard' | 'premium')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>

              <div>
                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Expiration (Months)</label>
                <input
                  type="number"
                  value={expirationMonths}
                  onChange={(e) => setExpirationMonths(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="120"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleGenerateLicenses}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95"
                >
                  Generate {generateCount} Licenses
                </button>
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeMCULicenseManager;