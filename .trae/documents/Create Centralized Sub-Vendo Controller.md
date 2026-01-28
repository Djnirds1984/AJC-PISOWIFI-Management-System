# Create Centralized Sub-Vendo Controller

## Technical Implementation Plan

### **1. Backend Enhancements**
- **Public Device Discovery**: Add a public API endpoint `/api/nodemcu/available` in server.js that returns only "accepted" NodeMCU devices.
- **Pulse Event Consistency**: Ensure nodemcu-listener.js pulse events include the `macAddress` and `deviceId`.

### **2. Admin UI: Hardware Manager Update**
- **New Section**: Add a **"Sub-Vendo Controller"** card in HardwareManager.tsx below the Main Controller.
- **Device Management**:
  - List discovered NodeMCU devices with status (Pending/Accepted).
  - Actions: **Accept**, **Reject**, **Delete**, **Rename**, and **GPIO Config**.
  - Stats: Show real-time pulses and revenue per device.

### **3. Captive Portal: Coinslot Selection**
- **Selection Box**: Add a selection UI in LandingPage.tsx to choose the coinslot (Main vs Sub-Vendos).
- **Filtering Logic**: Update CoinModal.tsx to filter incoming pulses based on the selected device ID or MAC address.

### **4. Verification**
- Simulate device registration and acceptance.
- Verify selection appears in the portal.
- Test pulse detection for both main and sub-vendo sources.