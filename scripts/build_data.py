#!/usr/bin/env python3
"""Convert the Marin Reach JSON-LD engagement graph into data/engagements.json and static RSS feeds.

Standard library only. Fails with a row number on invalid input.

  python3 scripts/build_data.py           # write data/engagements.json, data/ambiguities.md and feeds/
  python3 scripts/build_data.py --check   # verify the committed files are current (no writes)
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from email.utils import format_datetime
from datetime import timezone
from urllib.parse import quote_plus
from xml.sax.saxutils import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "source" / "marin-reach-engagements.json"
ALIASES = ROOT / "data" / "aliases.json"
SCHEMA = ROOT / "data" / "schema" / "engagement.schema.json"
OUTPUT = ROOT / "data" / "engagements.json"
REPORT = ROOT / "data" / "ambiguities.md"
FEEDS = ROOT / "feeds"
MANIFEST = ROOT / "marin.yml"

MULTI = ("agencies", "partners", "geographicAreas")
STATUSES = ["Planned", "Canceled", "Completed"]
LIST_DELIMITER = ";"  # commas appear inside names, so they are never delimiters
# Event additionalProperty names that map to record fields. Other properties are ignored.
PROPERTIES = {
    "Owner": "owner",
    "Type of Engagement": "type",
    "Geographic Area": "geographicAreas",
    "Engagement Status": "status",
}


class DataError(Exception):
    pass


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip() if isinstance(value, (str, type(None))) else ""


def parse_when(value, where, label):
    """Split an ISO date or date-time into (YYYY-MM-DD, HH:MM or None), keeping the written local time."""
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?", clean(value))
    if not match:
        raise DataError(f"{where}: {label} {value!r} is not YYYY-MM-DD or an ISO date-time")
    try:
        datetime.strptime(match.group(1), "%Y-%m-%d")
        if match.group(2):
            datetime.strptime(match.group(2), "%H:%M")
    except ValueError:
        raise DataError(f"{where}: {label} {value!r} is not a real date or time")
    return match.group(1), match.group(2)


def split_list(value):
    seen, out = set(), []
    for part in value.split(LIST_DELIMITER):
        part = clean(part)
        if part and part.casefold() not in seen:
            seen.add(part.casefold())
            out.append(part)
    return out


def load_aliases():
    data = json.loads(ALIASES.read_text(encoding="utf-8"))
    return {
        key: {k.casefold(): v for k, v in data.get(key, {}).items()}
        for key in ("agencies", "geographicAreas", "partners")
    }


def ref_names(node, field, nodes, where):
    """Names of the entities a field points at ({"@id": ...} or a list of them)."""
    names = []
    for ref in node.get(field) if isinstance(node.get(field), list) else [node.get(field)]:
        if ref is None:
            continue
        target = nodes.get(ref.get("@id")) if isinstance(ref, dict) and set(ref) == {"@id"} else ref
        if not isinstance(target, dict) or not clean(target.get("name")):
            raise DataError(f"{where}: {field} {ref!r} does not resolve to a named entity in the graph")
        names.append(clean(target["name"]))
    return names


ADDRESS_FIELDS = {
    "streetAddress": "streetAddress", "addressLocality": "locality", "addressRegion": "region",
    "postalCode": "postalCode", "addressCountry": "country",
}
# Generous Marin County box. Coordinates outside it are reported, never rejected or moved.
MARIN_BOUNDS = {"lat": (37.7, 38.4), "lon": (-123.2, -122.3)}


def parse_geo(geo, where):
    """Validate Schema.org GeoCoordinates. Both values are required together and must be numbers in range."""
    if not isinstance(geo, dict):
        raise DataError(f"{where}: geo must be a GeoCoordinates object")
    lat, lon = geo.get("latitude"), geo.get("longitude")
    if lat is None or lon is None:
        raise DataError(f"{where}: geo needs both latitude and longitude")
    for label, value, limit in (("latitude", lat, 90), ("longitude", lon, 180)):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise DataError(f"{where}: geo {label} {value!r} must be a number")
        if not -limit <= value <= limit:
            raise DataError(f"{where}: geo {label} {value!r} must be between -{limit} and {limit}")
    return {"latitude": float(lat), "longitude": float(lon)}


def build_place(target, where):
    """The map-facing facts about a location: kind, optional address, optional coordinates. Never guessed."""
    if target.get("@type") == "VirtualLocation":
        return {"kind": "virtual"}
    place = {"kind": "physical"}
    address = target.get("address")
    if isinstance(address, dict):
        parts = {out: clean(address.get(src)) for src, out in ADDRESS_FIELDS.items() if clean(address.get(src))}
        if parts:
            place["address"] = parts
    if "geo" in target:
        place["geo"] = parse_geo(target["geo"], where)
    return place


def resolve_ref(node, field, nodes, where):
    """Single entity a field points at ({"@id": ...} or inline), or None when the field is absent."""
    ref = node.get(field)
    if ref is None:
        return None
    target = nodes.get(ref.get("@id")) if isinstance(ref, dict) and set(ref) == {"@id"} else ref
    if not isinstance(target, dict):
        raise DataError(f"{where}: {field} {ref!r} does not resolve to an entity in the graph")
    return target


def build_records(text, aliases):
    if "\ufffd" in text:
        raise DataError("Source contains U+FFFD replacement characters; fix the character encoding in the JSON.")
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as err:
        raise DataError(f"Source is not valid JSON: {err}")
    graph = doc.get("@graph") if isinstance(doc, dict) else None
    if not isinstance(graph, list):
        raise DataError("Source must be a JSON-LD document with an @graph array")
    nodes = {n["@id"]: n for n in graph if isinstance(n, dict) and "@id" in n}

    records, used_ids = [], set()
    for node in graph:
        if not isinstance(node, dict) or node.get("@type") != "Event":
            continue
        where = f"Event {node.get('@id', clean(node.get('name')))}"
        props = {}
        for prop in node.get("additionalProperty", []):
            if prop.get("name") in PROPERTIES:
                props[PROPERTIES[prop["name"]]] = clean(prop.get("value"))

        projects = ref_names(node, "about", nodes, where)
        if len(projects) != 1:
            raise DataError(f"{where}: exactly one project is required in 'about'")
        if "startDate" not in node:
            raise DataError(f"{where}: startDate is required")
        status = next((s for s in STATUSES if s.casefold() == props.get("status", "").casefold()), None)
        if not status:
            raise DataError(f"{where}: Engagement Status {props.get('status')!r} must be one of {STATUSES}")
        date, start_time = parse_when(node["startDate"], where, "startDate")
        end_time = None
        if node.get("endDate"):
            end_date, end_time = parse_when(node["endDate"], where, "endDate")
            if end_date != date:
                raise DataError(f"{where}: endDate must be on the same day as startDate")

        audience = node.get("audience") or {}
        location = resolve_ref(node, "location", nodes, where)
        location_name = clean(location.get("name")) if location else ""
        if location is not None and not location_name and location.get("@type") != "VirtualLocation":
            raise DataError(f"{where}: location has no name")
        place = build_place(location, where) if location is not None else None
        source_values = {
            "agencies": ref_names(node, "organizer", nodes, where),
            "partners": ref_names(node, "sponsor", nodes, where),
            "geographicAreas": split_list(props.get("geographicAreas", "")),
        }
        record = {"project": projects[0], "owner": props.get("owner") or None}
        raw = {}
        for field in MULTI:
            display = []
            for value in source_values[field]:
                shown = aliases[field].get(value.casefold(), value)
                if shown.casefold() not in {d.casefold() for d in display}:
                    display.append(shown)
            record[field] = display
            if display != source_values[field]:
                raw[field] = source_values[field]
        record.update(
            audience=clean(audience.get("audienceType")) or None,
            eventName=clean(node.get("name")) or None,
            type=props.get("type") or None,
            date=date,
            startTime=start_time,
            endTime=end_time,
            location=location_name or ("Virtual" if place and place["kind"] == "virtual" else None),
            status=status,
        )
        if place:
            record["place"] = place
        if raw:
            record["raw"] = raw

        key = "|".join([
            record["project"], record["date"], record["startTime"] or "", record["eventName"] or "",
            ";".join(record["partners"]), ";".join(record["agencies"]), record["location"] or "",
        ])
        base = "eng-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
        record_id, n = base, 1
        while record_id in used_ids:
            n += 1
            record_id = f"{base}-{n}"
        used_ids.add(record_id)
        records.append({"id": record_id, **record})

    records.sort(key=lambda r: (r["date"], r["startTime"] or "", r["project"], r["id"]))
    return records


def validate(node, schema, root, path="$"):
    """Minimal JSON Schema checker for the keywords data/schema uses."""
    if "$ref" in schema:
        target = root
        for part in schema["$ref"].lstrip("#/").split("/"):
            target = target[part]
        return validate(node, target, root, path)
    if "const" in schema and node != schema["const"]:
        raise DataError(f"{path}: expected {schema['const']!r}")
    if "enum" in schema and node not in schema["enum"]:
        raise DataError(f"{path}: {node!r} not in {schema['enum']}")
    types = schema.get("type")
    if types:
        names = types if isinstance(types, list) else [types]
        py = {"string": str, "object": dict, "array": list, "null": type(None), "number": (int, float)}
        if not any(isinstance(node, py[t]) and not isinstance(node, bool) for t in names):
            raise DataError(f"{path}: expected {names}, found {type(node).__name__}")
    if isinstance(node, (int, float)) and not isinstance(node, bool):
        if "minimum" in schema and node < schema["minimum"]:
            raise DataError(f"{path}: {node!r} is below {schema['minimum']}")
        if "maximum" in schema and node > schema["maximum"]:
            raise DataError(f"{path}: {node!r} is above {schema['maximum']}")
    if isinstance(node, str):
        if len(node) < schema.get("minLength", 0):
            raise DataError(f"{path}: must not be empty")
        if "pattern" in schema and not re.search(schema["pattern"], node):
            raise DataError(f"{path}: {node!r} does not match {schema['pattern']}")
    if isinstance(node, dict):
        for key in schema.get("required", []):
            if key not in node:
                raise DataError(f"{path}: missing required field {key!r}")
        props = schema.get("properties", {})
        for key, value in node.items():
            if key in props:
                validate(value, props[key], root, f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                raise DataError(f"{path}: unexpected field {key!r}")
            elif isinstance(schema.get("additionalProperties"), dict):
                validate(value, schema["additionalProperties"], root, f"{path}.{key}")
    if isinstance(node, list) and "items" in schema:
        for i, item in enumerate(node):
            validate(item, schema["items"], root, f"{path}[{i}]")


def normalize_key(value):
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def ambiguity_report(records, aliases):
    lines = ["# Data ambiguities", "",
             "Generated by `scripts/build_data.py`. Nothing here is merged automatically; "
             "resolve each item in the source JSON or in `data/aliases.json`.", ""]
    findings = []
    for field, label in (("agencies", "Agency/Department"), ("geographicAreas", "Geographic Area")):
        alias_targets = {v.casefold() for v in aliases[field].values()}
        values = {v for r in records for v in r[field]}
        for value in sorted(values):
            if re.fullmatch(r"[A-Z0-9]{2,5}", value) and value.casefold() not in alias_targets:
                findings.append(f"- {label} `{value}` looks like an abbreviation with no alias entry.")
    for field, label in (("agencies", "Agency/Department"), ("partners", "Partner"),
                         ("geographicAreas", "Geographic Area")):
        groups = {}
        for value in {v for r in records for v in r[field]}:
            groups.setdefault(normalize_key(value), set()).add(value)
        for variants in groups.values():
            if len(variants) > 1:
                findings.append(f"- {label} values may be the same: {', '.join(f'`{v}`' for v in sorted(variants))}.")
    audiences = {r["audience"] for r in records if r["audience"]}
    groups = {}
    for value in audiences:
        groups.setdefault(normalize_key(value), set()).add(value)
    for variants in groups.values():
        if len(variants) > 1:
            findings.append(f"- Audience values may be the same: {', '.join(f'`{v}`' for v in sorted(variants))}.")
    for r in records:
        geo = r.get("place", {}).get("geo")
        if geo and not (MARIN_BOUNDS["lat"][0] <= geo["latitude"] <= MARIN_BOUNDS["lat"][1]
                        and MARIN_BOUNDS["lon"][0] <= geo["longitude"] <= MARIN_BOUNDS["lon"][1]):
            findings.append(f"- Coordinates for `{r['location']}` ({geo['latitude']}, {geo['longitude']}) fall outside "
                            "Marin County; confirm they are correct (they are kept as supplied).")
    findings = sorted(set(findings))
    lines += findings or ["No ambiguous values found."]
    return "\n".join(lines) + "\n"


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def site_url():
    match = re.search(r"^\s*url:\s*(\S+)\s*$", MANIFEST.read_text(encoding="utf-8"), re.M)
    if not match:
        raise DataError("marin.yml has no deployment url for RSS links")
    return match.group(1).rstrip("/") + "/"


def format_time(value):
    hour = int(value[:2])
    return f"{hour % 12 or 12}:{value[3:]} {'AM' if hour < 12 else 'PM'}"


def feed_item(record, base):
    lines = [
        ("Project", record["project"] if record["eventName"] else ""),
        ("Time", (format_time(record["startTime"]) + (" to " + format_time(record["endTime"]) if record["endTime"] else ""))
         if record["startTime"] else ""),
        ("Location", record["location"] or ""),
        ("Agency/Department", ", ".join(record["agencies"])),
        ("Partner", ", ".join(record["partners"])),
        ("Audience", record["audience"] or ""),
        ("Type", record["type"] or ""),
        ("Geographic area", ", ".join(record["geographicAreas"])),
        ("Owner", record["owner"] or ""),
        ("Status", record["status"]),
    ]
    description = "\n".join(f"{k}: {v}" for k, v in lines if v)
    day = datetime.strptime(record["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    title = f"{record['eventName'] or record['project']} ({record['date']})"
    link = f"{base}?project={quote_plus(record['project'])}"
    return (
        "    <item>\n"
        f"      <title>{escape(title)}</title>\n"
        f"      <link>{escape(link)}</link>\n"
        f"      <guid isPermaLink=\"false\">{record['id']}</guid>\n"
        f"      <pubDate>{format_datetime(day, usegmt=True)}</pubDate>\n"
        f"      <description>{escape(description)}</description>\n"
        "    </item>\n"
    )


def build_feeds(records):
    """Static RSS 2.0 feeds: feeds/all.xml plus feeds/project-<slug>.xml. Newest event date first."""
    base = site_url()

    def render(title, items):
        body = "".join(feed_item(r, base) for r in sorted(items, key=lambda r: (r["date"], r["id"]), reverse=True))
        return (
            '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n'
            f"    <title>{escape(title)}</title>\n    <link>{escape(base)}</link>\n"
            f"    <description>{escape(title)}: community engagement records.</description>\n{body}"
            "  </channel>\n</rss>\n"
        )

    feeds = {"all.xml": render("Marin Reach: all engagements", records)}
    slugs = {}
    for project in sorted({r["project"] for r in records}):
        slug = slugify(project)
        if slug in slugs:
            raise DataError(f"Projects {slugs[slug]!r} and {project!r} produce the same feed name {slug!r}")
        slugs[slug] = project
        feeds[f"project-{slug}.xml"] = render(f"Marin Reach: {project}", [r for r in records if r["project"] == project])
    return feeds


def generate():
    text = SOURCE.read_text(encoding="utf-8")
    aliases = load_aliases()
    records = build_records(text, aliases)
    dataset = {"schemaVersion": 1, "source": SOURCE.name, "records": records}
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validate(dataset, schema, schema)
    return (json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", ambiguity_report(records, aliases),
            len(records), build_feeds(records))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="fail if committed outputs are out of date")
    args = parser.parse_args()
    try:
        output, report, count, feeds = generate()
    except DataError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 1
    if args.check:
        stale = [p.name for p, want in ((OUTPUT, output), (REPORT, report))
                 if not p.exists() or p.read_text(encoding="utf-8") != want]
        stale += [f"feeds/{name}" for name, want in feeds.items()
                  if not (FEEDS / name).exists() or (FEEDS / name).read_text(encoding="utf-8") != want]
        stale += [f"feeds/{p.name}" for p in FEEDS.glob("*.xml") if p.name not in feeds] if FEEDS.exists() else []
        if stale:
            print(f"ERROR: {', '.join(stale)} out of date; run python3 scripts/build_data.py", file=sys.stderr)
            return 1
        print(f"Data: PASS ({count} records)")
        return 0
    OUTPUT.write_text(output, encoding="utf-8")
    REPORT.write_text(report, encoding="utf-8")
    FEEDS.mkdir(exist_ok=True)
    for old in FEEDS.glob("*.xml"):
        old.unlink()
    for name, text in feeds.items():
        (FEEDS / name).write_text(text, encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} ({count} records) and {len(feeds)} feeds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
