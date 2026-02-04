import React, { useState, useEffect } from 'react';

interface NetworkInterface {
  name: string;
  type: 'ethernet' | 'wifi' | 'bridge' | 'vlan' | 'loopback' | 'tunnel' | 'ppp';
  status: 'up' | 'down' | 'disabled';
  mac: string;
  ip?: string;
  netmask?: string;
  gateway?: string;
  mtu: number;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxSpeed: number;
  txSpeed: number;
  rxErrors: number;
  txErrors: number;
  parentInterface?: string;
  vlanId?: number;
  comment?: string;
  lastSeen: string;
}

interface InterfaceGroup {
  parent: NetworkInterface;
  vlans: NetworkInterface[];
}

const InterfacesList: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [groupedInterfaces, setGroupedInterfaces] = useState<InterfaceGroup[]>([]);
  const [standaloneInterfaces, setStandaloneInterfaces] = useState<NetworkInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'status' | 'traffic'>('name');
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    loadInterfaces();
    
    // Refresh every 3 seconds for real-time data
    const interval = setInterval(loadInterfaces, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    groupInterfaces();
  }, [interfaces]);

  const loadInterfaces = async () => {
    try {
      const response = await fetch('/api/admin/interfaces', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInterfaces(data.interfaces || []);
      }
    } catch (err) {
      console.error('Failed to load interfaces:', err);
    } finally {
      setLoading(false);
    }
  };

  const groupInterfaces = () => {
    const groups: InterfaceGroup[] = [];
    const standalone: NetworkInterface[] = [];
    const processed = new Set<string>();

    // First pass: find parent interfaces and their VLANs
    interfaces.forEach(iface => {
      if (processed.has(iface.name)) return;

      if (iface.type === 'vlan' && iface.parentInterface) {
        // This is a VLAN, skip for now
        return;
      }

      // Find all VLANs for this interface
      const vlans = interfaces.filter(vlan => 
        vlan.type === 'vlan' && vlan.parentInterface === iface.name
      );

      if (vlans.length > 0) {
        groups.push({
          parent: iface,
          vlans: vlans.sort((a, b) => (a.vlanId || 0) - (b.vlanId || 0))
        });
        processed.add(iface.name);
        vlans.forEach(vlan => processed.add(vlan.name));
      } else {
        standalone.push(iface);
        processed.add(iface.name);
      }
    });

    setGroupedInterfaces(groups);
    setStandaloneInterfaces(standalone);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up': return 'text-green-600 bg-green-50';
      case 'down': return 'text-red-600 bg-red-50';
      case 'disabled': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'ethernet': return '🔌';
      case 'wifi': return '📶';
      case 'bridge': return '🌉';
      case 'vlan': return '🏷️';
      case 'loopback': return '🔄';
      case 'tunnel': return '🚇';
      case 'ppp': return '📞';
      default: return '❓';
    }
  };

  const toggleGroup = (interfaceName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(interfaceName)) {
      newExpanded.delete(interfaceName);
    } else {
      newExpanded.add(interfaceName);
    }
    setExpandedGroups(newExpanded);
  };

  const renderInterfaceRow = (iface: NetworkInterface, isVlan = false, isLast = false) => {
    const totalTraffic = iface.rxSpeed + iface.txSpeed;
    const maxBarWidth = 100; // Maximum width for traffic bar

    return (
      <tr key={iface.name} className={`border-b border-gray-100 hover:bg-gray-50 ${isVlan ? 'bg-blue-25' : ''}`}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {isVlan && (
              <div className={`w-4 ${isLast ? 'border-l border-b' : 'border-l'} border-gray-300 h-6 -ml-2`}>
                <div className="w-3 border-b border-gray-300 mt-3"></div>
              </div>
            )}
            <span className="text-lg">{getTypeIcon(iface.type)}</span>
            <div>
              <div className="font-medium text-gray-900">
                {iface.name}
                {iface.vlanId && <span className="text-blue-600">.{iface.vlanId}</span>}
              </div>
              {iface.comment && (
                <div className="text-xs text-gray-500">{iface.comment}</div>
              )}
            </div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <span className="text-sm text-gray-600 capitalize">{iface.type}</span>
        </td>
        
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(iface.status)}`}>
            {iface.status.toUpperCase()}
          </span>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="text-gray-900">{iface.ip || '-'}</div>
            {iface.netmask && (
              <div className="text-xs text-gray-500">{iface.netmask}</div>
            )}
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-xs text-gray-600 font-mono">
            {iface.mac}
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="text-blue-600">↓ {formatSpeed(iface.rxSpeed)}</div>
            <div className="text-green-600">↑ {formatSpeed(iface.txSpeed)}</div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="text-gray-900">{formatBytes(iface.rxBytes)}</div>
            <div className="text-gray-500">{formatBytes(iface.txBytes)}</div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="w-full">
            {/* Traffic Load Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${Math.min((totalTraffic / (10 * 1024 * 1024)) * 100, 100)}%` // Scale to 10MB/s max
                }}
              ></div>
            </div>
            <div className="text-xs text-gray-500 text-center">
              {totalTraffic > 0 ? formatSpeed(totalTraffic) : 'Idle'}
            </div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="text-red-600">{iface.rxErrors}</div>
            <div className="text-red-600">{iface.txErrors}</div>
          </div>
        </td>
      </tr>
    );
  };

  const renderInterfaceGroup = (group: InterfaceGroup) => {
    const isExpanded = expandedGroups.has(group.parent.name);
    
    return (
      <React.Fragment key={group.parent.name}>
        <tr className="border-b border-gray-200 bg-gray-50">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleGroup(group.parent.name)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  ▶
                </span>
              </button>
              <span className="text-lg">{getTypeIcon(group.parent.type)}</span>
              <div>
                <div className="font-medium text-gray-900">
                  {group.parent.name}
                  <span className="ml-2 text-xs text-gray-500">
                    ({group.vlans.length} VLAN{group.vlans.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {group.parent.comment && (
                  <div className="text-xs text-gray-500">{group.parent.comment}</div>
                )}
              </div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <span className="text-sm text-gray-600 capitalize">{group.parent.type}</span>
          </td>
          
          <td className="px-4 py-3">
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(group.parent.status)}`}>
              {group.parent.status.toUpperCase()}
            </span>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div className="text-gray-900">{group.parent.ip || '-'}</div>
              {group.parent.netmask && (
                <div className="text-xs text-gray-500">{group.parent.netmask}</div>
              )}
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-xs text-gray-600 font-mono">
              {group.parent.mac}
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div className="text-blue-600">↓ {formatSpeed(group.parent.rxSpeed)}</div>
              <div className="text-green-600">↑ {formatSpeed(group.parent.txSpeed)}</div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div className="text-gray-900">{formatBytes(group.parent.rxBytes)}</div>
              <div className="text-gray-500">{formatBytes(group.parent.txBytes)}</div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="w-full">
              {/* Traffic Load Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(((group.parent.rxSpeed + group.parent.txSpeed) / (10 * 1024 * 1024)) * 100, 100)}%`
                  }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 text-center">
                {(group.parent.rxSpeed + group.parent.txSpeed) > 0 ? 
                  formatSpeed(group.parent.rxSpeed + group.parent.txSpeed) : 'Idle'}
              </div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div className="text-red-600">{group.parent.rxErrors}</div>
              <div className="text-red-600">{group.parent.txErrors}</div>
            </div>
          </td>
        </tr>
        
        {/* VLAN interfaces */}
        {isExpanded && group.vlans.map((vlan, index) => 
          renderInterfaceRow(vlan, true, index === group.vlans.length - 1)
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading interfaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Interfaces</h1>
            <p className="text-gray-600 mt-1">Network interface management and monitoring</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Filter */}
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">All Types</option>
              <option value="ethernet">Ethernet</option>
              <option value="wifi">WiFi</option>
              <option value="bridge">Bridge</option>
              <option value="vlan">VLAN</option>
              <option value="tunnel">Tunnel</option>
            </select>
            
            {/* Sort */}
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="name">Sort by Name</option>
              <option value="type">Sort by Type</option>
              <option value="status">Sort by Status</option>
              <option value="traffic">Sort by Traffic</option>
            </select>
            
            <button 
              onClick={loadInterfaces}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Interfaces Table */}
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Interface
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    MAC Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Speed
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Traffic
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Load
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Errors
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {/* Grouped interfaces (parent + VLANs) */}
                {groupedInterfaces.map(group => renderInterfaceGroup(group))}
                
                {/* Standalone interfaces */}
                {standaloneInterfaces.map(iface => renderInterfaceRow(iface))}
                
                {interfaces.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                      No interfaces found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Statistics Summary */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-blue-600">{interfaces.length}</div>
            <div className="text-sm text-gray-600">Total Interfaces</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-green-600">
              {interfaces.filter(i => i.status === 'up').length}
            </div>
            <div className="text-sm text-gray-600">Active Interfaces</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-purple-600">
              {interfaces.filter(i => i.type === 'vlan').length}
            </div>
            <div className="text-sm text-gray-600">VLAN Interfaces</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl font-bold text-orange-600">
              {formatSpeed(interfaces.reduce((sum, i) => sum + i.rxSpeed + i.txSpeed, 0))}
            </div>
            <div className="text-sm text-gray-600">Total Traffic</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterfacesList;