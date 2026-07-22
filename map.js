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

const TECHNIQUE_COLORS = {
  TALEN: '#c0392b',
  CRISPR: '#2e7d32'
};
const DEFAULT_TECHNIQUE_COLOR = '#888888';

function techniqueGroup(technique) {
  const t = (technique || '').toUpperCase();
  if (t.includes('TALEN')) return 'TALEN';
  if (t.includes('CRISPR')) return 'CRISPR';
  return null;
}

function techniqueColor(technique) {
  return TECHNIQUE_COLORS[techniqueGroup(technique)] || DEFAULT_TECHNIQUE_COLOR;
}

function makeMarkerIcon(color) {
  return L.divIcon({
    className: 'ge-marker',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  div.innerHTML = `
    <div class="legend-item"><span class="swatch" style="background:${TECHNIQUE_COLORS.TALEN}"></span>TALEN</div>
    <div class="legend-item"><span class="swatch" style="background:${TECHNIQUE_COLORS.CRISPR}"></span>CRISPR / CRISPR-Cas9</div>
  `;
  return div;
};
legend.addTo(map);

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

function popupHtml(innovation) {
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

let pinnedMarker = null;

map.on('click', () => {
  if (pinnedMarker) {
    pinnedMarker.closePopup();
    pinnedMarker = null;
  }
});

fetch('data/ge-crops.json')
  .then((r) => r.json())
  .then((data) => {
    data.innovations.forEach((innovation) => {
      const loc = innovation.location;
      if (!loc) return;

      const icon = makeMarkerIcon(techniqueColor(innovation.edit.technique));
      const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(map);

      marker.bindPopup(popupHtml(innovation), { maxWidth: 340, className: 'ge-popup', autoPan: false });

      marker.on('mouseover', function () {
        if (pinnedMarker) return;
        this.openPopup();
      });
      marker.on('mouseout', function () {
        if (pinnedMarker === this) return;
        this.closePopup();
      });
      marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        if (pinnedMarker && pinnedMarker !== this) {
          pinnedMarker.closePopup();
        }
        pinnedMarker = this;
        this.openPopup();
      });
      marker.on('popupclose', function () {
        if (pinnedMarker === this) pinnedMarker = null;
      });
    });
  })
  .catch((err) => {
    console.error('Failed to load GE crops data', err);
  });
