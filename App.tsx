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
          // Don't send IP - server will detect it
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.token) {
          localStorage.setItem('ajc_session_token', data.token);
        }
        await loadData();
        // Show connection message to user
        if (data.message) {
          alert('✅ ' + data.message);
        } else {
          alert('✅ Internet access granted! Connection should activate automatically.');
        }
        
        // Try to help the connection by forcing a page reload after a short delay
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

  // Check for existing session token and try to restore (Fix for randomized MACs/SSID switching)
  const restoreSession = async (retries = 5) => {
    const sessionToken = localStorage.getItem('ajc_session_token');
    if (sessionToken) {
      try {
        const res = await fetch('/api/sessions/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: sessionToken })
        });
        
        // If 400 (Bad Request), it likely means MAC resolution failed temporarily. Retry.
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
            loadData(); // Reload to see active session
          }
        } else if (res.status === 404) {
          // Token invalid/expired - only remove if we are sure
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
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '3rem', 
            height: '3rem', 
            border: '4px solid var(--border)', 
            borderTop: '4px solid var(--primary)', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AJC Core Initializing...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div style={{ 
          maxWidth: '400px', 
          width: '100%', 
          background: 'var(--bg-card)', 
          padding: '2rem', 
          borderRadius: 'var(--radius-md)', 
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            System Offline
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '2rem' }}>{error}</p>
          <button 
            onClick={() => { setLoading(true); loadData(); }} 
            style={{ 
              width: '100%', 
              background: 'var(--primary)', 
              color: 'white', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius)', 
              border: 'none', 
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Retry System Link
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', zIndex: 999, display: window.innerWidth >= 768 ? 'block' : 'none' }}>
        <button 
          onClick={handleToggleAdmin} 
          style={{ 
            background: 'var(--primary)', 
            color: 'white', 
            padding: '0.75rem 1.25rem', 
            borderRadius: '9999px', 
            fontSize: '0.75rem', 
            fontWeight: 500, 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
          }}
        >
          <span>{isAdmin ? '🚪' : '🔐'}</span>
          {isAdmin ? 'Exit Admin' : 'Admin Login'}
        </button>
      </div>

      {isAdmin ? (
        isAuthenticated ? (
          <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
              <div 
                style={{ 
                  position: 'fixed', 
                  inset: 0, 
                  background: 'rgba(0, 0, 0, 0.5)', 
                  zIndex: 40,
                  display: window.innerWidth < 768 ? 'block' : 'none'
                }} 
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* Sidebar */}
            <aside style={{
              position: 'fixed',
              height: '100%',
              width: sidebarOpen ? '240px' : '60px',
              transform: sidebarOpen || window.innerWidth >= 768 ? 'translateX(0)' : 'translateX(-100%)',
              background: 'var(--bg-card)',
              color: 'var(--text-main)',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s ease',
              zIndex: 50,
              borderRight: '1px solid var(--border)',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ 
                padding: '1rem', 
                borderBottom: '1px solid var(--border)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: sidebarOpen ? 'space-between' : 'center' 
              }}>
                {sidebarOpen ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ 
                        width: '1.75rem', 
                        height: '1.75rem', 
                        background: 'var(--primary)', 
                        borderRadius: 'var(--radius)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        fontWeight: 700, 
                        fontSize: '0.75rem', 
                        color: 'white' 
                      }}>
                        AJC
                      </div>
                      <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--text-main)' }}>PISOWIFI</h1>
                    </div>
                    <button 
                      onClick={() => setSidebarOpen(false)} 
                      style={{ 
                        padding: '0.375rem', 
                        background: 'transparent', 
                        border: 'none', 
                        borderRadius: 'var(--radius)', 
                        color: 'var(--text-muted)', 
                        cursor: 'pointer',
                        display: window.innerWidth < 768 ? 'block' : 'none'
                      }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <div style={{ 
                    width: '2rem', 
                    height: '2rem', 
                    background: 'var(--primary)', 
                    borderRadius: 'var(--radius)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontWeight: 700, 
                    fontSize: '0.75rem', 
                    color: 'white' 
                  }}>
                    A
                  </div>
                )}
              </div>
              
              <nav style={{ flex: 1, padding: sidebarOpen ? '0.75rem' : '0.5rem', overflowY: 'auto' }}>
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Dashboard} onClick={() => setActiveTab(AdminTab.Dashboard)} icon="📊" label="Dashboard" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Interfaces} onClick={() => setActiveTab(AdminTab.Interfaces)} icon="🔌" label="Interfaces" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Rates} onClick={() => setActiveTab(AdminTab.Rates)} icon="💰" label="Pricing" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Vouchers} onClick={() => setActiveTab(AdminTab.Vouchers)} icon="🎫" label="Vouchers" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Network} onClick={() => setActiveTab(AdminTab.Network)} icon="🌐" label="Network" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Devices} onClick={() => setActiveTab(AdminTab.Devices)} icon="📱" label="Devices" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Hardware} onClick={() => setActiveTab(AdminTab.Hardware)} icon="🔌" label="Hardware" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Themes} onClick={() => setActiveTab(AdminTab.Themes)} icon="🎨" label="Themes" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.PortalEditor} onClick={() => setActiveTab(AdminTab.PortalEditor)} icon="🖥️" label="Portal" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.PPPoE} onClick={() => setActiveTab(AdminTab.PPPoE)} icon="📞" label="PPPoE" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Bandwidth} onClick={() => setActiveTab(AdminTab.Bandwidth)} icon="📶" label="QoS" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.MultiWan} onClick={() => setActiveTab(AdminTab.MultiWan)} icon="🔀" label="Multi-WAN" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Chat} onClick={() => setActiveTab(AdminTab.Chat)} icon="💬" label="Chat" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.ZeroTier} onClick={() => setActiveTab(AdminTab.ZeroTier)} icon="🕸️" label="ZeroTier" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Machines} onClick={() => setActiveTab(AdminTab.Machines)} icon="🤖" label="Machines" collapsed={!sidebarOpen} />
                <SidebarItem active={activeTab === AdminTab.System} onClick={() => setActiveTab(AdminTab.System)} icon="⚙️" label="System" collapsed={!sidebarOpen} />
                <SidebarItem disabled={licenseStatus.isRevoked} active={activeTab === AdminTab.Updater} onClick={() => setActiveTab(AdminTab.Updater)} icon="🚀" label="Updater" collapsed={!sidebarOpen} />
              </nav>

              <div style={{ 
                padding: '1rem', 
                borderTop: '1px solid var(--border)', 
                background: 'var(--bg)',
                display: sidebarOpen ? 'block' : 'none'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ 
                      width: '0.5rem', 
                      height: '0.5rem', 
                      background: '#10b981', 
                      borderRadius: '50%',
                      animation: 'pulse 2s infinite'
                    }}></div>
                    {sidebarOpen && (
                      <span style={{ 
                        color: 'var(--text-muted)', 
                        fontSize: '0.625rem', 
                        fontWeight: 500, 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.1em' 
                      }}>
                        v3.5.0-beta.1 ONLINE
                      </span>
                    )}
                  </div>
                  
                  {/* Mobile Exit Button */}
                  {sidebarOpen && (
                    <button 
                      onClick={handleToggleAdmin}
                      style={{ 
                        width: '100%', 
                        background: '#fef2f2', 
                        color: '#dc2626', 
                        border: '1px solid #fecaca', 
                        padding: '0.5rem 0.75rem', 
                        borderRadius: 'var(--radius)', 
                        fontSize: '0.75rem', 
                        fontWeight: 500, 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em',
                        display: window.innerWidth < 768 ? 'flex' : 'none',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      <span>🚪</span> Exit Admin
                    </button>
                  )}
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <main style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column', 
              minWidth: 0, 
              background: 'var(--bg)', 
              overflow: 'hidden',
              marginLeft: sidebarOpen ? '240px' : '60px'
            }}>
              {/* Compact Top Bar */}
              <header style={{ 
                height: '3.5rem', 
                background: 'var(--bg-card)', 
                borderBottom: '1px solid var(--border)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '0 1rem',
                zIndex: 30
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button 
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    style={{ 
                      padding: '0.5rem', 
                      background: 'transparent', 
                      border: 'none', 
                      borderRadius: 'var(--radius)', 
                      color: 'var(--text-muted)', 
                      cursor: 'pointer'
                    }}
                  >
                    ☰
                  </button>
                  <h2 style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: 700, 
                    color: 'var(--text-main)', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.025em' 
                  }}>
                    {activeTab}
                  </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ 
                    textAlign: 'right',
                    display: window.innerWidth >= 768 ? 'block' : 'none'
                  }}>
                    <div style={{ fontSize: '0.625rem', fontWeight: 500, color: 'var(--text-main)', textTransform: 'uppercase' }}>
                      Administrator
                    </div>
                    <div style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 500, textTransform: 'uppercase' }}>
                      System Verified
                    </div>
                  </div>
                  <div style={{ 
                    width: '2rem', 
                    height: '2rem', 
                    background: 'var(--primary)', 
                    borderRadius: 'var(--radius)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    color: 'white', 
                    fontWeight: 700, 
                    fontSize: '0.75rem'
                  }}>
                    AD
                  </div>
                </div>
              </header>

              {/* Scrollable Content Area */}
              <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '1.5rem 2rem'
              }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
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
                {/* Bottom Spacer for Mobile */}
                <div style={{ height: '5rem', display: window.innerWidth < 768 ? 'block' : 'none' }} />
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

const SidebarItem: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string; collapsed?: boolean; disabled?: boolean }> = ({ active, onClick, icon, label, collapsed, disabled }) => (
  <button 
    onClick={disabled ? undefined : onClick} 
    title={collapsed ? label : undefined}
    disabled={disabled}
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.625rem 0.75rem',
      borderRadius: 'var(--radius)',
      fontSize: '0.875rem',
      fontWeight: 500,
      transition: 'all 0.2s ease',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.3 : 1,
      background: active ? 'var(--primary)' : 'transparent',
      color: active ? 'white' : 'var(--text-muted)',
      justifyContent: collapsed ? 'center' : 'flex-start',
      marginBottom: '0.25rem'
    }}
    onMouseEnter={(e) => {
      if (!disabled && !active) {
        e.currentTarget.style.background = 'var(--bg)';
        e.currentTarget.style.color = 'var(--primary)';
      }
    }}
    onMouseLeave={(e) => {
      if (!disabled && !active) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--text-muted)';
      }
    }}
  >
    <span style={{ fontSize: '1.125rem', transform: active ? 'scale(1.1)' : 'scale(1)', transition: 'transform 0.2s ease' }}>
      {icon}
    </span>
    {!collapsed && (
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.75rem', fontWeight: 500 }}>
        {label}
      </span>
    )}
  </button>
);

export default App;
