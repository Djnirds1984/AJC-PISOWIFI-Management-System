#!/bin/bash

# AJC PISOWIFI - Automated Installation Script v3.2.0
# Fixes: Node v20 require error, npm install reliability
# Hardware Support: Raspberry Pi, Orange Pi, x86_64
# Process Manager: PM2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}   AJC PISOWIFI SYSTEM INSTALLER v3.2.0      ${NC}"
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
    net-tools \
    python-is-python3

# Install Board-Specific Packages
case $BOARD in
    "raspberry_pi")
        apt-get install -y raspberrypi-kernel-headers || echo "Skipping RPi headers..."
        ;;
    "x64_pc")
        apt-get install -y setserial
        usermod -a -G dialout root || true
        ;;
esac

echo -e "${GREEN}[4/7] Installing Node.js v20 (LTS)...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'.' -f1) != "v20" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${BLUE}Node.js $(node -v) is already installed.${NC}"
fi

echo -e "${GREEN}[5/7] Installing PM2...${NC}"
npm install -g pm2

echo -e "${GREEN}[6/7] Deploying AJC PISOWIFI Application...${NC}"
INSTALL_DIR="/opt/ajc-pisowifi"

if [ ! -d "$INSTALL_DIR" ]; then
    git clone https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Ensure we are on a clean state for npm install
echo -e "${BLUE}Cleaning up previous build artifacts...${NC}"
rm -rf node_modules package-lock.json

# Low-memory optimization: Add temporary swap if RAM < 1GB
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
if [ "$TOTAL_MEM" -lt 1000 ]; then
    echo -e "${YELLOW}Low memory detected (${TOTAL_MEM}MB). Creating temporary swap...${NC}"
    fallocate -l 1G /tmp/swapfile || dd if=/dev/zero of=/tmp/swapfile bs=1M count=1024
    chmod 600 /tmp/swapfile
    mkswap /tmp/swapfile
    swapon /tmp/swapfile
fi

echo -e "${GREEN}Executing 'npm install'...${NC}"
# Use --unsafe-perm for native module builds (sqlite3, onoff) when running as root
# Set production to keep footprint small
npm install --production --unsafe-perm --no-audit --no-fund

# Special handling for SerialPort on x64
if [[ "$BOARD" == "x64_pc" ]]; then
    echo -e "${BLUE}Adding SerialPort for x64 Bridge...${NC}"
    npm install serialport --production --unsafe-perm
fi

# Remove temporary swap
if [ -f /tmp/swapfile ]; then
    swapoff /tmp/swapfile
    rm /tmp/swapfile
fi

echo -e "${GREEN}[7/7] Finalizing System Persistence...${NC}"

# Start app with PM2
pm2 delete ajc-pisowifi 2>/dev/null || true
pm2 start server.js --name "ajc-pisowifi"
pm2 save

# Setup startup
PM2_STARTUP=$(pm2 startup systemd -u root --hp /root | grep "sudo env")
if [ -n "$PM2_STARTUP" ]; then
    eval "$PM2_STARTUP"
fi
pm2 save

# Set capabilities for node to manage network
setcap 'cap_net_admin,cap_net_raw+ep' $(eval readlink -f $(which node))

echo -e "${BLUE}==============================================${NC}"
echo -e "${GREEN} INSTALLATION COMPLETE! ${NC}"
echo -e "${BLUE}==============================================${NC}"
echo -e "Node Version:     $(node -v)"
echo -e "Board Detected:   ${BOARD}"
echo -e "Portal URL:       http://$(hostname -I | awk '{print $1}'):3000"
echo -e "Check Logs:       pm2 logs ajc-pisowifi"
echo -e "${BLUE}==============================================${NC}"
