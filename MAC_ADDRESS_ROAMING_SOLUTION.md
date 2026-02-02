# MAC Address Changing Issue Solution

## Problem Description
When users roam between different Raspberry Pi/Orange Pi machines in the PisoWiFi network, their MAC addresses appear to change, causing session restoration to fail. This happens because:

1. **Different network interfaces** on different machines may assign different MAC addresses to the same device
2. **ARP table expiration** causes temporary MAC resolution failures
3. **DHCP behavior differences** between access points
4. **Device reconnection** processes that may generate new MAC representations

## Root Cause Analysis
The system relies heavily on MAC address identification for session management, but MAC addresses are not guaranteed to be consistent across different access points or network segments.

## Solution Implemented

### 1. Enhanced MAC Resolution with Better Logging
- Added comprehensive logging to the `getMacFromIp()` function to track resolution attempts
- Improved error handling and fallback mechanisms
- Extended retry timeouts for better ARP table population

### 2. Multi-Method Device Identification
Created `lib/device-identifier.js` that uses multiple identification methods:

**Identification Methods (in order of confidence):**
1. **Network MAC** (100% confidence) - Direct network resolution
2. **Device Fingerprint** (80% confidence) - SHA256 hash of IP + User-Agent + Accept-Language
3. **Session MAC** (90% confidence) - MAC from existing active session
4. **Session Fingerprint** (85% confidence) - Fingerprint from existing session
5. **Historical Fingerprint** (70% confidence) - Previously seen fingerprints for this IP

### 3. Enhanced Session Restoration Logic
Modified `/api/sessions/restore` endpoint to:
- Use multiple identification methods when MAC resolution fails
- Handle cross-machine roaming scenarios gracefully
- Provide better error messages to users
- Support fingerprint-based session matching

### 4. Database Schema Enhancement
Added `device_fingerprint` column to the `sessions` table:
- Stores SHA256 fingerprints for persistent device identification
- Indexed for fast lookups
- Automatically populated during session creation

### 5. Improved Frontend Handling
Enhanced `restoreSession()` function in `App.tsx` to:
- Handle cross-machine roaming notifications
- Implement smarter retry logic with exponential backoff
- Provide clearer user feedback about session status
- Distinguish between different types of restoration failures

## Key Features

### Cross-Machine Roaming Detection
- Automatically detects when a session exists on another machine
- Alerts users to connect to the original access point
- Prevents duplicate sessions on multiple machines

### Persistent Device Identification
- Device fingerprints remain consistent even when MAC addresses change
- Combines multiple device characteristics for stable identification
- Historical fingerprint tracking for recurring devices

### Graceful Degradation
- Falls back through multiple identification methods
- Maintains functionality even when primary methods fail
- Provides informative error messages to users

## Implementation Files

1. **`lib/device-identifier.js`** - Core device identification logic
2. **`migrations/device_fingerprint_support.sql`** - Database schema migration
3. **Modified `server.js`** - Enhanced session restoration and MAC resolution
4. **Modified `App.tsx`** - Improved frontend session handling

## Deployment Steps

1. **Apply Database Migration:**
   ```bash
   # Run the SQL migration on your local database
   sqlite3 data/database.sqlite < migrations/device_fingerprint_support.sql
   ```

2. **Restart the Application:**
   ```bash
   # Restart your PisoWiFi service
   sudo systemctl restart ajc-pisowifi
   ```

3. **Verify Implementation:**
   - Test session creation on one machine
   - Attempt to restore session from another machine
   - Check logs for device identification methods used

## Testing Scenarios

### Scenario 1: Normal Session Restoration
- Device connects to Machine A
- Session is created successfully
- Device moves to Machine B
- Session should restore using fingerprint identification

### Scenario 2: Cross-Machine Roaming
- Device has active session on Machine A
- Tries to connect to Machine B
- Should receive notification about original machine
- Should be directed to connect to Machine A

### Scenario 3: MAC Resolution Failure
- Network conditions prevent MAC resolution
- System should fall back to fingerprint identification
- Session restoration should still work

## Monitoring and Troubleshooting

### Log Messages to Watch For:
```
[MAC-Resolve] Resolving MAC for IP: 192.168.1.100
[MAC-Resolve] Found MAC via ip neigh: AA:BB:CC:DD:EE:FF
[AUTH] Device identifiers for 192.168.1.100: [network_mac:AA:BB:CC:DD(100%), fingerprint:abcdef12(80%)]
[AUTH] Session found using fingerprint: abcdef1234567890
[Device-ID] Updated session 123 with fingerprint
```

### Common Issues and Solutions:

1. **"MAC resolution failed" errors**
   - Usually temporary - system will retry
   - Check network connectivity and ARP tables
   - Fingerprint-based identification will handle most cases

2. **"Cross-machine roaming detected"**
   - Expected behavior when session exists elsewhere
   - User should connect to indicated machine
   - Consider adjusting machine placement if frequent

3. **Database constraint violations**
   - Ensure migration was applied correctly
   - Check that `device_fingerprint` column exists
   - Verify index creation succeeded

## Future Enhancements

1. **Machine Learning Approach**: Train models to predict device identity based on behavioral patterns
2. **Bluetooth Proximity**: Use Bluetooth signals for additional device correlation
3. **Cookie-Based Tracking**: Implement persistent browser-based identification
4. **Advanced Fingerprinting**: Include more device characteristics in fingerprint generation

This solution maintains backward compatibility while significantly improving the reliability of cross-machine session management in your PisoWiFi network.