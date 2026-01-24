import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface, HotspotInstance, VlanConfig, WirelessConfig, PPPoEServerConfig, PPPoEUser, PPPoESession } from '../../types';

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
  const [vlans, setVlans] = useState<any[]>([]);

  // Bridge State
  const [bridge, setBridge] = useState({ name: 'br0', members: [] as string[], stp: false });
  const [bridges, setBridges] = useState<any[]>([]);

  // PPPoE Server State
  const [pppoeServer, setPppoeServer] = useState<Partial<PPPoEServerConfig>>({
    interface: '',
    local_ip: '192.168.100.1',
    ip_pool_start: '192.168.100.10',
    ip_pool_end: '192.168.100.254',
    dns1: '8.8.8.8',
    dns2: '8.8.4.4',
    service_name: ''
  });
  const [pppoeStatus, setPppoeStatus] = useState<any>(null);
  const [pppoeUsers, setPppoeUsers] = useState<PPPoEUser[]>([]);
  const [pppoeSessions, setPppoeSessions] = useState<PPPoESession[]>([]);
  const [newPppoeUser, setNewPppoeUser] = useState({ username: '', password: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ifaces, hs, wifi, v, b, pppoeS, pppoeU, pppoeSess] = await Promise.all([
        apiClient.getInterfaces(),
        apiClient.getHotspots().catch(() => []),
        apiClient.getWirelessConfigs().catch(() => []),
        apiClient.getVlans().catch(() => []),
        apiClient.getBridges().catch(() => []),
        apiClient.getPPPoEServerStatus().catch(() => null),
        apiClient.getPPPoEUsers().catch(() => []),
        apiClient.getPPPoESessions().catch(() => [])
      ]);
      setInterfaces(ifaces.filter(i => !i.isLoopback));
      setHotspots(Array.isArray(hs) ? hs : []);
      setWirelessArr(Array.isArray(wifi) ? wifi : []);
      setVlans(Array.isArray(v) ? v : []);
      setBridges(Array.isArray(b) ? b : []);
      setPppoeStatus(pppoeS);
      setPppoeUsers(Array.isArray(pppoeU) ? pppoeU : []);
      setPppoeSessions(Array.isArray(pppoeSess) ? pppoeSess : []);
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
      await apiClient.saveWirelessConfig({ ...newWifi, interface: targetInterface });
      await loadData();
      alert('Wi-Fi AP Broadcast Started!');
    } catch (e) { alert('Failed to deploy Wireless AP.'); }
    finally { setLoading(false); }
  };

  const createHotspot = async () => {
    if (!newHS.interface || !newHS.ip_address) return alert('Select interface and IP!');
    try {
      setLoading(true);
      await apiClient.createHotspot(newHS);
      await loadData();
      alert('Hotspot Portal Segment Deployed!');
    } catch (e) { alert('Failed to deploy Hotspot.'); }
    finally { setLoading(false); }
  };

  const deleteHotspot = async (iface: string) => {
    if (!confirm(`Stop and remove portal segment on ${iface}?`)) return;
    try {
      setLoading(true);
      await apiClient.deleteHotspot(iface);
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

  const deleteVlan = async (name: string) => {
    if (!confirm(`Delete VLAN ${name}? This may disrupt connectivity.`)) return;
    try {
      setLoading(true);
      await apiClient.deleteVlan(name);
      await loadData();
    } catch (e) { alert('Failed to delete VLAN.'); }
    finally { setLoading(false); }
  };

  const deleteBridge = async (name: string) => {
    if (!confirm(`Delete Bridge ${name}? This may disrupt connectivity.`)) return;
    try {
      setLoading(true);
      await apiClient.deleteBridge(name);
      await loadData();
    } catch (e) { alert('Failed to delete Bridge.'); }
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

  // PPPoE Server Functions
  const startPPPoEServerHandler = async () => {
    if (!pppoeServer.interface || !pppoeServer.local_ip || !pppoeServer.ip_pool_start || !pppoeServer.ip_pool_end) {
      return alert('Please fill all required fields!');
    }
    
    try {
      setLoading(true);
      await apiClient.startPPPoEServer(pppoeServer as PPPoEServerConfig);
      await loadData();
      alert('PPPoE Server started successfully!');
    } catch (e: any) {
      alert(`Failed to start PPPoE Server: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const stopPPPoEServerHandler = async () => {
    if (!confirm('Stop PPPoE Server? All active connections will be terminated.')) return;
    
    try {
      setLoading(true);
      await apiClient.stopPPPoEServer(pppoeStatus?.config?.interface || '');
      await loadData();
      alert('PPPoE Server stopped');
    } catch (e: any) {
      alert(`Failed to stop server: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addPPPoEUserHandler = async () => {
    if (!newPppoeUser.username || !newPppoeUser.password) {
      return alert('Username and password required!');
    }
    
    try {
      setLoading(true);
      await apiClient.addPPPoEUser(newPppoeUser.username, newPppoeUser.password);
      setNewPppoeUser({ username: '', password: '' });
      await loadData();
      alert(`User ${newPppoeUser.username} added!`);
    } catch (e: any) {
      alert(`Failed to add user: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePPPoEUserHandler = async (userId: number, username: string) => {
    if (!confirm(`Delete PPPoE user "${username}"?`)) return;
    
    try {
      setLoading(true);
      await apiClient.deletePPPoEUser(userId);
      await loadData();
    } catch (e: any) {
      alert(`Failed to delete user: ${e.message}`);
    } finally {
      setLoading(false);
    }
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
            
            <div className="mt-6 border-t border-slate-100 pt-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Active VLANs</h4>
              <div className="space-y-2">
                {vlans.map(v => (
                  <div key={v.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                    <div>
                      <p className="text-xs font-black text-slate-900">{v.name}</p>
                      <p className="text-[9px] text-slate-400 font-mono">Parent: {v.parent} • ID: {v.id}</p>
                    </div>
                    <button onClick={() => deleteVlan(v.name)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">Delete</button>
                  </div>
                ))}
                {vlans.length === 0 && <p className="text-[9px] text-slate-400 italic text-center py-2">No VLANs configured</p>}
              </div>
            </div>
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
            
            <div className="mt-6 border-t border-slate-100 pt-6">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Active Bridges</h4>
              <div className="space-y-2">
                {bridges.map(b => (
                  <div key={b.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                    <div>
                      <p className="text-xs font-black text-slate-900">{b.name}</p>
                      <p className="text-[9px] text-slate-400 font-mono">
                        Members: {(b.members || []).join(', ') || 'None'} • STP: {b.stp ? 'On' : 'Off'}
                      </p>
                    </div>
                    <button onClick={() => deleteBridge(b.name)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100">Delete</button>
                  </div>
                ))}
                {bridges.length === 0 && <p className="text-[9px] text-slate-400 italic text-center py-2">No Bridges configured</p>}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 5. PPPoE Server Management */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-[3rem] p-10 shadow-2xl border-2 border-purple-400/30">
        <div className="mb-8">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">PPPoE Server Management</h3>
          <p className="text-xs text-purple-100 font-bold">Accept PPPoE client connections (like an ISP server)</p>
        </div>

        {/* Server Status */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-widest mb-2">Server Status</h4>
              {pppoeStatus?.running ? (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                  <span className="text-sm font-black text-white">Running on {pppoeStatus.config?.interface}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <span className="text-sm font-black text-white/60">Inactive</span>
                </div>
              )}
            </div>
            {pppoeStatus?.running && (
              <button onClick={stopPPPoEServerHandler} disabled={loading} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase shadow-lg transition-all active:scale-95 disabled:opacity-50">
                Stop Server
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Server Configuration */}
          <div className="bg-white rounded-[2rem] p-6 shadow-xl">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Server Configuration</h4>
            
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Listen on Interface</label>
                <select 
                  value={pppoeServer.interface}
                  onChange={e => setPppoeServer({...pppoeServer, interface: e.target.value})}
                  disabled={pppoeStatus?.running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold disabled:opacity-50"
                >
                  <option value="">Select Interface...</option>
                  {interfaces.filter(i => i.type === 'ethernet' || i.type === 'vlan').map(i => (
                    <option key={i.name} value={i.name}>{i.name} ({i.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Server IP (Local)</label>
                <input 
                  type="text" 
                  value={pppoeServer.local_ip} 
                  onChange={e => setPppoeServer({...pppoeServer, local_ip: e.target.value})}
                  disabled={pppoeStatus?.running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                  placeholder="192.168.100.1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">IP Pool Start</label>
                  <input 
                    type="text" 
                    value={pppoeServer.ip_pool_start} 
                    onChange={e => setPppoeServer({...pppoeServer, ip_pool_start: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                    placeholder="192.168.100.10"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">IP Pool End</label>
                  <input 
                    type="text" 
                    value={pppoeServer.ip_pool_end} 
                    onChange={e => setPppoeServer({...pppoeServer, ip_pool_end: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                    placeholder="192.168.100.254"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">DNS 1</label>
                  <input 
                    type="text" 
                    value={pppoeServer.dns1} 
                    onChange={e => setPppoeServer({...pppoeServer, dns1: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">DNS 2</label>
                  <input 
                    type="text" 
                    value={pppoeServer.dns2} 
                    onChange={e => setPppoeServer({...pppoeServer, dns2: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Service Name (Optional)</label>
                <input 
                  type="text" 
                  value={pppoeServer.service_name} 
                  onChange={e => setPppoeServer({...pppoeServer, service_name: e.target.value})}
                  disabled={pppoeStatus?.running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold disabled:opacity-50" 
                  placeholder="Leave empty for default"
                />
              </div>

              {!pppoeStatus?.running && (
                <button 
                  onClick={startPPPoEServerHandler} 
                  disabled={loading} 
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  Start PPPoE Server
                </button>
              )}
            </div>
          </div>

          {/* User Management */}
          <div className="space-y-6">
            {/* Add User Form */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Add PPPoE User</h4>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Username</label>
                  <input 
                    type="text" 
                    value={newPppoeUser.username} 
                    onChange={e => setNewPppoeUser({...newPppoeUser, username: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold" 
                    placeholder="client1"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Password</label>
                  <input 
                    type="password" 
                    value={newPppoeUser.password} 
                    onChange={e => setNewPppoeUser({...newPppoeUser, password: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono" 
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  onClick={addPPPoEUserHandler} 
                  disabled={loading}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                >
                  Add User
                </button>
              </div>
            </div>

            {/* User List */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl max-h-[400px] overflow-y-auto">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 sticky top-0 bg-white pb-2">PPPoE Users ({pppoeUsers.length})</h4>
              <div className="space-y-2">
                {pppoeUsers.length > 0 ? pppoeUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-purple-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${user.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{user.username}</p>
                        <p className="text-[8px] text-slate-400 font-mono uppercase">Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deletePPPoEUserHandler(user.id!, user.username)} 
                      className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                )) : (
                  <p className="text-[9px] text-slate-400 italic text-center py-4">No users configured</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Sessions */}
        {pppoeStatus?.running && pppoeSessions.length > 0 && (
          <div className="mt-6 bg-white rounded-[2rem] p-6 shadow-xl">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Active PPPoE Sessions ({pppoeSessions.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pppoeSessions.map((session, idx) => (
                <div key={idx} className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <p className="text-xs font-black text-slate-900">{session.username}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-mono">IP: {session.ip}</p>
                    <p className="text-[9px] text-slate-600 font-mono">Interface: {session.interface}</p>
                    <p className="text-[9px] text-slate-600">RX: {(session.rx_bytes / 1024 / 1024).toFixed(2)} MB</p>
                    <p className="text-[9px] text-slate-600">TX: {(session.tx_bytes / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  );
};

export default NetworkSettings;