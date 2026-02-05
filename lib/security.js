/**
 * Security Module for PisoWiFi System
 * Provides enhanced security measures including device fingerprinting,
 * session hijacking detection, and suspicious activity monitoring.
 */

const crypto = require('crypto');

// Device fingerprinting utility
class DeviceFingerprint {
  constructor() {
    this.suspiciousPatterns = new Map(); // Track suspicious activity patterns
    this.deviceHistory = new Map(); // Track device behavior history
  }

  // Generate comprehensive device fingerprint
  generateFingerprint(req, deviceUUID) {
    const fingerprint = {
      deviceUUID: deviceUUID,
      userAgent: req.headers['user-agent'] || 'unknown',
      acceptLanguage: req.headers['accept-language'] || 'unknown',
      ipAddress: req.ip.replace('::ffff:', ''),
      timestamp: Date.now(),
      // Browser characteristics
      screenWidth: req.headers['x-screen-width'] || 'unknown',
      screenHeight: req.headers['x-screen-height'] || 'unknown',
      timezone: req.headers['x-timezone'] || Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: req.headers['x-platform'] || 'unknown',
      // Network characteristics
      connectionType: req.headers['x-connection-type'] || 'unknown',
      // Behavioral metrics
      requestFrequency: this.calculateRequestFrequency(deviceUUID),
      locationConsistency: this.checkLocationConsistency(deviceUUID, req.ip)
    };

    return fingerprint;
  }

  // Calculate request frequency for anomaly detection
  calculateRequestFrequency(deviceUUID) {
    if (!this.deviceHistory.has(deviceUUID)) {
      this.deviceHistory.set(deviceUUID, {
        requests: [],
        lastReset: Date.now()
      });
    }

    const history = this.deviceHistory.get(deviceUUID);
    const now = Date.now();
    
    // Clean old requests (older than 1 hour)
    history.requests = history.requests.filter(time => now - time < 3600000);
    
    // Add current request
    history.requests.push(now);
    
    // Reset counter every 24 hours
    if (now - history.lastReset > 86400000) {
      history.requests = [now];
      history.lastReset = now;
    }
    
    return history.requests.length;
  }

  // Check location consistency for suspicious activity detection
  checkLocationConsistency(deviceUUID, currentIP) {
    if (!this.deviceHistory.has(deviceUUID)) {
      return { consistent: true, previousIPs: [] };
    }

    const history = this.deviceHistory.get(deviceUUID);
    if (!history.ips) {
      history.ips = new Set();
    }

    const previousIPs = Array.from(history.ips);
    history.ips.add(currentIP);

    // If this is a new IP, check if it's suspicious
    if (!previousIPs.includes(currentIP)) {
      const isSuspicious = this.isSuspiciousIPChange(previousIPs, currentIP);
      return {
        consistent: !isSuspicious,
        previousIPs: previousIPs,
        isNewIP: true
      };
    }

    return {
      consistent: true,
      previousIPs: previousIPs,
      isNewIP: false
    };
  }

  // Detect suspicious IP changes
  isSuspiciousIPChange(previousIPs, newIP) {
    // Simple heuristic: if we have multiple IPs in short time, it might be suspicious
    if (previousIPs.length > 3) {
      console.log(`[SECURITY] High IP diversity detected for device: ${previousIPs.length} different IPs`);
      return true;
    }

    // Check if IPs are from different geographical regions (simplified)
    const ipClassA = ip => ip.split('.')[0];
    const newClassA = ipClassA(newIP);
    const inconsistentClassA = previousIPs.some(ip => ipClassA(ip) !== newClassA);
    
    if (inconsistentClassA && previousIPs.length > 1) {
      console.log(`[SECURITY] Inconsistent IP class detected: ${newIP} vs ${previousIPs.join(', ')}`);
      return true;
    }

    return false;
  }

  // Validate device session consistency
  async validateDeviceSession(db, deviceUUID, mac, ip) {
    try {
      // Get existing session for this device
      const session = await db.get('SELECT mac, ip FROM sessions WHERE device_uuid = ?', [deviceUUID]);
      
      if (!session) {
        return { valid: true, reason: 'new_device' };
      }

      // Check for MAC changes (legitimate for MAC randomization)
      if (session.mac !== mac) {
        console.log(`[SECURITY] MAC change detected: ${session.mac} -> ${mac} for device ${deviceUUID}`);
        // Log MAC change for monitoring but allow it (MAC randomization support)
        await this.logMACChange(deviceUUID, session.mac, mac, session.ip, ip);
        return { valid: true, reason: 'mac_change_allowed' };
      }

      // Check for suspicious IP changes
      const locationCheck = this.checkLocationConsistency(deviceUUID, ip);
      if (!locationCheck.consistent) {
        console.log(`[SECURITY-WARNING] Suspicious location change detected for device ${deviceUUID}`);
        console.log(`[SECURITY-WARNING] Previous IPs: ${locationCheck.previousIPs.join(', ')}`);
        console.log(`[SECURITY-WARNING] New IP: ${ip}`);
        
        // Don't block immediately, but flag for review
        return { 
          valid: true, 
          reason: 'suspicious_location',
          flagged: true,
          details: locationCheck
        };
      }

      return { valid: true, reason: 'consistent_session' };
    } catch (error) {
      console.error(`[SECURITY-ERROR] Failed to validate device session:`, error);
      return { valid: false, reason: 'validation_error', error: error.message };
    }
  }

  // Log MAC changes for monitoring
  async logMACChange(deviceUUID, oldMAC, newMAC, oldIP, newIP) {
    const changeLog = {
      deviceUUID,
      oldMAC,
      newMAC,
      oldIP,
      newIP,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server-side'
    };

    console.log(`[MAC-CHANGE] Device ${deviceUUID}: ${oldMAC} -> ${newMAC}`);
    console.log(`[MAC-CHANGE] IP ${oldIP} -> ${newIP}`);
    
    // In production, you might want to store this in a separate audit log table
    // For now, we'll just log it
  }

  // Detect session hijacking attempts
  detectSessionHijacking(originalSession, requestingDevice) {
    const threats = [];

    // Check if multiple devices are trying to use the same session
    if (this.suspiciousPatterns.has(originalSession.token)) {
      const pattern = this.suspiciousPatterns.get(originalSession.token);
      if (pattern.devices.size > 1) {
        threats.push({
          type: 'multiple_devices',
          severity: 'high',
          message: 'Multiple devices attempting to use same session token'
        });
      }
    }

    // Check for rapid successive requests from different IPs
    if (originalSession.ip !== requestingDevice.ip) {
      const timeDiff = Date.now() - (originalSession.lastAccess || 0);
      if (timeDiff < 1000) { // Less than 1 second
        threats.push({
          type: 'rapid_ip_change',
          severity: 'medium',
          message: 'Rapid IP change detected'
        });
      }
    }

    return threats;
  }

  // Update suspicious patterns tracking
  updateSuspiciousPatterns(token, deviceInfo) {
    if (!this.suspiciousPatterns.has(token)) {
      this.suspiciousPatterns.set(token, {
        devices: new Set(),
        ips: new Set(),
        firstSeen: Date.now()
      });
    }

    const pattern = this.suspiciousPatterns.get(token);
    pattern.devices.add(deviceInfo.deviceUUID || deviceInfo.mac);
    pattern.ips.add(deviceInfo.ip);
  }
}

// Session security utilities
class SessionSecurity {
  constructor() {
    this.activeSessions = new Map(); // Track active sessions
    this.blockedDevices = new Set(); // Track blocked devices
    this.rateLimits = new Map(); // Track request rates
  }

  // Generate secure session token
  generateSecureToken(deviceInfo) {
    const timestamp = Date.now();
    const randomComponent = crypto.randomBytes(32).toString('hex');
    const signature = `${deviceInfo.deviceUUID || deviceInfo.mac}_${deviceInfo.ip}_${timestamp}_${randomComponent}`;
    
    return crypto.createHash('sha256').update(signature).digest('hex');
  }

  // Validate session token integrity
  async validateToken(db, token, deviceUUID, mac, ip) {
    try {
      const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
      
      if (!session) {
        return { valid: false, reason: 'session_not_found' };
      }

      // Check token expiration
      if (session.token_expires_at) {
        const now = new Date();
        const expiresAt = new Date(session.token_expires_at);
        if (now > expiresAt) {
          return { valid: false, reason: 'token_expired' };
        }
      }

      // Validate device authorization
      if (deviceUUID && session.device_uuid) {
        if (session.device_uuid !== deviceUUID) {
          return { valid: false, reason: 'device_mismatch', securityViolation: true };
        }
      } else if (session.mac !== mac || session.ip !== ip) {
        return { valid: false, reason: 'mac_ip_mismatch', securityViolation: true };
      }

      return { valid: true, session };
    } catch (error) {
      console.error(`[SECURITY-ERROR] Token validation failed:`, error);
      return { valid: false, reason: 'validation_error', error: error.message };
    }
  }

  // Apply rate limiting
  checkRateLimit(identifier, maxRequests = 10, windowMs = 60000) {
    const now = Date.now();
    const key = `rate_limit_${identifier}`;
    
    if (!this.rateLimits.has(key)) {
      this.rateLimits.set(key, {
        requests: [],
        blockedUntil: 0
      });
    }

    const limit = this.rateLimits.get(key);
    
    // Check if currently blocked
    if (limit.blockedUntil > now) {
      return {
        allowed: false,
        blocked: true,
        retryAfter: Math.ceil((limit.blockedUntil - now) / 1000)
      };
    }

    // Clean old requests
    limit.requests = limit.requests.filter(time => now - time < windowMs);
    
    // Check rate limit
    if (limit.requests.length >= maxRequests) {
      // Block for 5 minutes
      limit.blockedUntil = now + 300000;
      console.log(`[SECURITY] Rate limit exceeded for ${identifier}, blocking for 5 minutes`);
      
      return {
        allowed: false,
        blocked: true,
        retryAfter: 300
      };
    }

    // Add current request
    limit.requests.push(now);
    return { allowed: true };
  }

  // Block malicious devices
  blockDevice(identifier, reason, durationMs = 3600000) {
    this.blockedDevices.add(identifier);
    setTimeout(() => {
      this.blockedDevices.delete(identifier);
      console.log(`[SECURITY] Unblocking device: ${identifier}`);
    }, durationMs);
    
    console.log(`[SECURITY] Blocked device ${identifier} for reason: ${reason}`);
  }

  // Check if device is blocked
  isDeviceBlocked(identifier) {
    return this.blockedDevices.has(identifier);
  }
}

// Export instances
const deviceFingerprint = new DeviceFingerprint();
const sessionSecurity = new SessionSecurity();

module.exports = {
  DeviceFingerprint: DeviceFingerprint,
  SessionSecurity: SessionSecurity,
  deviceFingerprint,
  sessionSecurity,
  
  // Convenience exports
  generateFingerprint: (req, deviceUUID) => deviceFingerprint.generateFingerprint(req, deviceUUID),
  validateDeviceSession: (db, deviceUUID, mac, ip) => deviceFingerprint.validateDeviceSession(db, deviceUUID, mac, ip),
  generateSecureToken: (deviceInfo) => sessionSecurity.generateSecureToken(deviceInfo),
  validateToken: (db, token, deviceUUID, mac, ip) => sessionSecurity.validateToken(db, token, deviceUUID, mac, ip),
  checkRateLimit: (identifier, maxRequests, windowMs) => sessionSecurity.checkRateLimit(identifier, maxRequests, windowMs),
  blockDevice: (identifier, reason, durationMs) => sessionSecurity.blockDevice(identifier, reason, durationMs),
  isDeviceBlocked: (identifier) => sessionSecurity.isDeviceBlocked(identifier)
};