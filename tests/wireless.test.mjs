import test from 'node:test';
import assert from 'node:assert/strict';
import { WirelessSpectrumModel } from '../js/wirelessModel.js';

test('WirelessSpectrumModel tracks carrier frequencies and computes IMD3 products', () => {
  const rf = new WirelessSpectrumModel();
  assert.equal(rf.channels.length, 4);

  const imd = rf.calculateIntermodOrders();
  assert.ok(imd.length > 0);
  assert.equal(typeof imd[0], 'number');
});

test('WirelessSpectrumModel exports and imports block schemas correctly', () => {
  const rf = new WirelessSpectrumModel('FOH-WIRELESS');
  rf.addChannel('GUITAR WIRELESS', 476.500, 20, 'Stage Center');
  
  const block = rf.toBlock();
  assert.equal(block.type, 'rf_coordination');
  assert.equal(block.planName, 'FOH-WIRELESS');
  assert.equal(block.channels.length, 5);

  const restored = new WirelessSpectrumModel();
  restored.fromBlock(block);
  assert.equal(restored.planName, 'FOH-WIRELESS');
  assert.equal(restored.channels.length, 5);
});
