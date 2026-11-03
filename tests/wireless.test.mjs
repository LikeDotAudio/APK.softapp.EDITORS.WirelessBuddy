import test from 'node:test';
import assert from 'node:assert/strict';
import { WirelessSpectrumModel } from '../js/wirelessApp.js';

test('WirelessSpectrumModel tracks carrier frequencies and computes IMD3 products', () => {
  const rf = new WirelessSpectrumModel();
  assert.equal(rf.channels.length, 4);

  const imd = rf.calculateIntermodOrders();
  assert.ok(imd.length > 0);
  assert.equal(typeof imd[0], 'number');
});
