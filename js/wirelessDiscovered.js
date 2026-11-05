// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* wirelessDiscovered.js — a radio the bus already knows, as a read-only row.

   Pure: a thing from APKSoftapp.discovered() and config/discovery.json in, a
   row out. Which leaves hold a channel, frequency, band or SSID is the config's
   `fields`; a value the scanner did not publish stays empty. The rest of the
   row is the shared Discovered panel's (APKSoftapp.thingRow, vendor/apk-softapp). */

export function field(thing, keys) {
  const fields = thing.fields || {};
  for (const k of keys || []) {
    for (const proto of Object.keys(fields)) {
      const v = fields[proto][k];
      if (v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '-') return String(v).trim();
    }
  }
  return '';
}

export function radioRow(thing, rules = {}, S = globalThis.APKSoftapp) {
  const f = rules.fields || {};
  return {
    ...S.thingRow(thing),
    ssid: field(thing, f.ssid),
    band: field(thing, f.band),
    channel: field(thing, f.channel),
    frequency: field(thing, f.frequency),
  };
}
