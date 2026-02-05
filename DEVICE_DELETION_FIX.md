# Device Deletion Fix

## Problem
When devices were deleted from the admin panel, they would reappear after device scanning because multiple scanning processes were re-inserting them into the database:

1. **Client Scanner** (every 10 seconds) - Automatically detects new clients for session transfer
2. **Device Scan Endpoint** - Manual scan triggered from admin panel  
3. **Network Library** - When devices get whitelisted during authentication

## Solution
Implemented a soft-delete system using an `is_deleted` flag instead of hard deletion:

### Database Changes
- Added `is_deleted INTEGER DEFAULT 0` column to `wifi_devices` table
- Migration automatically adds the column to existing installations

### Device Deletion Process
1. **Soft Delete**: Mark device as `is_deleted = 1` instead of removing from database
2. **Disconnect**: Automatically disconnect the device if currently connected
3. **Prevent Re-insertion**: All scanning processes now check for deleted devices before inserting

### Modified Insertion Points
All three device insertion points now check for deleted devices:

1. **Client Scanner** (`server.js` line ~1515)
   ```javascript
   const deletedDevice = await db.get('SELECT id FROM wifi_devices WHERE mac = ? AND is_deleted = 1', [mac]);
   if (deletedDevice) {
     console.log(`[CLIENT-SCAN] Skipping re-insertion of deleted device: ${mac}`);
     return;
   }
   ```

2. **Device Scan Endpoint** (`server.js` line ~4368)
   ```javascript
   const deletedDevice = await db.get('SELECT id FROM wifi_devices WHERE mac = ? AND is_deleted = 1', [device.mac]);
   if (deletedDevice) {
     console.log(`[DEVICE-SCAN] Skipping re-insertion of deleted device: ${device.mac}`);
     continue;
   }
   ```

3. **Network Library** (`lib/network.js` line ~462)
   ```javascript
   const deletedDevice = await db.get('SELECT id FROM wifi_devices WHERE mac = ? AND is_deleted = 1', [mac]);
   if (deletedDevice) {
     console.log(`[QoS] Skipping re-insertion of deleted device: ${mac}`);
     return;
   }
   ```

### Device Listing Changes
All device queries now exclude deleted devices:
```javascript
// Before
SELECT * FROM wifi_devices ORDER BY connected_at DESC

// After  
SELECT * FROM wifi_devices WHERE is_deleted = 0 ORDER BY connected_at DESC
```

### Admin Panel Features
1. **Permanent Deletion**: Confirmation dialog warns that devices won't reappear in scans
2. **Deleted Devices View**: Toggle button to view deleted devices list
3. **Device Restoration**: Restore deleted devices if needed
4. **Smart Creation**: Creating a device with same MAC as deleted device restores it

### New API Endpoints
- `GET /api/devices/deleted` - List deleted devices
- `POST /api/devices/:id/restore` - Restore a deleted device

## Benefits
- **Permanent Deletion**: Deleted devices stay deleted and won't reappear
- **Performance**: No impact on scanning performance
- **Reversible**: Deleted devices can be restored if needed
- **Backward Compatible**: Existing devices continue to work normally
- **Audit Trail**: Deleted devices remain in database for troubleshooting

## Usage
1. Delete device from admin panel - it will be permanently removed from active list
2. Device will not reappear in future scans
3. View deleted devices using "Deleted" button in device manager
4. Restore devices if needed using "Restore" button
5. Creating new device with same MAC will restore deleted device

This fix ensures that when users delete devices, they stay deleted and don't get re-added by the automatic scanning processes.