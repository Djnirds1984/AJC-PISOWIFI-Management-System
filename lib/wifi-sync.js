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
   * Sync all WiFi devices to cloud (Cloud-Aware version)
   */
  async syncAllDevices() {
    if (!this.supabase || !this.machineId || !this.vendorId) {
      console.log(`[WifiSync] Cannot sync - missing credentials (supabase: ${!!this.supabase}, machine: ${this.machineId}, vendor: ${this.vendorId})`);
      return;
    }

    try {
      console.log('[WifiSync] Starting CLOUD-AWARE device sync cycle...');
      
      // STEP 1: Get locally detected MAC addresses via ip neigh
      const localMacs = await this.getLocalMacAddresses();
      console.log(`[WifiSync] Found ${localMacs.length} locally detected MAC addresses`);
      
      // STEP 2: Check cloud for active sessions matching these MACs
      const cloudSessionsForLocalMacs = await this.getCloudSessionsForMacs(localMacs);
      console.log(`[WifiSync] Found ${cloudSessionsForLocalMacs.length} cloud sessions for local MACs`);
      
      // STEP 3: Create/update local device records for cloud sessions
      await this.syncCloudSessionsToLocalDevices(cloudSessionsForLocalMacs);
      
      // STEP 4: Get all active WiFi devices from local database (including newly created ones)
      const localDevices = await db.all(`
        SELECT 
          id, mac, ip, hostname, interface, ssid, signal,
          connected_at, last_seen, is_active,
          download_limit, upload_limit, custom_name
        FROM wifi_devices 
        WHERE is_active = 1
        ORDER BY last_seen DESC
      `);
      
      console.log(`[WifiSync] Processing ${localDevices.length} total active devices (local + cloud-synced)`);

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
          session_token: session ? (session.session_token || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`) : null,
          session_start_time: session ? (session.connected_at ? new Date(session.connected_at).toISOString() : new Date().toISOString()) : null,
          session_duration_seconds: session ? (session.connected_at ? Math.floor((Date.now() - new Date(session.connected_at).getTime()) / 1000) : 0) : 0,
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
        
        // Debug logging
        console.log(`[WifiSync] Preparing sync data for ${device.mac}:`, {
          hasSession: !!session,
          sessionToken: cloudDeviceData.session_token,
          remainingSeconds: cloudDeviceData.remaining_seconds,
          isConnected: cloudDeviceData.is_connected
        });

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
        // Generate session token if device has active session but no token
        if (deviceData.session_token && !deviceData.session_token.startsWith('sess_')) {
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
   * Get locally detected MAC addresses via ip neigh
   */
  async getLocalMacAddresses() {
    try {
      // Execute ip neigh show to get all neighbors
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);
      
      const { stdout } = await execPromise('ip neigh show');
      
      // Parse MAC addresses from ip neigh output
      const macs = [];
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        // Output format: 192.168.1.100 dev wlan0 lladdr aa:bb:cc:dd:ee:ff REACHABLE
        const match = line.match(/lladdr\s+([a-fA-F0-9:]+)/);
        if (match && match[1]) {
          macs.push(match[1].toUpperCase());
        }
      }
      
      console.log(`[WifiSync] Local MAC addresses detected:`, macs);
      return macs;
    } catch (err) {
      console.log(`[WifiSync] Failed to get local MAC addresses:`, err.message);
      return [];
    }
  }
  
  /**
   * Get cloud sessions for given MAC addresses (removes machine_id filter)
   */
  async getCloudSessionsForMacs(macs) {
    if (!this.supabase || macs.length === 0) return [];
    
    try {
      console.log(`[WifiSync] Querying cloud for sessions matching ${macs.length} MACs`);
      
      // Convert MACs to lowercase for case-insensitive matching
      const lowercaseMacs = macs.map(mac => mac.toLowerCase());
      
      // Query wifi_devices table for ANY active sessions matching these MACs
      // REMOVED machine_id filter to see sessions from ALL machines
      // Using OR condition with ilike for case-insensitive MAC matching
      let orCondition = '';
      lowercaseMacs.forEach((mac, index) => {
        orCondition += `mac_address.ilike."${mac}"`;
        if (index < lowercaseMacs.length - 1) {
          orCondition += ',';
        }
      });
      
      const { data, error } = await this.supabase
        .from('wifi_devices')
        .select('*')
        .or(orCondition)
        .eq('is_connected', true)
        .gt('remaining_seconds', 0);
      
      if (error) {
        console.error(`[WifiSync] Cloud session query failed:`, error);
        return [];
      }
      
      console.log(`[WifiSync] Cloud returned ${data?.length || 0} sessions`);
      
      // Filter results to ensure case-insensitive match
      const filteredData = data?.filter(session => 
        lowercaseMacs.includes(session.mac_address.toLowerCase())
      ) || [];
      
      console.log(`[WifiSync] After case filtering: ${filteredData.length} sessions`);
      return filteredData;
    } catch (err) {
      console.error(`[WifiSync] Cloud session lookup failed:`, err.message);
      return [];
    }
  }
  
  /**
   * Sync cloud sessions to local device records
   */
  async syncCloudSessionsToLocalDevices(cloudSessions) {
    if (cloudSessions.length === 0) return;
    
    try {
      console.log(`[WifiSync] Syncing ${cloudSessions.length} cloud sessions to local devices`);
      
      for (const session of cloudSessions) {
        const mac = session.mac_address.toUpperCase();
        const now = Date.now();
        
        // Check if device already exists locally
        const existingDevice = await db.get('SELECT * FROM wifi_devices WHERE mac = ?', [mac]);
        
        if (existingDevice) {
          // Update existing device - mark as active and update timestamps
          await db.run(
            `UPDATE wifi_devices 
             SET is_active = 1, last_seen = ?, ip = ?, hostname = COALESCE(hostname, 'Cloud Device')
             WHERE mac = ?`,
            [now, session.ip_address || 'Unknown', mac]
          );
          console.log(`[WifiSync] Updated local device record for ${mac}`);
        } else {
          // Create new device record from cloud session
          const deviceId = `cloud_${mac}_${now}`;
          await db.run(
            `INSERT INTO wifi_devices 
             (id, mac, ip, hostname, interface, ssid, signal, connected_at, last_seen, is_active, custom_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              deviceId,
              mac,
              session.ip_address || 'Unknown',
              'Cloud Device',
              'unknown',
              'unknown',
              0,
              new Date(session.session_start_time).getTime(),
              now,
              1,
              `Cloud Session - ${session.vendors?.machine_name || 'Remote'} `
            ]
          );
          console.log(`[WifiSync] Created local device record for cloud session ${mac}`);
        }
        
        // Ensure local session exists with cloud data
        const existingSession = await db.get('SELECT * FROM sessions WHERE mac = ?', [mac]);
        if (!existingSession) {
          // Create local session from cloud data
          await db.run(
            `INSERT INTO sessions 
             (mac, ip, remaining_seconds, total_paid, connected_at, token, is_paused)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              mac,
              session.ip_address || 'Unknown',
              session.remaining_seconds,
              session.total_paid || 0,
              new Date(session.session_start_time).getTime(),
              session.session_token,
              0
            ]
          );
          console.log(`[WifiSync] Created local session for cloud session ${mac}`);
          
          // Trigger network allow command
          try {
            const network = require('./network');
            await network.whitelistMAC(mac, session.ip_address || 'Unknown');
            console.log(`[WifiSync] Applied network access for ${mac}`);
          } catch (netErr) {
            console.log(`[WifiSync] Failed to apply network access for ${mac}:`, netErr.message);
          }
        } else {
          // Update local session with cloud remaining time (more accurate)
          await db.run(
            `UPDATE sessions 
             SET remaining_seconds = ?, ip = ?
             WHERE mac = ?`,
            [session.remaining_seconds, session.ip_address || 'Unknown', mac]
          );
          console.log(`[WifiSync] Updated local session time for ${mac} to ${session.remaining_seconds}s`);
        }
      }
    } catch (err) {
      console.error(`[WifiSync] Failed to sync cloud sessions to local:`, err.message);
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
   * Check if device has session on any machine
   * Used for cross-machine roaming
   */
  async checkDeviceSession(macAddress) {
    if (!this.supabase) return null;

    try {
      console.log(`[WifiSync] Checking for active session for MAC: ${macAddress}`);
      
      // Simple query: find ANY active session for this MAC
      const { data, error } = await this.supabase
        .from('wifi_devices')
        .select('*')
        .ilike('mac_address', macAddress.toUpperCase())
        .eq('is_connected', true)
        .maybeSingle();

      if (error) {
        console.error(`[WifiSync] Session query failed:`, error);
        throw error;
      }
      
      if (data) {
        console.log(`[WifiSync] Found active session for ${macAddress} on machine ${data.machine_id}`);
        return data;
      }
      
      console.log(`[WifiSync] No active session found for ${macAddress}`);
      return null;
      
    } catch (err) {
      console.error(`[WifiSync] Session check failed:`, err.message);
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
