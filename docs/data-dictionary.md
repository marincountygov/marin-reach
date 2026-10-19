# Data dictionary and normalization rules

Source: `data/source/marin-reach-engagements.json`, a JSON-LD graph (`@graph`) of `Event` entries plus the `gs:Project`, `Person`, organization and `Place` entries they reference by `@id`. Output: `data/engagements.json`, shaped as `{ "schemaVersion": 1, "source": "<source file name>", "records": [...] }` and validated against `data/schema/engagement.schema.json` on every build. Records are sorted by date, start time, project, id. The output has no timestamp, so rebuilding unchanged input gives identical bytes.

## Fields

| JSON field | Source (on the Event) | Type | Required | Notes |
|---|---|---|---|---|
| `id` | none | string | Yes | `eng-` plus 10 hex characters of a SHA-1 over project, date, start time, event name, partners, agencies and location. A numeric suffix (`-2`, `-3`) breaks exact-duplicate collisions in file order. |
| `project` | `about` | string | Yes | Name of the referenced project. Exactly one. |
| `owner` | property `Owner` | string or null | No | |
| `agencies` | `organizer` | string list | No | Name of the referenced organization. Aliased. |
| `partners` | `sponsor` | string list | No | Name of the referenced organization. Aliased. |
| `audience` | `audience.audienceType` | string or null | No | |
| `eventName` | `name` | string or null | No | The calendar and list use the project as the label when blank. |
| `type` | property `Type of Engagement` | string or null | No | Values as supplied; no new taxonomy. |
| `geographicAreas` | property `Geographic Area` | string list | No | Aliased. Multi-value, split on `;`. |
| `date` | `startDate` | `YYYY-MM-DD` | Yes | The date as written, with no time-zone conversion. |
| `startTime` | `startDate` | `HH:MM` 24-hour or null | No | The local time as written. A date-only `startDate` gives null. |
| `endTime` | `endDate` | `HH:MM` or null | No | `endDate` must fall on the same day as `startDate`. |
| `location` | `location` | string or null | No | Name of the referenced place. Display and search text only; address and coordinates are not carried over. |
| `place` | `location` | object | No | See Location below. Absent when the event has no location. |
| `status` | property `Engagement Status` | `Planned`, `Canceled`, `Completed` | Yes | Case-insensitive on import; any other value fails the build. |
| `raw` | none | object | No | Present only when an alias changed a label: `{ "agencies": ["CDA"] }` holds the source values. |

Properties are `PropertyValue` entries in the Event's `additionalProperty`. Other properties (for example `Location verification`) and `eventStatus` are ignored. `Event Name`, times and `Location` are searchable or displayed but are not sidebar filters.

## Location

`location` (the venue name) and `place` come from the Event's `location`, which is a Schema.org `Place` (or `CivicStructure`) or `VirtualLocation`, inline or referenced by `@id`.

| `place` field | Source | Notes |
|---|---|---|
| `kind` | `@type` | `virtual` for `VirtualLocation`, otherwise `physical`. |
| `address` | `address` (`PostalAddress`) | Optional. Keys: `streetAddress`, `locality`, `region`, `postalCode`, `country`. Empty values are dropped. |
| `geo` | `geo` (`GeoCoordinates`) | Optional. `{ latitude, longitude }`. |

- **Optional:** an event may have a physical place with coordinates, a physical place without them, a virtual location, or no location. All are valid. Only the first can be placed on the map.
- **Validation:** `latitude` is a number from -90 to 90, `longitude` a number from -180 to 180, and both must be present. Anything else fails the build with the event id. Coordinates are never guessed or looked up from addresses.
- **Outside Marin County:** coordinates are kept as supplied and listed in `data/ambiguities.md` so someone can confirm them.
- **Location versus Geographic Area:** `location` is where the event takes place. `geographicAreas` is the community or area the engagement concerns. Neither is inferred from the other: an event about District 3 can be held elsewhere.
- **Not carried over:** other properties on a place, such as verification notes.

## Feeds

`scripts/build_data.py` also writes static RSS 2.0 feeds: `feeds/all.xml` and `feeds/project-<slug>.xml` for each project, newest event date first. Items use the event date as `pubDate`, the record `id` as the GUID, and link to the app filtered by project. `--check` fails on missing, stale or extra feed files.

## Rules

1. Names and values are trimmed; internal runs of whitespace collapse to one space.
2. Only `@type: "Event"` entries become records. Every `@id` reference in `about`, `organizer`, `sponsor` and `location` must resolve to a named entry in the graph, or the build fails with the event id.
3. Events missing a project, `startDate` or a valid `Engagement Status` fail with the event id.
4. Multi-value fields split on `;` only and are de-duplicated case-insensitively. Commas are never delimiters.
5. Aliases come from `data/aliases.json` (case-insensitive match on the trimmed value) for `agencies`, `geographicAreas` and `partners`. Unlisted values pass through unchanged.
6. The build fails on invalid JSON and on U+FFFD replacement characters, which indicate a damaged export.
7. Uncertain values are reported in `data/ambiguities.md`, never merged: abbreviation-like values with no alias, and values that differ only by case, spacing or punctuation.

## Current aliases

`CDA` = Community Development Agency. `OCE` = Office of the County Executive. `D1` to `D5` = District 1 to District 5 (agencies and geographic areas).

## Stats definitions

- **Planned, Completed, Canceled:** record counts by status in the filtered set.
- **Partners:** distinct non-blank `partners` values in the filtered set. It counts values entered, not verified organizations.
- **Events over time:** records per month across the filtered range, with empty months shown as 0.
- **By agency/department:** a record with several agencies counts once for each, so the total can exceed the record count.
- **By project:** one count per record.
