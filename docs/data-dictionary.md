# Data dictionary and normalization rules

Source: `data/source/community-engagement-tracker.csv`. Output: `data/engagements.json`, shaped as `{ "schemaVersion": 1, "source": "<csv name>", "records": [...] }` and validated against `data/schema/engagement.schema.json` on every build. Records are sorted by date, start time, project, id. The output has no timestamp, so rebuilding unchanged input gives identical bytes.

## Fields

| JSON field | CSV column | Type | Required | Notes |
|---|---|---|---|---|
| `id` | none | string | Yes | `eng-` plus 10 hex characters of a SHA-1 over project, date, start time, event name, partners, agencies and location. A numeric suffix (`-2`, `-3`) breaks exact-duplicate collisions in file order. |
| `project` | Project | string | Yes | |
| `owner` | Owner | string or null | No | |
| `agencies` | Agency/Department | string list | No | County organizations. Aliased. Multi-value. |
| `partners` | Partner | string list | No | Community or external partners. Multi-value. |
| `audience` | Audience | string or null | No | |
| `eventName` | Event Name | string or null | No | The calendar and list use the project as the label when blank. |
| `type` | Type of Engagement | string or null | No | Values as supplied; no new taxonomy. |
| `geographicAreas` | Geographic Area | string list | No | Aliased. Multi-value. Blank is valid. |
| `date` | Date | `YYYY-MM-DD` | Yes | Source accepts `M/D/YYYY` or ISO. |
| `startTime` | Start Time | `HH:MM` 24-hour or null | No | Source accepts `7:00:00 PM`, `6:00 PM`, `19:00`. |
| `endTime` | End Time | `HH:MM` or null | No | May be blank. |
| `location` | Location | string or null | No | Display and search text only. |
| `status` | Engagement Status | `Planned`, `Canceled`, `Completed` | Yes | Case-insensitive on import; any other value fails the build. |
| `raw` | none | object | No | Present only when an alias changed a label: `{ "agencies": ["CDA"] }` holds the source values. |

`Event Name`, times and `Location` are searchable or displayed but are not sidebar filters.

## Feeds

`scripts/build_data.py` also writes static RSS 2.0 feeds: `feeds/all.xml` and `feeds/project-<slug>.xml` for each project, newest event date first. Items use the event date as `pubDate`, the record `id` as the GUID, and link to the app filtered by project. `--check` fails on missing, stale or extra feed files.

## Rules

1. Headers and values are trimmed; internal runs of whitespace collapse to one space.
2. The header set must match the table above exactly (after trimming). Unknown or missing headers fail the build.
3. Rows missing Project or Date fail with the row number. Blank rows are skipped.
4. Multi-value fields split on `;` only and are de-duplicated case-insensitively. Commas are never delimiters.
5. Aliases come from `data/aliases.json` (case-insensitive match on the trimmed value) for `agencies`, `geographicAreas` and `partners`. Unlisted values pass through unchanged.
6. The build fails on U+FFFD replacement characters, which indicate a damaged export.
7. Uncertain values are reported in `data/ambiguities.md`, never merged: abbreviation-like values with no alias, and values that differ only by case, spacing or punctuation.

## Current aliases

`CDA` = Community Development Agency. `OCE` = Office of the County Executive. `D1` to `D5` = District 1 to District 5 (agencies and geographic areas).

## Stats definitions

- **Planned, Completed, Canceled:** record counts by status in the filtered set.
- **Partners:** distinct non-blank `partners` values in the filtered set. It counts values entered, not verified organizations.
- **Events over time:** records per month across the filtered range, with empty months shown as 0.
- **By agency/department:** a record with several agencies counts once for each, so the total can exceed the record count.
- **By project:** one count per record.
