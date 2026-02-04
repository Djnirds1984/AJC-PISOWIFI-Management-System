import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface, HotspotInstance, VlanConfig, WirelessConfig, PPPoEServerConfig, PPPoEUser, PPPoESession } from '../../types';

const NetworkSettings: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [hotspots, setHotspots] = useState<HotspotInstance[]>([]);
  const [wirelessArr, setWirelessArr] = useState<WirelessConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [qosDiscipline, setQoSDiscipline] = useState<'cake' | 'fq_codel'>('cake');
  const [savingQoS, setSavingQoS] = useState(false);
  
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
  const [newHS, setNewHS] = useState<Partial<HotspotInstance & { bitmask?: number }>>({
    interface: '',
    ip_address: '10.0.10.1',
    dhcp_range: '10.0.10.50,10.0.10.250',
    bandwidth_limit: 10,
    bitmask: 24
  });

  // Bitmask options for different network sizes
  const bitmaskOptions = [
    { value: 24, label: '/24 (254 hosts)', range: '254 IPs', example: '192.168.1.0/24' },
    { value: 23, label: '/23 (510 hosts)', range: '510 IPs', example: '192.168.0.0/23' },
    { value: 22, label: '/22 (1022 hosts)', range: '1022 IPs', example: '192.168.0.0/22' },
    { value: 21, label: '/21 (2046 hosts)', range: '2046 IPs', example: '192.168.0.0/21' },
    { value: 20, label: '/20 (4094 hosts)', range: '4094 IPs', example: '192.168.0.0/20' },
    { value: 19, label: '/19 (8190 hosts)', range: '8190 IPs', example: '192.168.0.0/19' },
    { value: 18, label: '/18 (16382 hosts)', range: '16382 IPs', example: '192.168.0.0/18' },
    { value: 16, label: '/16 (65534 hosts)', range: '65534 IPs', example: '192.168.0.0/16' }
  ];

  // Function to calculate DHCP range based on IP and bitmask
  const calculateDHCPRange = (ipAddress: string, bitmask: number) => {
    try {
      const ip = ipAddress.split('.').map(Number);
      const hostBits = 32 - bitmask;
      const maxHosts = Math.pow(2, hostBits) - 2; // -2 for network and broadcast
      
      // Calculate network address
      const mask = 0xFFFFFFFF << hostBits;
      const networkInt = (ip[0] << 24 | ip[1] << 16 | ip[2] << 8 | ip[3]) & mask;
      
      // Start range from .10 or 10% of available range, whichever is higher
      const startOffset = Math.max(10, Math.floor(maxHosts * 0.1));
      const endOffset = Math.floor(maxHosts * 0.9); // Use 90% of available range
      
      const startInt = networkInt + startOffset;
      const endInt = networkInt + endOffset;
      
      const startIP = [
        (startInt >>> 24) & 0xFF,
        (startInt >>> 16) & 0xFF,
        (startInt >>> 8) & 0xFF,
        startInt & 0xFF
      ].join('.');
      
      const endIP = [
        (endInt >>> 24) & 0xFF,
        (endInt >>> 16) & 0xFF,
        (endInt >>> 8) & 0xFF,
        endInt & 0xFF
      ].join('.');
      
      return `${startIP},${endIP}`;
    } catch (e) {
      return '10.0.10.50,10.0.10.250'; // Fallback
    }
  };

  // Update DHCP range when IP or bitmask changes
  const updateHotspotConfig = (field: string, value: any) => {
    const updated = { ...newHS, [field]: value };
    
    if (field === 'ip_address' || field === 'bitmask') {
      const dhcpRange = calculateDHCPRange(
        updated.ip_address || '10.0.10.1',
        updated.bitmask || 24
      );
      updated.dhcp_range = dhcpRange;
    }
    
    setNewHS(updated);
  };

  // VLAN State
  const [vlan, setVlan] = useState<VlanConfig>({ id: 10, parentInterface: 'eth0', name: 'eth0.10' });
  const [vlans, setVlans] = useState<any[]>([]);

  // Bridge State
  const [bridge, setBridge] = useState({ name: 'br0', members: [] as string[], stp: false });
  const [bridges, setBridges] = useState<any[]>([]);



  useEffect(() => { 
    loadData();
    apiClient.getQoSConfig().then(config => setQoSDiscipline(config.discipline));
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ifaces, hs, wifi, v, b] = await Promise.all([
        apiClient.getInterfaces(),
        apiClient.getHotspots().catch(() => []),
        apiClient.getWirelessConfigs().catch(() => []),
        apiClient.getVlans().catch(() => []),
        apiClient.getBridges().catch(() => [])
      ]);
      const filteredInterfaces = ifaces.filter(i => !i.isLoopback);
      setInterfaces(filteredInterfaces);
      
      // Auto-detect primary ethernet interface for VLAN configuration
      const ethernetInterfaces = filteredInterfaces.filter(i => i.type === 'ethernet');
      if (ethernetInterfaces.length > 0 && vlan.parentInterface === 'eth0') {
        const primaryEth = ethernetInterfaces[0];
        setVlan(prev => ({
          ...prev,
          parentInterface: primaryEth.name,
          name: `{primaryEth.name}.{prev.id}`
        }));
      }
      setHotspots(Array.isArray(hs) ? hs : []);
      setWirelessArr(Array.isArray(wifi) ? wifi : []);
      setVlans(Array.isArray(v) ? v : []);
      setBridges(Array.isArray(b) ? b : []);
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

  const saveQoS = async (discipline: 'cake' | 'fq_codel') => {
    setSavingQoS(true);
    try {
      await apiClient.saveQoSConfig(discipline);
      setQoSDiscipline(discipline);
    } finally {
      setSavingQoS(false);
    }
  };

  // PPPoE Server Functions


  // Helper to identify potential wireless interfaces
  const isPotentialWifi = (iface: NetworkInterface) => {
    const name = (iface.name || '').toLowerCase();
    const type = (iface.type || '').toLowerCase();
    return type === 'wifi' || name.startsWith('wlan') || name.startsWith('ap') || name.startsWith('ra');
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* Global Traffic Control */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <h3 className="text-[10px] font-black text-main uppercase tracking-widest mb-4">Global Traffic Control</h3>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 w-full">
            <p className="text-[10px] text-muted mb-3 font-medium">
              Select Queue Discipline. <span className="font-bold text-main">Cake</span> is recommended.
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

      {/* 1. Hardware Link Status Engine */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-[10px] font-black text-main uppercase tracking-widest">Hardware Link Engine</h3>
          <button onClick={loadData} disabled={loading} className="text-[9px] font-black uppercase text-blue-600 hover:text-blue-700 disabled:opacity-50">
            {loading ? 'Syncing...' : 'Sync Kernel'}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-slate-100">
          {interfaces.map(iface => (
            <div key={iface.name} className="p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded ${iface.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {iface.status}
                </span>
                <span className="text-[8px] text-muted font-mono uppercase">{iface.type}</span>
              </div>
              <div>
                <h4 className="font-black text-main text-xs">{iface.name}</h4>
                <p className="text-[9px] text-muted font-mono truncate">{iface.ip || '-'}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Wireless Interface Manager */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <h3 className="text-[10px] font-black text-main uppercase tracking-widest mb-4">Wireless AP Layer</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[8px] font-medium text-muted uppercase tracking-wide mb-1 block">Link</label>
              <select 
                value={newWifi.interface}
                onChange={e => setNewWifi({...newWifi, interface: e.target.value})}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-main"
              >
                <option value="">Select Link...</option>
                {interfaces.filter(isPotentialWifi).map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-medium text-muted uppercase tracking-wide mb-1 block">SSID</label>
              <input type="text" value={newWifi.ssid} onChange={e => setNewWifi({...newWifi, ssid: e.target.value})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-bold text-main" />
            </div>
            <div>
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Passkey</label>
              <input type="password" value={newWifi.password} onChange={e => setNewWifi({...newWifi, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs" placeholder="Open" />
            </div>
            <button onClick={() => deployWireless()} disabled={loading} className="w-full bg-slate-900 text-white py-2 rounded-lg font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-black transition-all disabled:opacity-50">Start Radio</button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-50 rounded-xl border border-slate-200 p-4">
          <h4 className="text-[10px] font-black text-main uppercase tracking-widest mb-4">Active Radio Nodes</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wirelessArr.length > 0 ? wirelessArr.map(w => (
              <div key={w.interface} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-sm">📶</div>
                <div className="flex-1">
                  <p className="text-[11px] font-black text-main uppercase">{w.ssid}</p>
                  <p className="text-[8px] text-muted font-bold uppercase">
                    {w.interface} • CH {w.channel}
                  </p>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-10 text-center text-muted text-[10px] font-bold uppercase">No Active Radios</div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Hotspot Server Manager */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 bg-blue-500 rounded-xl p-4 text-white shadow-md shadow-blue-500/10">
          <h3 className="text-[10px] font-bold text-blue-100 uppercase tracking-wide mb-4">Portal Segment</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[8px] font-medium text-blue-100 uppercase tracking-wide mb-1 block">Bind Interface</label>
              <select 
                value={newHS.interface}
                onChange={e => updateHotspotConfig('interface', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs font-medium text-main outline-none"
              >
                <option value="" className="bg-blue-500 text-main">Select Link...</option>
                {interfaces.map(i => <option key={i.name} value={i.name} className="bg-blue-500 text-main">{i.name}</option>)}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[8px] font-medium text-blue-100 uppercase tracking-wide mb-1 block">Gateway IP</label>
                <input 
                  type="text" 
                  value={newHS.ip_address} 
                  onChange={e => updateHotspotConfig('ip_address', e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-main placeholder:text-blue-200" 
                  placeholder="10.0.10.1" 
                />
              </div>
              
              <div>
                <label className="text-[8px] font-medium text-blue-100 uppercase tracking-wide mb-1 block">Network Size</label>
                <select 
                  value={newHS.bitmask || 24}
                  onChange={e => updateHotspotConfig('bitmask', parseInt(e.target.value))}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-main outline-none"
                >
                  {bitmaskOptions.map(option => (
                    <option key={option.value} value={option.value} className="bg-blue-500 text-main">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div>
              <label className="text-[8px] font-medium text-blue-100 uppercase tracking-wide mb-1 block">DHCP Pool</label>
              <input 
                type="text" 
                value={newHS.dhcp_range} 
                onChange={e => updateHotspotConfig('dhcp_range', e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-main placeholder:text-blue-200" 
                placeholder="Auto-calculated"
                readOnly
              />
              <div className="mt-1 text-[7px] text-blue-200 font-medium">
                {bitmaskOptions.find(opt => opt.value === (newHS.bitmask || 24))?.range} available
              </div>
            </div>
            
            <div>
              <label className="text-[8px] font-medium text-blue-100 uppercase tracking-wide mb-1 block">Bandwidth Limit (Mbps)</label>
              <input 
                type="number" 
                value={newHS.bandwidth_limit} 
                onChange={e => updateHotspotConfig('bandwidth_limit', parseInt(e.target.value))}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xs font-mono text-main placeholder:text-blue-200" 
                placeholder="10" 
              />
            </div>
            
            <button onClick={createHotspot} disabled={loading} className="w-full bg-white text-blue-600 py-2 rounded-lg font-medium text-[9px] uppercase tracking-wide shadow-md hover:bg-gray-50 transition-all disabled:opacity-50">
              Deploy Portal Segment
            </button>
            
            <div className="mt-3 p-2 bg-white/10 rounded-lg border border-white/20">
              <div className="text-[7px] font-bold text-blue-100 uppercase tracking-wide mb-1">Network Preview</div>
              <div className="text-[8px] font-mono text-white">
                Network: {newHS.ip_address || '10.0.10.1'}/{newHS.bitmask || 24}<br/>
                Pool: {newHS.dhcp_range || 'Auto-calculated'}<br/>
                Capacity: {bitmaskOptions.find(opt => opt.value === (newHS.bitmask || 24))?.range}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold text-muted uppercase tracking-wide">Active Portal Segments</h4>
            <div className="text-[8px] font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
              No DHCP Server Limit
            </div>
          </div>
          {hotspots.length > 0 ? hotspots.map(hs => (
             <div key={hs.interface} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between group">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center text-lg">🏛️</div>
                 <div>
                   <h5 className="font-bold text-main text-[11px] uppercase">{hs.interface}</h5>
                   <p className="text-[9px] text-muted font-mono">
                     {hs.ip_address} • Pool: {hs.dhcp_range}
                   </p>
                   <p className="text-[8px] text-green-600 font-medium">
                     Bandwidth: {hs.bandwidth_limit}Mbps • High Capacity Pool
                   </p>
                 </div>
               </div>
               <button onClick={() => deleteHotspot(hs.interface)} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium text-[8px] uppercase hover:bg-red-100 transition-opacity opacity-0 group-hover:opacity-100">Terminate</button>
             </div>
          )) : (
            <div className="py-10 text-center border-2 border-dashed border-gray-300 rounded-xl">
              <div className="text-4xl mb-2">🏛️</div>
              <div className="text-muted text-[10px] font-medium uppercase mb-2">No Active Segments</div>
              <div className="text-[8px] text-green-600 font-medium">
                Create unlimited portal segments with custom IP ranges
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. Trunking & Bridging Engines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">VLAN Engine</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[8px] font-medium text-muted uppercase tracking-wide mb-1 block">Parent</label>
                <select 
                  value={vlan.parentInterface}
                  onChange={e => setVlan({...vlan, parentInterface: e.target.value, name: `${e.target.value}.${vlan.id}`})}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-main"
                >
                  {interfaces.filter(i => i.type === 'ethernet' || i.name.startsWith('wlan')).map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[8px] font-medium text-muted uppercase tracking-wide mb-1 block">VLAN ID</label>
                <input type="number" value={vlan.id} onChange={e => setVlan({...vlan, id: parseInt(e.target.value), name: `${vlan.parentInterface}.${e.target.value}`})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-main" />
              </div>
            </div>
            <button onClick={generateVlan} disabled={loading} className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium text-[9px] uppercase tracking-wide text-main">Create: {vlan.name}</button>
            
            <div className="space-y-1.5">
              {vlans.map(v => (
                <div key={v.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 group">
                  <p className="text-[10px] font-black text-main">{v.name} <span className="text-[8px] text-muted font-mono ml-1">ID: {v.id}</span></p>
                  <button onClick={() => deleteVlan(v.name)} className="text-red-600 text-[8px] font-black uppercase opacity-0 group-hover:opacity-100">Delete</button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Bridge Engine</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <input type="text" value={bridge.name} onChange={e => setBridge({...bridge, name: e.target.value})} className="w-1/2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-main" placeholder="Bridge Name" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={bridge.stp} onChange={e => setBridge({...bridge, stp: e.target.checked})} className="w-3 h-3 rounded border-slate-300 text-blue-600" />
                <span className="text-[8px] font-black text-main uppercase">STP</span>
              </label>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
               {interfaces.map(iface => (
                 <button key={iface.name} onClick={() => toggleBridgeMember(iface.name)} className={`py-1 rounded border text-[7px] font-black uppercase transition-all ${bridge.members.includes(iface.name) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-main'}`}>
                   {iface.name}
                 </button>
               ))}
            </div>
            <button onClick={deployBridge} disabled={loading} className="w-full border border-slate-900 text-main py-2 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all">Deploy Bridge</button>
            
            <div className="space-y-1.5">
              {bridges.map(b => (
                <div key={b.name} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 group">
                  <p className="text-[10px] font-black text-main">{b.name} <span className="text-[8px] text-muted font-mono ml-1">({(b.members || []).join(',')})</span></p>
                  <button onClick={() => deleteBridge(b.name)} className="text-red-600 text-[8px] font-black uppercase opacity-0 group-hover:opacity-100">Delete</button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default NetworkSettings;
