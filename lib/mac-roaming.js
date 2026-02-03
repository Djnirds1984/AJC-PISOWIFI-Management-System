/**
 * MAC Address Roaming Utilities
 * 
 * Handles MAC address changes during device roaming between access points
 * and synchronizes these changes with the cloud database.
 * 
 * Features:
 * - Session token management with explicit expiration (7 days)
 * - Automatic MAC address change detection and cloud synchronization
 * - Local storage of MAC addresses for comparison
 * - Robust error handling and logging
 * - Support for cross-machine roaming scenarios
 */

/**
 * Enhanced session token management with explicit expiration
 */
function getSessionToken() {
  const tokenData = localStorage.getItem('ajc_session_token');
  if (!tokenData) return null;
  
  try {
    const parsed = JSON.parse(tokenData);
    // Check if token is expired (7 days from creation)
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      console.log('[Session-Token] Token expired, removing from storage');
      localStorage.removeItem('ajc_session_token');
      return null;
    }
    return parsed.token;
  } catch (e) {
    // Invalid JSON, clean up
    console.log('[Session-Token] Invalid token data, cleaning up');
    localStorage.removeItem('ajc_session_token');
    return null;
  }
}

function setSessionToken(token) {
  // Set expiration to 7 days from now
  const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
  const tokenData = {
    token,
    createdAt: Date.now(),
    expiresAt
  };
  localStorage.setItem('ajc_session_token', JSON.stringify(tokenData));
  console.log(`[Session-Token] New session token set, expires at: ${new Date(expiresAt).toLocaleString()}`);
}

/**
 * Check and update MAC address in Supabase when it changes
 * Enhanced with robust error handling and logging
 */
async function checkAndUpdateMACAddress(currentMac, sessionToken) {
  if (!sessionToken) {
    console.log('[MAC-Roaming] No session token, skipping MAC check');
    return;
  }
  
  if (!currentMac || currentMac === 'unknown') {
    console.log('[MAC-Roaming] Invalid MAC address, skipping check');
    return;
  }
  
  try {
    // Get last known MAC for this session token
    const lastKnownMac = localStorage.getItem(`ajc_last_mac_${sessionToken}`);
    
    console.log(`[MAC-Roaming] Current MAC: ${currentMac}, Last known: ${lastKnownMac || 'none'}`);
    
    // Only update if we have a previous MAC and it's different
    if (lastKnownMac && lastKnownMac !== currentMac) {
      console.log(`[MAC-Roaming] MAC address change detected: ${lastKnownMac} → ${currentMac}`);
      
      // Update MAC address in cloud and local systems
      const response = await fetch('/api/session/update-mac', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionToken,
          oldMac: lastKnownMac,
          newMac: currentMac
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log(`[MAC-Roaming] Successfully updated MAC address in cloud:`, result);
      } else {
        const errorText = await response.text();
        console.error(`[MAC-Roaming] Failed to update MAC address in cloud:`, errorText);
        // Don't throw error here - we want to continue with local update
      }
    } else if (!lastKnownMac) {
      console.log(`[MAC-Roaming] Setting initial MAC address for session: ${currentMac}`);
    } else {
      console.log(`[MAC-Roaming] MAC address unchanged: ${currentMac}`);
    }
    
    // Always save current MAC as last known
    localStorage.setItem(`ajc_last_mac_${sessionToken}`, currentMac);
    console.log(`[MAC-Roaming] Saved current MAC ${currentMac} as last known for session ${sessionToken.substring(0, 8)}...`);
    
  } catch (e) {
    console.error(`[MAC-Roaming] Error checking/updating MAC address:`, e);
    // Even if cloud update fails, still save the MAC locally
    localStorage.setItem(`ajc_last_mac_${sessionToken}`, currentMac);
  }
}

/**
 * Save current MAC as last known (call before navigation or critical operations)
 * Ensures we have the latest MAC recorded for comparison
 */
function saveCurrentMAC(sessionToken, currentMac) {
  if (sessionToken && currentMac && currentMac !== 'unknown') {
    const previousMac = localStorage.getItem(`ajc_last_mac_${sessionToken}`);
    if (previousMac !== currentMac) {
      console.log(`[MAC-Save] Saving current MAC: ${currentMac} (was: ${previousMac || 'none'})`);
    }
    localStorage.setItem(`ajc_last_mac_${sessionToken}`, currentMac);
  } else if (!sessionToken) {
    console.log('[MAC-Save] No session token provided');
  } else if (!currentMac || currentMac === 'unknown') {
    console.log('[MAC-Save] Invalid MAC address provided');
  }
}

/**
 * Get the last known MAC address for a session token
 */
function getLastKnownMAC(sessionToken) {
  if (!sessionToken) return null;
  return localStorage.getItem(`ajc_last_mac_${sessionToken}`);
}

/**
 * Clear MAC address tracking for a session (call on logout/session end)
 */
function clearMACForSession(sessionToken) {
  if (sessionToken) {
    localStorage.removeItem(`ajc_last_mac_${sessionToken}`);
    console.log(`[MAC-Clear] Cleared MAC tracking for session ${sessionToken.substring(0, 8)}...`);
  }
}

module.exports = {
  getSessionToken,
  setSessionToken,
  checkAndUpdateMACAddress,
  saveCurrentMAC,
  getLastKnownMAC,
  clearMACForSession
};