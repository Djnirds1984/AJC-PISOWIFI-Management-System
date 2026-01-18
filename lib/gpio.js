
// This requires the 'onoff' library installed on the target Linux system
let Gpio;
try {
  Gpio = require('onoff').Gpio;
} catch (e) {
  console.warn('GPIO hardware not detected. Using mock implementation for dev.');
}

function initGPIO(onPulse) {
  const PIN_COIN = 3;

  if (Gpio) {
    const coinInput = new Gpio(PIN_COIN, 'in', 'rising', { debounceTimeout: 10 });
    
    let pulseCount = 0;
    let pulseTimer = null;

    coinInput.watch((err, value) => {
      if (err) {
        console.error('GPIO Watch error:', err);
        return;
      }

      pulseCount++;
      
      // Multi-coin logic: pulses are typically fast. 
      // We wait for a short silence to determine the total value.
      if (pulseTimer) clearTimeout(pulseTimer);
      
      pulseTimer = setTimeout(() => {
        // Simple pulse logic: 1 pulse = 1 peso, 5 pulses = 5 pesos, 10 pulses = 10 pesos
        // This mapping depends on the specific coin slot calibration.
        let detectedAmount = 0;
        if (pulseCount === 1) detectedAmount = 1;
        else if (pulseCount === 5) detectedAmount = 5;
        else if (pulseCount === 10) detectedAmount = 10;
        else detectedAmount = pulseCount; // Fallback

        if (detectedAmount > 0) {
          onPulse(detectedAmount);
        }
        pulseCount = 0;
      }, 500);
    });

    process.on('SIGINT', () => {
      coinInput.unexport();
    });

    console.log(`Real GPIO Pin ${PIN_COIN} initialized for pulse detection.`);
  } else {
    console.log('GPIO Mock initialized. simulateCoinInsert() can be triggered via socket (if implemented).');
  }
}

module.exports = { initGPIO };
