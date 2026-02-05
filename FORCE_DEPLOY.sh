#!/bin/bash

# FORCE Deploy MAC Randomization Session Transfer Fix
# This script deploys the forced session transfer implementation

echo "🚀 FORCE Deploying MAC Randomization Session Transfer Fix"
echo "=========================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Step 1: Verify syntax
echo -e "${YELLOW}Step 1: Verifying JavaScript syntax...${NC}"
if node -c server.js; then
    echo -e "${GREEN}✅ Syntax valid${NC}"
else
    echo -e "${RED}❌ Syntax error - aborting deployment${NC}"
    exit 1
fi

# Step 2: Stop service
echo -e "\n${YELLOW}Step 2: Stopping AJC PisoWiFi service...${NC}"
sudo systemctl stop ajc-pisowifi
sleep 2
echo -e "${GREEN}✅ Service stopped${NC}"

# Step 3: Verify files
echo -e "\n${YELLOW}Step 3: Verifying updated files...${NC}"
if grep -q "FORCING session transfer" server.js; then
    echo -e "${GREEN}✅ server.js has forced transfer code${NC}"
else
    echo -e "${RED}❌ server.js not updated properly${NC}"
    exit 1
fi

# Step 4: Start service
echo -e "\n${YELLOW}Step 4: Starting AJC PisoWiFi service...${NC}"
sudo systemctl start ajc-pisowifi
sleep 3

# Step 5: Verify startup
echo -e "\n${YELLOW}Step 5: Verifying service startup...${NC}"
if systemctl is-active --quiet ajc-pisowifi; then
    echo -e "${GREEN}✅ Service started successfully${NC}"
else
    echo -e "${RED}❌ Service failed to start${NC}"
    echo -e "${BLUE}Checking logs:${NC}"
    sudo journalctl -u ajc-pisowifi -n 20 --no-pager
    exit 1
fi

# Step 6: Test server
echo -e "\n${YELLOW}Step 6: Testing server response...${NC}"
sleep 2
if curl -s --connect-timeout 5 "http://localhost:3000/api/whoami" > /dev/null; then
    echo -e "${GREEN}✅ Server is responding${NC}"
else
    echo -e "${RED}❌ Server not responding${NC}"
    exit 1
fi

# Step 7: Show status
echo -e "\n${BLUE}=========================================================="
echo -e "Deployment Complete!${NC}"
echo "=========================================================="

echo -e "\n${GREEN}✅ FORCED Session Transfer is now ACTIVE${NC}"

echo -e "\n${BLUE}What Changed:${NC}"
echo "- Server now FORCES session transfer immediately"
echo "- No waiting for browser JavaScript"
echo "- Session transfers on first portal visit"
echo "- Network rules applied automatically"

echo -e "\n${BLUE}To Test:${NC}"
echo "1. Connect device and insert coins"
echo "2. Switch to different SSID (MAC randomization)"
echo "3. Portal opens automatically"
echo "4. Session transfers IMMEDIATELY"
echo "5. Internet works right away"

echo -e "\n${BLUE}To Monitor:${NC}"
echo "tail -f logs/system-\$(date +%Y-%m-%d).log | grep 'FORCING\\|SESSION FORCED'"

echo -e "\n${BLUE}Expected Log Output:${NC}"
echo "[PORTAL-REDIRECT] FORCING automatic session restoration"
echo "[PORTAL-REDIRECT] FORCING session transfer: OLD_MAC -> NEW_MAC"
echo "[PORTAL-REDIRECT] ✅ SESSION FORCED TRANSFER COMPLETE"

echo -e "\n${GREEN}🎉 Ready to test MAC randomization session transfer!${NC}"