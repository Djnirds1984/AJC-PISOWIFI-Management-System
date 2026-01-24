
// This module simulates the GPIO interactions required for real hardware.
// In a production Node.js environment, this would use 'onoff' or 'orange-pi-gpio'.

import { execSync } from 'child_process';
import * as fs from 'fs';

/**
 * Extract the Orange Pi CPU serial number from /proc/cpuinfo
 * This is a hardware-unique identifier that cannot be changed
 * @returns The CPU serial number or null if not found
 */
export function getHardwareSerial(): string | null {
  try {
    // First, try to read /proc/cpuinfo directly
    if (fs.existsSync('/proc/cpuinfo')) {
      const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf-8');
      
      // Look for Serial field (Raspberry Pi style)
      const serialMatch = cpuInfo.match(/^Serial\s*:\s*([0-9a-fA-F]+)$/m);
      if (serialMatch && serialMatch[1]) {
        return serialMatch[1].trim();
      }
      
      // Look for Hardware field combined with Revision (Orange Pi fallback)
      const hardwareMatch = cpuInfo.match(/^Hardware\s*:\s*(.+)$/m);
      const revisionMatch = cpuInfo.match(/^Revision\s*:\s*([0-9a-fA-F]+)$/m);
      
      if (hardwareMatch && revisionMatch) {
        return `${hardwareMatch[1].trim()}-${revisionMatch[1].trim()}`;
      }
    }
    
    // Fallback: Try using command line
    const output = execSync('cat /proc/cpuinfo 2>/dev/null || echo "N/A"', { 
      encoding: 'utf-8' 
    });
    
    const serialMatch = output.match(/^Serial\s*:\s*([0-9a-fA-F]+)$/m);
    if (serialMatch && serialMatch[1]) {
      return serialMatch[1].trim();
    }
    
    console.warn('[Hardware] Could not extract serial from /proc/cpuinfo');
    return null;
  } catch (error) {
    console.error('[Hardware] Error extracting hardware serial:', error);
    return null;
  }
}

/**
 * Get a unique hardware identifier for this device
 * Falls back to MAC address if CPU serial is unavailable
 */
export async function getUniqueHardwareId(): Promise<string> {
  const serial = getHardwareSerial();
  if (serial) {
    return `CPU-${serial}`;
  }
  
  // Fallback to MAC address of primary network interface
  try {
    const output = execSync('ip link show | grep "link/ether" | head -1', { 
      encoding: 'utf-8' 
    });
    const macMatch = output.match(/([0-9a-fA-F:]{17})/);
    if (macMatch && macMatch[1]) {
      return `MAC-${macMatch[1].replace(/:/g, '')}`;
    }
  } catch (error) {
    console.error('[Hardware] Error extracting MAC address:', error);
  }
  
  throw new Error('Unable to determine unique hardware identifier');
}

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
