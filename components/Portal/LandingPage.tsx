
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
    // In a real environment, the system knows the MAC from the gateway.
    // Here we generate a pseudo-random MAC for simulation.
    const randomMAC = 'A4:F1:C7:' + Math.floor(Math.random()*255).toString(16).padStart(2, '0') + ':' + 
                     Math.floor(Math.random()*255).toString(16).padStart(2, '0') + ':' +
                     Math.floor(Math.random()*255).toString(16).padStart(2, '0');
    setMyMac(randomMAC.toUpperCase());
  }, []);

  const mySession = sessions.find(s => s.mac === myMac);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <header className="gradient-bg text-white p-8 rounded-b-[40px] shadow-2xl relative overflow-hidden">
        <div className="relative z-10 text-center">
          <h1 className="text-3xl font-black tracking-tighter mb-1">AJC PISOWIFI</h1>
          <p className="text-blue-100 text-sm font-medium opacity-80">Fast & Reliable Internet Access</p>
        </div>
        {/* Abstract shapes */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
      </header>

      <main className="px-6 -mt-8 relative z-20">
        {/* Active Session Status */}
        {mySession ? (
          <div className="glass-card p-6 rounded-3xl shadow-xl mb-8 text-center border-2 border-blue-500/20">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Active Session</p>
            <h2 className="text-5xl font-black text-blue-600 mb-2">
              {Math.floor(mySession.remainingSeconds / 60)}<span className="text-xl">m</span> {mySession.remainingSeconds % 60}<span className="text-xl">s</span>
            </h2>
            <div className="flex justify-center gap-4 text-xs text-slate-400 font-medium">
              <span>Status: <span className="text-green-500 font-bold">CONNECTED</span></span>
              <span>•</span>
              <span>MAC: {myMac}</span>
            </div>
          </div>
        ) : (
          <div className="glass-card p-8 rounded-3xl shadow-xl mb-8 text-center border-2 border-slate-100">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📡</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Not Connected</h2>
            <p className="text-slate-500 text-sm mb-6">Insert coins to start surfing the web at high speeds.</p>
            <button 
              onClick={() => setShowModal(true)}
              className="w-full gradient-bg text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-500/40 transform active:scale-95 transition-all"
            >
              INSERT COIN
            </button>
          </div>
        )}

        {/* Rates Section */}
        <div className="mb-10">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 px-2">Internet Rates</h3>
          <div className="grid grid-cols-2 gap-4">
            {rates.sort((a,b) => a.pesos - b.pesos).map(rate => (
              <div key={rate.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center">
                <span className="text-2xl font-black text-slate-800">₱{rate.pesos}</span>
                <span className="text-xs font-bold text-blue-500 uppercase mt-1">
                  {rate.minutes >= 60 
                    ? `${Math.floor(rate.minutes / 60)}h ${rate.minutes % 60 > 0 ? (rate.minutes % 60) + 'm' : ''}`
                    : `${rate.minutes} Minutes`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Help/Instruction Section */}
        <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
          <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
            <span>💡</span> How to Connect
          </h4>
          <ol className="text-sm text-blue-800/70 space-y-2 list-decimal list-inside font-medium">
            <li>Click "Insert Coin" above</li>
            <li>Drop your 1, 5, or 10 peso coins</li>
            <li>Wait for the system to detect credits</li>
            <li>Click "Done" and enjoy!</li>
          </ol>
        </div>
      </main>

      {/* Footer Branding */}
      <footer className="mt-12 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest pb-10">
        POWERED BY AJC PISOWIFI SYSTEM
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
