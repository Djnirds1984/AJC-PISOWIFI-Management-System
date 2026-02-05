import React, { useState, useEffect } from 'react';
import { Rate, UserSession } from '../../types';
import CoinModal from './CoinModal';
import VoucherModal from './VoucherModal';
import ChatWidget from './ChatWidget';
import { apiClient } from '../../lib/api';
import { getPortalConfig, fetchPortalConfig, PortalConfig, DEFAULT_PORTAL_CONFIG } from '../../lib/theme';
import { getOrCreateDeviceUUID, attachDeviceHeaders, getDeviceFingerprint, attachDeviceFingerprintHeaders } from '../../lib/device-id';

// Add refreshSessions prop to Props interface
interface Props {
  rates: Rate[];
  sessions: UserSession[];
  onSessionStart: (session: UserSession) => void;
  refreshSessions?: () => void;
  onRestoreSession?: () => void;
}

const LandingPage: React.FC<Props> = ({ rates, sessions, onSessionStart, refreshSessions, onRestoreSession }) => {
  const [showModal, setShowModal] = useState(false);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [myMac, setMyMac] = useState('');
  const [isMacLoading, setIsMacLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [config, setConfig] = useState<PortalConfig>(DEFAULT_PORTAL_CONFIG);
  const [availableSlots, setAvailableSlots] = useState<{id: string, name: string, macAddress: string, isOnline: boolean, license?: { isValid: boolean, isTrial: boolean, isExpired: boolean }}[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('main');
  const [slotError, setSlotError] = useState<string | null>(null);
  const [canInsertCoin, setCanInsertCoin] = useState(true);
  const [isRevoked, setIsRevoked] = useState(false);
  const [coinSlotLockId, setCoinSlotLockId] = useState<string | null>(null);
  const [reservedSlot, setReservedSlot] = useState<string | null>(null);
  const [showRatesModal, setShowRatesModal] = useState(false);

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
    // Initialize device UUID
    const deviceUUID = getOrCreateDeviceUUID();
    console.log(`[PORTAL] Device UUID initialized: ${deviceUUID}`);
    
    // Load Portal Configuration
    const loadConfig = async () => {
      const cfg = await fetchPortalConfig();
      setConfig(cfg);
    };
    loadConfig();

    // Load Available Coinslots
    const loadAvailableSlots = async () => {
      try {
        const slots = await apiClient.getAvailableNodeMCUDevices();
        setAvailableSlots(slots);
      } catch (e) {
        console.error('Failed to load available coinslots');
      }
    };
    loadAvailableSlots();

    // Set fallback ID immediately so UI can render
    const fallbackId = getFallbackId();
    setMyMac(fallbackId);
    setIsMacLoading(false);

    // Try to get real MAC in background without blocking UI
    const fetchWhoAmI = async () => {
      try {
        // Add device UUID and fingerprint to API calls
        const headers = attachDeviceFingerprintHeaders();
        const data = await apiClient.whoAmI(headers);
        if (data.mac && data.mac !== 'unknown') {
          setMyMac(data.mac);
        }
        setCanInsertCoin(data.canInsertCoin !== false);
        setIsRevoked(data.isRevoked === true);
      } catch (e) {
        console.error('Failed to identify client');
      }
    };
    
    // Only fetch if we have a valid IP (not localhost)
    if (!window.location.hostname.includes('localhost')) {
      fetchWhoAmI();
    }

    // AGGRESSIVE SESSION RESTORATION: Check server headers for restoration hints
    const checkServerSessionHints = async () => {
      try {
        const response = await fetch('/', { method: 'HEAD' });
        const hasRestorableSession = response.headers.get('X-AJC-Session-Restore-Available');
        const availableSessions = response.headers.get('X-AJC-Available-Sessions');
        const serverToken = response.headers.get('X-AJC-Session-Token');
        
        console.log(`[Portal] Server hints - Restorable: ${hasRestorableSession}, Sessions: ${availableSessions}, Token: ${serverToken ? serverToken.slice(0,8) + '...' : 'none'}`);
        
        if (hasRestorableSession === 'true' && availableSessions && parseInt(availableSessions) > 0) {
          console.log(`[Portal] Server indicates ${availableSessions} transferable sessions available`);
          
          // If server provided a token, save it to device-specific localStorage
          if (serverToken) {
            console.log(`[Portal] Saving server-provided token to device-specific storage`);
            // Create device-specific key using MAC address
            const deviceKey = `ajc_session_token_${myMac}`;
            localStorage.setItem(deviceKey, serverToken);
            // Also save to legacy key for backward compatibility
            localStorage.setItem('ajc_session_token', serverToken);
          }
          
          if (onRestoreSession) {
            // Immediate restoration attempt
            console.log(`[Portal] Triggering immediate session restoration`);
            setTimeout(() => {
              onRestoreSession();
            }, 300); // Very fast trigger
          }
        }
      } catch (e) {
        console.log('[Portal] Could not check server session hints:', e.message);
      }
    };

    // Proactive session restoration check
    // If user has a session token but no active session, try to restore automatically
    const checkAndRestoreSession = async () => {
      // Check device-specific token first
      const deviceKey = `ajc_session_token_${myMac}`;
      let sessionToken = localStorage.getItem(deviceKey);
      
      // Fall back to legacy key if device-specific not found
      if (!sessionToken) {
        sessionToken = localStorage.getItem('ajc_session_token');
        if (sessionToken) {
          // Migrate to device-specific storage
          console.log(`[Portal] Migrating legacy token to device-specific storage`);
          localStorage.setItem(deviceKey, sessionToken);
        }
      }
      
      if (sessionToken && !mySession && onRestoreSession) {
        console.log('[Portal] Detected device-specific session token without active session - attempting automatic restoration');
        setTimeout(() => {
          onRestoreSession();
        }, 500); // Fast trigger
      }
    };
    
    // Run both checks immediately
    checkServerSessionHints();
    checkAndRestoreSession();
    
    // PERIODIC SESSION RESTORATION: Keep trying every 5 seconds if we have a token but no session
    const periodicRestoreCheck = setInterval(() => {
      const sessionToken = localStorage.getItem('ajc_session_token');
      if (sessionToken && !mySession && onRestoreSession) {
        console.log('[Portal] Periodic check: Still have token but no session - attempting restoration');
        onRestoreSession();
      } else if (mySession || !sessionToken) {
        // Stop checking if we have a session or no token
        clearInterval(periodicRestoreCheck);
      }
    }, 5000); // Check every 5 seconds instead of 10
    
    // Cleanup interval on unmount
    return () => {
      clearInterval(periodicRestoreCheck);
    };
  }, []);

  const mySession = sessions.find(s => s.mac === myMac);

  const handleOpenModal = async (e: React.MouseEvent) => {
    e.preventDefault();
    setSlotError(null);

    if (!canInsertCoin) {
      setSlotError("System License Revoked: Only 1 device can use the insert coin button at a time. Another device is currently active.");
      return;
    }

    if (selectedSlot !== 'main') {
      const slot = availableSlots.find(s => s.macAddress === selectedSlot);
      if (slot && !slot.isOnline) {
        setSlotError(`The machine "${slot.name}" is OFFLINE. Please tell the owner to restart it.`);
        return;
      }
      
      // Double check status with API for selected slot
      try {
        const status = await apiClient.checkNodeMCUStatus(selectedSlot);
        if (!status.online) {
          setSlotError(`The machine "${slot?.name || 'Sub-Vendo'}" is OFFLINE. Please tell the owner to restart it.`);
          return;
        }
        
        // License Check
        if (status.license && !status.license.isValid) {
          setSlotError('YOUR COINSLOT MACHINE IS DISABLED');
          return;
        }
      } catch (err) {
        console.error('Status check failed');
      }
    }

    const reserve = await apiClient.reserveCoinSlot(selectedSlot);
    if (!reserve.success || !reserve.lockId) {
      if (reserve.status === 409) {
        setSlotError(reserve.error || 'JUST WAIT SOMEONE IS PAYING.');
        return;
      }
      setSlotError(reserve.error || 'Failed to open coinslot. Please try again.');
      return;
    }

    setReservedSlot(selectedSlot);
    setCoinSlotLockId(reserve.lockId);
    setShowModal(true);
  };

  const handleCloseModal = async () => {
    if (reservedSlot && coinSlotLockId) {
      await apiClient.releaseCoinSlot(reservedSlot, coinSlotLockId).catch(() => {});
    }
    setShowModal(false);
    setReservedSlot(null);
    setCoinSlotLockId(null);
  };

  const handleGoToInternet = () => {
    // Navigate to success page which will trigger captive portal exit
    window.location.href = '/success';
  };

  const handlePause = async () => {
    // Only allow pause when there's an active session with time
    if (!mySession || !mySession.token || mySession.remainingSeconds <= 0) return;
    try {
      const result = await apiClient.pauseSession(mySession.token);
      if (result.success) {
        if (refreshSessions) refreshSessions();
      } else {
        alert('Pause failed: ' + result.message);
      }
    } catch (err) {
      alert('Error pausing session: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleResume = async () => {
    // Only allow resume when there's an active session
    if (!mySession || !mySession.token) return;
    try {
      const result = await apiClient.resumeSession(mySession.token);
      if (result.success) {
        if (refreshSessions) refreshSessions();
        
        // Proactive network refresh after resume
        setTimeout(async () => {
          try {
            // Trigger a probe request to help the OS recognize internet is back
            await fetch('http://connectivitycheck.gstatic.com/generate_204', { mode: 'no-cors' }).catch(() => {});
            // Also try a common domain
            await fetch('http://1.1.1.1', { mode: 'no-cors' }).catch(() => {});
          } catch (e) {}
        }, 1000);
      } else {
        alert('Resume failed: ' + result.message);
      }
    } catch (err) {
      alert('Error resuming session: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // Play success audio when session becomes active
  useEffect(() => {
    if (mySession && mySession.remainingSeconds > 0 && config.connectedAudio) {
      // Only play if we haven't just refreshed the page (optional logic, but for now simple is better)
      // Check if we just started this session recently (e.g. within last 10 seconds)
      const isNewSession = (Date.now() - mySession.connectedAt) < 10000;
      
      if (isNewSession) {
        try {
          console.log('Playing Connected Audio...');
          const audio = new Audio(config.connectedAudio);
          audio.play().catch(e => console.log('Connected audio play failed', e));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [mySession, config.connectedAudio]);

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
    // If no session or no time, show 00:00:00
    if (seconds <= 0) {
      return (
        <>
          00<span className="text-2xl">h</span> 00<span className="text-2xl">m</span> 00<span className="text-2xl">s</span>
        </>
      );
    }
    
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
    <div className="portal-container min-h-screen" style={{ backgroundColor: config.backgroundColor, color: config.textColor }}>
      {/* Inject Custom CSS */}
      {config.customCss && <style dangerouslySetInnerHTML={{ __html: config.customCss }} />}
      
      <header 
        className="portal-header"
        style={{ 
          background: `linear-gradient(135deg, ${config.primaryColor} 0%, ${config.secondaryColor} 100%)`,
          color: '#ffffff'
        }}
      >
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tighter mb-1 uppercase">{config.title}</h1>
          <p className="text-xs font-bold opacity-80 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.9)' }}>{config.subtitle}</p>
        </div>
      </header>

      {/* Inject Custom HTML Top */}
      {config.customHtmlTop && (
        <div 
          className="portal-custom-html-top" 
          dangerouslySetInnerHTML={{ __html: config.customHtmlTop }} 
        />
      )}

      <main className="relative z-20">
        <div className="portal-card">
          {/* Always show whoami info */}
          <div className="mb-6 animate-in fade-in zoom-in duration-500">
            <p className="text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
              {mySession ? 'Authenticated Session' : 'Device Information'}
            </p>
            <h2 className={`text-6xl font-black mb-4 tracking-tighter ${mySession?.isPaused ? 'text-orange-500 animate-pulse' : mySession ? 'text-slate-900' : 'text-slate-400'}`}>
              {formatSessionTime(mySession ? mySession.remainingSeconds : 0)}
            </h2>
            <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">
              {mySession ? (
                mySession.isPaused ? (
                  <span className="text-orange-500 font-black flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full"></span>
                    Time Paused - Internet Suspended
                  </span>
                ) : (
                  <span className="text-green-500 font-black flex items-center justify-center gap-2">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    Internet Access Live
                  </span>
                )
              ) : (
                <span className="text-slate-500 font-black flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                  No Active Session
                </span>
              )}
              <span>Session ID: {myMac}</span>
            </div>
              
              {/* Show pause button only when there's an active session with time */}
              {mySession && mySession.remainingSeconds > 0 && (
                !mySession.isPaused ? (
                  <>
                    <button 
                      onClick={handleGoToInternet}
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest mb-3 shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <span>🌍</span> PROCEED TO INTERNET
                    </button>
                    
                    <button 
                      onClick={handlePause}
                      className="w-full bg-orange-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest mb-3 shadow-xl hover:bg-orange-600 transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                      <span>⏸️</span> PAUSE MY TIME
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={handleResume}
                    className="w-full bg-green-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest mb-3 shadow-xl hover:bg-green-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>▶️</span> RESUME MY TIME
                  </button>
                )
              )}
              
              <button 
                onClick={handleRefreshNetwork}
                disabled={isRefreshing}
                className="w-full bg-blue-600 text-white py-3 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{isRefreshing ? '⟳' : '🔄'}</span> 
                {isRefreshing ? 'REFRESHING...' : 'REFRESH CONNECTION'}
              </button>
            </div>

          {isRevoked && (
            <div className="mx-6 mb-6 p-4 bg-orange-50 border border-orange-100 rounded-2xl text-orange-600 text-center animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="text-xl mb-1">🛡️</div>
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                System License Revoked: Limited Service Mode Active
              </p>
            </div>
          )}

          {availableSlots.length > 0 && (
            <div className="px-8 mb-6">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 text-center">
                Select Coinslot Location
              </label>
              <div className="relative">
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full appearance-none bg-white border-2 border-slate-100 rounded-xl py-3 px-4 text-xs font-black uppercase tracking-widest text-slate-700 focus:outline-none focus:border-blue-600 focus:ring-0 transition-all"
                >
                  <option value="main">🏠 Main Machine</option>
                  {availableSlots.map(slot => (
                    <option key={slot.id} value={slot.macAddress} disabled={slot.license && !slot.license.isValid}>
                      {slot.license && !slot.license.isValid ? '🔒' : (slot.isOnline ? '🟢' : '🔴')} {slot.name} {slot.license && !slot.license.isValid ? '(DISABLED)' : ''}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          )}

          {slotError && (
            <div className="mx-6 mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-center animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="text-xl mb-1">⚠️</div>
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                {slotError}
              </p>
            </div>
          )}

          <button onClick={handleOpenModal} className="portal-btn">
            {mySession ? 'ADD MORE TIME' : 'INSERT COIN'}
          </button>
          
          <button 
            onClick={() => setShowVoucherModal(true)}
            className="mt-3 w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:from-purple-700 hover:to-pink-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span>🎫</span> USE VOUCHER CODE
          </button>
          
          {/* Restore session button - only show when there's no active session but we have a restore function */}
          {!mySession && onRestoreSession && (
            <div className="mt-4 text-center">
              <button 
                onClick={onRestoreSession}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2 mx-auto"
              >
                <span>🔄</span> RESTORE MY SESSION
              </button>
              <p className="text-[9px] text-slate-400 mt-2 uppercase tracking-widest">
                Switched WiFi networks? Click to restore your time.
              </p>
            </div>
          )}
        </div>

        <div className="mb-8 px-6">
          <button 
            onClick={() => setShowRatesModal(true)}
            className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
          >
            💰 VIEW ALL RATES
          </button>
        </div>

        <div className="mx-6 bg-slate-50 text-slate-700 p-5 rounded-2xl border border-slate-200">
          <h4 className="font-black text-sm mb-3 uppercase tracking-tight text-slate-900">How to Connect</h4>
          <ul className="text-[9px] space-y-2 font-bold uppercase tracking-widest list-none">
            <li className="flex gap-2 items-center">
              <span className="bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px] shrink-0">1</span>
              Tap 'INSERT COIN'
            </li>
            <li className="flex gap-2 items-center">
              <span className="bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px] shrink-0">2</span>
              Drop 1, 5, or 10 Peso coins
            </li>
            <li className="flex gap-2 items-center">
              <span className="bg-blue-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[8px] shrink-0">3</span>
              Click 'Start Surfing'
            </li>
          </ul>
        </div>
      </main>

      {/* Inject Custom HTML Bottom */}
      {config.customHtmlBottom && (
        <div 
          className="portal-custom-html-bottom" 
          dangerouslySetInnerHTML={{ __html: config.customHtmlBottom }} 
        />
      )}

      <footer className="mt-12 text-center pb-10 flex flex-col items-center gap-4">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 opacity-50">
          Powered by AJC PisoWifi System
        </p>
      </footer>

      {showModal && (
        <CoinModal 
          onClose={handleCloseModal}
          audioSrc={config.coinDropAudio}
          insertCoinAudioSrc={config.insertCoinAudio}
          selectedSlot={selectedSlot}
          coinSlot={reservedSlot || selectedSlot}
          coinSlotLockId={coinSlotLockId || undefined}
          onSuccess={(pesos, minutes) => {
            onSessionStart({
              mac: myMac,
              remainingSeconds: minutes * 60,
              totalPaid: pesos,
              connectedAt: Date.now(),
              coinSlot: reservedSlot || selectedSlot,
              coinSlotLockId: coinSlotLockId || undefined
              // Don't send IP - server will detect it
            });
            setShowModal(false);
            setReservedSlot(null);
            setCoinSlotLockId(null);
          }}
          rates={activeRates}
        />
      )}
      
      {showVoucherModal && (
        <VoucherModal 
          isOpen={showVoucherModal}
          onClose={() => setShowVoucherModal(false)}
          onVoucherActivated={(session) => {
            onSessionStart(session);
            setShowVoucherModal(false);
            if (refreshSessions) refreshSessions();
          }}
        />
      )}
      
      {/* Rates Modal */}
      {showRatesModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-in zoom-in duration-300 shadow-2xl border border-slate-200 max-w-sm w-full mx-4">
            <div className="p-5 text-center bg-slate-50 border-b border-slate-100">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">💰 Pricing Rates</h3>
            </div>
            <div className="p-5 space-y-3">
              {activeRates.sort((a,b) => a.pesos - b.pesos).map(rate => (
                <div key={rate.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                  <span className="font-black text-slate-900">₱{rate.pesos}</span>
                  <span className="text-sm font-bold text-slate-600">
                    {rate.minutes >= 60 
                      ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                      : `${rate.minutes}m`}
                  </span>
                </div>
              ))}
            </div>
            <div className="p-5 pt-0">
              <button
                onClick={() => setShowRatesModal(false)}
                className="w-full py-3 bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <ChatWidget mac={myMac} />
    </div>
  );
};

export default LandingPage;
