
import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface } from '../../types';

const NetworkSettings: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedForBridge, setSelectedForBridge] = useState<string[]>([]);
  const [bridgeName, setBridgeName] = useState('br0');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInterfaces();
  }, []);

  const loadInterfaces = async () => {
    try {
      const data = await apiClient.getInterfaces();
      setInterfaces(data);
    } catch (err) {
      console.error('Network Error:', err);
    }
  };

  const handleCreateBridge = async () => {
    if (selectedForBridge.length < 1) return;
    setLoading(true);
    try {
      const output = await apiClient.createBridge(bridgeName, selectedForBridge);
      console.log('Bridge Output:', output);
      await loadInterfaces();
      setSelectedForBridge([]);
      alert(`Shell command executed. Result:\n${output}`);
    } catch (err) {
      alert('Failed to execute bridge command. Ensure you have root privileges.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (name: string) => {
    setSelectedForBridge(prev => 
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Linux Interfaces</h3>
            <button onClick={loadInterfaces} className="text-blue-600 text-xs font-bold hover:underline">Refresh</button>
          </div>
          <div className="divide-y divide-slate-100">
            {interfaces.length > 0 ? interfaces.map(iface => (
              <div key={iface.name} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full ${iface.status === 'up' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-300'}`}></div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm tracking-tight">{iface.name}</h4>
                    <p className="text-[10px] text-slate-400 font-mono uppercase font-bold">{iface.mac}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{iface.type}</span>
                  <p className="text-[11px] text-slate-600 mt-1 font-mono">{iface.ip || 'DISCONNECTED'}</p>
                </div>
              </div>
            )) : (
               <div className="p-10 text-center text-slate-400 text-xs font-bold uppercase">Scanning Hardware...</div>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Bridge Creation UI</h3>
          <p className="text-xs text-slate-500 mb-8 font-medium">Binds physical and virtual interfaces using <code className="bg-slate-100 px-1 rounded">ip link</code>.</p>
          
          <div className="space-y-6 mb-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">New Interface Identifier</label>
              <input 
                type="text" 
                value={bridgeName}
                onChange={(e) => setBridgeName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Available Slaves</label>
              <div className="grid grid-cols-2 gap-3">
                {interfaces.filter(i => i.type !== 'bridge').map(iface => (
                  <button
                    key={iface.name}
                    onClick={() => toggleSelection(iface.name)}
                    className={`px-4 py-4 rounded-xl border text-xs font-black transition-all text-center uppercase tracking-tighter ${
                      selectedForBridge.includes(iface.name)
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
                        : 'border-slate-200 text-slate-500 hover:border-slate-400'
                    }`}
                  >
                    {iface.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleCreateBridge}
            disabled={loading || selectedForBridge.length < 1}
            className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50 shadow-xl shadow-slate-900/10"
          >
            {loading ? 'Executing Shell commands...' : 'Initialize Linux Bridge'}
          </button>
        </div>
      </div>

      <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 font-mono text-[11px] leading-relaxed shadow-2xl">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-slate-500 font-bold uppercase text-[9px]">Captured Iptables Script</span>
        </div>
        <div className="text-blue-400/80 italic"># Forwarding unauthenticated traffic to internal gateway</div>
        <p className="text-slate-300">iptables -t nat -A PREROUTING -i {bridgeName} -p tcp --dport 80 -j DNAT --to-destination 10.0.0.1:80</p>
        <p className="text-slate-300">iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE</p>
        <p className="text-slate-300">iptables -A FORWARD -i {bridgeName} -m state --state NEW -j ACCEPT</p>
      </div>
    </div>
  );
};

export default NetworkSettings;
