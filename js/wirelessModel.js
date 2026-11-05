// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

export class WirelessSpectrumModel {
  constructor(planName = 'MAIN-STAGE-RF') {
    this.planName = planName;
    this.minFreqMHz = 470.000;
    this.maxFreqMHz = 608.000;
    this.channels = [
      { id: 1, name: 'MIC 1 (LEAD)', freqMHz: 470.200, powerMw: 10, group: 'G1', channel: 'Ch01', status: 'Clear', antennaZone: 'Stage Left' },
      { id: 2, name: 'MIC 2 (BACKING)', freqMHz: 471.050, powerMw: 10, group: 'G1', channel: 'Ch02', status: 'Clear', antennaZone: 'Stage Left' },
      { id: 3, name: 'MIC 3 (HOST)', freqMHz: 472.125, powerMw: 10, group: 'G1', channel: 'Ch03', status: 'Clear', antennaZone: 'Stage Right' },
      { id: 4, name: 'IEM 1 (STEREO)', freqMHz: 480.500, powerMw: 50, group: 'G2', channel: 'Ch01', status: 'Clear', antennaZone: 'Broadcast IEM' }
    ];
    this.nextId = 5;
    this.refreshConflicts();
  }

  addChannel(name = 'NEW MIC', freqMHz = 475.000, powerMw = 10, antennaZone = 'Main Array') {
    const ch = {
      id: this.nextId++,
      name: name,
      freqMHz: parseFloat(freqMHz) || 475.000,
      powerMw: parseInt(powerMw, 10) || 10,
      group: 'G1',
      channel: `Ch0${this.channels.length + 1}`,
      status: 'Clear',
      antennaZone: antennaZone
    };
    this.channels.push(ch);
    this.refreshConflicts();
    return ch;
  }

  removeChannel(idOrIdx) {
    if (typeof idOrIdx === 'number' && idOrIdx < this.channels.length && !this.channels.some(c => c.id === idOrIdx)) {
      const removed = this.channels.splice(idOrIdx, 1)[0];
      this.refreshConflicts();
      return removed;
    }
    const idx = this.channels.findIndex(c => c.id === idOrIdx);
    if (idx !== -1) {
      const removed = this.channels.splice(idx, 1)[0];
      this.refreshConflicts();
      return removed;
    }
    return null;
  }

  updateChannel(index, field, value) {
    if (this.channels[index]) {
      if (field === 'freqMHz') {
        this.channels[index][field] = parseFloat(value) || 0;
      } else if (field === 'powerMw') {
        this.channels[index][field] = parseInt(value, 10) || 10;
      } else {
        this.channels[index][field] = value;
      }
      this.refreshConflicts();
    }
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

  refreshConflicts() {
    const imd3 = this.calculateIntermodOrders();
    const safetyDelta = 0.250; // 250 kHz guard band

    this.channels.forEach((ch, idx) => {
      let isConflict = false;

      // Check proximity to other channels
      for (let i = 0; i < this.channels.length; i++) {
        if (i !== idx) {
          if (Math.abs(ch.freqMHz - this.channels[i].freqMHz) < safetyDelta) {
            isConflict = true;
            break;
          }
        }
      }

      // Check proximity to 3rd order IMD products
      if (!isConflict) {
        for (const imd of imd3) {
          if (Math.abs(ch.freqMHz - imd) < 0.150) {
            isConflict = true;
            break;
          }
        }
      }

      ch.status = isConflict ? 'Conflict' : 'Clear';
    });
  }

  toBlock() {
    return {
      type: 'rf_coordination',
      id: `rf_${this.planName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      planName: this.planName,
      minFreqMHz: this.minFreqMHz,
      maxFreqMHz: this.maxFreqMHz,
      channels: JSON.parse(JSON.stringify(this.channels))
    };
  }

  fromBlock(block = {}) {
    if (block.planName) this.planName = block.planName;
    if (block.minFreqMHz !== undefined) this.minFreqMHz = block.minFreqMHz;
    if (block.maxFreqMHz !== undefined) this.maxFreqMHz = block.maxFreqMHz;
    if (Array.isArray(block.channels)) {
      this.channels = JSON.parse(JSON.stringify(block.channels));
      this.nextId = this.channels.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1;
    }
    this.refreshConflicts();
  }
}
