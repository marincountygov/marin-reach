# Changelog

Changes to Marin Reach. The shell dependency is tracked separately by `platform.shell` in `marin.yml`.

## Unreleased

- Checkboxes are 24 px square. Shell 1.11.1 links `security.txt` and WCAG once each.
- Accessibility review fixes: Stats fits at 320 px, chart text and grid follow the page colors in dark mode, per-listing controls have unique names, the RSS link answers Space and says it opens in a new tab, and Marin App Shell 1.10.1 raises form control borders to 3:1. See `docs/accessibility-review.md`.
- First implementation from `marin-app-template` 2.0.2: CSV to JSON data pipeline with schema validation and aliases, filter sidebar, List, Calendar and Stats, URL-backed state, documentation and tests.
