# AJC PISOWIFI Management System

A high-performance, enterprise-grade PisoWiFi management system built with Node.js, Socket.io, and SQLite. Designed for Raspberry Pi and Orange Pi hardware with real-time GPIO pulse detection and advanced Linux networking integration.

## 🚀 Features

- **Real-time Coin Detection**: Supports multi-coin slots via Physical Pin 3 (configurable).
- **Advanced Networking**: WAN/WLAN configuration, Bridge (brctl) management, VLAN (802.1Q) support, and Hotspot control.
- **Captive Portal**: Mobile-first landing page with real-time credit updates via WebSockets.
- **Admin Dashboard**: Analytics, pricing management, and terminal-style system updater.
- **Hardware Abstraction**: Native support for Raspberry Pi (`onoff`) and Orange Pi systems.

## 🛠 Hardware Requirements

- **SBC**: Raspberry Pi (All models) or Orange Pi (All models).
- **Coin Slot**: Standard multi-coin slot (e.g., CH-926).
- **OS**: Debian-based Linux (Raspberry Pi OS / Armbian).

## 📥 Installation

### Automated Install (Recommended)

Run this command in your terminal to install all dependencies and the AJC PISOWIFI system:

```bash
curl -sSL https://raw.githubusercontent.com/Djnirds1984/AJC-PISOWIFI-Management-System/main/install.sh | sudo bash
```

### Manual Installation

1. **Update System & Install Dependencies**:
   ```bash
   sudo apt update
   sudo apt install -y git nodejs npm sqlite3 iptables bridge-utils hostapd dnsmasq build-essential
   ```

2. **Clone the Repository**:
   ```bash
   git clone https://github.com/Djnirds1984/AJC-PISOWIFI-Management-System.git
   cd AJC-PISOWIFI-Management-System
   ```

3. **Install Node Modules**:
   ```bash
   npm install
   ```

4. **Start the System**:
   ```bash
   sudo node server.js
   ```

5. **Setup Process Manager (PM2)**:
   For production environments, use PM2 to keep the system running in the background and automatically restart on boot.

   **Install PM2 Globally:**
   ```bash
   sudo npm install -g pm2
   ```

   **Start the Application:**
   ```bash
   # Ensure you are in the project directory
   sudo pm2 start server.js --name "ajc-pisowifi"
   ```

   **Enable Startup Script:**
   Generate and run the startup script to ensure the system boots automatically:
   ```bash
   sudo pm2 startup
   # Run the command displayed by the output of the previous line
   sudo pm2 save
   ```

   **Basic Management Commands:**
   ```bash
   sudo pm2 status       # Check system status
   sudo pm2 restart all  # Restart the system
   sudo pm2 logs         # View real-time logs
   ```

## 🔧 Troubleshooting

### Common Errors

**Error: `Cannot find module 'express'`**
This indicates that the project dependencies are not installed.
1. Navigate to the project directory: `cd /opt/ajc-pisowifi` (or your install path)
2. Install dependencies: `npm install`
3. Restart the system: `sudo pm2 restart ajc-pisowifi`

**Error: `EADDRINUSE: address already in use`**
Another process is using port 80.
1. Find the process: `sudo lsof -i :80`
2. Kill it: `sudo kill -9 <PID>`
3. Restart: `sudo pm2 restart ajc-pisowifi`

## ⚙️ Configuration

- **Default Port**: 80 (Standard HTTP)
- **Admin Login**: Click the "ADMIN LOGIN" button in the bottom right of the portal.
- **GPIO**: Configure the board type and pin number via the "System Configuration" gear icon in the portal (Simulation mode available).

## 🛡 Security & Networking

The system uses `iptables` for the captive portal redirection. Ensure your kernel has `xt_mac` and `xt_set` modules enabled if using advanced filtering.

---
© 2025 AJC PISOWIFI • Developed for robust public internet delivery.