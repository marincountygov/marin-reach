# Security

Every repository owns its security information. MarinOS defines the standard, defaults, tooling, and validation used across repositories. Common security configuration is standardized and generated wherever practical.

## Report a security issue

See [security.txt](.well-known/security.txt) for contact details. Please include what you found, how to reproduce it, and its potential impact.

## This application's security

See [`security.json`](security.json) for the machine-readable configuration, or the app's own `#security` section for a plain-language summary.

## Policy delivery

The app delivers its configured CSP and `strict-origin-when-cross-origin` referrer policy through static meta tags early in `index.html`. `security.json` is the configuration source; the shell's rendered Security summary is informational, not the enforcement mechanism.

After changing a policy, run `python3 scripts/sync-security-meta.py --write` and commit the generated HTML with the configuration. `bash scripts/check.sh` rejects an out-of-sync or misplaced block. The default CSP allows the catalog/Updates feed connections and embedded image icons without allowing external scripts or inline script/style blocks.

This does not enable header-only controls or resolve the existing hosting exceptions. See [security setup](docs/development.md#security-setup) for exact allowances, limitations, tests, and review responsibilities.

## For developers

- [`marin-digital-standards/security/standard.md`](https://github.com/marincountygov/marin-digital-standards/blob/main/security/standard.md) — the standard, including what GitHub Pages hosting can and can't enforce.
- [`marin-digital-standards/security/profiles.md`](https://github.com/marincountygov/marin-digital-standards/blob/main/security/profiles.md) — what each security profile requires.
- [`marin-os/schemas/security.schema.json`](https://github.com/marincountygov/marin-os/blob/main/schemas/security.schema.json) — the schema `security.json` conforms to.
