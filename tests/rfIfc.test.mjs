// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// ROAD-3583: the RF plan's .ifc twin (js/rfIfc.js) — written byte-deterministically, read back to the same
// block. IFC_OUT=<dir> npm test also writes the file there, for IfcOpenShell validate + the BIM oracle
// (DATABASE.server.BIM SRC/tools/ifc/editors_census.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WirelessSpectrumModel } from '../js/wirelessModel.js';
import { rfToIfc, rfFromIfc, carrierKind, schemaOf } from '../js/rfIfc.js';

function out(name, text) {
  if (!process.env.IFC_OUT) return;
  mkdirSync(process.env.IFC_OUT, { recursive: true });
  writeFileSync(join(process.env.IFC_OUT, name), text);
}

function plan() {
  const m = new WirelessSpectrumModel('FOH-WIRELESS');
  m.addChannel('GUITAR WIRELESS', 476.5, 20, 'Stage Center');
  m.addChannel('MIC 6 (SPARE)', 470.4, 10, 'Stage Left');   // 200 kHz off MIC 1: a conflict
  return m.toBlock();
}

test('the RF plan: the same plan writes the same bytes, and reads back to the same block', () => {
  const block = plan();
  const a = rfToIfc(block, { name: block.id });
  assert.equal(a, rfToIfc(JSON.parse(JSON.stringify(block)), { name: block.id }));
  assert.match(a, /^ISO-10303-21;/);
  assert.equal(schemaOf(a), 'IFC4X3_ADD2');
  assert.match(a, /IFCDISTRIBUTIONSYSTEM\('[^']+',\$,'FOH-WIRELESS',\$,'RF PLAN','FOH-WIRELESS',\.AUDIOVISUAL\.\)/);
  assert.match(a, /'MinFrequency',\$,IFCFREQUENCYMEASURE\(470000000\.\)/);
  assert.match(a, /'Frequency',\$,IFCFREQUENCYMEASURE\(470200000\.\)/);
  assert.match(a, /'TransmitPower',\$,IFCPOWERMEASURE\(0\.01\)/);
  assert.equal((a.match(/IFCDISTRIBUTIONPORT\(/g) || []).length, 2 * block.channels.length);
  assert.equal((a.match(/\.WIRELESS\./g) || []).length, 2 * block.channels.length);
  assert.equal((a.match(/IFCRELCONNECTSPORTS\(/g) || []).length, block.channels.length);
  assert.match(a, /'Coordination',\$,IFCLABEL\('Conflict'\)/);
  out('wireless-rf-plan.ifc', a);
  const b = rfFromIfc(a);
  assert.deepEqual(b, block);
  assert.equal(rfToIfc(b, { name: block.id }), a, 'read and written again: the same file');
});

test('who transmits: a mic, an IEM transmitter, else a wireless transmitter; every carrier has a receiver', () => {
  assert.equal(carrierKind({ name: 'MIC 1 (LEAD)' }), 'mic');
  assert.equal(carrierKind({ name: 'IEM 1 (STEREO)' }), 'iem');
  assert.equal(carrierKind({ name: 'GUITAR WIRELESS' }), 'tx');
  const a = rfToIfc(plan(), { name: 'p' });
  assert.match(a, /IFCAUDIOVISUALAPPLIANCE\('[^']+',\$,'MIC 1 \(LEAD\)',\$,\$,\$,\$,'1',\.MICROPHONE\.\)/);
  assert.match(a, /IFCAUDIOVISUALAPPLIANCE\('[^']+',\$,'IEM 1 \(STEREO\)',\$,'IEM TRANSMITTER',\$,\$,'4',\.USERDEFINED\.\)/);
  assert.match(a, /IFCAUDIOVISUALAPPLIANCE\('[^']+',\$,'IEM 1 \(STEREO\) RX',\$,\$,\$,\$,'4',\.RECEIVER\.\)/);
  assert.match(a, /IFCAUDIOVISUALAPPLIANCETYPE\('[^']+',\$,'IEM transmitter',\$,\$,\$,\$,\$,'IEM TRANSMITTER',\.USERDEFINED\.\)/);
});

test('an emptied plan still writes and reads; a file with no RF plan is a sentence, never a half-read block', () => {
  const m = new WirelessSpectrumModel('EMPTY');
  m.channels = [];
  const a = rfToIfc(m.toBlock(), { name: 'rf_empty' });
  assert.deepEqual(rfFromIfc(a).channels, []);
  assert.throws(() => rfFromIfc(a.replace("'RF PLAN'", "'OTHER'")), /no RF plan in this IFC/);
});
