import React, { useEffect, useRef, useState } from 'react';
import { Rate } from '../../types';
import { io } from 'socket.io-client';
import { apiClient } from '../../lib/api';

interface Props {
  onClose: () => void;
  onSuccess: (pesos: number, minutes: number) => void;
  rates: Rate[];
  audioSrc?: string; // Coin Drop Audio
  insertCoinAudioSrc?: string; // Background Loop
  selectedSlot?: string; // 'main' or NodeMCU MAC address
  coinSlot?: string;
  coinSlotLockId?: string;
}

const CoinModal: React.FC<Props> = ({ onClose, onSuccess, rates, audioSrc, insertCoinAudioSrc, selectedSlot = 'main', coinSlot, coinSlotLockId }) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalPesos, setTotalPesos] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const didAutoClose = useRef(false);

  // Handle Background Audio (Insert Coin Loop)
  useEffect(() => {
    let audio: HTMLAudioElement | null = null;
    if (insertCoinAudioSrc) {
      try {
        audio = new Audio(insertCoinAudioSrc);
        audio.loop = true;
        audio.volume = 0.5; // Slightly lower volume for background
        audio.play().catch(e => console.log('Background audio play failed', e));
      } catch (e) {
        console.error(e);
      }
    }
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [insertCoinAudioSrc]);

  

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

    const handlePulse = (pesos: number) => {
      console.log(`[COIN] Received Pulse: ₱${pesos}`);
      
      // Play Audio
      if (audioSrc) {
        try {
          const audio = new Audio(audioSrc);
          audio.play().catch(e => console.log('Audio play failed', e));
        } catch (e) { console.error(e); }
      }

      setTotalPesos(prev => prev + pesos);
      
      const rate = rates.find(r => r.pesos === pesos);
      if (rate) {
        setTotalMinutes(prev => prev + rate.minutes);
      } else {
        // Linear fallback if specific rate not found
        setTotalMinutes(prev => prev + (pesos * 10)); 
      }
      
      setTimeLeft(60); // Reset timeout on drop

      if (coinSlot && coinSlotLockId) {
        apiClient.heartbeatCoinSlot(coinSlot, coinSlotLockId).catch(() => {});
      }
    };

    socket.on('coin-pulse', (data: { pesos: number }) => {
      if (selectedSlot === 'main') {
        handlePulse(data.pesos);
      }
    });

    socket.on('nodemcu-pulse', (data: { denomination: number, macAddress: string }) => {
      if (selectedSlot === data.macAddress) {
        handlePulse(data.denomination);
      }
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
  }, [rates, selectedSlot, audioSrc, coinSlot, coinSlotLockId]);

  useEffect(() => {
    if (!coinSlot || !coinSlotLockId) return;
    apiClient.heartbeatCoinSlot(coinSlot, coinSlotLockId).catch(() => {});
  }, [coinSlot, coinSlotLockId]);

  useEffect(() => {
    if (timeLeft !== 0) return;
    if (didAutoClose.current) return;
    didAutoClose.current = true;
    onClose();
  }, [timeLeft, onClose]);

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-in zoom-in duration-300 shadow-2xl border border-slate-200 max-w-md w-full mx-4">
        <div className="p-5 text-center bg-slate-50 border-b border-slate-100">
          <div className="flex justify-center mb-3">
            <div className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.2em] flex items-center gap-1 ${
              isConnected ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
              {isConnected ? 'Hardware Active' : 'Waiting for link...'}
            </div>
          </div>
          <h3 className="text-lg font-black text-slate-900 mb-1 uppercase tracking-tight">Drop Coins Now</h3>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Listening for pulses</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center justify-center py-6 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/5 animate-pulse"></div>
            <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60 mb-1.5 relative z-10">Time Left</span>
            <span className="text-5xl font-black font-mono relative z-10">{timeLeft}s</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100 shadow-sm">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Credits</span>
              <span className="text-3xl font-black text-slate-900 tracking-tight">₱{totalPesos}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100 shadow-sm">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Minutes</span>
              <span className="text-3xl font-black text-slate-900 tracking-tight">{totalMinutes}</span>
            </div>
          </div>
        </div>

        <div className="p-5 pt-0 pb-6 flex flex-col gap-3">
          <button
            onClick={() => onSuccess(totalPesos, totalMinutes)}
            disabled={totalPesos === 0}
            className={`w-full py-4 rounded-xl font-black text-base transition-all shadow-md tracking-tight uppercase ${
              totalPesos > 0 
                ? 'bg-blue-600 text-white shadow-blue-500/30 active:scale-95' 
                : 'bg-slate-100 text-slate-300 shadow-none cursor-not-allowed'
            }`}
          >
            Start Surfing
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] hover:text-slate-600 transition-colors"
          >
            Cancel & Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoinModal;
