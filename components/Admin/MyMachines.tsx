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
    return <div className="p-8 text-center text-gray-500">Loading machine status...</div>;
  }

  if (error && !machineStatus) {
    return (
      <div className="p-8 text-center text-red-500">
        <p>Error: {error}</p>
        <button onClick={fetchStatus} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Retry</button>
      </div>
    );
  }

  const { hardwareId, vendorId, metrics } = machineStatus || {};
  const isPending = !vendorId;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">My Machines</h2>
      
      {/* Current Machine Card */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-semibold text-gray-900">Current Machine</h3>
              <div className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${
                isPending ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
              }`}>
                {isPending ? 'Pending Activation' : 'Active'}
              </div>
            </div>
            <p className="text-sm text-gray-500 font-mono mt-2 bg-gray-100 px-2 py-1 rounded inline-block">
              ID: {hardwareId}
            </p>
          </div>
          
          {!isPending && (
             <div className="text-sm text-gray-500">
                Vendor ID: <span className="font-mono">{vendorId}</span>
             </div>
          )}
        </div>

        {isPending && (
          <div className="mb-8 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Pending Activation</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    This machine is registered but not yet linked to a vendor account.
                    Please add this machine to your vendor dashboard using the Hardware ID above.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* CPU Temp */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
            <div className="text-blue-600 text-sm font-medium mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              CPU Temperature
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics?.cpuTemp ? `${metrics.cpuTemp.toFixed(1)}°C` : 'N/A'}
            </div>
          </div>

          {/* Uptime */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-100">
            <div className="text-green-600 text-sm font-medium mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              System Uptime
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics?.uptime ? formatUptime(metrics.uptime) : 'N/A'}
            </div>
          </div>

          {/* Active Sessions */}
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
            <div className="text-purple-600 text-sm font-medium mb-1 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Active Sessions
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics?.activeSessions ?? 0}
            </div>
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
