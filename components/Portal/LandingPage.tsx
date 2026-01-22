import React, { useState, useEffect } from 'react';
import { Rate, UserSession } from '../../types';
import CoinModal from './CoinModal';
import { apiClient } from '../../lib/api';

// Add refreshSessions prop to Props interface
interface Props {
  rates: Rate[];
  sessions: UserSession[];
  onSessionStart: (session: UserSession) => void;
  refreshSessions?: () => void;
}

interface Props {
  rates: Rate[];
  sessions: UserSession[];
  onSessionStart: (session: UserSession) => void;
  refreshSessions?: () => void;
}

const LandingPage: React.FC<Props> = ({ rates, sessions, onSessionStart, refreshSessions }) => {
  const [showModal, setShowModal] = useState(false);
  const [myMac, setMyMac] = useState('');
  const [isMacLoading, setIsMacLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Hardcoded default rates in case the API fetch returns nothing
  const defaultRates: Rate[] = [
    { id: '1', pesos: 1, minutes: 10 },
    { id: '5', pesos: 5, minutes: 60 },
    { id: '10', pesos: 10, minutes: 180 }
  ];

  const activeRates = (rates && rates.length > 0) ? rates : defaultRates;

  // Get fallback ID immediately without waiting for server
  const getFallbackId = () => {
    const storageKey = 'ajc_client_id';
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = 'DEV-' + Math.random().toString(36).substr(2, 9).toUpperCase();
      localStorage.setItem(storageKey, id);
    }
    return id;
  };

  useEffect(() => {
    // Set fallback ID immediately so UI can render
    const fallbackId = getFallbackId();
    setMyMac(fallbackId);
    setIsMacLoading(false);

    // Try to get real MAC in background without blocking UI
    const fetchWhoAmI = async () => {
      try {
        const data = await apiClient.whoAmI();
        if (data.mac && data.mac !== 'unknown') {
          setMyMac(data.mac);
        }
      } catch (e) {
        console.error('Failed to identify client');
      }
    };
    
    // Only fetch if we have a valid IP (not localhost)
    if (!window.location.hostname.includes('localhost')) {
      fetchWhoAmI();
    }
  }, []);

  const mySession = sessions.find(s => s.mac === myMac);

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowModal(true);
  };

  const handleGoToInternet = () => {
    // Navigate to success page which will trigger captive portal exit
    window.location.href = '/success';
  };

  const handleRefreshNetwork = async () => {
    setIsRefreshing(true);
    try {
      // Client-side network refresh attempts
      console.log('Attempting client-side network refresh...');
      
      // Method 1: Force browser to re-resolve DNS by clearing DNS cache
      try {
        // Clear browser's DNS cache by making requests to different domains
        const testUrls = ['http://1.1.1.1', 'http://8.8.8.8', 'http://google.com'];
        for (const url of testUrls) {
          try {
            await fetch(url, { mode: 'no-cors', cache: 'reload' });
          } catch (e) {
            // Ignore errors, just trying to force DNS resolution
          }
        }
      } catch (e) {
        console.log('DNS refresh failed:', e);
      }
      
      // Method 2: Clear browser cache for this domain
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
          console.log('Browser cache cleared');
        } catch (e) {
          console.log('Cache clear failed:', e);
        }
      }
      
      // Method 3: Force page reload with cache bypass
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      // Method 4: Server-side network refresh
      const result = await apiClient.refreshNetworkConnection();
      if (result.success) {
        alert('✅ Network connection refreshed! The page will reload automatically.');
        // Also refresh session data
        if (refreshSessions) {
          refreshSessions();
        }
      } else {
        alert('⚠️ Network refresh failed: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      alert('❌ Network refresh error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatSessionTime = (seconds: number) => {
    if (seconds >= 86400) { // 24 hours or more
      const days = Math.floor(seconds / 86400);
      const remainingSeconds = seconds % 86400;
      const hours = Math.floor(remainingSeconds / 3600);
      const mins = Math.floor((remainingSeconds % 3600) / 60);
      const secs = remainingSeconds % 60;
      
      return (
        <>
          {days}<span className="text-2xl">d</span> {hours}<span className="text-2xl">h</span> {mins}<span className="text-2xl">m</span> {secs}<span className="text-2xl">s</span>
        </>
      );
    }
    
    if (seconds >= 3600) { // 60 minutes or more
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      return (
        <>
          {hours}<span className="text-2xl">h</span> {mins}<span className="text-2xl">m</span> {secs}<span className="text-2xl">s</span>
        </>
      );
    }
    
    // Default: minutes and seconds
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    return (
      <>
        {mins}<span className="text-2xl">m</span> {secs}<span className="text-2xl">s</span>
      </>
    );
  };

  return (
    <div className="portal-container min-h-screen">
      <header className="portal-header">
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tighter mb-1 uppercase">AJC PISOWIFI</h1>
          <p className="text-blue-100 text-xs font-bold opacity-80 uppercase tracking-widest">Enterprise Internet Gateway</p>
        </div>
      </header>

      <main className="relative z-20">
        <div className="portal-card">
          {mySession ? (
            <div className="mb-6 animate-in fade-in zoom-in duration-500">
              <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Authenticated Session</p>
              <h2 className="text-6xl font-black text-slate-900 mb-4 tracking-tighter">
                {formatSessionTime(mySession.remainingSeconds)}
              </h2>
              <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">
                <span className="text-green-500 font-black flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  Internet Access Live
                </span>
                <span>Session ID: {myMac}</span>
              </div>
              
              <button 
                onClick={handleGoToInternet}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest mb-3 shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span>🌍</span> PROCEED TO INTERNET
              </button>
              
              <button 
                onClick={handleRefreshNetwork}
                disabled={isRefreshing}
                className="w-full bg-blue-600 text-white py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isRefreshing ? '⟳' : '🔄'}</span> 
                {isRefreshing ? 'REFRESHING...' : 'REFRESH CONNECTION'}
              </button>
            </div>
          ) : (
            <div className="mb-6">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">📡</div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Insert Coins to Connect</h2>
              <p className="text-slate-500 text-sm mb-6 font-medium px-4">Drop physical coins into the slot to enable high-speed internet access.</p>
            </div>
          )}

          <button onClick={handleOpenModal} className="portal-btn">
            {mySession ? 'ADD MORE TIME' : 'INSERT COIN'}
          </button>
        </div>

        <div className="mb-10">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5 px-8">Pricing & Rates</h3>
          <div className="rates-grid">
            {activeRates.sort((a,b) => a.pesos - b.pesos).map(rate => (
              <div key={rate.id} className="rate-item">
                <span className="rate-pesos">₱{rate.pesos}</span>
                <span className="rate-time">
                  {rate.minutes >= 60 
                    ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                    : `${rate.minutes} Minutes`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-6 bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 blur-3xl rounded-full"></div>
          <div className="relative z-10">
            <h4 className="font-black text-lg mb-4 uppercase tracking-tight italic text-blue-400">Quick Start Guide</h4>
            <ul className="text-[10px] text-slate-400 space-y-4 font-bold uppercase tracking-widest list-none">
              <li className="flex gap-4 items-center">
                <span className="bg-white/10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 text-white">1</span>
                Tap 'Insert Coin' to open the validator.
              </li>
              <li className="flex gap-4 items-center">
                <span className="bg-white/10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 text-white">2</span>
                Drop 1, 5, or 10 Peso coins.
              </li>
              <li className="flex gap-4 items-center">
                <span className="bg-white/10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 text-white">3</span>
                Click 'Start Surfing' to connect.
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="mt-12 text-center pb-10 flex flex-col items-center gap-4">
        <a href="/themes" className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-500 hover:text-blue-600 transition-colors">
          Customize Theme
        </a>
        <span className="text-slate-400 text-[9px] font-black uppercase tracking-[0.3em]">
          © 2025 AJC PISOWIFI SYSTEM • HARDWARE v3.3.0
        </span>
      </footer>

      {showModal && (
        <CoinModal 
          onClose={() => setShowModal(false)} 
          onSuccess={(pesos, minutes) => {
            onSessionStart({
              mac: myMac,
              remainingSeconds: minutes * 60,
              totalPaid: pesos,
              connectedAt: Date.now()
              // Don't send IP - server will detect it
            });
            setShowModal(false);
          }}
          rates={activeRates}
        />
      )}
    </div>
  );
};

export default LandingPage;