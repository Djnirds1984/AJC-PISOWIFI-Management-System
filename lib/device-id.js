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

// Generate/get unique device identifier for fingerprinting
export function getOrCreateUniqueId() {
  let uniqueId = localStorage.getItem('unique_id');
  
  if (!uniqueId) {
    // Generate random unique ID
    uniqueId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('unique_id', uniqueId);
    console.log(`[DEVICE-ID] Generated new unique ID: ${uniqueId}`);
  }
  
  return uniqueId;
}

// Generate persistent hardware ID that survives roaming/clearing
export function getOrCreateHardwareId() {
  // Try to get existing hardware ID from localStorage
  let hardwareId = localStorage.getItem('hardware_id');
  
  if (!hardwareId) {
    // Generate deterministic hardware ID based on device characteristics
    // This should be consistent even after roaming or localStorage clearing
    const components = [
      navigator.userAgent || '',
      navigator.platform || '',
      navigator.hardwareConcurrency || 'unknown',
      screen.width || 'unknown',
      screen.height || 'unknown',
      screen.colorDepth || 'unknown',
      navigator.maxTouchPoints || '0'
    ];
    
    // Create hash from device characteristics
    const deviceString = components.join('|');
    hardwareId = generateDeterministicHash(deviceString);
    
    // Store it
    localStorage.setItem('hardware_id', hardwareId);
    console.log(`[DEVICE-ID] Generated new hardware ID: ${hardwareId}`);
  }
  
  return hardwareId;
}

// Generate deterministic hash for hardware ID
function generateDeterministicHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to readable format
  return `HW-${Math.abs(hash).toString(16).padStart(8, '0').toUpperCase()}`;
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
  const hardwareId = getOrCreateHardwareId();
  return {
    ...headers,
    'X-Device-UUID': deviceUUID,
    'X-Hardware-ID': hardwareId
  };
}

// Generate device fingerprint as requested
export function getDeviceFingerprint() {
  const uniqueId = getOrCreateUniqueId();
  const userAgent = navigator.userAgent || '';
  const screenWidth = window.screen?.width || 0;
  
  // Create fingerprint as base64 encoded string
  const fingerprintString = userAgent + screenWidth + uniqueId;
  const fingerprint = btoa(fingerprintString);
  
  return fingerprint;
}

// Enhanced device fingerprinting with full details
export function getDetailedDeviceFingerprint() {
  const deviceUUID = getOrCreateDeviceUUID();
  const uniqueId = getOrCreateUniqueId();
  
  return {
    uuid: deviceUUID,
    uniqueId: uniqueId,
    fingerprint: getDeviceFingerprint(),
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
  const hardwareId = getOrCreateHardwareId();
  
  return {
    ...headers,
    'X-Device-UUID': deviceUUID,
    'X-Device-Fingerprint': JSON.stringify(fingerprint),
    'X-Hardware-ID': hardwareId
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
  getOrCreateHardwareId,
  attachDeviceHeaders,
  getDeviceFingerprint,
  attachDeviceFingerprintHeaders,
  isValidDeviceUUID,
  clearDeviceUUID,
  getExistingDeviceUUID,
  migrateLegacyDeviceId
};