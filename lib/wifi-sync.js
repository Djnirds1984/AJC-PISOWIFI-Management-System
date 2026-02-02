/**
 * WiFi Devices Sync Module
 * 
 * Synchronizes local WiFi device data to Supabase cloud for cross-machine session sharing.
 * This enables devices to roam between machines while maintaining their session.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');
const fs = require('fs');
const path = require('path');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Sync interval (30 seconds for frequent updates)
const SYNC_INTERVAL = 30000;

// Retry queue for failed syncs
const RETRY_QUEUE_PATH = path.join(__dirname, '../data/wifi-sync-queue.json');

class WifiSync {
  constructor() {
    this.supabase = null;
    this.syncInterval = null;
    this.queue = [];
    this.isInitialized = false;
    
    // Machine Identity (from EdgeSync)
    this.machineId = null;
    this.vendorId = null;
    
    this.loadQueue();
    
    // Bind methods
    this.syncDeviceToCloud = this.syncDeviceToCloud.bind(this);
    this.getSyncStats = this.getSyncStats.bind(this);
    
    this.init();
  }

  /**
   * Initialize Supabase client and start sync
   */
  async init() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[WifiSync] Supabase credentials not configured. WiFi sync disabled.');
      return;
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[WifiSync] Connected to Supabase for WiFi device sync');
    
    // Wait for machine identity to be available
    this.waitForMachineIdentity();
  }

  /**
   * Wait for machine identity from EdgeSync
   */
  async waitForMachineIdentity() {
    try {
      // Import EdgeSync to get machine identity
      const edgeSync = require('./edge-sync');
      
      const checkIdentity = () => {
        const identity = edgeSync.getIdentity();
        if (identity.machineId && identity.vendorId) {
          this.machineId = identity.machineId;
          this.vendorId = identity.vendorId;
          this.isInitialized = true;
          console.log(`[WifiSync] Machine identity ready: ${this.machineId}`);
          
          // Start sync now that we have identity
          this.startSync();
        } else {
          // Retry in 2 seconds
          setTimeout(checkIdentity, 2000);
        }
      };
      
      checkIdentity();
    } catch (err) {
      console.error('[WifiSync] Failed to get machine identity:', err.message);
      // Retry in 5 seconds
      setTimeout(() => this.waitForMachineIdentity(), 5000);
    }
  }

  /**
   * Start periodic WiFi device sync
   */
  startSync() {
    if (!this.supabase || !this.machineId || !this.vendorId) {
      console.warn('[WifiSync] Cannot start sync - missing required identity');
      return;
    }

    // Initial sync
    this.syncAllDevices();

    // Start periodic sync
    this.syncInterval = setInterval(() => {
      this.syncAllDevices();
    }, SYNC_INTERVAL);

    console.log('[WifiSync] WiFi device sync started (every 30s)');
  }

  /**
   * Stop sync
   */
  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[WifiSync] WiFi device sync stopped');
    }
  }

  /**
   * Sync all WiFi devices to cloud
   */
  async syncAllDevices() {
    if (!this.supabase || !this.machineId || !this.vendorId) {
      console.log(`[WifiSync] Cannot sync - missing credentials (supabase: ${!!this.supabase}, machine: ${this.machineId}, vendor: ${this.vendorId})`);
      return;
    }

    try {
      console.log('[WifiSync] Starting device sync cycle...');
      
      // Get all active WiFi devices from local database
      const localDevices = await db.all(`
        SELECT 
          id, mac, ip, hostname, interface, ssid, signal,
          connected_at, last_seen, is_active,
          download_limit, upload_limit, custom_name
        FROM wifi_devices 
        WHERE is_active = 1
        ORDER BY last_seen DESC
      `);
      
      console.log(`[WifiSync] Found ${localDevices.length} local active devices`);

      // Get active sessions to enrich device data
      const sessions = await db.all(`
        SELECT mac, ip, remaining_seconds, total_paid, token as session_token
        FROM sessions 
        WHERE remaining_seconds > 0
      `);

      const sessionMap = new Map();
      sessions.forEach(session => {
        sessionMap.set(session.mac.toUpperCase(), session);
      });

      // Sync each device
      console.log(`[WifiSync] Processing ${localDevices.length} devices...`);
      
      for (const device of localDevices) {
        const session = sessionMap.get(device.mac.toUpperCase());
        console.log(`[WifiSync] Processing device ${device.mac} (has session: ${!!session})`);
        
        // Prepare data for Supabase (matching exact schema)
        const cloudDeviceData = {
          vendor_id: this.vendorId,
          machine_id: this.machineId,
          mac_address: device.mac,
          device_name: device.hostname || device.custom_name || null,
          device_type: this.getDeviceType(device.hostname || device.custom_name),
          session_token: session ? session.session_token : null,
          session_start_time: session && session.connected_at ? new Date(session.connected_at).toISOString() : null,
          session_duration_seconds: session && session.connected_at ? Math.floor((Date.now() - new Date(session.connected_at).getTime()) / 1000) : 0,
          remaining_seconds: session ? session.remaining_seconds : 0,
          ip_address: device.ip,
          signal_strength: device.signal,
          connected_ssid: device.ssid,
          total_paid: session ? session.total_paid : 0,
          coins_used: session ? Math.floor(session.total_paid / 5) : 0, // Assuming 5 PHP per coin
          is_connected: device.is_active === 1,
          last_heartbeat: new Date().toISOString(),
          last_sync_attempt: new Date().toISOString(),
          sync_status: 'pending',
          allowed_machines: null, // Will be populated by cross-machine logic
          created_at: device.connected_at ? new Date(device.connected_at).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Sync to cloud first to get existingDevice
        const syncResult = await this.syncDeviceToCloud(cloudDeviceData);
        
        // Debug: Log what we received
        if (syncResult) {
          if (syncResult.existingDevice) {
            console.log(`[WifiSync] Device ${device.mac} - Local machine: ${syncResult.existingDevice.machine_id || 'undefined'}`);
          } else if (syncResult.otherMachineDevice) {
            console.log(`[WifiSync] Device ${device.mac} - Remote machine: ${syncResult.otherMachineDevice.machine_id}`);
            console.log(`[WifiSync] Remote session: ${syncResult.otherMachineDevice.remaining_seconds}s remaining`);
          } else {
            console.log(`[WifiSync] Device ${device.mac} - No records found`);
          }
        }
        
        // Log devices from other machines (using the result from sync)
        if (syncResult && syncResult.existingDevice && syncResult.existingDevice.machine_id && syncResult.existingDevice.machine_id !== this.machineId) {
          console.log(`[WifiSync] Monitoring device ${device.mac} from remote machine ${syncResult.existingDevice.machine_id}`);
        }
      }

      // Process any queued items
      this.processQueue();

    } catch (err) {
      console.error('[WifiSync] Error syncing devices:', err.message);
    }
  }

  /**
   * Sync a single device to cloud
   */
  async syncDeviceToCloud(deviceData) {
    if (!this.supabase) {
      console.log('[WifiSync] No Supabase client available for sync');
      return null;
    }

    try {
      console.log(`[WifiSync] Attempting to sync ${deviceData.mac_address} to cloud`);
      // Check if device already exists in cloud (by mac_address + machine_id)
      const { data: existingDevice, error: fetchError } = await this.supabase
        .from('wifi_devices')
        .select('id, session_token, remaining_seconds, updated_at, machine_id, vendor_id')
        .eq('mac_address', deviceData.mac_address)
        .eq('machine_id', this.machineId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
        throw fetchError;
      }

      // ALSO check if device exists on OTHER machines
      let otherMachineDevice = null;
      if (!existingDevice) {
        const { data: otherDevice } = await this.supabase
          .from('wifi_devices')
          .select('id, session_token, remaining_seconds, machine_id, vendor_id, is_connected')
          .eq('mac_address', deviceData.mac_address)
          .neq('machine_id', this.machineId)
          .eq('is_connected', true)
          .order('last_heartbeat', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (otherDevice) {
          console.log(`[WifiSync] Found device ${deviceData.mac_address} on different machine ${otherDevice.machine_id}`);
          console.log(`[WifiSync] Session token: ${otherDevice.session_token}, Remaining: ${otherDevice.remaining_seconds}s`);
          otherMachineDevice = otherDevice;
        }
      }
      
      let result;
      let returnData = { existingDevice, otherMachineDevice }; // Package both for return
      
      if (existingDevice) {
        // Update existing device
        // Preserve session continuity - only update if needed
        const shouldUpdate = !existingDevice.session_token && deviceData.session_token ||
                            deviceData.remaining_seconds > existingDevice.remaining_seconds ||
                            deviceData.is_connected !== existingDevice.is_connected ||
                            (new Date(deviceData.last_heartbeat) > new Date(existingDevice.updated_at));
                            
        if (shouldUpdate) {
          const { data, error } = await this.supabase
            .from('wifi_devices')
            .update({
              ...deviceData,
              sync_status: 'success'
            })
            .eq('id', existingDevice.id)
            .select()
            .single();
            
          if (error) throw error;
          result = data;
          returnData.updated = true;
          
          console.log(`[WifiSync] Updated device ${deviceData.mac_address} in cloud`);
        } else {
          // No update needed, but mark as synced
          result = existingDevice;
          returnData.updated = false;
        }
      } else {
        // Insert new device
        // Generate session token if device has active session
        if (deviceData.session_token) {
          deviceData.session_token = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        console.log(`[WifiSync] Inserting new device data:`, {
          mac: deviceData.mac_address,
          has_session: !!deviceData.session_token,
          remaining_seconds: deviceData.remaining_seconds,
          is_connected: deviceData.is_connected
        });
        
        const { data, error } = await this.supabase
          .from('wifi_devices')
          .insert(deviceData)
          .select()
          .single();
          
        if (error) {
          console.error(`[WifiSync] Insert failed for ${deviceData.mac_address}:`, error.message);
          throw error;
        }
        result = data;
        
        console.log(`[WifiSync] Successfully added device ${deviceData.mac_address} to cloud`);
      }

      return returnData;
    } catch (err) {
      console.error(`[WifiSync] Failed to sync device ${deviceData.mac_address}:`, err.message);
      this.queueSync('device', deviceData);
      return null;
    }
  }

  /**
   * Infer device type from hostname/name
   */
  getDeviceType(name) {
    if (!name) return 'other';
    
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('iphone') || lowerName.includes('android') || 
        lowerName.includes('mobile') || lowerName.includes('phone')) {
      return 'mobile';
    }
    
    if (lowerName.includes('laptop') || lowerName.includes('notebook') || 
        lowerName.includes('thinkpad') || lowerName.includes('macbook')) {
      return 'laptop';
    }
    
    if (lowerName.includes('tablet') || lowerName.includes('ipad')) {
      return 'tablet';
    }
    
    if (lowerName.includes('desktop') || lowerName.includes('pc')) {
      return 'desktop';
    }
    
    return 'other';
  }

  /**
   * Queue sync item for later retry
   */
  queueSync(type, data) {
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      type,
      data,
      timestamp: new Date().toISOString(),
      retries: 0
    };
    
    this.queue.push(item);
    this.saveQueue();
    console.log(`[WifiSync] Queued ${type} (Queue size: ${this.queue.length})`);
  }

  /**
   * Process retry queue
   */
  async processQueue() {
    if (this.queue.length === 0) return;

    const itemsToProcess = [...this.queue];
    this.queue = [];

    for (const item of itemsToProcess) {
      let success = false;
      
      try {
        if (item.type === 'device') {
          success = await this.syncDeviceToCloud(item.data);
        }
      } catch (e) { /* ignore */ }
      
      if (!success) {
        item.retries++;
        if (item.retries < 10) { // Max 10 retries
          this.queue.push(item);
        }
      }
    }
    
    this.saveQueue();
  }

  /**
   * Load retry queue from disk
   */
  loadQueue() {
    try {
      if (fs.existsSync(RETRY_QUEUE_PATH)) {
        const data = fs.readFileSync(RETRY_QUEUE_PATH, 'utf-8');
        this.queue = JSON.parse(data);
      }
    } catch (e) {
      this.queue = [];
    }
  }

  /**
   * Save retry queue to disk
   */
  saveQueue() {
    try {
      const dir = path.dirname(RETRY_QUEUE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(RETRY_QUEUE_PATH, JSON.stringify(this.queue));
    } catch (e) {
      console.error('[WifiSync] Failed to save queue:', e);
    }
  }

  /**
   * Handle device heartbeat from client
   * Called when a device sends a heartbeat to update its session
   */
  async handleDeviceHeartbeat(macAddress, sessionToken, remainingSeconds) {
    if (!this.supabase || !this.machineId) return;

    try {
      const { data, error } = await this.supabase
        .from('wifi_devices')
        .update({
          remaining_seconds: remainingSeconds,
          last_heartbeat: new Date().toISOString(),
          last_sync_attempt: new Date().toISOString(),
          sync_status: 'success'
        })
        .eq('mac_address', macAddress)
        .eq('session_token', sessionToken)
        .eq('machine_id', this.machineId)
        .select()
        .single();

      if (error) throw error;
      
      console.log(`[WifiSync] Heartbeat updated for device ${macAddress}`);
      return data;
    } catch (err) {
      console.error(`[WifiSync] Heartbeat failed for ${macAddress}:`, err.message);
      return null;
    }
  }

  /**
   * Check if device has session on another machine
   * Used for cross-machine roaming
   */
  async checkDeviceSession(macAddress) {
    if (!this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('wifi_devices')
        .select(`
          id,
          session_token,
          remaining_seconds,
          session_start_time,
          session_duration_seconds,
          is_connected,
          last_heartbeat,
          allowed_machines,
          machine_id,
          vendors!inner(machine_name, location)
        `)
        .eq('mac_address', macAddress)
        .eq('is_connected', true)
        .order('last_heartbeat', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      // Log when we find a device session from another machine
      if (data && data.machine_id && data.machine_id !== this.machineId) {
        console.log(`[WifiSync] Found remote session for ${macAddress} on machine ${data.machine_id}`);
        console.log(`[WifiSync] Remaining time: ${data.remaining_seconds}s, Token: ${data.session_token}`);
        console.log(`[WifiSync] Session start: ${data.session_start_time}, Duration: ${data.session_duration_seconds}s`);
        console.log(`[WifiSync] Current machine: ${this.machineId}, Remote machine: ${data.machine_id}`);
      } else if (data && !data.machine_id) {
        console.warn(`[WifiSync] Device ${macAddress} found but missing machine_id`);
      } else if (data) {
        console.log(`[WifiSync] Device ${macAddress} found on current machine ${this.machineId}`);
      } else {
        console.log(`[WifiSync] No session found for device ${macAddress}`);
      }
      
      return data;
    } catch (err) {
      console.error(`[WifiSync] Failed to check session for ${macAddress}:`, err.message);
      return null;
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats() {
    return {
      configured: !!(this.supabase && this.machineId && this.vendorId),
      machineId: this.machineId || 'Not Registered',
      vendorId: this.vendorId || 'Pending Activation',
      syncActive: !!this.syncInterval,
      queuedItems: this.queue.length,
      lastSync: new Date().toISOString()
    };
  }
}

// Singleton instance
const wifiSync = new WifiSync();
module.exports = wifiSync;
