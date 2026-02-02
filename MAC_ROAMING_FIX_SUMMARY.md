# MAC Address Roaming Fix - Implementation Summary

## Problem
During Random MAC roaming between Pis, devices lose their session identity because:
1. Session tokens were stored without explicit expiration dates
2. No mechanism to detect MAC address changes during roaming
3. Missing logic to update MAC addresses in Supabase when devices roam
4. Reliance on browser cookies which are less stable on mobile devices

## Solution Implemented

### 1. Enhanced Session Token Management
**File:** `lib/mac-roaming.js`
- Added explicit 7-day expiration for session tokens
- Tokens are now stored as JSON objects with `createdAt` and `expiresAt` fields
- Automatic cleanup of expired tokens

### 2. MAC Address Change Detection
**Files:** 
- `lib/mac-roaming.js`
- `components/Portal/LandingPage.tsx`

**Logic:**
- On portal load, compare current MAC with last known MAC for the session token
- If different, automatically trigger MAC address update in Supabase
- Store last known MAC in localStorage with key `ajc_last_mac_{sessionToken}`

### 3. Supabase MAC Address Update API
**File:** `server.js`
- Added `/api/session/update-mac` POST endpoint
- Updates MAC address in:
  - Local `sessions` table
  - Local `wifi_devices` table  
  - Supabase `wifi_devices` table
  - Network permissions (blocks old MAC, new MAC gets whitelisted on access)

### 4. Improved Session Restoration
**Files:**
- `App.tsx`
- `components/Portal/LandingPage.tsx`

**Enhancements:**
- Use enhanced session token management
- Save initial MAC when session is created
- Check for MAC changes on every portal load
- Proper cleanup of session data

## Key Features

### 🛡️ Persistent Session Storage
- Session tokens now persist for 7 days with explicit expiration
- Uses localStorage as primary storage (more stable than cookies on mobile)
- Automatic cleanup of expired sessions

### 🔄 Automatic MAC Roaming
- Detects MAC address changes automatically
- Updates cloud database in real-time
- Maintains session continuity across access points

### 🔧 Robust Error Handling
- Graceful degradation if Supabase is unavailable
- Network permission updates handled separately
- Comprehensive logging for debugging

## Testing Instructions

1. **Start a session** on Access Point A
2. **Roam to Access Point B** (different MAC address)
3. **Verify:**
   - Session continues without interruption
   - MAC address updated in Supabase dashboard
   - Network access maintained
   - Session token still valid (7-day expiration)

## Files Modified

- `components/Portal/LandingPage.tsx` - Added MAC roaming detection
- `App.tsx` - Updated session management
- `server.js` - Added MAC update API endpoint
- `lib/mac-roaming.js` - New utility functions (created)

## Technical Details

### Session Token Structure
```javascript
{
  "token": "sess_123456789",
  "createdAt": 1707000000000,
  "expiresAt": 1707604800000  // 7 days from creation
}
```

### MAC Tracking
- Last known MAC stored per session token
- Comparison on every portal load
- Automatic cloud synchronization when changes detected

### API Endpoint
```
POST /api/session/update-mac
{
  "sessionToken": "sess_123456789",
  "oldMac": "AA:BB:CC:DD:EE:FF",
  "newMac": "11:22:33:44:55:66"
}
```

This implementation ensures seamless MAC address roaming while maintaining session continuity across all access points in the network.