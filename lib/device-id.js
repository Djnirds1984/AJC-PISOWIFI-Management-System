/**
 * Device Identification Utility
 * Generates and manages cryptographically secure device UUIDs
 */

// Generate/get persistent device UUID
export function getOrCreateDeviceUUID() {
  // Try to get existing device UUID from localStorage
  let deviceUUID = localStorage.getItem('device_uuid');
  
  if (!deviceUUID) {
    // Generate new cryptographically secure UUID
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      // Modern browsers with crypto.randomUUID support
      deviceUUID = crypto.randomUUID();
    } else {
      // Fallback for older browsers
      deviceUUID = generateFallbackUUID();
    }
    
    // Store the device UUID persistently
    localStorage.setItem('device_uuid', deviceUUID);
    console.log(`[DEVICE-ID] Generated new device UUID: ${deviceUUID}`);
  }
  
  return deviceUUID;
}

// Fallback UUID generator for older browsers
function generateFallbackUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Send device UUID with all requests
export function attachDeviceHeaders(headers = {}) {
  const deviceUUID = getOrCreateDeviceUUID();
  return {
    ...headers,
    'X-Device-UUID': deviceUUID
  };
}

// Enhanced device fingerprinting
export function getDeviceFingerprint() {
  const deviceUUID = getOrCreateDeviceUUID();
  
  return {
    uuid: deviceUUID,
    userAgent: navigator.userAgent || 'unknown',
    language: navigator.language || 'unknown',
    platform: navigator.platform || 'unknown',
    cookieEnabled: navigator.cookieEnabled,
    screenWidth: window.screen?.width || 0,
    screenHeight: window.screen?.height || 0,
    colorDepth: window.screen?.colorDepth || 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  };
}

// Attach device fingerprint to request headers
export function attachDeviceFingerprintHeaders(headers = {}) {
  const fingerprint = getDeviceFingerprint();
  const deviceUUID = getOrCreateDeviceUUID();
  
  return {
    ...headers,
    'X-Device-UUID': deviceUUID,
    'X-Device-Fingerprint': JSON.stringify(fingerprint)
  };
}

// Validate device UUID format
export function isValidDeviceUUID(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  
  // Standard UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Clear device UUID (for testing/debugging)
export function clearDeviceUUID() {
  localStorage.removeItem('device_uuid');
  console.log('[DEVICE-ID] Cleared device UUID');
}

// Get device UUID without generating (returns null if not exists)
export function getExistingDeviceUUID() {
  return localStorage.getItem('device_uuid') || null;
}

// Migrate legacy device identifiers to new UUID system
export function migrateLegacyDeviceId() {
  // Check for legacy identifiers
  const legacyMac = localStorage.getItem('ajc_client_id');
  const legacyDeviceId = localStorage.getItem('device_id');
  
  if (legacyMac && !getExistingDeviceUUID()) {
    // Generate deterministic UUID based on legacy MAC
    const deterministicUUID = generateDeterministicUUID(legacyMac);
    localStorage.setItem('device_uuid', deterministicUUID);
    console.log(`[DEVICE-ID] Migrated legacy MAC ${legacyMac} to UUID ${deterministicUUID}`);
    return deterministicUUID;
  }
  
  return getOrCreateDeviceUUID();
}

// Generate deterministic UUID from seed (for migration)
function generateDeterministicUUID(seed) {
  // Simple hash-based UUID generation for deterministic results
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to UUID format
  const hex = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-4${hex.substr(12, 3)}-8${hex.substr(15, 3)}-${hex.substr(18, 12)}`;
}

// Export default object for easier imports
export default {
  getOrCreateDeviceUUID,
  attachDeviceHeaders,
  getDeviceFingerprint,
  attachDeviceFingerprintHeaders,
  isValidDeviceUUID,
  clearDeviceUUID,
  getExistingDeviceUUID,
  migrateLegacyDeviceId
};