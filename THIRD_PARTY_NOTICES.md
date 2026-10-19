# Third-party notices

## Marin App Shell

This app vendors the complete, unmodified Marin App Shell distribution in `vendor/marinos/`. Its version, Marin UI baseline, and release-file hashes are recorded in `vendor/marinos/manifest.json`.

Keep the notices distributed with that release:

- `vendor/marinos/licenses/MARIN_APP_SHELL_LICENSE.txt`
- `vendor/marinos/licenses/LUCIDE_LICENSE.txt`
- `vendor/marinos/licenses/OPEN_SANS_OFL.txt`

`vendor/marinos/marinos.css` includes the Pico CSS baseline and its embedded license attribution. Do not strip the notices when updating or redistributing the shell.

## Existing application font assets

Font assets remain under `vendor/fonts/`, outside the replaceable shell directory. Retain their accompanying license information, including `vendor/fonts/open-sans/OFL.txt`. The shell uses these local assets and can fall back to system fonts when they are unavailable.

Add notices for app-specific dependencies here when building the actual workflow.

## Chart.js

- Chart.js 4.5.1, MIT License

The vendored bundle `vendor/chart.min.js` renders the Stats charts. Keep `vendor/CHART_LICENSE.md` with it. It is the same reviewed bundle used by marin-mentions; do not load it from a CDN.

## Leaflet

- Leaflet 1.9.4, BSD 2-Clause License (`vendor/leaflet/LICENSE`)

The vendored `vendor/leaflet/leaflet.js` and `leaflet.css` render the Map view. Do not load them from a CDN. Only the files the app uses are kept; the layer-control and default-marker images are not vendored because the app uses neither.
