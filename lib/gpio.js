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
        
        if (lines >= 54 && lines <= 64) {
          console.log(`[GPIO] Detected SOC Header Chip: ${chip} (Base: ${base}, Lines: ${lines})`);
          return base;
        }
      }
    }
  } catch (e) {
    console.error('[GPIO] Error probing gpiochips:', e.message);
  }
  return 0;
}

function initGPIO(onPulse, boardType = 'none', pin = 2) {
  currentPulseCallback = onPulse;
  
  const base = findCorrectGpioBase();
  const sysPin = base + pin;
  const physPin = getPhysicalPin(pin);

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
    console.log(`[GPIO] Simulation Mode. Target: BCM ${pin} (Physical ${physPin})`);
    return;
  }

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

  if (Gpio) {
    try {
      const gpioPath = `/sys/class/gpio/gpio${sysPin}`;
      if (fs.existsSync(gpioPath)) {
        try {
          fs.writeFileSync('/sys/class/gpio/unexport', sysPin.toString());
        } catch (e) {}
      }

      console.log(`[GPIO] Exporting BCM ${pin} (Physical Pin ${physPin} / System ${sysPin})...`);
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

      console.log(`[GPIO] SUCCESS: BCM ${pin} (Physical Pin ${physPin}) is now ACTIVE.`);
    } catch (e) {
      console.error(`[GPIO] EXPORT FAILED (BCM ${pin} -> System ${sysPin}): ${e.message}`);
      if (e.message.includes('EINVAL')) {
        console.error('DIAGNOSTICS: Invalid Argument.');
        if (pin === 2 || pin === 3) {
          console.error('ADVICE: BCM 2/3 are I2C pins. Ensure "i2c_arm=off" is in /boot/firmware/config.txt and REBOOT.');
        }
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