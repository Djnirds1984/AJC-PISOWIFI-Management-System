# Hotspot /20 Network Update & Bandwidth Limiter Removal

## Changes Made

### 1. **Default to /20 Networks**
- **UI Default**: Portal segment creation now defaults to `/20` networks (4,094 hosts)
- **Bitmask Options**: Reordered with `/20` as first option marked "RECOMMENDED"
- **Network Capacity**: 16x increase from 254 hosts (/24) to 4,094 hosts (/20)

### 2. **Removed Bandwidth Limiter**
- **UI Cleanup**: Removed bandwidth limit input field from portal segment creation
- **Simplified Interface**: Cleaner UI focused on network configuration
- **No Restrictions**: Portal segments no longer have bandwidth limitations in the UI

### 3. **Backend Updates**
- **setupHotspot Function**: Updated to accept and use `bitmask` parameter (defaults to 20)
- **IP Configuration**: Uses `/20` networks instead of hardcoded `/24`
- **Logging**: Enhanced logging to show network size being configured

## Technical Details

### UI Changes (NetworkSettings.tsx)

#### Default State:
```javascript
const [newHS, setNewHS] = useState({
  interface: '',
  ip_address: '10.0.10.1',
  dhcp_range: '10.0.10.50,10.0.10.250',
  bitmask: 20  // Changed from 24
});
```

#### Bitmask Options:
```javascript
const bitmaskOptions = [
  { value: 20, label: '/20 (4094 hosts) - RECOMMENDED', range: '4094 IPs' },
  { value: 24, label: '/24 (254 hosts)', range: '254 IPs' },
  // ... other options
];
```

#### Removed Fields:
- ❌ Bandwidth Limit input field
- ❌ Bandwidth display in active segments
- ✅ Clean, focused network configuration

### Backend Changes (lib/network.js)

#### setupHotspot Function:
```javascript
async function setupHotspot(config, skipRestart = false) {
  let { interface, ip_address, dhcp_range, bitmask = 20 } = config;
  
  // Use /20 network by default for high capacity
  await execPromise(`ip addr add ${ip_address}/${bitmask} dev ${interface}`);
  
  console.log(`[HOTSPOT] Configured ${interface} with /${bitmask} network`);
}
```

## Network Examples

### Before (/24 Networks):
| Interface | Network | Gateway | DHCP Range | Capacity |
|-----------|---------|---------|------------|----------|
| eth0.10 | 10.0.10.0/24 | 10.0.10.1 | 10.0.10.50-250 | 254 hosts |
| wlan0 | 10.0.20.0/24 | 10.0.20.1 | 10.0.20.50-250 | 254 hosts |

### After (/20 Networks):
| Interface | Network | Gateway | DHCP Range | Capacity |
|-----------|---------|---------|------------|----------|
| eth0.10 | 10.0.10.0/20 | 10.0.10.1 | 10.0.10.100-15.254 | 4,094 hosts |
| wlan0 | 10.0.20.0/20 | 10.0.20.1 | 10.0.20.100-31.254 | 4,094 hosts |

## Benefits

### 1. **Massive Capacity Increase**
- **16x More Hosts**: From 254 to 4,094 hosts per segment
- **Scalability**: Supports high-density deployments
- **Future-Proof**: Room for growth without network reconfiguration

### 2. **Simplified Management**
- **No Bandwidth Limits**: Removes artificial restrictions
- **Clean Interface**: Focused on essential network settings
- **Less Configuration**: Fewer fields to manage

### 3. **Orange Pi Optimized**
- **High Capacity**: Maximizes Orange Pi's networking capabilities
- **Efficient**: Reduces network segmentation complexity
- **Compatible**: Works with existing dnsmasq and firewall setup

## User Experience

### Portal Segment Creation:
1. **Select Interface**: Choose network interface
2. **Set Gateway IP**: Configure gateway address
3. **Choose Network Size**: Select from /16 to /24 (defaults to /20)
4. **Auto DHCP Range**: Automatically calculated based on network size
5. **Deploy**: One-click deployment with /20 network

### Network Preview:
```
Network Preview (/20 Default)
Network: 10.0.10.1/20
Pool: 10.0.10.100,10.0.15.254
Capacity: 4094 IPs
```

### Active Segments Display:
```
🏛️ eth0.10
   10.0.10.1 • Pool: 10.0.10.100,10.0.15.254
   High Capacity Network • No Bandwidth Limits
```

## Migration Notes

### Existing Hotspots:
- **Backward Compatible**: Existing /24 hotspots continue to work
- **No Disruption**: Current configurations remain unchanged
- **Gradual Migration**: New hotspots use /20, existing ones can be recreated

### Configuration:
- **Default Behavior**: New installations default to /20
- **User Choice**: Users can still select /24 or other sizes if needed
- **Automatic**: DHCP ranges calculated automatically for any network size

## Testing

### Recommended Tests:
1. **Create /20 Hotspot**: Verify 4,094 host capacity
2. **DHCP Range**: Confirm auto-calculated ranges are correct
3. **Network Connectivity**: Test client connections and internet access
4. **Multiple Segments**: Create multiple /20 segments on different interfaces
5. **Existing Compatibility**: Verify existing /24 hotspots still work

### Expected Results:
- ✅ /20 networks created successfully
- ✅ DHCP ranges span full /20 capacity
- ✅ No bandwidth restrictions applied
- ✅ Clean UI without bandwidth fields
- ✅ Enhanced logging shows network size

The hotspot system now provides massive capacity improvements while maintaining simplicity and Orange Pi compatibility.