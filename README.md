# Marin Reach

## About this app

- **Purpose:** Give County staff one place to coordinate community engagement across departments and projects, and see what is happening, when, where, with whom, and by which County organizations.
- **Audience:** County engagement coordinators, project leads, department and agency staff, and leadership. Internal tool.
- **Owner:** TBD
- **Repo:** marincountygov/marin-reach
- **Status:** Alpha

## What it does

- **List** (default), **Calendar** (month grid, with an agenda on small screens) and **Stats** tabs, laid out like marin-mentions. All three read the same filtered records.
- A persistent filter sidebar (a toggle on small screens): search with Reset, a Date range, then collapsed dropdowns, like the monitors in marin-mentions, with multi-select checkboxes for Audience, Type, Project, Agency/Department, Partner, Status, Location and Owner. Choices within a facet combine with OR; facets combine with AND.
- The list, CSV and copied text are newest date first.
- A "Showing:" line that describes the active filters and counts.
- List: a checkbox per listing and Select all, plus Copy, Link, CSV and RSS buttons. Copy and CSV use the checked listings, or everything shown when none are checked. RSS is available for all engagements or one project.
- Stats: Planned, Completed, Canceled and Partners, and charts for events over time, by agency/department and by project, each with a PNG button, plus Copy and All PNG.
- Filter, search and view state live in the URL query string, so filtered pages can be bookmarked and shared.
- Not in v1: authentication, a database or CMS, notifications, metadata fields, AI, submission workflow, or a map. See [docs/decisions.md](docs/decisions.md).

## Run locally

From the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Use HTTP rather than `file://`; the app fetches `data/engagements.json`. There is no build step and no Node runtime in production. Node (18+) is only used to run unit tests.

## Commands

| Command | Purpose |
|---|---|
| `python3 scripts/build_data.py` | Convert `data/source/*.csv` to `data/engagements.json`, refresh `data/ambiguities.md`, and regenerate `feeds/*.xml` |
| `python3 scripts/build_data.py --check` | Fail if the committed data files are out of date |
| `bash scripts/check.sh` | Lint-level checks, data check, Python and Node unit tests |
| `bash scripts/check.sh --browser` | Also runs the browser workflow and CSP tests (needs Playwright for Python and Chromium) |

## Updating the data

1. Replace `data/source/community-engagement-tracker.csv` with the new export (UTF-8).
2. Run `python3 scripts/build_data.py`. It fails with a row number on invalid data.
3. Read `data/ambiguities.md`; fix the source or add an alias in `data/aliases.json`.
4. Commit the CSV and the regenerated `data/engagements.json` and `feeds/` together. Pages serves the committed file.

See [docs/data-dictionary.md](docs/data-dictionary.md) for fields, normalization rules and the schema.

## Architecture

```text
data/source/*.csv --scripts/build_data.py--> data/engagements.json (validated against data/schema/) + feeds/*.xml
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
