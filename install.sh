#!/bin/bash

# AJC PISOWIFI - Automated Installation Script
# Supports Raspberry Pi and Orange Pi (Debian/Ubuntu based)
# Uses PM2 for process management and auto-reboot persistence

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}   AJC PISOWIFI SYSTEM INSTALLER v2.6.0      ${NC}"
echo -e "${BLUE}==============================================${NC}"

# Check for root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

echo -e "${GREEN}[1/6] Updating system repositories...${NC}"
apt-get update

echo -e "${GREEN}[2/6] Installing system dependencies...${NC}"
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

echo -e "${GREEN}[3/6] Installing PM2 Globally...${NC}"
npm install -g pm2

echo -e "${GREEN}[4/6] Cloning AJC PISOWIFI Repository...${NC}"
INSTALL_DIR="/opt/ajc-pisowifi"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}Target directory exists. Backing up...${NC}"
    mv "$INSTALL_DIR" "${INSTALL_DIR}_backup_$(date +%s)"
fi

git clone https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo -e "${GREEN}[5/6] Installing application dependencies...${NC}"
npm install --production

echo -e "${GREEN}[6/6] Configuring PM2 Startup & Persistence...${NC}"

# Start the application with PM2
pm2 start server.js --name "ajc-pisowifi"

# Save the current PM2 process list
pm2 save

# Setup PM2 to run on reboot
# This command detects the init system and executes the necessary setup
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root | grep "sudo env")
if [ -n "$PM2_STARTUP" ]; then
    echo -e "${BLUE}Executing PM2 startup command...${NC}"
    eval "$PM2_STARTUP"
fi

# Double check save
pm2 save

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN} INSTALLATION COMPLETE! ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Portal Address: http://$(hostname -I | awk '{print $1}'):3000"
echo -e "Process Manager: pm2 status"
echo -e "Monitor Logs: pm2 logs ajc-pisowifi"
echo -e "System will now auto-start on every reboot via PM2."
echo -e "${BLUE}==============================================${NC}"
