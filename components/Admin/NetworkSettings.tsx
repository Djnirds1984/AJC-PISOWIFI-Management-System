import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface, HotspotInstance, VlanConfig, WirelessConfig } from '../../types';

const NetworkSettings: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [hotspots, setHotspots] = useState<HotspotInstance[]>([]);
  const [wirelessArr, setWirelessArr] = useState<WirelessConfig[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State for Wireless AP Setup
  const [newWifi, setNewWifi] = useState<Partial<WirelessConfig & { bridge?: string }>>({
    interface: '',
    ssid: 'AJC_PISOWIFI',
    password: '',
    channel: 1,
    hw_mode: 'g',
    bridge: ''
  });

  // State for Hotspot Portal Setup
  const [newHS, setNewHS] = useState<Partial<HotspotInstance>>({
    interface: '',
    ip_address: '10.0.10.1',
    dhcp_range: '10.0.10.50,10.0.10.250',
    bandwidth_limit: 10
  });

  // VLAN State
  const [vlan, setVlan] = useState<VlanConfig>({ id: 10, parentInterface: 'eth0', name: 'eth0.10' });

  // Bridge State
  const [bridge, setBridge] = useState({ name: 'br0', members: [] as string[], stp: false });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ifaces, hs, wifi] = await Promise.all([
        apiClient.getInterfaces(),
        fetch('/api/hotspots').then(r => r.json()).catch(() => []),
        fetch('/api/network/wireless').then(r => r.json()).catch(() => [])
      ]);
      setInterfaces(ifaces.filter(i => !i.isLoopback));
      setHotspots(Array.isArray(hs) ? hs : []);
      setWirelessArr(Array.isArray(wifi) ? wifi : []);
    } catch (err) { 
      console.error('[UI] Data Load Error:', err); 
    }
    finally { setLoading(false); }
  };

  const deployWireless = async (ifaceName?: string) => {
    const targetInterface = ifaceName || newWifi.interface;
    if (!targetInterface || !newWifi.ssid) return alert('Select interface and SSID!');
    
    try {
      setLoading(true);
      const res = await fetch('/api/network/wireless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newWifi, interface: targetInterface })
      });
      const data = await res.json();
      if (data.success) {
        await loadData();
        alert('Wi-Fi AP Broadcast Started!');
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (e) { alert('Failed to deploy Wireless AP.'); }
    finally { setLoading(false); }
  };

  const createHotspot = async () => {
    if (!newHS.interface || !newHS.ip_address) return alert('Select interface and IP!');
    try {
      setLoading(true);
      const res = await fetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHS)
      });
      const data = await res.json();
      if (data.success) {
        await loadData();
        alert('Hotspot Portal Segment Deployed!');
      } else {
        alert('Failed: ' + data.error);
      }
    } catch (e) { alert('Failed to deploy Hotspot.'); }
    finally { setLoading(false); }
  };

  const deleteHotspot = async (iface: string) => {
    if (!confirm(`Stop and remove portal segment on ${iface}?`)) return;
    try {
      setLoading(true);
      await fetch(`/api/hotspots/${iface}`, { method: 'DELETE' });
      await loadData();
    } catch (e) { alert('Failed to remove portal.'); }
    finally { setLoading(false); }
  };

  const generateVlan = async () => {
    try {
      setLoading(true);
      await apiClient.createVlan(vlan);
      await loadData();
      alert(`VLAN ${vlan.name} created!`);
    } catch (e) { alert('Failed to create VLAN.'); }
    finally { setLoading(false); }
  };

  const deployBridge = async () => {
    if (!bridge.name || bridge.members.length === 0) return alert('Bridge name and members required!');
    try {
      setLoading(true);
      await apiClient.createBridge(bridge.name, bridge.members, bridge.stp);
      await loadData();
      alert(`Bridge ${bridge.name} created! Members have been flushed to prevent IP conflicts.`);
    } catch (e) { alert('Failed to create Bridge.'); }
    finally { setLoading(false); }
  };

  const toggleBridgeMember = (iface: string) => {
    setBridge(prev => ({
      ...prev,
      members: prev.members.includes(iface) 
        ? prev.members.filter(m => m !== iface) 
        : [...prev.members, iface]
    }));
  };

  // Helper to identify potential wireless interfaces
  const isPotentialWifi = (iface: NetworkInterface) => {
    const name = (iface.name || '').toLowerCase();
    const type = (iface.type || '').toLowerCase();
    return type === 'wifi' || name.startsWith('wlan') || name.startsWith('ap') || name.startsWith('ra');
  };

  return (
    <div className="space-y-12 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. Hardware Link Status Engine */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hardware Link Engine</h3>
            <p className="text-xs text-slate-900 font-black uppercase tracking-tight mt-1">Direct Kernel Probing</p>
          </div>
          <button onClick={loadData} disabled={loading} className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 transition-all disabled:opacity-50">
            {loading ? 'Refreshing...' : 'Sync Kernel'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-slate-100">
          {interfaces.map(iface => (
            <div key={iface.name} className="p-5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${iface.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {iface.status}
                </span>
                <span className="text-[9px] text-slate-400 font-mono uppercase">{iface.type}</span>
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">{iface.name}</h4>
                <p className="text-[10px] text-slate-500 font-mono truncate">{iface.ip || 'no-ip-assigned'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Wireless Interface Manager */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Wireless AP Layer</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Link to Physical Wifi</label>
              <select 
                value={newWifi.interface}
                onChange={e => setNewWifi({...newWifi, interface: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
              >
                <option value="">Select WiFi Link...</option>
                {interfaces.filter(isPotentialWifi).map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Bridge Assignment (Optional)</label>
              <select 
                value={newWifi.bridge}
                onChange={e => setNewWifi({...newWifi, bridge: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
              >
                <option value="">Standalone (No Bridge)</option>
                {interfaces.filter(i => i.type === 'bridge').map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Broadcast SSID</label>
              <input type="text" value={newWifi.ssid} onChange={e => setNewWifi({...newWifi, ssid: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Secure Passkey</label>
              <input type="password" value={newWifi.password} onChange={e => setNewWifi({...newWifi, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs" placeholder="Leave empty for Open" />
            </div>
            <button onClick={() => deployWireless()} disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50">Start Radio Transmission</button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-50 rounded-[2.5rem] border border-slate-200 p-8">
          <div className="flex justify-between items-center mb-6 px-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Radio Nodes</h4>
            <span className="text-[8px] font-bold text-slate-400 uppercase">Updates from wireless_settings table</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wirelessArr.length > 0 ? wirelessArr.map(w => (
              <div key={w.interface} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 group hover:border-blue-300 transition-all">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">📶</div>
                <div className="flex-1">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{w.ssid}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                    {w.interface} {w.bridge ? `→ ${w.bridge}` : ''} • CH {w.channel}
                  </p>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-20 bg-white/50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-4">
                <div className="text-3xl grayscale opacity-50">📡</div>
                <p className="text-[10px] font-black text-slate-400 uppercase italic">No Active Radio Nodes Found</p>
                <p className="text-[8px] text-slate-400 max-w-[200px] text-center font-bold uppercase tracking-widest">You must "Start Radio Transmission" above to broadcast your SSID.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Hotspot Server Manager */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/20">
          <h3 className="text-xs font-black text-blue-100 uppercase tracking-widest mb-6">Provision Portal Segment</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-2 block">Bind to Link</label>
              <select 
                value={newHS.interface}
                onChange={e => setNewHS({...newHS, interface: e.target.value})}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none"
              >
                <option value="" className="bg-blue-600 text-white">Select Interface...</option>
                {interfaces.map(i => <option key={i.name} value={i.name} className="bg-blue-600 text-white">{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-2 block">Gateway IP</label>
              <input type="text" placeholder="10.0.10.1" value={newHS.ip_address} onChange={e => setNewHS({...newHS, ip_address: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs font-mono" />
            </div>
            <div>
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-2 block">DHCP Pool</label>
              <input type="text" placeholder="10.0.10.50,10.0.10.250" value={newHS.dhcp_range} onChange={e => setNewHS({...newHS, dhcp_range: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs font-mono" />
            </div>
            <button onClick={createHotspot} disabled={loading} className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50">Commit Portal Segment</button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center mb-4 px-2">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Centralized Portal Segments</h4>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Updates from hotspots table</span>
          </div>
          {hotspots.length > 0 ? hotspots.map(hs => {
             const isWifiIface = interfaces.find(i => i.name === hs.interface && isPotentialWifi(i));
             const hasRadio = wirelessArr.some(w => w.interface === hs.interface);
             
             return (
               <div key={hs.interface} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col gap-4 group animate-in slide-in-from-right-4">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-5">
                     <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl shadow-xl shadow-slate-900/10 transition-transform group-hover:scale-110">🏛️</div>
                     <div>
                       <h5 className="font-black text-slate-900 text-sm flex items-center gap-2 uppercase tracking-tight">Segment: {hs.interface}</h5>
                       <p className="text-[10px] text-slate-500 font-bold tracking-tight mt-1">
                         IP: <span className="text-slate-900 font-mono">{hs.ip_address}</span> • DHCP: <span className="text-slate-900 font-mono">{hs.dhcp_range}</span>
                       </p>
                     </div>
                   </div>
                   <button onClick={() => deleteHotspot(hs.interface)} className="bg-red-50 text-red-600 px-5 py-2.5 rounded-xl font-black text-[9px] uppercase hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100">Terminate</button>
                 </div>
                 
                 {isWifiIface && !hasRadio && (
                   <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between animate-pulse">
                     <p className="text-[9px] font-black text-amber-700 uppercase tracking-tight">
                       ⚠️ Radio Transmission Missing! Users cannot see the SSID for this segment.
                     </p>
                     <button 
                       onClick={() => deployWireless(hs.interface)}
                       className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black uppercase shadow-lg shadow-amber-600/20"
                     >
                       One-Click Start
                     </button>
                   </div>
                 )}
               </div>
             );
          }) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center gap-2">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Active Portal Segments</span>
              <p className="text-[8px] text-slate-300 uppercase font-bold tracking-widest">Provision a segment to activate the DHCP server.</p>
            </div>
          )}
        </div>
      </section>

      {/* 4. Trunking & Bridging Engines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">VLAN Engine (802.1Q)</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Parent Port</label>
                <select 
                  value={vlan.parentInterface}
                  onChange={e => setVlan({...vlan, parentInterface: e.target.value, name: `${e.target.value}.${vlan.id}`})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
                >
                  {interfaces.filter(i => i.type === 'ethernet' || i.name.startsWith('wlan')).map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">VLAN ID</label>
                <input type="number" min="2" max="4094" value={vlan.id} onChange={e => setVlan({...vlan, id: parseInt(e.target.value), name: `${vlan.parentInterface}.${e.target.value}`})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono" />
              </div>
            </div>
            <button onClick={generateVlan} disabled={loading} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-xl hover:bg-black transition-all">Generate Virtual Link: {vlan.name}</button>
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Bridge Engine (brctl)</h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Bridge ID</label>
                <input type="text" value={bridge.name} onChange={e => setBridge({...bridge, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono" />
              </div>
              <div className="flex items-center gap-3 h-full pt-6">
                <input type="checkbox" checked={bridge.stp} onChange={e => setBridge({...bridge, stp: e.target.checked})} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <label className="text-[9px] font-black text-slate-600 uppercase">Enable STP</label>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
               {interfaces.map(iface => (
                 <button 
                   key={iface.name}
                   onClick={() => toggleBridgeMember(iface.name)}
                   className={`px-2 py-2 rounded-lg border text-[8px] font-black uppercase transition-all ${bridge.members.includes(iface.name) ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                 >
                   {iface.name}
                 </button>
               ))}
            </div>
            <button onClick={deployBridge} disabled={loading} className="w-full border-2 border-slate-900 text-slate-900 py-4 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">Commit Bridge Stack</button>
          </div>
        </section>
      </div>

    </div>
  );
};

export default NetworkSettings;