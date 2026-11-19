#!/usr/bin/env python3
"""Copy the list of facilities from marin-data into data/.

The facilities and venues Reach events use are kept in marin-data (organizations/facilities.json, generated from
facilities.jsonld). data/facilities.json is a copy. Never edit it here. Change a venue in marin-data.

  python3 scripts/sync-facilities.py           copy ../marin-data/organizations/facilities.json
  python3 scripts/sync-facilities.py --check   fail if the copy differs. Skipped when marin-data is not next to this repo.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "marin-data" / "organizations" / "facilities.json"
COPY = ROOT / "data" / "facilities.json"

if not SOURCE.is_file():
    if "--check" in sys.argv:
        print("skipped: marin-data is not next to this repo")
        sys.exit(0)
    sys.exit(f"not found: {SOURCE}")
if "--check" in sys.argv:
    if not COPY.exists() or COPY.read_bytes() != SOURCE.read_bytes():
        sys.exit("data/facilities.json differs from marin-data. Run: python3 scripts/sync-facilities.py")
    print("ok: data/facilities.json matches marin-data")
else:
    shutil.copyfile(SOURCE, COPY)
    print("copied data/facilities.json from marin-data")
