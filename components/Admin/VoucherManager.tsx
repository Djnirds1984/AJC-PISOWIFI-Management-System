import React, { useState, useEffect } from 'react';

interface Voucher {
  id: number;
  code: string;
  amount: number;
  time_minutes: number;
  created_at: string;
  used_at: string | null;
  used_by_mac: string | null;
  used_by_ip: string | null;
  is_used: number;
  created_by: string;
}

const VoucherManager: React.FC = () => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  
  // Form states
  const [amount, setAmount] = useState<number>(10);
  const [timeMinutes, setTimeMinutes] = useState<number>(60);
  const [count, setCount] = useState<number>(1);
  
  const fetchVouchers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/vouchers', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch vouchers');
      }
      
      const data = await response.json();
      setVouchers(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching vouchers');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchVouchers();
  }, []);
  
  const handleGenerateVouchers = async () => {
    try {
      const response = await fetch('/api/vouchers/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        },
        body: JSON.stringify({
          amount,
          time_minutes: timeMinutes,
          count
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate vouchers');
      }
      
      const data = await response.json();
      
      // Close modal and refresh list
      setShowGenerateModal(false);
      fetchVouchers();
      
      alert(`Successfully generated ${data.vouchers.length} voucher(s)!`);
    } catch (err: any) {
      alert('Error generating vouchers: ' + err.message);
    }
  };
  
  const handleDeleteVoucher = async (id: number) => {
    if (!confirm('Are you sure you want to delete this unused voucher?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/vouchers/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete voucher');
      }
      
      fetchVouchers();
      alert('Voucher deleted successfully!');
    } catch (err: any) {
      alert('Error deleting voucher: ' + err.message);
    }
  };
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not used';
    return new Date(dateString).toLocaleString();
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Voucher Management</h2>
          <p className="text-slate-600 mt-1">Manage internet access vouchers</p>
        </div>
        <button 
          onClick={() => setShowGenerateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
        >
          Generate Vouchers
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center items-center h-32">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Code</th>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Amount</th>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Time (min)</th>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Created By</th>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Used At</th>
                  <th className="text-left py-3 px-4 text-slate-600 font-semibold text-sm uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                      No vouchers found. Generate some to get started.
                    </td>
                  </tr>
                ) : (
                  vouchers.map((voucher) => (
                    <tr key={voucher.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded">
                            {voucher.code}
                          </span>
                          <button 
                            onClick={() => copyToClipboard(voucher.code)}
                            className="text-slate-500 hover:text-slate-700"
                            title="Copy code"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">₱{voucher.amount}</td>
                      <td className="py-3 px-4">{voucher.time_minutes}</td>
                      <td className="py-3 px-4">{voucher.created_by}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${voucher.is_used ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                          {voucher.is_used ? 'Used' : 'Unused'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {formatDate(voucher.used_at)}
                        {voucher.used_by_mac && (
                          <div className="text-xs text-slate-500 mt-1">MAC: {voucher.used_by_mac}</div>
                        )}
                        {voucher.used_by_ip && (
                          <div className="text-xs text-slate-500 mt-1">IP: {voucher.used_by_ip}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {!voucher.is_used && (
                          <button
                            onClick={() => handleDeleteVoucher(voucher.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Generate Voucher Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Generate New Vouchers</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₱)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Time Duration (minutes)</label>
                <input
                  type="number"
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Number of Vouchers</label>
                <input
                  type="number"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="100"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">Max 100 vouchers per batch</p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 py-2.5 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateVouchers}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors"
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoucherManager;