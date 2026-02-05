import React, { useState, useEffect } from 'react';

interface SystemInfo {
  deviceModel: string;
  system: string;
  cpuTemp: number;
  cpuLoad: number;
  ramUsage: { used: number; total: number };
  storage: { used: number; total: number };
  uptime: number;
  cpuCores: number[];
}

interface ClientsStatus {
  online: number;
  total: number;
  activeVouchers: number;
  activeCoin: number;
}

interface NetworkInterface {
  name: string;
  rxBytes: number;
  txBytes: number;
  rxSpeed: number;
  txSpeed: number;
}

interface TrafficData {
  interfaces: NetworkInterface[];
  timestamp: number;
}

const SystemDashboard: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [clientsStatus, setClientsStatus] = useState<ClientsStatus | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);
  const [availableInterfaces, setAvailableInterfaces] = useState<string[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadSystemInfo();
    loadClientsStatus();
    loadTrafficData();
    
    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Refresh system info every 5 seconds
    const systemInterval = setInterval(() => {
      loadSystemInfo();
      loadClientsStatus();
    }, 5000);

    // Refresh traffic data every 2 seconds
    const trafficInterval = setInterval(() => {
      loadTrafficData();
    }, 2000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(systemInterval);
      clearInterval(trafficInterval);
    };
  }, [selectedInterface]);

  const loadSystemInfo = async () => {
    try {
      const response = await fetch('/api/admin/system-info', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(data);
      }
    } catch (err) {
      console.error('Failed to load system info:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadClientsStatus = async () => {
    try {
      const response = await fetch('/api/admin/clients-status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setClientsStatus(data);
      }
    } catch (err) {
      console.error('Failed to load clients status:', err);
    }
  };

  const loadTrafficData = async () => {
    try {
      const response = await fetch('/api/admin/network-traffic', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Set available interfaces on first load
        if (availableInterfaces.length === 0 && data.interfaces.length > 0) {
          const interfaceNames = data.interfaces.map((iface: NetworkInterface) => iface.name);
          setAvailableInterfaces(interfaceNames);
          
          // Auto-select first non-loopback interface
          const defaultInterface = interfaceNames.find((name: string) => 
            !name.includes('lo') && !name.includes('127.0.0.1')
          ) || interfaceNames[0];
          setSelectedInterface(defaultInterface);
        }
        
        // Keep last 30 data points (1 minute of history at 2-second intervals)
        setTrafficData(prev => {
          const newData = [...prev, { interfaces: data.interfaces, timestamp: Date.now() }];
          return newData.slice(-30);
        });
      }
    } catch (err) {
      console.error('Failed to load traffic data:', err);
    }
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

  const formatUptime = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}d ${remainingHours}h`;
  };

  const getCpuColor = (usage: number) => {
    if (usage < 30) return 'success';
    if (usage < 60) return 'warning';
    if (usage < 80) return 'warning';
    return 'danger';
  };

  const getTrafficForInterface = (interfaceName: string) => {
    return trafficData.map(data => {
      const iface = data.interfaces.find(i => i.name === interfaceName);
      return {
        timestamp: data.timestamp,
        rxSpeed: iface?.rxSpeed || 0,
        txSpeed: iface?.txSpeed || 0
      };
    });
  };

  const renderTrafficGraph = () => {
    if (!selectedInterface || trafficData.length < 2) {
      return (
        <div className="flex items-center justify-center text-muted text-sm" style={{ height: '160px' }}>
          Loading traffic data...
        </div>
      );
    }

    const interfaceData = getTrafficForInterface(selectedInterface);
    const maxSpeed = Math.max(
      ...interfaceData.map(d => Math.max(d.rxSpeed, d.txSpeed)),
      1024 // Minimum 1KB scale
    );

    // Create smooth curve points
    const createSmoothPath = (data: any[], isRx: boolean) => {
      if (data.length < 2) return '';
      
      const points = data.map((point, index) => {
        const x = (index / (data.length - 1)) * 100;
        const speed = isRx ? point.rxSpeed : point.txSpeed;
        const y = 90 - (speed / maxSpeed) * 80; // Leave 10% margin at top and bottom
        return { x, y };
      });

      // Create smooth curve using quadratic bezier curves
      let path = `M ${points[0].x} ${points[0].y}`;
      
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        path += ` Q ${cpx} ${prev.y} ${curr.x} ${curr.y}`;
      }
      
      return path;
    };

    const createAreaPath = (data: any[], isRx: boolean) => {
      const linePath = createSmoothPath(data, isRx);
      if (!linePath) return '';
      
      const firstX = 0;
      const lastX = 100;
      const bottomY = 90;
      
      return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    };

    return (
      <div style={{ height: '160px', position: 'relative', background: 'var(--gray-50)', borderRadius: 'var(--radius)' }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            {/* Gradients for filled areas */}
            <linearGradient id="rxGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.05"/>
            </linearGradient>
            <linearGradient id="txGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.05"/>
            </linearGradient>
            
            {/* Grid pattern */}
            <pattern id="gridPattern" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="var(--gray-300)" strokeWidth="0.5" opacity="0.5"/>
            </pattern>
          </defs>
          
          {/* Grid background */}
          <rect width="100%" height="100%" fill="url(#gridPattern)" />
          
          {/* Traffic areas and lines */}
          {interfaceData.length > 1 && (
            <>
              {/* RX (Download) filled area */}
              <path
                d={createAreaPath(interfaceData, true)}
                fill="url(#rxGradient)"
              />
              
              {/* TX (Upload) filled area */}
              <path
                d={createAreaPath(interfaceData, false)}
                fill="url(#txGradient)"
              />
              
              {/* RX (Download) line */}
              <path
                d={createSmoothPath(interfaceData, true)}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="0.8"
              />
              
              {/* TX (Upload) line */}
              <path
                d={createSmoothPath(interfaceData, false)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="0.8"
              />
              
              {/* Data points */}
              {interfaceData.map((point, index) => {
                const x = (index / (interfaceData.length - 1)) * 100;
                const rxY = 90 - (point.rxSpeed / maxSpeed) * 80;
                const txY = 90 - (point.txSpeed / maxSpeed) * 80;
                
                return (
                  <g key={index}>
                    {/* RX point */}
                    <circle
                      cx={x}
                      cy={rxY}
                      r="0.8"
                      fill="var(--primary)"
                      opacity={index === interfaceData.length - 1 ? 1 : 0.6}
                    />
                    {/* TX point */}
                    <circle
                      cx={x}
                      cy={txY}
                      r="0.8"
                      fill="var(--accent)"
                      opacity={index === interfaceData.length - 1 ? 1 : 0.6}
                    />
                  </g>
                );
              })}
            </>
          )}
        </svg>
        
        {/* Interface name and current time */}
        <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem' }} className="text-xs">
          <div className="text-gray-700 font-medium">{selectedInterface}</div>
          <div className="text-muted">{currentTime.toLocaleTimeString('en-US', { 
            hour12: true, 
            hour: 'numeric', 
            minute: '2-digit' 
          })}</div>
        </div>
        
        {/* Current speeds */}
        <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }} className="text-xs text-right">
          <div className="text-primary font-medium">
            {formatSpeed(interfaceData[interfaceData.length - 1]?.rxSpeed || 0)}
          </div>
          <div className="text-accent font-medium">
            {formatSpeed(interfaceData[interfaceData.length - 1]?.txSpeed || 0)}
          </div>
        </div>
        
        {/* Legend at bottom */}
        <div style={{ position: 'absolute', bottom: '0.5rem', left: '0.5rem' }} className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div style={{ width: '0.75rem', height: '0.25rem', background: 'var(--primary)', borderRadius: 'var(--radius-sm)' }}></div>
            <span className="text-muted">Download</span>
          </div>
          <div className="flex items-center gap-1">
            <div style={{ width: '0.75rem', height: '0.25rem', background: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}></div>
            <span className="text-muted">Upload</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center text-muted" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <div className="loading mb-4" style={{ width: '2rem', height: '2rem' }}></div>
          <p>Loading system information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="card mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="icon-lg text-primary">📊</div>
            <h1 className="card-title">System Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="status status-success">●</div>
            <span className="text-sm font-medium text-accent">System Online</span>
          </div>
        </div>
        
        <div className="mt-4 text-center">
          <p className="text-muted text-sm">
            {currentTime.toLocaleDateString('en-US', { 
              weekday: 'short', 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}, {currentTime.toLocaleTimeString('en-US', { 
              hour12: true,
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit'
            })}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid mb-6">
        {clientsStatus && (
          <>
            <div className="stat-card">
              <div className="stat-value text-accent">{clientsStatus.online}</div>
              <div className="stat-label">Online Now</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-primary">{clientsStatus.total}</div>
              <div className="stat-label">Total Devices</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-warning">{clientsStatus.activeVouchers}</div>
              <div className="stat-label">Active Vouchers</div>
            </div>
            <div className="stat-card">
              <div className="stat-value text-secondary">{clientsStatus.activeCoin}</div>
              <div className="stat-label">Coin Sessions</div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* System Info Card */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="icon">ℹ️</span>
              <h2 className="card-title">System Info</h2>
            </div>
          </div>
          
          {systemInfo && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted mb-1">Device Model</p>
                <p className="font-medium">{systemInfo.deviceModel}</p>
              </div>
              <div className="text-right">
                <p className="text-muted mb-1">System</p>
                <p className="font-medium">{systemInfo.system}</p>
              </div>
              
              <div>
                <p className="text-muted mb-1">CPU Temp</p>
                <p className="font-medium">{systemInfo.cpuTemp.toFixed(1)}°C</p>
              </div>
              <div className="text-right">
                <p className="text-muted mb-1">CPU Load</p>
                <p className="font-medium">{systemInfo.cpuLoad.toFixed(1)}%</p>
              </div>
              
              <div>
                <p className="text-muted mb-1">RAM Usage</p>
                <p className="font-medium">
                  {formatBytes(systemInfo.ramUsage.used)} / {formatBytes(systemInfo.ramUsage.total)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-muted mb-1">Storage</p>
                <p className="font-medium">
                  {formatBytes(systemInfo.storage.used)} / {formatBytes(systemInfo.storage.total)}
                </p>
              </div>
              
              <div style={{ gridColumn: 'span 2' }}>
                <p className="text-muted mb-1">Uptime</p>
                <p className="font-medium">{formatUptime(systemInfo.uptime)}</p>
              </div>
            </div>
          )}
        </div>

        {/* CPU Usage Card - Compact */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <span className="icon">⚙️</span>
              <h2 className="card-title">CPU Usage</h2>
            </div>
          </div>
          
          {systemInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-muted">AVG</span>
                  <span className="text-xs font-medium">{systemInfo.cpuLoad.toFixed(1)}%</span>
                </div>
                <div className="progress">
                  <div 
                    className={`progress-bar ${getCpuColor(systemInfo.cpuLoad)}`}
                    style={{ width: `${Math.min(systemInfo.cpuLoad, 100)}%` }}
                  ></div>
                </div>
              </div>
              
              {/* Show only first 4 cores to save space */}
              {systemInfo.cpuCores.slice(0, 4).map((usage, index) => (
                <div key={index}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-muted">CPU {index + 1}</span>
                    <span className="text-xs font-medium">{usage.toFixed(1)}%</span>
                  </div>
                  <div className="progress">
                    <div 
                      className={`progress-bar ${getCpuColor(usage)}`}
                      style={{ width: `${Math.min(usage, 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Network Traffic Card */}
      <div className="card mt-4">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="icon">📊</span>
              <h2 className="card-title">Network Interfaces</h2>
            </div>
            
            {/* Interface Dropdown */}
            <select 
              value={selectedInterface} 
              onChange={(e) => setSelectedInterface(e.target.value)}
              className="input select text-xs"
              style={{ width: 'auto', minWidth: '120px' }}
            >
              {availableInterfaces.map(iface => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
          </div>
        </div>
        
        {renderTrafficGraph()}
      </div>

      {/* Quick Actions */}
      <div className="card mt-4">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <span className="icon">⚡</span>
            <h2 className="card-title">Quick Actions</h2>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-3">
          <button className="btn btn-secondary p-3 flex-col">
            <div className="icon-lg mb-1">🔄</div>
            <span className="text-xs font-medium">Restart System</span>
          </button>
          <button className="btn btn-secondary p-3 flex-col">
            <div className="icon-lg mb-1">🧹</div>
            <span className="text-xs font-medium">Clear Cache</span>
          </button>
          <button className="btn btn-secondary p-3 flex-col">
            <div className="icon-lg mb-1">📊</div>
            <span className="text-xs font-medium">View Logs</span>
          </button>
          <button className="btn btn-secondary p-3 flex-col">
            <div className="icon-lg mb-1">⚙️</div>
            <span className="text-xs font-medium">Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SystemDashboard;