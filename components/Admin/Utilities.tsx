import React, { useState } from 'react';
import { apiClient } from '../../lib/api';

const Utilities: React.FC = () => {
  const [speedtestStatus, setSpeedtestStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [speedtestResults, setSpeedtestResults] = useState<{
    download: number;
    upload: number;
    ping: number;
    server: string;
    timestamp: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSpeedtest = async () => {
    setSpeedtestStatus('running');
    setError(null);
    setSpeedtestResults(null);

    try {
      // Since the backend doesn't have a speedtest endpoint yet, 
      // we'll call a new API endpoint that we'll add to the server
      const response = await apiClient.runSpeedtest();
      setSpeedtestResults(response);
      setSpeedtestStatus('completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
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
            
            <div className="flex justify-center mb-8">
              <button
                onClick={runSpeedtest}
                disabled={speedtestStatus === 'running'}
                className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-black text-sm uppercase tracking-widest transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
              >
                {speedtestStatus === 'running' ? 'Testing...' : 'Run Speedtest'}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-700 font-bold text-sm">Error: {error}</p>
              </div>
            )}

            {speedtestResults && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <h5 className="text-md font-black text-slate-900 mb-4 text-center">Test Results</h5>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                    <div className="text-2xl font-black text-blue-600">{speedtestResults.download.toFixed(2)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Download Mbps</div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                    <div className="text-2xl font-black text-green-600">{speedtestResults.upload.toFixed(2)}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Upload Mbps</div>
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