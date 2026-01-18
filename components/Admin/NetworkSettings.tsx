import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface, HotspotInstance, VlanConfig, WirelessConfig } from '../../types';

const NetworkSettings: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [hotspots, setHotspots] = useState<HotspotInstance[]>([]);
  const [wirelessArr, setWirelessArr] = useState<WirelessConfig[]>([]);
  const [loading, setLoading] = useState(false);
  
  // State for Wireless AP Setup
  const [newWifi, setNewWifi] = useState<Partial<WirelessConfig>>({
    interface: '',
    ssid: 'AJC_PISOWIFI',
    password: '',
    channel: 1,
    hw_mode: 'g'
  });

  // State for Hotspot Portal Setup
  const [newHS, setNewHS] = useState<Partial<HotspotInstance>>({
    interface: '',
    ip_address: '10.0.10.1',
    dhcp_range: '10.0.10.50,10.0.10.250',
    bandwidth_limit: 10
  });

  const [vlan, setVlan] = useState<VlanConfig>({ id: 10, parentInterface: 'eth0', name: 'eth0.10' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ifaces, hs, wifi] = await Promise.all([
        apiClient.getInterfaces(),
        fetch('/api/hotspots').then(r => r.json()),
        fetch('/api/network/wireless').then(r => r.json())
      ]);
      setInterfaces(ifaces.filter(i => !i.isLoopback));
      setHotspots(hs);
      setWirelessArr(wifi);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const deployWireless = async () => {
    if (!newWifi.interface || !newWifi.ssid) return alert('Select interface and SSID!');
    try {
      setLoading(true);
      await fetch('/api/network/wireless', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWifi)
      });
      await loadData();
      alert('Wi-Fi AP Broadcast Started!');
    } catch (e) { alert('Failed to deploy Wireless AP.'); }
    finally { setLoading(false); }
  };

  const createHotspot = async () => {
    if (!newHS.interface || !newHS.ip_address) return alert('Select interface and IP!');
    try {
      setLoading(true);
      await fetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHS)
      });
      await loadData();
      alert('Hotspot Portal Segment Deployed!');
    } catch (e) { alert('Failed to deploy Hotspot.'); }
    finally { setLoading(false); }
  };

  const deleteHotspot = async (iface: string) => {
    if (!confirm(`Stop and remove portal segment on ${iface}?`)) return;
    try {
      await fetch(`/api/hotspots/${iface}`, { method: 'DELETE' });
      await loadData();
    } catch (e) { alert('Failed to remove portal.'); }
  };

  return (
    <div className="space-y-12 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* 1. Wireless Interface Manager (Link Layer) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Physical Wi-Fi (AP)</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Interface</label>
              <select 
                value={newWifi.interface}
                onChange={e => setNewWifi({...newWifi, interface: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold"
              >
                <option value="">Select WiFi Link...</option>
                {interfaces.filter(i => i.type === 'wifi').map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Broadcast SSID</label>
              <input type="text" value={newWifi.ssid} onChange={e => setNewWifi({...newWifi, ssid: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-black" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Password (Leave empty for Open)</label>
              <input type="password" value={newWifi.password} onChange={e => setNewWifi({...newWifi, password: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Channel</label>
                <input type="number" value={newWifi.channel} onChange={e => setNewWifi({...newWifi, channel: parseInt(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Mode</label>
                <select value={newWifi.hw_mode} onChange={e => setNewWifi({...newWifi, hw_mode: e.target.value as any})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold">
                  <option value="g">2.4GHz (g)</option>
                  <option value="a">5GHz (a)</option>
                </select>
              </div>
            </div>
            <button 
              onClick={deployWireless}
              disabled={loading}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-900/10 hover:bg-black transition-all active:scale-95 disabled:opacity-50"
            >
              Start Broadcast
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-50 rounded-[2.5rem] border border-slate-200 p-8 flex flex-col justify-center text-center">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-8">Active Transmissions</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wirelessArr.length > 0 ? wirelessArr.map(w => (
              <div key={w.interface} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-lg">📶</div>
                <div className="text-left">
                  <p className="text-xs font-black text-slate-900 uppercase">{w.ssid}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{w.interface} • CH {w.channel} • {w.password ? 'SECURED' : 'OPEN'}</p>
                </div>
              </div>
            )) : (
              <div className="col-span-full py-12 text-[10px] font-black text-slate-300 uppercase italic">No Active Wireless Broadcasts</div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Hotspot Server Manager (Captive Portal Layer) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Provision Form */}
        <div className="lg:col-span-1 bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-500/20">
          <h3 className="text-xs font-black text-blue-100 uppercase tracking-widest mb-6">Hotspot Portal Layer</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-2 block">Link to Interface</label>
              <select 
                value={newHS.interface}
                onChange={e => setNewHS({...newHS, interface: e.target.value})}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none"
              >
                <option value="" className="bg-blue-600">Select Link...</option>
                {interfaces.map(i => <option key={i.name} value={i.name} className="bg-blue-600">{i.name} ({i.type})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-2 block">Gateway IP Address</label>
              <input type="text" value={newHS.ip_address} onChange={e => setNewHS({...newHS, ip_address: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs font-mono" />
            </div>
            <div>
              <label className="text-[9px] font-black text-blue-200 uppercase tracking-widest mb-2 block">DHCP Segment (Start,End)</label>
              <input type="text" value={newHS.dhcp_range} onChange={e => setNewHS({...newHS, dhcp_range: e.target.value})} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-xs font-mono" />
            </div>
            <button 
              onClick={createHotspot}
              disabled={loading}
              className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
            >
              Provision Portal
            </button>
          </div>
        </div>

        {/* Portal Instance List */}
        <div className="lg:col-span-2 space-y-4">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Provisioned Segments</h4>
          {hotspots.length > 0 ? hotspots.map(hs => (
            <div key={hs.interface} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center justify-between group">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl shadow-xl shadow-slate-900/10">🏛️</div>
                <div>
                  <h5 className="font-black text-slate-900 text-sm flex items-center gap-2 uppercase tracking-tight">
                    Portal: {hs.interface}
                    <span className="text-[9px] bg-green-50 text-green-600 px-2 py-0.5 rounded font-black">STABLE</span>
                  </h5>
                  <p className="text-[10px] text-slate-500 font-bold tracking-tight mt-1">
                    NET: <span className="text-slate-900 font-mono">{hs.ip_address}</span> • SCOPE: <span className="text-slate-900 font-mono">{hs.dhcp_range}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => deleteHotspot(hs.interface)}
                className="bg-red-50 text-red-600 px-5 py-2.5 rounded-xl font-black text-[9px] uppercase hover:bg-red-100 transition-all opacity-0 group-hover:opacity-100"
              >
                UNPROVISION
              </button>
            </div>
          )) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[2.5rem]">
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No Captive Portal Segments Found</p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
};

export default NetworkSettings;