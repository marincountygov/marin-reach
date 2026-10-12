# Development

## Run locally

See the [README](../README.md#run-locally). The app fetches `data/engagements.json`, so serve it over HTTP.

## Data and tests

```bash
python3 scripts/build_data.py            # regenerate data/engagements.json
bash scripts/check.sh                    # security meta, template structure, data, Python and Node tests
bash scripts/check.sh --browser          # also the Reach workflow and CSP browser tests
```

`tests/test_build_data.py` covers parsing, normalization, validation and the committed outputs. `tests/selectors.test.js` (Node's built-in runner) covers filtering, URL state, calendar grouping and date behavior, stats, the "Showing:" line, CSV and copy digests. `tests/browser_reach.py` exercises filters, view switching, calendar, dialog, stats, empty/error states, keyboard reachability, small screens and light/dark modes over HTTP under a project-site subpath. Browser tests need Playwright for Python and Chromium. The shell's `lighthouse.json` request from localhost is blocked by the app's CSP and is ignored by the test; it is shell behavior, not an app request.

`tests/browser_smoke.py` is the starter's test. Its `main()` is no longer run: it asserts starter content and had already drifted from shell 1.10.0 (it fails in `marin-app-template` too). `tests/browser_security.py` still imports its server helpers, so keep the file until those move.

Automated tests are not an accessibility audit. Manually review keyboard use, screen readers, 200% zoom, contrast, and run the County's accessibility tools, including WAVE, over HTTP.

## Page structure

Keep the shell component hosts in the initial HTML in the documented order, and the `#start` workflow first in `main#main`. Script order: shell, `assets/selectors.js`, `assets/app.js`, all deferred. Do not duplicate shell IDs.

### Application-owned content

Replace the starter workflow and edit the inert content templates:

```html
<marin-app-info app-name="APP_NAME" repo="APP_REPO" security-src="security.json">
  <template data-about>
    <p>Explain the app's purpose, intended users, and limitations.</p>
  </template>
  <template data-accessibility>
    <p>Document tested support, known issues, and reporting instructions.</p>
  </template>
</marin-app-info>
```

Do not include another About/Accessibility H2 or the standard Related information list in those templates; the shell supplies them. Optional `data-security-intro` and `data-updates-intro` templates add app-specific context without taking ownership of those sections. The header's `data-icon` template supplies the app icon.

The shell owns the header, menus, identity home link, footer, standard section containers, skip link, and `#app-status-message`. Do not duplicate those IDs or hand-author replacement shell markup. Header navigation remains About and Updates; the footer also includes Security and Accessibility. Clicking the header identity follows `./`, reloading the default view rather than preserving in-memory workflow state.

Put app-specific JavaScript in `assets/app.js`. With both scripts deferred in the documented order, the shell's initial setup has completed before the application's `DOMContentLoaded` handler runs. Scope new styles to the app's workflow or a unique class prefix. Use the shell's existing tokens and components; do not override `.app-header`, `.app-footer`, `.marinos-banner`, or their internal layout in app CSS.

## Updating the shell

In a trusted local checkout of the reviewed `marin-app-shell` release, run:

```bash
bash scripts/install.sh /path/to/this-project
```

For the usual sibling-repository layout:

```bash
cd ../marin-app-shell
bash scripts/install.sh ../marin-app-template
cd ../marin-app-template
```

The installer copies the committed `dist/` release and replaces only `vendor/marinos/`. It does not update `marin.yml` or application HTML. Read the installed version:

```bash
python3 -c 'import json; print(json.load(open("vendor/marinos/manifest.json"))["shellVersion"])'
```

Set `platform.shell` in `marin.yml` to that exact version and update the current-version note in the README. Review release notes, run checks, and inspect the app before committing. Do not combine a shell release with independently updated Pico or Marin UI files. Shared defects belong upstream in the shell or design-system repository; consume the resulting shell release unchanged.

The installed manifest contains SHA-256 hashes and byte counts for the release files. The template checks validate those against the vendored bytes. They detect accidental changes, not publisher authenticity; use a trusted release source.

### Fonts and licenses

The shell's font paths resolve to the app's existing files:

```text
vendor/fonts/Jost-wght.ttf
vendor/fonts/open-sans/OpenSans-VariableFont_wdth,wght.woff2
```

Keep these assets and their existing license information. They are not copied into `vendor/marinos/` and are not overwritten by the shell installer. Shell and dependency notices are included under `vendor/marinos/licenses/`; see `THIRD_PARTY_NOTICES.md`.

## Test changes

Run the local, dependency-light checks:

```bash
bash scripts/check.sh
```

Python 3 is required. These checks validate the generated security-meta block and run its offline regression tests, then check the manifest hashes and version pin, component structure, asset order, local assets, metadata syntax within the simple platform block, and removal of the legacy runtime. JavaScript syntax is checked when Node is available; the command explicitly reports when that check is skipped. These checks do not build or modify the vendored release.

For browser integration checks, install Playwright for the Python interpreter being used, with Chromium available, then run:

```bash
bash scripts/check.sh --browser
```

This option fails rather than silently skipping when its browser dependencies are missing. The browser test uses the real page and assets over localhost under a project-site subpath. External catalog and GitHub responses are fixtures, so the test makes no live external requests and does not verify external service availability. Security JSON is served from this app. Test coverage includes sections, default and direct hash routes, browser history, identity-to-home navigation, keyboard focus, mobile menus, narrow layouts, color modes, and the JavaScript-disabled message. A separate browser security test uses the shipped policy to allow the configured feeds/data images while denying unapproved connections, external scripts, inline scripts/event handlers, and inline style elements. It also checks that cross-origin Referer requests do not expose the app path/query. Expected CSP violations in these intentional negative probes are not normal app failures.

To save optional review screenshots outside the repo:

```bash
python3 tests/browser_smoke.py --screenshots /tmp/marin-template-review
```

For browser environments that block URL navigation, a reduced, in-memory component test is also available:

```bash
python3 tests/browser_smoke.py --in-memory
```

This mode renders the same source HTML, CSS, JavaScript, and local fonts in memory with fixture fetch responses. It tests component rendering, route handling, menus, keyboard behavior, and layout. It does **not** test HTTP resource loading, deferred-script loading timing, or actually following the home link; its output reports those omissions. Use the full HTTP test or manual local-browser review before merging.

Add regression tests for the real workflow as you build an app. This starter has no business logic to exercise. Automated smoke tests are not an accessibility-conformance audit: manually review keyboard use, screen-reader behavior, 200% zoom/reflow, contrast, and the app's primary task. Run the County's accessibility review tools, including WAVE, over HTTP.

## Security setup

`security.json` is the source of truth for the app's configured policy. The marked block immediately after the charset declaration in `index.html` contains two static tags:

- `<meta http-equiv="Content-Security-Policy" ...>` enforces the configured CSP.
- `<meta name="referrer" content="strict-origin-when-cross-origin">` sets the document's referrer policy.

Keep both before the favicon, stylesheet links, scripts, preloads, or other resource-loading elements. Do not generate security meta tags at runtime or attempt to enforce a policy merely by fetching JSON.

After a reviewed configuration change, regenerate the block and check the result:

```bash
python3 scripts/sync-security-meta.py --write
python3 scripts/sync-security-meta.py --check
bash scripts/check.sh
```

The emitter uses Python's standard library, makes no network requests, and edits only the marked block. It defaults to read-only checking. The generated HTML is committed, so deployment and normal local use need no build step. `bash scripts/check.sh` checks synchronization; it does not silently fix it. This emitter checks a supported directive/token format and placement, not the full MarinOS schema or every browser's CSP grammar.

### Starter-specific allowances

The supplied internal profile has been adjusted explicitly for the enabled shell features:

```text
connect-src 'self' https://marincountygov.github.io/marin-os/catalog.json https://api.github.com
img-src 'self' data:
```

The catalog URL is path-scoped rather than allowing every resource on that external origin. The GitHub API origin supports the configurable repository used by Updates. Same-origin requests cover the app's `security.json`. `data:` is allowed for images only, supporting the current SVG favicon and Pico's embedded control icons. The external feeds are also recorded in `data.externalDataSources`. These are request destinations, not permission for external JavaScript.

`default-src`, `script-src`, `style-src`, and `font-src` remain `'self'`. The starter adds neither `'unsafe-inline'`, `'unsafe-eval'`, nor wildcard origins. Objects remain blocked, while base URLs and form targets remain same-origin. Narrow the allowed destinations when removing shell features; review and declare additional destinations when adding app features. Do not fix a blocked resource by broadly allowing all origins or inline scripts.

### Limits and review

Meta-delivered CSP cannot enforce `frame-ancestors`, `sandbox`, or `report-uri`, and there is no meta-delivered report-only CSP. The emitter rejects those directives instead of silently claiming enforcement; unsupported directives such as `report-to` also require a separate design review before extending this small emitter. Do not add fake `http-equiv` tags for X-Frame-Options, X-Content-Type-Options, Permissions-Policy, or HSTS. The existing header-only exceptions in `security.json` remain in place. This task does not configure server headers, HTTPS redirects, authentication, or GitHub scanning features.

Reporting contacts, exception owners, review dates, and security.txt expiry are preserved. Replace `APP_OWNER` and update review dates only following an actual review. The starter's internal profile and other advertised controls must still be checked against the real application and hosting setup.

For environments that cannot navigate a browser to localhost, these limited fixtures can run separately:

```bash
python3 tests/browser_smoke.py --in-memory
python3 tests/browser_security.py --in-memory
```

The first deliberately removes CSP from its in-memory document to inject component-test scripts/styles; it is not a security test. The second keeps the exact shipped meta tags and tests real browser CSP decisions against intercepted fixture responses. Its opaque-origin document cannot verify same-origin assets or Referer header delivery. Neither fixture substitutes for `bash scripts/check.sh --browser` and a real browser review of the deployed app. No test requires live GitHub/catalog access.

Reference behavior: [CSP meta delivery](https://www.w3.org/TR/CSP3/#meta-element) and [referrer-policy meta delivery](https://www.w3.org/TR/referrer-policy/#referrer-policy-delivery-meta).

Keep `.nojekyll` so the existing branch-based Pages setup can publish `.well-known/security.txt`. Preserve reporting contacts unless an authorized owner changes them.

## Template maintenance and downstream tooling

`TEMPLATE_VERSION` is the starter's release/provenance marker; `platform.shell` is the ongoing runtime dependency. Version 2.0.0 changes the starter's structure from copied shell markup to component hosts. Do not use future template versions as an app-upgrade mechanism.

For agents working on this template, see `AGENTS.md`. Creating an app should also replace those instructions with app-specific guidance. The `marin-skills/marin-app-builder` workflow and any old template migration scripts need a separate review for this structure; this patch does not modify sibling repositories.

## Deployment

GitHub Pages serves the repository root from `main`. The site needs no build, because `data/engagements.json` is committed. Confirm the Pages source in repository settings before relying on it. See the [README](../README.md#deployment).
