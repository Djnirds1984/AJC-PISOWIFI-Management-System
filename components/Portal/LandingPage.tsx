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

  // Hardcoded fallback if database is loading or empty
  const defaultRates: Rate[] = [
    { id: '1', pesos: 1, minutes: 10 },
    { id: '5', pesos: 5, minutes: 60 },
    { id: '10', pesos: 10, minutes: 180 }
  ];

  const activeRates = rates.length > 0 ? rates : defaultRates;

  useEffect(() => {
    // Attempt to get unique ID for this device
    const storageKey = 'ajc_client_id';
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = 'A4:' + Array.from({length: 5}, () => Math.floor(Math.random()*255).toString(16).padStart(2, '0')).join(':').toUpperCase();
      localStorage.setItem(storageKey, id);
    }
    setMyMac(id);
  }, []);

  const mySession = sessions.find(s => s.mac === myMac);

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      <header className="gradient-bg text-white p-8 pt-12 rounded-b-[40px] shadow-2xl relative overflow-hidden text-center">
        <div className="relative z-10">
          <h1 className="text-3xl font-black tracking-tighter mb-1 uppercase">AJC PISOWIFI</h1>
          <p className="text-blue-100 text-xs font-bold opacity-80 uppercase tracking-widest">Enterprise Internet Gateway</p>
        </div>
      </header>

      <main className="px-6 -mt-8 relative z-20">
        {mySession ? (
          <div className="glass-card p-8 shadow-xl mb-8 text-center" style={{borderColor: '#3b82f6'}}>
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
          <div className="glass-card p-10 shadow-xl mb-8 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">📡</div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Access Restricted</h2>
            <p className="text-slate-500 text-sm mb-8 font-medium">Please authenticate by dropping coins into the system.</p>
            <button 
              onClick={() => setShowModal(true)}
              className="gradient-bg text-white py-5 shadow-xl font-black text-xl"
            >
              INSERT COIN
            </button>
          </div>
        )}

        <div className="mb-10">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">Access Rates</h3>
          <div className="grid grid-cols-2 gap-4" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
            {activeRates.sort((a,b) => a.pesos - b.pesos).map(rate => (
              <div key={rate.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 text-center">
                <span className="text-3xl font-black text-slate-900 block">₱{rate.pesos}</span>
                <span className="text-[10px] font-black text-blue-600 uppercase mt-2 tracking-widest block">
                  {rate.minutes >= 60 
                    ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                    : `${rate.minutes} Minutes`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="font-black text-lg mb-4 uppercase tracking-tight">🚀 Express Access</h4>
            <ul className="text-xs text-slate-400 space-y-4 font-bold uppercase tracking-widest list-none">
              <li className="flex gap-3">
                <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">1</span>
                Tap 'Insert Coin' to activate slot.
              </li>
              <li className="flex gap-3">
                <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">2</span>
                Drop coins for validation.
              </li>
              <li className="flex gap-3">
                <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">3</span>
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
          onClose={() => setShowModal(false)} 
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