#!/bin/bash

# AJC PisoWiFi Voucher System Setup
# Compatible with MAC Sync - Stable Version

echo "🎫 Setting up AJC PisoWiFi Voucher System..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Please run this script from your AJC PisoWiFi directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Running database migration...${NC}"

# Run the migration
if node run-voucher-migration.js; then
    echo -e "${GREEN}✅ Database migration completed${NC}"
else
    echo -e "${RED}❌ Database migration failed${NC}"
    exit 1
fi

echo -e "${YELLOW}🔄 Restarting services...${NC}"

# Restart the service
if systemctl is-active --quiet ajc-pisowifi; then
    echo "Restarting systemd service..."
    systemctl restart ajc-pisowifi
    sleep 3
    
    if systemctl is-active --quiet ajc-pisowifi; then
        echo -e "${GREEN}✅ Service restarted successfully${NC}"
    else
        echo -e "${RED}❌ Service restart failed${NC}"
        systemctl status ajc-pisowifi --no-pager -l
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Service not running with systemd, please restart manually${NC}"
fi

echo -e "${YELLOW}🧪 Testing voucher system...${NC}"

# Test the API endpoints
if curl -s http://localhost:3000/api/admin/vouchers > /dev/null; then
    echo -e "${GREEN}✅ Voucher API is responding${NC}"
else
    echo -e "${RED}❌ Voucher API not responding${NC}"
fi

echo -e "${GREEN}🎉 Voucher system setup complete!${NC}"
echo ""
echo -e "${YELLOW}📝 What's been added:${NC}"
echo "  • Voucher database tables (vouchers, voucher_usage_logs)"
echo "  • Admin API endpoints for voucher management"
echo "  • Public voucher activation endpoint"
echo "  • MAC Sync compatibility maintained"
echo "  • Sample test vouchers created"
echo ""
echo -e "${YELLOW}🌍 Access your admin panel:${NC}"
echo "  http://$(hostname -I | awk '{print $1}') → Admin Login → Vouchers"
echo ""
echo -e "${YELLOW}💡 Features:${NC}"
echo "  • Create time-based vouchers with pricing"
echo "  • Voucher codes work with MAC sync"
echo "  • Session binding and transfer support"
echo "  • Usage logging and analytics"
echo ""
echo -e "${GREEN}✅ Your stable PisoWiFi system now has voucher support!${NC}"