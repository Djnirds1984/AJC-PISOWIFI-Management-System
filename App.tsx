import React, { useState, useEffect } from 'react';
import { AdminTab, UserSession, Rate } from './types';
import LandingPage from './components/Portal/LandingPage';
import Analytics from './components/Admin/Analytics';
import RatesManager from './components/Admin/RatesManager';
import NetworkSettings from './components/Admin/NetworkSettings';
import HardwareManager from './components/Admin/HardwareManager';
import SystemUpdater from './components/Admin/SystemUpdater';
import { apiClient } from './lib/api';

const App: React.FC = () => {
  // Initialize state based on the current URL path
  const [isAdmin, setIsAdmin] = useState(window.location.pathname === '/admin');
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
      console.error('Failed to load rates from real backend:', err);
      setError(err.message || 'Connection to backend failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for browser back/forward buttons to sync isAdmin state
    const handleLocationChange = () => {
      setIsAdmin(window.location.pathname === '/admin');
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
    // Update the browser URL without a page reload
    const newPath = nextState ? '/admin' : '/';
    window.history.pushState({}, '', newPath);
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
          <p className="text-blue-400 font-bold tracking-widest uppercase text-xs">Initializing System Stack...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-2xl border border-red-100 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">⚠️</div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">System Connectivity Error</h2>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            {error}. Ensure the Node.js server is running and accessible.
          </p>
          <button 
            onClick={() => { setLoading(true); loadData(); }}
            className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-slate-900/20"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        <button 
          onClick={handleToggleAdmin}
          className="bg-black/80 text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-black transition-colors shadow-lg border border-white/10"
        >
          {isAdmin ? 'PORTAL VIEW' : 'ADMIN LOGIN'}
        </button>
      </div>

      {isAdmin ? (
        <div className="flex h-screen overflow-hidden">
          <aside className="w-64 bg-slate-950 text-white flex flex-col">
            <div className="p-6 border-b border-white/5">
              <h1 className="text-xl font-black tracking-tighter text-blue-500">AJC PISOWIFI</h1>
              <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-[0.2em] font-bold">Enterprise Build v3.3.0</p>
            </div>
            <nav className="flex-1 p-4 space-y-1.5">
              <SidebarItem active={activeTab === AdminTab.Analytics} onClick={() => setActiveTab(AdminTab.Analytics)} icon="📊" label="Dashboard" />
              <SidebarItem active={activeTab === AdminTab.Rates} onClick={() => setActiveTab(AdminTab.Rates)} icon="💰" label="Pricing Setup" />
              <SidebarItem active={activeTab === AdminTab.Network} onClick={() => setActiveTab(AdminTab.Network)} icon="🌐" label="Network Stack" />
              <SidebarItem active={activeTab === AdminTab.Hardware} onClick={() => setActiveTab(AdminTab.Hardware)} icon="🔌" label="Hardware" />
              <SidebarItem active={activeTab === AdminTab.Updater} onClick={() => setActiveTab(AdminTab.Updater)} icon="🚀" label="Updater" />
            </nav>
            <div className="p-4 border-t border-white/5 text-slate-600 text-[10px] font-bold text-center uppercase tracking-widest">
              Linux Kernel 5.15+
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto p-8 bg-slate-50">
            <header className="mb-8 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-900 capitalize tracking-tight">{activeTab === AdminTab.Hardware ? 'Hardware Configuration' : activeTab}</h2>
                <p className="text-slate-500 text-sm">Real-time system monitoring and control.</p>
              </div>
              <div className="flex items-center gap-4 bg-white p-2 pr-4 rounded-full border border-slate-200 shadow-sm">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">A</div>
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-800 uppercase">Super Admin</span>
                  <span className="text-[10px] text-green-500 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    ACTIVE BRIDGE
                  </span>
                </div>
              </div>
            </header>

            {activeTab === AdminTab.Analytics && <Analytics sessions={activeSessions} />}
            {activeTab === AdminTab.Rates && <RatesManager rates={rates} setRates={updateRates} />}
            {activeTab === AdminTab.Network && <NetworkSettings />}
            {activeTab === AdminTab.Hardware && <HardwareManager />}
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
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
      active ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/20' : 'text-slate-500 hover:bg-white/5 hover:text-white'
    }`}
  >
    <span className="text-lg">{icon}</span>
    {label}
  </button>
);

export default App;