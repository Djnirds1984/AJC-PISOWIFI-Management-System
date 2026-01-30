const { createClient } = require('@supabase/supabase-js');
const db = require('./db');

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
   * Check license status for a NodeMCU device (with local trial fallback)
   * @param macAddress MAC address of the NodeMCU device
   * @returns License verification status
   */
  async verifyLicense(macAddress) {
    // 1. Try Supabase first if configured
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .rpc('check_nodemcu_license_status', {
            device_mac_address: macAddress
          });

        if (!error && data && data.success && data.has_license) {
          const result = {
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
        }
      } catch (error) {
        console.error('[NodeMCU License] Supabase verification error:', error);
      }
    }

    // 2. Fallback to Local Trial logic if no license found on Supabase
    try {
      const devicesResult = await db.get('SELECT value FROM config WHERE key = ?', ['nodemcuDevices']);
      const devices = devicesResult?.value ? JSON.parse(devicesResult.value) : [];
      const deviceIndex = devices.findIndex(d => d.macAddress.toUpperCase() === macAddress.toUpperCase());

      if (deviceIndex === -1) {
        return { isValid: false, isActivated: false, isExpired: false, error: 'Device not registered' };
      }

      const device = devices[deviceIndex];
      
      // If device already has a local license/trial info
      if (device.localTrial) {
        const expiresAt = new Date(device.localTrial.expiresAt);
        const now = new Date();
        const isExpired = now > expiresAt;
        const daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));

        return {
          isValid: !isExpired,
          isActivated: false,
          isExpired: isExpired,
          licenseType: 'trial',
          expiresAt: expiresAt,
          daysRemaining: daysRemaining,
          isLocalTrial: true
        };
      }

      // Auto-start local trial if never started
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const updatedDevices = [...devices];
      updatedDevices[deviceIndex].localTrial = {
        startedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      };

      await db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['nodemcuDevices', JSON.stringify(updatedDevices)]);
      console.log(`[NodeMCU License] Local 7-day trial auto-started for ${macAddress}`);

      return {
        isValid: true,
        isActivated: false,
        isExpired: false,
        licenseType: 'trial',
        expiresAt: expiresAt,
        daysRemaining: 7,
        isLocalTrial: true
      };

    } catch (err) {
      console.error('[NodeMCU License] Local trial error:', err);
      return { isValid: false, isActivated: false, isExpired: false, error: 'Local trial system error' };
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