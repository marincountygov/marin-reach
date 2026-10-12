# Working on marin-app-template

## Architecture

This is the starting scaffold for new MarinOS apps, not a production app. App-owned files retain `APP_NAME`, `APP_DESCRIPTION`, `APP_OWNER`, and `APP_REPO` placeholders. Do not replace them while maintaining the template.

The template vendors a reviewed Marin App Shell release under `vendor/marinos/`. `platform.shell` in `marin.yml` must match `vendor/marinos/manifest.json`. The shell owns the five web components, shared styling, navigation, standard information-section containers, skip link, and live-status infrastructure. Its distribution already includes the shared Pico/Marin UI baseline.

## Boundaries

- Keep shell component hosts in the initial HTML and load the deferred shell before the app script. Use app-owned templates for the icon, About, and Accessibility content.
- Keep the primary workflow first inside `main#main` as `#start[data-tab-section]`. Do not add duplicate shell section IDs, navigation markup, or a second shell runtime.
- Do not edit `vendor/marinos/`. Use the shell's installer to adopt an approved release, update `platform.shell`, and re-test. Fix shared defects upstream rather than overriding shell internals in app CSS.
- Preserve the app's fonts, security configuration, reporting contacts, and `.nojekyll` unless a separately scoped task changes them. Do not claim a security or accessibility review just because the shell renders those sections.
- Keep the CSP/referrer meta block static and before resource-loading elements. After a reviewed change to `security.json`, run `python3 scripts/sync-security-meta.py --write`; never inject policies at runtime or claim header-only protection via meta tags.
- Keep the starter minimal. Add workflow-specific markup and behavior only when creating an actual app, not while maintaining this template.

## Before finishing

Bump `TEMPLATE_VERSION` and add a changelog entry for changes that affect newly created apps. This is separate from the shell dependency version. Run `bash scripts/check.sh` and, when available, `bash scripts/check.sh --browser`; report any checks not performed. Review keyboard navigation, reflow, and light/dark appearance.

When scaffolding instructions change, flag the corresponding `marin-skills/marin-app-builder` workflow for review. Do not modify sibling repositories without authorization. Existing apps do not automatically inherit template changes.

## Creating an app

Replace this template-specific document with app-specific architecture, behavior, ownership, and test instructions. Follow `README.md` and `docs/development.md` for placeholder replacement and security setup.

## References

- `marin-app-shell`: component implementation, integration contract, release notes, and installer.
- `marin-ui`: design system consumed through the shell release, not independently synced into this app.
- `marin-digital-standards`: accessibility, content, brand, security, and product-design requirements.
- `marin-skills/marin-app-builder`: scaffolding workflow that must reflect this component-based starter.
