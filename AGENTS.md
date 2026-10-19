# Working on marin-reach

## Architecture

Marin Reach is a static, list-first community engagement browser. `scripts/build_data.py` converts the JSON-LD graph `data/source/marin-reach-engagements.json` into `data/engagements.json` (validated against `data/schema/engagement.schema.json`); the committed JSON is what the site reads. `assets/selectors.js` holds every filter, search, calendar-grouping and stats function; `assets/app.js` renders and keeps state in the URL query string. There is no database, server runtime or build step for the site. A Map view (Leaflet, vendored in `vendor/`) is planned and approved; see `docs/decisions.md`. Charts use the vendored Chart.js bundle, as marin-mentions does.

Built from `marin-app-template` with the Marin App Shell vendored in `vendor/marinos/`. The shell owns the header, footer, standard sections and `#app-status-message`. Do not edit `vendor/marinos/`; adopt shell releases with the shell installer and keep `platform.shell` in `marin.yml` equal to `vendor/marinos/manifest.json`.

## Rules

- All views must derive from `applyFilters()` in `assets/selectors.js`. Never add a second filtering or counting path.
- Aliases and display names are data (`data/aliases.json`), never UI conditionals. Never silently merge uncertain values; they go to `data/ambiguities.md`.
- Do not add fields, metadata features, notes, a database, authentication, AI, or new runtime dependencies without explicit approval. The approved map work covers Leaflet, Leaflet.markercluster, one tile host (OpenStreetMap) and the `place` field only. Open items live in `docs/decisions.md`.
- Multi-value fields split on `;` only, because commas appear inside names.
- Status values are `Planned`, `Canceled`, `Completed`, shown as entered (a past Planned date is not flagged).
- Keep the CSP static. After a reviewed `security.json` change, run `python3 scripts/sync-security-meta.py --write`. No inline scripts or `style` attributes; set styles through the CSSOM in JS.
- Status is always text, never color alone. Every chart needs a text summary (`aria-label`) and a screen-reader-only data table.
- No "view" in UI button/link text.
- The primary page has no intro paragraph and no visible page heading; explanation belongs in About. No help text under the search box.
- Follow marin-mentions for the browsing UI: `mm-tab` tablist (List, Calendar, Map, Stats), a "Showing: ... (N engagements — ...)" line instead of filter chips, Reset under search, a Copy / Link / CSV / RSS button row on the list, Copy / All PNG / Link on Stats, a per-chart PNG button, and a checkbox per listing with Select all. Charts are Chart.js canvases in `app-card`s using marin-mentions' blue (`#0777cf`).
- The filter panel hides behind an icon-only white Filters button at the top of the left column, at every width. It is the shell's: an empty `button.filter-toggle[data-filter-toggle]` (the shell draws the `panel-right-open` and `panel-left-open` icons and runs the toggle), with `data-filter-active` kept current by `syncControls()` and a `marin-filters-change` listener that resizes the map. Do not copy its CSS or script back into the app. Sidebar order: search and Reset, Date, then collapsed `details.mm-facet-group` dropdowns (as the monitors in marin-mentions): Audience, Type, Project, Agency/Department, Partner, Status, Location, Owner. "Location" is the filter name for the Geographic Area field; listings still label that field "Geographic area" because they also show the venue as "Location".

## Before finishing

Run `python3 scripts/build_data.py` after source JSON, alias or feed changes, then `bash scripts/check.sh` and, when Playwright is available, `bash scripts/check.sh --browser`. Report any check not run. Review keyboard operation, 200% zoom/reflow and light/dark modes. Do not claim a security or accessibility review.

## References

- `marin-app-template`, `marin-app-shell`, `marin-ui`, `marin-digital-standards`, `marin-mentions` (filter pattern).
- [README.md](README.md), [docs/data-dictionary.md](docs/data-dictionary.md), [docs/decisions.md](docs/decisions.md), [docs/development.md](docs/development.md).
