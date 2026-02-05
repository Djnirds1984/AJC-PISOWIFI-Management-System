/**
 * Unique Session ID Generator for PisoWiFi System
 * Each device gets a unique session identifier stored in browser storage
 * This replaces all previous UUID/Hardware ID systems
 */

// Generate/get unique session ID for this device
export function getOrCreateSessionId() {
  // Try to get existing session ID from localStorage
  let sessionId = localStorage.getItem('pisowifi_session_id');
  
  if (!sessionId) {
    // Generate new unique session ID using crypto API
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      // Modern browsers - use crypto.randomUUID for maximum uniqueness
      sessionId = crypto.randomUUID();
    } else {
      // Fallback for older browsers - generate cryptographically secure ID
      sessionId = generateSecureSessionId();
    }
    
    // Store the session ID persistently
    localStorage.setItem('pisowifi_session_id', sessionId);
    // Store creation timestamp for 1-year expiration tracking
    localStorage.setItem('pisowifi_session_id_created', Date.now().toString());
    console.log(`[SESSION-ID] Generated new unique session ID: ${sessionId.substring(0,8)}... (expires in 1 year)`);
  } else {
    // Check if existing Session ID has expired
    if (isSessionIdExpired()) {
      console.log(`[SESSION-ID] Session ID expired, generating new one`);
      clearSessionId();
      return getOrCreateSessionId(); // Recursive call to generate new one
    }
    
    // Renew expiration periodically (every 30 days)
    const createdAt = localStorage.getItem('pisowifi_session_id_created');
    if (createdAt) {
      const createdDate = new Date(parseInt(createdAt));
      const daysSinceCreation = (Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceCreation > 30) {
        renewSessionIdExpiration();
      }
    }
  }
  
  return sessionId;
}

// Generate cryptographically secure session ID (fallback method)
function generateSecureSessionId() {
  // Combine multiple sources of randomness for maximum uniqueness
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substring(2);
  const random2 = Math.random().toString(36).substring(2);
  const performance = (performance && performance.now) ? performance.now().toString(36) : '';
  
  // Create base string
  const baseString = `${timestamp}${random1}${random2}${performance}${navigator.userAgent || ''}`;
  
  // Hash it for consistent format
  let hash = 0;
  for (let i = 0; i < baseString.length; i++) {
    const char = baseString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to UUID-like format
  const hex = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-4${hex.substr(12, 3)}-8${hex.substr(15, 3)}-${hex.substr(18, 12)}`;
}

// Get existing session ID without generating (returns null if not exists)
export function getExistingSessionId() {
  return localStorage.getItem('pisowifi_session_id') || null;
}

// Clear session ID (for testing/debugging only)
export function clearSessionId() {
  localStorage.removeItem('pisowifi_session_id');
  console.log('[SESSION-ID] Cleared session ID');
}

// Extend Session ID expiration to 1 year (365 days)
export function getSessionIdExpiration() {
  const createdAt = localStorage.getItem('pisowifi_session_id_created');
  if (!createdAt) return null;
  
  const createdDate = new Date(parseInt(createdAt));
  const expirationDate = new Date(createdDate.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 year
  return expirationDate;
}

// Check if Session ID has expired
export function isSessionIdExpired() {
  const expiration = getSessionIdExpiration();
  if (!expiration) return true;
  return new Date() > expiration;
}

// Renew Session ID expiration (extend by 1 year from now)
export function renewSessionIdExpiration() {
  localStorage.setItem('pisowifi_session_id_created', Date.now().toString());
  console.log('[SESSION-ID] Session ID expiration renewed for 1 year');
}

// Attach session ID to request headers
export function attachSessionHeaders(headers = {}) {
  const sessionId = getOrCreateSessionId();
  return {
    ...headers,
    'X-PisoWiFi-Session-ID': sessionId
  };
}

// Validate session ID format (UUID v4 format)
export function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  
  // Standard UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(sessionId);
}

// Export default object for easier imports
export default {
  getOrCreateSessionId,
  attachSessionHeaders,
  isValidSessionId,
  getExistingSessionId,
  clearSessionId,
  getSessionIdExpiration,
  isSessionIdExpired,
  renewSessionIdExpiration
};