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
    console.log(`[GPIO] Simulation mode active. Target BCM Pin: ${pin}`);
    return;
  }

  // Serial Bridge Mode (x64 / NodeMCU)
  if (boardType === 'x64_pc' || (!Gpio && SerialPort)) {
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

      console.log(`[SERIAL] Bridge active on ${portPath}`);
    } catch (e) {
      console.error('[SERIAL] Init Failed:', e.message);
    }
    return;
  }

  // Real SBC GPIO Mode
  if (Gpio) {
    try {
      // Logic to prevent EINVAL: If the pin was previously exported but not cleaned up
      // sysfs might reject the new export. We try to unexport manually first.
      const gpioPath = `/sys/class/gpio/gpio${pin}`;
      if (require('fs').existsSync(gpioPath)) {
        console.log(`[GPIO] Pin ${pin} already exported, attempting reset...`);
        try {
          require('fs').writeFileSync('/sys/class/gpio/unexport', pin.toString());
        } catch (unexportError) {
          // Ignore unexport errors
        }
      }

      console.log(`[GPIO] Exporting BCM Pin ${pin}...`);
      coinInput = new Gpio(pin, 'in', 'rising', { debounceTimeout: 20 });
      
      let pulseCount = 0;
      let pulseTimer = null;

      coinInput.watch((err, value) => {
        if (err) {
          console.error('[GPIO] Watch error:', err);
          return;
        }

        pulseCount++;
        if (pulseTimer) clearTimeout(pulseTimer);
        
        pulseTimer = setTimeout(() => {
          handlePulses(pulseCount);
          pulseCount = 0;
        }, 500);
      });

      console.log(`[GPIO] Pin ${pin} (Physical Pin ${getPhysicalPin(pin)}) initialized.`);
    } catch (e) {
      console.error(`[GPIO] ERROR: BCM Pin ${pin} could not be exported.`);
      if (e.message.includes('EINVAL')) {
        console.error('CAUSE: Kernel rejected export. This happens if I2C is enabled on BCM 2/3.');
        console.error('ACTION: Use "raspi-config" to disable I2C, or switch to BCM Pin 4 (Physical Pin 7).');
      } else if (e.message.includes('EBUSY')) {
        console.error('CAUSE: Pin is in use by another process.');
      }
    }
  }
}

function getPhysicalPin(bcm) {
  const mapping = { 2: 3, 3: 5, 4: 7, 17: 11, 27: 13, 22: 15 };
  return mapping[bcm] || 'Unknown';
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
  console.log(`[HARDWARE] Rebuilding stack: ${boardType}, Pin: ${pin}`);
  initGPIO(currentPulseCallback, boardType, pin);
}

module.exports = { initGPIO, updateGPIO };