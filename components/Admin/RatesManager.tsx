
import React, { useState } from 'react';
import { Rate } from '../../types';
import { apiClient } from '../../lib/api';

interface Props {
  rates: Rate[];
  setRates: () => Promise<void>;
}

const RatesManager: React.FC<Props> = ({ rates, setRates }) => {
  const [newPeso, setNewPeso] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [qosDiscipline, setQoSDiscipline] = useState<'cake' | 'fq_codel'>('cake');
  const [loading, setLoading] = useState(false);
  const [savingQoS, setSavingQoS] = useState(false);

  React.useEffect(() => {
    apiClient.getQoSConfig().then(config => setQoSDiscipline(config.discipline));
  }, []);

  const saveQoS = async (discipline: 'cake' | 'fq_codel') => {
    setSavingQoS(true);
    try {
      await apiClient.saveQoSConfig(discipline);
      setQoSDiscipline(discipline);
    } finally {
      setSavingQoS(false);
    }
  };

  const addRate = async () => {
    if (!newPeso || !newMinutes) return;
    setLoading(true);
    try {
      await apiClient.addRate(
        parseInt(newPeso), 
        parseInt(newMinutes)
      );
      await setRates();
      setNewPeso('');
      setNewMinutes('');
    } finally {
      setLoading(false);
    }
  };

  const deleteRate = async (id: string) => {
    if (!confirm('Are you sure you want to remove this rate?')) return;
    await apiClient.deleteRate(id);
    await setRates();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Global QoS Settings */}
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Global Traffic Control</h3>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 w-full">
            <p className="text-xs text-slate-500 mb-4 font-medium">
              Select the Queue Discipline for traffic shaping. 
              <span className="font-bold text-slate-700"> Cake</span> is generally recommended for better latency under load.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => saveQoS('cake')}
                disabled={savingQoS}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-xs uppercase tracking-wider transition-all ${
                  qosDiscipline === 'cake' 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
              >
                Cake QoS
              </button>
              <button
                onClick={() => saveQoS('fq_codel')}
                disabled={savingQoS}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold text-xs uppercase tracking-wider transition-all ${
                  qosDiscipline === 'fq_codel' 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-slate-200 text-slate-400 hover:border-slate-300'
                }`}
              >
                Fq_Codel
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Create Rate Definition</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Currency (₱)</label>
            <input 
              type="number" 
              value={newPeso}
              onChange={(e) => setNewPeso(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold"
              placeholder="1"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Duration (Mins)</label>
            <input 
              type="number" 
              value={newMinutes}
              onChange={(e) => setNewMinutes(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold"
              placeholder="10"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={addRate}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              {loading ? '...' : 'Add'}
            </button>
          </div>
        </div>
        <div className="mt-6 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="text-amber-800 text-sm font-bold flex items-center gap-2">
            <span>⚠️</span>
            Bandwidth limits are now managed in the <span className="font-black">Bandwidth</span> section
          </div>
          <p className="text-amber-700 text-xs mt-1">Set default download/upload limits for all devices in the Bandwidth Management page.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-black tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-6 py-5">Denomination</th>
              <th className="px-6 py-5">Internet Duration</th>
              <th className="px-6 py-5 text-right">Admin Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rates.length > 0 ? rates.sort((a,b) => a.pesos - b.pesos).map((rate) => (
              <tr key={rate.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-5">
                  <span className="font-black text-slate-900 text-lg">₱{rate.pesos}</span>
                </td>
                <td className="px-6 py-5 text-slate-600 font-bold">
                  {rate.minutes >= 60 
                    ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                    : `${rate.minutes} Minutes`}
                </td>
                <td className="px-6 py-5 text-right">
                  <button 
                    onClick={() => deleteRate(rate.id)}
                    className="text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-widest transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Delete Entry
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} className="px-6 py-20 text-center text-slate-400 text-xs font-black uppercase">No rates defined in database.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RatesManager;
