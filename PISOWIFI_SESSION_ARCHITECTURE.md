# PisoWiFi Session Architecture Overview

## System Design Philosophy

**"All sessions are bound to browser session token/ID, then bind to MAC. When user transfers SSID, the captive portal communicates to system that this token/ID for this MAC. If system detects that token/session ID has time, then bind it to new MAC to allow internet."**

## Core Architecture

### **Universal Session Token Binding**
All session creation methods use the same token-based architecture:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Insert Coin   │    │     Voucher      │    │ Manual Add Time │
│                 │    │   Activation     │    │  (Admin Panel)  │
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          ▼                      ▼                       ▼
    ┌─────────────────────────────────────────────────────────────┐
    │              SESSION TOKEN GENERATION                       │
    │  • 32-byte random hex token                                │
    │  • 3-day expiration (token_expires_at)                    │
    │  • Stored in sessions table + browser localStorage        │
    └─────────────────────────────────────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                 SESSION + MAC BINDING                       │
    │  sessions: {                                               │
    │    token: "abc123...",                                     │
    │    mac: "AA:BB:CC:DD:EE:FF",                              │
    │    remaining_seconds: 3600,                               │
    │    token_expires_at: "2026-02-08T10:30:00Z"              │
    │  }                                                         │
    └─────────────────────────────────────────────────────────────┘
```

## Session Creation Methods

### **1. Insert Coin** (`/api/sessions/start`)
```javascript
// User selects rate and inserts coin
POST /api/sessions/start
{
  "minutes": 60,
  "pesos": 5,
  "slot": "main",
  "lockId": "lock123"
}

// System creates session with token
const token = crypto.randomBytes(32).toString('hex');
const tokenExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

INSERT INTO sessions (mac, ip, remaining_seconds, total_paid, token, token_expires_at)
VALUES (mac, ip, 3600, 5, token, tokenExpiresAt);

// Response includes token for browser storage
{ success: true, token: "abc123...", mac: "AA:BB:CC:DD:EE:FF" }
```

### **2. Voucher Activation** (`/api/vouchers/activate`)
```javascript
// User enters voucher code
POST /api/vouchers/activate
{
  "code": "AJC12345"
}

// System creates session with token (session-specific, no MAC sync)
const sessionId = crypto.randomBytes(16).toString('hex');
const token = crypto.randomBytes(32).toString('hex');

INSERT INTO sessions (
  id, mac, ip, remaining_seconds, token, token_expires_at,
  voucher_code, session_type
) VALUES (
  sessionId, mac, ip, 1800, token, tokenExpiresAt,
  "AJC12345", "voucher"
);
```

### **3. Manual Add Time** (`PUT /api/devices/:id`)
```javascript
// Admin adds time to device
PUT /api/devices/device123
{
  "sessionTime": 3600  // 1 hour in seconds
}

// System creates/updates session with token
if (!existingSession.token) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  
  UPDATE sessions SET 
    remaining_seconds = ?, 
    token = ?, 
    token_expires_at = ? 
  WHERE mac = ?;
}
```

## SSID Transfer & MAC Sync Flow

### **Scenario**: User switches from "PisoWiFi-Main" to "PisoWiFi-Guest"

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORIGINAL CONNECTION                          │
│  SSID: PisoWiFi-Main                                          │
│  MAC:  AA:BB:CC:DD:EE:FF                                       │
│  Token: abc123... (stored in browser localStorage)            │
│  Time: 30 minutes remaining                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ User switches SSID
┌─────────────────────────────────────────────────────────────────┐
│                     NEW CONNECTION                              │
│  SSID: PisoWiFi-Guest                                         │
│  MAC:  11:22:33:44:55:66 (randomized by phone)               │
│  Token: abc123... (same token in browser localStorage)        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Captive portal detects token
┌─────────────────────────────────────────────────────────────────┐
│                  SESSION RESTORATION                            │
│                                                                 │
│  1. Portal reads token from localStorage                       │
│  2. Sends token to system: POST /api/sessions/restore          │
│  3. System finds session by token (not MAC)                   │
│  4. System validates token expiration (< 3 days)              │
│  5. System transfers session to new MAC                       │
│                                                                 │
│  UPDATE sessions SET                                           │
│    mac = "11:22:33:44:55:66",                                │
│    ip = "192.168.1.200"                                       │
│  WHERE token = "abc123...";                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Network access granted
┌─────────────────────────────────────────────────────────────────┐
│                      RESULT                                     │
│  ✅ User keeps 30 minutes on new SSID                         │
│  ✅ New MAC gets internet access                               │
│  ✅ Session seamlessly transferred                             │
└─────────────────────────────────────────────────────────────────┘
```

## Session Restoration API Flow

### **Client Side** (Captive Portal)
```javascript
// Portal automatically tries to restore session on load
const sessionToken = localStorage.getItem('ajc_session_token');

if (sessionToken) {
  const response = await fetch('/api/sessions/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: sessionToken })
  });
  
  if (response.ok) {
    const data = await response.json();
    // User automatically gets internet access
    // Remaining time: data.remainingSeconds
  }
}
```

### **Server Side** (Session Restore Logic)
```javascript
app.post('/api/sessions/restore', async (req, res) => {
  const { token } = req.body;
  const newMac = await getMacFromIp(req.ip);
  
  // Find session by token (not MAC)
  const session = await db.get('SELECT * FROM sessions WHERE token = ?', [token]);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Check token expiration (3 days)
  if (new Date() > new Date(session.token_expires_at)) {
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Handle different session types
  if (session.session_type === 'voucher') {
    // Voucher sessions: MAC-specific (no transfer)
    if (session.mac !== newMac) {
      return res.status(403).json({ 
        error: 'Voucher sessions cannot be transferred' 
      });
    }
  } else {
    // Coin/Manual sessions: Allow MAC transfer
    await db.run(
      'UPDATE sessions SET mac = ?, ip = ? WHERE token = ?',
      [newMac, req.ip, token]
    );
    
    // Switch network access
    await network.blockMAC(session.mac, session.ip);    // Block old MAC
    await network.whitelistMAC(newMac, req.ip);         // Allow new MAC
  }
  
  res.json({ 
    success: true, 
    remainingSeconds: session.remaining_seconds,
    migrated: session.mac !== newMac
  });
});
```

## Session Types & Behavior

### **Coin Sessions** (MAC Sync Enabled)
- ✅ **Token Transfer**: Can move between MACs using token
- ✅ **SSID Switching**: Works across different WiFi networks  
- ✅ **3-Day Persistence**: Token valid for 3 days
- ✅ **Time Merging**: Multiple sessions on same device merge time

### **Voucher Sessions** (MAC-Specific)
- ❌ **No MAC Transfer**: Bound to original MAC address
- ✅ **Same Device**: Can switch IP on same MAC
- ✅ **3-Day Persistence**: Token valid for 3 days
- ❌ **No Time Sharing**: Cannot share with other devices

### **Manual Time Sessions** (MAC Sync Enabled)
- ✅ **Token Transfer**: Can move between MACs using token
- ✅ **Admin Control**: Created through device management
- ✅ **3-Day Persistence**: Token valid for 3 days
- ✅ **Flexible Limits**: Custom bandwidth limits per device

## Token Security & Expiration

### **Token Properties**
```javascript
{
  token: "a1b2c3d4e5f6...",           // 32-byte random hex (64 chars)
  token_expires_at: "2026-02-08T10:30:00Z",  // 3 days from creation
  created_at: "2026-02-05T10:30:00Z"         // Session creation time
}
```

### **Expiration Handling**
- **Valid Token**: Session transfers to new MAC, internet granted
- **Expired Token**: User must insert coins/voucher again
- **No Token**: Old sessions get tokens when updated by admin

### **Security Features**
- **Random Generation**: Cryptographically secure tokens
- **Time-Limited**: 3-day expiration prevents indefinite access
- **Session Binding**: Token + MAC validation prevents hijacking
- **Automatic Cleanup**: Expired tokens cleaned up automatically

## Benefits of This Architecture

### **✅ User Experience**
- **Seamless Switching**: Change WiFi networks without losing time
- **Phone Compatibility**: Works with MAC randomization
- **Persistent Sessions**: Resume after hours/days (within 3 days)
- **Universal Access**: Same experience across coin/voucher/manual

### **✅ Admin Control**
- **Flexible Management**: Add time to any device
- **Session Tracking**: Monitor all active sessions with tokens
- **Bandwidth Control**: Per-device speed limits
- **Audit Trail**: Track session transfers and usage

### **✅ Technical Robustness**
- **Fault Tolerant**: Sessions survive network changes
- **Scalable**: Token-based lookup is efficient
- **Secure**: Time-limited tokens prevent abuse
- **Backward Compatible**: Existing sessions get tokens when needed

This architecture elegantly solves the core challenge of modern WiFi management: **maintaining user sessions across device changes while providing administrative control and security**.