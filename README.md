# Gene-Edited Crops Atlas

Interactive point map of commercially approved gene-edited crops (CRISPR/TALEN/SDN-1), one marker per innovation. Inspired by [EJAtlas](https://ejatlas.org/).

Live demo: https://tkzd779n5w-collab.github.io/GE_Crops/

## Features

- **Hover** a marker for a quick ID label; **click** it to open a full-height side panel with the complete record (crop/trait/edit details, developer, and every per-country approval) — long entries scroll independently instead of being clipped in a small popup.
- **Colour markers by** (top-right control): Technique, Commercial status, Crop type, or Crop trait — each with its own legend.
- **Year slider** (bottom of the map, with play/pause): filters markers to those first approved by the selected year, so you can scrub or auto-play through the timeline of approvals.

## Data

`data/ge-crops.json` — curated catalogue of gene-edited crop approvals, CC BY 4.0. Each innovation includes crop/trait/edit details, developer info, and per-country regulatory approvals. `coverage_notes` records jurisdictions searched with no qualifying records, so absence is a confirmed finding rather than a gap.

`location` on each innovation is **not** in the original source — it was added to place a single marker per innovation on the map, at the developer's approximate headquarters/origin city. It is not the actual cultivation site.

As of the last data refresh (2026-08-05), the catalogue covers 18 innovations and 26 approval records across the US, Canada, China, India, Japan, the Philippines, the UK, and Brazil, plus 19 "searched, no qualifying record" coverage notes for other countries/regions.

## Updating the data

Edit `data/ge-crops.json` directly: add a new object to `innovations` with an `id`, `location` (`lat`/`lng`/`place`), and the same fields as the existing entries. Commit and push — GitHub Pages redeploys automatically.

## Running locally

Static site, no build step. Any static file server works, e.g.:

```
npx http-server .
```

On Windows without Node installed, `serve.ps1` is included as a fallback:

```powershell
powershell -File serve.ps1 -Port 8091
```

## Tech

[Leaflet](https://leafletjs.com/) + OpenStreetMap tiles (loaded via CDN), matching EJAtlas's map style.
