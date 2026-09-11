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
    description: 'The gene-editing method used to create the crop — TALEN or CRISPR/CRISPR-Cas9.',
    getValue: (innovation) => innovation.edit.technique,
    groups: [
      { label: 'TALEN', color: '#c0392b', test: (v) => /TALEN/i.test(v || '') },
      { label: 'CRISPR / CRISPR-Cas9', color: '#2e7d32', test: (v) => /CRISPR/i.test(v || '') }
    ]
  },
  commercial_status: {
    label: 'Commercial status',
    description: 'How far each crop has reached the market in the countries where it is approved — marketed, early commercialisation, or approved but not yet marketed.',
    getValue: (innovation) => (innovation.approvals || []).map((a) => a.commercial_status),
    groups: [
      {
        label: 'Marketed',
        color: '#2e7d32',
        test: (v) => v.includes('marketed'),
        tooltip: 'For sale in at least one country, even if still in an earlier stage elsewhere — shows the crop’s most advanced status anywhere.'
      },
      {
        label: 'Early commercialisation',
        color: '#f39c12',
        test: (v) => v.includes('early_commercialisation'),
        tooltip: 'Commercialisation has started but isn’t a full launch yet — a partial or ramping rollout.'
      },
      {
        label: 'Approved, not marketed',
        color: '#2980b9',
        test: (v) => v.includes('approved_not_marketed'),
        tooltip: 'Regulatory clearance is confirmed, but the crop hasn’t yet reached farmers or shelves.'
      }
    ]
  },
  crop_type: {
    label: 'Crop type',
    description: 'The plant species each innovation was developed from.',
    getValue: (innovation) => innovation.crop.common_name,
    groups: [
      { label: 'Soybean', color: '#a6cee3', test: (v) => v === 'Soybean' },
      { label: 'Mustard greens', color: '#1f78b4', test: (v) => v === 'Mustard greens' },
      { label: 'Field pennycress', color: '#b2df8a', test: (v) => v === 'Field pennycress' },
      { label: 'Tomato', color: '#33a02c', test: (v) => v === 'Tomato' },
      { label: 'Corn (maize)', color: '#fb9a99', test: (v) => v === 'Corn (maize)' },
      { label: 'Alfalfa', color: '#e31a1c', test: (v) => v === 'Alfalfa' },
      { label: 'Canola (rapeseed)', color: '#fdbf6f', test: (v) => v === 'Canola (rapeseed)' },
      { label: 'Rice', color: '#ff7f00', test: (v) => v === 'Rice' },
      { label: 'Barley', color: '#cab2d6', test: (v) => v === 'Barley' },
      { label: 'Wheat', color: '#6a3d9a', test: (v) => v === 'Wheat' },
      { label: 'Banana', color: '#b15928', test: (v) => v === 'Banana' }
    ]
  },
  trait_category: {
    label: 'Crop trait',
    description: 'The type of trait the edit was designed to improve — e.g. oil composition, yield, or food safety.',
    getValue: (innovation) => innovation.trait.category,
    groups: [
      { label: 'Oil composition', color: '#66c2a5', test: (v) => v === 'oil_composition' },
      { label: 'Consumer quality', color: '#fc8d62', test: (v) => v === 'consumer_quality' },
      { label: 'Nutritional quality', color: '#8da0cb', test: (v) => v === 'nutritional_quality' },
      { label: 'Yield', color: '#e78ac3', test: (v) => v === 'yield' },
      { label: 'Food safety', color: '#a6d854', test: (v) => v === 'food_safety' },
      { label: 'Herbicide tolerance', color: '#ffd92f', test: (v) => v === 'herbicide_tolerance' }
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
  const items = scheme.groups.map((g) => {
    const title = g.tooltip ? ` title="${escapeHtml(g.tooltip)}"` : '';
    return `<div class="legend-item"${title}><span class="swatch" style="background:${g.color}"></span>${escapeHtml(g.label)}</div>`;
  });
  if (usesDefault) {
    items.push(`<div class="legend-item" title="${escapeHtml('No market status was reported, or it didn’t match any category above.')}"><span class="swatch" style="background:${DEFAULT_COLOR}"></span>Other / unknown</div>`);
  }
  document.getElementById('legend').innerHTML = `<div class="legend-title">${escapeHtml(scheme.label)}</div>${items.join('')}`;
}

function applyScheme(schemeKey, { showDescription = false } = {}) {
  activeSchemeKey = schemeKey;
  const scheme = COLOR_SCHEMES[schemeKey];
  markersData.forEach(({ marker, innovation }) => {
    marker.setIcon(makeMarkerIcon(colorForScheme(scheme, innovation)));
  });
  updateLegend();
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scheme === schemeKey);
  });
  if (showDescription) {
    const descriptionEl = document.getElementById('filter-description');
    // Drop everything from the em dash onward (e.g. the "— TALEN or
    // CRISPR/CRISPR-Cas9" examples-list part of the technique description),
    // keeping just the plain-language lead sentence. Internal hyphens in
    // that lead sentence (e.g. "gene-editing") are still smoothed out.
    descriptionEl.textContent = humanize(scheme.description.split('—')[0]).trim();
    descriptionEl.classList.add('visible');
  }
}

const filterDescription = L.control({ position: 'topright' });
filterDescription.onAdd = function () {
  const div = L.DomUtil.create('div', 'filter-description');
  div.id = 'filter-description';
  return div;
};
filterDescription.addTo(map);

const filterControl = L.control({ position: 'topright' });
filterControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'filter-control');
  div.innerHTML = `
    <div class="filter-title">Categories</div>
    ${Object.entries(COLOR_SCHEMES).map(([key, s]) => `<button type="button" class="filter-btn" data-scheme="${key}">${escapeHtml(s.label)}</button>`).join('')}
  `;
  L.DomEvent.disableClickPropagation(div);
  div.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyScheme(btn.dataset.scheme, { showDescription: true }));
  });
  return div;
};
filterControl.addTo(map);

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Displayed text should read cleanly with no raw hyphens/underscores: ISO
// dates get formatted (e.g. "2024-06-12" -> "12 Jun 2024"), everything else
// just has "-"/"_" swapped for spaces.
function humanize(value) {
  if (value === undefined || value === null || value === '') return value;
  const str = String(value);

  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  m = str.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, 1));
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  return str.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function row(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(humanize(value))}</span></div>`;
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
      ${a.notes ? `<div class="row notes"><span class="label">Notes</span><span class="value">${escapeHtml(humanize(a.notes))}</span></div>` : ''}
    </div>`;
}

function detailHtml(innovation) {
  const approvals = (innovation.approvals || [])
    .map((a, i) => approvalBlock(a, i, innovation.approvals.length))
    .join('');

  return `
    <div class="popup">
      <h2>${escapeHtml(humanize(innovation.innovation_name))}</h2>
      <div class="section">
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
      ${innovation.location && innovation.location.place ? `<p class="loc-note">Marker location: ${escapeHtml(humanize(innovation.location.place))}</p>` : ''}
    </div>`;
}

function earliestYear(innovation) {
  const years = (innovation.approvals || [])
    .flatMap((a) => [a.decision_date, a.commercial_since])
    .map((v) => (v ? String(v).match(/\d{4}/) : null))
    .filter(Boolean)
    .map((m) => parseInt(m[0], 10));
  return years.length ? Math.min(...years) : null;
}

const yearSlider = document.getElementById('year-slider');
const yearLabel = document.getElementById('year-label');
const playBtn = document.getElementById('play-btn');
let playTimer = null;

function applyYearFilter(year) {
  markersData.forEach(({ marker, innovation }) => {
    const visible = innovation.__year == null || innovation.__year <= year;
    const onMap = map.hasLayer(marker);
    if (visible && !onMap) marker.addTo(map);
    if (!visible && onMap) map.removeLayer(marker);
  });
  yearLabel.textContent = year;
}

function stopPlaying() {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label', 'Play');
  }
}

playBtn.addEventListener('click', () => {
  if (playTimer) {
    stopPlaying();
    return;
  }
  if (Number(yearSlider.value) >= Number(yearSlider.max)) {
    yearSlider.value = yearSlider.min;
  }
  playBtn.textContent = '⏸';
  playBtn.setAttribute('aria-label', 'Pause');
  playTimer = setInterval(() => {
    const next = Number(yearSlider.value) + 1;
    if (next > Number(yearSlider.max)) {
      stopPlaying();
      return;
    }
    yearSlider.value = next;
    applyYearFilter(next);
  }, 900);
});

yearSlider.addEventListener('input', () => {
  stopPlaying();
  applyYearFilter(Number(yearSlider.value));
});

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

      innovation.__year = earliestYear(innovation);

      const marker = L.marker([loc.lat, loc.lng], { icon: makeMarkerIcon(DEFAULT_COLOR) }).addTo(map);

      marker.bindTooltip(escapeHtml(`${innovation.crop.common_name} (${innovation.crop.species})`), {
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

    const years = markersData.map(({ innovation }) => innovation.__year).filter((y) => y != null);
    const minYear = years.length ? Math.min(...years) : new Date().getFullYear();
    const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();
    yearSlider.min = minYear;
    yearSlider.max = maxYear;
    yearSlider.value = maxYear;
    applyYearFilter(maxYear);
  })
  .catch((err) => {
    console.error('Failed to load GE crops data', err);
  });
