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
    description: 'How far each crop has reached the market in the countries where it is approved: marketed, or approved for commercialisation but not yet on shelves.',
    getValue: (innovation) => (innovation.approvals || []).map((a) => a.commercial_status),
    groups: [
      {
        label: 'Marketed',
        color: '#2e7d32',
        test: (v) => v.includes('marketed'),
        tooltip: 'For sale in at least one country, even if still in an earlier stage elsewhere. Reflects the crop’s most advanced status anywhere.'
      },
      {
        label: 'Approved for commercialisation, not yet on shelves',
        color: '#2980b9',
        test: (v) => v.includes('early_commercialisation') || v.includes('approved_not_marketed'),
        tooltip: 'Regulatory clearance for commercial use is confirmed. Commercialisation may be ramping up or fully pending, but the crop hasn’t yet reached farmers, shelves or consumers.'
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

// Any markers whose on-screen positions land within CLUSTER_PX of each other
// are treated as overlapping, regardless of which developer they belong to.
// Zoomed out, an overlapping set draws as one pie marker with a count; once
// zoomed in to SPREAD_ZOOM it fans out, each member joined by an arrow back
// to its own true coordinate (several members sharing an exact coordinate —
// the common case of one company's products at one HQ — share one dot).
const CLUSTER_PX = 24;
const SPREAD_ZOOM = 6;
const SPREAD_RADIUS_PX = 62;
const demoMode = new URLSearchParams(window.location.search).get('demo') === 'grouping';
const groupLayer = L.layerGroup().addTo(map);
let legendHasClusters = false;

function makeGroupIcon(colors, count) {
  const step = 360 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(', ');
  return L.divIcon({
    className: 'ge-group-pie',
    html: `<div class="pie" style="background:conic-gradient(${stops})"><span>${count}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

const anchorIcon = L.divIcon({
  className: 'ge-anchor',
  html: '<span></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

function makeArrowIcon(deg) {
  return L.divIcon({
    className: 'ge-arrow',
    html: `<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(${deg}deg)"><path d="M2 2 L14 8 L2 14 Z" fill="#37474f"/></svg>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

// Groups currently-visible entries by on-screen proximity at the current
// zoom (union-find over pairwise pixel distance), so any markers that would
// visually overlap end up in the same cluster — not just ones flagged as
// related in the data.
function clusterVisibleEntries() {
  const entries = markersData.filter((e) => e.yearVisible);
  const parent = entries.map((_, i) => i);
  function find(i) { while (parent[i] !== i) i = parent[i]; return i; }
  function union(i, j) {
    const a = find(i), b = find(j);
    if (a !== b) parent[a] = b;
  }
  const points = entries.map((e) => map.latLngToLayerPoint([e.innovation.location.lat, e.innovation.location.lng]));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (points[i].distanceTo(points[j]) < CLUSTER_PX) union(i, j);
    }
  }
  const clusters = new Map();
  entries.forEach((e, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(e);
  });
  return Array.from(clusters.values());
}

function clusterCentroid(cluster) {
  const lat = cluster.reduce((sum, e) => sum + e.innovation.location.lat, 0) / cluster.length;
  const lng = cluster.reduce((sum, e) => sum + e.innovation.location.lng, 0) / cluster.length;
  return [lat, lng];
}

// Rebuilds everything drawn on the map from the current zoom, year filter and
// colour scheme: plain markers for anything on its own, a pie for a
// collapsed overlapping cluster, or a fan of markers with arrows for an
// expanded one.
function refreshMarkers() {
  groupLayer.clearLayers();
  const scheme = COLOR_SCHEMES[activeSchemeKey];
  const zoom = map.getZoom();
  const clusters = clusterVisibleEntries();
  legendHasClusters = clusters.some((c) => c.length > 1);

  clusters.forEach((cluster) => {
    cluster.forEach((e) => e.marker.setLatLng([e.innovation.location.lat, e.innovation.location.lng]));

    if (cluster.length === 1) {
      cluster[0].marker.addTo(groupLayer);
      return;
    }

    const centroid = clusterCentroid(cluster);

    if (zoom < SPREAD_ZOOM) {
      const colors = cluster.map((e) => colorForScheme(scheme, e.innovation));
      const names = cluster.map((e) => escapeHtml(`${e.innovation.developer.name} — ${e.innovation.crop.common_name}`)).join('<br>');
      const pie = L.marker(centroid, { icon: makeGroupIcon(colors, cluster.length), zIndexOffset: 1000 });
      pie.bindTooltip(`<span class="tooltip-subtitle">${cluster.length} nearby products:<br>${names}<br>Click to zoom in</span>`, {
        direction: 'top', offset: [0, -14], className: 'ge-label'
      });
      pie.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        map.flyTo(centroid, Math.max(SPREAD_ZOOM, map.getZoom()));
      });
      pie.addTo(groupLayer);
      return;
    }

    const centroidPt = map.latLngToLayerPoint(centroid);
    const n = cluster.length;
    const stepDeg = Math.min(70, 280 / n);
    const trueDots = new Map();

    cluster.forEach((e, i) => {
      const ang = (-90 + (i - (n - 1) / 2) * stepDeg) * Math.PI / 180;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const memberPt = L.point(centroidPt.x + dx * SPREAD_RADIUS_PX, centroidPt.y + dy * SPREAD_RADIUS_PX);
      e.marker.setLatLng(map.layerPointToLatLng(memberPt));

      // Arrow runs from just outside the member marker to just outside its
      // own true coordinate, not necessarily the cluster centroid — members
      // that share an exact coordinate end up pointing at the same spot.
      const truePt = map.latLngToLayerPoint([e.innovation.location.lat, e.innovation.location.lng]);
      const vx = truePt.x - memberPt.x;
      const vy = truePt.y - memberPt.y;
      const dist = Math.hypot(vx, vy) || 1;
      const ux = vx / dist;
      const uy = vy / dist;
      const lineStart = L.point(memberPt.x + ux * 11, memberPt.y + uy * 11);
      const lineEnd = L.point(truePt.x - ux * 12, truePt.y - uy * 12);
      L.polyline([map.layerPointToLatLng(lineStart), map.layerPointToLatLng(lineEnd)],
        { color: '#37474f', weight: 2, interactive: false }).addTo(groupLayer);
      const arrowPt = L.point(truePt.x - ux * 18, truePt.y - uy * 18);
      const deg = Math.atan2(uy, ux) * 180 / Math.PI;
      L.marker(map.layerPointToLatLng(arrowPt), { icon: makeArrowIcon(deg), interactive: false, keyboard: false }).addTo(groupLayer);
      e.marker.addTo(groupLayer);

      const key = `${e.innovation.location.lat},${e.innovation.location.lng}`;
      if (!trueDots.has(key)) trueDots.set(key, { latlng: [e.innovation.location.lat, e.innovation.location.lng], members: [] });
      trueDots.get(key).members.push(e);
    });

    trueDots.forEach((dot) => {
      const marker = L.marker(dot.latlng, { icon: anchorIcon, zIndexOffset: 800, keyboard: false });
      const label = dot.members.length > 1
        ? `True location of ${dot.members.length} products`
        : `True location: ${escapeHtml(dot.members[0].innovation.developer.name)}`;
      marker.bindTooltip(`<span class="tooltip-subtitle">${label}</span>`, {
        direction: 'bottom', offset: [0, 8], className: 'ge-label'
      });
      marker.addTo(groupLayer);
    });
  });
}

map.on('zoomend', refreshMarkers);

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
  const note = legendHasClusters
    ? '<div class="legend-note"><span class="legend-pie"></span>Nearby markers are grouped when zoomed out. Click to zoom in and spread them out.</div>'
    : '';
  document.getElementById('legend').innerHTML = `<div class="legend-title">${escapeHtml(scheme.label)}</div>${items.join('')}${note}`;
}

function applyScheme(schemeKey, { showDescription = false } = {}) {
  activeSchemeKey = schemeKey;
  const scheme = COLOR_SCHEMES[schemeKey];
  markersData.forEach(({ marker, innovation }) => {
    marker.setIcon(makeMarkerIcon(colorForScheme(scheme, innovation)));
  });
  refreshMarkers();
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
  const country = escapeHtml(humanize(a.country));
  const heading = total > 1 ? `Approval ${idx + 1} : ${country}` : `Approval : ${country}`;
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
  markersData.forEach((entry) => {
    entry.yearVisible = entry.innovation.__year == null || entry.innovation.__year <= year;
  });
  refreshMarkers();
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

if (demoMode) {
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.textContent = 'Demo mode: grouped markers prototype (includes a demo-only product)';
  document.body.appendChild(banner);
}

Promise.all([
  fetch('data/ge-crops.json').then((r) => r.json()),
  demoMode ? fetch('data/demo-grouping.json').then((r) => r.json()) : Promise.resolve({ innovations: [] })
])
  .then(([data, demo]) => {
    data.innovations = data.innovations.concat(demo.innovations);
    data.innovations.forEach((innovation) => {
      const loc = innovation.location;
      if (!loc) return;

      innovation.__year = earliestYear(innovation);

      const marker = L.marker([loc.lat, loc.lng], { icon: makeMarkerIcon(DEFAULT_COLOR) });

      const cropLabel = escapeHtml(`${innovation.crop.common_name} (${innovation.crop.species})`);
      const nameLabel = escapeHtml(humanize(innovation.innovation_name));
      marker.bindTooltip(`${cropLabel}<br><span class="tooltip-subtitle">${nameLabel}</span>`, {
        direction: 'top',
        offset: [0, -10],
        className: 'ge-label'
      });

      marker.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        openDetailPanel(innovation);
      });

      markersData.push({ marker, innovation, yearVisible: true });
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
