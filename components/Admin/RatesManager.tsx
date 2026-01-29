
import React, { useState } from 'react';
import { Rate } from '../../types';
import { apiClient } from '../../lib/api';
import GamingPriority from './GamingPriority';

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
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Global QoS Settings */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4">Global Traffic Control</h3>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 w-full">
            <p className="text-[10px] text-slate-500 mb-3 font-medium">
              Select Queue Discipline. <span className="font-bold text-slate-700">Cake</span> is recommended.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => saveQoS('cake')}
                disabled={savingQoS}
                className={`flex-1 py-2 px-3 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition-all ${
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
                className={`flex-1 py-2 px-3 rounded-lg border font-bold text-[10px] uppercase tracking-wider transition-all ${
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

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4">Create Rate Definition</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Currency (₱)</label>
            <input 
              type="number" 
              value={newPeso}
              onChange={(e) => setNewPeso(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-bold text-sm"
              placeholder="1"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Duration (Mins)</label>
            <input 
              type="number" 
              value={newMinutes}
              onChange={(e) => setNewMinutes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-bold text-sm"
              placeholder="10"
            />
          </div>
          <div className="flex items-end">
            <button 
              onClick={addRate}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10 disabled:opacity-50 h-[38px]"
            >
              {loading ? '...' : 'Add Rate'}
            </button>
          </div>
        </div>
        <div className="mt-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
          <p className="text-amber-800 text-[10px] font-bold">
            ⚠️ Limits are in the <span className="font-black">Bandwidth</span> section
          </p>
        </div>
      </div>

      {/* Gaming Priority */}
      <GamingPriority />

      {/* Rates List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
          <thead className="bg-slate-50 text-[9px] text-slate-400 uppercase font-black tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-4 py-3">Denomination</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rates.length > 0 ? rates.sort((a,b) => a.pesos - b.pesos).map((rate) => (
              <tr key={rate.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-2">
                  <span className="font-black text-slate-900 text-sm">₱{rate.pesos}</span>
                </td>
                <td className="px-4 py-2 text-slate-600 font-bold text-xs">
                  {rate.minutes >= 60 
                    ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                    : `${rate.minutes}m`}
                </td>
                <td className="px-4 py-2 text-right">
                  <button 
                    onClick={() => deleteRate(rate.id)}
                    className="text-red-500 hover:text-red-700 text-[9px] font-black uppercase tracking-widest transition-colors group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-slate-400 text-[10px] font-black uppercase">No rates defined.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};

export default RatesManager;
