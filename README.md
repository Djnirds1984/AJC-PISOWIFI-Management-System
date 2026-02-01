# AJC PISOWIFI Management System

🚀 **Enterprise-Grade PisoWiFi Management for the Modern ISP**

Transform your Raspberry Pi or Orange Pi into a powerful, revenue-generating WiFi hotspot. The **AJC PISOWIFI Management System** is engineered for stability, speed, and seamless user experience. Built with a robust Node.js core and real-time WebSockets, it delivers instant coin recognition, advanced traffic shaping, and a sleek mobile-first captive portal.

Whether you're managing a single vending machine or a fleet of hotspots, AJC PISOWIFI provides the professional tools you need: multi-WAN load balancing, VLAN support, and comprehensive analytics—all in one lightweight, high-performance package.

---

## ✨ Key Features

- **⚡ Real-time Coin Detection**: Instant credit updates with support for standard multi-coin slots (Pins configurable).
- **🌐 Advanced Networking**: Full control over WAN/WLAN configurations, Bridge management, and 802.1Q VLAN support.
- **⚡ 10G+ Network Support**: Optimized for high-speed networks up to 100Gbps with advanced traffic control.
- **📱 Mobile-First Captive Portal**: A beautiful, responsive user interface that works perfectly on any device.
- **📊 Professional Admin Dashboard**: Deep insights with real-time analytics, pricing management, and system health monitoring.
- **🛡️ Robust Security**: Integrated firewall, captive portal redirection, and hardware-locked licensing system.
- **🔧 Hardware Agnostic**: Native optimization for Raspberry Pi and Orange Pi ecosystems.

## 🔌 NodeMCU Firmware Management

Streamline your hardware deployment with the integrated **NodeMCU Flasher**. This enterprise feature allows administrators to flash firmware directly from the dashboard, eliminating the need for external tools or complex command-line operations.

**Key Capabilities:**
- **Auto-Detection**: Instantly identifies connected NodeMCU/ESP8266 devices via USB.
- **One-Click Flashing**: Deploys the optimized `NodeMCU_ESP8266.bin` firmware directly from the server.
- **Safety Interlocks**: Intelligent filtering prevents accidental flashing of active WiFi adapters or critical system peripherals.

**Usage:**
1. Navigate to **System Settings** in the Admin Dashboard.
2. Connect your NodeMCU board to any USB port on the server.
3. The system will auto-detect the device (displayed as `ttyUSB*` or `ttyACM*`).
4. Click **Flash Firmware** to initiate the deployment process.

## 🛠 Hardware Requirements

- **SBC**: Raspberry Pi (All models) or Orange Pi (All models).
- **Coin Slot**: Standard multi-coin slot (e.g., CH-926).
- **OS**: Debian-based Linux (Raspberry Pi OS / Armbian).

## � Documentation & Installation

For detailed installation instructions, including automated scripts and manual setup guides, please refer to our **[Installation Guide](INSTALLATION.md)**.

## ⚙️ Configuration

- **Default Port**: 80 (Standard HTTP)
- **Admin Login**: Click the "ADMIN LOGIN" button in the bottom right of the portal.
- **GPIO**: Configure the board type and pin number via the "System Configuration" gear icon in the portal (Simulation mode available).

---
© 2025 AJC PISOWIFI • Developed for robust public internet delivery.
