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
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Git Integration Engine</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Repository Source</label>
            <input 
              type="text" 
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
              placeholder="https://github.com/..."
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Active Branch</label>
            <input 
              type="text" 
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
              placeholder="main"
            />
          </div>
        </div>
        <button
          onClick={startUpdate}
          disabled={isUpdating}
          className="bg-blue-600 text-white px-10 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30 disabled:opacity-50"
        >
          {isUpdating ? 'Synchronizing with Remote...' : 'Deploy System Update'}
        </button>
      </div>

      <div className="bg-slate-950 rounded-2xl shadow-3xl overflow-hidden border border-white/5">
        <div className="bg-white/5 px-6 py-3 flex items-center justify-between border-b border-white/5">
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
          </div>
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">bash_output</span>
          <div className="w-10"></div>
        </div>
        <div className="p-6 h-[450px] overflow-y-auto font-mono text-[11px] space-y-1.5 bg-[radial-gradient(circle_at_top_right,_#1a202c,_#000000)]">
          {logs.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-600 italic">
              <span className="text-blue-500">➜</span>
              <span>System idle. Awaiting deployment instruction.</span>
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-white/20 shrink-0 font-bold">[{log.timestamp}]</span>
                <span className={
                  log.type === 'success' ? 'text-green-400 font-bold' : 
                  log.type === 'error' ? 'text-red-400' : 'text-blue-400'
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