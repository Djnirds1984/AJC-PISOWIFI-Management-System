
import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface, WanConfig, WlanConfig, HotspotConfig, VlanConfig } from '../../types';

const NetworkSettings: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loading, setLoading] = useState(false);
  
  // WAN State
  const [wan, setWan] = useState<WanConfig>({ proto: 'dhcp', ipaddr: '', netmask: '255.255.255.0', gateway: '', dns: ['8.8.8.8'] });
  
  // Bridge State
  const [selectedForBridge, setSelectedForBridge] = useState<string[]>([]);
  const [bridgeName, setBridgeName] = useState('br0');
  const [stp, setStp] = useState(false);

  // VLAN State
  const [vlan, setVlan] = useState<VlanConfig>({ id: 10, parentInterface: 'eth0', name: 'eth0.10' });

  // Hotspot State
  const [hotspot, setHotspot] = useState<HotspotConfig>({ name: 'AJC_PISOWIFI_FREE', maxClients: 50, bandwidthLimit: 5, enabled: true });

  useEffect(() => { loadInterfaces(); }, []);

  const loadInterfaces = async () => {
    try {
      const data = await apiClient.getInterfaces();
      // Hide loopback interface per requirement
      setInterfaces(data.filter(i => !i.isLoopback));
    } catch (err) { console.error(err); }
  };

  const toggleStatus = async (name: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'up' ? 'down' : 'up';
    if (!confirm(`Are you sure you want to bring ${name} ${nextStatus}?`)) return;
    try {
      await apiClient.setInterfaceStatus(name, nextStatus);
      await loadInterfaces();
    } catch (e) { alert('Failed to change interface status.'); }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* 1. Interface Management Section */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Interface Stack</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Status of Physical & Logical Links</p>
          </div>
          <button onClick={loadInterfaces} className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all shadow-sm">Refresh Hardware</button>
        </div>
        <div className="divide-y divide-slate-100">
          {interfaces.map(iface => (
            <div key={iface.name} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full ${iface.status === 'up' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-red-500 opacity-30'}`}></div>
                <div>
                  <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
                    {iface.name}
                    <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 font-mono">{iface.mac}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 font-mono">{iface.ip || 'NO ADDRESS ASSIGNED'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 uppercase tracking-tighter">{iface.type}</span>
                <button 
                  onClick={() => toggleStatus(iface.name, iface.status)}
                  className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all border ${
                    iface.status === 'up' 
                      ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100' 
                      : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                  }`}
                >
                  {iface.status === 'up' ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 2. WAN Configuration Section */}
        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative">
          <div className="mb-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">WAN Uplink</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Configure Internet Input</p>
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <button 
                onClick={() => setWan({...wan, proto: 'dhcp'})}
                className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${wan.proto === 'dhcp' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
              >DHCP Client</button>
              <button 
                onClick={() => setWan({...wan, proto: 'static'})}
                className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${wan.proto === 'static' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
              >Static IP</button>
            </div>
            
            {wan.proto === 'static' && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">IP Address</label>
                  <input type="text" value={wan.ipaddr} onChange={e => setWan({...wan, ipaddr: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500" placeholder="192.168.1.50" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Gateway</label>
                  <input type="text" value={wan.gateway} onChange={e => setWan({...wan, gateway: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500" placeholder="192.168.1.1" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">DNS Server</label>
                  <input type="text" value={wan.dns[0]} onChange={e => setWan({...wan, dns: [e.target.value]})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500" placeholder="8.8.8.8" />
                </div>
              </div>
            )}
            <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-900/10 hover:bg-black transition-all">Apply WAN Parameters</button>
          </div>
        </section>

        {/* 3. Hotspot Section */}
        <section className="bg-slate-950 p-8 rounded-3xl text-white border border-white/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <span className="text-6xl">🔥</span>
          </div>
          <div className="mb-8">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-blue-400">Captive Hotspot</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">WLAN Service Parameters</p>
          </div>
          <div className="space-y-6">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Network SSID</label>
              <input type="text" value={hotspot.name} onChange={e => setHotspot({...hotspot, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:border-blue-500 transition-all" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Limit (Clients)</label>
                <input type="number" value={hotspot.maxClients} onChange={e => setHotspot({...hotspot, maxClients: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Bandwidth (Mbps)</label>
                <input type="number" value={hotspot.bandwidthLimit} onChange={e => setHotspot({...hotspot, bandwidthLimit: parseInt(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none" />
              </div>
            </div>
            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl shadow-blue-500/20">Commit Hotspot Service</button>
          </div>
        </section>

        {/* 4. Bridge & VLAN Section */}
        <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Bridge Part */}
            <div>
              <div className="mb-6 flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Network Bridge</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Bind multiple links (brctl)</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase">STP</span>
                  <button 
                    onClick={() => setStp(!stp)}
                    className={`w-10 h-5 rounded-full relative transition-all ${stp ? 'bg-blue-600' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${stp ? 'left-6' : 'left-1'}`}></div>
                  </button>
                </div>
              </div>
              <div className="space-y-4">
                <input type="text" placeholder="Bridge Name (e.g. br0)" value={bridgeName} onChange={e => setBridgeName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none" />
                <div className="grid grid-cols-3 gap-2">
                  {interfaces.filter(i => i.type !== 'bridge').map(iface => (
                    <button 
                      key={iface.name}
                      onClick={() => setSelectedForBridge(prev => prev.includes(iface.name) ? prev.filter(n => n !== iface.name) : [...prev, iface.name])}
                      className={`py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border ${
                        selectedForBridge.includes(iface.name) 
                          ? 'bg-blue-50 border-blue-500 text-blue-700' 
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >{iface.name}</button>
                  ))}
                </div>
                <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">Initialize Bridge</button>
              </div>
            </div>

            {/* VLAN Part */}
            <div className="border-t md:border-t-0 md:border-l border-slate-100 md:pl-12 pt-12 md:pt-0">
              <div className="mb-6">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">VLAN Tagging</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">802.1Q Segment Creation</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Parent Interface</label>
                  <select 
                    value={vlan.parentInterface}
                    onChange={e => setVlan({...vlan, parentInterface: e.target.value, name: `${e.target.value}.${vlan.id}`})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none font-bold text-slate-700"
                  >
                    {interfaces.filter(i => i.type === 'ethernet').map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">VLAN ID</label>
                    <input type="number" min="2" max="4094" value={vlan.id} onChange={e => setVlan({...vlan, id: parseInt(e.target.value), name: `${vlan.parentInterface}.${e.target.value}`})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none" />
                  </div>
                  <div className="flex-[2]">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Ident Name</label>
                    <input type="text" readOnly value={vlan.name} className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-500" />
                  </div>
                </div>
                <button className="w-full border-2 border-slate-900 text-slate-900 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">Generate Tagged Sub-interface</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Terminal Preview */}
      <section className="bg-slate-950 p-6 rounded-3xl border border-white/5 font-mono text-[11px] leading-relaxed shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4">
          <span className="text-white/10 text-4xl font-black italic tracking-tighter uppercase select-none">AJC SHELL</span>
        </div>
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-slate-500 font-bold uppercase text-[9px] tracking-widest">Active Kernel Directives</span>
        </div>
        <div className="space-y-1">
          <p className="text-blue-400">root@ajc-wifi:~# <span className="text-slate-300">ip link add link {vlan.parentInterface} name {vlan.name} type vlan id {vlan.id}</span></p>
          <p className="text-blue-400">root@ajc-wifi:~# <span className="text-slate-300">ip link set {bridgeName} type bridge stp_state {stp ? 1 : 0}</span></p>
          <p className="text-blue-400">root@ajc-wifi:~# <span className="text-slate-300">iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE</span></p>
          <p className="text-green-500 font-bold animate-pulse mt-2">[ OK ] Network stack synchronized successfully.</p>
        </div>
      </section>
    </div>
  );
};

export default NetworkSettings;
