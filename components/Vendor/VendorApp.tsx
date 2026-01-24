import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import VendorLogin from './VendorLogin';
import VendorDashboard from './VendorDashboard';
import { getCurrentUser, initializeSupabaseVendor } from '../../lib/supabase-vendor';

const VendorApp: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize Supabase client
    initializeSupabaseVendor();
    
    // Check if user is already authenticated
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const { user: currentUser } = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-blue-400 font-bold tracking-widest uppercase text-xs">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {user ? (
        <VendorDashboard />
      ) : (
        <VendorLogin onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  );
};

export default VendorApp;
