const { createClient } = require('@supabase/supabase-js');

class NodeMCULicenseManager {
  constructor(supabaseUrl, supabaseKey) {
    // Allow configuration via environment variables or constructor
    this.supabaseUrl = supabaseUrl || process.env.SUPABASE_URL || '';
    this.supabaseKey = supabaseKey || process.env.SUPABASE_ANON_KEY || '';

    if (this.supabaseUrl && this.supabaseKey) {
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
      console.log('[NodeMCU License] Supabase client initialized');
    } else {
      this.supabase = null;
      console.warn('[NodeMCU License] Supabase credentials not provided. License verification disabled.');
    }
  }

  /**
   * Check license status for a NodeMCU device
   * @param macAddress MAC address of the NodeMCU device
   * @returns License verification status
   */
  async verifyLicense(macAddress) {
    if (!this.supabase) {
      return { 
        isValid: false, 
        isActivated: false, 
        isExpired: false,
        error: 'License system not configured' 
      };
    }

    try {
      // Call the PostgreSQL function to check license status
      const { data, error } = await this.supabase
        .rpc('check_nodemcu_license_status', {
          device_mac_address: macAddress
        });

      if (error) {
        console.error('[NodeMCU License] Verification error:', error);
        return { 
          isValid: false, 
          isActivated: false, 
          isExpired: false,
          error: error.message 
        };
      }

      if (!data.success) {
        return { 
          isValid: false, 
          isActivated: false, 
          isExpired: false,
          error: data.error,
          canStartTrial: data.can_start_trial || false
        };
      }

      // Parse the response
      const result = {
        isValid: data.has_license && data.is_active && !data.is_expired,
        isActivated: data.has_license,
        isExpired: data.is_expired || false,
        licenseType: data.license_type,
        canStartTrial: data.can_start_trial || false
      };

      if (data.expires_at) {
        result.expiresAt = new Date(data.expires_at);
        result.daysRemaining = data.days_remaining;
      }

      if (data.trial_ended_at) {
        result.trialEndedAt = new Date(data.trial_ended_at);
      }

      return result;

    } catch (error) {
      console.error('[NodeMCU License] Unexpected verification error:', error);
      return { 
        isValid: false, 
        isActivated: false, 
        isExpired: false,
        error: error.message 
      };
    }
  }

  /**
   * Start a 7-day trial for a NodeMCU device
   * @param macAddress MAC address of the NodeMCU device
   * @returns Trial activation result
   */
  async startTrial(macAddress) {
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

    } catch (error) {
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
  async activateLicense(licenseKey, macAddress) {
    if (!this.supabase) {
      return { 
        success: false, 
        message: 'License system not configured' 
      };
    }

    try {
      const { data, error } = await this.supabase
        .rpc('activate_nodemcu_license', {
          license_key_param: licenseKey,
          device_mac_address: macAddress
        });

      if (error) {
        console.error('[NodeMCU License] Activation error:', error);
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
        message: data.message
      };

    } catch (error) {
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
  async getVendorLicenses() {
    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase
        .rpc('get_vendor_nodemcu_licenses');

      if (error) {
        console.error('[NodeMCU License] Get licenses error:', error);
        return [];
      }

      return data || [];

    } catch (error) {
      console.error('[NodeMCU License] Unexpected get licenses error:', error);
      return [];
    }
  }

  /**
   * Revoke a NodeMCU license (unbind from device)
   * @param licenseKey The license key to revoke
   * @returns Revocation result
   */
  async revokeLicense(licenseKey) {
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

    } catch (error) {
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
  async generateLicenses(count = 1, licenseType = 'standard', expirationMonths) {
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

    } catch (error) {
      console.error('[NodeMCU License] Unexpected generation error:', error);
      return [];
    }
  }

  /**
   * Check if the license manager is configured
   * @returns True if configured, false otherwise
   */
  isConfigured() {
    return this.supabase !== null;
  }
}

// Singleton instance
let nodeMCULicenseManager = null;

function initializeNodeMCULicenseManager(supabaseUrl, supabaseKey) {
  if (!nodeMCULicenseManager) {
    nodeMCULicenseManager = new NodeMCULicenseManager(supabaseUrl, supabaseKey);
  }
  return nodeMCULicenseManager;
}

function getNodeMCULicenseManager() {
  if (!nodeMCULicenseManager) {
    nodeMCULicenseManager = new NodeMCULicenseManager();
  }
  return nodeMCULicenseManager;
}

module.exports = {
  NodeMCULicenseManager,
  initializeNodeMCULicenseManager,
  getNodeMCULicenseManager
};