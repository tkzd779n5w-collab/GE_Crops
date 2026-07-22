const map = L.map('map', { worldCopyJump: true }).setView([25, 10], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Leaflet's initial container measurement is unreliable across browsers/CDN
// timing and can be cached as 0x0, which breaks all pan/zoom math. Force a
// synchronous recheck now plus a couple of deferred rechecks as a safety net.
map.invalidateSize();
requestAnimationFrame(() => map.invalidateSize());
window.addEventListener('load', () => map.invalidateSize());

const DEFAULT_COLOR = '#888888';

// Each scheme picks a value off an innovation and buckets it into coloured
// groups. Anything that doesn't match a group's test falls back to
// DEFAULT_COLOR / "Other".
const COLOR_SCHEMES = {
  technique: {
    label: 'Technique',
    getValue: (innovation) => innovation.edit.technique,
    groups: [
      { label: 'TALEN', color: '#c0392b', test: (v) => /TALEN/i.test(v || '') },
      { label: 'CRISPR / CRISPR-Cas9', color: '#2e7d32', test: (v) => /CRISPR/i.test(v || '') }
    ]
  },
  commercial_status: {
    label: 'Commercial status',
    getValue: (innovation) => (innovation.approvals || []).map((a) => a.commercial_status),
    groups: [
      { label: 'Marketed', color: '#2e7d32', test: (v) => v.includes('marketed') },
      { label: 'Early commercialisation', color: '#f39c12', test: (v) => v.includes('early_commercialisation') },
      { label: 'Approved, not marketed', color: '#2980b9', test: (v) => v.includes('approved_not_marketed') },
      { label: 'Withdrawn', color: '#7f8c8d', test: (v) => v.includes('withdrawn') }
    ]
  }
};

function colorForScheme(scheme, innovation) {
  const value = scheme.getValue(innovation);
  const group = scheme.groups.find((g) => g.test(value));
  return group ? group.color : DEFAULT_COLOR;
}

function makeMarkerIcon(color) {
  return L.divIcon({
    className: 'ge-marker',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

let activeSchemeKey = 'technique';
const markersData = [];

const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  div.id = 'legend';
  return div;
};
legend.addTo(map);

function updateLegend() {
  const scheme = COLOR_SCHEMES[activeSchemeKey];
  const usesDefault = markersData.some(({ innovation }) => !scheme.groups.some((g) => g.test(scheme.getValue(innovation))));
  const items = scheme.groups.map((g) => `<div class="legend-item"><span class="swatch" style="background:${g.color}"></span>${escapeHtml(g.label)}</div>`);
  if (usesDefault) {
    items.push(`<div class="legend-item"><span class="swatch" style="background:${DEFAULT_COLOR}"></span>Other / unknown</div>`);
  }
  document.getElementById('legend').innerHTML = `<div class="legend-title">${escapeHtml(scheme.label)}</div>${items.join('')}`;
}

function applyScheme(schemeKey) {
  activeSchemeKey = schemeKey;
  const scheme = COLOR_SCHEMES[schemeKey];
  markersData.forEach(({ marker, innovation }) => {
    marker.setIcon(makeMarkerIcon(colorForScheme(scheme, innovation)));
  });
  updateLegend();
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scheme === schemeKey);
  });
}

const filterControl = L.control({ position: 'topright' });
filterControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'filter-control');
  div.innerHTML = `
    <div class="filter-title">Colour markers by</div>
    ${Object.entries(COLOR_SCHEMES).map(([key, s]) => `<button type="button" class="filter-btn" data-scheme="${key}">${escapeHtml(s.label)}</button>`).join('')}
  `;
  L.DomEvent.disableClickPropagation(div);
  div.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyScheme(btn.dataset.scheme));
  });
  return div;
};
filterControl.addTo(map);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function row(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

function linkRow(label, url) {
  if (!url) return '';
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><a class="value" href="${encodeURI(url)}" target="_blank" rel="noopener">source</a></div>`;
}

function approvalBlock(a, idx, total) {
  const heading = total > 1 ? `Approval ${idx + 1} — ${escapeHtml(a.country)}` : `Approval — ${escapeHtml(a.country)}`;
  return `
    <div class="section">
      <h3>${heading}</h3>
      ${row('Regulatory body', a.regulatory_body)}
      ${row('Approval type', a.approval_type)}
      ${row('Mechanism', a.mechanism)}
      ${row('Decision date', a.decision_date)}
      ${linkRow('Decision source', a.decision_source_url)}
      ${row('Commercial status', a.commercial_status)}
      ${row('Commercial since', a.commercial_since)}
      ${linkRow('Commercial source', a.commercial_source_url)}
      ${row('Last verified', a.last_verified)}
      ${a.notes ? `<div class="row notes"><span class="label">Notes</span><span class="value">${escapeHtml(a.notes)}</span></div>` : ''}
    </div>`;
}

function detailHtml(innovation) {
  const approvals = (innovation.approvals || [])
    .map((a, i) => approvalBlock(a, i, innovation.approvals.length))
    .join('');

  return `
    <div class="popup">
      <h2>${escapeHtml(innovation.id)}</h2>
      <div class="section">
        ${row('Innovation name', innovation.innovation_name)}
        ${row('Crop', `${innovation.crop.common_name} (${innovation.crop.species})`)}
        ${row('Trait', innovation.trait.description)}
        ${row('Trait category', innovation.trait.category)}
      </div>
      <div class="section">
        <h3>Gene edit</h3>
        ${row('Technique', innovation.edit.technique)}
        ${row('SDN class', innovation.edit.sdn_class)}
        ${row('Transgene status', innovation.edit.transgene_status)}
        ${linkRow('Transgene status source', innovation.edit.transgene_status_source)}
      </div>
      <div class="section">
        <h3>Developer</h3>
        ${row('Name', innovation.developer.name)}
        ${row('Country', innovation.developer.country)}
        ${row('Type', innovation.developer.type)}
      </div>
      ${approvals}
      ${innovation.location && innovation.location.place ? `<p class="loc-note">Marker location: ${escapeHtml(innovation.location.place)}</p>` : ''}
    </div>`;
}

const detailPanel = document.getElementById('detail-panel');
const detailContent = document.getElementById('detail-content');
const detailClose = document.getElementById('detail-close');

function openDetailPanel(innovation) {
  detailContent.innerHTML = detailHtml(innovation);
  detailPanel.classList.add('open');
}

function closeDetailPanel() {
  detailPanel.classList.remove('open');
}

detailClose.addEventListener('click', closeDetailPanel);
map.on('click', closeDetailPanel);

fetch('data/ge-crops.json')
  .then((r) => r.json())
  .then((data) => {
    data.innovations.forEach((innovation) => {
      const loc = innovation.location;
      if (!loc) return;

      const marker = L.marker([loc.lat, loc.lng], { icon: makeMarkerIcon(DEFAULT_COLOR) }).addTo(map);

      marker.bindTooltip(escapeHtml(innovation.id), {
        direction: 'top',
        offset: [0, -10],
        className: 'ge-label'
      });

      marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        openDetailPanel(innovation);
      });

      markersData.push({ marker, innovation });
    });

    applyScheme(activeSchemeKey);
  })
  .catch((err) => {
    console.error('Failed to load GE crops data', err);
  });
