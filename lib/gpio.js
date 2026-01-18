
// This requires the 'onoff' library installed on the target Linux system
let Gpio;
try {
  Gpio = require('onoff').Gpio;
} catch (e) {
  console.warn('GPIO hardware library not available.');
}

let coinInput = null;
let currentPulseCallback = null;

function initGPIO(onPulse, boardType = 'none', pin = 3) {
  currentPulseCallback = onPulse;

  // Cleanup existing
  if (coinInput) {
    try {
      coinInput.unexport();
    } catch (e) {}
    coinInput = null;
  }

  if (boardType === 'none' || !Gpio) {
    console.log(`GPIO Initialized in Simulation Mode (No Hardware). Targeted Pin: ${pin}`);
    return;
  }

  try {
    // In a real implementation, you'd handle Orange Pi vs RPi mapping here if different
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
        let detectedAmount = 0;
        if (pulseCount === 1) detectedAmount = 1;
        else if (pulseCount === 5) detectedAmount = 5;
        else if (pulseCount === 10) detectedAmount = 10;
        else detectedAmount = pulseCount;

        if (detectedAmount > 0 && currentPulseCallback) {
          currentPulseCallback(detectedAmount);
        }
        pulseCount = 0;
      }, 500);
    });

    console.log(`Real GPIO Pin ${pin} initialized on board: ${boardType}`);
  } catch (e) {
    console.error('Failed to initialize GPIO:', e.message);
  }
}

function updateGPIO(boardType, pin) {
  console.log(`Updating GPIO to Board: ${boardType}, Pin: ${pin}`);
  initGPIO(currentPulseCallback, boardType, pin);
}

module.exports = { initGPIO, updateGPIO };
