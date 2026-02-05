# MAC Randomization Fix - Deployment Checklist

## Pre-Deployment Verification

- [ ] **Syntax Check**: `node -c server.js` (should return no errors)
- [ ] **Build Complete**: `npm run build` (should complete successfully)
- [ ] **No Uncommitted Changes**: `git status` (should be clean)

## Deployment Steps

### Step 1: Stop Current Service
```bash
sudo systemctl stop ajc-pisowifi
sleep 2
```

### Step 2: Verify Files Are Updated
```bash
# Check that server.js has the new code
grep "X-AJC-Session-Token" server.js

# Check that frontend is built
ls -la dist/index.html
```

### Step 3: Start Service
```bash
sudo systemctl start ajc-pisowifi
sleep 3
```

### Step 4: Verify Service Started
```bash
systemctl status ajc-pisowifi

# Should show: Active: active (running)
```

### Step 5: Test Server Response
```bash
curl http://localhost:3000/api/whoami

# Should return JSON with device info
```

## Post-Deployment Testing

### Test 1: Check Logs for Errors
```bash
# Check for any startup errors
sudo journalctl -u ajc-pisowifi -n 20 --no-pager

# Should show: Started AJC PisoWiFi Management System
```

### Test 2: Verify Session Detection
```bash
# Insert coins to create a session
# Then check logs for transferable session detection

tail -f logs/system-$(date +%Y-%m-%d).log | grep "CAPTIVE-DETECT\|PORTAL-REDIRECT"

# Should show: Found 1 transferable sessions
```

### Test 3: Manual MAC Randomization Test
1. **Connect device to WiFi**
2. **Open portal and insert coins** → Get internet access
3. **Switch to different SSID** → Triggers MAC randomization
4. **Expected Results**:
   - Portal opens automatically
   - Session restores within 5 seconds
   - Browser console shows: `[Portal] Saving server-provided token to localStorage`
   - Admin panel shows only 1 device (not 2)
   - Internet works immediately

### Test 4: Check Database State
```bash
# After switching SSIDs, check sessions table
sqlite3 pisowifi.sqlite "SELECT mac, ip, remaining_seconds FROM sessions WHERE remaining_seconds > 0;"

# Should show:
# - Only 1 session (not 2)
# - New MAC address (from second SSID)
# - Same remaining_seconds (transferred)
```

## Rollback Plan (If Issues Occur)

### If Service Won't Start
```bash
# Check what went wrong
sudo journalctl -u ajc-pisowifi -n 50 --no-pager

# Rollback to previous version
git checkout server.js
git checkout components/Portal/LandingPage.tsx
npm run build
sudo systemctl restart ajc-pisowifi
```

### If Session Restoration Not Working
```bash
# Check browser console (F12) for errors
# Check server logs for MAC-SYNC errors
tail -f logs/system-$(date +%Y-%m-%d).log | grep "MAC-SYNC\|Session"

# Verify token is being passed
curl -I http://localhost:3000/ | grep "X-AJC-Session"
```

## Success Criteria

✅ **Deployment is successful when:**

1. **Service Status**
   - Service is running: `systemctl is-active ajc-pisowifi` returns `active`
   - No errors in logs: `journalctl -u ajc-pisowifi` shows no errors

2. **Session Detection**
   - Logs show: `[CAPTIVE-DETECT] New MAC ... with transferable sessions`
   - Server passes token: `curl -I http://localhost:3000/` shows `X-AJC-Session-Token`

3. **Session Restoration**
   - Browser console shows: `[Portal] Saving server-provided token to localStorage`
   - Logs show: `[Session] Restore response: 200 OK`
   - Session migrated: `Session migrated to new network info`

4. **Admin Panel**
   - Only 1 device shown after SSID switch
   - Session transferred to new MAC
   - Remaining time preserved

5. **User Experience**
   - Portal opens automatically when switching SSIDs
   - Internet works immediately after session restore
   - No manual intervention needed

## Monitoring Commands

### Real-Time Session Restoration Monitoring
```bash
tail -f logs/system-$(date +%Y-%m-%d).log | grep -E "CAPTIVE-DETECT|PORTAL-REDIRECT|MAC-SYNC|Session"
```

### Check Active Sessions
```bash
sqlite3 pisowifi.sqlite "SELECT mac, ip, remaining_seconds, SUBSTR(token, 1, 8) || '...' FROM sessions WHERE remaining_seconds > 0;"
```

### Monitor Service Health
```bash
watch -n 1 'systemctl status ajc-pisowifi | head -10'
```

## Common Issues & Solutions

### Issue: Service won't start
**Solution**: Check syntax with `node -c server.js` and review logs

### Issue: Session not restoring
**Solution**: Check browser console (F12) for token errors, verify server headers with `curl -I`

### Issue: Two devices showing in admin panel
**Solution**: Session restoration not triggering, check logs for `[Session] Restore response`

### Issue: No internet after SSID switch
**Solution**: Session restored but network rules not applied, check `[MAC-SYNC]` logs

## Final Verification

After deployment, run this complete test:

```bash
#!/bin/bash
echo "🔍 MAC Randomization Fix Verification"
echo "======================================"

# 1. Check service
echo "1. Service Status:"
systemctl is-active ajc-pisowifi

# 2. Check syntax
echo "2. Syntax Check:"
node -c server.js && echo "✅ Valid" || echo "❌ Invalid"

# 3. Check server response
echo "3. Server Response:"
curl -s http://localhost:3000/api/whoami | head -c 50

# 4. Check for session detection code
echo "4. Session Detection Code:"
grep -c "X-AJC-Session-Token" server.js

# 5. Check logs for activity
echo "5. Recent Session Activity:"
tail -n 5 logs/system-$(date +%Y-%m-%d).log | grep "CAPTIVE-DETECT\|Session"

echo "======================================"
echo "✅ Deployment verification complete!"
```

## Support

If you encounter any issues:

1. **Check logs**: `tail -f logs/system-$(date +%Y-%m-%d).log`
2. **Check browser console**: F12 → Console tab
3. **Check database**: `sqlite3 pisowifi.sqlite "SELECT * FROM sessions;"`
4. **Restart service**: `sudo systemctl restart ajc-pisowifi`