import React, { useState, useEffect } from 'react';
import { Rate, UserSession } from '../../types';
import CoinModal from './CoinModal';

interface Props {
  rates: Rate[];
  sessions: UserSession[];
  onSessionStart: (session: UserSession) => void;
}

const LandingPage: React.FC<Props> = ({ rates, sessions, onSessionStart }) => {
  const [showModal, setShowModal] = useState(false);
  const [myMac, setMyMac] = useState('00:00:00:00:00:00');

  // Hardcoded default rates in case the API fetch returns nothing
  const defaultRates: Rate[] = [
    { id: '1', pesos: 1, minutes: 10 },
    { id: '5', pesos: 5, minutes: 60 },
    { id: '10', pesos: 10, minutes: 180 }
  ];

  // Logic to prioritize custom rates from the database
  const activeRates = (rates && rates.length > 0) ? rates : defaultRates;

  useEffect(() => {
    // Generate or fetch a semi-permanent client ID
    const storageKey = 'ajc_client_id';
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = 'A4:' + Array.from({length: 5}, () => Math.floor(Math.random()*255).toString(16).padStart(2, '0')).join(':').toUpperCase();
      localStorage.setItem(storageKey, id);
    }
    setMyMac(id);
  }, []);

  const mySession = sessions.find(s => s.mac === myMac);

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[PORTAL] Activating Coin Modal...');
    setShowModal(true);
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
        {mySession ? (
          <div className="portal-card">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Authenticated Session</p>
            <h2 className="text-6xl font-black text-blue-600 mb-4 tracking-tighter">
              {Math.floor(mySession.remainingSeconds / 60)}<span className="text-2xl">m</span> {mySession.remainingSeconds % 60}<span className="text-2xl">s</span>
            </h2>
            <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              <span className="text-green-500 font-black">● ACTIVE CONNECTION</span>
              <span>Client ID: {myMac}</span>
            </div>
          </div>
        ) : (
          <div className="portal-card">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">📡</div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Access Restricted</h2>
            <p className="text-slate-500 text-sm mb-8 font-medium">Please authenticate by dropping coins into the system.</p>
            <button 
              onClick={handleOpenModal}
              className="portal-btn"
            >
              INSERT COIN
            </button>
          </div>
        )}

        <div className="mb-10">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-5 px-8">Available Access Rates</h3>
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
          <div className="relative z-10">
            <h4 className="font-black text-lg mb-4 uppercase tracking-tight italic text-blue-400">🚀 Express Access</h4>
            <ul className="text-[10px] text-slate-400 space-y-4 font-bold uppercase tracking-widest list-none">
              <li className="flex gap-4 items-center">
                <span className="bg-white/10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 text-white">1</span>
                Tap 'Insert Coin' to activate slot.
              </li>
              <li className="flex gap-4 items-center">
                <span className="bg-white/10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 text-white">2</span>
                Drop coins for validation.
              </li>
              <li className="flex gap-4 items-center">
                <span className="bg-white/10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 text-white">3</span>
                Instant connection.
              </li>
            </ul>
          </div>
        </div>
      </main>

      <footer className="mt-12 text-center text-slate-400 text-[9px] font-black uppercase tracking-[0.3em] pb-10">
        © 2025 AJC PISOWIFI SYSTEM • HARDWARE v3.3.0
      </footer>

      {showModal && (
        <CoinModal 
          onClose={() => {
            console.log('[PORTAL] Closing Modal');
            setShowModal(false);
          }} 
          onSuccess={(pesos, minutes) => {
            onSessionStart({
              mac: myMac,
              ip: '10.0.0.' + Math.floor(Math.random()*254 + 2),
              remainingSeconds: minutes * 60,
              totalPaid: pesos,
              connectedAt: Date.now()
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