import React, { useState, useEffect } from 'react';
import { AdminTab, UserSession, Rate } from './types';
import LandingPage from './components/Portal/LandingPage';
import Analytics from './components/Admin/Analytics';
import RatesManager from './components/Admin/RatesManager';
import NetworkSettings from './components/Admin/NetworkSettings';
import HardwareManager from './components/Admin/HardwareManager';
import SystemUpdater from './components/Admin/SystemUpdater';
import SystemSettings from './components/Admin/SystemSettings';
import { apiClient } from './lib/api';

const App: React.FC = () => {
  const isCurrentlyAdminPath = () => {
    const path = window.location.pathname.toLowerCase();
    const hasAdminFlag = localStorage.getItem('ajc_admin_mode') === 'true';
    return path === '/admin' || path === '/admin/' || path.startsWith('/admin/') || hasAdminFlag;
  };

  const [isAdmin, setIsAdmin] = useState(isCurrentlyAdminPath());
  const [activeTab, setActiveTab] = useState<AdminTab>(AdminTab.Analytics);
  const [rates, setRates] = useState<Rate[]>([]);
  const [activeSessions, setActiveSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setError(null);
      const fetchedRates = await apiClient.getRates();
      setRates(fetchedRates);
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
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSessions(prev => 
        prev.map(s => ({
          ...s,
          remainingSeconds: Math.max(0, s.remainingSeconds - 1)
        })).filter(s => s.remainingSeconds > 0)
      );
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
      window.history.pushState({}, '', '/');
    }
  };

  const handleAddSession = (session: UserSession) => {
    setActiveSessions(prev => [...prev, session]);
  };

  const updateRates = async () => {
    await loadData();
  };

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
    <div className="min-h-screen">
      <div className="fixed bottom-4 right-4 z-50">
        <button onClick={handleToggleAdmin} className="bg-black/90 text-white px-5 py-2.5 rounded-full text-[10px] font-black tracking-widest uppercase hover:bg-blue-600 shadow-2xl border border-white/10 active:scale-95 transition-all">
          {isAdmin ? 'Exit Admin' : 'Admin Login'}
        </button>
      </div>

      {isAdmin ? (
        <div className="flex h-screen overflow-hidden animate-in fade-in duration-500">
          <aside className="w-64 bg-slate-950 text-white flex flex-col">
            <div className="p-6 border-b border-white/5">
              <h1 className="text-xl font-black tracking-tighter text-blue-500">AJC PISOWIFI</h1>
              <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-[0.2em] font-bold">MANAGEMENT PANEL</p>
            </div>
            <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
              <SidebarItem active={activeTab === AdminTab.Analytics} onClick={() => setActiveTab(AdminTab.Analytics)} icon="📊" label="Dashboard" />
              <SidebarItem active={activeTab === AdminTab.Rates} onClick={() => setActiveTab(AdminTab.Rates)} icon="💰" label="Pricing" />
              <SidebarItem active={activeTab === AdminTab.Network} onClick={() => setActiveTab(AdminTab.Network)} icon="🌐" label="Network" />
              <SidebarItem active={activeTab === AdminTab.Hardware} onClick={() => setActiveTab(AdminTab.Hardware)} icon="🔌" label="Hardware" />
              <SidebarItem active={activeTab === AdminTab.System} onClick={() => setActiveTab(AdminTab.System)} icon="⚙️" label="System" />
              <SidebarItem active={activeTab === AdminTab.Updater} onClick={() => setActiveTab(AdminTab.Updater)} icon="🚀" label="Updater" />
            </nav>
            <div className="p-4 border-t border-white/5 text-slate-600 text-[10px] font-bold text-center uppercase tracking-widest">v3.3.0 WAN SECURED</div>
          </aside>

          <main className="flex-1 overflow-y-auto p-8 bg-slate-50">
            <header className="mb-8 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900 capitalize tracking-tight">{activeTab}</h2>
                <p className="text-slate-500 text-sm">System Management Interface.</p>
              </div>
              <div className="flex items-center gap-4 bg-white p-2 pr-4 rounded-full border border-slate-200 shadow-sm">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">A</div>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-800 uppercase">Administrator</span>
                  <span className="text-[10px] text-green-500 font-bold flex items-center gap-1 uppercase">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    VERIFIED
                  </span>
                </div>
              </div>
            </header>

            {activeTab === AdminTab.Analytics && <Analytics sessions={activeSessions} />}
            {activeTab === AdminTab.Rates && <RatesManager rates={rates} setRates={updateRates} />}
            {activeTab === AdminTab.Network && <NetworkSettings />}
            {activeTab === AdminTab.Hardware && <HardwareManager />}
            {activeTab === AdminTab.System && <SystemSettings />}
            {activeTab === AdminTab.Updater && <SystemUpdater />}
          </main>
        </div>
      ) : (
        <LandingPage rates={rates} onSessionStart={handleAddSession} sessions={activeSessions} />
      )}
    </div>
  );
};

const SidebarItem: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${active ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}>
    <span className="text-lg">{icon}</span>
    {label}
  </button>
);

export default App;