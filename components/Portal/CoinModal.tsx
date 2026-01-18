
import React, { useState, useEffect } from 'react';
import { Rate } from '../../types';
import { io } from 'https://esm.sh/socket.io-client@^4.7.2';

interface Props {
  onClose: () => void;
  onSuccess: (pesos: number, minutes: number) => void;
  rates: Rate[];
}

const CoinModal: React.FC<Props> = ({ onClose, onSuccess, rates }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalPesos, setTotalPesos] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // In a production environment, this connects to the local Node.js server
    const socket = io(window.location.origin);

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('coin-pulse', (data: { pesos: number }) => {
      setTotalPesos(prev => prev + data.pesos);
      
      const rate = rates.find(r => r.pesos === data.pesos);
      if (rate) {
        setTotalMinutes(prev => prev + rate.minutes);
      } else {
        setTotalMinutes(prev => prev + (data.pesos * 10)); // Default fallback
      }
      
      setTimeLeft(60); // Reset countdown on activity
    });

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      socket.disconnect();
    };
  }, [rates]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-slate-950/90 backdrop-blur-xl">
      <div className="w-full max-w-md bg-white rounded-[40px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in duration-300">
        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
          <div className="flex justify-center mb-4">
            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 ${
              isConnected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {isConnected ? 'Hardware Online' : 'Hardware Disconnected'}
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-1 uppercase tracking-tighter">AJC Coin Acceptor</h3>
          <p className="text-sm text-slate-500 font-medium">Listening for pulses on GPIO Pin 3...</p>
        </div>

        <div className="p-8 space-y-10">
          <div className="flex flex-col items-center justify-center py-12 rounded-[40px] bg-blue-600 text-white shadow-2xl shadow-blue-500/40 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/5 group-hover:scale-110 transition-transform duration-700"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2 relative z-10">Waiting for pulse</span>
            <span className="text-6xl font-black font-mono relative z-10">{timeLeft}s</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-6 rounded-3xl text-center border border-slate-100 shadow-inner">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Credit Detected</span>
              <span className="text-4xl font-black text-slate-900 tracking-tighter">₱{totalPesos}</span>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl text-center border border-slate-100 shadow-inner">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Time Banked</span>
              <span className="text-4xl font-black text-slate-900 tracking-tighter">{totalMinutes}<span className="text-xl">m</span></span>
            </div>
          </div>
        </div>

        <div className="p-6 pb-10 flex flex-col gap-3">
          <button
            onClick={() => onSuccess(totalPesos, totalMinutes)}
            disabled={totalPesos === 0}
            className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-2xl tracking-tight ${
              totalPesos > 0 
                ? 'gradient-bg text-white shadow-blue-500/40 active:scale-95' 
                : 'bg-slate-100 text-slate-300 shadow-none cursor-not-allowed'
            }`}
          >
            CONFIRM AND CONNECT
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-slate-400 font-black text-[11px] uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Abort Transaction
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoinModal;
