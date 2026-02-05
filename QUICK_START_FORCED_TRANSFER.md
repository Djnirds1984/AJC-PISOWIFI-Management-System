# Quick Start: Forced Session Transfer

## Deploy in 30 Seconds

```bash
# 1. Verify syntax (should return nothing)
node -c server.js

# 2. Rebuild frontend
npm run build

# 3. Restart service
sudo systemctl restart ajc-pisowifi

# 4. Wait for startup
sleep 3

# 5. Test
curl http://localhost:3000/api/whoami
```

## Test in 2 Minutes

1. **Connect device to WiFi**
2. **Open portal and insert coins** → Get internet
3. **Switch to different SSID** → Triggers MAC randomization
4. **Expected**: 
   - Portal opens automatically
   - Session transfers IMMEDIATELY
   - Internet works right away
   - Admin panel shows 1 device (not 2)

## Monitor in Real-Time

```bash
# Watch forced transfer happening
tail -f logs/system-$(date +%Y-%m-%d).log | grep "FORCING"

# You should see:
# [PORTAL-REDIRECT] FORCING automatic session restoration
# [PORTAL-REDIRECT] FORCING session transfer: OLD_MAC -> NEW_MAC
# [PORTAL-REDIRECT] ✅ SESSION FORCED TRANSFER COMPLETE
```

## What Changed

**Before**: Server detected session but browser had to restore it (unreliable)
**After**: Server FORCES session transfer immediately (guaranteed)

## Key Points

✅ **Forced Transfer**: Server transfers session immediately, no waiting
✅ **No JavaScript Needed**: Works even if browser JavaScript fails
✅ **Instant Internet**: User gets internet immediately after SSID switch
✅ **One Device**: Admin panel shows 1 device (transferred), not 2
✅ **Safe**: Voucher sessions still device-specific, coin sessions transfer

## Verify It's Working

### Check Logs
```bash
grep "SESSION FORCED TRANSFER COMPLETE" logs/system-$(date +%Y-%m-%d).log
```

### Check Database
```bash
sqlite3 pisowifi.sqlite "SELECT mac, remaining_seconds FROM sessions WHERE remaining_seconds > 0;"
# Should show new MAC with same remaining time
```

### Check Admin Panel
- Go to Devices page
- Should show only 1 device (not 2)
- Device should have new MAC address

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Service won't start | `node -c server.js` to check syntax |
| Forced transfer not happening | Check logs: `grep FORCING logs/system-*.log` |
| Two devices showing | Session transfer didn't complete, check logs |
| No internet after transfer | Network rules not applied, check `[MAC-SYNC]` logs |

## Success Criteria

✅ When you switch SSIDs:
1. Portal opens automatically
2. Logs show: `[PORTAL-REDIRECT] FORCING session transfer`
3. Logs show: `✅ SESSION FORCED TRANSFER COMPLETE`
4. Admin panel shows 1 device (not 2)
5. Internet works immediately

## That's It!

The forced session transfer is now active. Users can switch SSIDs with MAC randomization and their session will transfer automatically and instantly.