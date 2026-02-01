import React, { useState, useEffect } from 'react';
import { NetworkInterface } from '../../types';

interface WanInterface {
  interface: string;
  gateway: string;
  weight: number;
}

interface WanConnection {
  type: 'dhcp' | 'static' | 'pppoe';
  interface: string;
  gateway?: string;
  ip?: string;
  netmask?: string;
  dns1?: string;
  dns2?: string;
  pppoe_username?: string;
  pppoe_password?: string;
  weight: number;
}

interface MultiWanConfig {
  enabled: boolean;
  mode: 'pcc' | 'ecmp';
  pcc_method: 'both_addresses' | 'both_addresses_ports';
  primary_wan: WanConnection;
  secondary_interfaces: WanInterface[];
}

const MultiWanSettings: React.FC = () => {
  const [config, setConfig] = useState<MultiWanConfig>({
    enabled: false,
    mode: 'pcc',
    pcc_method: 'both_addresses',
    primary_wan: {
      type: 'dhcp',
      interface: '',
      weight: 1
    },
    secondary_interfaces: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableInterfaces, setAvailableInterfaces] = useState<NetworkInterface[]>([]);
  const [newInterface, setNewInterface] = useState<WanInterface>({ interface: '', gateway: '', weight: 1 });

  useEffect(() => {
    fetchConfig();
    fetchInterfaces();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/multiwan/config');
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (e) {
      console.error('Failed to fetch Multi-WAN config', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchInterfaces = async () => {
    try {
      const res = await fetch('/api/interfaces');
      const data = await res.json();
      if (Array.isArray(data)) {
        // Filter to show only ethernet, wifi, and vlan interfaces that are not loopback
        const filteredInterfaces = data.filter((iface: any) => 
          iface.type !== 'loopback' && 
          (iface.type === 'ethernet' || iface.type === 'wifi' || iface.type === 'vlan')
        );
        setAvailableInterfaces(filteredInterfaces);
      }
    } catch (e) {
      console.error('Failed to fetch interfaces:', e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/multiwan/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Multi-WAN settings saved successfully!');
      } else {
        alert('❌ Failed to save settings: ' + data.error);
      }
    } catch (e) {
      alert('❌ Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const addInterface = () => {
    let interfaceName = newInterface.interface;
    
    // Validate interface name
    if (!interfaceName || interfaceName === '') {
      alert('Please select an interface or enter a custom interface name.');
      return;
    }
    
    // Validate gateway
    if (!newInterface.gateway) {
      alert('Please enter a gateway IP.');
      return;
    }
    
    // Create interface object to add
    const interfaceToAdd = {
      interface: interfaceName,
      gateway: newInterface.gateway,
      weight: newInterface.weight
    };
    
    setConfig(prev => ({
      ...prev,
      secondary_interfaces: [...prev.secondary_interfaces, interfaceToAdd]
    }));
    
    // Reset form
    setNewInterface({ 
      interface: '', 
      gateway: '', 
      weight: 1 
    });
  };

  const removeInterface = (idx: number) => {
    setConfig(prev => ({
      ...prev,
      secondary_interfaces: prev.secondary_interfaces.filter((_, i) => i !== idx)
    }));
  };

  const getInterfaceDetails = (interfaceName: string) => {
    return availableInterfaces.find(iface => iface.name === interfaceName);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Multi-WAN Configuration...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Multi-WAN Management</h1>
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1">Load Balancing & Failover Control</p>
        </div>
        <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${config.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {config.enabled ? 'Active' : 'Disabled'}
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Configuration Card */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">General Settings</h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={config.enabled} onChange={e => setConfig({...config, enabled: e.target.checked})} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Mode Selection */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Load Balancing Mode</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button 
                                onClick={() => setConfig({...config, mode: 'pcc'})}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${config.mode === 'pcc' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                            >
                                <div className={`font-black text-sm uppercase ${config.mode === 'pcc' ? 'text-blue-700' : 'text-slate-700'}`}>PCC</div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Per Connection Classifier</div>
                            </button>
                            <button 
                                onClick={() => setConfig({...config, mode: 'ecmp'})}
                                className={`p-4 rounded-xl border-2 text-left transition-all ${config.mode === 'ecmp' ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-300'}`}
                            >
                                <div className={`font-black text-sm uppercase ${config.mode === 'ecmp' ? 'text-blue-700' : 'text-slate-700'}`}>ECMP</div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase mt-1">Equal Cost Multi-Path</div>
                            </button>
                        </div>
                    </div>

                    {/* Dynamic Rules based on Mode */}
                    {config.mode === 'pcc' && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in">
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">PCC Rules (Classifier)</label>
                             <div className="space-y-2">
                                <label className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                    <input 
                                        type="radio" 
                                        name="pcc_method" 
                                        checked={config.pcc_method === 'both_addresses'} 
                                        onChange={() => setConfig({...config, pcc_method: 'both_addresses'})}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <div className="font-bold text-xs text-slate-700 uppercase">Both Addresses</div>
                                        <div className="text-[9px] text-slate-400 font-medium">Src Address & Dst Address Hashing</div>
                                    </div>
                                </label>
                                <label className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                    <input 
                                        type="radio" 
                                        name="pcc_method" 
                                        checked={config.pcc_method === 'both_addresses_ports'} 
                                        onChange={() => setConfig({...config, pcc_method: 'both_addresses_ports'})}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                        <div className="font-bold text-xs text-slate-700 uppercase">Both Addresses and Ports</div>
                                        <div className="text-[9px] text-slate-400 font-medium">Src/Dst Address & Port Hashing (More Granular)</div>
                                    </div>
                                </label>
                             </div>
                        </div>
                    )}

                    {config.mode === 'ecmp' && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-in fade-in">
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">ECMP Rules</label>
                             <p className="text-xs text-slate-600 leading-relaxed">
                                ECMP uses routing metrics. Configure the <strong>Weight</strong> for each WAN interface below to control traffic distribution ratio (e.g., 1:1, 2:1).
                             </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Primary WAN Configuration */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Primary WAN</h3>
                </div>
                <div className="p-6 space-y-6">
                    {/* Connection Type */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Connection Type</label>
                            <div className="space-y-2">
                                {(['dhcp', 'static', 'pppoe'] as const).map(type => (
                                    <label 
                                        key={type}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                            config.primary_wan.type === type 
                                                ? 'border-blue-500 bg-blue-50' 
                                                : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <input 
                                            type="radio" 
                                            name="primary_connection_type" 
                                            checked={config.primary_wan.type === type} 
                                            onChange={() => setConfig({
                                                ...config, 
                                                primary_wan: {...config.primary_wan, type}
                                            })}
                                            className="text-blue-600 focus:ring-blue-500 w-4 h-4"
                                        />
                                        <span className="font-bold text-sm text-slate-700 capitalize">{type}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        
                        {/* Interface Selection */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Interface</label>
                            <select 
                                className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={config.primary_wan.interface}
                                onChange={e => setConfig({
                                    ...config, 
                                    primary_wan: {...config.primary_wan, interface: e.target.value}
                                })}
                            >
                                <option value="">Select Interface...</option>
                                {availableInterfaces.map(iface => (
                                    <option key={iface.name} value={iface.name}>
                                        {iface.name} ({iface.type.toUpperCase()}) - {iface.status.toUpperCase()} {iface.ip ? `| IP: ${iface.ip}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {/* Weight */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Weight</label>
                            <input 
                                type="number" 
                                min="1"
                                max="100"
                                className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={config.primary_wan.weight}
                                onChange={e => setConfig({
                                    ...config, 
                                    primary_wan: {...config.primary_wan, weight: parseInt(e.target.value) || 1}
                                })}
                            />
                        </div>
                    </div>
                    
                    {/* Connection-Specific Fields */}
                    {config.primary_wan.type === 'static' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">IP Address</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 192.168.1.100" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    value={config.primary_wan.ip || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, ip: e.target.value}
                                    })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Netmask</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 255.255.255.0" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    value={config.primary_wan.netmask || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, netmask: e.target.value}
                                    })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gateway</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 192.168.1.1" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    value={config.primary_wan.gateway || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, gateway: e.target.value}
                                    })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">DNS Server 1</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 8.8.8.8" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    value={config.primary_wan.dns1 || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, dns1: e.target.value}
                                    })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">DNS Server 2</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. 8.8.4.4" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    value={config.primary_wan.dns2 || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, dns2: e.target.value}
                                    })}
                                />
                            </div>
                        </div>
                    )}
                    
                    {config.primary_wan.type === 'pppoe' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Username</label>
                                <input 
                                    type="text" 
                                    placeholder="PPPoE username" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={config.primary_wan.pppoe_username || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, pppoe_username: e.target.value}
                                    })}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Password</label>
                                <input 
                                    type="password" 
                                    placeholder="PPPoE password" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={config.primary_wan.pppoe_password || ''}
                                    onChange={e => setConfig({
                                        ...config, 
                                        primary_wan: {...config.primary_wan, pppoe_password: e.target.value}
                                    })}
                                />
                            </div>
                        </div>
                    )}
                    
                    {/* Current Primary WAN Status */}
                    {config.primary_wan.interface && (
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <h4 className="font-bold text-slate-700 mb-2">Current Primary WAN</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="text-slate-600"><span className="font-semibold">Interface:</span> {config.primary_wan.interface}</div>
                                <div className="text-slate-600"><span className="font-semibold">Type:</span> {config.primary_wan.type.toUpperCase()}</div>
                                <div className="text-slate-600"><span className="font-semibold">Weight:</span> {config.primary_wan.weight}</div>
                                {config.primary_wan.gateway && (
                                    <div className="text-slate-600"><span className="font-semibold">Gateway:</span> {config.primary_wan.gateway}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* WAN Interface List */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">WAN Interfaces</h3>
                </div>
                <div className="p-6">
                    {/* Add New Interface */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="md:col-span-1">
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Interface</label>
                            {newInterface.interface === 'custom' ? (
                                <input 
                                    type="text" 
                                    placeholder="Enter custom interface name (e.g. eth2, ppp0)" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value=""
                                    onChange={e => setNewInterface({...newInterface, interface: e.target.value})}
                                />
                            ) : availableInterfaces.length > 0 ? (
                                <select 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newInterface.interface}
                                    onChange={e => setNewInterface({...newInterface, interface: e.target.value})}
                                >
                                    <option value="">Select Interface...</option>
                                    {availableInterfaces.map(iface => (
                                        <option key={iface.name} value={iface.name}>
                                            {iface.name} ({iface.type.toUpperCase()}) - {iface.status.toUpperCase()} {iface.ip ? `| IP: ${iface.ip}` : ''}
                                        </option>
                                    ))}
                                    <option value="custom">Custom (Manual Entry)</option>
                                </select>
                            ) : availableInterfaces.length === 0 ? (
                                <div className="text-sm text-slate-500 italic">
                                    No interfaces available
                                </div>
                            ) : (
                                <input 
                                    type="text" 
                                    placeholder="e.g. eth1" 
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newInterface.interface}
                                    onChange={e => setNewInterface({...newInterface, interface: e.target.value})}
                                />
                            )}
                        </div>
                        <div className="md:col-span-2">
                             <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Gateway IP</label>
                             <input 
                                type="text" 
                                placeholder="e.g. 192.168.1.1" 
                                className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                value={newInterface.gateway}
                                onChange={e => setNewInterface({...newInterface, gateway: e.target.value})}
                            />
                        </div>
                        <div className="md:col-span-1">
                             <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Weight</label>
                             <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    min="1"
                                    max="100"
                                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newInterface.weight}
                                    onChange={e => setNewInterface({...newInterface, weight: parseInt(e.target.value) || 1})}
                                />
                                <button 
                                    onClick={addInterface}
                                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    +
                                </button>
                             </div>
                        </div>
                    </div>

                    {/* List */}
                    <div className="space-y-3">
                        {config.secondary_interfaces.map((iface, idx) => {
                          const interfaceDetails = getInterfaceDetails(iface.interface);
                          return (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-xs uppercase ${interfaceDetails?.status === 'up' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {iface.interface.substring(0, 3)}
                                    </div>
                                    <div>
                                        <div className="font-black text-sm text-slate-800 uppercase">{iface.interface}</div>
                                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                          Type: {interfaceDetails?.type?.toUpperCase() || 'N/A'} • Status: {interfaceDetails?.status?.toUpperCase() || 'N/A'}
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">
                                          GW: {iface.gateway} • Weight: {iface.weight} {interfaceDetails?.ip ? `• IP: ${interfaceDetails.ip}` : ''}
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => removeInterface(idx)}
                                    className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    Remove
                                </button>
                            </div>
                          );
                        })}
                        {config.secondary_interfaces.length === 0 && (
                            <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase border-2 border-dashed border-slate-200 rounded-xl">
                                No secondary WAN interfaces configured
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex justify-end">
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
            </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
            <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-600/10">
                <h3 className="font-black uppercase tracking-widest text-sm mb-4">How it works</h3>
                <div className="space-y-4 text-xs leading-relaxed opacity-90">
                    <p>
                        <strong className="block text-indigo-200 mb-1 uppercase text-[10px]">PCC (Per Connection Classifier)</strong>
                        Divides traffic into multiple streams based on IP addresses or ports. This allows you to aggregate bandwidth from multiple ISP lines effectively.
                    </p>
                    <p>
                        <strong className="block text-indigo-200 mb-1 uppercase text-[10px]">ECMP (Equal Cost Multi-Path)</strong>
                        Uses standard routing protocols to balance traffic. Good for failover and simple load balancing based on route weights.
                    </p>
                    <div className="bg-indigo-500/30 p-3 rounded-lg border border-indigo-400/30 mt-4">
                        <span className="block font-black text-[9px] uppercase tracking-widest text-indigo-200 mb-1">Requirement</span>
                        Ensure you have multiple physical network interfaces (e.g., eth1, usb0) connected to different ISPs.
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default MultiWanSettings;
