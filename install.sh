#!/bin/bash

# AJC PISOWIFI - Automated Installation Script
# Supports Raspberry Pi and Orange Pi (Debian/Ubuntu based)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}   AJC PISOWIFI SYSTEM INSTALLER v2.5.0      ${NC}"
echo -e "${BLUE}==============================================${NC}"

# Check for root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

echo -e "${GREEN}[1/5] Updating system repositories...${NC}"
apt-get update

echo -e "${GREEN}[2/5] Installing system dependencies...${NC}"
apt-get install -y \
    git \
    curl \
    sqlite3 \
    iptables \
    bridge-utils \
    hostapd \
    dnsmasq \
    build-essential \
    python3 \
    pkg-config

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${BLUE}Node.js not found. Installing Node.js LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    echo -e "${BLUE}Node.js $(node -v) is already installed.${NC}"
fi

echo -e "${GREEN}[3/5] Cloning AJC PISOWIFI Repository...${NC}"
INSTALL_DIR="/opt/ajc-pisowifi"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}Target directory exists. Backing up...${NC}"
    mv "$INSTALL_DIR" "${INSTALL_DIR}_backup_$(date +%s)"
fi

git clone https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo -e "${GREEN}[4/5] Installing application dependencies...${NC}"
npm install --production

echo -e "${GREEN}[5/5] Configuring system services...${NC}"

# Create Systemd Service
cat <<EOF > /etc/systemd/system/pisowifi.service
[Unit]
Description=AJC PISOWIFI Management System
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pisowifi
systemctl start pisowifi

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN} INSTALLATION COMPLETE! ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Portal Address: http://$(hostname -I | awk '{print $1}'):3000"
echo -e "Service Status: sudo systemctl status pisowifi"
echo -e "Admin Login: Accessible via the Portal UI"
echo -e "${BLUE}==============================================${NC}"
