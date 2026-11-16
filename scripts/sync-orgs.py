#!/usr/bin/env python3
"""Copy the organization alias list from marin-data into data/.

Other names for County organizations are kept in marin-data (organizations/aliases.json, generated from
organizations.jsonld). data/organizations-aliases.json is a copy. Never edit it here. Add a name in marin-data.

  python3 scripts/sync-orgs.py           copy ../marin-data/organizations/aliases.json
  python3 scripts/sync-orgs.py --check   fail if the copy differs. Skipped when marin-data is not next to this repo.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "marin-data" / "organizations" / "aliases.json"
COPY = ROOT / "data" / "organizations-aliases.json"

if not SOURCE.is_file():
    if "--check" in sys.argv:
        print("skipped: marin-data is not next to this repo")
        sys.exit(0)
    sys.exit(f"not found: {SOURCE}")
if "--check" in sys.argv:
    if not COPY.exists() or COPY.read_bytes() != SOURCE.read_bytes():
        sys.exit("data/organizations-aliases.json differs from marin-data. Run: python3 scripts/sync-orgs.py")
    print("ok: data/organizations-aliases.json matches marin-data")
else:
    shutil.copyfile(SOURCE, COPY)
    print("copied data/organizations-aliases.json from marin-data")
