import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface NodeMCULicenseRecord {
  id: string;
  license_key: string;
  vendor_id: string;
  device_id: string | null;
  mac_address: string | null;
  is_active: boolean;
  activated_at: string | null;
  license_type: 'trial' | 'standard' | 'premium';
  expires_at: string | null;
  trial_started_at: string | null;
  trial_duration_days: number;
  created_at: string;
}

interface NodeMCULicenseVerification {
  isValid: boolean;
  isActivated: boolean;
  isExpired: boolean;
  licenseType?: 'trial' | 'standard' | 'premium';
  expiresAt?: Date;
  daysRemaining?: number;
  error?: string;
  canStartTrial?: boolean;
  trialEndedAt?: Date;
  isLocalTrial?: boolean;
}

interface NodeMCULicenseActivationResult {
  success: boolean;
  message: string;
  license?: NodeMCULicenseRecord;
  trialInfo?: {
    expiresAt: Date;
    daysRemaining: number;
  };
}

export class NodeMCULicenseManager {
  private supabase: SupabaseClient | null = null;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    // Allow configuration via environment variables or constructor
    this.supabaseUrl = supabaseUrl || (typeof process !== 'undefined' ? process.env.SUPABASE_URL : '') || '';
    this.supabaseKey = supabaseKey || (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : '') || '';

    if (this.supabaseUrl && this.supabaseKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
      console.log('[NodeMCU License] Supabase client initialized');
    } else {
      // Only warn if running on server side. In browser, we expect to use API fallback.
      if (typeof window === 'undefined') {
        console.warn('[NodeMCU License] Supabase credentials not provided. Will use local fallback for trial mode.');
      }
    }
  }

  /**
   * Check license status for a NodeMCU device (with automatic trial assignment)
   * @param macAddress MAC address of the NodeMCU device
   * @returns License verification status
   */
  async verifyLicense(macAddress: string): Promise<NodeMCULicenseVerification> {
    // 1. Always try Supabase first for license verification
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .rpc('check_nodemcu_license_status', {
            device_mac_address: macAddress
          });

        if (!error && data && data.success) {
          if (data.has_license) {
            const result: NodeMCULicenseVerification = {
              isValid: data.is_active && !data.is_expired,
              isActivated: true,
              isExpired: data.is_expired || false,
              licenseType: data.license_type,
              canStartTrial: false
            };

            if (data.expires_at) {
              result.expiresAt = new Date(data.expires_at);
              result.daysRemaining = data.days_remaining;
            }
            return result;
          } else {
            // Device not found in Supabase - automatically start trial
            console.log(`[NodeMCU License] Device ${macAddress} not found, starting automatic trial...`);
            const trialResult = await this.startTrial(macAddress);
            
            if (trialResult.success && trialResult.trialInfo) {
              return {
                isValid: true,
                isActivated: true,
                isExpired: false,
                licenseType: 'trial',
                expiresAt: trialResult.trialInfo.expiresAt,
                daysRemaining: trialResult.trialInfo.daysRemaining,
                canStartTrial: false
              };
            }
          }
        }
      } catch (error) {
        console.error('[NodeMCU License] Supabase verification error:', error);
        // Continue to local fallback even if Supabase fails
      }
    }

    // 2. Fallback to API if in browser (to check local status managed by server)
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch(`/api/nodemcu/license/status/${macAddress}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
          }
        });
        
        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        console.error('[NodeMCU License] Local status fetch error:', err);
      }
    }

    return { 
      isValid: false, 
      isActivated: false, 
      isExpired: false,
      error: 'License verification failed',
      canStartTrial: true
    };
  }

  /**
   * Start a 7-day trial for a NodeMCU device
   * @param macAddress MAC address of the NodeMCU device
   * @returns Trial activation result
   */
  async startTrial(macAddress: string): Promise<NodeMCULicenseActivationResult> {
    // 1. If in browser, delegate to API to handle both Supabase and Local fallback
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/nodemcu/license/trial', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
          },
          body: JSON.stringify({ macAddress })
        });
        return await response.json();
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to reach server' };
      }
    }

    // 2. If server, try Supabase
    if (!this.supabase) {
      return { 
        success: false, 
        message: 'License system not configured' 
      };
    }

    try {
      const { data, error } = await this.supabase
        .rpc('start_nodemcu_trial', {
          device_mac_address: macAddress
        });

      if (error) {
        console.error('[NodeMCU License] Trial start error:', error);
        return { 
          success: false, 
          message: error.message 
        };
      }

      if (!data.success) {
        return { 
          success: false, 
          message: data.error 
        };
      }

      return {
        success: true,
        message: data.message,
        trialInfo: {
          expiresAt: new Date(data.expires_at),
          daysRemaining: data.days_remaining
        }
      };

    } catch (error: any) {
      console.error('[NodeMCU License] Unexpected trial error:', error);
      return { 
        success: false, 
        message: error.message 
      };
    }
  }

  /**
   * Activate a NodeMCU license key
   * @param licenseKey The license key to activate
   * @param macAddress MAC address of the NodeMCU device
   * @returns Activation result
   */
  async activateLicense(licenseKey: string, macAddress: string, vendorId?: string): Promise<NodeMCULicenseActivationResult> {
    // 1. If in browser, delegate to API
    if (typeof window !== 'undefined') {
      try {
        // Log start
        fetch('/api/debug/log', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ message: `Activating license ${licenseKey} for ${macAddress}`, level: 'INFO', component: 'NodeMCULicenseManager' })
        }).catch(() => {});

        const response = await fetch('/api/nodemcu/license/activate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
          },
          body: JSON.stringify({ licenseKey, macAddress })
        });
        const result = await response.json();
        
        // Log result
        fetch('/api/debug/log', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ message: `Activation result: ${JSON.stringify(result)}`, level: result.success ? 'SUCCESS' : 'ERROR', component: 'NodeMCULicenseManager' })
        }).catch(() => {});
        
        return result;
      } catch (err: any) {
        // Log error
        fetch('/api/debug/log', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ message: `Activation fetch error: ${err.message}`, level: 'ERROR', component: 'NodeMCULicenseManager' })
        }).catch(() => {});

        return { success: false, message: err.message || 'Failed to reach server' };
      }
    }

    if (!this.supabase) {
      return { 
        success: false, 
        message: 'License system not configured' 
      };
    }

    try {
      // 1. Get the license
      const { data: license, error: licenseError } = await this.supabase
        .from('nodemcu_licenses')
        .select('*')
        .eq('license_key', licenseKey)
        .single();

      if (licenseError || !license) {
        return { success: false, message: 'License key not found' };
      }

      if (license.is_active) {
         // Check if it's already active for THIS device
         if (license.mac_address === macAddress) {
             return { success: true, message: 'License already active for this device' };
         }
         return { success: false, message: 'License already activated' };
      }

      // 2. Get the device
      const { data: device, error: deviceError } = await this.supabase
        .from('nodemcu_devices')
        .select('*')
        .eq('mac_address', macAddress)
        .single();

      if (deviceError || !device) {
        return { success: false, message: 'Device not found' };
      }
      
      // Verify ownership (if vendorId provided)
      if (vendorId && license.vendor_id && license.vendor_id !== vendorId) {
          return { success: false, message: 'License does not belong to you' };
      }

      // 3. Check for existing active licenses
      const { data: existingLicenses } = await this.supabase
        .from('nodemcu_licenses')
        .select('*')
        .eq('device_id', device.id)
        .eq('is_active', true);

      if (existingLicenses && existingLicenses.length > 0) {
        const activeStandard = existingLicenses.find((l: any) => l.license_type !== 'trial');
        if (activeStandard) {
           return { success: false, message: `Device already has an active ${activeStandard.license_type} license` };
        }
        
        // If we have active TRIAL licenses, we should deactivate them to allow upgrade
        const trialLicenses = existingLicenses.filter((l: any) => l.license_type === 'trial');
        for (const trial of trialLicenses) {
            await this.supabase
                .from('nodemcu_licenses')
                .update({ is_active: false })
                .eq('id', trial.id);
        }
      }

      // 4. Activate the new license
      const { error: updateError } = await this.supabase
        .from('nodemcu_licenses')
        .update({
          device_id: device.id,
          mac_address: macAddress,
          is_active: true,
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', license.id);

      if (updateError) {
        return { success: false, message: updateError.message };
      }

      return {
        success: true,
        message: 'License activated successfully',
        license: {
          id: license.id,
          license_key: licenseKey,
          vendor_id: license.vendor_id,
          device_id: device.id,
          mac_address: macAddress,
          is_active: true,
          activated_at: new Date().toISOString(),
          license_type: license.license_type,
          expires_at: license.expires_at,
          trial_started_at: license.trial_started_at,
          trial_duration_days: license.trial_duration_days,
          created_at: license.created_at
        }
      };

    } catch (error: any) {
      console.error('[NodeMCU License] Unexpected activation error:', error);
      return { 
        success: false, 
        message: error.message 
      };
    }
  }

  /**
   * Get all NodeMCU licenses for the current vendor
   * @returns Array of license records
   */
  async getVendorLicenses(): Promise<NodeMCULicenseRecord[]> {
    if (!this.supabase) {
      return [];
    }

    try {
      // Use direct table query instead of RPC to avoid schema cache issues
      const { data, error } = await this.supabase
        .from('nodemcu_licenses')
        .select(`
          id,
          license_key,
          mac_address,
          is_active,
          license_type,
          activated_at,
          expires_at,
          device_id,
          vendor_id,
          trial_started_at,
          trial_duration_days,
          created_at,
          nodemcu_devices (
            name,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[NodeMCU License] Get licenses error:', error);
        return [];
      }

      return (data || []).map((license: any) => {
        const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
        const now = new Date();
        const daysRemaining = expiresAt 
          ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : null;

        // Map the result to include device info
        return {
          ...license,
          device_name: license.nodemcu_devices?.name || 'Unnamed Device',
          device_status: license.nodemcu_devices?.status || null,
          days_remaining: daysRemaining
        };
      });

    } catch (error: any) {
      console.error('[NodeMCU License] Unexpected get licenses error:', error);
      return [];
    }
  }

  /**
   * Revoke a NodeMCU license (unbind from device)
   * @param licenseKey The license key to revoke
   * @returns Revocation result
   */
  async revokeLicense(licenseKey: string): Promise<{ success: boolean; message: string }> {
    // 1. If in browser, delegate to API
    if (typeof window !== 'undefined') {
      try {
        const response = await fetch('/api/nodemcu/license/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('ajc_admin_token')}`
          },
          body: JSON.stringify({ licenseKey })
        });
        return await response.json();
      } catch (err: any) {
        return { success: false, message: err.message || 'Failed to reach server' };
      }
    }

    if (!this.supabase) {
      return { 
        success: false, 
        message: 'License system not configured' 
      };
    }

    try {
      const { data, error } = await this.supabase
        .rpc('revoke_nodemcu_license', {
          license_key_param: licenseKey
        });

      if (error) {
        console.error('[NodeMCU License] Revocation error:', error);
        return { 
          success: false, 
          message: error.message 
        };
      }

      return {
        success: data.success,
        message: data.message || data.error
      };

    } catch (error: any) {
      console.error('[NodeMCU License] Unexpected revocation error:', error);
      return { 
        success: false, 
        message: error.message 
      };
    }
  }

  /**
   * Generate new NodeMCU license keys (superadmin only)
   * @param count Number of licenses to generate
   * @param licenseType Type of license (standard, premium)
   * @param expirationMonths Optional expiration in months
   * @returns Generated license keys
   */
  async generateLicenses(
    count: number = 1, 
    licenseType: 'standard' | 'premium' = 'standard',
    expirationMonths?: number
  ): Promise<{ license_key: string; expires_at: string; license_type: string }[]> {
    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .rpc('generate_nodemcu_license_keys', {
          batch_size: count,
          license_type_param: licenseType,
          expiration_months: expirationMonths || null
        });

      if (error) {
        console.error('[NodeMCU License] Generation error:', error);
        return [];
      }

      return data || [];

    } catch (error: any) {
      console.error('[NodeMCU License] Unexpected generation error:', error);
      return [];
    }
  }

  /**
   * Check if the license manager is configured
   * @returns True if configured, false otherwise
   */
  isConfigured(): boolean {
    return this.supabase !== null;
  }
}

// Singleton instance
let nodeMCULicenseManager: NodeMCULicenseManager | null = null;

export function initializeNodeMCULicenseManager(supabaseUrl?: string, supabaseKey?: string): NodeMCULicenseManager {
  if (!nodeMCULicenseManager) {
    nodeMCULicenseManager = new NodeMCULicenseManager(supabaseUrl, supabaseKey);
  }
  return nodeMCULicenseManager;
}

export function getNodeMCULicenseManager(): NodeMCULicenseManager {
  if (!nodeMCULicenseManager) {
    nodeMCULicenseManager = new NodeMCULicenseManager();
  }
  return nodeMCULicenseManager;
}
