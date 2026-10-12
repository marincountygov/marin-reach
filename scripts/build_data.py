#!/usr/bin/env python3
"""Convert the Community Engagement Tracker CSV into data/engagements.json and static RSS feeds.

Standard library only. Fails with a row number on invalid input.

  python3 scripts/build_data.py           # write data/engagements.json, data/ambiguities.md and feeds/
  python3 scripts/build_data.py --check   # verify the committed files are current (no writes)
"""
import argparse
import csv
import hashlib
import io
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
SOURCE = ROOT / "data" / "source" / "community-engagement-tracker.csv"
ALIASES = ROOT / "data" / "aliases.json"
SCHEMA = ROOT / "data" / "schema" / "engagement.schema.json"
OUTPUT = ROOT / "data" / "engagements.json"
REPORT = ROOT / "data" / "ambiguities.md"
FEEDS = ROOT / "feeds"
MANIFEST = ROOT / "marin.yml"

# CSV header (after trimming) -> record field.
COLUMNS = {
    "Project": "project",
    "Owner": "owner",
    "Agency/Department": "agencies",
    "Partner": "partners",
    "Audience": "audience",
    "Event Name": "eventName",
    "Type of Engagement": "type",
    "Geographic Area": "geographicAreas",
    "Date": "date",
    "Start Time": "startTime",
    "End Time": "endTime",
    "Location": "location",
    "Engagement Status": "status",
}
MULTI = {"agencies": "agencies", "partners": "partners", "geographicAreas": "geographicAreas"}
STATUSES = ["Planned", "Canceled", "Completed"]
LIST_DELIMITER = ";"  # commas appear inside names, so they are never delimiters


class DataError(Exception):
    pass


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date(value, where):
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise DataError(f"{where}: Date {value!r} is not M/D/YYYY or YYYY-MM-DD")


def parse_time(value, where, label):
    if not value:
        return None
    for fmt in ("%I:%M:%S %p", "%I:%M %p", "%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value.upper(), fmt).strftime("%H:%M")
        except ValueError:
            pass
    raise DataError(f"{where}: {label} {value!r} is not a recognizable time")


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


def build_records(text, aliases):
    if "�" in text:
        raise DataError("Source contains U+FFFD replacement characters; fix the character encoding in the CSV.")
    reader = csv.reader(io.StringIO(text))
    try:
        header = [clean(h) for h in next(reader)]
    except StopIteration:
        raise DataError("Source CSV is empty")
    unknown = [h for h in header if h not in COLUMNS]
    missing = [h for h in COLUMNS if h not in header]
    if unknown or missing:
        raise DataError(f"CSV headers do not match the data contract. Unknown: {unknown}. Missing: {missing}.")

    records, used_ids = [], set()
    for line_no, row in enumerate(reader, start=2):
        if not any(clean(c) for c in row):
            continue
        if len(row) != len(header):
            raise DataError(f"Row {line_no}: expected {len(header)} columns, found {len(row)}")
        where = f"Row {line_no}"
        cells = {COLUMNS[h]: clean(v) for h, v in zip(header, row)}
        if not cells["project"]:
            raise DataError(f"{where}: Project is required")
        if not cells["date"]:
            raise DataError(f"{where}: Date is required")
        status = next((s for s in STATUSES if s.casefold() == cells["status"].casefold()), None)
        if not status:
            raise DataError(f"{where}: Engagement Status {cells['status']!r} must be one of {STATUSES}")

        record = {"project": cells["project"], "owner": cells["owner"] or None}
        raw = {}
        for field in MULTI:
            source_values = split_list(cells[field])
            display = []
            for value in source_values:
                shown = aliases[field].get(value.casefold(), value)
                if shown.casefold() not in {d.casefold() for d in display}:
                    display.append(shown)
            record[field] = display
            if display != source_values:
                raw[field] = source_values
        record.update(
            audience=cells["audience"] or None,
            eventName=cells["eventName"] or None,
            type=cells["type"] or None,
            date=parse_date(cells["date"], where),
            startTime=parse_time(cells["startTime"], where, "Start Time"),
            endTime=parse_time(cells["endTime"], where, "End Time"),
            location=cells["location"] or None,
            status=status,
        )
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
        py = {"string": str, "object": dict, "array": list, "null": type(None)}
        if not any(isinstance(node, py[t]) for t in names):
            raise DataError(f"{path}: expected {names}, found {type(node).__name__}")
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
             "resolve each item in the source CSV or in `data/aliases.json`.", ""]
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
    text = SOURCE.read_text(encoding="utf-8-sig")
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
