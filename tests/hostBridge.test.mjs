// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* ROAD-3488: the rf_coordination block goes in and out over
   cad.like.audio/host@1 (vendor/apk-softapp), never '*'; the radios the bus
   knows are shown as rows keyed on their MAC, never copied into the plan. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { world, hostContract, discovery, ORIGIN } from './softappWorld.mjs';
import { WirelessSpectrumModel } from '../js/wirelessModel.js';
import { radioRow } from '../js/wirelessDiscovered.js';

const rules = JSON.parse(fs.readFileSync(new URL('../config/discovery.json', import.meta.url)));

function editor(S) {
  const model = new WirelessSpectrumModel();
  const host = S.connectHost({
    editor: 'Wireless RF Buddy', blockType: 'rf_coordination', notice: false,
    onLoad: (block) => model.fromBlock(block),
    onRequest: () => ({ block: model.toBlock(), meta: { name: model.planName } }),
  });
  return { model, host };
}

test('block round trip: load from the CAD, edit, request answers blockSave with the edit, at our origin', async () => {
  const { S, toParent, fire } = world();
  const { model } = editor(S);
  const sent = new WirelessSpectrumModel('ARENA-RF');
  fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: sent.toBlock(), meta: { blockName: 'RF_ARENA' } });
  assert.equal(model.planName, 'ARENA-RF');
  assert.equal(model.nextId, 5, 'ids continue after the loaded carriers');
  model.updateChannel(0, 'freqMHz', '470.900');
  fire({ protocol: 'cad.like.audio/host@1', type: 'request' });
  const save = toParent.at(-1);
  assert.equal(save.o, ORIGIN);
  assert.equal(save.m.type, 'blockSave');
  assert.equal(save.m.blockType, 'rf_coordination');
  assert.equal(save.m.block.channels[0].freqMHz, 470.9);
  assert.equal(save.m.meta.blockName, 'RF_ARENA');
  const contract = await hostContract();
  if (contract) for (const { m } of toParent) assert.deepEqual(contract.validateMessage(contract.schema, 'toCad', m), [], m.type);
});

test('the old private APK_LOAD_BLOCK and a foreign source are ignored', () => {
  const { S, fire } = world();
  const { model } = editor(S);
  fire({ type: 'APK_LOAD_BLOCK', block: { planName: 'OLD' } });
  fire({ protocol: 'cad.like.audio/host@1', type: 'load', block: { planName: 'X' } }, { source: {} });
  assert.equal(model.planName, 'MAIN-STAGE-RF');
});

test('a Wi-Fi radio on the bus is a row keyed on its MAC with the leaves the config names', () => {
  const { S, win } = world({ contracts: true });
  if (!win.APKContracts) return;
  const { model: disc, roots } = discovery(S, win, Date.parse('2026-11-04T12:00:00Z'));
  const dev = `${roots.protocols}/wifi/Device/0c_80_63_11_22_33`;
  disc.ingest(`${dev}/mac`, '0c:80:63:11:22:33');
  disc.ingest(`${dev}/ssid`, 'PROD-NET');
  disc.ingest(`${dev}/channel`, '36');
  disc.ingest(`${dev}/band`, '5 GHz');
  const things = disc.things().filter((t) => rules.kinds.some((k) => t.kinds.some((x) => x.includes(k))));
  assert.equal(things.length, 1);
  const row = radioRow(things[0], rules, S);
  assert.equal(row.identity, '0c:80:63:11:22:33');
  assert.equal(row.ssid, 'PROD-NET');
  assert.equal(row.channel, '36');
  assert.equal(row.frequency, '', 'not published, not guessed');
  assert.ok(['good', 'kinda', 'dead'].includes(row.state) && row.why);
});

test('an access point PLUGIN.WIFI files under Network/ is a row too, with the bench leaves (frequency_mhz)', () => {
  const { S, win } = world({ contracts: true });
  if (!win.APKContracts) return;
  const { model: disc, roots } = discovery(S, win, Date.parse('2026-11-04T12:00:00Z'), { collections: rules.collections });
  // as the bench broker carried it on 2026-11-04 (ROAD-3502)
  const ap = `${roots.protocols}/wifi/Network/wifi_0e_ac_8a_c1_81_7f`;
  disc.ingest(`${ap}/device_class`, 'Wi-Fi Access Point');
  disc.ingest(`${ap}/serial`, '0e:ac:8a:c1:81:7f');
  disc.ingest(`${ap}/ssid`, 'BELL670');
  disc.ingest(`${ap}/channel`, '157');
  disc.ingest(`${ap}/frequency_mhz`, '5785');
  disc.ingest(`${ap}/band`, '5 GHz');
  const things = disc.things().filter((t) => rules.kinds.some((k) => t.kinds.some((x) => x.includes(k))));
  assert.equal(things.length, 1);
  const row = radioRow(things[0], rules, S);
  assert.equal(row.identity, '0e:ac:8a:c1:81:7f', 'the BSSID, never an address');
  assert.deepEqual([row.ssid, row.channel, row.frequency, row.band], ['BELL670', '157', '5785', '5 GHz']);
});

test('a carrier a wireless importer files under Device/ is a row with its frequency (ROAD-3519)', () => {
  const { S, win } = world({ contracts: true });
  if (!win.APKContracts) return;
  const { model: disc, roots } = discovery(S, win, Date.parse('2026-11-04T12:00:00Z'), { collections: rules.collections });
  // the leaves DATATYPE.wireless.SHUREwirelessWorkbench says per carrier (src/carriers.rs LEAVES)
  const dev = `${roots.protocols}/wireless_wwb/Device/wireless_wwb_plan_0123456789abcdef`;
  disc.ingest(`${dev}/name`, 'P10T');
  disc.ingest(`${dev}/device_class`, 'Wireless Transmitter');
  disc.ingest(`${dev}/frequency_mhz`, '472.550');
  disc.ingest(`${dev}/channel`, '1');
  disc.ingest(`${dev}/band`, 'G10');
  disc.ingest(`${dev}/model`, 'PSM1000');
  disc.ingest(`${dev}/manufacturer`, 'Shure');
  const things = disc.things().filter((t) => rules.kinds.some((k) => t.kinds.some((x) => x.includes(k))));
  assert.equal(things.length, 1);
  const row = radioRow(things[0], rules, S);
  assert.deepEqual([row.channel, row.frequency, row.band, row.ssid], ['1', '472.550', 'G10', '']);
  assert.ok(!/^\d+\.\d+\.\d+\.\d+$/.test(row.identity), 'never an IP');
});
