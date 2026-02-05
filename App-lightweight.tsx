import React, { useState, useEffect } from 'react';
import { AdminTab, UserSession, Rate, WifiDevice } from './types';
import LandingPage from './components/Portal/LandingPage';
import SystemDashboard from './components/Admin/SystemDashboard-lightweight';
import InterfacesList from './components/Admin/InterfacesList-lightweight';
import RatesManager from './components/Admin/RatesManager';
import VoucherManager from './components/Admin/VoucherManager';
import NetworkSettings from './components/Admin/NetworkSettings';
import HardwareManager from './components/Admin/HardwareManager';
import SystemUpdater from './components/Admin/SystemUpdater';
import SystemSettings from './components/Admin/SystemSettings';
import DeviceManager from './components/Admin/DeviceManager';
import Login from './components/Admin/Login';
import ThemeSettings from './components/Admin/ThemeSettings';
import PortalEditor from './components/Admin/PortalEditor';
import PPPoEServer from './components/Admin/PPPoEServer';
import { MyMachines } from './components/Admin/MyMachines';
import BandwidthManager from './components/Admin/BandwidthManager';
import MultiWanSettings from './components/Admin/MultiWanSettings';
import ChatManager from './components/Admin/ChatManager';
import ZeroTierManager from './components/Admin/ZeroTierManager';
import { apiClient } from './lib/api';
import './styles/lightweight.css';

const App: React.FC = () => {
  const isCurrentlyAdminPath = () => {
    const path = window.location.pathname.toLowerCase();
    const hasAdminFlag = localStorage.getItem('ajc_admin_mode') === 'true';
    return path === '/admin' || path === '/admin/' || path.startsWith('/admin/') || hasAdminFlag;
  };

  const [isAdmin, setIsAdmin] = useState(isCurrentlyAdminPath());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>(AdminTab.Dashboard);
  const [licenseStatus, setLicenseStatus] = useState<{ isLicensed: boolean, isRevoked: boolean, canOperate: boolean }>({ isLicensed: true, isRevoked: false, canOperate: true });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rates, setRates] = useState<Rate[]>([]);
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [devices, setDevices] = useState<WifiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      
      // Check license status first
      try {
        const lic = await fetch('/api/license/status').then(r => r.json());
        setLicenseStatus(lic);
        if (lic.isRevoked) {
          setActiveTab(AdminTab.System);
        }
      } catch (e) {
        console.warn('Failed to fetch license status');
      }

      const [fetchedRates, sessions, fetchedDevices] = await Promise.all([
        apiClient.getRates(),
        apiClient.getSessions().catch(() => []),
        apiClient.getWifiDevices().catch(() => [])
      ]);
      setRates(fetchedRates);
      setActiveSessions(sessions);
      setDevices(fetchedDevices);
    } catch (err: any) {
      console.error('Backend connection failed:', err);
      setError(err.message || 'Connection to AJC Hardware failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleLocationChange = () => {
      const isNowAdmin = isCurrentlyAdminPath();
      setIsAdmin(isNowAdmin);
    };
    window.addEventListener('popstate', handleLocationChange);
    
    // Check authentication status
    const checkAuth = async () => {
      const token = localStorage.getItem('ajc_admin_token');
      if (token) {
        try {
          const res = await fetch('/api/admin/check-auth', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.authenticated) {
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem('ajc_admin_token');
            setIsAuthenticated(false);
          }
        } catch (e) {
          setIsAuthenticated(false);
        }
      }
    };
    checkAuth();

    // Restore session on mount
    restoreSession();

    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Sync state with backend timer
  useEffect(() => {
    const interval = setInterval(async () => {
      // Periodic refresh from server to ensure sync
      try {
        const sessions = await apiClient.getSessions();
        const fetchedDevices = await apiClient.getWifiDevices();
        setActiveSessions(sessions);
        setDevices(fetchedDevices);
      } catch (e) {
        // Local decrement as fallback for smooth UI - skip if paused
        setActiveSessions(prev => 
          prev.map(s => ({
            ...s,
            remainingSeconds: s.isPaused ? s.remainingSeconds : Math.max(0, s.remainingSeconds - 1)
          })).filter(s => s.remainingSeconds > 0)
        );
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleAdmin = () => {
    const nextState = !isAdmin;
    setIsAdmin(nextState);
    if (nextState) {
      localStorage.setItem('ajc_admin_mode', 'true');
      window.history.pushState({}, '', '/admin');
    } else {
      localStorage.removeItem('ajc_admin_mode');
      localStorage.removeItem('ajc_admin_token');
      setIsAuthenticated(false);
      window.history.pushState({}, '', '/');
    }
  };

  const handleAddSession = async (session: UserSession) => {
    try {
      setLoading(true);

      const coinSlot = (session as any).coinSlot as string | undefined;
      const coinSlotLockId = (session as any).coinSlotLockId as string | undefined;
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac: session.mac,
          minutes: Math.ceil(session.remainingSeconds / 60),
          pesos: session.totalPaid,
          slot: coinSlot || 'main',
          lockId: coinSlotLockId
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) {
          localStorage.setItem('ajc_session_token', data.token);
        }
        await loadData();
        if (data.message) {
          alert('✅ ' + data.message);
        } else {
          alert('✅ Internet access granted! Connection should activate automatically.');
        }
        
        setTimeout(() => {
          if (window.location.pathname === '/') {
            window.location.reload();
          }
        }, 2000);
      } else {
        alert('❌ Failed to authorize session: ' + data.error);
      }
    } catch (e) {
      alert('❌ Network error authorizing connection.');
    } finally {
      const coinSlot = (session as any).coinSlot as string | undefined;
      const coinSlotLockId = (session as any).coinSlotLockId as string | undefined;
      if (coinSlot && coinSlotLockId) {
        fetch('/api/coinslot/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot: coinSlot, lockId: coinSlotLockId })
        }).catch(() => {});
      }
      setLoading(false);
    }
  };

  const updateRates = async () => {
    await loadData();
  };

  const restoreSession = async (retries = 5) => {
    const sessionToken = localStorage.getItem('ajc_session_token');
    if (sessionToken) {
      try {
        const res = await fetch('/api/sessions/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sessionToken })
        });
        
        if (res.status === 400 && retries > 0) {
          console.log(`[Session] Restore failed (400), retrying... (${retries} left)`);
          setTimeout(() => restoreSession(retries - 1), 2000);
          return;
        }

        const data = await res.json();
        if (data.success) {
          console.log('Session restored successfully');
          if (data.migrated) {
            console.log('Session migrated to new network info');
            loadData();
          }
        } else if (res.status === 404) {
          console.log('[Session] Token expired or invalid');
          localStorage.removeItem('ajc_session_token');
        }
      } catch (e) {
        console.error('Failed to restore session:', e);
        if (retries > 0) {
          setTimeout(() => restoreSession(retries - 1), 2000);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
        <div className="text-center">
          <div className="loading" style={{ width: '3rem', height: '3rem', marginBottom: '1rem' }}></div>
          <p className="text-primary font-semibold uppercase text-sm">AJC Core Initializing...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6" style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
        <div className="card text-center" style={{ maxWidth: '400px', width: '100%' }}>
          <div className="icon-lg text-danger mb-4" style={{ fontSize: '3rem' }}>⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2 uppercase">System Offline</h2>
          <p className="text-muted text-sm mb-6">{error}</p>
          <button onClick={() => { setLoading(true); loadData(); }} className="btn btn-primary w-full">
            Retry System Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      {/* Admin Toggle Button */}
      <button 
        onClick={handleToggleAdmin}
        className="btn btn-primary"
        style={{ 
          position: 'fixed', 
          bottom: '1rem', 
          right: '1rem', 
          zIndex: 999,
          display: window.innerWidth >= 768 ? 'flex' : 'none'
        }}
      >
        <span>{isAdmin ? '🚪' : '🔐'}</span>
        {isAdmin ? 'Exit Admin' : 'Admin Login'}
      </button>

      {isAdmin ? (
        isAuthenticated ? (
          <div className="flex" style={{ height: '100vh' }}>
            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
              <div className="sidebar-header">
                <div className="flex items-center justify-between">
                  {sidebarOpen ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="icon-lg text-primary font-bold">AJC</div>
                        <h1 className="font-bold text-lg">PISOWIFI</h1>
                      </div>
                      <button 
                        onClick={() => setSidebarOpen(false)} 
                        className="btn btn-sm btn-secondary"
                        style={{ display: window.innerWidth < 768 ? 'block' : 'none' }}
                      >
                        ✕
                      </button>
                    </>
                  ) : (
                    <div className="icon-lg text-primary font-bold">A</div>
                  )}
                </div>
              </div>
              
              <nav className="sidebar-nav">
                <NavItem active={activeTab === AdminTab.Dashboard} onClick={() => setActiveTab(AdminTab.Dashboard)} icon="📊" label="Dashboard" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Interfaces} onClick={() => setActiveTab(AdminTab.Interfaces)} icon="🔌" label="Interfaces" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Rates} onClick={() => setActiveTab(AdminTab.Rates)} icon="💰" label="Pricing" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Vouchers} onClick={() => setActiveTab(AdminTab.Vouchers)} icon="🎫" label="Vouchers" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Network} onClick={() => setActiveTab(AdminTab.Network)} icon="🌐" label="Network" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Devices} onClick={() => setActiveTab(AdminTab.Devices)} icon="📱" label="Devices" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Hardware} onClick={() => setActiveTab(AdminTab.Hardware)} icon="🔧" label="Hardware" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Themes} onClick={() => setActiveTab(AdminTab.Themes)} icon="🎨" label="Themes" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.PortalEditor} onClick={() => setActiveTab(AdminTab.PortalEditor)} icon="🖥️" label="Portal" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.PPPoE} onClick={() => setActiveTab(AdminTab.PPPoE)} icon="📞" label="PPPoE" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Bandwidth} onClick={() => setActiveTab(AdminTab.Bandwidth)} icon="📶" label="QoS" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.MultiWan} onClick={() => setActiveTab(AdminTab.MultiWan)} icon="🔀" label="Multi-WAN" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Chat} onClick={() => setActiveTab(AdminTab.Chat)} icon="💬" label="Chat" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.ZeroTier} onClick={() => setActiveTab(AdminTab.ZeroTier)} icon="🕸️" label="ZeroTier" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.Machines} onClick={() => setActiveTab(AdminTab.Machines)} icon="🤖" label="Machines" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
                <NavItem active={activeTab === AdminTab.System} onClick={() => setActiveTab(AdminTab.System)} icon="⚙️" label="System" collapsed={!sidebarOpen} />
                <NavItem active={activeTab === AdminTab.Updater} onClick={() => setActiveTab(AdminTab.Updater)} icon="🚀" label="Updater" collapsed={!sidebarOpen} disabled={licenseStatus.isRevoked} />
              </nav>

              <div className="p-4" style={{ borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="status status-success">●</div>
                    {sidebarOpen && <span className="text-xs font-medium uppercase text-muted">v3.5.0-beta.1 ONLINE</span>}
                  </div>
                  
                  {sidebarOpen && (
                    <button 
                      onClick={handleToggleAdmin}
                      className="btn btn-sm btn-secondary w-full"
                      style={{ display: window.innerWidth < 768 ? 'flex' : 'none' }}
                    >
                      <span>🚪</span> Exit Admin
                    </button>
                  )}
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main className={`main-content ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
              {/* Header */}
              <header className="main-header">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="btn btn-sm btn-secondary"
                    >
                      ☰
                    </button>
                    <h2 className="font-bold text-sm uppercase text-primary">
                      {activeTab}
                    </h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right" style={{ display: window.innerWidth >= 768 ? 'block' : 'none' }}>
                      <div className="text-xs font-medium text-primary uppercase">Administrator</div>
                      <div className="text-xs text-accent font-medium uppercase">System Verified</div>
                    </div>
                    <div className="icon-lg text-white font-bold" style={{ background: 'var(--primary)', borderRadius: 'var(--radius)', padding: 'var(--space-2)' }}>
                      AD
                    </div>
                  </div>
                </div>
              </header>

              {/* Content Area */}
              <div className="main-body">
                <div className="container">
                  {activeTab === AdminTab.Dashboard && <SystemDashboard />}
                  {activeTab === AdminTab.Interfaces && <InterfacesList />}
                  {activeTab === AdminTab.Rates && <RatesManager rates={rates} setRates={updateRates} />}
                  {activeTab === AdminTab.Vouchers && <VoucherManager />}
                  {activeTab === AdminTab.Network && <NetworkSettings />}
                  {activeTab === AdminTab.Devices && <DeviceManager sessions={activeSessions} refreshSessions={loadData} refreshDevices={loadData} />}
                  {activeTab === AdminTab.Hardware && <HardwareManager />}
                  {activeTab === AdminTab.Themes && <ThemeSettings />}
                  {activeTab === AdminTab.PortalEditor && <PortalEditor />}
                  {activeTab === AdminTab.PPPoE && <PPPoEServer />}
                  {activeTab === AdminTab.Bandwidth && <BandwidthManager devices={devices} rates={rates} />}
                  {activeTab === AdminTab.MultiWan && <MultiWanSettings />}
                  {activeTab === AdminTab.Chat && <ChatManager />}
                  {activeTab === AdminTab.ZeroTier && <ZeroTierManager />}
                  {activeTab === AdminTab.Machines && <MyMachines />}
                  {activeTab === AdminTab.System && <SystemSettings />}
                  {activeTab === AdminTab.Updater && <SystemUpdater />}
                </div>
              </div>
            </main>
          </div>
        ) : (
          <Login 
            onLoginSuccess={(token) => {
              localStorage.setItem('ajc_admin_token', token);
              setIsAuthenticated(true);
            }} 
            onBack={() => handleToggleAdmin()} 
          />
        )
      ) : (
        <LandingPage 
          rates={rates} 
          onSessionStart={handleAddSession} 
          sessions={activeSessions} 
          refreshSessions={loadData} 
          onRestoreSession={() => restoreSession(5)}
        />
      )}
    </div>
  );
};

const NavItem: React.FC<{ 
  active: boolean; 
  onClick: () => void; 
  icon: string; 
  label: string; 
  collapsed?: boolean; 
  disabled?: boolean 
}> = ({ active, onClick, icon, label, collapsed, disabled }) => (
  <a 
    href="#"
    onClick={(e) => { e.preventDefault(); if (!disabled) onClick(); }} 
    title={collapsed ? label : undefined}
    className={`nav-item ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
  >
    <span className="icon">{icon}</span>
    {!collapsed && <span className="uppercase text-xs font-medium">{label}</span>}
  </a>
);

export default App;