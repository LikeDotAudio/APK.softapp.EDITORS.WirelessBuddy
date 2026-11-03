// Part of the APK.audio project — Anthony Kuzub
// MIT Licence.

export class WirelessSpectrumModel {
  constructor() {
    this.channels = [
      { id: 1, name: 'MIC 1 (LEAD)', freqMHz: 470.200, powerMw: 10, status: 'Clear' },
      { id: 2, name: 'MIC 2 (BACKING)', freqMHz: 471.050, powerMw: 10, status: 'Clear' },
      { id: 3, name: 'MIC 3 (HOST)', freqMHz: 472.125, powerMw: 10, status: 'Clear' },
      { id: 4, name: 'IEM 1 (STEREO)', freqMHz: 480.500, powerMw: 50, status: 'Clear' }
    ];
  }

  calculateIntermodOrders() {
    const freqs = this.channels.map(c => c.freqMHz);
    const imd3 = []; // 2*f1 - f2
    for (let i = 0; i < freqs.length; i++) {
      for (let j = 0; j < freqs.length; j++) {
        if (i !== j) {
          const f = Math.round((2 * freqs[i] - freqs[j]) * 1000) / 1000;
          imd3.push(f);
        }
      }
    }
    return imd3;
  }
}
