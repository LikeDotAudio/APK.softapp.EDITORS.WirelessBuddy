// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/* netIfc.js — THE SPINE OF A DEVICES-AND-LINKS MODEL AS IFC4X3_ADD2 (ROAD-3583), and the index to read one
   back. The same bytes in EDITORS.WirelessBuddy, EDITORS.Device, DATATYPE.NetBox and
   DATATYPE.TopologyManifest: change them together. Each app's own module (rfIfc.js, deviceIfc.js,
   netboxIfc.js, topologyIfc.js) says what its model is; this one writes the parts every such file shares:

     IfcProject (units: mm, kg, W, Hz) ─ IfcSite (one per site name) ─ IfcBuilding ─
       IfcBuildingStorey ─ IfcSpace (one per room name)
     occurrences  IfcAudioVisualAppliance / IfcCommunicationsAppliance / IfcDistributionElement …, each in
                  one spatial container (IfcRelContainedInSpatialStructure) or aggregated under a rack
     types        IfcXxxType declared on the project (IfcRelDeclares), IfcRelDefinesByType to occurrences;
                  a BIM part's type has the part's GlobalId ifcGuid('part', id)
     ports        IfcDistributionPort nested on their element (IfcRelNests), in order
     links        IfcRelConnectsPorts (RelatingPort SOURCE / SOURCEANDSINK, RelatedPort SINK / SOURCEANDSINK)
     systems      IfcDistributionSystem / IfcDistributionCircuit, ports by IfcRelAssignsToGroup, the system
                  serving the building (IfcRelServicesBuildings)
     sets         Pset_ (ISO 16739-1:2024 templates) or APK_ declared in DATABASE.server.BIM SRC/tools/ifc
                  apk_psets*.py

   Written with the contracts STEP codec (vendor/apk-contracts/apk-ifc.js, scripts/vendor-ifc.mjs); no
   IfcOpenShell in the page. Byte-deterministic: a fixed time stamp, GlobalIds from ifcGuid roles (never
   an IP; a MAC-identified occurrence is inst/mac:<mac>, the site-wide rule). */

import { entitiesByType, enumv, getPsets, ifcGuid, isRef, parseStep, real, ref, typed, unwrap, writeStep } from '../vendor/apk-contracts/apk-ifc.js';

export { ifcGuid };
export const IFC_SCHEMA = 'IFC4X3_ADD2';
const STAMP = '1970-01-01T00:00:00';   // fixed: the file is a function of the model, never of the clock

export const str = (v) => (v == null ? '' : String(v));
export const label = (s) => typed('IFCLABEL', String(s));
export const ident = (s) => typed('IFCIDENTIFIER', String(s));
export const text = (s) => typed('IFCTEXT', String(s));
export const int = (n) => typed('IFCINTEGER', Math.trunc(n));
export const measure = (type, v) => typed(type, real(v));
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v
  : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
export const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i;

/** The schema an .ifc text declares (FILE_SCHEMA), '' when none. */
export function schemaOf(textIn) {
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(String(textIn || ''));
  return m ? m[1] : '';
}

/** The IfcDistributionSystemEnum word a signal reads as (the wirelist's rule). */
export function systemTypeOf(signal) {
  const t = String(signal || '').toLowerCase();
  if (!t) return 'NOTDEFINED';
  if (/earth|ground/.test(t)) return 'EARTHING';
  if (/power|mains|\bac\b|\bdc\b|\bpoe\b/.test(t)) return 'ELECTRICAL';
  if (/network|ethernet|\blan\b|dante|aes67|2110|\bip\b|\bdata\b|cat ?5|cat ?6|fib(er|re)|sfp/.test(t)) return 'DATA';
  if (/speaker|loudspeaker|\bpa\b/.test(t)) return 'ELECTROACOUSTIC';
  if (/video|sdi|hdmi|\b(3|6|12)g\b|dvi|displayport|audio|aes|mic|line|analog|madi|adat/.test(t)) return 'AUDIOVISUAL';
  if (/control|rs-?232|rs-?422|rs-?485|gpio|gpi|midi|serial|dmx|usb/.test(t)) return 'CONTROL';
  return 'SIGNAL';
}

/** A connector word → its ISO 16739 port words (Pset_DistributionPortTypeCable); null for none. */
export function connectorWords(connector) {
  const c = String(connector || '').trim();
  if (!c || /^blank/i.test(c)) return null;
  const t = c.toLowerCase();
  let type = 'OTHER';
  if (/powercon|iec|\bac\b|nema|schuko/.test(t)) type = 'ACPLUG';
  else if (/xlr/.test(t)) type = 'XLR';
  else if (/ethercon|rj-?45|\blan\b|8p8c|\bcat ?\d/.test(t)) type = 'RJ';
  else if (/bnc|coax/.test(t)) type = 'COAXIAL';
  else if (/\btrs\b|\btt\b|tt-|bantam|1\/4|6\.35|jack/.test(t)) type = 'TRS';
  else if (/hdmi/.test(t)) type = 'HDMI';
  else if (/usb/.test(t)) type = 'USB';
  else if (/\bdb-?\d+|d-?sub/.test(t)) type = 'DSUB';
  else if (/rca|phono/.test(t)) type = 'RCA';
  else if (/\bdvi/.test(t)) type = 'DVI';
  else if (/\bdin\b/.test(t)) type = 'DIN';
  const gender = /female|socket|(^|[-\s])f$/i.test(c) ? 'FEMALE' : /\bmale\b|plug|(^|[-\s])m$/i.test(c) ? 'MALE' : null;
  return { type, gender, subtype: c };
}

/* What an equipment word is in IFC: the occurrence class, its PredefinedType, and the type class.
   A word that names no ISO kind is the class's USERDEFINED with the word as ObjectType. */
const KINDS = [
  [/\brouter\b/, 'IFCCOMMUNICATIONSAPPLIANCE', 'ROUTER'],
  [/gateway|firewall/, 'IFCCOMMUNICATIONSAPPLIANCE', 'GATEWAY'],
  [/switch(?!er)|\bsw\b|network/, 'IFCCOMMUNICATIONSAPPLIANCE', 'IPNETWORKEQUIPMENT'],
  [/access ?point|\bwap\b|\bap\b/, 'IFCCOMMUNICATIONSAPPLIANCE', 'NETWORKAPPLIANCE'],
  [/computer|server|\bpc\b|laptop|workstation/, 'IFCCOMMUNICATIONSAPPLIANCE', 'COMPUTER'],
  [/antenna/, 'IFCCOMMUNICATIONSAPPLIANCE', 'ANTENNA'],
  [/microphone|\bmic\b/, 'IFCAUDIOVISUALAPPLIANCE', 'MICROPHONE'],
  [/receiver/, 'IFCAUDIOVISUALAPPLIANCE', 'RECEIVER'],
  [/amplifier|\bamp\b/, 'IFCAUDIOVISUALAPPLIANCE', 'AMPLIFIER'],
  [/speaker/, 'IFCAUDIOVISUALAPPLIANCE', 'SPEAKER'],
  [/camera/, 'IFCAUDIOVISUALAPPLIANCE', 'CAMERA'],
  [/display|monitor|screen/, 'IFCAUDIOVISUALAPPLIANCE', 'DISPLAY'],
  [/projector/, 'IFCAUDIOVISUALAPPLIANCE', 'PROJECTOR'],
  [/recorder/, 'IFCAUDIOVISUALAPPLIANCE', 'RECORDINGEQUIPMENT'],
  [/player/, 'IFCAUDIOVISUALAPPLIANCE', 'PLAYER'],
  [/switcher|matrix|router_av|vision.?mixer/, 'IFCAUDIOVISUALAPPLIANCE', 'SWITCHER'],
];

/** { entity, predefined, objectType } for an equipment word ('SWITCH', 'Processor', 'DSP_CORE' …). */
export function kindOf(word, { fallback = 'IFCAUDIOVISUALAPPLIANCE' } = {}) {
  const w = str(word).trim();
  const t = w.toLowerCase().replace(/_/g, ' ');
  for (const [re, entity, predefined] of KINDS) if (re.test(t)) return { entity, predefined, objectType: null };
  return { entity: fallback, predefined: 'USERDEFINED', objectType: w || 'Device' };
}

const NO_PREDEFINED = new Set(['IFCDISTRIBUTIONELEMENT']);

/**
 * A model under construction. key: the roles of the project's GlobalId (ifcGuid(...key)); every other
 * GlobalId is decl/<project>/<roles> or rel/<kind>/<…>, so the same model saved again keeps them all.
 */
export function ifcModel({ key, name, description = null, app, appId, storey = 'Model' }) {
  const entities = [];
  const add = (type, ...args) => { entities.push({ id: entities.length + 1, type, args }); return ref(entities.length); };
  const P = ifcGuid(...key);
  const gid = (...roles) => ifcGuid('decl', P, ...roles);
  const rel = (...roles) => ifcGuid('rel', ...roles);
  const used = new Set();

  const si = (t, prefix, n) => add('IFCSIUNIT', { kind: 'derived' }, enumv(t), prefix ? enumv(prefix) : null, enumv(n));
  const units = add('IFCUNITASSIGNMENT', [si('LENGTHUNIT', 'MILLI', 'METRE'), si('MASSUNIT', 'KILO', 'GRAM'),
    si('POWERUNIT', null, 'WATT'), si('FREQUENCYUNIT', null, 'HERTZ')]);
  const origin = add('IFCAXIS2PLACEMENT3D', add('IFCCARTESIANPOINT', [real(0), real(0), real(0)]), null, null);
  const ctx = add('IFCGEOMETRICREPRESENTATIONCONTEXT', null, 'Model', 3, real(1e-5), origin, null);
  const project = add('IFCPROJECT', P, null, str(name) || null, description, null, null, null, [ctx], units);

  const sites = new Map();
  const later = [];          // relationships written at the end, in the order they were asked for
  const nests = [];
  const declared = [];
  const typed_ = new Map();  // type ref id -> { ref, gid, occ: [] }
  const contained = new Map(); // container ref id -> { ref, gid, list }

  /** The site (IfcSite, its IfcBuilding and IfcBuildingStorey) a name stands for; '' is the one unnamed site. */
  function site(siteName = '') {
    const k = str(siteName);
    if (sites.has(k)) return sites.get(k);
    const role = k ? ['site', k] : ['site'];
    const sitePl = add('IFCLOCALPLACEMENT', null, origin);
    const buildingPl = add('IFCLOCALPLACEMENT', sitePl, origin);
    const storeyPl = add('IFCLOCALPLACEMENT', buildingPl, origin);
    const s = { gid: gid(...role), buildingGid: gid(...role, 'building'), storeyGid: gid(...role, 'storey'), storeyPl, spaces: new Map(), spaceList: [] };
    s.ref = add('IFCSITE', s.gid, null, k || null, null, null, sitePl, null, null, enumv('ELEMENT'), null, null, null, null, null);
    s.building = add('IFCBUILDING', s.buildingGid, null, 'Building', null, null, buildingPl, null, null, enumv('ELEMENT'), null, null, null);
    s.storey = add('IFCBUILDINGSTOREY', s.storeyGid, null, storey, null, null, storeyPl, null, null, enumv('ELEMENT'), real(0));
    sites.set(k, s);
    return s;
  }

  /** The IfcSpace for a room name on a site ('' is the storey itself). */
  function space(roomName = '', siteName = '') {
    const s = site(siteName);
    const r = str(roomName).trim();
    if (!r) return { ref: s.storey, gid: s.storeyGid };
    if (s.spaces.has(r)) return s.spaces.get(r);
    const spaceGid = gid(...(siteName ? ['site', siteName] : ['site']), 'space', r);
    const sp = { gid: spaceGid, ref: add('IFCSPACE', spaceGid, null, r, null, null, add('IFCLOCALPLACEMENT', s.storeyPl, origin), null, null, enumv('ELEMENT'), enumv('NOTDEFINED'), null) };
    s.spaces.set(r, sp);
    s.spaceList.push(sp.ref);
    return sp;
  }

  /** Put an element into a spatial container (a space or the storey; see space()). */
  function contain(element, container) {
    const c = contained.get(container.ref.id) || { ...container, list: [] };
    c.list.push(element);
    contained.set(container.ref.id, c);
  }

  const prop = (n, v) => (v == null || v === '' ? null : add('IFCPROPERTYSINGLEVALUE', n, null, v, null));
  const enumProp = (n, v) => (v ? add('IFCPROPERTYENUMERATEDVALUE', n, null, [label(v)], null) : null);
  const listProp = (n, vs) => (vs && vs.length ? add('IFCPROPERTYLISTVALUE', n, null, vs, null) : null);

  /** A property set on ownerGid's owners (an occurrence: IfcRelDefinesByProperties); no owners → the set,
      for a type's HasPropertySets. Null when no property has a value. */
  function pset(setName, ownerGid, props, owners) {
    const list = props.filter(Boolean);
    if (!list.length) return null;
    const ps = add('IFCPROPERTYSET', rel('pset', ownerGid, setName), null, setName, null, list);
    if (owners) add('IFCRELDEFINESBYPROPERTIES', rel('props', ownerGid, setName), null, null, null, owners, ps);
    return ps;
  }

  /** A unique GlobalId: the wanted one, else (a second object claiming it) the fallback roles. */
  function unique(want, ...fallback) {
    const g = used.has(want) ? gid(...fallback) : want;
    used.add(g);
    return g;
  }

  /** An occurrence: entity IFCAUDIOVISUALAPPLIANCE …; Name, Description, ObjectType, Tag, PredefinedType. */
  function element(entity, { gid: g, name: n = null, description: d = null, objectType = null, tag = null, predefined = null }) {
    if (entity === 'IFCELEMENTASSEMBLY') {
      return add(entity, g, null, n, d, objectType, null, null, tag, null, predefined ? enumv(predefined) : null);
    }
    const args = [g, null, n, d, objectType, null, null, tag];
    if (!NO_PREDEFINED.has(entity)) args.push(predefined ? enumv(predefined) : null);
    return add(entity, ...args);
  }

  /** A type (declared on the project): IFCAUDIOVISUALAPPLIANCETYPE …; sets = its property sets. */
  function type(entity, { gid: g, name: n = null, description: d = null, tag = null, elementType = null, predefined = null, sets = [] }) {
    const list = sets.filter(Boolean);
    const t = add(entity, g, null, n, d, null, list.length ? list : null, null, tag, elementType, predefined ? enumv(predefined) : null);
    declared.push(t);
    typed_.set(t.id, { ref: t, gid: g, occ: [] });
    return t;
  }

  function typeOf(occurrence, t) { typed_.get(t.id).occ.push(occurrence); }

  /** A port: IfcDistributionPort, flow SOURCE | SINK | SOURCEANDSINK, kind CABLE | WIRELESS, system DATA …. */
  function port({ gid: g, name: n = null, description: d = null, flow = 'SOURCEANDSINK', kind = 'CABLE', system = 'NOTDEFINED' }) {
    return add('IFCDISTRIBUTIONPORT', g, null, n, d, null, null, null, enumv(flow), enumv(kind), enumv(system || 'NOTDEFINED'));
  }

  function nest(host, hostGid, ports) { if (ports.length) nests.push([host, hostGid, ports]); }

  /** RelatingPort → RelatedPort (realizing: the cable, or null). */
  function connect(a, z, { gid: g, name: n = null, realizing = null }) {
    later.push(() => add('IFCRELCONNECTSPORTS', g, null, n, null, a, z, realizing));
  }

  /** A system: IFCDISTRIBUTIONSYSTEM | IFCDISTRIBUTIONCIRCUIT; serves the building of `siteName`. */
  function system({ entity = 'IFCDISTRIBUTIONSYSTEM', gid: g, name: n = null, description: d = null, objectType = null, longName = null, predefined = 'NOTDEFINED', serves = true, siteName = '' }) {
    const s = add(entity, g, null, n, d, objectType, longName, enumv(predefined));
    if (serves) later.push(() => add('IFCRELSERVICESBUILDINGS', rel('serves', g), null, null, null, s, [site(siteName).building]));
    return s;
  }

  /** Members of a group (a system's ports or elements), one IfcRelAssignsToGroup named `n`. */
  function group(sys, sysGid, members, n = 'Members') {
    if (members.length) later.push(() => add('IFCRELASSIGNSTOGROUP', rel('group', sysGid, n), null, n, null, members, null, sys));
  }

  /** A whole and its parts (IfcRelAggregates): a rack and its devices, a system and its sub-systems. */
  function aggregate(whole, wholeGid, parts, n = null) {
    if (parts.length) later.push(() => add('IFCRELAGGREGATES', rel('aggregates', wholeGid, n || 'parts'), null, n, null, whole, parts));
  }

  /** The finished STEP text. fileName is the file stem. */
  function finish(fileName) {
    if (!sites.size) site('');
    add('IFCRELAGGREGATES', rel('aggregates', P), null, null, null, project, [...sites.values()].map((s) => s.ref));
    for (const s of sites.values()) {
      add('IFCRELAGGREGATES', rel('aggregates', s.gid), null, null, null, s.ref, [s.building]);
      add('IFCRELAGGREGATES', rel('aggregates', s.buildingGid), null, null, null, s.building, [s.storey]);
      if (s.spaceList.length) add('IFCRELAGGREGATES', rel('aggregates', s.storeyGid), null, null, null, s.storey, s.spaceList);
    }
    if (declared.length) add('IFCRELDECLARES', rel('declares', P), null, null, null, project, declared);
    for (const t of typed_.values()) if (t.occ.length) add('IFCRELDEFINESBYTYPE', rel('type', t.gid), null, null, null, t.occ, t.ref);
    for (const [host, hostGid, list] of nests) add('IFCRELNESTS', rel('nests', hostGid), null, null, null, host, list);
    for (const f of later) f();
    for (const c of contained.values()) add('IFCRELCONTAINEDINSPATIALSTRUCTURE', rel('contains', c.gid), null, null, null, c.list, c.ref);
    return writeStep({
      header: [
        { type: 'FILE_DESCRIPTION', args: [['ViewDefinition [ReferenceView]'], '2;1'] },
        { type: 'FILE_NAME', args: [`${fileName}.ifc`, STAMP, ['APK.audio'], ['APK.audio'], app, appId, ''] },
        { type: 'FILE_SCHEMA', args: [[IFC_SCHEMA]] },
      ],
      entities,
    });
  }

  return { P, gid, rel, add, project, site, space, contain, prop, enumProp, listProp, pset, unique, element, type, typeOf, port, nest, connect, system, group, aggregate, finish };
}

/** The GlobalId of an occurrence: inst/mac:<mac> when its identity is a MAC, else decl/<project>/<roles>. */
export function occurrenceGuid(m, identity, ...roles) {
  const id = str(identity).trim().toLowerCase();
  return MAC_RE.test(id) ? m.unique(ifcGuid('inst', `mac:${id}`), ...roles) : m.unique(m.gid(...roles), ...roles, 'again');
}

/* ───────────────────────── reading it back ───────────────────────── */

/**
 * An index over a parsed IFC text, the relationships this spine writes, both ways:
 *   name(e) / desc(e) / objectType(e) / tag(e)   the root attributes
 *   psets(e)            property sets, plain values (type's first, then the occurrence's)
 *   ports(e)            nested ports, in order;   host(port) the element a port is nested on
 *   far(port)           the port a link joins it to;  link(port) { rel, other, relating: bool }
 *   container(e)        the spatial element it is contained in (IfcSpace / IfcBuildingStorey) or undefined
 *   whole(e)            what aggregates it (a rack, a site, a storey …)
 *   typeOf(e)           its type object;  members(system, name?) the group's members, in order
 *   ownersOf(setName)   every object a set of that name is attached to, in file order
 */
export function readIfc(textIn) {
  const file = parseStep(String(textIn));
  const byId = file.byId;
  const get = (v) => (isRef(v) ? byId.get(v.id) : undefined);
  const list = (v) => (Array.isArray(v) ? v.map(get).filter(Boolean) : []);
  const nestsOf = new Map();
  const hostOf = new Map();
  for (const r of entitiesByType(file, 'IFCRELNESTS')) {
    const h = get(r.args[4]);
    if (!h) continue;
    const ps = list(r.args[5]).filter((x) => x.type === 'IFCDISTRIBUTIONPORT');
    nestsOf.set(h.id, [...(nestsOf.get(h.id) || []), ...ps]);
    for (const p of ps) hostOf.set(p.id, h);
  }
  const links = new Map();
  for (const r of entitiesByType(file, 'IFCRELCONNECTSPORTS')) {
    const a = get(r.args[4]);
    const z = get(r.args[5]);
    if (!a || !z) continue;
    links.set(a.id, { rel: r, other: z, relating: true });
    links.set(z.id, { rel: r, other: a, relating: false });
  }
  const containerOf = new Map();
  for (const r of entitiesByType(file, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
    const c = get(r.args[5]);
    for (const e of list(r.args[4])) containerOf.set(e.id, c);
  }
  const wholeOf = new Map();
  for (const r of entitiesByType(file, 'IFCRELAGGREGATES')) {
    const w = get(r.args[4]);
    for (const e of list(r.args[5])) wholeOf.set(e.id, w);
  }
  const typeOfMap = new Map();
  for (const r of entitiesByType(file, 'IFCRELDEFINESBYTYPE')) {
    const t = get(r.args[5]);
    for (const e of list(r.args[4])) typeOfMap.set(e.id, t);
  }
  const groups = new Map();
  for (const r of entitiesByType(file, 'IFCRELASSIGNSTOGROUP')) {
    const g = get(r.args[6]);
    if (!g) continue;
    const named = groups.get(g.id) || [];
    named.push({ name: str(r.args[2]), members: list(r.args[4]) });
    groups.set(g.id, named);
  }
  const owners = new Map();
  for (const r of entitiesByType(file, 'IFCRELDEFINESBYPROPERTIES')) {
    const ps = get(r.args[5]);
    if (!ps || typeof ps.args[2] !== 'string') continue;
    owners.set(ps.args[2], [...(owners.get(ps.args[2]) || []), ...list(r.args[4])]);
  }
  const s = (e, i) => (e && typeof e.args[i] === 'string' ? e.args[i] : '');
  const plain = (v) => { const u = unwrap(v); return u && typeof u === 'object' && 'value' in u ? u.value : u; };
  return {
    file,
    byType: (t) => entitiesByType(file, t),
    name: (e) => s(e, 2),
    desc: (e) => s(e, 3),
    objectType: (e) => s(e, 4),
    tag: (e) => s(e, 7),
    longName: (e) => s(e, 5),
    predefined: (e) => { const v = e && e.args[e.args.length - 1]; return v && v.kind === 'enum' ? v.value : ''; },
    flow: (p) => (p && p.args[7] && p.args[7].kind === 'enum' ? p.args[7].value : ''),
    psets: (e) => {
      const out = {};
      for (const [k, v] of Object.entries(getPsets(file, e))) {
        out[k] = {};
        for (const [pk, pv] of Object.entries(v || {})) out[k][pk] = Array.isArray(pv) ? pv.map(plain) : plain(pv);
      }
      return out;
    },
    ports: (e) => (e ? nestsOf.get(e.id) || [] : []),
    host: (p) => (p ? hostOf.get(p.id) : undefined),
    far: (p) => (p && links.get(p.id) ? links.get(p.id).other : undefined),
    link: (p) => (p ? links.get(p.id) : undefined),
    container: (e) => (e ? containerOf.get(e.id) : undefined),
    whole: (e) => (e ? wholeOf.get(e.id) : undefined),
    typeOf: (e) => (e ? typeOfMap.get(e.id) : undefined),
    members: (g, n) => (groups.get(g.id) || []).filter((x) => n == null || x.name === n).flatMap((x) => x.members),
    ownersOf: (setName) => owners.get(setName) || [],
  };
}
