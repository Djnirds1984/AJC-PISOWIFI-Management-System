import React, { useState, useEffect } from 'react';
import { Rate } from '../../types';
import { io } from 'socket.io-client';

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
    console.log('[COIN] Connecting to Hardware Socket...');
    // Fix: Explicitly casting to 'any' because the Socket type in this environment is not correctly exposing the '.on' event emitter method.
    const socket: any = io(window.location.origin);

    socket.on('connect', () => {
      console.log('[COIN] Socket Connected to Gateway');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.warn('[COIN] Socket Disconnected');
      setIsConnected(false);
    });

    socket.on('coin-pulse', (data: { pesos: number }) => {
      console.log(`[COIN] Received Pulse: ₱${data.pesos}`);
      setTotalPesos(prev => prev + data.pesos);
      
      const rate = rates.find(r => r.pesos === data.pesos);
      if (rate) {
        setTotalMinutes(prev => prev + rate.minutes);
      } else {
        // Linear fallback if specific rate not found
        setTotalMinutes(prev => prev + (data.pesos * 10)); 
      }
      
      setTimeLeft(60); // Reset timeout on drop
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
    <div className="modal-overlay">
      <div className="modal-content animate-in zoom-in duration-300 shadow-2xl border border-slate-200">
        <div className="p-8 text-center bg-slate-50 border-b border-slate-100">
          <div className="flex justify-center mb-4">
            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-1.5 ${
              isConnected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {isConnected ? 'Hardware Active' : 'Waiting for link...'}
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-1 uppercase tracking-tighter">Drop Coins Now</h3>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Listening for physical pulses</p>
        </div>

        <div className="p-10 space-y-10">
          <div className="flex flex-col items-center justify-center py-10 rounded-[40px] bg-blue-600 text-white shadow-2xl shadow-blue-500/40 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/5 animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2 relative z-10">Remaining Time</span>
            <span className="text-6xl font-black font-mono relative z-10">{timeLeft}s</span>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-slate-50 p-6 rounded-3xl text-center border border-slate-100 shadow-inner">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Credits</span>
              <span className="text-4xl font-black text-slate-900 tracking-tighter">₱{totalPesos}</span>
            </div>
            <div className="bg-slate-50 p-6 rounded-3xl text-center border border-slate-100 shadow-inner">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Minutes</span>
              <span className="text-4xl font-black text-slate-900 tracking-tighter">{totalMinutes}</span>
            </div>
          </div>
        </div>

        <div className="p-8 pt-0 pb-10 flex flex-col gap-4">
          <button
            onClick={() => onSuccess(totalPesos, totalMinutes)}
            disabled={totalPesos === 0}
            className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-xl tracking-tight uppercase ${
              totalPesos > 0 
                ? 'bg-blue-600 text-white shadow-blue-500/30 active:scale-95' 
                : 'bg-slate-100 text-slate-300 shadow-none cursor-not-allowed'
            }`}
          >
            Start Surfing
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] hover:text-slate-600 transition-colors"
          >
            Cancel & Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoinModal;