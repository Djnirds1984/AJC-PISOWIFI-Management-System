
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

  useEffect(() => {
    const randomMAC = 'A4:F1:C7:' + Math.floor(Math.random()*255).toString(16).padStart(2, '0') + ':' + 
                     Math.floor(Math.random()*255).toString(16).padStart(2, '0') + ':' +
                     Math.floor(Math.random()*255).toString(16).padStart(2, '0');
    setMyMac(randomMAC.toUpperCase());
  }, []);

  const mySession = sessions.find(s => s.mac === myMac);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="gradient-bg text-white p-8 pt-12 rounded-b-[40px] shadow-2xl relative overflow-hidden">
        <div className="relative z-10 text-center">
          <h1 className="text-3xl font-black tracking-tighter mb-1 text-white">AJC PISOWIFI</h1>
          <p className="text-blue-100 text-sm font-medium opacity-80 uppercase tracking-widest">Enterprise Internet Gateway</p>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
      </header>

      <main className="px-6 -mt-8 relative z-20">
        {mySession ? (
          <div className="glass-card p-8 rounded-3xl shadow-xl mb-8 text-center border-2 border-blue-500/20">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Authenticated Session</p>
            <h2 className="text-6xl font-black text-blue-600 mb-4 tracking-tighter">
              {Math.floor(mySession.remainingSeconds / 60)}<span className="text-2xl">m</span> {mySession.remainingSeconds % 60}<span className="text-2xl">s</span>
            </h2>
            <div className="flex flex-col gap-1 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              <span className="text-green-500 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                ACTIVE CONNECTION
              </span>
              <span>Client ID: {myMac}</span>
            </div>
          </div>
        ) : (
          <div className="glass-card p-10 rounded-3xl shadow-xl mb-8 text-center border-2 border-slate-100">
            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl shadow-inner">📡</div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Access Restricted</h2>
            <p className="text-slate-500 text-sm mb-8 font-medium">Please authenticate by dropping coins into the system.</p>
            <button 
              onClick={() => setShowModal(true)}
              className="w-full gradient-bg text-white py-5 rounded-2xl font-black text-xl shadow-xl shadow-blue-500/40 transform active:scale-95 transition-all tracking-tight"
            >
              INSERT COIN
            </button>
          </div>
        )}

        <div className="mb-10">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 px-2">Access Rates</h3>
          <div className="grid grid-cols-2 gap-4">
            {rates.length > 0 ? rates.sort((a,b) => a.pesos - b.pesos).map(rate => (
              <div key={rate.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center group hover:border-blue-200 transition-all">
                <span className="text-3xl font-black text-slate-900 group-hover:scale-110 transition-transform">₱{rate.pesos}</span>
                <span className="text-[10px] font-black text-blue-600 uppercase mt-2 tracking-widest">
                  {rate.minutes >= 60 
                    ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                    : `${rate.minutes} Minutes`}
                </span>
              </div>
            )) : (
              <div className="col-span-2 py-10 bg-white rounded-3xl border border-dashed border-slate-200 text-center text-slate-400 text-xs font-black uppercase">Configuring Rates...</div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 text-white p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="font-black text-lg mb-4 flex items-center gap-2 uppercase tracking-tight">
              <span>🚀</span> Express Access
            </h4>
            <ul className="text-xs text-slate-400 space-y-4 font-bold uppercase tracking-widest">
              <li className="flex items-start gap-3">
                <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">1</span>
                Tap 'Insert Coin' above to activate slot.
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">2</span>
                Wait for system validation.
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-white/10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">3</span>
                Instant redirection upon confirmation.
              </li>
            </ul>
          </div>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full"></div>
        </div>
      </main>

      <footer className="mt-12 text-center text-slate-400 text-[9px] font-black uppercase tracking-[0.3em] pb-10">
        © 2025 AJC PISOWIFI SYSTEM • HARDWARE v2.5.0
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
          rates={rates}
        />
      )}
    </div>
  );
};

export default LandingPage;
