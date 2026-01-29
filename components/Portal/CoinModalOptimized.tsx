import React, { useEffect, useRef, useState } from 'react';
import { Rate } from '../../types';
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

// Lightweight socket implementation for low-end devices
let socketInstance: any = null;

const CoinModalOptimized: React.FC<Props> = ({ 
  onClose, 
  onSuccess, 
  rates, 
  audioSrc, 
  insertCoinAudioSrc, 
  selectedSlot = 'main', 
  coinSlot, 
  coinSlotLockId 
}) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [totalPesos, setTotalPesos] = useState(0);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLowEndDevice, setIsLowEndDevice] = useState(false);
  const didAutoClose = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Detect low-end devices
  useEffect(() => {
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    const isSlowConnection = /slow-2g|2g/.test(navigator.connection?.effectiveType || '');
    
    setIsLowEndDevice(
      memory < 2 || 
      cores < 4 || 
      isSlowConnection ||
      /Android.*Chrome\/[.0-9]*/.test(navigator.userAgent) && parseInt((/Android\s([0-9]+)/.exec(navigator.userAgent) || ['', '0'])[1]) < 8
    );
  }, []);

  // Optimized background audio - only on high-end devices
  useEffect(() => {
    if (insertCoinAudioSrc && !isLowEndDevice) {
      try {
        audioRef.current = new Audio(insertCoinAudioSrc);
        audioRef.current.loop = true;
        audioRef.current.volume = 0.3; // Lower volume
        audioRef.current.play().catch(e => console.log('Background audio play failed', e));
      } catch (e) {
        console.error(e);
      }
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [insertCoinAudioSrc, isLowEndDevice]);

  // Optimized socket connection
  useEffect(() => {
    console.log('[COIN] Connecting to Hardware Socket...');
    
    // Use lightweight socket implementation for low-end devices
    if (isLowEndDevice) {
      // Simple polling for low-end devices
      const pollInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/coinslot/${selectedSlot}/status`);
          const data = await response.json();
          
          if (data.event === 'coin_drop') {
            handleCoinDrop(data.pesos);
          }
          
          if (data.event === 'disconnected') {
            setIsConnected(false);
          }
          
          if (data.event === 'connected') {
            setIsConnected(true);
          }
        } catch (error) {
          console.error('Polling error:', error);
          setIsConnected(false);
        }
      }, 1000);
      
      return () => clearInterval(pollInterval);
    } else {
      // Full socket.io for high-end devices
      const loadSocketIO = async () => {
        const { io } = await import('socket.io-client');
        
        socketInstance = io(window.location.origin, {
          transports: ['websocket', 'polling'], // Prefer websocket
          timeout: 5000,
          reconnection: true,
          reconnectionAttempts: 3,
          reconnectionDelay: 1000,
        });

        socketInstance.on('connect', () => {
          console.log('[COIN] Socket Connected');
          setIsConnected(true);
          socketInstance.emit('join_coinslot', selectedSlot);
        });

        socketInstance.on('disconnect', () => {
          console.log('[COIN] Socket Disconnected');
          setIsConnected(false);
        });

        socketInstance.on('coin_drop', (data: { pesos: number }) => {
          console.log('[COIN] Coin Drop Event:', data);
          handleCoinDrop(data.pesos);
        });

        socketInstance.on('coinslot_status', (data: { status: string }) => {
          console.log('[COIN] Status Update:', data);
          if (data.status === 'disconnected') {
            setIsConnected(false);
          }
        });
      };
      
      loadSocketIO();
      
      return () => {
        if (socketInstance) {
          socketInstance.disconnect();
          socketInstance = null;
        }
      };
    }
  }, [selectedSlot, isLowEndDevice]);

  const handleCoinDrop = (pesos: number) => {
    // Play coin drop sound - only on high-end devices
    if (audioSrc && !isLowEndDevice) {
      try {
        const audio = new Audio(audioSrc);
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Coin drop audio play failed', e));
      } catch (e) {
        console.error(e);
      }
    }

    setTotalPesos(prev => prev + pesos);
    const rate = rates.find(r => r.pesos === pesos);
    if (rate) {
      setTotalMinutes(prev => prev + rate.minutes);
    }
    setTimeLeft(60); // Reset timer on coin drop
  };

  // Timer countdown
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-close on timeout
          didAutoClose.current = true;
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [onClose]);

  const handleStartSession = async () => {
    if (totalPesos === 0) {
      alert('Please insert at least 1 peso to start.');
      return;
    }

    try {
      const result = await apiClient.startSession({
        pesos: totalPesos,
        minutes: totalMinutes,
        macAddress: '', // Server will detect
        coinSlot: coinSlot || selectedSlot,
        coinSlotLockId: coinSlotLockId
      });

      if (result.success) {
        onSuccess(totalPesos, totalMinutes);
      } else {
        alert('Failed to start session: ' + (result.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Start session error:', error);
      alert('Error starting session. Please try again.');
    }
  };

  const handleAddTime = () => {
    setTimeLeft(prev => prev + 60); // Add 1 minute
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
      <div className="bg-white rounded-[40px] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="text-center mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
              Insert Coin
            </h2>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
            >
              ×
            </button>
          </div>
          
          {/* Connection status */}
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 ${
            isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
          </div>

          {/* Timer */}
          <div className="text-4xl font-black text-slate-900 mb-2">
            {timeLeft}s
          </div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            Time remaining to insert coins
          </p>
        </div>

        {/* Current amount */}
        <div className="bg-blue-50 rounded-2xl p-6 mb-6 text-center">
          <div className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">
            Total Amount
          </div>
          <div className="text-4xl font-black text-blue-900 mb-1">
            ₱{totalPesos}
          </div>
          <div className="text-sm font-bold text-blue-700 uppercase tracking-widest">
            {totalMinutes} Minutes
          </div>
        </div>

        {/* Rate display - simplified for low-end devices */}
        <div className="mb-6">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 text-center">
            Accepted Coins
          </p>
          <div className="grid grid-cols-3 gap-2">
            {rates.sort((a,b) => a.pesos - b.pesos).map(rate => (
              <div key={rate.id} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-slate-900">₱{rate.pesos}</div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {rate.minutes}m
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={handleStartSession}
            disabled={totalPesos === 0 || !isConnected}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            START SESSION
          </button>
          
          <button
            onClick={handleAddTime}
            className="w-full bg-slate-200 text-slate-700 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-300 transition-all active:scale-95"
          >
            +1 MINUTE
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-slate-50 rounded-2xl">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center leading-relaxed">
            {isConnected ? 'Drop coins into the slot above' : 'Waiting for connection...'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default CoinModalOptimized;