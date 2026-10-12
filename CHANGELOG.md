# Changelog

Tracks changes to `marin-app-template` itself — repository structure, starter shell, scaffolding, and documentation. This is separate from `platform.shell` in `marin.yml`, which pins the vendored Marin App Shell runtime.

Existing applications do not automatically inherit these changes. Template changes only affect projects created after the change; see `TEMPLATE_VERSION` and the README's "Project manifest and versions" section.

## 2.0.2

- Update `marin.yml`'s starter `project.status` from `prototype` to `alpha`, matching MarinOS's new app status enum (`alpha`/`beta`/`live`) — see `marin-os`'s `#status` page. `prototype` is no longer a recognized value.

## 2.0.1

- Update the vendored Marin App Shell from 1.0.1 to 1.1.1 and pin `platform.shell: 1.1.1`.
- Synchronize the shell-managed local font and Lucide icon assets using the App Shell installer while preserving template-owned assets and application scaffolding.
- Adopt the App Shell 1.1.1 installer behavior that updates an existing `marin.yml` `platform.shell` value as part of the validated, rollback-protected installation.
- Update starter and developer documentation to reflect the current shell installation and upgrade workflow.
- Keep the existing Marin App Shell component structure, starter placeholders, CSP/referrer-policy metadata, security tooling, and application-specific CSS/JavaScript unchanged.
- This is a maintenance update to the template. Existing applications continue to upgrade their pinned Marin App Shell independently.

## 2.0.0

- Replace copied banner, header, navigation, information sections, footer, and Feedback markup with the five Marin App Shell web components. Preserve the `APP_*` starter placeholders and app-owned About/Accessibility content.
- Vendor the unmodified Marin App Shell 1.0.1 distribution and pin `platform.shell: 1.0.1`. The shell includes the Pico/shared UI baseline and the header identity link to `./`.
- Remove the legacy `shared/` runtime, standalone Pico stylesheet, `BRAND_VERSION`, and unused starter icon files. Keep existing font assets and security reporting/review metadata unchanged.
- Load the shell before the app with deferred scripts. Keep `#start` as the default workflow, add a JavaScript-disabled message, and let the shell create standard navigation and status infrastructure.
- Rewrite starter/developer/agent guidance for component-owned markup and versioned shell upgrades. Add license notices and structural, integrity, and optional browser checks.
- Emit static CSP and referrer-policy meta tags from `security.json` before resource loading. Add explicit shell feed and data-image allowances, keep script/style/font sources local, and retain the documented header-only gaps.
- Add an idempotent security-meta emitter, read-only consistency checks, offline regression tests, and browser CSP enforcement probes.
- This is a breaking starter-layout change, not a required version migration for already deployed apps. Existing apps upgrade their pinned shell independently.

## 1.2.1

- Expand the standard footer into local-app navigation: plain-text app name plus **About**, **Security**, **Accessibility**, and **Updates**, with **MarinOS** on its own line.
- Keep the informational destinations as hash-routed sections within `index.html`; add the standard `#accessibility` section alongside the existing About, Updates, and Security sections.
- Keep **About** and **Updates** in the application header navigation and remove the default **Start** header item.
- Add responsive footer styles in `shared/app-brand.css`.

## 1.2.0

- Add security setup so new apps start compliant with the MarinOS security standard: a starter `security.json` (the `internal` profile, with `APP_OWNER` placeholders), `SECURITY.md`, a generated `.well-known/security.txt`, a `#security` section wired to the shared renderer in `marin-ui` 1.18.0, an About → Security link, and a README "Security" section. Nothing here needs `APP_NAME`-style identity fields — `marin.yml` already owns identity.
- Add an empty `.nojekyll` file. Apps deployed from a branch (GitHub Pages' default "legacy" build) otherwise skip dot-folders, so `.well-known/security.txt` returned 404. Do not delete it.

## 1.1.0

- Add `marin.yml`, a machine-readable project manifest (owner, status, `marin-ui`/template versions) using the same `APP_NAME`/`APP_DESCRIPTION`/`APP_OWNER`/`APP_REPO` placeholder convention as `index.html` and `README.md`.
- Add `AGENTS.md`, documenting the template repo itself for anyone or any agent working on the template directly. New apps get their own app-shaped `AGENTS.md` as part of the build workflow, not a copy of this one — see `marin-skills/marin-app-builder/SKILL.md`.

## 1.0.0

- Initial template: starter `index.html` shell, `assets/app.css` and `assets/app.js`, vendored `marin-ui` bundle, `docs/development.md`, PR template.
