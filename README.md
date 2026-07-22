# Gene-Edited Crops Atlas

Interactive point map of commercially approved gene-edited crops (CRISPR/TALEN/SDN-1), one marker per innovation. Hover a marker to see its full record. Inspired by [EJAtlas](https://ejatlas.org/).

Live demo: https://tkzd779n5w-collab.github.io/GE_Crops/

## Data

`data/ge-crops.json` — curated catalogue of gene-edited crop approvals, CC BY 4.0. Each innovation includes crop/trait/edit details, developer info, and per-country regulatory approvals. `coverage_notes` records jurisdictions searched with no qualifying records, so absence is a confirmed finding rather than a gap.

`location` on each innovation is **not** in the original source — it was added to place a single marker per innovation on the map, at the developer's approximate headquarters/origin city. It is not the actual cultivation site.

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
