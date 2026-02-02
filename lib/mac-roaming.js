/**
 * MAC Address Roaming Utilities
 * 
 * Handles MAC address changes during device roaming between access points
 * and synchronizes these changes with the cloud database.
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
      localStorage.removeItem('ajc_session_token');
      return null;
    }
    return parsed.token;
  } catch (e) {
    // Invalid JSON, clean up
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
}

/**
 * Check and update MAC address in Supabase when it changes
 */
async function checkAndUpdateMACAddress(currentMac, sessionToken) {
  if (!sessionToken) return;
  
  try {
    // Get last known MAC for this session token
    const lastKnownMac = localStorage.getItem(`ajc_last_mac_${sessionToken}`);
    
    if (lastKnownMac && lastKnownMac !== currentMac) {
      console.log(`[MAC-Roaming] MAC changed from ${lastKnownMac} to ${currentMac}`);
      
      // Update MAC address in Supabase
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
        console.log(`[MAC-Roaming] Successfully updated MAC address in cloud`);
      } else {
        console.error(`[MAC-Roaming] Failed to update MAC address:`, await response.text());
      }
    }
    
    // Always save current MAC as last known
    localStorage.setItem(`ajc_last_mac_${sessionToken}`, currentMac);
  } catch (e) {
    console.error(`[MAC-Roaming] Error checking MAC address:`, e);
  }
}

/**
 * Save current MAC as last known (call before navigation)
 */
function saveCurrentMAC(sessionToken, currentMac) {
  if (sessionToken && currentMac) {
    localStorage.setItem(`ajc_last_mac_${sessionToken}`, currentMac);
  }
}

module.exports = {
  getSessionToken,
  setSessionToken,
  checkAndUpdateMACAddress,
  saveCurrentMAC
};