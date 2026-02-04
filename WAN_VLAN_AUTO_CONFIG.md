# WAN VLAN Auto-Configuration with /20 Networks

## Overview

The system now automatically configures WAN VLANs with /20 network size, providing 4,094 hosts per VLAN instead of the previous 254 hosts (/24). This 16x capacity increase eliminates network bottlenecks for high-density deployments.

## Features

### Automatic WAN Detection
- Detects WAN interface using smart classification
- Prioritizes interfaces with external IP addresses
- Falls back to active ethernet interfaces (en*, eth0)

### /20 Network Auto-Configuration
When creating a VLAN on a WAN interface, the system automatically:
- Assigns network: `10.{vlan_id}.0.0/20`
- Sets gateway: `10.{vlan_id}.0.1`
- Configures DHCP pool: `10.{vlan_id}.0.100` to `10.{vlan_id}.15.254`
- Creates portal segment automatically
- Provides 4,094 host capacity per VLAN

### Network Examples
| VLAN ID | Network | Gateway | DHCP Range | Capacity |
|---------|---------|---------|------------|----------|
| 10 | 10.10.0.0/20 | 10.10.0.1 | 10.10.0.100 - 10.10.15.254 | 4,094 hosts |
| 13 | 10.13.0.0/20 | 10.13.0.1 | 10.13.0.100 - 10.13.15.254 | 4,094 hosts |
| 22 | 10.22.0.0/20 | 10.22.0.1 | 10.22.0.100 - 10.22.15.254 | 4,094 hosts |

## Usage

### Manual VLAN Creation
1. Go to Network Settings → VLAN Engine
2. Select a WAN interface (marked as "WAN - Auto /20")
3. Enter VLAN ID
4. Click "Create" - system auto-configures /20 network

### Auto-Provisioning
The system automatically creates VLANs 13 and 22 on WAN interfaces during startup with /20 networks.

## Benefits

### Capacity Improvement
- **Old /24**: 254 hosts per VLAN
- **New /20**: 4,094 hosts per VLAN  
- **16x more capacity** per VLAN

### Network Efficiency
- Eliminates DHCP server bottlenecks
- Supports high-density deployments
- Reduces network segmentation complexity

### Orange Pi Compatibility
- Works with Orange Pi's limited resources
- Uses RAM-based dnsmasq configuration (`/run/dnsmasq.d`)
- Avoids filesystem write issues

## Technical Implementation

### WAN Interface Detection
```javascript
function classifyInterfaces(interfaces) {
  // 1. Check for external IP (not 10.0.0.x)
  // 2. Check for active ethernet interfaces
  // 3. Prefer onboard interfaces (en*, eth0)
  // 4. Fallback to first ethernet found
}
```

### /20 Network Calculation
```javascript
const networkBase = `10.${vlan_id}.0`;
const gatewayIP = `${networkBase}.1`;           // 10.X.0.1
const networkCIDR = `${networkBase}.0/20`;      // 10.X.0.0/20
const dhcpStart = `${networkBase}.100`;         // 10.X.0.100
const dhcpEnd = `10.${vlan_id}.15.254`;         // 10.X.15.254
```

### Auto-Configuration Process
1. Detect if parent interface is WAN
2. Calculate /20 network based on VLAN ID
3. Create VLAN interface
4. Assign gateway IP with /20 subnet
5. Auto-create hotspot portal segment
6. Configure DHCP with full /20 range

## Configuration Files

### Network Library
- `lib/network.js` - Enhanced `createVlan()` function
- `lib/network.js` - Updated `autoProvisionNetwork()` function

### UI Components  
- `components/Admin/NetworkSettings.tsx` - WAN detection indicators
- Visual preview of /20 network configuration
- Enhanced user feedback for WAN VLANs

## Compatibility

### Multi-Board Support
- **Orange Pi**: Lightweight implementation with /20 networks
- **Ubuntu x64**: Advanced optimizations (future: Kea DHCP, IPSet)
- Automatic board detection for optimal configuration

### Backward Compatibility
- Existing /24 VLANs continue to work
- New VLANs on WAN interfaces use /20 automatically
- LAN VLANs remain unchanged (manual configuration)

## Monitoring

### Console Logging
```
[NET] Detected WAN VLAN creation on eth0, auto-configuring with /20 network...
[NET] WAN VLAN eth0.13 network configuration: {
  network: '10.13.0.0/20',
  gateway: '10.13.0.1', 
  dhcp_range: '10.13.0.100,10.13.15.254',
  capacity: '4,094 hosts'
}
[NET] WAN VLAN eth0.13 auto-configured with /20 network (10.13.0.0/20)
```

### Browser Console
Network page provides detailed debugging information for all network operations including VLAN creation and auto-configuration.

## Future Enhancements

### Ubuntu x64 Optimizations
- Kea DHCP server for better performance
- IPSet for firewall rule optimization  
- Database-driven configuration storage
- Advanced monitoring and analytics

### Network Management
- VLAN traffic monitoring
- Bandwidth utilization per VLAN
- Automatic load balancing across VLANs
- Dynamic VLAN creation based on demand