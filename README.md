# APP_NAME

## About this app

- **Purpose:** APP_DESCRIPTION
- **Audience:**
- **Owner:** APP_OWNER
- **Repo:** APP_REPO
- **Status:** Not yet built

## Getting started

1. **Run locally.** From the repository root, run `python3 -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/`. Use HTTP rather than opening `index.html` with `file://`; the shell fetches security information and optional external data. No application build step or Node runtime is required.
2. **Customize metadata.** Replace `APP_NAME`, `APP_DESCRIPTION`, `APP_OWNER`, and `APP_REPO` in app-owned files: `index.html`, this README, `marin.yml`, and the owner fields in `security.json`. `APP_REPO` is the GitHub repository slug, or `owner/repo` for the information component's Updates feed. Do not search-and-replace inside `vendor/marinos/`.
3. **Build the primary task.** Replace the starter `#start` content in `index.html`; keep it as the first `data-tab-section`. Put application behavior in `assets/app.js` and application styles in `assets/app.css`.
4. **Write app-specific information.** Edit the `data-about` and `data-accessibility` templates inside `<marin-app-info>`. Complete the application's security review. Do not copy the generated About, Security, Accessibility, or Updates sections back into the HTML.
5. **Validate and review.** Run `bash scripts/check.sh`, then review the app in a browser, including keyboard operation, narrow layouts, and light/dark modes. See [docs/development.md](docs/development.md) for the optional browser tests and manual review checklist.
6. **Document deployment.** Confirm the hosting target in `marin.yml` and document this app's actual deployment procedure in `docs/development.md`.

## Marin App Shell

This starter vendors **Marin App Shell 1.1.1** under `vendor/marinos/`. It is the app's single shared runtime dependency. Its stylesheet includes the Pico baseline, shared design tokens, and shell styling; do not add a separate Pico or old shared-brand stylesheet.

The initial HTML declares five light-DOM web components:

```html
<marin-os-banner></marin-os-banner>
<marin-app-header app-name="APP_NAME" app-description="APP_DESCRIPTION"></marin-app-header>
<!-- main#main contains the app-owned #start workflow and marin-app-info. -->
<marin-app-info app-name="APP_NAME" repo="APP_REPO" security-src="security.json"></marin-app-info>
<marin-app-footer app-name="APP_NAME"></marin-app-footer>
<marin-app-feedback></marin-app-feedback>
```

Use the complete structure in `index.html`, not the abbreviated example above. The shell creates the header, banner, navigation, footer, standard information sections, skip link, and live-status region. Applications own their workflow, content templates, metadata, security configuration, and application-specific assets.

`vendor/marinos/` is release-owned. Never edit its files inside an app. To adopt a reviewed shell release, use the shell repository's installer, update `platform.shell` to match its manifest, and test. See [Updating the shell](docs/development.md#updating-the-shell).

## Standard navigation

The header contains **About** and **Updates**, with no default Start item. Clicking the header's app identity (icon, name, or description) follows `./` to reload the application's root and default workflow. This is normal navigation, not a state-preserving tab switch; unsaved in-memory work can be lost.

The footer has the plain-text app name, **About**, **Security**, **Accessibility**, and **Updates**, followed by the MarinOS catalog link. The footer app name is not a link.

The primary workflow uses `#start`. The shell generates the `#about`, `#security`, `#accessibility`, and `#updates` destinations inside `<marin-app-info>` and handles their hash routing. No separate HTML pages are needed. Keep the primary task immediately usable; put explanatory material in the About content template.

## Project manifest and versions

`marin.yml` is the app-owned machine-readable identity and deployment record. Its shared runtime dependency is:

```yaml
platform:
  shell: 1.1.1
```

That version must match `shellVersion` in `vendor/marinos/manifest.json`. The shell manifest records its Marin UI baseline; apps do not separately synchronize Marin UI or Pico. Keep `project.status` current as the app moves through prototype, active, maintenance, deprecated, or archived states.

`TEMPLATE_VERSION` records the starter version used to create an app. This scaffold is **2.0.0**, reflecting the move from copied shell markup to components. It is provenance, not an ongoing app dependency. Existing apps do not inherit later template changes; normal shared-interface upgrades come from versioned shell releases.

## Security

The app keeps its own `security.json`, `SECURITY.md`, and `.well-known/security.txt`. The shell renders the public security summary; enforcement comes from the static Content Security Policy and referrer-policy meta tags near the beginning of `index.html`, before any resources load. Those tags are generated from `security.json`, not inserted by JavaScript.

After reviewing any change to the configured policy, run:

```bash
python3 scripts/sync-security-meta.py --write
bash scripts/check.sh
```

The checked-in tags work without a build step. The read-only checks reject missing, duplicate, misplaced, or stale policies. The default allows the shell's catalog/Updates requests and `data:` images for the existing favicon/Pico icons; scripts, styles, and fonts remain same-origin. Header-only hosting gaps remain documented rather than being represented by ineffective meta tags. Starter review dates, ownership, and advertised controls still need an actual app/deployment review. See [SECURITY.md](SECURITY.md) and the [security setup notes](docs/development.md#security-setup).

## Related resources

- [marin-app-shell](https://github.com/marincountygov/marin-app-shell): component API, integration contract, release notes, and installer.
- [marin-ui](https://github.com/marincountygov/marin-ui): the design-system implementation used by the shell.
- [marin-digital-standards](https://github.com/marincountygov/marin-digital-standards): accessibility, content, brand, security, and product-design requirements.
- [marin-skills](https://github.com/marincountygov/marin-skills): workflows for building and maintaining Marin applications. Older scaffolding instructions may still describe the pre-shell structure; use this template and the installed shell API as the reference.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): dependency and license locations.
- [AGENTS.md](AGENTS.md): instructions for the template repository. Replace it with app-specific guidance when creating a real app.
