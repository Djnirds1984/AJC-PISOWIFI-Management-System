import React, { useState, useEffect } from 'react';

interface MaxBandwidthSettingsProps {
  onSave: (maxBandwidth: number) => void;
  currentMaxBandwidth: number;
}

const MaxBandwidthSettings: React.FC<MaxBandwidthSettingsProps> = ({ onSave, currentMaxBandwidth }) => {
  const [maxBandwidth, setMaxBandwidth] = useState<number>(currentMaxBandwidth || 10000); // Default to 10G
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await onSave(maxBandwidth);
      setMessage('Maximum bandwidth setting saved successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to save maximum bandwidth setting');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4">Maximum Bandwidth Configuration</h3>
      
      <div className="mb-4">
        <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">
          Maximum Bandwidth (Mbps)
        </label>
        <input 
          type="number" 
          value={maxBandwidth}
          onChange={(e) => setMaxBandwidth(Number(e.target.value))}
          min="1"
          max="100000" // Up to 100G
          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-bold text-sm"
          placeholder="Enter max bandwidth in Mbps"
        />
        <p className="text-[9px] text-slate-400 mt-1">
          Set the maximum bandwidth capacity for your 10G+ network infrastructure (1-100000 Mbps)
        </p>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={handleSave}
          disabled={loading}
          className="bg-blue-600 text-white py-2 px-4 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 disabled:opacity-50"
        >
          {loading ? 'SAVING...' : 'SAVE MAX BANDWIDTH'}
        </button>
      </div>
      
      {message && (
        <div className="mt-3 p-2 bg-green-50 text-green-700 text-[10px] font-medium rounded-lg border border-green-200">
          {message}
        </div>
      )}
      
      {error && (
        <div className="mt-3 p-2 bg-red-50 text-red-700 text-[10px] font-medium rounded-lg border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
};

export default MaxBandwidthSettings;