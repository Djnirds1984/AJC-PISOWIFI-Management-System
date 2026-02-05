import React, { useState } from 'react';

interface LoginProps {
  onLoginSuccess: (token: string) => void;
  onBack: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onBack }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (data.success) {
        onLoginSuccess(data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-slate-900 flex items-center justify-center p-4">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }}></div>
      
      <div className="relative max-w-sm w-full">
        {/* Main Login Card */}
        <div className="bg-white/95 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white text-2xl">🔐</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">Admin Control</h1>
            <p className="text-slate-500 text-sm font-medium">Authorized Access Only</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm font-medium flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
              <span className="text-red-500 text-lg">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter username"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter password"
                required
              />
            </div>
            
            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 rounded-xl font-bold text-sm uppercase tracking-wide hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Verifying...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  Login to Console
                </>
              )}
            </button>
          </form>

          {/* Back Button */}
          <button 
            onClick={onBack}
            className="w-full mt-6 text-slate-500 text-sm font-medium hover:text-slate-700 transition-colors py-2"
          >
            ← Return to Portal
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-white/70 text-xs font-medium">
            AJC PisoWiFi Management System v3.5.0
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
