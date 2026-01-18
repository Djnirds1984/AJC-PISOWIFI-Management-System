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
      coinInput.unwatchAll();
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
      const portPath = process.env.SERIAL_PORT || '/dev/ttyUSB0';
      serialBridge = new SerialPort({
        path: portPath,
        baudRate: 115200,
        autoOpen: true
      });

      serialBridge.on('data', (data) => {
        const msg = data.toString().trim();
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
      // Robust export check
      console.log(`Attempting to export GPIO Pin ${pin}...`);
      coinInput = new Gpio(pin, 'in', 'rising', { debounceTimeout: 20 });
      
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
      console.error(`GPIO ERROR [Pin ${pin}]:`, e.message);
      console.error(`Advice: Ensure Pin ${pin} is not used by I2C/SPI or other services (raspi-config).`);
      // Fail gracefully - don't crash the whole server
    }
  }
}

function handlePulses(count) {
  let detectedAmount = 0;
  if (count === 1) detectedAmount = 1;
  else if (count === 5) detectedAmount = 5;
  else if (count === 10) detectedAmount = 10;
  else detectedAmount = count;

  if (detectedAmount > 0 && currentPulseCallback) {
    currentPulseCallback(detectedAmount);
  }
}

function updateGPIO(boardType, pin) {
  console.log(`Updating Hardware Layer: ${boardType}, Pin: ${pin}`);
  initGPIO(currentPulseCallback, boardType, pin);
}

module.exports = { initGPIO, updateGPIO };