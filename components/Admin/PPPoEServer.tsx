import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { NetworkInterface, PPPoEServerConfig, PPPoEUser, PPPoESession } from '../../types';

const PPPoEServer: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [loading, setLoading] = useState(false);
  
  // PPPoE Server State
  const [pppoeServer, setPppoeServer] = useState<Partial<PPPoEServerConfig>>({
    interface: '',
    local_ip: '192.168.100.1',
    ip_pool_start: '192.168.100.10',
    ip_pool_end: '192.168.100.254',
    dns1: '8.8.8.8',
    dns2: '8.8.4.4',
    service_name: ''
  });
  const [pppoeStatus, setPppoeStatus] = useState<any>(null);
  const [pppoeUsers, setPppoeUsers] = useState<PPPoEUser[]>([]);
  const [pppoeSessions, setPppoeSessions] = useState<PPPoESession[]>([]);
  const [newPppoeUser, setNewPppoeUser] = useState({ username: '', password: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ifaces, pppoeS, pppoeU, pppoeSess] = await Promise.all([
        apiClient.getInterfaces(),
        apiClient.getPPPoEServerStatus().catch(() => null),
        apiClient.getPPPoEUsers().catch(() => []),
        apiClient.getPPPoESessions().catch(() => [])
      ]);
      setInterfaces(ifaces.filter(i => !i.isLoopback));
      setPppoeStatus(pppoeS);
      setPppoeUsers(Array.isArray(pppoeU) ? pppoeU : []);
      setPppoeSessions(Array.isArray(pppoeSess) ? pppoeSess : []);
    } catch (err) { 
      console.error('[UI] Data Load Error:', err); 
    }
    finally { setLoading(false); }
  };

  // PPPoE Server Functions
  const startPPPoEServerHandler = async () => {
    if (!pppoeServer.interface || !pppoeServer.local_ip || !pppoeServer.ip_pool_start || !pppoeServer.ip_pool_end) {
      return alert('Please fill all required fields!');
    }
    
    try {
      setLoading(true);
      await apiClient.startPPPoEServer(pppoeServer as PPPoEServerConfig);
      await loadData();
      alert('PPPoE Server started successfully!');
    } catch (e: any) {
      alert(`Failed to start PPPoE Server: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const stopPPPoEServerHandler = async () => {
    if (!confirm('Stop PPPoE Server? All active connections will be terminated.')) return;
    
    try {
      setLoading(true);
      await apiClient.stopPPPoEServer(pppoeStatus?.config?.interface || '');
      await loadData();
      alert('PPPoE Server stopped');
    } catch (e: any) {
      alert(`Failed to stop server: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const addPPPoEUserHandler = async () => {
    if (!newPppoeUser.username || !newPppoeUser.password) {
      return alert('Username and password required!');
    }
    
    try {
      setLoading(true);
      await apiClient.addPPPoEUser(newPppoeUser.username, newPppoeUser.password);
      setNewPppoeUser({ username: '', password: '' });
      await loadData();
      alert(`User ${newPppoeUser.username} added!`);
    } catch (e: any) {
      alert(`Failed to add user: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePPPoEUserHandler = async (userId: number, username: string) => {
    if (!confirm(`Delete PPPoE user "${username}"?`)) return;
    
    try {
      setLoading(true);
      await apiClient.deletePPPoEUser(userId);
      await loadData();
    } catch (e: any) {
      alert(`Failed to delete user: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-32 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* PPPoE Server Management */}
      <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">PPPoE Server</h3>
            <span className="text-[8px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-black tracking-tighter">ISP MODE</span>
          </div>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter hidden sm:block">Accept PPPoE client connections</p>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Status and Config (Left) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Status Card */}
            <div className="bg-slate-900 rounded-lg p-3 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${pppoeStatus?.running ? 'bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-red-400'}`}></div>
                <div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Server Status</div>
                  <div className="text-[10px] font-black uppercase tracking-tight">
                    {pppoeStatus?.running ? `Running on ${pppoeStatus.config?.interface}` : 'Inactive'}
                  </div>
                </div>
              </div>
              {pppoeStatus?.running && (
                <button onClick={stopPPPoEServerHandler} disabled={loading} className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-[9px] font-black uppercase transition-all active:scale-95 disabled:opacity-50">
                  Stop Server
                </button>
              )}
            </div>

            {/* Config Form */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Listen Interface</label>
                    <select 
                      value={pppoeServer.interface}
                      onChange={e => setPppoeServer({...pppoeServer, interface: e.target.value})}
                      disabled={pppoeStatus?.running}
                      className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-bold disabled:opacity-50 focus:ring-1 focus:ring-slate-900 outline-none"
                    >
                      <option value="">Select Interface...</option>
                      {interfaces.filter(i => i.type === 'ethernet' || i.type === 'vlan').map(i => (
                        <option key={i.name} value={i.name}>{i.name} ({i.type})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Local IP</label>
                    <input 
                      type="text" 
                      value={pppoeServer.local_ip} 
                      onChange={e => setPppoeServer({...pppoeServer, local_ip: e.target.value})}
                      disabled={pppoeStatus?.running}
                      className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono disabled:opacity-50 outline-none" 
                      placeholder="192.168.100.1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Pool Start</label>
                      <input 
                        type="text" 
                        value={pppoeServer.ip_pool_start} 
                        onChange={e => setPppoeServer({...pppoeServer, ip_pool_start: e.target.value})}
                        disabled={pppoeStatus?.running}
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono disabled:opacity-50 outline-none" 
                        placeholder="192.168.100.10"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Pool End</label>
                      <input 
                        type="text" 
                        value={pppoeServer.ip_pool_end} 
                        onChange={e => setPppoeServer({...pppoeServer, ip_pool_end: e.target.value})}
                        disabled={pppoeStatus?.running}
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono disabled:opacity-50 outline-none" 
                        placeholder="192.168.100.254"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">DNS 1</label>
                      <input 
                        type="text" 
                        value={pppoeServer.dns1} 
                        onChange={e => setPppoeServer({...pppoeServer, dns1: e.target.value})}
                        disabled={pppoeStatus?.running}
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono disabled:opacity-50 outline-none" 
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">DNS 2</label>
                      <input 
                        type="text" 
                        value={pppoeServer.dns2} 
                        onChange={e => setPppoeServer({...pppoeServer, dns2: e.target.value})}
                        disabled={pppoeStatus?.running}
                        className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-mono disabled:opacity-50 outline-none" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Service Name</label>
                    <input 
                      type="text" 
                      value={pppoeServer.service_name} 
                      onChange={e => setPppoeServer({...pppoeServer, service_name: e.target.value})}
                      disabled={pppoeStatus?.running}
                      className="w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-[10px] font-bold disabled:opacity-50 outline-none" 
                      placeholder="Leave empty for default"
                    />
                  </div>

                  <div className="pt-2">
                    {!pppoeStatus?.running && (
                      <button 
                        onClick={startPPPoEServerHandler} 
                        disabled={loading} 
                        className="w-full bg-slate-900 text-white py-2.5 rounded-md font-black text-[9px] uppercase tracking-[0.2em] shadow-lg hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                      >
                        Launch PPPoE Server
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* User Management (Right) */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex-shrink-0">
              <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest mb-3">Add User</h4>
              <div className="space-y-2">
                <input 
                  type="text" 
                  value={newPppoeUser.username} 
                  onChange={e => setNewPppoeUser({...newPppoeUser, username: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[10px] font-bold outline-none focus:bg-white" 
                  placeholder="Username"
                />
                <input 
                  type="password" 
                  value={newPppoeUser.password} 
                  onChange={e => setNewPppoeUser({...newPppoeUser, password: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-[10px] font-mono outline-none focus:bg-white" 
                  placeholder="Password"
                />
                <button 
                  onClick={addPPPoEUserHandler} 
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 rounded font-black text-[9px] uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  Create User
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col flex-grow min-h-[200px]">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h4 className="text-[9px] font-black text-slate-900 uppercase tracking-widest">PPPoE Accounts</h4>
                <span className="text-[8px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">{pppoeUsers.length}</span>
              </div>
              <div className="overflow-y-auto max-h-[250px] divide-y divide-slate-100">
                {pppoeUsers.length > 0 ? pppoeUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-all group">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${user.enabled ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-900 leading-tight">{user.username}</p>
                        <p className="text-[7px] text-slate-400 uppercase font-black tracking-tighter">
                          ID: {user.id} • {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'NO DATE'}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deletePPPoEUserHandler(user.id!, user.username)} 
                      className="text-red-500 hover:text-red-700 p-1 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete User"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )) : (
                  <div className="py-8 text-center">
                    <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest">No accounts</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Sessions */}
        {pppoeStatus?.running && pppoeSessions.length > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-indigo-100 bg-indigo-100/50 flex justify-between items-center">
                <h4 className="text-[9px] font-black text-indigo-900 uppercase tracking-widest">Active Connections</h4>
                <span className="text-[8px] font-bold text-indigo-600 bg-white px-1.5 py-0.5 rounded border border-indigo-200">{pppoeSessions.length} ONLINE</span>
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {pppoeSessions.map((session, idx) => (
                  <div key={idx} className="bg-white p-2 rounded border border-indigo-200/50 flex flex-col gap-1 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-900 truncate">{session.username}</p>
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                      <span>IP: <span className="text-indigo-600 font-mono">{session.ip}</span></span>
                      <span>IF: <span className="text-indigo-600 font-mono">{session.interface}</span></span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-indigo-50">
                      <span className="text-[8px] text-slate-400">RX: <span className="text-slate-900 font-black">{(session.rx_bytes / 1024 / 1024).toFixed(1)} MB</span></span>
                      <span className="text-[8px] text-slate-400">TX: <span className="text-slate-900 font-black">{(session.tx_bytes / 1024 / 1024).toFixed(1)} MB</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default PPPoEServer;