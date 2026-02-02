/**
 * Device Identifier Module
 * 
 * Provides multiple methods for identifying devices across different network conditions
 * and handling MAC address changes during roaming between access points.
 */

const crypto = require('crypto');
const db = require('./db');

class DeviceIdentifier {
  /**
   * Generate a device fingerprint that's more persistent than MAC
   * Combines multiple device characteristics
   */
  static generateDeviceFingerprint(req) {
    const clientIp = req.ip.replace('::ffff:', '');
    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';
    
    // Create fingerprint from stable device characteristics
    const fingerprintData = `${clientIp}|${userAgent}|${acceptLanguage}`;
    const fingerprint = crypto.createHash('sha256').update(fingerprintData).digest('hex');
    
    return fingerprint;
  }

  /**
   * Try to identify device using multiple methods
   * Returns array of possible identifiers in order of confidence
   */
  static async identifyDevice(req, macFromNetwork) {
    const clientIp = req.ip.replace('::ffff:', '');
    const fingerprint = this.generateDeviceFingerprint(req);
    
    const identifiers = [];
    
    // 1. Network-provided MAC (highest confidence when available)
    if (macFromNetwork) {
      identifiers.push({
        type: 'network_mac',
        value: macFromNetwork.toUpperCase(),
        confidence: 100
      });
    }
    
    // 2. Fingerprint-based identification
    identifiers.push({
      type: 'fingerprint',
      value: fingerprint,
      confidence: 80
    });
    
    // 3. Check if IP has recent session activity
    try {
      // Try sessions table first (local SQLite)
      let recentSession = await db.get(
        'SELECT mac, device_fingerprint FROM sessions WHERE ip = ? AND remaining_seconds > 0 ORDER BY connected_at DESC LIMIT 1',
        [clientIp]
      ).catch(() => null);
      
      // If not found, try clients table (Supabase/PostgreSQL)
      if (!recentSession) {
        recentSession = await db.get(
          'SELECT mac_address as mac, device_fingerprint FROM clients WHERE ip_address = ? AND is_active = true ORDER BY connected_at DESC LIMIT 1',
          [clientIp]
        ).catch(() => null);
      }
      
      if (recentSession) {
        if (recentSession.mac) {
          identifiers.push({
            type: 'session_mac',
            value: recentSession.mac.toUpperCase(),
            confidence: 90
          });
        }
        
        if (recentSession.device_fingerprint) {
          identifiers.push({
            type: 'session_fingerprint',
            value: recentSession.device_fingerprint,
            confidence: 85
          });
        }
      }
    } catch (e) {
      console.log('[Device-ID] Session lookup failed:', e.message);
    }
    
    // 4. Check historical fingerprints for this IP
    try {
      // Try sessions table first (local SQLite)
      let historicalFingerprints = await db.all(
        'SELECT DISTINCT device_fingerprint FROM sessions WHERE ip = ? AND device_fingerprint IS NOT NULL ORDER BY connected_at DESC LIMIT 5',
        [clientIp]
      ).catch(() => []);
      
      // If not found, try clients table (Supabase/PostgreSQL)
      if (historicalFingerprints.length === 0) {
        historicalFingerprints = await db.all(
          'SELECT DISTINCT device_fingerprint FROM clients WHERE ip_address = ? AND device_fingerprint IS NOT NULL ORDER BY connected_at DESC LIMIT 5',
          [clientIp]
        ).catch(() => []);
      }
      
      historicalFingerprints.forEach(record => {
        identifiers.push({
          type: 'historical_fingerprint',
          value: record.device_fingerprint,
          confidence: 70
        });
      });
    } catch (e) {
      console.log('[Device-ID] Historical lookup failed:', e.message);
    }
    
    return identifiers;
  }

  /**
   * Find best matching session for a device across multiple identifiers
   */
  static async findMatchingSession(identifiers, token) {
    if (!identifiers || identifiers.length === 0) return null;
    
    // Sort by confidence level (descending)
    const sortedIdentifiers = [...identifiers].sort((a, b) => b.confidence - a.confidence);
    
    for (const identifier of sortedIdentifiers) {
      try {
        let session;
        
        switch (identifier.type) {
          case 'network_mac':
          case 'session_mac':
            // Try sessions table first (local SQLite)
            session = await db.get(
              'SELECT *, "sessions" as source_table FROM sessions WHERE mac = ? AND token = ?',
              [identifier.value, token]
            ).catch(() => null);
            
            // If not found, try clients table (Supabase/PostgreSQL)
            if (!session) {
              session = await db.get(
                'SELECT *, "clients" as source_table FROM clients WHERE mac_address = ? AND session_token = ?',
                [identifier.value, token]
              ).catch(() => null);
            }
            break;
            
          case 'fingerprint':
          case 'session_fingerprint':
          case 'historical_fingerprint':
            // Try sessions table first (local SQLite)
            session = await db.get(
              'SELECT *, "sessions" as source_table FROM sessions WHERE device_fingerprint = ? AND token = ?',
              [identifier.value, token]
            ).catch(() => null);
            
            // If not found, try clients table (Supabase/PostgreSQL)
            if (!session) {
              session = await db.get(
                'SELECT *, "clients" as source_table FROM clients WHERE device_fingerprint = ? AND session_token = ?',
                [identifier.value, token]
              ).catch(() => null);
            }
            break;
        }
        
        if (session) {
          console.log(`[Device-ID] Found session using ${identifier.type}: ${identifier.value}`);
          return {
            session,
            identifierUsed: identifier
          };
        }
      } catch (e) {
        console.log(`[Device-ID] Lookup failed for ${identifier.type}:`, e.message);
      }
    }
    
    return null;
  }

  /**
   * Update session with device identification data
   */
  static async updateSessionIdentification(sessionId, identifiers) {
    if (!identifiers || identifiers.length === 0) return;
    
    // Use the highest confidence fingerprint
    const fingerprintIdentifier = identifiers.find(id => 
      id.type.includes('fingerprint') && id.confidence >= 70
    );
    
    if (fingerprintIdentifier) {
      try {
        await db.run(
          'UPDATE sessions SET device_fingerprint = ? WHERE id = ?',
          [fingerprintIdentifier.value, sessionId]
        );
        console.log(`[Device-ID] Updated session ${sessionId} with fingerprint`);
      } catch (e) {
        console.log(`[Device-ID] Failed to update session fingerprint:`, e.message);
      }
    }
  }
}

module.exports = DeviceIdentifier;