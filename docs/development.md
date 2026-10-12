# Development

## Run locally

From the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/`. Stop the server with Ctrl+C. There is no app build step, package-manager requirement, or production Node runtime. Do not use `file://` for integration testing: the shell fetches the local `security.json` and optionally the MarinOS catalog and GitHub Updates data.

## Customize the starter

Replace identity placeholders in app-owned files, including the security owner fields. Do not rewrite the vendored shell. The template deliberately leaves `repo="APP_REPO"`; replace it before expecting real Updates data. A bare repository slug uses the `marincountygov` organization; the component also accepts `owner/repo`.

Keep this order in the document head:

```html
<link rel="stylesheet" href="vendor/marinos/marinos.css">
<link rel="stylesheet" href="assets/app.css">
<script src="vendor/marinos/marinos.js" defer></script>
<script src="assets/app.js" defer></script>
```

Place any application libraries before the script that consumes them, preserving deferred execution order. Do not load the old `shared/app-shell.js`, `shared/app-brand.css`, or a separate `vendor/pico.min.css` alongside the shell.

The body contains the banner, header, `main#main`, footer, and Feedback components. Inside `main#main`, keep the app-owned `#start` section first and `<marin-app-info>` after it. Keep all component hosts in the initial HTML: shell version 1 initializes its shared behaviors once, not after later dynamic component insertion.

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

`marin.yml` currently names GitHub Pages. Confirm the app's actual Pages source and hosting configuration, then document its deployment procedure here. No workflow files or hosting settings are introduced or changed by this refactor.
