#!/usr/bin/env python3
"""Browser test of the Marin Reach workflow over HTTP under a project-site subpath.

Needs Playwright for Python with Chromium. External shell requests (catalog,
GitHub) are answered with fixtures, so no live network access is used.
"""
from __future__ import annotations

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import re
import sys
from datetime import datetime
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "/marin-reach/"
TODAY = "2026-10-12"


def require(condition, message):
    if not condition:
        raise AssertionError(message)


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?", 1)[0]
        if path.startswith(PREFIX):
            path = "/" + path[len(PREFIX):]
        return super().translate_path(path)

    def log_message(self, *args):
        pass


def summary(page):
    return page.inner_text("#active-filters")


def open_facet(page, key):
    details = page.locator(f"#facet-groups details[data-facet={key}]")
    if details.get_attribute("open") is None:
        details.locator("summary").click()


def count(page):
    match = re.search(r"\((\d+) engagements?", summary(page))
    require(match is not None, f"Summary line lacks a count: {summary(page)!r}")
    return int(match.group(1))


def no_overflow(page, label):
    require(not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"),
            f"Horizontal scroll at {label}")


def run(base, page, problems):
    expected = json.loads((ROOT / "data/engagements.json").read_text(encoding="utf-8"))["records"]
    total = len(expected)
    page.goto(base)
    page.wait_for_selector("#reach-app:not([hidden])")
    require(summary(page).startswith("Showing: All dates \u00b7 All projects \u00b7 All agencies ("),
            f"Summary line format: {summary(page)!r}")
    require(count(page) == total, "Default state is not the full dataset")
    require(page.locator("h1").count() == 1, "Expected one h1")
    require(page.locator("#start > p").count() == 0, "No intro text belongs on the main page")
    require(page.locator(".search-input-field .app-help-text").count() == 0, "No help text under search")
    require(page.locator("#reset-filters-button").is_visible(), "Reset button missing")
    require(page.locator("#record-list > li").count() == total, "List does not show every record")
    dates = page.locator("#record-list > li time, #record-list > li dd:nth-of-type(1)").all_inner_texts()
    shown = [d for d in dates if re.match(r"^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+, \d{4}$", d)]
    ordered = [datetime.strptime(d, "%a, %b %d, %Y") for d in shown]
    require(len(ordered) == total and ordered == sorted(ordered, reverse=True), f"List is not newest first: {shown}")
    require(page.locator("h1").count() == 1, "Expected one h1")
    require(page.locator("#facet-groups details > summary").evaluate_all("els => els.map(e => e.firstChild.textContent.trim())")
            == ["Audience", "Type", "Project", "Agency/Department", "Partner", "Status", "Location", "Owner"],
            "Facet groups differ from the requested names or order")
    require(page.locator("#facet-groups details[open]").count() == 0, "Filter dropdowns should start collapsed")
    require(not page.locator("input[name=project][value='El Nino']").is_visible(), "Options should be hidden until opened")
    page.click("#facet-groups details[data-facet=project] > summary")
    require(page.locator("input[name=project][value='El Nino']").is_visible(), "Dropdown did not open")
    require(page.locator("#date-range legend").inner_text() == "Date", "Date range missing")
    require(page.locator("#filters fieldset legend").first.inner_text() == "Date", "Date should be the first filter")

    # Multi-select: OR within a facet, AND across facets, URL state.
    page.check("input[name=project][value='Envision Marin']")
    page.check("input[name=project][value='El Nino']")
    require(count(page) == 7, "OR within a facet failed")
    open_facet(page, "status")
    page.check("input[name=status][value=Planned]")
    require(page.url.endswith("?project=Envision+Marin&project=El+Nino&status=Planned"), f"URL state: {page.url}")
    require(page.locator("[data-facet-count=project]").inner_text() == "(2 selected)", "Selected count missing")
    require(page.locator("#facet-groups details[data-facet=project]").get_attribute("open") is not None, "Dropdown closed itself")
    require("Envision Marin, El Nino" in summary(page) and "Status: Planned" in summary(page), summary(page))

    # Date range, then switch views without losing state.
    page.fill("#filter-from", "2026-11-13")
    page.dispatch_event("#filter-from", "change")
    require(count(page) == 4, "Date range failed")
    for view in ("calendar", "stats", "list"):
        page.click(f"#view-tabs [data-view={view}]")
        require("from=2026-11-13" in page.url and "status=Planned" in page.url, f"State lost in {view}")
        require(count(page) == 4, f"Count changed in {view}")

    # Calendar uses the same records and dates.
    page.click("#view-tabs [data-view=calendar]")
    require(page.inner_text("#cal-title") == "November 2026", "Calendar did not open on the first matching month")
    require(page.locator("#cal-body .reach-cal-event").count() == 4, "Calendar events differ from filtered set")
    require(page.locator("#cal-body td:has-text('14') .reach-cal-event").count() == 2, "Event on wrong date")
    page.click("#cal-body .reach-cal-event >> nth=0")
    require(page.evaluate("document.getElementById('record-dialog').open"), "Detail dialog did not open")
    require("Envision Marin" in page.inner_text("#record-dialog-body"), "Detail missing project")
    card = page.locator("#record-dialog .app-card").bounding_box()
    close = page.locator("#record-dialog-close").bounding_box()
    require(close["y"] >= card["y"] + card["height"] - 1, "Close button should sit below the card")
    copy = page.locator("#record-dialog-copy").bounding_box()
    require(copy["x"] < close["x"] and abs(copy["y"] - close["y"]) < 4, "Copy should sit left of Close")
    page.click("#record-dialog-copy")
    require(page.inner_text("#record-dialog-status") == "Copied engagement to clipboard.", "Dialog copy message missing")
    page.keyboard.press("Escape")
    require(page.evaluate("document.activeElement.classList.contains('reach-cal-event')"), "Focus not restored")
    require("Select an event" not in page.inner_text("#panel-calendar"), "Calendar help text should be gone")
    page.click("#cal-prev")
    require(page.inner_text("#cal-title") == "October 2026", "Previous month failed")
    page.click("#cal-next")
    page.click("#cal-today")
    require(page.inner_text("#cal-title") == "October 2026", "Today did not return to the current month")

    # Stats follow the filters.
    page.click("#view-tabs [data-view=stats]")
    cards = re.sub(r"\s+", " ", page.inner_text("#stats-kpis"))
    require("Planned 4" in cards and "Completed 0" in cards and "Canceled 0" in cards, f"Stats cards: {cards}")
    require(page.locator("#stats-agencies-table tbody tr").count() == 1, "Agency chart not filtered")

    # Clear all, then unfiltered totals.
    page.click("#reset-filters-button")
    require(page.url.endswith("?view=stats"), f"Reset kept filters: {page.url}")
    cards = re.sub(r"\s+", " ", page.inner_text("#stats-kpis"))
    planned = sum(r["status"] == "Planned" for r in expected)
    completed = sum(r["status"] == "Completed" for r in expected)
    partners = len({p for r in expected for p in r["partners"]})
    require(f"Planned {planned}" in cards and f"Completed {completed}" in cards
            and f"Partners {partners}" in cards, f"Unfiltered stats wrong: {cards}")

    # No results guidance and search combination.
    page.click("#view-tabs [data-view=list]")
    page.fill("#filter-search", "zzzz")
    page.locator("#no-results").wait_for(state="visible")
    page.fill("#filter-search", "civic")
    page.locator("#no-results").wait_for(state="hidden")
    require(count(page) == 1, "Location search failed")

    # Tabs: roles and arrow keys, as in marin-mentions.
    page.click("#view-tabs [data-view=list]")
    require(page.get_attribute("#tab-list", "aria-selected") == "true", "List tab not selected")
    page.focus("#tab-list")
    page.keyboard.press("ArrowRight")
    require(page.get_attribute("#tab-calendar", "aria-selected") == "true", "ArrowRight did not move to Calendar")
    page.click("#view-tabs [data-view=list]")

    # Toolbar per tab, checkboxes, select all, CSV and RSS.
    page.fill("#filter-search", "")
    page.wait_for_timeout(350)
    visible = lambda ids: [i for i in ("copy-list-button", "copy-link-button", "download-data-button", "rss-feed-link",
                                       "copy-stats-button", "download-all-png-button") if page.is_visible("#" + i)]
    require(visible(None) == ["copy-list-button", "copy-link-button", "download-data-button", "rss-feed-link"],
            f"List buttons: {visible(None)}")
    require(page.get_attribute("#rss-feed-link", "href") == "feeds/all.xml", "RSS link for all engagements")
    require(page.locator("#record-list input[type=checkbox]").count() == total, "A checkbox per listing")
    # Per-listing Copy: message appears under that button; digest text has no emoji or "Showing:".
    page.locator("#record-list .copy-button").first.click()
    require(page.locator("#record-list .mm-card__copy-status").first.inner_text() == "Copied engagement to clipboard.",
            "Per-listing copy message missing")
    require(page.locator("#record-list .copy-button").count() == total, "A Copy button per listing")
    names = page.locator("#record-list .copy-button").evaluate_all("els => els.map(e => e.getAttribute('aria-label'))")
    labels = page.locator("#record-list .mm-card__select label").all_text_contents()
    require(len(set(names)) == total and len(set(labels)) == total, "Per-listing control names must be unique")
    require(page.get_attribute("#rss-feed-link", "aria-label").startswith("RSS"), "RSS name must start with its visible text")
    page.click("#copy-list-button")
    require(page.inner_text("#action-status") == f"Copied {total} engagements to clipboard.", page.inner_text("#action-status"))
    page.click("#copy-link-button")
    page.locator("#action-status:not(:empty)").wait_for()
    page.check("#select-all-checkbox")
    require(page.locator("#record-list input:checked").count() == total, "Select all failed")
    page.uncheck("#select-all-checkbox")
    page.check("#record-list input[type=checkbox] >> nth=0")
    require(page.evaluate("document.getElementById('select-all-checkbox').indeterminate"), "Select all not indeterminate")
    with page.expect_download() as info:
        page.click("#download-data-button")
    csv_text = Path(info.value.path()).read_text(encoding="utf-8")
    require(len(csv_text.strip().splitlines()) == 2, "CSV should hold only the selected listing")
    require(info.value.suggested_filename == "Marin Reach - Oct 12, 2026.csv", info.value.suggested_filename)
    page.uncheck("#record-list input[type=checkbox] >> nth=0")
    with page.expect_download() as info:
        page.click("#download-data-button")
    require(len(Path(info.value.path()).read_text(encoding="utf-8").strip().splitlines()) == total + 1, "CSV row count")
    open_facet(page, "project")
    page.check("input[name=project][value='El Nino']")
    require(page.get_attribute("#rss-feed-link", "href") == "feeds/project-el-nino.xml", "Single-project RSS link")
    page.check("input[name=project][value='Envision Marin']")
    require(page.get_attribute("#rss-feed-link", "aria-disabled") == "true", "RSS should be disabled for two projects")
    page.click("#reset-filters-button")
    for view, ids in (("calendar", ["copy-link-button"]),
                      ("stats", ["copy-stats-button", "download-all-png-button", "copy-link-button"])):
        page.click(f"#view-tabs [data-view={view}]")
        require(visible(None) == [i for i in ("copy-link-button", "copy-stats-button", "download-all-png-button") if i in ids],
                f"{view} buttons: {visible(None)}")
    page.click("#view-tabs [data-view=stats]")
    require(page.locator("#panel-stats canvas").count() == 3, "Stats should draw three charts")
    # Chart text follows the page color (the default dark grey vanishes in dark mode).
    require(page.evaluate("Chart.defaults.color") == page.evaluate("getComputedStyle(document.getElementById('start')).color"),
            "Chart text color does not follow the page")
    require(page.locator("[data-chart-download]").count() == 3, "A PNG button per chart")
    with page.expect_download() as info:
        page.click("[data-chart-download=timeline]")
    require(info.value.suggested_filename == "Marin Reach - Events over time - Oct 12, 2026.png", info.value.suggested_filename)
    page.click("#view-tabs [data-view=list]")

    # Deep link and keyboard reachability.
    page.goto(base + "?view=calendar&status=Completed&agency=District+3&q=drill")
    page.wait_for_selector("#reach-app:not([hidden])")
    require(count(page) == 1 and page.is_checked("input[name=status][value=Completed]"),
            "Deep link did not restore state")
    page.goto(base)
    page.wait_for_selector("#reach-app:not([hidden])")
    page.focus("#filter-search")
    seen = set()
    for _ in range(40):
        page.keyboard.press("Tab")
        seen.add(page.evaluate("document.activeElement.id || document.activeElement.name || ''"))
    require({"filter-from", "filter-to"} <= seen, "Filters not keyboard reachable")

    # Responsive: sidebar becomes a toggle; calendar becomes an agenda.
    for width in (390, 320):
        page.set_viewport_size({"width": width, "height": 900})
        for other in ("?view=stats", "?view=list"):
            page.goto(base + other)
            page.wait_for_selector("#reach-app:not([hidden])")
            no_overflow(page, f"{width}px {other}")
        page.goto(base + "?view=calendar")
        page.wait_for_selector("#reach-app:not([hidden])")
        require(not page.is_visible("#cal-grid") and page.is_visible("#cal-agenda"), "Agenda fallback missing")
        require(not page.is_visible("#filter-panel"), "Filters should start collapsed on small screens")
        page.click("#filter-toggle")
        require(page.is_visible("#filter-panel") and page.get_attribute("#filter-toggle", "aria-expanded") == "true",
                "Filter drawer did not open")
        no_overflow(page, f"{width}px")
    page.set_viewport_size({"width": 1280, "height": 900})

    # Shell sections still work with the app.
    page.goto(base + "#about")
    require(page.is_visible("#about"), "About section missing")
    page.goto(base + "#accessibility")
    require(page.is_visible("#accessibility"), "Accessibility section missing")

    # Error state and retry.
    page.route("**/data/engagements.json", lambda route: route.fulfill(status=500, body="no"))
    page.goto(base)
    page.wait_for_selector("#reach-error:not([hidden])")
    require(page.get_by_role("alert").count() >= 1, "Error is not announced")
    page.unroute("**/data/engagements.json")
    page.click("#reach-retry")
    page.wait_for_selector("#reach-app:not([hidden])")
    require(not problems, f"Console or page errors: {problems}")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}{PREFIX}"
    problems = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for scheme in ("light", "dark"):
                context = browser.new_context(color_scheme=scheme, viewport={"width": 1280, "height": 900})
                page = context.new_page()
                page.clock.set_fixed_time(f"{TODAY}T12:00:00")
                page.route("https://marincountygov.github.io/**", lambda r: r.fulfill(status=200, content_type="application/json", body="[]"))
                page.route("https://api.github.com/**", lambda r: r.fulfill(status=200, content_type="application/json", body="[]"))
                # The shell's accessibility score widget requests lighthouse.json from the
                # MarinOS dev origin when served from localhost; the CSP blocks it. That is
                # shell behavior outside this app, so it is not counted. The 500 is the
                # deliberate error-state probe.
                ignored = ("500", "lighthouse.json", "loadScore")
                page.on("console", lambda m: problems.append(m.text) if m.type == "error" and not any(i in m.text for i in ignored) else None)
                page.on("pageerror", lambda e: problems.append(str(e)) if not any(i in str(e) for i in ignored) else None)
                run(base, page, problems)
                context.close()
            browser.close()
    finally:
        server.shutdown()
    print("Marin Reach browser workflow (light and dark): PASS")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
