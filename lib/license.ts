import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getUniqueHardwareId } from './hardware';

interface LicenseRecord {
  id: string;
  license_key: string;
  hardware_id: string | null;
  vendor_id: string | null;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
}

interface LicenseVerification {
  isValid: boolean;
  isActivated: boolean;
  expiresAt?: Date;
  error?: string;
}

export class LicenseManager {
  private supabase: SupabaseClient | null = null;
  private supabaseUrl: string;
  private supabaseKey: string;

  constructor(supabaseUrl?: string, supabaseKey?: string) {
    // Allow configuration via environment variables or constructor
    this.supabaseUrl = supabaseUrl || process.env.SUPABASE_URL || '';
    this.supabaseKey = supabaseKey || process.env.SUPABASE_ANON_KEY || '';

    if (this.supabaseUrl && this.supabaseKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
      console.log('[License] Supabase client initialized');
    } else {
      console.warn('[License] Supabase credentials not provided. License verification disabled.');
    }
  }

  /**
   * Activate a license key by binding it to the current hardware
   * @param licenseKey The license key to activate
   * @returns Success status and message
   */
  async activateDevice(licenseKey: string): Promise<{ success: boolean; message: string; license?: LicenseRecord }> {
    if (!this.supabase) {
      return { 
        success: false, 
        message: 'Licensing system not configured. Please contact administrator.' 
      };
    }

    try {
      // Get hardware ID
      const hardwareId = await getUniqueHardwareId();
      console.log(`[License] Attempting activation with hardware ID: ${hardwareId}`);

      // Check if this hardware is already activated
      const { data: existingHardware, error: hwError } = await this.supabase
        .from('licenses')
        .select('*')
        .eq('hardware_id', hardwareId)
        .maybeSingle();

      if (hwError) {
        console.error('[License] Error checking existing hardware:', hwError);
        return { success: false, message: `Database error: ${hwError.message}` };
      }

      if (existingHardware) {
        if (existingHardware.license_key === licenseKey) {
          return { 
            success: true, 
            message: 'Device already activated with this license key.',
            license: existingHardware 
          };
        } else {
          return { 
            success: false, 
            message: 'This device is already bound to a different license key. Contact support for reassignment.' 
          };
        }
      }

      // Check if the license key exists and is available
      const { data: license, error: licenseError } = await this.supabase
        .from('licenses')
        .select('*')
        .eq('license_key', licenseKey)
        .maybeSingle();

      if (licenseError) {
        console.error('[License] Error fetching license:', licenseError);
        return { success: false, message: `Database error: ${licenseError.message}` };
      }

      if (!license) {
        return { success: false, message: 'Invalid license key. Please check and try again.' };
      }

      if (license.hardware_id !== null) {
        return { 
          success: false, 
          message: 'This license key is already activated on another device. Contact vendor for additional licenses.' 
        };
      }

      // Activate the license by binding hardware_id
      const { data: updatedLicense, error: updateError } = await this.supabase
        .from('licenses')
        .update({ 
          hardware_id: hardwareId, 
          is_active: true,
          activated_at: new Date().toISOString()
        })
        .eq('license_key', licenseKey)
        .select()
        .single();

      if (updateError) {
        console.error('[License] Error activating license:', updateError);
        return { success: false, message: `Activation failed: ${updateError.message}` };
      }

      console.log('[License] Device activated successfully');
      return { 
        success: true, 
        message: 'License activated successfully! Your device is now authorized.',
        license: updatedLicense 
      };

    } catch (error: any) {
      console.error('[License] Activation error:', error);
      return { 
        success: false, 
        message: error.message || 'An unexpected error occurred during activation.' 
      };
    }
  }

  /**
   * Verify if the current device has a valid license
   * @returns License verification status
   */
  async verifyLicense(): Promise<LicenseVerification> {
    if (!this.supabase) {
      console.warn('[License] Supabase not configured, allowing access');
      return { isValid: true, isActivated: false };
    }

    try {
      const hardwareId = await getUniqueHardwareId();
      
      const { data: license, error } = await this.supabase
        .from('licenses')
        .select('*')
        .eq('hardware_id', hardwareId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('[License] Verification error:', error);
        return { 
          isValid: false, 
          isActivated: false, 
          error: error.message 
        };
      }

      if (!license) {
        return { 
          isValid: false, 
          isActivated: false, 
          error: 'No active license found for this device' 
        };
      }

      // License is valid and activated
      return { 
        isValid: true, 
        isActivated: true,
        expiresAt: license.activated_at ? new Date(license.activated_at) : undefined
      };

    } catch (error: any) {
      console.error('[License] Verification error:', error);
      return { 
        isValid: false, 
        isActivated: false, 
        error: error.message 
      };
    }
  }

  /**
   * Get the hardware ID of the current device
   */
  async getDeviceHardwareId(): Promise<string> {
    return await getUniqueHardwareId();
  }

  /**
   * Check if Supabase is configured
   */
  isConfigured(): boolean {
    return this.supabase !== null;
  }
}

// Singleton instance
let licenseManager: LicenseManager | null = null;

export function initializeLicenseManager(supabaseUrl?: string, supabaseKey?: string): LicenseManager {
  if (!licenseManager) {
    licenseManager = new LicenseManager(supabaseUrl, supabaseKey);
  }
  return licenseManager;
}

export function getLicenseManager(): LicenseManager {
  if (!licenseManager) {
    licenseManager = new LicenseManager();
  }
  return licenseManager;
}
