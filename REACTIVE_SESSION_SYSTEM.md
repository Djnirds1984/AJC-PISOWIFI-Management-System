# Reactive Session System - Disabled Auto-Scanning

## Problem with Auto-Scanning
The previous system used **proactive scanning** that was CPU-intensive and unnecessary:

```javascript
// OLD SYSTEM - CPU INTENSIVE
setInterval(scanForNewClients, 10000); // Scan every 10 seconds

async function scanForNewClients() {
  // 1. Query all active sessions from database
  // 2. Scan network using 'arp -a' or 'ip neigh show'
  // 3. Parse network scan results
  // 4. Check each device for session transfer opportunities
  // 5. Automatically transfer sessions to new MACs
  // 6. Update database and network rules
}
```

**Issues:**
- ❌ **CPU Intensive**: Network scanning + database queries every 10 seconds
- ❌ **Unnecessary**: Token-based system makes auto-scanning redundant
- ❌ **Resource Waste**: Continuous background processing
- ❌ **Complex Logic**: Automatic session transfers without user interaction

## New Reactive System
The system now uses **reactive session restoration** that is CPU-efficient:

```javascript
// NEW SYSTEM - CPU EFFICIENT
// No background scanning - wait for device communication

// When device visits captive portal:
// 1. Device connects to WiFi
// 2. Device tries to access internet
// 3. Captive portal detects device
// 4. Portal checks localStorage for session token
// 5. Portal sends token to /api/sessions/restore
// 6. System finds session by token and transfers to new MAC
```

**Benefits:**
- ✅ **CPU Efficient**: No background scanning processes
- ✅ **User-Initiated**: Session restoration happens when user actually needs it
- ✅ **Token-Based**: Leverages existing elegant token system
- ✅ **Simpler Logic**: Clean reactive flow

## System Flow Comparison

### **Old Proactive System**
```
System Scans Network (every 10s)
    ↓
Finds New Device MAC
    ↓
Searches for Transferable Sessions
    ↓
Automatically Transfers Session
    ↓
Device Gets Internet Access
```

### **New Reactive System**
```
Device Connects to WiFi
    ↓
Device Visits Captive Portal
    ↓
Portal Reads Session Token from localStorage
    ↓
Portal Sends Token to /api/sessions/restore
    ↓
System Transfers Session to New MAC
    ↓
Device Gets Internet Access
```

## Technical Changes

### **Disabled Components**
```javascript
// DISABLED: Auto-scanning function
async function scanForNewClients() {
  // Function body disabled - now just logs that it's disabled
  console.log('[CLIENT-SCAN] Auto-scanning is disabled - using reactive token-based session restoration');
}

// DISABLED: Background scanner interval
// setInterval(scanForNewClients, 10000);

// DISABLED: Device tracking map
// const processedDevices = new Map();

// DISABLED: Device tracking cleanup
// setInterval(() => { /* cleanup processedDevices */ }, 5 * 60 * 1000);
```

### **Active Components**
```javascript
// ACTIVE: Session restoration endpoint
app.post('/api/sessions/restore', async (req, res) => {
  const { token } = req.body;
  // Find session by token and transfer to new MAC
});

// ACTIVE: Captive portal detection
app.use('*', async (req, res, next) => {
  // Detect new devices and redirect to portal
  // Portal handles session restoration via tokens
});

// ACTIVE: Token-based session creation
// All session creation methods (coin, voucher, manual) create tokens
```

## User Experience

### **Device Switching Flow**
1. **User has session**: 30 minutes remaining on "PisoWiFi-Main"
2. **User switches SSID**: Connects to "PisoWiFi-Guest" (MAC may change)
3. **Portal loads**: Automatically detects session token in localStorage
4. **Session restores**: Token sent to server, session transfers to new MAC
5. **Internet access**: User keeps 30 minutes on new network

### **No Background Processing**
- **Before**: System constantly scans network every 10 seconds
- **After**: System waits quietly until device visits portal
- **Result**: Significant CPU savings with same user experience

## Performance Benefits

### **CPU Usage Reduction**
```bash
# Before (every 10 seconds):
- Network scan (arp -a or ip neigh show)
- Database query (active sessions)
- MAC address parsing
- Session transfer logic
- Network rule updates

# After (only when needed):
- Portal token check (when user visits)
- Session restoration (when user requests)
- Network rule update (single operation)
```

### **Resource Savings**
- **Network Commands**: Reduced from 360 per hour to 0
- **Database Queries**: Reduced from 360 per hour to on-demand
- **CPU Cycles**: Significant reduction in background processing
- **Memory Usage**: No processedDevices tracking map

## Captive Portal Integration

### **Portal Detection Logic**
```javascript
// Portal automatically detects new devices
app.use('*', async (req, res, next) => {
  const session = await db.get('SELECT * FROM sessions WHERE mac = ? AND remaining_seconds > 0', [mac]);
  
  if (!session) {
    // No active session - redirect to portal
    console.log(`[PORTAL-REDIRECT] New client detected: ${mac} - redirecting to portal`);
    // Portal will handle session restoration via tokens
  }
});
```

### **Automatic Session Restoration**
```javascript
// Portal automatically tries to restore session on load
const sessionToken = localStorage.getItem('ajc_session_token');

if (sessionToken) {
  const response = await fetch('/api/sessions/restore', {
    method: 'POST',
    body: JSON.stringify({ token: sessionToken })
  });
  
  if (response.ok) {
    // Session restored - user gets internet access
  }
}
```

## Configuration

### **System Status**
```bash
# Check if auto-scanning is disabled
grep "Background client scanner DISABLED" server.js

# Expected output:
console.log('[CLIENT-SCAN] Background client scanner DISABLED - using reactive token-based session restoration for better CPU efficiency');
```

### **Monitoring**
```bash
# Monitor session restorations (reactive)
tail -f logs/system-*.log | grep "Session restored"

# No more auto-scan logs (proactive)
# tail -f logs/system-*.log | grep "CLIENT-SCAN" # Should be minimal
```

## Benefits Summary

### **✅ Performance**
- **CPU Efficient**: No background scanning processes
- **Memory Efficient**: No device tracking maps
- **Network Efficient**: No periodic network commands

### **✅ User Experience**
- **Same Functionality**: Session restoration still works perfectly
- **Faster Response**: Immediate restoration when user visits portal
- **Cleaner Logs**: Less noise from background scanning

### **✅ System Architecture**
- **Reactive Design**: System responds to user actions
- **Token-Based**: Leverages elegant session token system
- **Simpler Code**: Removed complex auto-scanning logic

The system now operates on the principle: **"Wait for device communication, then restore session via token"** instead of **"Constantly scan for devices and auto-transfer sessions"**.

This change maintains the same user experience while significantly reducing CPU usage and system complexity.