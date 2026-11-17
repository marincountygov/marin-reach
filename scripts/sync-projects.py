#!/usr/bin/env python3
"""Copy the shared list of projects from marin-data into data/projects.json.

The projects shown in the Project filter are kept in marin-data (projects/projects.json). data/projects.json is a
copy. Never edit it here. After a sync, run python3 scripts/build_data.py.

  python3 scripts/sync-projects.py           copy ../marin-data/projects/projects.json
  python3 scripts/sync-projects.py --check   fail if the copy differs. Skipped when marin-data is not next to this repo.
"""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "marin-data" / "projects" / "projects.json"
COPY = ROOT / "data" / "projects.json"

if not SOURCE.is_file():
    if "--check" in sys.argv:
        print("skipped: marin-data is not next to this repo")
        sys.exit(0)
    sys.exit(f"not found: {SOURCE}")
if "--check" in sys.argv:
    if not COPY.exists() or COPY.read_bytes() != SOURCE.read_bytes():
        sys.exit("data/projects.json differs from marin-data. Run: python3 scripts/sync-projects.py && python3 scripts/build_data.py")
    print("ok: data/projects.json matches marin-data")
else:
    shutil.copyfile(SOURCE, COPY)
    print("copied data/projects.json from marin-data")
