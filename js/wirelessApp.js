// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { WirelessSpectrumModel } from './wirelessModel.js';
import { radioRow } from './wirelessDiscovered.js';
import { rfToIfc, rfFromIfc, schemaOf } from './rfIfc.js';

const esc = (s) => window.APKSoftapp.esc(s);

export { WirelessSpectrumModel };

export class WirelessApp {
  constructor() {
    this.model = new WirelessSpectrumModel();
    /* The CAD link: cad.like.audio/host@1 through vendor/apk-softapp. Same
       origin only; standalone, Save downloads the block as .json. */
    this.host = window.APKSoftapp.connectHost({
      editor: 'Wireless RF Buddy',
      blockType: 'rf_coordination',
      onLoad: (b, m) => this.handleBlockLoaded(b, m),
      onRequest: () => ({ block: this.model.toBlock(), meta: { name: this.model.planName } }),
    });

    window.APKSoftapp.describe({
      name: 'Wireless RF Buddy',
      does: 'Coordinates wireless mic / IEM carriers: frequency, power, group, channel and antenna zone per transmitter, drawn on a spectrum with each carrier\'s intermod (IMD) clearance.',
      inputs: [
        { name: 'RF plan block', from: 'the CAD drawing (rf_coordination block) when opened from the CAD', kind: 'cad' },
        { name: 'Plan file', from: 'a .json saved by this editor, or its .ifc twin, picked with Open', kind: 'file' },
        { name: 'Radios on the air', from: 'what the bus has discovered (SSID, band, channel, frequency) — shown beside the plan, never copied in; kinds and fields are config/discovery.json', kind: 'bus' },
      ],
      outputs: [
        { name: 'RF plan block', to: 'the CAD drawing on Save & Return; standalone, rf_<plan>.json beside its .ifc twin (Save Model)', kind: 'file' },
        { name: 'IFC twin', to: 'rf_<plan>.ifc (IFC4X3_ADD2) with the .json when standalone: each carrier a transmitter and a receiver joined over the air (WIRELESS ports, IfcRelConnectsPorts), frequency and power in APK_RfCarrier, the plan an IfcDistributionSystem', kind: 'file' },
      ],
      controls: [
        { name: 'Plan name', how: 'Type in the plan name box (top bar)' },
        { name: 'Add RF carrier', how: '+ Add RF Carrier (next one 0.8 MHz up)' },
        { name: 'Edit / delete a carrier', how: 'Edit its cells (name, frequency MHz, power mW, group, channel, antenna zone) or delete the row; IMD clearance re-checks at once' },
        { name: 'Discovered', how: 'Top-bar button: show / hide the radios the bus knows' },
        { name: 'Open', how: 'Top-bar button: a plan .json or its .ifc twin' },
        { name: 'Save & Return / Close', how: 'Top-bar buttons; standalone, Save writes the .json and its .ifc twin, both or neither' },
      ],
      problems: ['file_unreadable', 'bad_json', 'bad_input', 'config_invalid', 'bus_missing', 'device_stale', 'save_failed'],
    });
    this.tableHost = document.getElementById('rf-table');
    this.svgContainer = document.getElementById('spectrum-svg');
    this.initControls();
    this.render();
    this.autoConnect();
  }

  changed() {
    this.host.changed(this.model.toBlock());
  }

  /* The radios already on the air (config/discovery.json kinds and fields),
     shown beside the plan, never copied into it. */
  async autoConnect() {
    const host = document.getElementById('net-table');
    const status = document.getElementById('net-status');
    if (!host) return;
    let rules;
    try {
      const cfg = await window.APKSoftapp.discoveredConfig(new URL('../config/discovery.json', import.meta.url), { required: true });
      if (cfg.problem) throw Object.assign(new Error(cfg.why), { problem: cfg.problem });
      rules = cfg;
    } catch (err) {
      if (status) { status.setAttribute('data-apk-state', 'dead'); status.textContent = `Could not read config/discovery.json (${err.message}).`; }
      window.APKSoftapp.showProblem(err.problem || err, {
        into: status || undefined, subject: 'config/discovery.json', detail: err.message,
        fix: ['config/discovery.json beside this app says which discovered kinds are radios and which fields hold SSID / band / channel / frequency; it must be served and be valid JSON.'],
        onRetry: () => this.autoConnect(),
      });
      return;
    }
    this.network = await window.APKSoftapp.discoveredPanel(host, {
      status, id: 'wireless-discovered', config: rules,
      empty: 'No radio on the bus yet.',
      columns: [
        ...window.APKSoftapp.DISCOVERED_COLUMNS.slice(0, 3),
        { key: 'ssid', label: 'SSID', editable: false },
        { key: 'band', label: 'Band', editable: false },
        { key: 'channel', label: 'Channel', editable: false },
        { key: 'frequency', label: 'Frequency', editable: false, mono: true },
        window.APKSoftapp.DISCOVERED_COLUMNS[5],
      ],
      toRows: (things) => things.map((t) => radioRow(t, rules)),
    });
  }

  handleBlockLoaded(block, meta) {
    if (block) {
      this.model.fromBlock(block);
      this.render();
    }
  }

  /** Save: into the CAD when inside it; standalone, the block and its .ifc twin, both or neither (Save Model). */
  async save() {
    const block = this.model.toBlock();
    const meta = { name: this.model.planName, filename: block.id };
    const S = window.APKSoftapp;
    if (this.host.embedded || typeof S.saveModel !== 'function') return this.host.save(block, meta);
    const r = await S.saveModel(block, { name: block.id, toIfc: (b) => rfToIfc(b, { name: block.id }) });
    if (!r.ok && !r.cancelled) S.showProblem(r.problem || 'save_failed', { onRetry: () => this.save() });
    return r.ok ? r.via : '';
  }

  /** Open: a plan .json, or an .ifc (its RF plan, rfIfc.js). */
  async open() {
    const S = window.APKSoftapp;
    const r = await S.openModel({
      fromIfc: (text) => rfFromIfc(text),
      fromJson: (data) => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.channels)) throw new Error('This is not an RF plan: it has no "channels" list of carriers.');
        return data;
      },
    });
    if (!r.ok) {
      if (!r.cancelled) S.showProblem(r.problem, {
        fix: ['Open a .json saved by this editor or its .ifc twin, or start a plan with + Add RF Carrier.'],
        onRetry: () => this.open(),
      });
      return;
    }
    this.model.fromBlock(r.model);
    if (r.kind === 'ifc') document.title = `Wireless RF Buddy · ${r.name} · ${schemaOf(r.text)}`;
    this.render();
    this.changed();
  }

  initControls() {
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => { void this.save(); });
    }

    const btnOpen = document.getElementById('btn-open');
    if (btnOpen) btnOpen.addEventListener('click', () => { void this.open(); });

    const btnClose = document.getElementById('btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.host.close());
    }

    const btnDiscovered = document.getElementById('btn-discovered');
    if (btnDiscovered) {
      btnDiscovered.addEventListener('click', () => document.body.classList.toggle('net-hidden'));
    }

    const btnAddCh = document.getElementById('btn-add-rf');
    if (btnAddCh) {
      btnAddCh.addEventListener('click', () => {
        const nextFreq = 475.000 + (this.model.channels.length * 0.800);
        this.model.addChannel(`MIC ${this.model.channels.length + 1}`, nextFreq, 10, 'Main Array');
        this.render();
        this.changed();
      });
    }

    const propPlanName = document.getElementById('prop-planName');
    if (propPlanName) {
      propPlanName.addEventListener('input', (e) => {
        this.model.planName = e.target.value;
        this.changed();
      });
    }
  }

  render() {
    const propPlanName = document.getElementById('prop-planName');
    if (propPlanName) {
      propPlanName.value = this.model.planName;
    }

    this.renderTelemetry();
    this.renderTable();
    this.renderSvg();
  }

  renderTelemetry() {
    const clashCount = this.model.channels.filter(c => c.status === 'Conflict').length;
    const badge = document.getElementById('telemetry-badge');
    if (badge) {
      if (clashCount === 0) {
        badge.textContent = `${this.model.channels.length} Carriers Coordinated • Clean Spectrum`;
        badge.style.color = '#4ADE80';
      } else {
        badge.textContent = `⚠️ ${clashCount} Frequency Clash / IMD Hazard Detected!`;
        badge.style.color = '#EF4444';
      }
    }
  }

  /* The RF schedule is an APKTable (vendor/apk-table): APKTable.get('wireless-carriers'). */
  renderTable() {
    if (!this.tableHost || !window.APKTable) return;
    if (this.table) { this.table.setRows(this.model.channels); return; }
    this.table = window.APKTable.create(this.tableHost, {
      id: 'wireless-carriers',
      searchPlaceholder: 'Filter carriers',
      empty: 'No carriers. Add one.',
      columns: [
        { key: 'id', label: 'ID', type: 'number', editable: false },
        { key: 'name', label: 'Transmitter / Performer' },
        { key: 'freqMHz', label: 'Frequency (MHz)', type: 'number', mono: true,
          format: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(3) : String(v ?? '')) },
        { key: 'powerMw', label: 'Power (mW)', type: 'number' },
        { key: 'group', label: 'Group' },
        { key: 'channel', label: 'Channel' },
        { key: 'antennaZone', label: 'Antenna Zone' },
        { key: 'status', label: 'IMD Clearance', editable: false,
          cellClass: (v) => (v === 'Conflict' ? 'rf-conflict' : 'rf-clear') },
      ],
      rows: this.model.channels,
      onEdit: (i, key, value) => {
        this.model.updateChannel(i, key, value);
        this.render();
        this.changed();
      },
      onDelete: (i) => {
        this.model.channels.splice(i, 1);
        this.model.refreshConflicts();
        this.render();
        this.changed();
      },
    });
  }

  renderSvg() {
    if (!this.svgContainer) return;

    const width = 640;
    const height = 180;
    const minF = 470.0;
    const maxF = 490.0;
    const span = maxF - minF;

    // Render RF spectrum grid and carriers
    let carriersSvg = '';
    this.model.channels.forEach(ch => {
      if (ch.freqMHz < minF || ch.freqMHz > maxF) return;
      const x = 50 + ((ch.freqMHz - minF) / span) * 540;
      const h = Math.min(100, ch.powerMw * 1.8 + 40);
      const y = 140 - h;
      const color = ch.status === 'Conflict' ? '#EF4444' : '#4A9EFF';

      carriersSvg += `
        <!-- RF Carrier Spike -->
        <line x1="${x}" y1="140" x2="${x}" y2="${y}" stroke="${color}" stroke-width="3"/>
        <circle cx="${x}" cy="${y}" r="4" fill="${color}"/>
        <text x="${x}" y="${y - 8}" fill="#f4f4f5" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">${esc(Number(ch.freqMHz).toFixed(3))}</text>
        <text x="${x}" y="${y - 18}" fill="#888888" font-size="8" font-family="sans-serif" text-anchor="middle">${esc(ch.name)}</text>
      `;
    });

    // Render 3rd order IMD products as dotted lines
    const imd3 = this.model.calculateIntermodOrders();
    let imdSvg = '';
    imd3.forEach(f => {
      if (f >= minF && f <= maxF) {
        const x = 50 + ((f - minF) / span) * 540;
        imdSvg += `
          <line x1="${x}" y1="140" x2="${x}" y2="100" stroke="#F4902C" stroke-width="1" stroke-dasharray="2 2"/>
          <circle cx="${x}" cy="100" r="2" fill="#F4902C"/>
        `;
      }
    });

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#121212" rx="8"/>

        <!-- Spectrum Axis & Noise Floor (-90 dBm) -->
        <rect x="50" y="20" width="540" height="120" fill="#0f0f11" stroke="#2c2c2c" stroke-width="1"/>
        <line x1="50" y1="140" x2="590" y2="140" stroke="#4A9EFF" stroke-width="1.5"/>

        <!-- Frequency grid lines -->
        <line x1="50" y1="20" x2="50" y2="140" stroke="#2c2c2c" stroke-width="1"/>
        <text x="50" y="155" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">470.0</text>

        <line x1="185" y1="20" x2="185" y2="140" stroke="#2c2c2c" stroke-width="1"/>
        <text x="185" y="155" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">475.0</text>

        <line x1="320" y1="20" x2="320" y2="140" stroke="#2c2c2c" stroke-width="1"/>
        <text x="320" y="155" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">480.0</text>

        <line x1="455" y1="20" x2="455" y2="140" stroke="#2c2c2c" stroke-width="1"/>
        <text x="455" y="155" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">485.0</text>

        <line x1="590" y1="20" x2="590" y2="140" stroke="#2c2c2c" stroke-width="1"/>
        <text x="590" y="155" fill="#888888" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">490.0</text>

        <!-- Noise floor ripple -->
        <path d="M 50 138 Q 100 137, 150 139 T 250 138 T 350 137 T 450 138 T 550 139 T 590 138" fill="none" stroke="#2B3C5D" stroke-width="1"/>

        <!-- Intermod Markers -->
        ${imdSvg}

        <!-- Carriers -->
        ${carriersSvg}

        <text x="585" y="32" fill="#888888" font-size="9" font-family="sans-serif" text-anchor="end">UHF Band IV/V (MHz)</text>
      </svg>
    `;

    this.svgContainer.innerHTML = svg;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new WirelessApp();
  });
}
