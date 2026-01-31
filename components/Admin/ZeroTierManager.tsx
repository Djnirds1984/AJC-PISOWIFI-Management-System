import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';

interface ZeroTierStatus {
  installed: boolean;
  running: boolean;
  nodeId?: string;
  version?: string;
  status?: string;
}

interface ZeroTierNetwork {
  id: string;
  nwid: string;
  name: string;
  type: string;
  status: string;
  allowGlobal: boolean;
  allowManaged: boolean;
  allowDefault: boolean;
  assignedAddresses: string[];
}

const ZeroTierManager: React.FC = () => {
  const [status, setStatus] = useState<ZeroTierStatus | null>(null);
  const [networks, setNetworks] = useState<ZeroTierNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [joining, setJoining] = useState(false);
  const [networkIdToJoin, setNetworkIdToJoin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const statusData = await apiClient.getZeroTierStatus();
      setStatus(statusData);

      if (statusData.installed && statusData.running) {
        const networksData = await apiClient.getZeroTierNetworks();
        setNetworks(networksData.networks || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load ZeroTier status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInstall = async () => {
    try {
      setInstalling(true);
      setError(null);
      const res = await apiClient.installZeroTier();
      if (res.success) {
        await loadData();
      } else {
        setError(res.error || 'Installation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Installation failed');
    } finally {
      setInstalling(false);
    }
  };

  const handleJoin = async () => {
    if (!networkIdToJoin) return;
    try {
      setJoining(true);
      setError(null);
      const res = await apiClient.joinZeroTierNetwork(networkIdToJoin);
      if (res.success) {
        setNetworkIdToJoin('');
        await loadData();
      } else {
        setError(res.error || 'Failed to join network');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to join network');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async (nwid: string) => {
    if (!confirm(`Are you sure you want to leave network ${nwid}?`)) return;
    try {
      setLoading(true);
      const res = await apiClient.leaveZeroTierNetwork(nwid);
      if (res.success) {
        await loadData();
      } else {
        setError(res.error || 'Failed to leave network');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to leave network');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !status) {
    return <div className="p-4 text-center text-slate-500">Loading ZeroTier status...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Status Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">ZeroTier Status</h3>
        
        {!status?.installed ? (
          <div className="text-center py-8">
            <div className="text-slate-500 mb-4">ZeroTier is not installed on this system.</div>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50"
            >
              {installing ? 'Installing...' : 'Install ZeroTier'}
            </button>
            <p className="text-xs text-slate-400 mt-4">
              Installation will download and run the official ZeroTier install script.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status.running ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="font-mono font-medium text-slate-700">
                  {status.running ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Node ID</div>
              <div className="font-mono font-medium text-slate-700">{status.nodeId || 'Unknown'}</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Version</div>
              <div className="font-mono font-medium text-slate-700">{status.version || 'Unknown'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Networks Card */}
      {status?.installed && status.running && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Joined Networks</h3>
          </div>

          <div className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Enter Network ID to join"
              value={networkIdToJoin}
              onChange={(e) => setNetworkIdToJoin(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 font-mono"
            />
            <button
              onClick={handleJoin}
              disabled={joining || !networkIdToJoin}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>

          {networks.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Not joined to any networks.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Network ID</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">IP Addresses</th>
                    <th className="p-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm text-slate-700">
                  {networks.map((net) => (
                    <tr key={net.nwid} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono text-xs">{net.nwid}</td>
                      <td className="p-3 font-medium">{net.name}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          net.status === 'OK' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {net.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{net.type}</td>
                      <td className="p-3 font-mono text-xs text-slate-500">
                        {net.assignedAddresses.join(', ')}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleLeave(net.nwid)}
                          className="text-red-600 hover:text-red-800 text-xs font-bold uppercase tracking-wider"
                        >
                          Leave
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ZeroTierManager;
