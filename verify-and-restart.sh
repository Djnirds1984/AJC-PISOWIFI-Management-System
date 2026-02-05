#!/bin/bash

# Verify and Restart AJC PisoWiFi Service
# This script checks syntax and restarts the service safely

echo "🔧 AJC PisoWiFi Service Verification & Restart"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ server.js not found. Please run this script from the project directory.${NC}"
    exit 1
fi

# Step 1: Check Node.js syntax
echo -e "${YELLOW}Step 1: Checking JavaScript syntax...${NC}"
if node -c server.js; then
    echo -e "${GREEN}✅ Syntax check passed${NC}"
else
    echo -e "${RED}❌ Syntax error found. Please fix before restarting.${NC}"
    exit 1
fi

# Step 2: Check service status
echo -e "\n${YELLOW}Step 2: Checking current service status...${NC}"
if systemctl is-active --quiet ajc-pisowifi; then
    echo -e "${YELLOW}⚠️  Service is currently running${NC}"
    echo -e "${BLUE}Stopping service...${NC}"
    sudo systemctl stop ajc-pisowifi
    sleep 2
else
    echo -e "${YELLOW}⚠️  Service is not running${NC}"
fi

# Step 3: Start the service
echo -e "\n${YELLOW}Step 3: Starting AJC PisoWiFi service...${NC}"
sudo systemctl start ajc-pisowifi

# Wait a moment for startup
sleep 3

# Step 4: Check if service started successfully
echo -e "\n${YELLOW}Step 4: Verifying service startup...${NC}"
if systemctl is-active --quiet ajc-pisowifi; then
    echo -e "${GREEN}✅ Service started successfully${NC}"
    
    # Show service status
    echo -e "\n${BLUE}Service Status:${NC}"
    systemctl status ajc-pisowifi --no-pager -l
    
    # Test if server is responding
    echo -e "\n${YELLOW}Step 5: Testing server response...${NC}"
    sleep 2
    
    if curl -s --connect-timeout 5 "http://localhost:3000/api/whoami" > /dev/null; then
        echo -e "${GREEN}✅ Server is responding to requests${NC}"
        echo -e "${GREEN}✅ MAC Randomization fix is now active!${NC}"
        
        echo -e "\n${BLUE}🎉 SUCCESS! The system is ready to test MAC randomization session transfer.${NC}"
        echo -e "\n${BLUE}To test:${NC}"
        echo "1. Connect a device and insert coins"
        echo "2. Switch to different SSID (triggers MAC randomization)"
        echo "3. Portal should automatically restore session"
        echo "4. Check admin panel - should show only 1 device (transferred)"
        
        echo -e "\n${BLUE}To monitor in real-time:${NC}"
        echo "tail -f logs/system-\$(date +%Y-%m-%d).log | grep 'MAC-SYNC\\|CAPTIVE-DETECT\\|PORTAL-REDIRECT'"
        
    else
        echo -e "${YELLOW}⚠️  Service started but not responding yet (may need more time)${NC}"
        echo -e "${BLUE}Try: curl http://localhost:3000/api/whoami${NC}"
    fi
    
else
    echo -e "${RED}❌ Service failed to start${NC}"
    echo -e "\n${BLUE}Checking logs for errors:${NC}"
    sudo journalctl -u ajc-pisowifi --no-pager -l -n 20
    
    echo -e "\n${BLUE}Recent system logs:${NC}"
    if [ -f "logs/system-$(date +%Y-%m-%d).log" ]; then
        tail -n 10 "logs/system-$(date +%Y-%m-%d).log"
    else
        echo "No system log file found"
    fi
fi

echo -e "\n${BLUE}=============================================="
echo -e "Verification Complete${NC}"
echo "=============================================="