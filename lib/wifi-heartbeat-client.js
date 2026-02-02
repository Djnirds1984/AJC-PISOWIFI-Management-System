/**
 * WiFi Device Heartbeat Client
 * 
 * This script runs on client devices (phones, laptops) to periodically send
 * heartbeat signals to the PisoWiFi machine, maintaining session continuity
 * for cross-machine roaming.
 * 
 * Usage:
 * 1. Include this script in your client portal
 * 2. Call startHeartbeat() after successful login
 * 3. Call stopHeartbeat() on logout or session end
 */

class WifiHeartbeatClient {
  constructor(options = {}) {
    this.macAddress = options.macAddress || this.getMacAddress();
    this.sessionToken = options.sessionToken || localStorage.getItem('ajc_session_token');
    this.machineUrl = options.machineUrl || window.location.origin;
    this.intervalMs = options.intervalMs || 30000; // 30 seconds
    
    this.heartbeatInterval = null;
    this.isRunning = false;
    
    // Bind methods
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
    this.getRemainingTime = this.getRemainingTime.bind(this);
  }

  /**
   * Get device MAC address (simulated - in real implementation,
   * this would come from the machine's ARP table)
   */
  getMacAddress() {
    // In a real implementation, the machine would provide the MAC address
    // This is a placeholder - the actual MAC comes from server-side ARP resolution
    return localStorage.getItem('device_mac') || 'UNKNOWN';
  }

  /**
   * Start sending heartbeats
   */
  startHeartbeat() {
    if (this.isRunning) {
      console.warn('[Heartbeat] Already running');
      return;
    }

    if (!this.sessionToken) {
      console.error('[Heartbeat] No session token available');
      return;
    }

    console.log(`[Heartbeat] Starting for device ${this.macAddress}`);
    
    // Send immediate heartbeat
    this.sendHeartbeat();
    
    // Schedule periodic heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.intervalMs);
    
    this.isRunning = true;
  }

  /**
   * Stop sending heartbeats
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.isRunning = false;
      console.log('[Heartbeat] Stopped');
    }
  }

  /**
   * Send a single heartbeat
   */
  async sendHeartbeat() {
    try {
      // Get current remaining time from session
      const remainingSeconds = this.getRemainingTime();
      
      if (remainingSeconds <= 0) {
        console.log('[Heartbeat] Session expired, stopping heartbeat');
        this.stopHeartbeat();
        return;
      }

      const response = await fetch(`${this.machineUrl}/api/wifi/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mac_address: this.macAddress,
          session_token: this.sessionToken,
          remaining_seconds: remainingSeconds
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log(`[Heartbeat] Sent successfully (${remainingSeconds}s remaining)`);
      } else {
        console.error('[Heartbeat] Failed:', result.error || 'Unknown error');
      }
    } catch (err) {
      console.error('[Heartbeat] Network error:', err.message);
    }
  }

  /**
   * Get remaining session time (placeholder implementation)
   * In a real client portal, this would come from the session countdown
   */
  getRemainingTime() {
    // This should be replaced with actual session time from your portal
    // For example, if you have a countdown timer:
    // return document.getElementById('countdown').dataset.seconds;
    
    const storedTime = localStorage.getItem('session_remaining_seconds');
    return storedTime ? parseInt(storedTime, 10) : 0;
  }

  /**
   * Set remaining time (call this when your portal updates the countdown)
   */
  setRemainingTime(seconds) {
    localStorage.setItem('session_remaining_seconds', seconds.toString());
  }

  /**
   * Check if device has session on another machine
   */
  async checkRemoteSession() {
    try {
      const response = await fetch(`${this.machineUrl}/api/wifi/session/${this.macAddress}`);
      const result = await response.json();
      
      if (response.ok) {
        return {
          hasCloudSession: result.has_cloud_session,
          cloudSession: result.cloud_session,
          hasLocalSession: result.has_local_session,
          canRoam: result.can_roam
        };
      } else {
        throw new Error(result.error || 'Failed to check session');
      }
    } catch (err) {
      console.error('[Heartbeat] Session check failed:', err.message);
      return null;
    }
  }

  /**
   * Sync session to another machine
   */
  async syncSessionToMachine(macAddress, sessionToken, remainingSeconds) {
    try {
      const response = await fetch(`${this.machineUrl}/api/wifi/sync-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mac_address: macAddress,
          session_token: sessionToken,
          remaining_seconds: remainingSeconds
        })
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log('[Heartbeat] Session synced successfully');
        return result.result;
      } else {
        throw new Error(result.error || 'Failed to sync session');
      }
    } catch (err) {
      console.error('[Heartbeat] Session sync failed:', err.message);
      return null;
    }
  }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  // Node.js/CommonJS
  module.exports = WifiHeartbeatClient;
} else if (typeof window !== 'undefined') {
  // Browser
  window.WifiHeartbeatClient = WifiHeartbeatClient;
}

// Example usage:
/*
const heartbeat = new WifiHeartbeatClient({
  macAddress: 'AA:BB:CC:DD:EE:FF',  // Provided by machine
  sessionToken: 'sess_123456789',   // From login
  machineUrl: 'http://10.0.0.1:8080',
  intervalMs: 30000  // 30 seconds
});

// Start heartbeat after login
heartbeat.startHeartbeat();

// Update remaining time when countdown changes
heartbeat.setRemainingTime(1800); // 30 minutes

// Stop on logout
// heartbeat.stopHeartbeat();
*/
