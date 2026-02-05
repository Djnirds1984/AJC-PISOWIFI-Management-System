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

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'up': return 'status-success';
      case 'down': return 'status-danger';
      case 'disabled': return 'status-secondary';
      default: return 'status-secondary';
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

    return (
      <tr key={iface.name} style={{ borderBottom: '1px solid var(--gray-200)' }}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {isVlan && (
              <div style={{ 
                width: '1rem', 
                borderLeft: '1px solid var(--gray-300)', 
                borderBottom: isLast ? '1px solid var(--gray-300)' : 'none',
                height: '1.5rem',
                marginLeft: '-0.5rem'
              }}>
                <div style={{ 
                  width: '0.75rem', 
                  borderBottom: '1px solid var(--gray-300)', 
                  marginTop: '0.75rem' 
                }}></div>
              </div>
            )}
            <span className="icon">{getTypeIcon(iface.type)}</span>
            <div>
              <div className="font-medium">
                {iface.name}
                {iface.vlanId && <span className="text-primary">.{iface.vlanId}</span>}
              </div>
              {iface.comment && (
                <div className="text-xs text-muted">{iface.comment}</div>
              )}
            </div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <span className="text-sm text-muted capitalize">{iface.type}</span>
        </td>
        
        <td className="px-4 py-3">
          <span className={`status ${getStatusClass(iface.status)}`}>
            {iface.status.toUpperCase()}
          </span>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div>{iface.ip || '-'}</div>
            {iface.netmask && (
              <div className="text-xs text-muted">{iface.netmask}</div>
            )}
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-xs text-muted font-mono">
            {iface.mac}
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="text-primary">↓ {formatSpeed(iface.rxSpeed)}</div>
            <div className="text-accent">↑ {formatSpeed(iface.txSpeed)}</div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div>{formatBytes(iface.rxBytes)}</div>
            <div className="text-muted">{formatBytes(iface.txBytes)}</div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="w-full">
            {/* Traffic Load Bar */}
            <div className="progress mb-1">
              <div 
                className="progress-bar"
                style={{ 
                  width: `${Math.min((totalTraffic / (10 * 1024 * 1024)) * 100, 100)}%`,
                  background: 'linear-gradient(90deg, var(--primary), var(--accent))'
                }}
              ></div>
            </div>
            <div className="text-xs text-muted text-center">
              {totalTraffic > 0 ? formatSpeed(totalTraffic) : 'Idle'}
            </div>
          </div>
        </td>
        
        <td className="px-4 py-3">
          <div className="text-sm">
            <div className="text-danger">{iface.rxErrors}</div>
            <div className="text-danger">{iface.txErrors}</div>
          </div>
        </td>
      </tr>
    );
  };

  const renderInterfaceGroup = (group: InterfaceGroup) => {
    const isExpanded = expandedGroups.has(group.parent.name);
    
    return (
      <React.Fragment key={group.parent.name}>
        <tr style={{ borderBottom: '1px solid var(--gray-300)', background: 'var(--gray-50)' }}>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleGroup(group.parent.name)}
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.25rem' }}
              >
                <span style={{ transform: isExpanded ? 'rotate(90deg)' : '', transition: 'var(--transition)' }}>
                  ▶
                </span>
              </button>
              <span className="icon">{getTypeIcon(group.parent.type)}</span>
              <div>
                <div className="font-medium">
                  {group.parent.name}
                  <span className="ml-2 text-xs text-muted">
                    ({group.vlans.length} VLAN{group.vlans.length !== 1 ? 's' : ''})
                  </span>
                </div>
                {group.parent.comment && (
                  <div className="text-xs text-muted">{group.parent.comment}</div>
                )}
              </div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <span className="text-sm text-muted capitalize">{group.parent.type}</span>
          </td>
          
          <td className="px-4 py-3">
            <span className={`status ${getStatusClass(group.parent.status)}`}>
              {group.parent.status.toUpperCase()}
            </span>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div>{group.parent.ip || '-'}</div>
              {group.parent.netmask && (
                <div className="text-xs text-muted">{group.parent.netmask}</div>
              )}
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-xs text-muted font-mono">
              {group.parent.mac}
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div className="text-primary">↓ {formatSpeed(group.parent.rxSpeed)}</div>
              <div className="text-accent">↑ {formatSpeed(group.parent.txSpeed)}</div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div>{formatBytes(group.parent.rxBytes)}</div>
              <div className="text-muted">{formatBytes(group.parent.txBytes)}</div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="w-full">
              <div className="progress mb-1">
                <div 
                  className="progress-bar"
                  style={{ 
                    width: `${Math.min(((group.parent.rxSpeed + group.parent.txSpeed) / (10 * 1024 * 1024)) * 100, 100)}%`,
                    background: 'linear-gradient(90deg, var(--primary), var(--accent))'
                  }}
                ></div>
              </div>
              <div className="text-xs text-muted text-center">
                {(group.parent.rxSpeed + group.parent.txSpeed) > 0 ? 
                  formatSpeed(group.parent.rxSpeed + group.parent.txSpeed) : 'Idle'}
              </div>
            </div>
          </td>
          
          <td className="px-4 py-3">
            <div className="text-sm">
              <div className="text-danger">{group.parent.rxErrors}</div>
              <div className="text-danger">{group.parent.txErrors}</div>
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
      <div className="flex items-center justify-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <div className="loading mb-4" style={{ width: '2rem', height: '2rem' }}></div>
          <p className="text-muted">Loading interfaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="card-title">Network Interfaces</h1>
            <p className="text-muted mt-1">Interface management and monitoring</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Filter */}
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="input select text-sm"
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
              className="input select text-sm"
            >
              <option value="name">Sort by Name</option>
              <option value="type">Sort by Type</option>
              <option value="status">Sort by Status</option>
              <option value="traffic">Sort by Traffic</option>
            </select>
            
            <button 
              onClick={loadInterfaces}
              className="btn btn-primary"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Interfaces Table */}
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Interface</th>
                <th>Type</th>
                <th>Status</th>
                <th>IP Address</th>
                <th>MAC Address</th>
                <th>Speed</th>
                <th>Traffic</th>
                <th>Load</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {/* Grouped interfaces (parent + VLANs) */}
              {groupedInterfaces.map(group => renderInterfaceGroup(group))}
              
              {/* Standalone interfaces */}
              {standaloneInterfaces.map(iface => renderInterfaceRow(iface))}
              
              {interfaces.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">
                    No interfaces found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Statistics Summary */}
      <div className="stats-grid mt-6">
        <div className="stat-card">
          <div className="stat-value text-primary">{interfaces.length}</div>
          <div className="stat-label">Total Interfaces</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value text-accent">
            {interfaces.filter(i => i.status === 'up').length}
          </div>
          <div className="stat-label">Active Interfaces</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value text-warning">
            {interfaces.filter(i => i.type === 'vlan').length}
          </div>
          <div className="stat-label">VLAN Interfaces</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value text-secondary">
            {formatSpeed(interfaces.reduce((sum, i) => sum + i.rxSpeed + i.txSpeed, 0))}
          </div>
          <div className="stat-label">Total Traffic</div>
        </div>
      </div>
    </div>
  );
};

export default InterfacesList;