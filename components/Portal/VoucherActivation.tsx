import React, { useState } from 'react';

interface VoucherActivationProps {
  onVoucherActivate: (voucherCode: string) => void;
  loading: boolean;
}

const VoucherActivation: React.FC<VoucherActivationProps> = ({ onVoucherActivate, loading }) => {
  const [voucherCode, setVoucherCode] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (voucherCode.trim()) {
      onVoucherActivate(voucherCode.trim());
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <span>🎟️</span> Use Voucher
      </h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="voucherCode" className="block text-sm font-medium text-gray-700 mb-1">
            Enter Voucher Code
          </label>
          <input
            type="text"
            id="voucherCode"
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
            placeholder="Enter your voucher code"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            disabled={loading}
          />
        </div>
        
        <button
          type="submit"
          disabled={loading || !voucherCode.trim()}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            'Activate Voucher'
          )}
        </button>
      </form>
      
      <div className="mt-4 text-xs text-gray-500">
        <p>Voucher codes are provided by the administrator. Contact them to purchase a voucher.</p>
      </div>
    </div>
  );
};

export default VoucherActivation;