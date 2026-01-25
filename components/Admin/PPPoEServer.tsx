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
    <div className="space-y-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* PPPoE Server Management */}
      <section className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-[3rem] p-10 shadow-2xl border-2 border-purple-400/30">
        <div className="mb-8">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-2">PPPoE Server Management</h3>
          <p className="text-xs text-purple-100 font-bold">Accept PPPoE client connections (like an ISP server)</p>
        </div>

        {/* Server Status */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-widest mb-2">Server Status</h4>
              {pppoeStatus?.running ? (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                  <span className="text-sm font-black text-white">Running on {pppoeStatus.config?.interface}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                  <span className="text-sm font-black text-white/60">Inactive</span>
                </div>
              )}
            </div>
            {pppoeStatus?.running && (
              <button onClick={stopPPPoEServerHandler} disabled={loading} className="bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl text-[9px] font-black uppercase shadow-lg transition-all active:scale-95 disabled:opacity-50">
                Stop Server
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Server Configuration */}
          <div className="bg-white rounded-[2rem] p-6 shadow-xl">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Server Configuration</h4>
            
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Listen on Interface</label>
                <select 
                  value={pppoeServer.interface}
                  onChange={e => setPppoeServer({...pppoeServer, interface: e.target.value})}
                  disabled={pppoeStatus?.running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold disabled:opacity-50"
                >
                  <option value="">Select Interface...</option>
                  {interfaces.filter(i => i.type === 'ethernet' || i.type === 'vlan').map(i => (
                    <option key={i.name} value={i.name}>{i.name} ({i.type})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Server IP (Local)</label>
                <input 
                  type="text" 
                  value={pppoeServer.local_ip} 
                  onChange={e => setPppoeServer({...pppoeServer, local_ip: e.target.value})}
                  disabled={pppoeStatus?.running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                  placeholder="192.168.100.1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">IP Pool Start</label>
                  <input 
                    type="text" 
                    value={pppoeServer.ip_pool_start} 
                    onChange={e => setPppoeServer({...pppoeServer, ip_pool_start: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                    placeholder="192.168.100.10"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">IP Pool End</label>
                  <input 
                    type="text" 
                    value={pppoeServer.ip_pool_end} 
                    onChange={e => setPppoeServer({...pppoeServer, ip_pool_end: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                    placeholder="192.168.100.254"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">DNS 1</label>
                  <input 
                    type="text" 
                    value={pppoeServer.dns1} 
                    onChange={e => setPppoeServer({...pppoeServer, dns1: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">DNS 2</label>
                  <input 
                    type="text" 
                    value={pppoeServer.dns2} 
                    onChange={e => setPppoeServer({...pppoeServer, dns2: e.target.value})}
                    disabled={pppoeStatus?.running}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50" 
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Service Name (Optional)</label>
                <input 
                  type="text" 
                  value={pppoeServer.service_name} 
                  onChange={e => setPppoeServer({...pppoeServer, service_name: e.target.value})}
                  disabled={pppoeStatus?.running}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold disabled:opacity-50" 
                  placeholder="Leave empty for default"
                />
              </div>

              {!pppoeStatus?.running && (
                <button 
                  onClick={startPPPoEServerHandler} 
                  disabled={loading} 
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:from-purple-700 hover:to-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  Start PPPoE Server
                </button>
              )}
            </div>
          </div>

          {/* User Management */}
          <div className="space-y-6">
            {/* Add User Form */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6">Add PPPoE User</h4>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Username</label>
                  <input 
                    type="text" 
                    value={newPppoeUser.username} 
                    onChange={e => setNewPppoeUser({...newPppoeUser, username: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold" 
                    placeholder="client1"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Password</label>
                  <input 
                    type="password" 
                    value={newPppoeUser.password} 
                    onChange={e => setNewPppoeUser({...newPppoeUser, password: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono" 
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  onClick={addPPPoEUserHandler} 
                  disabled={loading}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                >
                  Add User
                </button>
              </div>
            </div>

            {/* User List */}
            <div className="bg-white rounded-[2rem] p-6 shadow-xl max-h-[400px] overflow-y-auto">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 sticky top-0 bg-white pb-2">PPPoE Users ({pppoeUsers.length})</h4>
              <div className="space-y-2">
                {pppoeUsers.length > 0 ? pppoeUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-purple-300 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${user.enabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{user.username}</p>
                        <p className="text-[8px] text-slate-400 font-mono uppercase">Created: {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => deletePPPoEUserHandler(user.id!, user.username)} 
                      className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[8px] font-black uppercase opacity-0 group-hover:opacity-100 transition-all hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                )) : (
                  <p className="text-[9px] text-slate-400 italic text-center py-4">No users configured</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Active Sessions */}
        {pppoeStatus?.running && pppoeSessions.length > 0 && (
          <div className="mt-6 bg-white rounded-[2rem] p-6 shadow-xl">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4">Active PPPoE Sessions ({pppoeSessions.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pppoeSessions.map((session, idx) => (
                <div key={idx} className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <p className="text-xs font-black text-slate-900">{session.username}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-600 font-mono">IP: {session.ip}</p>
                    <p className="text-[9px] text-slate-600 font-mono">Interface: {session.interface}</p>
                    <p className="text-[9px] text-slate-600">RX: {(session.rx_bytes / 1024 / 1024).toFixed(2)} MB</p>
                    <p className="text-[9px] text-slate-600">TX: {(session.tx_bytes / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default PPPoEServer;