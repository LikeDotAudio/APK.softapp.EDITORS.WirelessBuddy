// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

import { WirelessSpectrumModel } from './wirelessModel.js';
import { BlockBridge } from './blockBridge.js';

export { WirelessSpectrumModel };

export class WirelessApp {
  constructor() {
    this.model = new WirelessSpectrumModel();
    this.bridge = new BlockBridge({
      name: 'Wireless RF Buddy',
      type: 'rf_coordination',
      onBlockLoaded: (b, m) => this.handleBlockLoaded(b, m),
      onBlockChanged: () => this.render()
    });

    this.tableBody = document.getElementById('rf-table-body');
    this.svgContainer = document.getElementById('spectrum-svg');
    this.initControls();
    this.render();
    this.autoConnect();
  }

  async autoConnect() {
    const discovered = await this.bridge.fetchDiscoveredProject();
    if (discovered && discovered.wireless && discovered.wireless.length > 0) {
      this.model.fromBlock(discovered.wireless[0]);
      this.render();
    }
  }

  handleBlockLoaded(block, meta) {
    if (block) {
      this.model.fromBlock(block);
      this.render();
    }
  }

  initControls() {
    const btnSave = document.getElementById('btn-save');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        this.bridge.saveBlock(this.model.toBlock(), { name: this.model.planName });
      });
    }

    const btnOpen = document.getElementById('btn-open');
    if (btnOpen) {
      btnOpen.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const data = JSON.parse(evt.target.result);
              this.model.fromBlock(data);
              this.render();
            } catch (err) {
              alert('Invalid block file: ' + err.message);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }

    const btnClose = document.getElementById('btn-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.bridge.close());
    }

    const btnDiscovered = document.getElementById('btn-discovered');
    if (btnDiscovered) {
      btnDiscovered.addEventListener('click', async () => {
        const disc = await this.bridge.fetchDiscoveredProject();
        if (disc && disc.wireless && disc.wireless.length > 0) {
          this.model.fromBlock(disc.wireless[0]);
          this.render();
        } else {
          alert('No wireless RF blocks found in current discovered project.');
        }
      });
    }

    const btnAddCh = document.getElementById('btn-add-rf');
    if (btnAddCh) {
      btnAddCh.addEventListener('click', () => {
        const nextFreq = 475.000 + (this.model.channels.length * 0.800);
        this.model.addChannel(`MIC ${this.model.channels.length + 1}`, nextFreq, 10, 'Main Array');
        this.render();
        this.bridge.notifyChanged();
      });
    }

    const propPlanName = document.getElementById('prop-planName');
    if (propPlanName) {
      propPlanName.addEventListener('input', (e) => {
        this.model.planName = e.target.value;
        this.bridge.notifyChanged();
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

  renderTable() {
    if (!this.tableBody) return;
    this.tableBody.innerHTML = '';

    this.model.channels.forEach((ch, idx) => {
      const tr = document.createElement('tr');
      const isConflict = ch.status === 'Conflict';

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size: 11px;">#${ch.id}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="name">${ch.name}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="freqMHz">${ch.freqMHz.toFixed(3)}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="powerMw">${ch.powerMw}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="group">${ch.group}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="channel">${ch.channel}</td>
        <td class="inline-cell" contenteditable="true" data-idx="${idx}" data-field="antennaZone">${ch.antennaZone || 'Main'}</td>
        <td>
          <span style="font-weight: bold; font-size: 11px; color: ${isConflict ? '#EF4444' : '#4ADE80'};">
            ${ch.status}
          </span>
        </td>
        <td style="text-align: center;">
          <button class="btn-delete" data-idx="${idx}" title="Delete Carrier">✕</button>
        </td>
      `;

      this.tableBody.appendChild(tr);
    });

    this.tableBody.querySelectorAll('[contenteditable=true]').forEach(cell => {
      cell.addEventListener('blur', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const field = e.target.dataset.field;
        this.model.updateChannel(idx, field, e.target.innerText.trim());
        this.render();
        this.bridge.notifyChanged();
      });
    });

    this.tableBody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        this.model.removeChannel(idx);
        this.render();
        this.bridge.notifyChanged();
      });
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
        <text x="${x}" y="${y - 8}" fill="#F0F4F8" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">${ch.freqMHz.toFixed(3)}</text>
        <text x="${x}" y="${y - 18}" fill="#8B9BB4" font-size="8" font-family="sans-serif" text-anchor="middle">${ch.name}</text>
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
        <rect x="0" y="0" width="${width}" height="${height}" fill="#080C16" rx="8"/>

        <!-- Spectrum Axis & Noise Floor (-90 dBm) -->
        <rect x="50" y="20" width="540" height="120" fill="#0E1424" stroke="#1E2A45" stroke-width="1"/>
        <line x1="50" y1="140" x2="590" y2="140" stroke="#4A9EFF" stroke-width="1.5"/>

        <!-- Frequency grid lines -->
        <line x1="50" y1="20" x2="50" y2="140" stroke="#1E2A45" stroke-width="1"/>
        <text x="50" y="155" fill="#8B9BB4" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">470.0</text>

        <line x1="185" y1="20" x2="185" y2="140" stroke="#1E2A45" stroke-width="1"/>
        <text x="185" y="155" fill="#8B9BB4" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">475.0</text>

        <line x1="320" y1="20" x2="320" y2="140" stroke="#1E2A45" stroke-width="1"/>
        <text x="320" y="155" fill="#8B9BB4" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">480.0</text>

        <line x1="455" y1="20" x2="455" y2="140" stroke="#1E2A45" stroke-width="1"/>
        <text x="455" y="155" fill="#8B9BB4" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">485.0</text>

        <line x1="590" y1="20" x2="590" y2="140" stroke="#1E2A45" stroke-width="1"/>
        <text x="590" y="155" fill="#8B9BB4" font-size="9" font-family="JetBrains Mono, monospace" text-anchor="middle">490.0</text>

        <!-- Noise floor ripple -->
        <path d="M 50 138 Q 100 137, 150 139 T 250 138 T 350 137 T 450 138 T 550 139 T 590 138" fill="none" stroke="#2B3C5D" stroke-width="1"/>

        <!-- Intermod Markers -->
        ${imdSvg}

        <!-- Carriers -->
        ${carriersSvg}

        <text x="585" y="32" fill="#8B9BB4" font-size="9" font-family="sans-serif" text-anchor="end">UHF Band IV/V (MHz)</text>
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
