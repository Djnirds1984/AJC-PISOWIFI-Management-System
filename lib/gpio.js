
// This module handles GPIO for RPi/OPi and Serial for x64/NodeMCU
let Gpio;
let SerialPort;
try {
  Gpio = require('onoff').Gpio;
} catch (e) {
  console.warn('Native GPIO (onoff) not available. This is normal on x64 PC.');
}

try {
  SerialPort = require('serialport').SerialPort;
} catch (e) {
  console.warn('SerialPort not available. Required for x64 NodeMCU bridge.');
}

let coinInput = null;
let serialBridge = null;
let currentPulseCallback = null;

function initGPIO(onPulse, boardType = 'none', pin = 3) {
  currentPulseCallback = onPulse;

  // Cleanup existing GPIO
  if (coinInput) {
    try {
      coinInput.unexport();
    } catch (e) {}
    coinInput = null;
  }

  // Cleanup existing Serial
  if (serialBridge) {
    try {
      serialBridge.close();
    } catch (e) {}
    serialBridge = null;
  }

  if (boardType === 'none') {
    console.log(`GPIO Initialized in Simulation Mode. Targeted Pin: ${pin}`);
    return;
  }

  // x64 / NodeMCU Logic
  if (boardType === 'x64_pc' || (!Gpio && SerialPort)) {
    console.log(`Initializing Serial-to-GPIO Bridge for x64 (NodeMCU)...`);
    try {
      // Common NodeMCU port on Linux is /dev/ttyUSB0 or /dev/ttyACM0
      const portPath = process.env.SERIAL_PORT || '/dev/ttyUSB0';
      serialBridge = new SerialPort({
        path: portPath,
        baudRate: 115200,
        autoOpen: true
      });

      serialBridge.on('data', (data) => {
        const msg = data.toString().trim();
        // Assuming NodeMCU sends "PULSE" or digit for pulse count
        if (msg === 'PULSE' || !isNaN(msg)) {
          const pulses = isNaN(msg) ? 1 : parseInt(msg);
          handlePulses(pulses);
        }
      });

      serialBridge.on('error', (err) => {
        console.error('Serial Port Error:', err.message);
      });

      console.log(`Serial Bridge active on ${portPath}`);
    } catch (e) {
      console.error('Failed to init Serial Bridge:', e.message);
    }
    return;
  }

  // SBC (RPi/OPi) Logic
  if (Gpio) {
    try {
      coinInput = new Gpio(pin, 'in', 'rising', { debounceTimeout: 10 });
      
      let pulseCount = 0;
      let pulseTimer = null;

      coinInput.watch((err, value) => {
        if (err) {
          console.error('GPIO Watch error:', err);
          return;
        }

        pulseCount++;
        
        if (pulseTimer) clearTimeout(pulseTimer);
        
        pulseTimer = setTimeout(() => {
          handlePulses(pulseCount);
          pulseCount = 0;
        }, 500);
      });

      console.log(`Real GPIO Pin ${pin} initialized on board: ${boardType}`);
    } catch (e) {
      console.error('Failed to initialize GPIO:', e.message);
    }
  }
}

function handlePulses(count) {
  let detectedAmount = 0;
  if (count === 1) detectedAmount = 1;
  else if (count === 5) detectedAmount = 5;
  else if (count === 10) detectedAmount = 10;
  else detectedAmount = count; // Multi-pulse handling

  if (detectedAmount > 0 && currentPulseCallback) {
    currentPulseCallback(detectedAmount);
  }
}

function updateGPIO(boardType, pin) {
  console.log(`Updating GPIO/Serial to Board: ${boardType}, Pin: ${pin}`);
  initGPIO(currentPulseCallback, boardType, pin);
}

module.exports = { initGPIO, updateGPIO };
