import { createClient, SupabaseClient, RealtimeChannel, User } from '@supabase/supabase-js';
import { VendorMachine, SalesLog, VendorDashboardSummary, VendorProfile } from '../types';

// Supabase client for vendor operations
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client for vendor dashboard
 */
export function initializeSupabaseVendor(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

  return supabaseClient;
}

/**
 * Get Supabase client instance
 */
export function getSupabaseVendor(): SupabaseClient {
  if (!supabaseClient) {
    return initializeSupabaseVendor();
  }
  return supabaseClient;
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/vendor/dashboard`,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  });

  return { error };
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<{ error: Error | null }> {
  const supabase = getSupabaseVendor();
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<{ user: User | null; error: Error | null }> {
  const supabase = getSupabaseVendor();
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

/**
 * Get current session
 */
export async function getSession() {
  const supabase = getSupabaseVendor();
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  const supabase = getSupabaseVendor();
  
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });

  return subscription;
}

// ============================================
// VENDOR MACHINES
// ============================================

/**
 * Fetch all machines for current vendor
 */
export async function fetchVendorMachines(): Promise<{ machines: VendorMachine[]; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .order('created_at', { ascending: false });

  return { machines: data || [], error };
}

/**
 * Fetch single machine by ID
 */
export async function fetchMachineById(machineId: string): Promise<{ machine: VendorMachine | null; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('id', machineId)
    .single();

  return { machine: data, error };
}

/**
 * Add a new machine
 */
export async function addVendorMachine(machine: Partial<VendorMachine>): Promise<{ machine: VendorMachine | null; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return { machine: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      ...machine,
      vendor_id: user.user.id
    })
    .select()
    .single();

  return { machine: data, error };
}

/**
 * Update machine details
 */
export async function updateVendorMachine(
  machineId: string, 
  updates: Partial<VendorMachine>
): Promise<{ machine: VendorMachine | null; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data, error } = await supabase
    .from('vendors')
    .update(updates)
    .eq('id', machineId)
    .select()
    .single();

  return { machine: data, error };
}

/**
 * Delete a machine
 */
export async function deleteVendorMachine(machineId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { error } = await supabase
    .from('vendors')
    .delete()
    .eq('id', machineId);

  return { error };
}

/**
 * Update machine status (online/offline/maintenance)
 */
export async function updateMachineStatus(
  machineId: string, 
  status: 'online' | 'offline' | 'maintenance'
): Promise<{ error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { error } = await supabase
    .from('vendors')
    .update({ 
      status, 
      last_seen: new Date().toISOString() 
    })
    .eq('id', machineId);

  return { error };
}

// ============================================
// SALES LOGS
// ============================================

/**
 * Fetch sales logs for current vendor
 */
export async function fetchSalesLogs(
  filters?: {
    machineId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<{ logs: SalesLog[]; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  let query = supabase
    .from('sales_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.machineId) {
    query = query.eq('machine_id', filters.machineId);
  }

  if (filters?.startDate) {
    query = query.gte('created_at', filters.startDate.toISOString());
  }

  if (filters?.endDate) {
    query = query.lte('created_at', filters.endDate.toISOString());
  }

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  return { logs: data || [], error };
}

/**
 * Add a new sales log entry
 */
export async function addSalesLog(log: Partial<SalesLog>): Promise<{ log: SalesLog | null; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return { log: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await supabase
    .from('sales_logs')
    .insert({
      ...log,
      vendor_id: user.user.id
    })
    .select()
    .single();

  return { log: data, error };
}

// ============================================
// DASHBOARD SUMMARY
// ============================================

/**
 * Fetch dashboard summary for current vendor
 */
export async function fetchDashboardSummary(): Promise<{ summary: VendorDashboardSummary | null; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data, error } = await supabase
    .from('vendor_dashboard_summary')
    .select('*')
    .single();

  return { summary: data, error };
}

/**
 * Fetch revenue by time period
 */
export async function fetchRevenueByPeriod(period: '24h' | '7d' | '30d' | 'all'): Promise<{ revenue: number; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  let query = supabase
    .from('sales_logs')
    .select('amount');

  // Add time filter
  const now = new Date();
  if (period === '24h') {
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    query = query.gte('created_at', oneDayAgo.toISOString());
  } else if (period === '7d') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    query = query.gte('created_at', sevenDaysAgo.toISOString());
  } else if (period === '30d') {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    query = query.gte('created_at', thirtyDaysAgo.toISOString());
  }

  const { data, error } = await query;

  const revenue = data?.reduce((sum, log) => sum + log.amount, 0) || 0;

  return { revenue, error };
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to real-time updates for vendor machines
 */
export function subscribeToVendorMachines(
  callback: (payload: any) => void
): RealtimeChannel {
  const supabase = getSupabaseVendor();
  
  const channel = supabase
    .channel('vendor-machines')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vendors'
      },
      callback
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to real-time updates for sales logs
 */
export function subscribeToSalesLogs(
  callback: (payload: any) => void
): RealtimeChannel {
  const supabase = getSupabaseVendor();
  
  const channel = supabase
    .channel('sales-logs')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'sales_logs'
      },
      callback
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from a realtime channel
 */
export async function unsubscribeChannel(channel: RealtimeChannel): Promise<void> {
  await channel.unsubscribe();
}

// ============================================
// HARDWARE VERIFICATION
// ============================================

/**
 * Verify machine has valid license
 */
export async function verifyMachineLicense(hardwareId: string): Promise<{ isValid: boolean; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data, error } = await supabase
    .from('vendors')
    .select('is_licensed, license_key')
    .eq('hardware_id', hardwareId)
    .single();

  if (error) {
    return { isValid: false, error };
  }

  return { 
    isValid: data?.is_licensed === true && data?.license_key !== null, 
    error: null 
  };
}

/**
 * Fetch only licensed machines
 */
export async function fetchLicensedMachines(): Promise<{ machines: VendorMachine[]; error: Error | null }> {
  const supabase = getSupabaseVendor();
  
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('is_licensed', true)
    .order('created_at', { ascending: false });

  return { machines: data || [], error };
}
