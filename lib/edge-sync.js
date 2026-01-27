/**
 * Edge Sync Module
 * 
 * Handles syncing local Orange Pi data to Supabase cloud.
 * This runs on the edge device and pushes sales/status to cloud database.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getUniqueHardwareId } = require('./hardware');
const db = require('./db');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Status sync interval (60 seconds)
const STATUS_SYNC_INTERVAL = 60000;

// Retry queue for failed syncs
const RETRY_QUEUE_PATH = path.join(__dirname, '../data/sync-queue.json');

class EdgeSync {
  constructor() {
    this.supabase = null;
    this.statusSyncInterval = null;
    this.queue = [];
    
    // Machine Identity
    this.hardwareId = null;
    this.machineId = null;
    this.vendorId = null;
    this.isInitialized = false;

    this.loadQueue();
    
    // Bind methods to preserve 'this' context when destructured
    this.recordSale = this.recordSale.bind(this);
    this.syncSaleToCloud = this.recordSale.bind(this); // Alias for compatibility
    this.getSyncStats = this.getSyncStats.bind(this);
    this.getIdentity = this.getIdentity.bind(this);
    
    this.init();
  }

  /**
   * Initialize Supabase client and Machine Identity
   */
  async init() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[EdgeSync] Supabase credentials not configured. Cloud sync disabled.');
      return;
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[EdgeSync] Connected to Supabase');

    try {
      this.hardwareId = await getUniqueHardwareId();
      console.log(`[EdgeSync] Hardware ID: ${this.hardwareId}`);
      
      await this.registerOrFetchMachine();
      this.isInitialized = true;
      
      // Start sync if not already started
      if (!this.statusSyncInterval) {
        this.startStatusSync();
      }
    } catch (err) {
      console.error('[EdgeSync] Failed to initialize machine identity:', err);
    }
  }

  /**
   * Register machine or fetch existing identity
   */
  async registerOrFetchMachine() {
    if (!this.supabase || !this.hardwareId) return;

    try {
      // Check if machine exists
      const { data, error } = await this.supabase
        .from('machines')
        .select('id, hardware_uuid, total_revenue')
        .eq('hardware_uuid', this.hardwareId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
        throw error;
      }

      if (data) {
        // Machine exists
        this.machineId = data.id;
        // this.vendorId = data.vendor_id; // Removing vendor_id dependency as we are moving to machines table
        console.log(`[EdgeSync] Machine identified: ${this.machineId}`);
      } else {
        // Register new machine (Pending Activation)
        console.log('[EdgeSync] Registering new machine...');
        const { data: newData, error: insertError } = await this.supabase
          .from('machines')
          .insert({
            hardware_uuid: this.hardwareId,
            machine_name: `New Machine (${this.hardwareId.substring(0, 8)})`,
            status: 'online',
            total_revenue: 0
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (newData) {
          this.machineId = newData.id;
          // this.vendorId = newData.vendor_id;
          console.log(`[EdgeSync] New machine registered: ${this.machineId}`);
        }
      }
    } catch (err) {
      console.error('[EdgeSync] Error registering/fetching machine:', err.message);
    }
  }

  /**
   * Start periodic status sync
   */
  startStatusSync() {
    if (!this.supabase) {
      // Retry init if not ready
      if (!this.isInitialized) {
        this.init();
        return;
      }
      console.warn('[EdgeSync] Cannot start status sync - Supabase not initialized');
      return;
    }

    // Send initial online status
    this.syncMachineStatus('online');

    // Start periodic heartbeat
    this.statusSyncInterval = setInterval(() => {
      this.syncMachineStatus('online');
    }, STATUS_SYNC_INTERVAL);

    console.log('[EdgeSync] Status sync started (every 60s)');
  }

  /**
   * Stop status sync
   */
  stopStatusSync() {
    if (this.statusSyncInterval) {
      clearInterval(this.statusSyncInterval);
      this.statusSyncInterval = null;
      console.log('[EdgeSync] Status sync stopped');
    }
  }

  /**
   * Get System Metrics
   */
  async getMetrics() {
    let cpuTemp = 0;
    try {
        // Try reading standard thermal zone
        if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
            const tempStr = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
            cpuTemp = parseInt(tempStr) / 1000;
        }
    } catch (e) { /* ignore */ }

    const uptime = os.uptime();
    
    let activeSessions = 0;
    try {
        const row = await db.get('SELECT count(*) as count FROM sessions WHERE remaining_seconds > 0');
        activeSessions = row?.count || 0;
    } catch (e) { /* ignore */ }

    return { cpuTemp, uptime, activeSessions };
  }

  /**
   * Sync machine status to cloud
   */
  async syncMachineStatus(status) {
    if (!this.supabase || !this.machineId) {
        // If machine ID missing, try to fetch it again (maybe it was just registered)
        if (this.isInitialized && !this.machineId) {
            await this.registerOrFetchMachine();
        }
        if (!this.machineId) return false;
    }

    try {
      const metrics = await this.getMetrics();

      const { error } = await this.supabase
        .from('machines')
        .update({
          status,
          last_seen: new Date().toISOString(),
          cpu_temp: metrics.cpuTemp,
          uptime_seconds: metrics.uptime,
          active_sessions_count: metrics.activeSessions
        })
        .eq('id', this.machineId);

      if (error) throw error;
      
      // Also process queue if we are online
      if (status === 'online') {
        this.processQueue();
      }
      
      return true;
    } catch (err) {
      console.error('[EdgeSync] Error syncing status:', err.message);
      return false;
    }
  }

  /**
   * Record a sale to cloud
   */
  async recordSale(saleData) {
    if (!this.supabase || !this.machineId) {
      // Queue sale if offline or not linked
      this.queueSync('sale', saleData);
      return false;
    }

    try {
      // 1. Record sale in sales table
      const { error } = await this.supabase
        .from('sales')
        .insert({
          // vendor_id: this.vendorId, // Removed dependency
          machine_id: this.machineId,
          amount: saleData.amount,
          transaction_type: saleData.transaction_type || 'coin_insert',
          created_at: new Date().toISOString(),
          metadata: saleData.metadata || {}
        });

      if (error) throw error;

      // 2. Update total_revenue in machines table
      // Fetch current revenue first to ensure accuracy
      const { data: machine, error: fetchError } = await this.supabase
        .from('machines')
        .select('total_revenue')
        .eq('id', this.machineId)
        .single();

      if (!fetchError && machine) {
        const currentRevenue = parseFloat(machine.total_revenue) || 0;
        const newRevenue = currentRevenue + parseFloat(saleData.amount);
        
        await this.supabase
          .from('machines')
          .update({ total_revenue: newRevenue })
          .eq('id', this.machineId);
      }

      return true;
    } catch (err) {
      console.error('[EdgeSync] Error recording sale:', err.message);
      this.queueSync('sale', saleData);
      return false;
    }
  }

  /**
   * Queue sync item for later
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
    console.log(`[EdgeSync] Queued ${type} (Queue size: ${this.queue.length})`);
  }

  /**
   * Process retry queue
   */
  async processQueue() {
    if (this.queue.length === 0) return;

    const itemsToProcess = [...this.queue]; // Copy array
    this.queue = []; // Clear queue temporarily (items will be re-added if they fail)
    
    for (const item of itemsToProcess) {
      let success = false;
      
      try {
        if (item.type === 'sale') {
            success = await this.recordSale(item.data);
        }
      } catch (e) { /* ignore */ }
      
      if (!success) {
        item.retries++;
        if (item.retries < 50) { // Max 50 retries
            this.queue.push(item);
        }
      }
    }
    
    this.saveQueue();
  }

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

  saveQueue() {
    try {
      const dir = path.dirname(RETRY_QUEUE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(RETRY_QUEUE_PATH, JSON.stringify(this.queue));
    } catch (e) {
      console.error('[EdgeSync] Failed to save queue:', e);
    }
  }
  
  getIdentity() {
    return {
        hardwareId: this.hardwareId,
        machineId: this.machineId,
        // vendorId: this.vendorId,
        isInitialized: this.isInitialized
    };
  }

  /**
   * Get Sync Stats for Dashboard
   */
  getSyncStats() {
    return {
      configured: !!(this.supabase && this.machineId),
      machineId: this.machineId || 'Not Registered',
      // vendorId: this.vendorId || 'Pending Activation',
      statusSyncActive: !!this.statusSyncInterval,
      queuedSyncs: this.queue.length
    };
  }
}

// Singleton instance
const edgeSync = new EdgeSync();
module.exports = edgeSync;
