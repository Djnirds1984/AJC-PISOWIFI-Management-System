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

  const formatUptime = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days}d ${remainingHours}h`;
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
        <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
          Loading traffic data...
        </div>
      );
    }

    const interfaceData = getTrafficForInterface(selectedInterface);
    const maxSpeed = Math.max(
      ...interfaceData.map(d => Math.max(d.rxSpeed, d.txSpeed)),
      1024 // Minimum 1KB scale
    );

    return (
      <div className="h-32 relative">
        <svg width="100%" height="100%" className="absolute inset-0">
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="20" height="16" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 16" fill="none" stroke="#f1f5f9" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Traffic lines */}
          {interfaceData.length > 1 && (
            <>
              {/* RX (Download) line - Blue */}
              <polyline
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                points={interfaceData.map((point, index) => {
                  const x = (index / (interfaceData.length - 1)) * 100;
                  const y = 100 - (point.rxSpeed / maxSpeed) * 90;
                  return `${x}%,${y}%`;
                }).join(' ')}
              />
              
              {/* TX (Upload) line - Green */}
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                points={interfaceData.map((point, index) => {
                  const x = (index / (interfaceData.length - 1)) * 100;
                  const y = 100 - (point.txSpeed / maxSpeed) * 90;
                  return `${x}%,${y}%`;
                }).join(' ')}
              />
            </>
          )}
        </svg>
        
        {/* Legend */}
        <div className="absolute top-2 right-2 text-xs space-y-1">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-blue-500"></div>
            <span className="text-gray-600">RX</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-green-500"></div>
            <span className="text-gray-600">TX</span>
          </div>
        </div>
        
        {/* Current speeds */}
        <div className="absolute bottom-2 left-2 text-xs space-y-1">
          <div className="text-blue-600">
            ↓ {formatSpeed(interfaceData[interfaceData.length - 1]?.rxSpeed || 0)}
          </div>
          <div className="text-green-600">
            ↑ {formatSpeed(interfaceData[interfaceData.length - 1]?.txSpeed || 0)}
          </div>
        </div>
      </div>
    );
  };

  const getCpuColor = (usage: number) => {
    if (usage < 30) return 'bg-green-500';
    if (usage < 60) return 'bg-yellow-500';
    if (usage < 80) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getSystemStatus = () => {
    if (!systemInfo) return { status: 'Loading...', color: 'text-gray-500' };
    if (systemInfo.cpuTemp > 80 || systemInfo.cpuLoad > 90) {
      return { status: 'System Warning', color: 'text-red-500' };
    }
    return { status: 'System Online', color: 'text-green-500' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading system information...</p>
        </div>
      </div>
    );
  }

  const status = getSystemStatus();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">📊</span>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${status.color === 'text-green-500' ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className={`text-sm font-medium ${status.color}`}>{status.status}</span>
          </div>
        </div>
        
        <div className="mt-2 text-center">
          <p className="text-gray-600 text-sm">
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

      <div className="p-4 space-y-4">
        {/* System Info Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">ℹ️</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">System Info</h2>
          </div>
          
          {systemInfo && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600 mb-1">Device Model</p>
                <p className="font-medium text-gray-900">{systemInfo.deviceModel}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-600 mb-1">System</p>
                <p className="font-medium text-gray-900">{systemInfo.system}</p>
              </div>
              
              <div>
                <p className="text-gray-600 mb-1">CPU Temp</p>
                <p className="font-medium text-gray-900">{systemInfo.cpuTemp.toFixed(1)}°C</p>
              </div>
              <div className="text-right">
                <p className="text-gray-600 mb-1">CPU Load</p>
                <p className="font-medium text-gray-900">{systemInfo.cpuLoad.toFixed(1)}%</p>
              </div>
              
              <div>
                <p className="text-gray-600 mb-1">RAM Usage</p>
                <p className="font-medium text-gray-900">
                  {formatBytes(systemInfo.ramUsage.used)} / {formatBytes(systemInfo.ramUsage.total)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-600 mb-1">Storage</p>
                <p className="font-medium text-gray-900">
                  Used: {formatBytes(systemInfo.storage.used)} / Total: {formatBytes(systemInfo.storage.total)}
                </p>
              </div>
              
              <div className="col-span-2">
                <p className="text-gray-600 mb-1">Uptime</p>
                <p className="font-medium text-gray-900">{formatUptime(systemInfo.uptime)}</p>
              </div>
            </div>
          )}
        </div>

        {/* CPU Usage Card - Made Smaller */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚙️</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">CPU Usage</h2>
          </div>
          
          {systemInfo && (
            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-medium text-gray-600">AVG</span>
                  <span className="text-xs font-medium text-gray-900">{systemInfo.cpuLoad.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full transition-all duration-300 ${getCpuColor(systemInfo.cpuLoad)}`}
                    style={{ width: `${Math.min(systemInfo.cpuLoad, 100)}%` }}
                  ></div>
                </div>
              </div>
              
              {/* Show only first 4 cores to save space */}
              {systemInfo.cpuCores.slice(0, 4).map((usage, index) => (
                <div key={index}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-600">CPU {index + 1}</span>
                    <span className="text-xs font-medium text-gray-900">{usage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className={`h-1 rounded-full transition-all duration-300 ${getCpuColor(usage)}`}
                      style={{ width: `${Math.min(usage, 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Network Traffic Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Network Traffic</h2>
            </div>
            
            {/* Interface Dropdown */}
            <select 
              value={selectedInterface} 
              onChange={(e) => setSelectedInterface(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {availableInterfaces.map(iface => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
          </div>
          
          {renderTrafficGraph()}
        </div>

        {/* Clients Status Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">👥</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Clients Status</h2>
          </div>
          
          {clientsStatus && (
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{clientsStatus.online}</p>
                <p className="text-xs text-green-700 font-medium">Online Now</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{clientsStatus.total}</p>
                <p className="text-xs text-blue-700 font-medium">Total Devices</p>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{clientsStatus.activeVouchers}</p>
                <p className="text-xs text-purple-700 font-medium">Active Vouchers</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{clientsStatus.activeCoin}</p>
                <p className="text-xs text-yellow-700 font-medium">Coin Sessions</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">⚡</span>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Quick Actions</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button className="p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors">
              <div className="text-blue-600 text-lg mb-1">🔄</div>
              <p className="text-xs font-medium text-blue-700">Restart System</p>
            </button>
            <button className="p-3 bg-green-50 hover:bg-green-100 rounded-lg border border-green-200 transition-colors">
              <div className="text-green-600 text-lg mb-1">🧹</div>
              <p className="text-xs font-medium text-green-700">Clear Cache</p>
            </button>
            <button className="p-3 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors">
              <div className="text-purple-600 text-lg mb-1">📊</div>
              <p className="text-xs font-medium text-purple-700">View Logs</p>
            </button>
            <button className="p-3 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-colors">
              <div className="text-orange-600 text-lg mb-1">⚙️</div>
              <p className="text-xs font-medium text-orange-700">Settings</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemDashboard;