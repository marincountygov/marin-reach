#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
RUN_BROWSER=0
case "${1:-}" in
  '') ;;
  --browser) RUN_BROWSER=1 ;;
  -h|--help)
    printf 'Usage: bash scripts/check.sh [--browser]\n'
    exit 0
    ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then
  printf 'Usage: bash scripts/check.sh [--browser]\n' >&2
  exit 2
fi
command -v python3 >/dev/null 2>&1 || {
  printf 'ERROR: Python 3 is required for template checks.\n' >&2
  exit 1
}

bash -n "$ROOT_DIR/scripts/check.sh"
python3 "$ROOT_DIR/scripts/sync-security-meta.py" --check
python3 "$ROOT_DIR/tests/validate_template.py"
python3 "$ROOT_DIR/tests/test_security_meta.py"
python3 "$ROOT_DIR/vendor/marinos/audit-buttons.py" "$ROOT_DIR" --fail
# Lists copy, download, file reading and upload code the app does itself; it must list nothing.
python3 "$ROOT_DIR/vendor/marinos/audit-shared-helpers.py" "$ROOT_DIR" --fail
# The filter column must come from filters.json and the shell, with no hand-written markup.
python3 "$ROOT_DIR/vendor/marinos/audit-filter-column.py" "$ROOT_DIR" --fail
# An h1 has one of two sizes (Marin UI 1.41.0); this lists app CSS that sets its own size and must list nothing.
python3 "$ROOT_DIR/vendor/marinos/audit-h1.py" "$ROOT_DIR" --fail
# Every file marin-data gives this app is a copy. Skipped when marin-data is not next to this repo.
if [[ -f "$ROOT_DIR/../marin-data/scripts/sync_copies.py" ]]; then
  python3 "$ROOT_DIR/../marin-data/scripts/sync_copies.py" "$ROOT_DIR" --check
else
  printf 'SKIP: marin-data is not next to this repo; its copies were not checked.\n' >&2
fi
python3 "$ROOT_DIR/scripts/build_data.py" --check
python3 "$ROOT_DIR/tests/test_build_data.py"

if command -v node >/dev/null 2>&1; then
  node --check "$ROOT_DIR/vendor/marinos/marinos.js"
  node --check "$ROOT_DIR/assets/app.js"
  node --check "$ROOT_DIR/assets/selectors.js"
  node --test "$ROOT_DIR/tests/selectors.test.js"
  printf 'JavaScript syntax: PASS\n'
else
  printf 'SKIP: Node is unavailable; JavaScript syntax was not checked.\n' >&2
fi

if [[ "$RUN_BROWSER" == 1 ]]; then
  python3 "$ROOT_DIR/tests/browser_reach.py"
  python3 "$ROOT_DIR/tests/browser_security.py"
else
  printf 'SKIP: Browser tests not requested; run with --browser to include them.\n'
fi
printf 'Requested checks completed successfully.\n'
