#!/bin/bash

# AJC PISOWIFI - Automated Installation Script v3.0.0
# Hardware Support: Raspberry Pi, Orange Pi, x86_64 (via NodeMCU/Serial)
# Process Manager: PM2
# Node.js: v20 LTS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}   AJC PISOWIFI SYSTEM INSTALLER v3.0.0      ${NC}"
echo -e "${BLUE}==============================================${NC}"

# Check for root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

echo -e "${GREEN}[1/7] Detecting Hardware Architecture...${NC}"
ARCH=$(uname -m)
BOARD="unknown"

if grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    BOARD="raspberry_pi"
    echo -e "${YELLOW}Detected: Raspberry Pi (${ARCH})${NC}"
elif [ -f /etc/armbian-release ] || grep -q "Orange Pi" /proc/cpuinfo 2>/dev/null; then
    BOARD="orange_pi"
    echo -e "${YELLOW}Detected: Orange Pi / Armbian (${ARCH})${NC}"
elif [[ "$ARCH" == "x86_64" ]]; then
    BOARD="x64_pc"
    echo -e "${YELLOW}Detected: x86_64 PC (Ubuntu/Debian)${NC}"
    echo -e "${BLUE}Configuring for NodeMCU 8266 Serial-to-GPIO Bridge...${NC}"
else
    echo -e "${RED}Unknown hardware: ${ARCH}. Proceeding with generic installation.${NC}"
fi

echo -e "${GREEN}[2/7] Updating system repositories...${NC}"
apt-get update

echo -e "${GREEN}[3/7] Installing core dependencies...${NC}"
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
    pkg-config \
    libcap2-bin \
    net-tools

# Install Board-Specific Packages
case $BOARD in
    "raspberry_pi")
        echo -e "${BLUE}Installing RPi GPIO headers...${NC}"
        apt-get install -y raspberrypi-kernel-headers
        ;;
    "orange_pi")
        echo -e "${BLUE}Installing Orange Pi GPIO tools...${NC}"
        # Often provided by armbian-config or generic sysfs, but ensure build-essential is there for 'onoff'
        ;;
    "x64_pc")
        echo -e "${BLUE}Installing Serial communication tools for NodeMCU...${NC}"
        apt-get install -y setserial
        # Add current user to dialout group to access /dev/ttyUSB0
        usermod -a -G dialout root
        ;;
esac

echo -e "${GREEN}[4/7] Installing Node.js v20 (LTS)...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1) != "v20" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${BLUE}Node.js $(node -v) is already installed.${NC}"
fi

echo -e "${GREEN}[5/7] Installing PM2 & Board Drivers...${NC}"
npm install -g pm2

echo -e "${GREEN}[6/7] Deploying AJC PISOWIFI Application...${NC}"
INSTALL_DIR="/opt/ajc-pisowifi"
if [ -d "$INSTALL_DIR" ]; then
    echo -e "${BLUE}Target directory exists. Backing up...${NC}"
    mv "$INSTALL_DIR" "${INSTALL_DIR}_backup_$(date +%s)"
fi

git clone https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Install dependencies based on hardware
if [[ "$BOARD" == "x64_pc" ]]; then
    echo -e "${BLUE}Installing 'serialport' for NodeMCU bridge...${NC}"
    npm install serialport --production
fi
npm install --production

echo -e "${GREEN}[7/7] Finalizing System Persistence (PM2)...${NC}"

# Start app
pm2 start server.js --name "ajc-pisowifi"
pm2 save

# Setup startup
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root | grep "sudo env")
if [ -n "$PM2_STARTUP" ]; then
    eval "$PM2_STARTUP"
fi
pm2 save

# Set capabilities for node to manage network without full sudo if needed (optional security)
setcap 'cap_net_admin,cap_net_raw+ep' $(eval readlink -f `which node`)

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN} INSTALLATION COMPLETE! ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Hardware Profile: ${BOARD}"
echo -e "Portal URL: http://$(hostname -I | awk '{print $1}'):3000"
echo -e "PM2 Status: pm2 status"
echo -e "Logs: pm2 logs ajc-pisowifi"
echo -e "${BLUE}==============================================${NC}"
