
// This module simulates the GPIO interactions required for real hardware.
// In a production Node.js environment, this would use 'onoff' or 'orange-pi-gpio'.

export class HardwareController {
  private coinPulses: number = 0;
  private onPulseCallback: (credits: number) => void = () => {};

  constructor() {
    console.log('Hardware Controller Initialized (GPIO Pin 3)');
  }

  // Simulate a hardware interrupt from the coin slot
  // In real Node: gpio.on('interrupt', (val) => { ... })
  public simulateCoinInsert(pesos: 1 | 5 | 10) {
    const pulses = pesos === 1 ? 1 : pesos === 5 ? 5 : 10;
    this.coinPulses += pulses;
    this.onPulseCallback(pesos);
  }

  public onCreditDetected(callback: (amount: number) => void) {
    this.onPulseCallback = callback;
  }

  public resetPulses() {
    this.coinPulses = 0;
  }

  public getStatus() {
    return {
      board: 'Raspberry Pi / Orange Pi',
      pin: 3,
      mode: 'Input',
      pull: 'Up'
    };
  }
}

export const hardware = new HardwareController();
