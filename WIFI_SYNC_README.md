# WiFi Device Cross-Machine Sync System

This system enables WiFi devices to maintain their session when roaming between different PisoWiFi machines in the same network.

## Architecture Overview

```
[Device] ←→ [Machine A] ←→ [Supabase Cloud] ←→ [Machine B] ←→ [Device]
              ↑                                ↑
         Local WiFi DB                   Central WiFi DB
```

## Components

### 1. Database Schema (`wifi_devices` table)
Stores WiFi device information with session data for cross-machine synchronization.

Key fields:
- `mac_address` - Unique device identifier
- `session_token` - Unique session identifier
- `remaining_seconds` - Current session time
- `is_connected` - Connection status
- `last_heartbeat` - Last update timestamp
- `allowed_machines` - Array of machine IDs device can access
- `sync_status` - Sync status (pending/success/failed)

### 2. Server Modules

#### `lib/wifi-sync.js`
Handles synchronization between local machine and Supabase cloud.

**Features:**
- Automatic device discovery and sync (every 30 seconds)
- Session continuity across machines
- Retry queue for failed syncs
- Device heartbeat processing
- Cross-machine session checking

#### `lib/wifi-heartbeat-client.js`
Client-side script for devices to maintain session.

**Features:**
- Periodic heartbeat sending
- Session time reporting
- Remote session checking
- Cross-machine session sync

### 3. API Endpoints

#### Device Heartbeat
```
POST /api/wifi/heartbeat
Content-Type: application/json

{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "session_token": "sess_123456789",
  "remaining_seconds": 1800
}
```

#### Check Remote Session
```
GET /api/wifi/session/{mac_address}
```

Response:
```json
{
  "has_cloud_session": true,
  "cloud_session": {...},
  "has_local_session": false,
  "can_roam": true
}
```

#### Grant Cross-Machine Access
```
POST /api/wifi/grant-access
Authorization: Bearer {admin_token}

{
  "session_token": "sess_123456789",
  "target_machine_ids": ["uuid1", "uuid2"]
}
```

#### Sync Session Across Machines
```
POST /api/wifi/sync-session

{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "session_token": "sess_123456789",
  "remaining_seconds": 1800
}
```

#### Get Sync Statistics
```
GET /api/wifi/sync-stats
Authorization: Bearer {admin_token}
```

## How It Works

### 1. Device Connection Flow
1. Device connects to Machine A
2. Machine A creates local session
3. `wifi-sync.js` automatically syncs device to Supabase
4. Device starts sending heartbeats every 30 seconds

### 2. Cross-Machine Roaming
1. Device moves to Machine B's coverage area
2. Machine B checks Supabase for device session
3. If session exists and is allowed, grant access
4. Device continues session seamlessly

### 3. Session Continuity
- Heartbeats keep session alive in cloud
- Last machine to update session "owns" it
- Other machines can check and resume sessions
- Admins can grant access to specific machines

## Setup Instructions

### 1. Database Migration
Ensure the `wifi_devices` table exists in Supabase (you've already applied this).

### 2. Environment Variables
Add to your `.env` file:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

### 3. Server Integration
The system is automatically integrated. The server now:
- Imports `wifi-sync.js`
- Provides API endpoints
- Syncs devices every 30 seconds

### 4. Client Integration
Include the heartbeat client in your portal:

```html
<script src="/lib/wifi-heartbeat-client.js"></script>
<script>
  // After successful login
  const heartbeat = new WifiHeartbeatClient({
    macAddress: deviceMac,        // From server
    sessionToken: sessionToken,   // From login response
    machineUrl: window.location.origin,
    intervalMs: 30000
  });
  
  heartbeat.startHeartbeat();
  
  // When countdown updates
  heartbeat.setRemainingTime(remainingSeconds);
  
  // On logout
  heartbeat.stopHeartbeat();
</script>
```

## Admin Features

### Monitor Sync Status
```bash
curl -H "Authorization: Bearer ADMIN_TOKEN" \
  http://localhost:8080/api/wifi/sync-stats
```

### Grant Cross-Machine Access
```bash
curl -X POST \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"session_token":"sess_123","target_machine_ids":["uuid1","uuid2"]}' \
  http://localhost:8080/api/wifi/grant-access
```

## Troubleshooting

### Common Issues

1. **Devices not syncing to cloud**
   - Check Supabase credentials in `.env`
   - Verify machine is registered in `vendors` table
   - Check sync stats: `GET /api/wifi/sync-stats`

2. **Heartbeats failing**
   - Ensure device has valid session token
   - Check network connectivity to machine
   - Verify MAC address format

3. **Cross-machine roaming not working**
   - Confirm both machines use same Supabase project
   - Check `allowed_machines` field in cloud
   - Verify device has active session in cloud

### Logs
Monitor these log prefixes:
- `[WifiSync]` - Sync operations
- `[API]` - API endpoint activity
- `[HEARTBEAT]` - Client heartbeat activity

## Security Considerations

- Session tokens are unique per device session
- MAC addresses are verified against ARP table
- Only authorized machines can update device records
- RLS policies enforce vendor isolation
- Heartbeats require valid session tokens

## Performance

- Sync interval: 30 seconds (configurable)
- Heartbeat interval: 30 seconds (configurable)
- Retry queue: Max 10 retries per item
- Database indexes on critical fields for fast lookups
