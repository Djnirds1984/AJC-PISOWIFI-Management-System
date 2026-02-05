# MAC Randomization Session Transfer Fix

## Problem
When users switch WiFi SSIDs with MAC randomization enabled on their devices, the session restoration system wasn't working properly, resulting in no internet access on the new MAC address.

## Root Cause Analysis
1. **Session restoration was being called** - The `restoreSession()` function runs automatically when the portal loads
2. **MAC detection was working** - The `getMacFromIp()` function has multiple fallback methods
3. **Session transfer logic was correct** - The `/api/sessions/restore` endpoint properly transfers sessions between MACs
4. **Network whitelisting timing issue** - The network rules weren't taking effect immediately after transfer

## Implemented Fixes

### 1. Enhanced Logging
- Added detailed logging to session restoration process (both client and server side)
- Added MAC detection logging to identify when fallback MACs are used
- Added network operation logging for debugging

### 2. Improved Network Switching
- Added 500ms delay between blocking old MAC and whitelisting new MAC
- Added `forceNetworkRefresh()` call after session transfer
- Added success message to inform user about transfer status

### 3. Better User Feedback
- Enhanced session restoration button visibility and messaging
- Added automatic session restoration check when portal loads
- Added visual notification when session is successfully migrated
- Added explanatory text for users who switched networks

### 4. Proactive Session Detection
- Portal now automatically detects when user has session token but no active session
- Automatically attempts session restoration after 2 seconds
- Shows prominent "RESTORE MY SESSION" button for manual restoration

## Testing Instructions

### Test Scenario 1: Basic MAC Randomization Transfer
1. **Setup**: Insert coins and get internet access on Device A
2. **Switch Network**: Change to different SSID (triggers MAC randomization)
3. **Expected Result**: 
   - Portal should automatically detect session token
   - Session should transfer to new MAC within 10 seconds
   - Green notification should appear: "Session transferred to new device"
   - Internet access should work immediately

### Test Scenario 2: Manual Session Restoration
1. **Setup**: Have active session on Device A
2. **Switch Network**: Change SSID and visit captive portal
3. **Manual Action**: Click "RESTORE MY SESSION" button
4. **Expected Result**: Same as Scenario 1

### Test Scenario 3: Multiple SSID Switches
1. **Setup**: Active session on SSID-A
2. **Switch**: SSID-A → SSID-B (should transfer automatically)
3. **Switch**: SSID-B → SSID-C (should transfer automatically)
4. **Expected Result**: Session follows user across all network changes

## Debugging Commands

### Check Session Status
```bash
# View active sessions
sqlite3 pisowifi.sqlite "SELECT mac, ip, remaining_seconds, token FROM sessions WHERE remaining_seconds > 0;"

# Check session restoration logs
tail -f logs/system-$(date +%Y-%m-%d).log | grep "MAC-SYNC\|Session"
```

### Check Network Rules
```bash
# View iptables rules for specific MAC
iptables -t nat -L PREROUTING -n | grep "MAC aa:bb:cc:dd:ee:ff"
iptables -L FORWARD -n | grep "MAC aa:bb:cc:dd:ee:ff"

# Check ARP table
ip neigh show
arp -a
```

### Test MAC Detection
```bash
# Test MAC resolution for IP
curl -X POST http://localhost:3000/api/whoami
```

## Browser Console Debugging

Open browser console (F12) and look for these log messages:

### Successful Session Transfer
```
[Session] Attempting to restore session, token: 12345678..., retries: 5
[Session] Restore response: 200 OK
[Session] Restore data: {success: true, migrated: true, remainingSeconds: 3600, message: "..."}
Session restored successfully
Session migrated to new network info
```

### Failed Session Transfer
```
[Session] Restore response: 400 Bad Request
[Session] Restore failed (400), retrying... (4 left)
```

## Configuration Verification

### Check MAC Sync Status
```bash
# Verify MAC sync is enabled
sqlite3 pisowifi.sqlite "SELECT key, value FROM config WHERE key = 'mac_sync_enabled';"
```

### Check Session Token Expiration
```bash
# View token expiration times
sqlite3 pisowifi.sqlite "SELECT mac, token_expires_at, datetime(token_expires_at) FROM sessions WHERE remaining_seconds > 0;"
```

## Expected Behavior

### Automatic Session Restoration
- **Trigger**: User visits captive portal with session token in localStorage
- **Detection**: Portal detects token but no active session
- **Action**: Automatically calls session restoration after 2 seconds
- **Result**: Session transfers to new MAC, internet access granted

### Manual Session Restoration
- **Trigger**: User clicks "RESTORE MY SESSION" button
- **Action**: Immediately calls session restoration
- **Feedback**: Visual notification shows transfer status
- **Result**: Same as automatic restoration

### Network Rule Application
- **Old MAC**: Blocked from internet access
- **New MAC**: Whitelisted with same time/limits as original session
- **Timing**: Rules take effect within 10 seconds
- **Persistence**: Session continues until time expires

## Troubleshooting

### Issue: Session restoration fails with 400 error
**Cause**: MAC detection failed
**Solution**: Check ARP table, restart dnsmasq, verify network connectivity

### Issue: Session transfers but no internet access
**Cause**: Network rules not applied properly
**Solution**: Check iptables rules, verify interface configuration

### Issue: Session restoration not triggered automatically
**Cause**: JavaScript error or missing session token
**Solution**: Check browser console, verify localStorage has 'ajc_session_token'

### Issue: Multiple sessions created instead of transfer
**Cause**: Session restoration logic bypassed
**Solution**: Verify MAC sync is enabled, check session token validity

## Performance Impact
- **Minimal CPU usage**: Reactive system only processes when users visit portal
- **No background scanning**: Removed CPU-intensive auto-scanning
- **Efficient MAC detection**: Multiple fallback methods ensure reliability
- **Quick network switching**: 500ms delay ensures clean rule transitions

## Security Considerations
- **Voucher sessions remain device-specific**: Cannot be transferred between devices
- **Coin sessions support MAC sync**: Can be transferred as designed
- **Token expiration**: 3-day limit prevents indefinite session sharing
- **Session binding**: Each session tied to specific token for security