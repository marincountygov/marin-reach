#!/usr/bin/env python3
"""Copy the place alias list from marin-data into data/.

Other names for places in Marin County are kept in marin-data (organizations/place-aliases.json, generated from
jurisdictions.jsonld). data/places-aliases.json is a copy. Never edit it here. Add a name in marin-data.

  python3 scripts/sync-places.py           copy ../marin-data/organizations/place-aliases.json
  python3 scripts/sync-places.py --check   fail if the copy differs. Skipped when marin-data is not next to this repo.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "marin-data" / "organizations" / "place-aliases.json"
COPY = ROOT / "data" / "places-aliases.json"

if not SOURCE.is_file():
    if "--check" in sys.argv:
        print("skipped: marin-data is not next to this repo")
        sys.exit(0)
    sys.exit(f"not found: {SOURCE}")
if "--check" in sys.argv:
    if not COPY.exists() or COPY.read_bytes() != SOURCE.read_bytes():
        sys.exit("data/places-aliases.json differs from marin-data. Run: python3 scripts/sync-places.py")
    print("ok: data/places-aliases.json matches marin-data")
else:
    shutil.copyfile(SOURCE, COPY)
    print("copied data/places-aliases.json from marin-data")
