import React, { useState } from 'react';
import { attachDeviceHeaders, attachDeviceFingerprintHeaders } from '../../lib/device-id';

interface VoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoucherActivated: (sessionData: any) => void;
}

const VoucherModal: React.FC<VoucherModalProps> = ({ isOpen, onClose, onVoucherActivated }) => {
  const [voucherCode, setVoucherCode] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!voucherCode.trim()) {
      setError('Please enter a voucher code');
      return;
    }

    setIsActivating(true);
    setError(null);

    try {
      // Add device UUID and fingerprint to request headers
      const headers = attachDeviceFingerprintHeaders({
        'Content-Type': 'application/json',
      });
      
      const response = await fetch('/api/vouchers/activate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ code: voucherCode.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store session token for MAC sync
        if (data.token) {
          localStorage.setItem('ajc_session_token', data.token);
        }
        
        // Call the success callback
        onVoucherActivated(data);
        
        // Close modal
        onClose();
        
        // Reset form
        setVoucherCode('');
        setError(null);
      } else {
        setError(data.error || 'Failed to activate voucher');
      }
    } catch (err) {
      console.error('Voucher activation error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsActivating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isActivating) {
      handleActivate();
    }
  };

  const handleClose = () => {
    if (!isActivating) {
      setVoucherCode('');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in duration-300">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎫</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter Voucher Code</h2>
          <p className="text-gray-600 text-sm">Enter your voucher code to get internet time</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
              <span className="text-red-500">❌</span>
              <span className="text-sm font-medium">{error}</span>
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Voucher Code
          </label>
          <input
            type="text"
            value={voucherCode}
            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
            onKeyPress={handleKeyPress}
            placeholder="Enter code (e.g., AJC12345)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center font-mono text-lg tracking-wider"
            disabled={isActivating}
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-2 text-center">
            Code format: AJC + 5 characters
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleActivate}
            disabled={isActivating || !voucherCode.trim()}
            className="flex-1 bg-purple-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isActivating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Activating...
              </>
            ) : (
              <>
                <span>🚀</span>
                Activate Voucher
              </>
            )}
          </button>
          
          <button
            onClick={handleClose}
            disabled={isActivating}
            className="flex-1 bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Cancel
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-2">How vouchers work with MAC sync:</p>
            <div className="text-xs text-gray-600 space-y-1">
              <div className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">1</span>
                <span>Enter your voucher code</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">2</span>
                <span>Get internet time for this session</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">3</span>
                <span>MAC sync shares time with same MAC devices</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
                <span className="text-green-600 font-medium">Session-bound voucher prevents conflicts</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoucherModal;