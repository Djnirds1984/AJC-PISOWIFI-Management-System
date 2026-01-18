// This module handles GPIO for RPi/OPi and Serial for x64/NodeMCU
const fs = require('fs');
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

/**
 * Newer kernels (RPi OS Bookworm) use a different GPIO base (e.g., 512).
 * This helper finds the base to prevent EINVAL on export.
 */
function getGpioBase() {
  try {
    if (fs.existsSync('/sys/class/gpio/gpiochip0/base')) {
      const base = parseInt(fs.readFileSync('/sys/class/gpio/gpiochip0/base', 'utf8').trim());
      return isNaN(base) ? 0 : base;
    }
  } catch (e) {}
  return 0;
}

function initGPIO(onPulse, boardType = 'none', pin = 3) {
  currentPulseCallback = onPulse;
  const base = getGpioBase();
  const sysPin = base + pin;

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

  if (boardType === 'none') {
    console.log(`[GPIO] Simulation Mode. Target: BCM ${pin}`);
    return;
  }

  // Serial Bridge (x64)
  if (boardType === 'x64_pc' || (!Gpio && SerialPort)) {
    try {
      const portPath = process.env.SERIAL_PORT || '/dev/ttyUSB0';
      serialBridge = new SerialPort({ path: portPath, baudRate: 115200 });
      serialBridge.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg === 'PULSE' || !isNaN(msg)) {
          handlePulses(isNaN(msg) ? 1 : parseInt(msg));
        }
      });
      console.log(`[SERIAL] Listening on ${portPath}`);
    } catch (e) {
      console.error('[SERIAL] Init Error:', e.message);
    }
    return;
  }

  // Native SBC GPIO
  if (Gpio) {
    try {
      // Step 1: Force Unexport if exists
      const gpioPath = `/sys/class/gpio/gpio${sysPin}`;
      if (fs.existsSync(gpioPath)) {
        try {
          fs.writeFileSync('/sys/class/gpio/unexport', sysPin.toString());
          console.log(`[GPIO] Cleaned up existing BCM ${pin} (Sys ${sysPin})`);
        } catch (e) {}
      }

      console.log(`[GPIO] Initializing BCM ${pin} (System ID: ${sysPin}, Base: ${base})...`);
      
      // Step 2: Initialize using the calculated system pin
      coinInput = new Gpio(sysPin, 'in', 'rising', { debounceTimeout: 25 });
      
      let pulseCount = 0;
      let pulseTimer = null;

      coinInput.watch((err, value) => {
        if (err) return console.error('[GPIO] Watch error:', err);
        pulseCount++;
        if (pulseTimer) clearTimeout(pulseTimer);
        pulseTimer = setTimeout(() => {
          handlePulses(pulseCount);
          pulseCount = 0;
        }, 500);
      });

      console.log(`[GPIO] SUCCESS: BCM ${pin} is active.`);
    } catch (e) {
      console.error(`[GPIO] CRITICAL ERROR [BCM ${pin} / Sys ${sysPin}]:`, e.message);
      
      if (e.message.includes('EINVAL')) {
        console.error('DIAGNOSTICS: The kernel rejected the pin number or access mode.');
        if (pin === 2 || pin === 3) {
          console.error('CHECK: I2C might still be reserved in /boot/config.txt (dtparam=i2c_arm=on).');
        } else {
          console.error(`CHECK: Verify if BCM ${pin} is available in 'pinctrl' and not used by another overlay.`);
        }
      } else if (e.message.includes('EBUSY')) {
        console.error('CHECK: Pin is currently locked by another process or the kernel.');
      }
    }
  }
}

function handlePulses(count) {
  if (count > 0 && currentPulseCallback) {
    currentPulseCallback(count);
  }
}

function updateGPIO(boardType, pin) {
  console.log(`[HARDWARE] Reconfiguring: ${boardType}, BCM Pin ${pin}`);
  initGPIO(currentPulseCallback, boardType, pin);
}

module.exports = { initGPIO, updateGPIO };