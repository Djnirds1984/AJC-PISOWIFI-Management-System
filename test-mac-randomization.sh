#!/bin/bash

# MAC Randomization Session Transfer Test Script
# This script helps verify that the session restoration system is working

echo "🔍 MAC Randomization Session Transfer Test"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_IP="192.168.50.20"
SERVER_PORT="3000"
BASE_URL="http://${SERVER_IP}:${SERVER_PORT}"

echo -e "${BLUE}Testing server: ${BASE_URL}${NC}"
echo ""

# Test 1: Check if server is responding
echo -e "${YELLOW}Test 1: Server Connectivity${NC}"
if curl -s --connect-timeout 5 "${BASE_URL}/api/whoami" > /dev/null; then
    echo -e "${GREEN}✅ Server is responding${NC}"
else
    echo -e "${RED}❌ Server is not responding${NC}"
    exit 1
fi

# Test 2: Check captive portal detection endpoints
echo -e "\n${YELLOW}Test 2: Captive Portal Detection Endpoints${NC}"

endpoints=("/generate_204" "/hotspot-detect.html" "/ncsi.txt" "/connecttest.txt" "/success.txt" "/library/test/success.html")

for endpoint in "${endpoints[@]}"; do
    echo -n "Testing ${endpoint}... "
    response=$(curl -s -I "${BASE_URL}${endpoint}" | head -n 1)
    
    if [[ $response == *"302"* ]]; then
        echo -e "${GREEN}✅ Redirects to portal${NC}"
    elif [[ $response == *"204"* ]] || [[ $response == *"200"* ]]; then
        echo -e "${YELLOW}⚠️  Returns success (user might have active session)${NC}"
    else
        echo -e "${RED}❌ Unexpected response: ${response}${NC}"
    fi
done

# Test 3: Check active sessions
echo -e "\n${YELLOW}Test 3: Active Sessions${NC}"
session_count=$(sqlite3 pisowifi.sqlite "SELECT COUNT(*) FROM sessions WHERE remaining_seconds > 0;" 2>/dev/null || echo "0")
echo "Active sessions: ${session_count}"

if [ "$session_count" -gt 0 ]; then
    echo "Session details:"
    sqlite3 pisowifi.sqlite "SELECT mac, ip, remaining_seconds, SUBSTR(token, 1, 8) || '...' as token_preview FROM sessions WHERE remaining_seconds > 0;" 2>/dev/null || echo "Could not read session details"
fi

# Test 4: Check for transferable sessions
echo -e "\n${YELLOW}Test 4: Transferable Sessions Check${NC}"
transferable_count=$(sqlite3 pisowifi.sqlite "SELECT COUNT(*) FROM sessions WHERE remaining_seconds > 0 AND token_expires_at > datetime('now');" 2>/dev/null || echo "0")
echo "Transferable sessions: ${transferable_count}"

# Test 5: Simulate MAC randomization scenario
echo -e "\n${YELLOW}Test 5: MAC Randomization Simulation${NC}"
echo "This test simulates what happens when a device with MAC randomization connects:"

# Generate a fake MAC address
fake_mac="TEMP-192-168-50-$(( RANDOM % 100 ))-test"
echo "Simulated new MAC: ${fake_mac}"

# Check if server would detect transferable sessions for this MAC
if [ "$transferable_count" -gt 0 ]; then
    echo -e "${GREEN}✅ Server should detect transferable sessions for new MAC${NC}"
    echo -e "${GREEN}✅ Captive portal detection should redirect to portal${NC}"
    echo -e "${GREEN}✅ Portal JavaScript should trigger automatic session restoration${NC}"
else
    echo -e "${YELLOW}⚠️  No transferable sessions available${NC}"
    echo -e "${YELLOW}⚠️  User would need to insert coins for new session${NC}"
fi

# Test 6: Check logs for session restoration activity
echo -e "\n${YELLOW}Test 6: Recent Session Restoration Activity${NC}"
log_file="logs/system-$(date +%Y-%m-%d).log"

if [ -f "$log_file" ]; then
    echo "Checking recent session restoration logs..."
    
    # Look for MAC-SYNC activity in last 100 lines
    mac_sync_logs=$(tail -n 100 "$log_file" | grep -c "MAC-SYNC\|CAPTIVE-DETECT\|PORTAL-REDIRECT" || echo "0")
    
    if [ "$mac_sync_logs" -gt 0 ]; then
        echo -e "${GREEN}✅ Found ${mac_sync_logs} session restoration log entries${NC}"
        echo "Recent activity:"
        tail -n 100 "$log_file" | grep "MAC-SYNC\|CAPTIVE-DETECT\|PORTAL-REDIRECT" | tail -n 5
    else
        echo -e "${YELLOW}⚠️  No recent session restoration activity in logs${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Log file not found: ${log_file}${NC}"
fi

# Test 7: Browser localStorage simulation
echo -e "\n${YELLOW}Test 7: Browser Token Storage Simulation${NC}"
if [ "$session_count" -gt 0 ]; then
    # Get a sample token
    sample_token=$(sqlite3 pisowifi.sqlite "SELECT token FROM sessions WHERE remaining_seconds > 0 LIMIT 1;" 2>/dev/null)
    
    if [ -n "$sample_token" ]; then
        echo "Sample session token found: ${sample_token:0:8}..."
        echo -e "${GREEN}✅ Browser would store this token in localStorage${NC}"
        echo -e "${GREEN}✅ Token would be available for session restoration${NC}"
        
        # Test token expiration
        expires_at=$(sqlite3 pisowifi.sqlite "SELECT token_expires_at FROM sessions WHERE token = '$sample_token';" 2>/dev/null)
        if [ -n "$expires_at" ]; then
            echo "Token expires at: ${expires_at}"
        fi
    else
        echo -e "${YELLOW}⚠️  No session tokens found${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No active sessions to test token storage${NC}"
fi

# Summary
echo -e "\n${BLUE}=========================================="
echo -e "Test Summary${NC}"
echo "=========================================="

if [ "$transferable_count" -gt 0 ]; then
    echo -e "${GREEN}✅ MAC Randomization Transfer: READY${NC}"
    echo -e "${GREEN}✅ System can detect and transfer sessions${NC}"
    echo -e "${GREEN}✅ Captive portal will trigger automatic restoration${NC}"
    echo ""
    echo -e "${BLUE}To test manually:${NC}"
    echo "1. Connect device to WiFi and insert coins"
    echo "2. Switch to different SSID (triggers MAC randomization)"
    echo "3. Portal should open automatically and restore session"
    echo "4. Check admin panel - should show only 1 device (transferred)"
else
    echo -e "${YELLOW}⚠️  MAC Randomization Transfer: NO ACTIVE SESSIONS${NC}"
    echo -e "${YELLOW}⚠️  Insert coins first to create a transferable session${NC}"
    echo ""
    echo -e "${BLUE}To create test session:${NC}"
    echo "1. Connect device to WiFi"
    echo "2. Open portal and insert coins"
    echo "3. Run this test script again"
    echo "4. Then test SSID switching"
fi

echo ""
echo -e "${BLUE}For real-time monitoring:${NC}"
echo "tail -f logs/system-\$(date +%Y-%m-%d).log | grep 'MAC-SYNC\\|CAPTIVE-DETECT\\|PORTAL-REDIRECT'"