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

/**
 * Finds the GPIO base for the main SOC header.
 * On RPi 4/5, this is usually 512, on older ones it's 0.
 * We look for the gpiochip with roughly 54 lines (the 40-pin header SOC).
 */
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
        
        // RPi SOC header usually has 54 lines (BCM 0-53)
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

function initGPIO(onPulse, boardType = 'none', pin = 3) {
  currentPulseCallback = onPulse;
  
  const base = findCorrectGpioBase();
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
      const gpioPath = `/sys/class/gpio/gpio${sysPin}`;
      
      // Attempt manual unexport first to clear locks
      if (fs.existsSync(gpioPath)) {
        try {
          fs.writeFileSync('/sys/class/gpio/unexport', sysPin.toString());
        } catch (e) {}
      }

      console.log(`[GPIO] Exporting BCM ${pin} (System Number: ${sysPin})...`);
      
      // Initialize using the calculated system pin
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

      console.log(`[GPIO] SUCCESS: BCM ${pin} (System ${sysPin}) is active.`);
    } catch (e) {
      console.error(`[GPIO] EXPORT FAILED (BCM ${pin} -> System ${sysPin}): ${e.message}`);
      
      if (e.message.includes('EINVAL')) {
        console.error('DIAGNOSTICS: Invalid Argument.');
        if (sysPin < 512 && base === 0) {
          console.error(`ADVICE: You might need to use a 512 offset. Try BCM ${512 + pin}?`);
        }
        if (pin === 2 || pin === 3) {
          console.error('ADVICE: Check for I2C locks in /boot/config.txt.');
        }
      } else if (e.message.includes('EACCES')) {
        console.error('ADVICE: Permission denied. Run as root or add user to gpio group.');
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