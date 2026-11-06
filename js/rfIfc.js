// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* rfIfc.js — THE RF PLAN'S .IFC TWIN (ROAD-3583). Save Model writes the native rf_coordination block
   AND this IFC4X3_ADD2 file through APKSoftapp.saveModel; Open Model reads it back to the same block.
   The spine (project, units, site, links, systems) is netIfc.js.

     the plan     IfcDistributionSystem AUDIOVISUAL, ObjectType 'RF PLAN', Name = the plan name;
                  Pset_DistributionSystemCommon.Reference = the block id; APK_RfPlan {MinFrequency,
                  MaxFrequency} (Hz); every carrier's two ports are its members (IfcRelAssignsToGroup)
     a carrier    two occurrences joined over the air:
                    the transmitter  IfcAudioVisualAppliance — MICROPHONE for a mic, USERDEFINED
                                     'IEM TRANSMITTER' for an in-ear monitor, else USERDEFINED
                                     'WIRELESS TRANSMITTER'; Name = the carrier's name, Tag = its id
                    the receiver     IfcAudioVisualAppliance RECEIVER (a mic's rack receiver, an IEM's bodypack)
                  each with one IfcDistributionPort WIRELESS AUDIOVISUAL (transmitter SOURCE 'RF OUT',
                  receiver SINK 'RF IN'), one IfcRelConnectsPorts transmitter → receiver (the RF link).
                  APK_RfCarrier on the transmitter's port: CarrierId, Frequency (Hz), TransmitPower (W),
                  Group, Channel, AntennaZone, Coordination (Clear | Conflict, the editor's IMD check)
     the types    one IfcAudioVisualApplianceType per role (wireless microphone, IEM transmitter,
                  wireless transmitter, wireless receiver), declared on the project
   IFC has no property for a carrier frequency on a port (Pset_AudioVisualApplianceTypeTuner is a tuner's),
   hence APK_RfCarrier, declared in DATABASE.server.BIM SRC/tools/ifc/apk_psets_editors.py. */

import { ifcModel, readIfc, ident, label, measure, num, str } from './netIfc.js';

export { schemaOf } from './netIfc.js';

const ROLES = {
  mic: { entity: 'IFCAUDIOVISUALAPPLIANCE', predefined: 'MICROPHONE', objectType: null, type: 'Wireless microphone' },
  iem: { entity: 'IFCAUDIOVISUALAPPLIANCE', predefined: 'USERDEFINED', objectType: 'IEM TRANSMITTER', type: 'IEM transmitter' },
  tx: { entity: 'IFCAUDIOVISUALAPPLIANCE', predefined: 'USERDEFINED', objectType: 'WIRELESS TRANSMITTER', type: 'Wireless transmitter' },
  rx: { entity: 'IFCAUDIOVISUALAPPLIANCE', predefined: 'RECEIVER', objectType: null, type: 'Wireless receiver' },
};

/** mic | iem | tx: what transmits a carrier, by its name (an IEM is an in-ear monitor; a mic, a vocal or handheld …). */
export function carrierKind(ch) {
  const n = str(ch && ch.name).toLowerCase();
  if (/\biem\b|in-?ear/.test(n)) return 'iem';
  if (/\bmic\b|microphone|vocal|vox|handheld|lav|headset/.test(n)) return 'mic';
  return 'tx';
}

const hz = (mhz) => Math.round(Number(mhz) * 1e6);
const watts = (mw) => Number(mw) / 1000;
const stemOf = (n) => String(n || 'rf_plan').replace(/\.(ifc|json)$/i, '');

/** The rf_coordination block (WirelessSpectrumModel.toBlock) as IFC4X3_ADD2 STEP text. */
export function rfToIfc(block, { name } = {}) {
  const b = block || {};
  const stem = stemOf(name || b.id);
  const planId = str(b.id) || stem;
  const m = ifcModel({ key: ['rf', planId], name: b.planName || stem, description: 'Wireless RF Buddy: wireless mic / IEM carriers',
    app: 'APK.audio Wireless RF Buddy', appId: 'EDITORS.WirelessBuddy', storey: 'RF' });
  const storey = m.space('');

  const planGid = m.gid('plan');
  const plan = m.system({ gid: planGid, name: str(b.planName) || stem, objectType: 'RF PLAN', longName: str(b.planName) || null, predefined: 'AUDIOVISUAL' });
  m.pset('Pset_DistributionSystemCommon', planGid, [m.prop('Reference', ident(planId))], [plan]);
  const lo = num(b.minFreqMHz);
  const hi = num(b.maxFreqMHz);
  m.pset('APK_RfPlan', planGid, [
    lo != null ? m.prop('MinFrequency', measure('IFCFREQUENCYMEASURE', hz(lo))) : null,
    hi != null ? m.prop('MaxFrequency', measure('IFCFREQUENCYMEASURE', hz(hi))) : null,
  ], [plan]);

  const types = {};
  const typeFor = (role) => {
    if (!types[role]) {
      const r = ROLES[role];
      types[role] = m.type(`${r.entity}TYPE`, { gid: m.gid('type', role), name: r.type, elementType: r.objectType, predefined: r.predefined });
    }
    return types[role];
  };

  const members = [];
  (Array.isArray(b.channels) ? b.channels : []).forEach((ch, i) => {
    const key = str(ch.id ?? i);
    const role = carrierKind(ch);
    const r = ROLES[role];
    const txGid = m.gid('carrier', key, 'tx');
    const tx = m.element(r.entity, { gid: txGid, name: str(ch.name) || `Carrier ${key}`, objectType: r.objectType, tag: key, predefined: r.predefined });
    m.typeOf(tx, typeFor(role));
    const rxGid = m.gid('carrier', key, 'rx');
    const rx = m.element('IFCAUDIOVISUALAPPLIANCE', { gid: rxGid, name: `${str(ch.name) || `Carrier ${key}`} RX`, tag: key, predefined: 'RECEIVER' });
    m.typeOf(rx, typeFor('rx'));
    m.contain(tx, storey);
    m.contain(rx, storey);

    const outGid = m.gid('carrier', key, 'tx', 'port');
    const out = m.port({ gid: outGid, name: 'RF OUT', flow: 'SOURCE', kind: 'WIRELESS', system: 'AUDIOVISUAL' });
    const inGid = m.gid('carrier', key, 'rx', 'port');
    const inp = m.port({ gid: inGid, name: 'RF IN', flow: 'SINK', kind: 'WIRELESS', system: 'AUDIOVISUAL' });
    m.nest(tx, txGid, [out]);
    m.nest(rx, rxGid, [inp]);
    const f = num(ch.freqMHz);
    const p = num(ch.powerMw);
    m.pset('APK_RfCarrier', outGid, [
      m.prop('CarrierId', ident(key)),
      f != null ? m.prop('Frequency', measure('IFCFREQUENCYMEASURE', hz(f))) : null,
      p != null ? m.prop('TransmitPower', measure('IFCPOWERMEASURE', watts(p))) : null,
      ch.group ? m.prop('Group', label(ch.group)) : null,
      ch.channel ? m.prop('Channel', label(ch.channel)) : null,
      ch.antennaZone ? m.prop('AntennaZone', label(ch.antennaZone)) : null,
      ch.status ? m.prop('Coordination', label(ch.status)) : null,
    ], [out]);
    m.connect(out, inp, { gid: m.rel('connects', outGid), name: str(ch.name) || null });
    members.push(out, inp);
  });
  m.group(plan, planGid, members);
  return m.finish(stem);
}

/** An IFC model → the rf_coordination block; throws a sentence when the file holds no RF plan. */
export function rfFromIfc(textIn) {
  const x = readIfc(textIn);
  const plan = x.byType('IFCDISTRIBUTIONSYSTEM').find((s) => x.objectType(s) === 'RF PLAN');
  if (!plan) throw new TypeError("no RF plan in this IFC: it has no IfcDistributionSystem with ObjectType 'RF PLAN'");
  const ps = x.psets(plan);
  const mhz = (v) => (v == null ? undefined : v / 1e6);
  const channels = [];
  for (const port of x.members(plan)) {
    const c = x.psets(port).APK_RfCarrier;
    if (!c) continue;
    const tx = x.host(port);
    const id = str(c.CarrierId);
    const ch = { id: /^\d+$/.test(id) ? Number(id) : id, name: x.name(tx) };
    if (c.Frequency != null) ch.freqMHz = mhz(c.Frequency);
    if (c.TransmitPower != null) ch.powerMw = Math.round(c.TransmitPower * 1e6) / 1e3;
    ch.group = str(c.Group);
    ch.channel = str(c.Channel);
    ch.status = str(c.Coordination) || 'Clear';
    ch.antennaZone = str(c.AntennaZone);
    channels.push(ch);
  }
  const plans = ps.APK_RfPlan || {};
  const block = {
    type: 'rf_coordination',
    id: str(ps.Pset_DistributionSystemCommon?.Reference),
    planName: x.name(plan),
    channels,
  };
  if (plans.MinFrequency != null) block.minFreqMHz = mhz(plans.MinFrequency);
  if (plans.MaxFrequency != null) block.maxFreqMHz = mhz(plans.MaxFrequency);
  return block;
}

