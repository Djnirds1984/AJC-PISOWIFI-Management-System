/**
 * Edge Sync Module
 * 
 * Handles syncing local Orange Pi data to Supabase cloud.
 * This runs on the edge device and pushes sales/status to cloud database.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const MACHINE_ID = process.env.MACHINE_ID || '';
const VENDOR_ID = process.env.VENDOR_ID || '';

// Status sync interval (60 seconds)
const STATUS_SYNC_INTERVAL = 60000;

// Retry queue for failed syncs
const RETRY_QUEUE_PATH = path.join(__dirname, '../data/sync-queue.json');

interface SaleData {
  amount: number;
  transaction_type?: 'coin_insert' | 'voucher' | 'refund';
  session_duration?: number;
  customer_mac?: string;
  metadata?: Record<string, any>;
}

interface QueuedSync {
  id: string;
  type: 'sale' | 'status';
  data: any;
  timestamp: string;
  retries: number;
}

class EdgeSync {
  private supabase: SupabaseClient | null = null;
  private statusSyncInterval: NodeJS.Timeout | null = null;
  private queue: QueuedSync[] = [];

  constructor() {
    this.initSupabase();
    this.loadQueue();
  }

  /**
   * Initialize Supabase client
   */
  private initSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[EdgeSync] Supabase credentials not configured. Cloud sync disabled.');
      return;
    }

    if (!MACHINE_ID || !VENDOR_ID) {
      console.warn('[EdgeSync] MACHINE_ID or VENDOR_ID not set. Cloud sync disabled.');
      return;
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[EdgeSync] Connected to Supabase');
  }

  /**
   * Start periodic status sync
   */
  public startStatusSync() {
    if (!this.supabase) {
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
  public stopStatusSync() {
    if (this.statusSyncInterval) {
      clearInterval(this.statusSyncInterval);
      this.statusSyncInterval = null;
      console.log('[EdgeSync] Status sync stopped');
    }
  }

  /**
   * Sync a sale/transaction to cloud
   */
  public async syncSaleToCloud(sale: SaleData): Promise<boolean> {
    if (!this.supabase) {
      console.warn('[EdgeSync] Supabase not initialized, queueing sale for later');
      this.addToQueue('sale', sale);
      return false;
    }

    try {
      const { error } = await this.supabase
        .from('sales_logs')
        .insert({
          vendor_id: VENDOR_ID,
          machine_id: MACHINE_ID,
          amount: sale.amount,
          transaction_type: sale.transaction_type || 'coin_insert',
          session_duration: sale.session_duration,
          customer_mac: sale.customer_mac,
          metadata: sale.metadata,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('[EdgeSync] Failed to sync sale:', error.message);
        this.addToQueue('sale', sale);
        return false;
      }

      console.log(`[EdgeSync] Sale synced: ₱${sale.amount}`);
      return true;
    } catch (err: any) {
      console.error('[EdgeSync] Error syncing sale:', err.message);
      this.addToQueue('sale', sale);
      return false;
    }
  }

  /**
   * Sync machine status to cloud
   */
  public async syncMachineStatus(status: 'online' | 'offline' | 'maintenance'): Promise<boolean> {
    if (!this.supabase) {
      return false;
    }

    try {
      const { error } = await this.supabase
        .from('vendors')
        .update({
          status,
          last_seen: new Date().toISOString()
        })
        .eq('id', MACHINE_ID);

      if (error) {
        console.error('[EdgeSync] Failed to sync status:', error.message);
        return false;
      }

      console.log(`[EdgeSync] Status synced: ${status}`);
      return true;
    } catch (err: any) {
      console.error('[EdgeSync] Error syncing status:', err.message);
      return false;
    }
  }

  /**
   * Process retry queue
   */
  public async processQueue() {
    if (!this.supabase || this.queue.length === 0) {
      return;
    }

    console.log(`[EdgeSync] Processing ${this.queue.length} queued syncs...`);

    const failedSyncs: QueuedSync[] = [];

    for (const item of this.queue) {
      let success = false;

      if (item.type === 'sale') {
        success = await this.syncSaleToCloud(item.data);
      } else if (item.type === 'status') {
        success = await this.syncMachineStatus(item.data.status);
      }

      if (!success) {
        item.retries++;
        if (item.retries < 5) {
          failedSyncs.push(item);
        } else {
          console.warn(`[EdgeSync] Dropping sync ${item.id} after 5 retries`);
        }
      }
    }

    this.queue = failedSyncs;
    this.saveQueue();
  }

  /**
   * Add item to retry queue
   */
  private addToQueue(type: 'sale' | 'status', data: any) {
    const item: QueuedSync = {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: new Date().toISOString(),
      retries: 0
    };

    this.queue.push(item);
    this.saveQueue();
  }

  /**
   * Load queue from disk
   */
  private loadQueue() {
    try {
      if (fs.existsSync(RETRY_QUEUE_PATH)) {
        const content = fs.readFileSync(RETRY_QUEUE_PATH, 'utf-8');
        this.queue = JSON.parse(content);
        console.log(`[EdgeSync] Loaded ${this.queue.length} queued syncs`);
      }
    } catch (err) {
      console.error('[EdgeSync] Failed to load queue:', err);
      this.queue = [];
    }
  }

  /**
   * Save queue to disk
   */
  private saveQueue() {
    try {
      const dir = path.dirname(RETRY_QUEUE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(RETRY_QUEUE_PATH, JSON.stringify(this.queue, null, 2));
    } catch (err) {
      console.error('[EdgeSync] Failed to save queue:', err);
    }
  }

  /**
   * Get sync statistics
   */
  public getStats() {
    return {
      configured: !!this.supabase,
      machineId: MACHINE_ID,
      vendorId: VENDOR_ID,
      queuedSyncs: this.queue.length,
      statusSyncActive: !!this.statusSyncInterval
    };
  }
}

// Singleton instance
const edgeSync = new EdgeSync();

// Export convenience functions
export const syncSaleToCloud = (sale: SaleData) => edgeSync.syncSaleToCloud(sale);
export const syncMachineStatus = (status: 'online' | 'offline' | 'maintenance') => 
  edgeSync.syncMachineStatus(status);
export const startStatusSync = () => edgeSync.startStatusSync();
export const stopStatusSync = () => edgeSync.stopStatusSync();
export const processQueue = () => edgeSync.processQueue();
export const getSyncStats = () => edgeSync.getStats();

// Auto-start status sync
edgeSync.startStatusSync();

// Process queue every 5 minutes
setInterval(() => edgeSync.processQueue(), 5 * 60 * 1000);

export default edgeSync;
