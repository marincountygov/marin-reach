# Marin Reach

## About this app

- **Purpose:** Give County staff one place to coordinate community engagement across departments and projects, and see what is happening, when, where, with whom, and by which County organizations.
- **Audience:** County engagement coordinators, project leads, department and agency staff, and leadership. Internal tool.
- **Owner:** TBD
- **Repo:** marincountygov/marin-reach
- **Status:** Alpha

## What it does

- **List** (default), **Calendar** (month grid, with an agenda on small screens), **Map** and **Stats** tabs, laid out like marin-mentions. All four read the same filtered records.
- A filter sidebar that can be hidden with an icon-only Filters button at the top of the left column (open by default on wide screens and remembered in the browser, closed on small ones): search with Reset, a Date range, then collapsed dropdowns, like the monitors in marin-mentions, with multi-select checkboxes for Audience, Type, Project, Agency/Department, Partner, Status, Location and Owner. Choices within a facet combine with OR; facets combine with AND.
- The list, CSV and copied text are newest date first.
- A "Showing:" line that describes the active filters and counts.
- List: a checkbox per listing and Select all, plus Copy, Link, CSV and RSS buttons. Copy and CSV use the checked listings, or everything shown when none are checked. RSS is available for all engagements or one project.
- Map: a Leaflet map of engagement locations (`?view=map`). Each marker is a keyboard-focusable button; choosing one shows its address and engagements below the map, each with a Copy button, and a Clear button under the map clears the choice. Nearby markers group into numbered clusters that zoom in when chosen. A Full window button fills the browser window with the map, its buttons, the locations list and the details (Escape closes it). Under the map, an alphabetical Locations dropdown (default All locations) does the same as the markers, Re-center reframes all markers, and each place has Copy and an icon-only Get directions button below its address. Listings have the same directions button next to Copy and Show on map. The chosen place is in the URL (`place=`) so it can be shared. List and Calendar listings have Show on map. A status line gives the mapped and unmapped counts (virtual, no coordinates, no location). Engagements at the same coordinates share a marker. Engagements without coordinates stay in List. Coordinates come from the source data and are never guessed. Leaflet 1.9.4 is vendored in `vendor/leaflet/`; tiles come from OpenStreetMap (see [docs/decisions.md](docs/decisions.md)).
- Stats: Planned, Completed, Canceled and Partners, and charts for events over time, by agency/department and by project, each with a PNG button, plus Copy and All PNG.
- Filter, search and view state live in the URL query string, so filtered pages can be bookmarked and shared.
- Not in v1: authentication, a database or CMS, notifications, metadata fields, AI, or a submission workflow. See [docs/decisions.md](docs/decisions.md).

## Run locally

From the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Use HTTP rather than `file://`; the app fetches `data/engagements.json`. There is no build step and no Node runtime in production. Node (18+) is only used to run unit tests.

## Commands

| Command | Purpose |
|---|---|
| `python3 scripts/build_data.py` | Convert `data/source/marin-reach-engagements.json` to `data/engagements.json`, refresh `data/ambiguities.md`, and regenerate `feeds/*.xml` |
| `python3 scripts/build_data.py --check` | Fail if the committed data files are out of date |
| `bash scripts/check.sh` | Lint-level checks, data check, Python and Node unit tests |
| `bash scripts/check.sh --browser` | Also runs the browser workflow and CSP tests (needs Playwright for Python and Chromium) |

## Updating the data

1. Edit `data/source/marin-reach-engagements.json` (JSON-LD, UTF-8): add or change Event entries, and the Project, Person, Organization and Place entries they point to.
2. Run `python3 scripts/build_data.py`. It fails with the event id on invalid data.
3. Read `data/ambiguities.md`; fix the source or add an alias in `data/aliases.json`.
4. Commit the source JSON and the regenerated `data/engagements.json` and `feeds/` together. Pages serves the committed file.

See [docs/data-dictionary.md](docs/data-dictionary.md) for fields, normalization rules and the schema.

## Architecture

```text
data/source/*.json --scripts/build_data.py--> data/engagements.json (validated against data/schema/) + feeds/*.xml
                                                   |
                                  assets/selectors.js  (pure filter, calendar, stats functions)
                                                   |
                                  assets/app.js        (URL state + rendering)
```

- Static site on GitHub Pages built from `marin-app-template` and the vendored Marin App Shell (`vendor/marinos/`, pinned in `marin.yml`). The shell supplies the header, footer, About, Security, Accessibility, Tech and Updates sections.
- `assets/selectors.js` is the only place that filters records, groups them by date or computes stats. The List, Calendar and Stats all call it, so counts always agree.
- `assets/app.js` holds no canonical data. It loads the JSON, reads and writes the query string, and renders.
- **Runtime dependencies:** the shell and vendored Chart.js 4.5.1 (`vendor/chart.min.js`, the same reviewed bundle as marin-mentions), which draws the Stats charts. Each chart has a screen-reader-only data table and a text summary. Build-time scripts use the Python and Node standard libraries only.
- Outside services: none (`services: none` in `marin.yml`). Security policy is in `security.json`; after a reviewed change run `python3 scripts/sync-security-meta.py --write`.

## Deployment

GitHub Pages serves the repository root from `main` (`marin.yml`: `deployment.target: github-pages`, URL `https://marincountygov.github.io/marin-reach/`). Because the JSON is committed, no build or workflow is needed. Keep `.nojekyll`. Before relying on the deployed app, confirm the Pages source setting and complete the security and accessibility reviews; this repository does not claim either.

## Related resources

- [marin-app-shell](https://github.com/marincountygov/marin-app-shell), [marin-ui](https://github.com/marincountygov/marin-ui), [marin-digital-standards](https://github.com/marincountygov/marin-digital-standards)
- [marin-mentions](https://github.com/marincountygov/marin-mentions): the filter-sidebar interaction model Reach follows
- [AGENTS.md](AGENTS.md): instructions for coding agents
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
