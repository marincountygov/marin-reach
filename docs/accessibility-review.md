# Accessibility review

Manual review of the Marin Reach interface on 2026-10-13. Target: WCAG 2.2 Level AA.

This is not a full WCAG conformance audit and not a screen reader test. Findings come from keyboard use, computed contrast, the browser's accessibility tree, reflow and text-spacing checks in Chromium, and light and dark modes. Manual testing with assistive technology may find more.

## Fixed in this repository

| Severity | Finding | Criterion | Fix |
|---|---|---|---|
| High | On Stats at 320 px wide the page scrolled sideways (129 px). The screen-reader data tables and the grid column were wider than the screen. | 1.4.10 | Tables are wrapped in a clipped container and the grid columns can shrink. A test checks 390 px and 320 px. |
| High | In dark mode the chart axis text and grid lines used the library's dark grey and were close to invisible. | 1.4.3, 1.4.11 | Charts use the page's text and border colors and are rebuilt when the color scheme changes. PNG downloads and copied charts get the card background so they stay readable. |
| Medium | Per-listing checkboxes and Copy buttons had identical names when titles repeated ("Select: Envision Marin" on several listings). | 2.4.6, 4.1.2 | Names now include the date and time. A test checks they are unique. |
| Medium | The RSS link is a link styled as a button. Space did not activate it and a new tab opened without notice. | 4.1.2, 3.2.5 | Space now activates it and its name says it opens in a new tab. |
| Low | Two landmarks shared the name "Filter engagements". The detail dialog put focus on its last button. | 1.3.1, 2.4.3 | The sidebar is named "Filters". Focus goes to the dialog title. |

## WAVE findings (2026-10-13)

| WAVE item | Cause | Result |
|---|---|---|
| Broken ARIA reference (error) | The detail dialog pointed at its title before the title existed. | Fixed: the dialog is named only once it opens. |
| Layout table (3 alerts) | The three screen-reader data tables behind the charts were empty until the Stats tab was opened. | Fixed: the tables are always filled; only chart drawing waits for the tab. |
| Underlined text | Today's date in the calendar was underlined. | Fixed: today is shown with a bold outlined circle. |
| Redundant link | The shell's Security and Accessibility sections link the same address twice in nearby text (security.txt, WCAG 2.2). | Not an app issue; reported for a separate shell change. |
| Noscript element | The required message for people with JavaScript turned off. | Expected; informational only. |

## Fixed in the shared design system

- **Medium to high, 1.4.11:** text inputs, date inputs and checkbox borders were about 1.4:1 against the page in light mode and 1.2:1 in dark mode, below the 3:1 needed for the edge of a control. Marin UI 1.23.0 adds a control border token, and Marin App Shell 1.10.1 carries the same fix. With shell 1.10.1 installed here the borders measure 4.05:1 (light) and 4.44:1 (dark).

## Also fixed

- **Low, 2.5.8:** the checkboxes were 18 px square and met the target-size rule only through spacing. They are now 24 px.

## Passed

- Text contrast: no failing text in List, Calendar or Stats, light or dark (sampled computed colors).
- Keyboard: every control is reachable and operable. Tabs use one tab stop with arrow, Home and End keys. Filter dropdowns open with Enter and Space. The dialog moves focus in, keeps it inside, closes with Escape and returns focus.
- Focus indicators are visible on inputs, buttons, tabs, summaries, checkboxes and calendar events. The Feedback button did not cover a focused control.
- Structure: one h1, logical headings, a language, a page title, no duplicate IDs, a skip link, and labeled landmarks.
- Names and states: every control has a name. Tab selection, dropdown open state, indeterminate Select all and status are exposed.
- Reflow: List and Calendar fit at 320 px, and Stats now does. Calendar becomes an agenda list on narrow screens.
- Text spacing (1.4.12): no clipped text with the WCAG spacing values applied.
- Status is written as text everywhere. The calendar adds outline patterns, and the legend explains them.

## Needs manual testing

- Screen readers (NVDA, JAWS, VoiceOver, TalkBack): how the long "Showing:" line is read on every filter change, how the calendar grid and agenda read, the chart summaries, and the dialog.
- Voice control and switch access.
- Zoom to 400% on real devices, and touch target use on a phone.
- WAVE over HTTP, as the County's standard tool.
