import React, { useState, useEffect } from 'react';
import { signInWithGoogle, getCurrentUser, onAuthStateChange } from '../../lib/supabase-vendor';
import { User } from '@supabase/supabase-js';

interface VendorLoginProps {
  onLoginSuccess: (user: User) => void;
}

const VendorLogin: React.FC<VendorLoginProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    checkCurrentUser();

    // Listen for auth state changes
    const subscription = onAuthStateChange((user) => {
      if (user) {
        onLoginSuccess(user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkCurrentUser = async () => {
    try {
      const { user } = await getCurrentUser();
      if (user) {
        onLoginSuccess(user);
      }
    } catch (err) {
      console.error('Error checking current user:', err);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await signInWithGoogle();
      
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // Don't set loading to false here - we're redirecting to Google
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-blue-400 font-bold tracking-widest uppercase text-xs">Checking Authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-600/50">
            <span className="text-4xl font-black text-white">V</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2 tracking-tight">Vendor Portal</h1>
          <p className="text-blue-300 text-sm font-bold uppercase tracking-widest">Multi-Tenant Dashboard</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-[3rem] p-10 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tight">Sign In</h2>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
              Manage Your PisoWiFi Fleet
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
              <p className="text-xs text-red-700 font-bold text-center">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white border-2 border-slate-200 hover:border-blue-600 text-slate-900 py-4 px-6 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"></div>
                <span className="uppercase tracking-wider">Signing in...</span>
              </>
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="uppercase tracking-wider group-hover:text-blue-600 transition-colors">
                  Continue with Google
                </span>
              </>
            )}
          </button>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-[10px] text-slate-500 text-center font-bold uppercase leading-relaxed">
              Sign in with your Google account to access your vendor dashboard and manage your PisoWiFi machines in real-time.
            </p>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center">
          <p className="text-xs text-blue-300 font-bold uppercase tracking-widest mb-2">
            Powered by AJC PisoWiFi
          </p>
          <p className="text-[9px] text-blue-400/60 uppercase tracking-wider">
            Secure • Real-Time • Multi-Tenant
          </p>
        </div>
      </div>
    </div>
  );
};

export default VendorLogin;
