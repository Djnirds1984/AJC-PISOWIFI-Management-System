// This module handles GPIO for RPi/OPi and Serial for x64/NodeMCU
const fs = require('fs');
const path = require('path');
let Gpio;
let SerialPort;

try {
  Gpio = require('onoff').Gpio;
} catch (e) {
  console.warn('[GPIO] Native onoff not available. Normal on non-Linux/x64.');
}

try {
  SerialPort = require('serialport').SerialPort;
} catch (e) {
  console.warn('[SERIAL] SerialPort not available.');
}

let coinInput = null;
let serialBridge = null;
let currentPulseCallback = null;
let multiSlotCallbacks = {}; // For multi-slot coin detection
let simulationTimer = null;

const { getOpPin } = require('./opi_pinout');

// Mapping for standard RPi header
function getPhysicalPin(bcm) {
  const mapping = { 2: 3, 3: 5, 4: 7, 17: 11, 27: 13, 22: 15, 10: 19, 9: 21, 11: 23, 5: 29, 6: 31, 13: 33, 19: 35, 26: 37, 14: 8, 15: 10 };
  return mapping[bcm] || 'Unknown';
}

function findCorrectGpioBase() {
  const gpioDir = '/sys/class/gpio';
  if (!fs.existsSync(gpioDir)) return 0;

  try {
    const chips = fs.readdirSync(gpioDir).filter(f => f.startsWith('gpiochip'));
    for (const chip of chips) {
      const chipPath = path.join(gpioDir, chip);
      const ngpioPath = path.join(chipPath, 'ngpio');
      const basePath = path.join(chipPath, 'base');

      if (fs.existsSync(ngpioPath) && fs.existsSync(basePath)) {
        const lines = parseInt(fs.readFileSync(ngpioPath, 'utf8').trim());
        const base = parseInt(fs.readFileSync(basePath, 'utf8').trim());
        
        // Raspberry Pi usually has a chip with ~54 lines (BCM2835) or similar
        // Orange Pi H3 often has multiple chips. We use this as fallback.
        if (lines >= 50 && lines <= 200) { 
          // Relaxed check to include OPi chips if possible, but mainly for RPi
          // console.log(`[GPIO] Detected SOC Header Chip: ${chip} (Base: ${base}, Lines: ${lines})`);
          return base;
        }
      }
    }
  } catch (e) {
    console.error('[GPIO] Error probing gpiochips:', e.message);
  }
  return 0;
}

function initGPIO(onPulse, boardType = 'none', pin = 2, boardModel = null, serialPort = '/dev/ttyUSB0', espIpAddress = '192.168.4.1', espPort = 80, coinSlots = [], nodemcuDevices = []) {
  currentPulseCallback = onPulse;
  multiSlotCallbacks = {};
  
  let sysPin = -1;
  let physPin = 'Unknown';
  let isSimulated = false;

  // Cleanup existing GPIO
  if (coinInput) {
    try {
      coinInput.unwatchAll();
      coinInput.unexport();
    } catch (e) {}
    coinInput = null;
  }

  // Cleanup Serial
  if (serialBridge) {
    try {
      serialBridge.close();
    } catch (e) {}
    serialBridge = null;
  }

  // Cleanup Simulation
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }

  if (boardType === 'none') {
    isSimulated = true;
    physPin = getPhysicalPin(pin);
    console.log(`[GPIO] Simulation Mode. Target: Pin ${pin} (Physical ${physPin})`);
    
    simulationTimer = setInterval(() => {
      console.log('[GPIO SIMULATION] Generating test pulse (1 peso)');
      if (currentPulseCallback) currentPulseCallback(1);
      
      if (coinSlots && coinSlots.length > 0) {
        const firstSlot = coinSlots.find(s => s.enabled);
        if (firstSlot && multiSlotCallbacks[firstSlot.id]) {
           // console.log(`[GPIO SIMULATION] Generating multi-slot pulse for Slot ${firstSlot.id}`);
           multiSlotCallbacks[firstSlot.id](firstSlot.denomination);
        }
      }
    }, 5000);
    return;
  }

  if (boardType === 'nodemcu_esp') {
    // Handle WiFi communication with ESP board
    console.log(`[WIFI] Connecting to ESP at ${espIpAddress}:${espPort}`);
    
    // For WiFi connection, we'll use HTTP requests or WebSocket
    // This is a placeholder for the actual implementation
    // The actual WiFi communication logic would be implemented here
    
    // Simulate connection for now
    setTimeout(() => {
      console.log(`[WIFI] Connected to ESP at ${espIpAddress}:${espPort}`);
      
      // Send configuration to ESP board
      if (coinSlots && coinSlots.length > 0) {
        const configMsg = `CONFIG:${JSON.stringify(coinSlots.map(slot => ({
          id: slot.id,
          pin: slot.pin,
          denomination: slot.denomination,
          enabled: slot.enabled
        })))}`;
        console.log(`[WIFI] Would send multi-slot config to ESP: ${configMsg}`);
        // In real implementation, send this over WiFi using HTTP POST or WebSocket
      }
    }, 2000); // Wait for "connection" to establish
    
    return;
  }
  
  if (boardType === 'x64_pc' || (!Gpio && SerialPort)) {
    try {
      const portPath = process.env.SERIAL_PORT || '/dev/ttyUSB0';
      serialBridge = new SerialPort({ path: portPath, baudRate: 115200 });
      
      // Track last pulse time to prevent flooding
      let lastPulseTime = 0;
      const MIN_PULSE_INTERVAL = 200; // Minimum 200ms between pulses for multi-slot
      
      serialBridge.on('data', (data) => {
        const msg = data.toString().trim();
        
        // Only process if minimum interval has passed
        const now = Date.now();
        if (now - lastPulseTime < MIN_PULSE_INTERVAL) {
          return; // Skip if too frequent (possible noise/spam)
        }
        
        // Handle multi-slot protocol: SLOT:<slot_id>:<denomination>
        if (msg.startsWith('SLOT:')) {
          const parts = msg.split(':');
          if (parts.length === 3) {
            const slotId = parseInt(parts[1]);
            const denomination = parseInt(parts[2]);
            
            if (slotId >= 1 && slotId <= 4 && [1, 5, 10].includes(denomination)) {
              handleMultiSlotPulse(slotId, denomination);
              lastPulseTime = now;
            }
          }
        }
        // Fallback to legacy single pulse format
        else if (msg === 'PULSE' || !isNaN(msg)) {
          const pulseValue = isNaN(msg) ? 1 : parseInt(msg);
          if ([1, 5, 10].includes(pulseValue)) {
            handlePulses(pulseValue);
            lastPulseTime = now;
          }
        }
      });
      
      console.log(`[SERIAL] Listening on ${portPath} for generic serial`);
      
      serialBridge.on('error', (err) => {
        console.error('[SERIAL] Runtime Error:', err.message);
      });
      
    } catch (e) {
      console.error('[SERIAL] Init Error:', e.message);
      console.log('[SERIAL] Falling back to SIMULATION MODE due to Serial error.');
      
      // Fallback to simulation
      simulationTimer = setInterval(() => {
        console.log('[GPIO SERIAL SIMULATION] Generating test pulse (1 peso)');
        if (currentPulseCallback) currentPulseCallback(1);
        
        if (coinSlots && coinSlots.length > 0) {
           const firstSlot = coinSlots.find(s => s.enabled);
           if (firstSlot && multiSlotCallbacks[firstSlot.id]) {
               multiSlotCallbacks[firstSlot.id](firstSlot.denomination);
           }
        }
      }, 5000);
    }
    return;
  }

  if (boardType === 'orange_pi') {
    if (boardModel) {
      const mapped = getOpPin(boardModel, pin);
      if (mapped !== undefined && mapped !== null) {
        sysPin = mapped;
        physPin = pin; // In OPi mode, 'pin' is the physical pin number
        console.log(`[GPIO] OPi ${boardModel}: Physical Pin ${pin} mapped to System GPIO ${sysPin}`);
      } else {
        console.warn(`[GPIO] No mapping for ${boardModel} Pin ${pin}. Falling back to simulation mode.`);
        isSimulated = true;
        physPin = `? (Input ${pin})`;
        
        simulationTimer = setInterval(() => {
             console.log(`[GPIO OPi SIMULATION] Generating test pulse (1 peso) for Pin ${pin}`);
             if (currentPulseCallback) currentPulseCallback(1);
             
             if (coinSlots && coinSlots.length > 0) {
                 const firstSlot = coinSlots.find(s => s.enabled);
                 if (firstSlot && multiSlotCallbacks[firstSlot.id]) {
                     multiSlotCallbacks[firstSlot.id](firstSlot.denomination);
                 }
             }
        }, 5000);
        return;
      }
    } else {
      // Legacy/Generic Orange Pi fallback
      const base = findCorrectGpioBase();
      sysPin = base + pin;
      physPin = `? (Input ${pin})`;
    }
  } else {
    // Raspberry Pi (Default)
    const base = findCorrectGpioBase();
    sysPin = base + pin; // In RPi mode, 'pin' is BCM
    physPin = getPhysicalPin(pin);
  }

  if (Gpio && sysPin !== -1) {
    try {
      const gpioPath = `/sys/class/gpio/gpio${sysPin}`;
      if (fs.existsSync(gpioPath)) {
        try {
          fs.writeFileSync('/sys/class/gpio/unexport', sysPin.toString());
        } catch (e) {}
      }

      console.log(`[GPIO] Exporting GPIO ${sysPin} (Physical Pin ${physPin})...`);
      coinInput = new Gpio(sysPin, 'in', 'rising', { debounceTimeout: 25 });
      
      let pulseCount = 0;
      let pulseTimer = null;

      // Track last pulse time to prevent flooding from electrical noise
      let lastGPIOPulseTime = 0;
      const MIN_GPIO_PULSE_INTERVAL = 100; // Minimum 100ms between GPIO pulses
      
      coinInput.watch((err, value) => {
        if (err) return console.error('[GPIO] Watch error:', err);
        
        // Only count pulse if minimum interval has passed
        const now = Date.now();
        if (now - lastGPIOPulseTime < MIN_GPIO_PULSE_INTERVAL) {
          return; // Skip if too frequent (electrical noise)
        }
        
        pulseCount++;
        lastGPIOPulseTime = now;
        if (pulseTimer) clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => {
          handlePulses(pulseCount);
          pulseCount = 0;
        }, 500);
      });

      console.log(`[GPIO] SUCCESS: GPIO ${sysPin} is now ACTIVE.`);
    } catch (e) {
      console.error(`[GPIO] EXPORT FAILED (System ${sysPin}): ${e.message}`);
      if (e.message.includes('EINVAL')) {
        console.error('DIAGNOSTICS: Invalid Argument.');
      }
    }
  }
}

function handlePulses(count) {
  if (count > 0 && currentPulseCallback) {
    currentPulseCallback(count);
  }
}

function handleMultiSlotPulse(slotId, denomination) {
  console.log(`[MULTI-SLOT] Slot ${slotId} detected: ${denomination} pesos`);
  
  // Call the main pulse callback with denomination
  if (currentPulseCallback) {
    currentPulseCallback(denomination);
  }
  
  // Call slot-specific callback if registered
  if (multiSlotCallbacks[slotId]) {
    multiSlotCallbacks[slotId](denomination);
  }
}

function registerSlotCallback(slotId, callback) {
  multiSlotCallbacks[slotId] = callback;
}

function unregisterSlotCallback(slotId) {
  delete multiSlotCallbacks[slotId];
}

function updateGPIO(boardType, pin, boardModel, serialPort, espIpAddress, espPort, coinSlots, nodemcuDevices) {
  console.log(`[HARDWARE] Reconfiguring: ${boardType} (${boardModel || 'Generic'}), Pin ${pin}`);
  if (boardType === 'nodemcu_esp') {
    console.log(`[HARDWARE] Multi-slot config: ${coinSlots ? coinSlots.length : 0} slots, WiFi: ${espIpAddress}:${espPort || 'default'}`);
  }
  if (nodemcuDevices) {
    console.log(`[HARDWARE] Multi-NodeMCU config: ${nodemcuDevices.length} devices`);
  }
  initGPIO(currentPulseCallback, boardType, pin, boardModel, serialPort, espIpAddress, espPort, coinSlots, nodemcuDevices);
}

module.exports = { initGPIO, updateGPIO, registerSlotCallback, unregisterSlotCallback };