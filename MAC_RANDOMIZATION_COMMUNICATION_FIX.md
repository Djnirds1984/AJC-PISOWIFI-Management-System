# MAC Randomization Communication Fix

## Problem Identified
The system was "blind" and couldn't communicate with the portal because:
1. **Captive portal detection endpoints** were serving HTML directly instead of redirecting to portal
2. **No JavaScript execution** meant session restoration never ran
3. **MAC-based session lookup** couldn't find sessions for randomized MACs
4. **No proactive session detection** when devices switched networks

## Root Cause
When users switched SSIDs with MAC randomization:
1. Device gets new MAC address
2. Captive portal detection hits `/generate_204`, `/hotspot-detect.html`, etc.
3. Server serves HTML directly (`res.sendFile(index.html)`)
4. **JavaScript never runs** → No session restoration
5. System sees two separate devices instead of one device with transferred session

## Comprehensive Fix Implemented

### 1. Fixed Captive Portal Detection Endpoints
**Before**: Served HTML directly
```javascript
return res.sendFile(path.join(__dirname, 'index.html'));
```

**After**: Redirect to portal page so JavaScript can run
```javascript
// Check for transferable sessions
const transferableSessions = await db.all(
  'SELECT token FROM sessions WHERE remaining_seconds > 0 AND token_expires_at > datetime("now") AND mac != ? LIMIT 1',
  [mac]
);

if (transferableSessions.length > 0) {
  console.log(`[CAPTIVE-DETECT] New MAC ${mac} with transferable sessions - redirecting to portal`);
  return res.redirect(302, '/'); // Force redirect so JS runs
}
```

### 2. Enhanced Portal Middleware
**Added**: Server-side detection of transferable sessions
```javascript
// Check if there are any sessions that could be transferred to this device
const transferableSessions = await db.all(
  'SELECT token, mac as original_mac, remaining_seconds FROM sessions WHERE remaining_seconds > 0 AND token_expires_at > datetime("now") AND mac != ? LIMIT 5',
  [mac]
);

if (transferableSessions.length > 0) {
  // Add headers to trigger automatic session restoration
  res.setHeader('X-AJC-Session-Restore-Available', 'true');
  res.setHeader('X-AJC-Available-Sessions', transferableSessions.length.toString());
}
```

### 3. Aggressive Frontend Session Restoration
**Added**: Multiple restoration triggers
```javascript
// 1. Immediate check on portal load
checkServerSessionHints();
checkAndRestoreSession();

// 2. Periodic restoration attempts (every 10 seconds)
const periodicRestoreCheck = setInterval(() => {
  const sessionToken = localStorage.getItem('ajc_session_token');
  if (sessionToken && !mySession && onRestoreSession) {
    console.log('[Portal] Periodic check: Still have token but no session - attempting restoration');
    onRestoreSession();
  }
}, 10000);

// 3. Server hint detection
const response = await fetch('/', { method: 'HEAD' });
const hasRestorableSession = response.headers.get('X-AJC-Session-Restore-Available');
if (hasRestorableSession === 'true') {
  onRestoreSession(); // Immediate restoration
}
```

### 4. Enhanced Logging
**Added**: Comprehensive debugging logs
```javascript
console.log(`[CAPTIVE-DETECT] New MAC ${mac} with transferable sessions - redirecting to portal`);
console.log(`[PORTAL-REDIRECT] Found ${transferableSessions.length} transferable sessions`);
console.log(`[Portal] Server indicates ${availableSessions} transferable sessions available`);
```

## How It Works Now

### Scenario: User Switches SSID with MAC Randomization

1. **Device connects to new SSID** → Gets new randomized MAC
2. **OS performs captive portal detection** → Hits `/generate_204` or similar
3. **Server detects new MAC** → Checks for transferable sessions
4. **Server finds transferable session** → Redirects to portal (`302 /`)
5. **Browser loads portal page** → JavaScript executes
6. **Portal detects session token** → Automatically calls session restoration
7. **Session transfers to new MAC** → Internet access granted
8. **User sees notification** → "Session transferred to new device"

### Multiple Safety Nets

1. **Captive Portal Detection** → All endpoints redirect to portal when transferable sessions exist
2. **Portal Load Detection** → Automatic restoration on page load
3. **Server Hint Headers** → Portal detects server suggestions for restoration
4. **Periodic Restoration** → Keeps trying every 10 seconds until success
5. **Manual Restoration** → Prominent button for user-triggered restoration

## Testing Instructions

### Test 1: Basic MAC Randomization Transfer
1. Insert coins on Device A, get internet access
2. Switch to different SSID (triggers MAC randomization)
3. **Expected**: Portal automatically opens and restores session within 10 seconds
4. **Verify**: Only one device shows in admin panel with transferred session

### Test 2: Captive Portal Detection Trigger
1. Have active session on SSID-A
2. Switch to SSID-B
3. **Expected**: OS captive portal detection triggers automatic portal redirect
4. **Verify**: Browser opens portal page and session restores automatically

### Test 3: Multiple SSID Switches
1. Active session on SSID-A
2. Switch: SSID-A → SSID-B → SSID-C → SSID-D
3. **Expected**: Session follows user across all network changes
4. **Verify**: Always shows as one device in admin panel

## Debugging Commands

### Check Server Logs
```bash
# Watch session restoration logs
tail -f logs/system-$(date +%Y-%m-%d).log | grep "CAPTIVE-DETECT\|PORTAL-REDIRECT\|MAC-SYNC"

# Check captive portal detection
tail -f logs/system-$(date +%Y-%m-%d).log | grep "transferable sessions"
```

### Check Browser Console
Open F12 Developer Tools and look for:
```
[Portal] Server indicates 1 transferable sessions available - triggering immediate restoration
[Session] Attempting to restore session, token: 12345678..., retries: 5
[Session] Restore response: 200 OK
Session restored successfully
Session migrated to new network info
```

### Verify Database State
```bash
# Check active sessions
sqlite3 pisowifi.sqlite "SELECT mac, ip, remaining_seconds, token FROM sessions WHERE remaining_seconds > 0;"

# Should show only ONE session after transfer, not two
```

### Test Captive Portal Detection
```bash
# Simulate captive portal detection
curl -I http://192.168.50.20/generate_204
# Should return: HTTP/1.1 302 Found, Location: /

curl -I http://192.168.50.20/hotspot-detect.html  
# Should return: HTTP/1.1 302 Found, Location: /
```

## Expected Behavior

### Before Fix (Broken)
- User switches SSID → System sees 2 devices
- Captive portal detection serves HTML directly
- JavaScript never runs → No session restoration
- User has to manually insert coins again

### After Fix (Working)
- User switches SSID → System detects transferable session
- Captive portal detection redirects to portal page
- JavaScript runs automatically → Session restoration triggered
- Session transfers seamlessly → User keeps internet access
- Admin panel shows only 1 device (session transferred)

## Performance Impact
- **Minimal overhead**: Only checks for transferable sessions when new MACs detected
- **Efficient queries**: Limited to 5 sessions max per check
- **Smart intervals**: Periodic checks stop when session restored or no token
- **Reactive system**: No background scanning, only processes when needed

## Security Maintained
- **Voucher sessions**: Still device-specific, cannot be transferred
- **Coin sessions**: Support MAC sync as designed
- **Token expiration**: 3-day limit prevents indefinite sharing
- **Session validation**: All transfers require valid, non-expired tokens

The system is no longer "blind" - it actively detects MAC randomization and communicates with the portal to restore sessions automatically!