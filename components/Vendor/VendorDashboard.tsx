import React, { useState, useEffect } from 'react';
import { VendorMachine, SalesLog, VendorDashboardSummary } from '../../types';
import {
  fetchVendorMachines,
  fetchSalesLogs,
  fetchDashboardSummary,
  subscribeToVendorMachines,
  subscribeToSalesLogs,
  unsubscribeChannel,
  updateMachineStatus,
  signOut
} from '../../lib/supabase-vendor';
import { RealtimeChannel } from '@supabase/supabase-js';

const VendorDashboard: React.FC = () => {
  const [machines, setMachines] = useState<VendorMachine[]>([]);
  const [recentSales, setRecentSales] = useState<SalesLog[]>([]);
  const [summary, setSummary] = useState<VendorDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d'>('24h');

  // Realtime channels
  const [machinesChannel, setMachinesChannel] = useState<RealtimeChannel | null>(null);
  const [salesChannel, setSalesChannel] = useState<RealtimeChannel | null>(null);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Setup realtime subscriptions
  useEffect(() => {
    // Subscribe to machine updates
    const machinesSub = subscribeToVendorMachines((payload) => {
      console.log('[Realtime] Machine update:', payload);
      
      if (payload.eventType === 'INSERT') {
        setMachines(prev => [payload.new as VendorMachine, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setMachines(prev => prev.map(m => 
          m.id === payload.new.id ? payload.new as VendorMachine : m
        ));
      } else if (payload.eventType === 'DELETE') {
        setMachines(prev => prev.filter(m => m.id !== payload.old.id));
      }
      
      // Reload summary on any change
      loadSummary();
    });

    // Subscribe to sales log updates
    const salesSub = subscribeToSalesLogs((payload) => {
      console.log('[Realtime] Sales update:', payload);
      
      if (payload.eventType === 'INSERT') {
        setRecentSales(prev => [payload.new as SalesLog, ...prev].slice(0, 10));
        
        // Update machine revenue in real-time
        const newSale = payload.new as SalesLog;
        setMachines(prev => prev.map(m => 
          m.id === newSale.machine_id 
            ? { ...m, total_revenue: m.total_revenue + newSale.amount }
            : m
        ));
      }
      
      // Reload summary on any sales change
      loadSummary();
    });

    setMachinesChannel(machinesSub);
    setSalesChannel(salesSub);

    // Cleanup subscriptions
    return () => {
      if (machinesSub) unsubscribeChannel(machinesSub);
      if (salesSub) unsubscribeChannel(salesSub);
    };
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [machinesRes, salesRes, summaryRes] = await Promise.all([
        fetchVendorMachines(),
        fetchSalesLogs({ limit: 10 }),
        fetchDashboardSummary()
      ]);

      if (machinesRes.error) throw machinesRes.error;
      if (salesRes.error) throw salesRes.error;
      if (summaryRes.error) throw summaryRes.error;

      setMachines(machinesRes.machines);
      setRecentSales(salesRes.logs);
      setSummary(summaryRes.summary);
    } catch (err: any) {
      console.error('[Dashboard] Error loading data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const { summary: newSummary, error } = await fetchDashboardSummary();
      if (!error && newSummary) {
        setSummary(newSummary);
      }
    } catch (err) {
      console.error('[Dashboard] Error reloading summary:', err);
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      alert('Failed to sign out: ' + error.message);
    } else {
      window.location.href = '/vendor/login';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-blue-400 font-bold tracking-widest uppercase text-xs">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-2xl border border-red-100 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">⚠️</div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Dashboard Error</h2>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">{error}</p>
          <button onClick={loadDashboardData} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-black shadow-xl">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const onlineMachines = machines.filter(m => m.status === 'online').length;
  const licensedMachines = machines.filter(m => m.is_licensed).length;
  const totalRevenue = summary?.total_revenue || 0;
  const revenue24h = summary?.revenue_24h || 0;
  const revenue7d = summary?.revenue_7d || 0;
  const revenue30d = summary?.revenue_30d || 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-600/20">
              V
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Vendor Dashboard</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Multi-Tenant Management</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="bg-slate-900 text-white px-5 py-3 rounded-full text-[10px] font-black tracking-widest uppercase hover:bg-blue-600 shadow-lg active:scale-95 transition-all"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Summary Stats */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Machines"
            value={machines.length}
            icon="🏪"
            color="blue"
          />
          <StatCard
            label="Online Now"
            value={onlineMachines}
            icon="🟢"
            color="green"
            subtext={`${licensedMachines} Licensed`}
          />
          <StatCard
            label="Total Revenue"
            value={`₱${totalRevenue.toFixed(2)}`}
            icon="💰"
            color="yellow"
          />
          <StatCard
            label="24h Revenue"
            value={`₱${revenue24h.toFixed(2)}`}
            icon="📈"
            color="purple"
          />
        </section>

        {/* Period Revenue Summary */}
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Revenue Overview</h2>
            <div className="flex gap-2">
              <PeriodButton label="24h" active={selectedPeriod === '24h'} onClick={() => setSelectedPeriod('24h')} />
              <PeriodButton label="7d" active={selectedPeriod === '7d'} onClick={() => setSelectedPeriod('7d')} />
              <PeriodButton label="30d" active={selectedPeriod === '30d'} onClick={() => setSelectedPeriod('30d')} />
            </div>
          </div>
          <div className="text-center py-8">
            <p className="text-5xl font-black text-slate-900 mb-2">
              ₱{(selectedPeriod === '24h' ? revenue24h : selectedPeriod === '7d' ? revenue7d : revenue30d).toFixed(2)}
            </p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
              {selectedPeriod === '24h' ? 'Last 24 Hours' : selectedPeriod === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
            </p>
          </div>
        </section>

        {/* Machines List */}
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Your Machines</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Live Status Updates</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[9px] text-green-600 font-black uppercase tracking-widest">Realtime Active</span>
            </div>
          </div>
          <div className="p-8">
            {machines.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">📭</div>
                <p className="text-slate-500 font-bold text-sm">No machines registered yet</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-2">Add your first PisoWiFi device</p>
              </div>
            ) : (
              <div className="space-y-4">
                {machines.map(machine => (
                  <MachineCard key={machine.id} machine={machine} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Recent Sales */}
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Recent Transactions</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Last 10 Sales</p>
          </div>
          <div className="p-8">
            {recentSales.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500 font-bold text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentSales.map(sale => (
                  <SalesRow key={sale.id} sale={sale} machines={machines} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard: React.FC<{ 
  label: string; 
  value: string | number; 
  icon: string; 
  color: 'blue' | 'green' | 'yellow' | 'purple';
  subtext?: string;
}> = ({ label, value, icon, color, subtext }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    purple: 'bg-purple-50 border-purple-200'
  };

  return (
    <div className={`${colorClasses[color]} border rounded-3xl p-6`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{icon}</span>
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-3xl font-black text-slate-900 mb-1">{value}</p>
      {subtext && <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{subtext}</p>}
    </div>
  );
};

// Period Button Component
const PeriodButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
      active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
    }`}
  >
    {label}
  </button>
);

// Machine Card Component
const MachineCard: React.FC<{ machine: VendorMachine }> = ({ machine }) => {
  const statusColors = {
    online: 'bg-green-100 text-green-600',
    offline: 'bg-slate-100 text-slate-500',
    maintenance: 'bg-yellow-100 text-yellow-600'
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-600/20">
            {machine.machine_name.charAt(0)}
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900">{machine.machine_name}</h3>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{machine.location || 'No location'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`${statusColors[machine.status]} px-3 py-1 rounded-lg text-[8px] font-black uppercase`}>
            {machine.status}
          </span>
          {machine.is_licensed && (
            <span className="bg-green-100 text-green-600 px-3 py-1 rounded-lg text-[8px] font-black uppercase">
              Licensed
            </span>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Revenue</p>
          <p className="text-lg font-black text-slate-900">₱{machine.total_revenue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Hardware ID</p>
          <p className="text-[9px] font-mono font-bold text-slate-600">{machine.hardware_id.substring(0, 16)}...</p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1">Last Seen</p>
          <p className="text-[9px] font-bold text-slate-600">{new Date(machine.last_seen).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

// Sales Row Component
const SalesRow: React.FC<{ sale: SalesLog; machines: VendorMachine[] }> = ({ sale, machines }) => {
  const machine = machines.find(m => m.id === sale.machine_id);
  
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-600 font-black">
          ₱
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">₱{sale.amount.toFixed(2)}</p>
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">
            {machine?.machine_name || 'Unknown Machine'}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
          {new Date(sale.created_at).toLocaleTimeString()}
        </p>
        <p className="text-[8px] text-slate-400 font-bold">
          {sale.session_duration ? `${Math.floor(sale.session_duration / 60)}min` : 'N/A'}
        </p>
      </div>
    </div>
  );
};

export default VendorDashboard;
