import React, { useState } from 'react';
import { apiClient } from '../../lib/api';

const Utilities: React.FC = () => {
  const [speedtestStatus, setSpeedtestStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [speedtestResults, setSpeedtestResults] = useState<{
    download: number;
    upload: number;
    ping: number;
    unit: string;
    server: string;
    requestedServerId: string | null;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [servers, setServers] = useState<Array<{ id: string; name: string; location: string; provider: string }>>([]);
  const [selectedServer, setSelectedServer] = useState<string>('auto'); // 'auto' for automatic selection
  const [serversLoading, setServersLoading] = useState<boolean>(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const fetchServers = async () => {
    setServersLoading(true);
    try {
      addLog('Fetching available speedtest servers...');
      const response = await apiClient.getSpeedtestServers();
      setServers(response.servers);
      addLog(`Fetched ${response.servers.length} servers`);
    } catch (err) {
      addLog(`Failed to fetch servers: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setError(err instanceof Error ? err.message : 'Failed to fetch servers');
    } finally {
      setServersLoading(false);
    }
  };

  const runSpeedtest = async () => {
    setSpeedtestStatus('running');
    setError(null);
    setSpeedtestResults(null);
    setLogs([]);
    addLog('Starting speedtest...');

    try {
      addLog('Calling API endpoint...');
      const serverId = selectedServer === 'auto' ? undefined : selectedServer;
      const response = await apiClient.runSpeedtest(serverId);
      addLog('API response received');
      
      // Log the raw response for debugging
      addLog(`Raw response: ${JSON.stringify(response)}`);
      
      // Validate response structure
      if (!response) {
        throw new Error('Empty response from server');
      }
      
      if (typeof response !== 'object') {
        throw new Error(`Invalid response type: ${typeof response}`);
      }
      
      // Check required fields
      const requiredFields = ['download', 'upload', 'ping'];
      for (const field of requiredFields) {
        if (!(field in response)) {
          throw new Error(`Missing required field: ${field}`);
        }
        if (typeof response[field] !== 'number') {
          throw new Error(`Invalid ${field} value: ${response[field]} (type: ${typeof response[field]})`);
        }
      }
      
      // Validate unit field if present
      const typedResponse = response as any;
      if (typedResponse.unit && typeof typedResponse.unit !== 'string') {
        throw new Error(`Invalid unit value: ${typedResponse.unit} (type: ${typeof typedResponse.unit})`);
      }
      
      addLog('Response validation passed');
      setSpeedtestResults(response);
      setSpeedtestStatus('completed');
      addLog('Speedtest completed successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      addLog(`ERROR: ${errorMessage}`);
      setError(errorMessage);
      setSpeedtestStatus('error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Internet Connectivity Test</h3>
        </div>
        <div className="p-6">
          <div className="max-w-lg mx-auto">
            <h4 className="text-lg font-bold text-slate-900 mb-2">Ookla Speedtest</h4>
            <p className="text-slate-600 mb-6">
              Test your Raspberry Pi's internet connectivity with download, upload, and ping measurements.
            </p>
            
            <div className="space-y-4 mb-6">
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={runSpeedtest}
                  disabled={speedtestStatus === 'running'}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-black text-sm uppercase tracking-widest transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
                >
                  {speedtestStatus === 'running' ? 'Testing...' : 'Run Speedtest'}
                </button>
                
                <button
                  onClick={() => setShowLogs(!showLogs)}
                  className="bg-slate-600 hover:bg-slate-700 text-white py-3 px-4 rounded-lg font-black text-sm uppercase tracking-widest transition-all shadow-md shadow-slate-500/10"
                >
                  {showLogs ? 'Hide Logs' : 'Show Logs'}
                </button>
                
                <button
                  onClick={fetchServers}
                  disabled={serversLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-black text-sm uppercase tracking-widest transition-all shadow-md shadow-purple-500/10 disabled:opacity-50"
                >
                  {serversLoading ? 'Loading...' : 'Refresh Servers'}
                </button>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-bold text-slate-700 min-w-[120px]">Select Server:</label>
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="flex-1 min-w-[200px] bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={speedtestStatus === 'running' || serversLoading}
                >
                  <option value="auto">Auto-select Best Server</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}{server.location ? `, ${server.location}` : ''} ({server.provider})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-700 font-bold text-sm">Error: {error}</p>
              </div>
            )}

            {showLogs && (
              <div className="bg-black rounded-lg p-4 mb-6 font-mono text-green-400 text-xs overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-white font-bold text-sm">Terminal Log</h5>
                  <button 
                    onClick={() => setLogs([])}
                    className="text-gray-400 hover:text-white text-xs"
                  >
                    Clear
                  </button>
                </div>
                <div className="h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-green-500 scrollbar-track-gray-800">
                  {logs.length > 0 ? (
                    logs.map((log, index) => (
                      <div key={index} className="mb-1">
                        <span className="text-gray-500">$</span> {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 italic">No logs yet...</div>
                  )}
                </div>
              </div>
            )}

            {speedtestResults && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <h5 className="text-md font-black text-slate-900 mb-4 text-center">Test Results</h5>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                    <div className="text-2xl font-black text-blue-600">{speedtestResults.download.toFixed(2)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Download {(speedtestResults.unit || 'Mbps')}</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                    <div className="text-2xl font-black text-green-600">{speedtestResults.upload.toFixed(2)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Upload {(speedtestResults.unit || 'Mbps')}</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                    <div className="text-2xl font-black text-purple-600">{speedtestResults.ping.toFixed(1)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ping ms</div>
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="text-slate-600 text-sm">
                    Server: {speedtestResults.server}
                  </p>
                  <p className="text-slate-500 text-xs mt-1">
                    {new Date(speedtestResults.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Utilities;