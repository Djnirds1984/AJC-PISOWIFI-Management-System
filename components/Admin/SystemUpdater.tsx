import React, { useState, useRef, useEffect } from 'react';
import { UpdateLog } from '../../types';
import { io } from 'socket.io-client';

const SystemUpdater: React.FC = () => {
  const [repo, setRepo] = useState('https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System');
  const [branch, setBranch] = useState('main');
  const [isUpdating, setIsUpdating] = useState(false);
  const [logs, setLogs] = useState<UpdateLog[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);

  useEffect(() => {
    socketRef.current = io(window.location.origin);
    
    socketRef.current.on('update-log', (log: UpdateLog) => {
      setLogs(prev => [...prev, {
        ...log,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    return () => socketRef.current.disconnect();
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const startUpdate = () => {
    if (!confirm('Warning: System update will restart the application. Proceed?')) return;
    setIsUpdating(true);
    setLogs([]);
    socketRef.current.emit('start-update', { repo, branch });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <div>
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">System Deployment</h3>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Git Integration Engine</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Repository Source</label>
            <input 
              type="text" 
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-[10px] bg-slate-50"
              placeholder="https://github.com/..."
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Target Branch</label>
            <input 
              type="text" 
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-blue-500 font-mono text-[10px] bg-slate-50"
              placeholder="main"
            />
          </div>
        </div>

        <button
          onClick={startUpdate}
          disabled={isUpdating}
          className="w-full sm:w-auto bg-slate-900 text-white px-8 py-2.5 rounded-lg font-black text-[10px] uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isUpdating ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Synchronizing...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Deploy Update
            </>
          )}
        </button>
      </div>

      <div className="bg-slate-950 rounded-xl shadow-2xl overflow-hidden border border-white/5">
        <div className="bg-white/5 px-4 py-2 flex items-center justify-between border-b border-white/5">
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500/60"></div>
            <div className="w-2 h-2 rounded-full bg-amber-500/60"></div>
            <div className="w-2 h-2 rounded-full bg-emerald-500/60"></div>
          </div>
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em]">bash_output</span>
          <div className="w-10"></div>
        </div>
        <div className="p-4 h-[350px] overflow-y-auto font-mono text-[10px] space-y-1 bg-[radial-gradient(circle_at_top_right,_#1a202c,_#000000)] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {logs.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-600 italic">
              <span className="text-blue-500">➜</span>
              <span className="uppercase tracking-tighter font-bold">System ready. Waiting for instruction.</span>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-3 animate-in fade-in slide-in-from-left-1 duration-200 border-l-2 border-transparent hover:border-white/10 hover:bg-white/5 px-1">
                <span className="text-white/20 shrink-0 font-bold tracking-tighter">[{log.timestamp}]</span>
                <span className={
                  log.type === 'success' ? 'text-emerald-400 font-bold' : 
                  log.type === 'error' ? 'text-rose-400 font-bold' : 'text-sky-400'
                }>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};

export default SystemUpdater;