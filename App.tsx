import React, { useState, useEffect } from 'react';
import { AdminTab, UserSession, Rate } from './types';
import LandingPage from './components/Portal/LandingPage';
import Analytics from './components/Admin/Analytics';
import RatesManager from './components/Admin/RatesManager';
import NetworkSettings from './components/Admin/NetworkSettings';
import HardwareManager from './components/Admin/HardwareManager';
import SystemUpdater from './components/Admin/SystemUpdater';
import SystemSettings from './components/Admin/SystemSettings';
import DeviceManager from './components/Admin/DeviceManager';
import Login from './components/Admin/Login';
import ThemePortal from './components/ThemePortal';
import { apiClient } from './lib/api';
import { initTheme } from './lib/theme';

const App: React.FC = () => {
  const isCurrentlyAdminPath = () => {
    const path = window.location.pathname.toLowerCase();
    const hasAdminFlag = localStorage.getItem('ajc_admin_mode') === 'true';
    return path === '/admin' || path === '/admin/' || path.startsWith('/admin/') || hasAdminFlag;
  };

  const isThemePath = () => window.location.pathname === '/themes';

  const [isAdmin, setIsAdmin] = useState(isCurrentlyAdminPath());
  const [showThemePortal, setShowThemePortal] = useState(isThemePath());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>(AdminTab.Analytics);
  const [rates, setRates] = useState<Rate[]>([]);
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const [fetchedRates, sessions] = await Promise.all([
        apiClient.getRates(),
        apiClient.getSessions().catch(() => [])
      ]);
      setRates(fetchedRates);
      setActiveSessions(sessions);
    } catch (err: any) {
      console.error('Backend connection failed:', err);
      setError(err.message || 'Connection to AJC Hardware failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initTheme();
    loadData();
    const handleLocationChange = () => {
      const isNowAdmin = isCurrentlyAdminPath();
      setIsAdmin(isNowAdmin);
      setShowThemePortal(isThemePath());
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

    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Sync state with backend timer
  useEffect(() => {
    const interval = setInterval(async () => {
      // Periodic refresh from server to ensure sync
      try {
        const sessions = await apiClient.getSessions();
        setActiveSessions(sessions);
      } catch (e) {
        // Local decrement as fallback for smooth UI
        setActiveSessions(prev => 
          prev.map(s => ({
            ...s,
            remainingSeconds: Math.max(0, s.remainingSeconds - 1)
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
      const res = await fetch('/api/sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mac: session.mac,
          minutes: Math.ceil(session.remainingSeconds / 60),
          pesos: session.totalPaid
          // Don't send IP - server will detect it
        })
      });
      const data = await res.json();
      if (data.success) {
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
      setLoading(false);
    }
  };

  const updateRates = async () => {
    await loadData();
  };

  if (showThemePortal) {
    return <ThemePortal />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-blue-400 font-bold tracking-widest uppercase text-xs">AJC Core Initializing...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-2xl border border-red-100 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">⚠️</div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">System Offline</h2>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">{error}</p>
          <button onClick={() => { setLoading(true); loadData(); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black shadow-xl shadow-slate-900/20">Retry System Link</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="fixed bottom-4 right-4 z-[999]">
        <button onClick={handleToggleAdmin} className="bg-slate-950 text-white px-5 py-3 rounded-full text-[10px] font-black tracking-widest uppercase hover:bg-blue-600 shadow-2xl border border-white/10 active:scale-95 transition-all flex items-center gap-2">
          <span>{isAdmin ? '🚪' : '🔐'}</span>
          {isAdmin ? 'Exit Admin' : 'Admin Login'}
        </button>
      </div>

      {isAdmin ? (
        isAuthenticated ? (
          <div className="flex h-screen overflow-hidden animate-in fade-in duration-500 bg-slate-50">
            <aside className="w-72 bg-slate-950 text-white flex flex-col shrink-0">
            <div className="p-8 border-b border-white/5">
              <h1 className="text-2xl font-black tracking-tighter text-blue-500 italic">AJC PISOWIFI</h1>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-[0.3em] font-black">SYSTEM ENGINE</p>
            </div>
            <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
              <SidebarItem active={activeTab === AdminTab.Analytics} onClick={() => setActiveTab(AdminTab.Analytics)} icon="📊" label="Dashboard" />
              <SidebarItem active={activeTab === AdminTab.Rates} onClick={() => setActiveTab(AdminTab.Rates)} icon="💰" label="Pricing" />
              <SidebarItem active={activeTab === AdminTab.Network} onClick={() => setActiveTab(AdminTab.Network)} icon="🌐" label="Network" />
              <SidebarItem active={activeTab === AdminTab.Devices} onClick={() => setActiveTab(AdminTab.Devices)} icon="📱" label="Devices" />
              <SidebarItem active={activeTab === AdminTab.Hardware} onClick={() => setActiveTab(AdminTab.Hardware)} icon="🔌" label="Hardware" />
              <SidebarItem active={activeTab === AdminTab.System} onClick={() => setActiveTab(AdminTab.System)} icon="⚙️" label="System" />
              <SidebarItem active={activeTab === AdminTab.Updater} onClick={() => setActiveTab(AdminTab.Updater)} icon="🚀" label="Updater" />
            </nav>
            <div className="p-6 border-t border-white/5 bg-black/20">
               <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">v3.3.0 WAN ONLINE</span>
               </div>
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto bg-slate-50">
            <div className="p-10 max-w-7xl mx-auto">
              <header className="mb-10 flex justify-between items-center">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 capitalize tracking-tighter">{activeTab}</h2>
                  <p className="text-slate-500 text-sm font-medium mt-1">Management Interface & System Control.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2.5 pr-6 rounded-full border border-slate-200 shadow-sm">
                  <div className="w-11 h-11 bg-blue-600 rounded-full flex items-center justify-center text-white font-black shadow-lg shadow-blue-600/20">A</div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-900 uppercase tracking-tight">System Admin</span>
                    <span className="text-[9px] text-green-500 font-black flex items-center gap-1.5 uppercase tracking-widest">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      VERIFIED ACCESS
                    </span>
                  </div>
                </div>
              </header>

              <div className="pb-20">
                {activeTab === AdminTab.Analytics && <Analytics sessions={activeSessions} />}
                {activeTab === AdminTab.Rates && <RatesManager rates={rates} setRates={updateRates} />}
                {activeTab === AdminTab.Network && <NetworkSettings />}
                {activeTab === AdminTab.Devices && <DeviceManager />}
                {activeTab === AdminTab.Hardware && <HardwareManager />}
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
        <LandingPage rates={rates} onSessionStart={handleAddSession} sessions={activeSessions} refreshSessions={loadData} />
      )}
    </div>
  );
};

const SidebarItem: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-black transition-all duration-200 ${
      active 
        ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/40 scale-[1.02]' 
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
    }`}
  >
    <span className="text-xl">{icon}</span>
    <span className="uppercase tracking-widest text-[11px]">{label}</span>
  </button>
);

export default App;