
const mappings = {
  'orange_pi_one': {
    name: "Orange Pi One",
    pins: {
      // H3: PA=0, PG=192
      3: 12,  // PA12
      5: 11,  // PA11
      7: 6,   // PA6
      8: 198, // PG6
      10: 199,// PG7
      11: 1,  // PA1
      12: 7,  // PA7
      13: 0,  // PA0
      15: 3,  // PA3
      16: 19, // PA19
      18: 18, // PA18
      19: 15, // PA15
      21: 16, // PA16
      22: 2,  // PA2
      23: 14, // PA14
      24: 13, // PA13
      26: 10  // PA10
    }
  },
  'orange_pi_zero_3': {
    name: "Orange Pi Zero 3",
    pins: {
      // H618 / H616
      // Port PH base is often 224 (7 * 32)
      // Pin 3: PH5 -> 229
      // Pin 5: PH4 -> 228
      // Pin 7: PH9 -> 233
      // Pin 8: PH3 -> 227
      // Pin 10: PH6 -> 230
      // Pin 11: PC9 -> 73 (2 * 32 + 9)
      // Pin 12: PH8 -> 232
      // Pin 13: PC6 -> 70
      // Pin 15: PC5 -> 69
      3: 229,
      5: 228,
      7: 233,
      8: 227,
      10: 230,
      11: 73,
      12: 232,
      13: 70,
      15: 69
    }
  },
  'orange_pi_pc': {
    name: "Orange Pi PC",
    pins: {
      // H3 same as One mostly
      3: 12,
      5: 11,
      7: 6,
      8: 198,
      10: 199,
      11: 1,
      12: 7,
      13: 0,
      15: 3,
      16: 19,
      18: 18,
      19: 15,
      21: 16,
      22: 2,
      23: 14,
      24: 13,
      26: 10
    }
  },
  'orange_pi_5': {
    name: "Orange Pi 5",
    pins: {
      // RK3588S
      // Pin 3: GPIO1_D7 (1 * 32 + 3 * 8 + 7) = 55? Need verification
      // Often better to use gpiofind
      // Placeholder for now
      3: 151, // Example from some OPi5 map
      5: 150
    }
  }
};

function getOpPin(model, physicalPin) {
  if (!mappings[model]) return null;
  return mappings[model].pins[physicalPin];
}

module.exports = { mappings, getOpPin };
