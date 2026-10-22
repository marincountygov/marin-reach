// Marin Reach UI. Data shaping lives in assets/selectors.js; this file loads the
// dataset, reads/writes the URL query string, and renders the views. The shell
// (vendor/marinos/marinos.js) owns the header, footer, info sections, and
// #app-status-message. The layout, buttons, and charts follow marin-mentions.
(function () {
  'use strict';

  const S = window.ReachSelectors;
  const PAGE_SIZE = 50;
  const CHART_COLOR = '#0777cf'; // same as marin-mentions
  const CHART_KEYS = ['timeline', 'agencies', 'projects'];

  const app = {
    records: [],
    state: S.emptyState(),
    filtered: [],
    anchor: '',
    shown: PAGE_SIZE,
    facetInputs: new Map(),
    selected: new Set(),
    charts: {},
    lastFocus: null,
    map: null,
    markers: new Map(),
    mapSelected: null,
    mapSignature: null,
  };

  const $ = (id) => document.getElementById(id);

  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (attrs[k] === false || attrs[k] == null) return;
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    [].concat(children || []).forEach((c) => {
      if (c != null) node.append(c);
    });
    return node;
  }

  function todayISO() {
    const d = new Date();
    return S.toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  // Messages appear next to the control that was used (role="status" regions in the markup).
  function say(message, target) {
    const region = target || $('action-status');
    if (region) region.textContent = message;
  }

  function clearActionStatus() {
    $('action-status').textContent = '';
    $('cal-status').textContent = '';
  }

  // --- URL state ---

  function writeUrl() {
    const query = S.serializeState(app.state);
    const url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    window.history.replaceState(null, '', url);
  }

  function sanitizeState() {
    const st = app.state;
    S.FACETS.forEach((f) => {
      const valid = new Set(S.facetOptions(app.records, S.emptyState(), f.key).map((o) => o.value));
      st.facets[f.key] = st.facets[f.key].filter((v, i, arr) => valid.has(v) && arr.indexOf(v) === i);
    });
    if (st.from && st.to && st.from > st.to) {
      const swap = st.from;
      st.from = st.to;
      st.to = swap;
    }
  }

  // --- filters ---

  function buildFacets() {
    const host = $('facet-groups');
    host.textContent = '';
    app.facetInputs.clear();
    S.FACETS.forEach((facet) => {
      const options = S.facetOptions(app.records, S.emptyState(), facet.key);
      if (!options.length) return;
      const list = h('ul', { class: 'search-facet-list' });
      options.forEach((opt, i) => {
        const id = 'facet-' + facet.key + '-' + i;
        const input = h('input', { type: 'checkbox', id: id, name: facet.param, value: opt.value });
        const count = h('span', { class: 'search-facet-count' });
        app.facetInputs.set(facet.key + '\u0000' + opt.value, { input: input, count: count });
        list.append(h('li', {}, h('label', { for: id }, [input, h('span', { text: opt.value }), count])));
      });
      // One collapsed dropdown per filter, like the monitor groups in marin-mentions.
      const count = h('span', { class: 'app-help-text', 'data-facet-count': facet.key });
      const details = h('details', { class: 'mm-facet-group', 'data-facet': facet.key }, [
        h('summary', {}, [facet.label + ' ', count]),
        h('fieldset', { class: 'search-facet-group' }, [h('legend', { class: 'visually-hidden', text: facet.label }), list]),
      ]);
      if (app.state.facets[facet.key].length) details.open = true;
      host.append(details);
    });
  }

  function syncControls() {
    const st = app.state;
    $('filter-search').value = st.q;
    $('filter-from').value = st.from;
    $('filter-to').value = st.to;
    $('filter-from').max = st.to || '';
    $('filter-to').min = st.from || '';
    S.FACETS.forEach((facet) => {
      S.facetOptions(app.records, st, facet.key).forEach((opt) => {
        const entry = app.facetInputs.get(facet.key + '\u0000' + opt.value);
        if (!entry) return;
        entry.input.checked = st.facets[facet.key].indexOf(opt.value) >= 0;
        entry.count.textContent = '(' + opt.count + ')';
      });
    });
    S.FACETS.forEach((facet) => {
      const badge = document.querySelector('[data-facet-count="' + facet.key + '"]');
      if (badge) badge.textContent = st.facets[facet.key].length ? '(' + st.facets[facet.key].length + ' selected)' : '';
    });
    const n = S.activeFilterCount(st);
    // The button is icon-only: the shell turns this count into its name ("Filters, N active").
    $('filter-toggle').dataset.filterActive = String(n);
  }

  // --- filters panel ---

  // The shell (Marin UI 1.28.0 and later) runs the Filters button: icons, open and closed state, the remembered
  // wide-screen choice and the name. The app only keeps the count current and measures the map again, since the
  // results change width when the panel opens or closes. Hiding the panel never changes a filter.
  document.addEventListener('marin-filters-change', () => { if (app.map) app.map.invalidateSize(); });

  // --- records ---

  function renderRecord(r, headingLevel, withCheckbox, withCopy, withMapLink) {
    if (withCopy === undefined) withCopy = withCheckbox;
    // Listings and the details dialog link to the map; the cards on the map itself do not.
    if (withMapLink === undefined) withMapLink = true;
    const placeActions = withMapLink; // Show on map and directions appear together on listings and in the dialog
    withMapLink = withMapLink && !!S.placeKey(r);
    const heading = S.label(r);
    // Per-listing controls are named with the date and time so repeated titles stay distinct.
    const named = heading + ', ' + S.formatDate(r.date) + (S.formatTimeRange(r) ? ', ' + S.formatTimeRange(r) : '');
    const directions = placeActions ? directionsButton(S.recordDirectionsUrl(r), named) : null;
    const rows = [];
    S.detailPairs(r).forEach((pair) => {
      rows.push(h('dt', { text: pair[0] }));
      rows.push(h('dd', {}, pair[0] === 'Status' ? h('span', { class: 'app-badge', text: pair[1] }) : pair[1]));
    });
    const parts = [
      h('h' + headingLevel, { class: 'mm-card__title' + (r.status === 'Canceled' ? ' is-canceled' : ''), text: heading }),
      h('dl', { class: 'reach-record__meta' }, rows),
    ];
    if (withCopy) {
      const copy = h('button', { type: 'button', class: 'copy-button', 'aria-label': 'Copy engagement: ' + named, title: 'Copy' }, [
        copyIcon(), checkIcon(),
      ]);
      const status = h('p', { class: 'app-help-text mm-card__copy-status', role: 'status' });
      copy.addEventListener('click', () => copyItem(r, copy, status));
      parts.push(h('div', { class: 'mm-card__copy-actions' }, [h('div', { class: 'action-group', role: 'group', 'aria-label': 'Actions: ' + named }, [copy, withMapLink ? mapButton(r, named) : null, directions]), status]));
    } else if (withMapLink || directions) {
      parts.push(h('div', { class: 'mm-card__copy-actions' }, h('div', { class: 'action-group', role: 'group', 'aria-label': 'Actions: ' + named }, [withMapLink ? mapButton(r, named) : null, directions])));
    }
    const body = h('div', { class: 'mm-card__body' }, parts);
    const kids = [];
    if (withCheckbox) {
      const id = 'select-' + r.id;
      const box = h('input', { type: 'checkbox', id: id, 'data-select-id': r.id });
      box.checked = app.selected.has(r.id);
      kids.push(h('span', { class: 'mm-card__select' }, [h('label', { class: 'visually-hidden', for: id, text: 'Select: ' + named }), box]));
    }
    kids.push(body);
    return h(withCheckbox ? 'li' : 'article', { class: 'app-card mm-card', 'data-status': r.status.toLowerCase() }, kids);
  }

  const SIGNPOST_PATHS = '<path d="M12 13v8"/><path d="M12 3v3"/><path d="M18 6a2 2 0 0 1 1.387.56l2.307 2.22a1 1 0 0 1 0 1.44l-2.307 2.22A2 2 0 0 1 18 13H6a2 2 0 0 1-1.387-.56l-2.306-2.22a1 1 0 0 1 0-1.44l2.306-2.22A2 2 0 0 1 6 6z"/>';

  // Directions as an icon-only link, the same look as the Copy and Show on map buttons. It opens another service,
  // so it says so in its name and sends nothing until it is chosen. Null when there is nowhere to go.
  function directionsButton(url, named) {
    if (!url) return null;
    return h('a', { role: 'button', class: 'copy-button directions-button', href: url, target: '_blank', rel: 'noreferrer',
      'aria-label': 'Get directions: ' + named + ' (opens in a new tab)', title: 'Get directions' }, [svgIcon('signpost-icon', SIGNPOST_PATHS)]);
  }

  function mapButton(r, named) {
    const button = h('button', { type: 'button', class: 'copy-button show-on-map-button', 'aria-label': 'Show on map: ' + named, title: 'Show on map' }, [
      svgIcon('map-pin-icon', '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>'),
    ]);
    button.addEventListener('click', () => showOnMap(r));
    return button;
  }

  function svgIcon(cls, markup) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<svg class="' + cls + '" aria-hidden="true" viewBox="0 0 24 24">' + markup + '</svg>';
    return wrap.firstChild;
  }
  function copyIcon() {
    return svgIcon('copy-icon', '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
  }
  function checkIcon() {
    return svgIcon('copy-check-icon', '<path d="M20 6 9 17l-5-5"/>');
  }

  function syncSelectAll() {
    const box = $('select-all-checkbox');
    const count = app.filtered.filter((r) => app.selected.has(r.id)).length;
    box.disabled = app.filtered.length === 0;
    box.checked = app.filtered.length > 0 && count === app.filtered.length;
    box.indeterminate = count > 0 && count < app.filtered.length;
  }

  function renderList() {
    const list = $('record-list');
    list.textContent = '';
    const sorted = S.sortByDate(app.filtered, app.state.sort);
    sorted.slice(0, app.shown).forEach((r) => list.append(renderRecord(r, 3, true)));
    const more = $('show-more');
    more.hidden = sorted.length <= app.shown;
    more.textContent = 'Show more (' + (sorted.length - app.shown) + ' remaining)';
    syncSelectAll();
  }

  // Records the Copy and CSV buttons act on: the selected ones, else all filtered.
  function exportRecords() {
    const chosen = app.filtered.filter((r) => app.selected.has(r.id));
    return chosen.length ? chosen : app.filtered;
  }

  // --- calendar ---

  function eventButton(r, withBadge) {
    const time = r.startTime ? S.formatTime(r.startTime).replace(':00', '') : '';
    const kids = [];
    if (time) kids.push(h('span', { class: 'reach-cal-time', text: time }));
    kids.push(h('span', { class: 'reach-cal-label', text: S.label(r) }));
    kids.push(h('span', { class: withBadge ? 'app-badge' : 'visually-hidden', text: withBadge ? r.status : ', ' + r.status }));
    const button = h('button', { type: 'button', class: 'reach-cal-event', 'data-button-kind': 'content', 'data-status': r.status.toLowerCase(), 'data-id': r.id }, kids);
    button.addEventListener('click', () => openRecord(r, button));
    return button;
  }

  function renderCalendar() {
    const range = app.state.range;
    const byDate = S.groupByDate(app.filtered);
    const today = todayISO();
    const title = S.calendarTitle(range, app.anchor);
    const bounds = S.rangeBounds(range, app.anchor);
    const unit = { day: 'day', week: 'week', month: 'month' }[range];
    $('panel-calendar').dataset.range = range;
    $('cal-title').textContent = title;
    $('cal-caption').textContent = 'Engagements for ' + title;
    $('cal-range').value = range;
    $('cal-prev').setAttribute('aria-label', 'Previous ' + unit);
    $('cal-next').setAttribute('aria-label', 'Next ' + unit);

    // Day view is a list only; week and month use the grid (narrow screens use the list too).
    $('cal-grid').hidden = range === 'day';
    const body = $('cal-body');
    body.textContent = '';
    const weeks = range === 'week'
      ? [S.weekDays(app.anchor).map((date) => ({ date: date, inMonth: true }))]
      : S.monthGrid(S.monthKey(app.anchor));
    weeks.forEach((week) => {
      const row = h('tr');
      week.forEach((cell) => {
        const items = byDate.get(cell.date) || [];
        const td = h('td', { class: cell.inMonth ? '' : 'is-outside' });
        const p = S.parseISO(cell.date);
        const label = range === 'week' ? S.formatDate(cell.date).slice(0, -6) : String(p.d); // "Oct 14" or "14"
        td.append(h('span', { class: 'reach-cal-day', 'aria-current': cell.date === today ? 'date' : false, text: label }));
        if (cell.inMonth && items.length) {
          const ul = h('ul', { class: 'reach-cal-events', 'aria-label': S.formatDate(cell.date, true) });
          items.forEach((r) => ul.append(h('li', {}, eventButton(r, false))));
          td.append(ul);
        }
        row.append(td);
      });
      body.append(row);
    });

    const agenda = $('cal-agenda');
    agenda.textContent = '';
    const days = Array.from(byDate.keys()).filter((d) => d >= bounds.start && d <= bounds.end);
    if (!days.length) {
      agenda.append(h('p', { text: range === 'day' ? 'No engagements on ' + title + '.' : range === 'week' ? 'No engagements ' + title + '.' : 'No engagements in ' + title + '.' }));
    }
    // The outline legend only means something when there is an event to explain.
    $('cal-legend').hidden = days.length === 0;
    days.forEach((d) => {
      const ul = h('ul', { class: 'reach-agenda__events' });
      byDate.get(d).forEach((r) => ul.append(h('li', {}, eventButton(r, true))));
      agenda.append(h('section', {}, [h('h4', { text: S.formatDate(d, true) }), ul]));
    });
  }

  function openRecord(record, trigger) {
    app.lastFocus = trigger;
    app.dialogRecord = record;
    $('record-dialog-status').textContent = '';
    $('copy-fallback').hidden = true;
    const body = $('record-dialog-body');
    body.textContent = '';
    const card = renderRecord(record, 2, false);
    card.querySelector('.mm-card__title').id = 'record-dialog-title';
    body.append(card);
    const dialog = $('record-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const title = $('record-dialog-title');
    title.tabIndex = -1;
    // Name the dialog only once its title exists, so the page never holds a reference to a missing id.
    dialog.setAttribute('aria-labelledby', 'record-dialog-title');
    title.focus();
  }

  function closeRecord() {
    const dialog = $('record-dialog');
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    if (app.lastFocus && document.contains(app.lastFocus)) app.lastFocus.focus();
  }

  // --- stats ---

  // Chart.js draws its own text and grid, so give it the page's colors (it would otherwise
  // use dark grey text that disappears in dark mode). Charts are rebuilt when the scheme changes.
  function applyChartTheme() {
    if (typeof Chart === 'undefined') return;
    const text = getComputedStyle($('start')).color;
    const card = document.querySelector('#panel-stats .app-card');
    Chart.defaults.color = text;
    if (card) Chart.defaults.borderColor = getComputedStyle(card).borderTopColor;
  }

  function rebuildCharts() {
    Object.keys(app.charts).forEach((key) => app.charts[key].destroy());
    app.charts = {};
    applyChartTheme();
    if (app.state.view === 'stats') renderStats(true);
  }

  // PNG exports get the card's background so light text in dark mode stays readable anywhere.
  function chartImage(canvas) {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const context = out.getContext('2d');
    context.fillStyle = getComputedStyle(canvas.closest('.app-card')).backgroundColor;
    context.fillRect(0, 0, out.width, out.height);
    context.drawImage(canvas, 0, 0);
    return out;
  }

  function describeChart(canvas, summary) {
    const title = canvas.dataset.chartTitle || 'Chart';
    canvas.setAttribute('aria-label', summary ? title + '. ' + summary : title);
  }

  // Screen-reader-only data table equal to the chart, since a canvas has no text of its own.
  function fillTable(id, header, entries) {
    const table = $(id);
    table.textContent = '';
    table.append(h('thead', {}, h('tr', {}, [h('th', { scope: 'col', text: header }), h('th', { scope: 'col', text: 'Engagements' })])));
    table.append(h('tbody', {}, entries.map((e) => h('tr', {}, [h('th', { scope: 'row', text: e.label }), h('td', { text: String(e.count) })]))));
  }

  function drawChart(key, type, labels, counts) {
    const canvas = $('stats-' + key + '-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    if (!app.themeApplied) { applyChartTheme(); app.themeApplied = true; }
    const isLine = type === 'line';
    const data = {
      labels: labels,
      datasets: [isLine
        ? { data: counts, borderColor: CHART_COLOR, backgroundColor: CHART_COLOR, tension: 0 }
        : { data: counts, backgroundColor: CHART_COLOR }],
    };
    if (app.charts[key]) {
      app.charts[key].data = data;
      app.charts[key].update();
      return;
    }
    app.charts[key] = new Chart(canvas, {
      type: type,
      data: data,
      options: isLine
        ? { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 }, beginAtZero: true } } }
        : { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { precision: 0 } } } },
    });
  }

  // The numbers, summaries, and screen-reader tables are always kept current (so the tables are never
  // empty); charts are drawn only while the Stats tab is showing, because a chart sizes itself when created.
  function renderStats(draw) {
    const stats = S.computeStats(app.filtered);
    const kpis = $('stats-kpis');
    kpis.textContent = '';
    [['Planned', stats.planned], ['Completed', stats.completed], ['Canceled', stats.canceled],
      ['Partners', stats.partnersReached]].forEach((pair) => {
      kpis.append(h('div', { class: 'mm-stats-kpi' }, [
        h('p', { class: 'app-help-text', text: pair[0] }),
        h('p', { class: 'mm-stats-kpi__value', text: String(pair[1]) }),
      ]));
    });

    const months = stats.byMonth.map((m) => ({ label: S.monthTitle(m.label), count: m.count }));
    const peak = months.slice().sort((a, b) => b.count - a.count)[0];
    describeChart($('stats-timeline-chart'), months.length
      ? stats.total + ' total, peaking at ' + peak.count + ' in ' + peak.label + '.' : 'No engagements for the current filters.');
    if (draw) drawChart('timeline', 'line', months.map((m) => m.label), months.map((m) => m.count));
    fillTable('stats-timeline-table', 'Month', months);

    [['agencies', stats.byAgency, 'Agency or department'], ['projects', stats.byProject, 'Project']].forEach((c) => {
      describeChart($('stats-' + c[0] + '-chart'), c[1].length
        ? 'Top: ' + c[1][0].label + ' with ' + c[1][0].count + ', of ' + c[1].length + ' shown.' : 'No data for the current filters.');
      if (draw) drawChart(c[0], 'bar', c[1].map((e) => e.label), c[1].map((e) => e.count));
      fillTable('stats-' + c[0] + '-table', c[2], c[1]);
    });
  }

  // --- copy, link, download ---

  function filenameDate() {
    return S.formatDate(todayISO());
  }

  function showCopyFallback(text) {
    // The manual-copy box is on the page, which is inert behind the full window dialog, so it moves in while that is open.
    if ($('map-dialog').open) $('map-dialog-host').append($('copy-fallback'));
    $('copy-fallback-text').value = text;
    $('copy-fallback').hidden = false;
    $('copy-fallback-text').focus();
    $('copy-fallback-text').select();
  }

  // Same execCommand technique as marin-mentions: it captures both HTML and plain text.
  function copyRichText(html) {
    const temp = document.createElement('div');
    temp.contentEditable = 'true';
    temp.style.position = 'fixed';
    temp.style.left = '-9999px';
    temp.innerHTML = html;
    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNodeContents(temp);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const copied = document.execCommand('copy');
    selection.removeAllRanges();
    document.body.removeChild(temp);
    return copied;
  }

  const FALLBACK_MESSAGE = "Couldn't copy automatically \u2014 select the text below and copy it manually.";

  // Returns true when copied; otherwise shows the manual-copy textarea.
  function copyRichOrFallback(html, text) {
    $('copy-fallback').hidden = true;
    try {
      if (!copyRichText(html)) throw new Error('copy command failed');
      return true;
    } catch (err) {
      showCopyFallback(text);
      return false;
    }
  }

  function copyList() {
    const items = exportRecords();
    if (!items.length) {
      say('No engagements to copy \u2014 adjust the filters first.');
      return;
    }
    const digest = S.buildDigest(items, S.describeFilters(app.state, app.filtered), app.state.sort);
    say(copyRichOrFallback(digest.html, digest.text)
      ? 'Copied ' + S.plural(items.length, 'engagement') + ' to clipboard.' : FALLBACK_MESSAGE);
  }

  function copyItem(record, button, status) {
    const block = S.buildItemBlock(record);
    if (copyRichOrFallback(block.html, block.text)) {
      button.classList.add('is-copied');
      window.clearTimeout(button.resetTimer);
      button.resetTimer = window.setTimeout(() => button.classList.remove('is-copied'), 1500);
      say('Copied engagement to clipboard.', status);
    } else {
      say(FALLBACK_MESSAGE, status);
    }
  }

  // `target` is the status line next to the button that was used.
  function copyLink(target) {
    $('copy-fallback').hidden = true;
    const text = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => say('Copied link to clipboard.', target))
        .catch(() => { showCopyFallback(text); say(FALLBACK_MESSAGE, target); });
      return;
    }
    say(copyRichOrFallback(text, text) ? 'Copied link to clipboard.' : FALLBACK_MESSAGE, target);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    const items = exportRecords();
    if (!items.length) {
      say('No engagements to download \u2014 adjust the filters first.');
      return;
    }
    triggerDownload(new Blob([S.toCsv(items, app.state.sort)], { type: 'text/csv;charset=utf-8' }), 'Marin Reach - ' + filenameDate() + '.csv');
    say('Downloaded ' + S.plural(items.length, 'engagement') + ' as CSV.');
  }

  function downloadChartPng(key) {
    const chart = app.charts[key];
    if (!chart) return;
    const title = chart.canvas.dataset.chartTitle || 'Chart';
    chartImage(chart.canvas).toBlob((blob) => {
      if (blob) triggerDownload(blob, 'Marin Reach - ' + title + ' - ' + filenameDate() + '.png');
    });
  }

  function downloadAllPngs() {
    // A short stagger: browsers can block several downloads fired in the same tick.
    CHART_KEYS.forEach((key, i) => setTimeout(() => downloadChartPng(key), i * 150));
  }

  function chartSummary(canvas) {
    const title = canvas.dataset.chartTitle || '';
    const label = canvas.getAttribute('aria-label') || '';
    return label.indexOf(title + '.') === 0 ? label.slice(title.length + 1).trim() : '';
  }

  function copyStats() {
    const stats = S.computeStats(app.filtered);
    const head = 'Marin Reach Stats';
    const filters = S.describeFilters(app.state, app.filtered);
    const kpi = 'Planned ' + stats.planned + ', Completed ' + stats.completed + ', Canceled ' + stats.canceled +
      ', Partners ' + stats.partnersReached;
    const text = [head, filters, kpi, ''];
    let html = '<div><b>' + head + '</b><br>' + filters + '<br>' + kpi + '<br><br>';
    const blocks = CHART_KEYS.map((key) => app.charts[key] && app.charts[key].canvas).filter(Boolean).map((canvas) => {
      const title = canvas.dataset.chartTitle || 'Chart';
      const summary = chartSummary(canvas);
      text.push(title);
      if (summary) text.push(summary);
      text.push('');
      // width/height attributes, not inline style: paste targets strip style.
      return '<b>' + title + '</b>' + (summary ? '<br>' + summary : '') + '<br><img src="' +
        chartImage(canvas).toDataURL('image/png') + '" alt="' + title + '" width="' + canvas.clientWidth + '" height="' + canvas.clientHeight + '">';
    });
    html += blocks.join('<br><br>') + '</div>';
    say(copyRichOrFallback(html, text.join('\n').trim()) ? 'Copied charts to clipboard.' : FALLBACK_MESSAGE);
  }

  // RSS: static feeds exist for all engagements and for each single project. With any other filter, search or
  // date range there is no matching feed, so the button is hidden.
  function updateRssLink() {
    const link = $('rss-feed-link');
    const st = app.state;
    const others = S.FACETS.some((f) => f.key !== 'project' && st.facets[f.key].length);
    let href = null;
    if (!st.q && !st.from && !st.to && !others && st.facets.project.length <= 1) {
      href = st.facets.project.length === 1 ? 'feeds/project-' + S.slugify(st.facets.project[0]) + '.xml' : 'feeds/all.xml';
    }
    if (href) link.setAttribute('href', href);
    else link.removeAttribute('href');
    app.rssAvailable = !!href;
  }

  // --- map ---

  // Initial extent when nothing is mapped: Marin County. Markers always come from the data.
  const MARIN_EXTENT = [[37.82, -123.02], [38.33, -122.42]];
  // OpenStreetMap standard tiles (https://operations.osmfoundation.org/policies/tiles/): no key, light use only.
  // The host is allowed in security.json (img-src). The attribution must stay visible.
  const TILES = {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  };
  const CLUSTER_RADIUS = 45; // pixels
  const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>' +
    '<circle cx="12" cy="10" r="3"/></svg>';

  // The icon for a group of nearby markers: the number of engagements as text, named by what it holds.
  // Every cluster looks the same; nothing is shown only on hover.
  function clusterIcon(cluster) {
    const groups = cluster.getAllChildMarkers().map((m) => app.markers.get(m.reachKey).group);
    const engagements = groups.reduce((n, g) => n + g.records.length, 0);
    const id = String(L.stamp(cluster));
    app.clusterById.set(id, cluster);
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = S.clusterLabel(groups.length, engagements);
    const count = document.createElement('span');
    count.className = 'reach-cluster__count';
    count.dataset.cluster = id;
    count.setAttribute('aria-hidden', 'true');
    count.textContent = String(engagements);
    const wrap = document.createElement('div');
    wrap.append(count, label);
    return L.divIcon({ className: 'reach-cluster', html: wrap.innerHTML, iconSize: [44, 44] });
  }

  function ensureMap() {
    if (app.map) return app.map;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The wheel and one-finger drag are left to the page until the map is used, so scrolling past it is easy.
    // Phones and tablets pan and zoom with two fingers.
    const map = L.map($('map'), {
      attributionControl: false, zoomSnap: 0.5, zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still,
      scrollWheelZoom: false, dragging: !L.Browser.mobile,
    });
    map.on('click focus', () => map.scrollWheelZoom.enable());
    map.on('mouseout blur', () => map.scrollWheelZoom.disable());
    L.control.attribution({ prefix: '<a href="https://leafletjs.com">Leaflet</a>' }).addTo(map);
    L.tileLayer(TILES.url, { attribution: TILES.attribution, maxZoom: TILES.maxZoom }).addTo(map);
    map.getContainer().setAttribute('role', 'region');
    map.getContainer().setAttribute('aria-label', 'Map of engagement locations');
    map.fitBounds(MARIN_EXTENT);

    // Markers sit in a cluster layer: nearby markers group into one numbered cluster until the map is zoomed in.
    app.clusterById = new Map();
    app.clusterLayer = L.markerClusterGroup({
      maxClusterRadius: CLUSTER_RADIUS, showCoverageOnHover: false, spiderfyOnMaxZoom: false, zoomToBoundsOnClick: true,
      animate: !still, animateAddingMarkers: false, iconCreateFunction: clusterIcon,
    }).addTo(map);

    // Leaflet only turns Enter into a click for popups, and the zoom controls are links, so Enter and Space are
    // handled here for markers (role="button"), clusters, and the zoom controls. The marker and cluster elements
    // are recreated as the map moves, so this listens on the container instead of on each element.
    map.getContainer().addEventListener('keydown', (e) => {
      const target = e.target.closest ? e.target : null;
      if (!target) return;
      if (e.key === ' ' && target.closest('.leaflet-control-zoom a')) {
        e.preventDefault();
        target.click();
        return;
      }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const pin = target.closest('.reach-pin');
      const cluster = target.closest('.reach-cluster');
      if (pin && pin.dataset.place) {
        e.preventDefault();
        e.stopPropagation();
        selectLocation(pin.dataset.place, true, false);
      } else if (cluster) {
        e.preventDefault();
        e.stopPropagation();
        const owner = app.clusterById.get((cluster.querySelector('[data-cluster]') || {}).dataset?.cluster);
        if (!owner) return;
        // The cluster element goes away when it splits, so focus moves to the map instead of being lost.
        map.once('moveend', () => map.getContainer().focus({ preventScroll: true }));
        owner.zoomToBounds({ padding: [48, 48] });
      }
    });
    app.map = map;
    return map;
  }

  function markerElement(key) {
    const entry = app.markers.get(key);
    return entry && entry.marker.getElement();
  }

  // Where focus goes back to: the marker, or the map itself when the marker is inside a cluster.
  function focusMarkerOrMap(key) {
    const el = (key && markerElement(key)) || (app.map && app.map.getContainer());
    if (el) el.focus();
  }

  // A marker inside a cluster has no element until the map is zoomed in far enough to show it.
  function revealMarker(key, done) {
    const entry = app.markers.get(key);
    if (!entry.marker.getElement()) app.clusterLayer.zoomToShowLayer(entry.marker, done);
    else done();
  }

  // The name, key and selected state live on the element, which Leaflet creates again each time a marker is added.
  function decorateMarker(key) {
    const entry = app.markers.get(key);
    const el = entry && entry.marker.getElement();
    if (!el) return;
    const name = S.markerLabel(entry.group);
    el.setAttribute('aria-label', name);
    el.title = name;
    el.dataset.place = key;
    el.classList.toggle('is-selected', key === app.mapSelected);
  }

  // `focus` moves focus to the details (keyboard and screen-reader use); `pan` centers the map on the location.
  function selectLocation(key, focus, pan) {
    const entry = app.markers.get(key);
    if (!entry) return;
    app.mapSelected = key;
    app.state.place = key;
    writeUrl();
    app.markers.forEach((e, k) => {
      const el = e.marker.getElement();
      if (el) el.classList.toggle('is-selected', k === key);
    });
    renderSelection();
    syncPlaces();
    if (pan && app.map) revealMarker(key, () => app.map.panTo([entry.group.latitude, entry.group.longitude]));
    const title = $('map-selection-title');
    if (focus) title.focus();
    else if (!$('map-dialog').open) title.scrollIntoView({ block: 'nearest' }); // the full window keeps the map in view
  }

  function clearSelection(returnFocus) {
    const key = app.mapSelected;
    app.mapSelected = null;
    app.state.place = '';
    writeUrl();
    app.markers.forEach((entry) => {
      const el = entry.marker.getElement();
      if (el) el.classList.remove('is-selected');
    });
    renderSelection();
    syncPlaces();
    if (returnFocus && key) focusMarkerOrMap(key);
  }

  // The same places as the markers, as a dropdown in alphabetical order: an alternative to the map itself.
  // "All locations" is the default and means nothing is selected.
  function renderPlaces(locations) {
    const select = $('map-places');
    select.textContent = '';
    $('map-places-section').hidden = locations.length === 0;
    select.append(h('option', { value: '', text: 'All locations' }));
    locations.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((group) => {
      select.append(h('option', { value: group.key, text: group.name + ' (' + group.records.length + ')' }));
    });
    syncPlaces();
  }

  function syncPlaces() {
    const select = $('map-places');
    select.value = app.mapSelected || '';
    if (select.value !== (app.mapSelected || '')) select.value = '';
  }

  // Focus stays on the dropdown so arrowing through the options is not interrupted; the change is announced instead.
  function onPlacesChange() {
    const key = $('map-places').value;
    const status = $('map-places-status');
    if (!key) {
      clearSelection(false);
      if (app.map) fitMap();
      say('Showing all locations.', status);
      return;
    }
    selectLocation(key, false, true);
    const entry = app.markers.get(key);
    say('Showing ' + entry.group.name + ', ' + S.plural(entry.group.records.length, 'engagement') + '.', status);
  }

  // The details for the selected marker live below the map, as ordinary page content, so they work the
  // same with a keyboard, a screen reader and a phone. Nothing shows until a marker is chosen.
  function renderSelection() {
    const entry = app.mapSelected && app.markers.get(app.mapSelected);
    const section = $('map-selection');
    const body = $('map-selection-body');
    body.textContent = '';
    section.hidden = !entry;
    $('map-clear').hidden = !entry;
    if (!entry) {
      $('map-selection-title').textContent = 'Selected location';
      return;
    }
    const group = entry.group;
    $('map-selection-title').textContent = group.name;
    group.address.forEach((line) => body.append(h('p', { class: 'reach-map-line', text: line })));
    const goThere = directionsButton(S.directionsUrl(group), group.name);
    if (goThere) body.append(h('div', { class: 'mm-card__copy-actions reach-map-directions' }, h('div', { class: 'action-group', role: 'group', 'aria-label': 'Actions: ' + group.name }, goThere)));
    body.append(h('p', { class: 'reach-map-count', text: '(' + S.plural(group.records.length, 'engagement') + ')' }));
    const copy = h('button', { type: 'button', class: 'action-button', 'aria-label': 'Copy location and its engagements: ' + group.name, title: 'Copy' }, [copyIcon()]);
    const status = h('p', { class: 'app-help-text mm-card__copy-status', role: 'status' });
    copy.addEventListener('click', () => {
      const block = S.buildPlaceBlock(group);
      say(copyRichOrFallback(block.html, block.text) ? 'Copied location to clipboard.' : FALLBACK_MESSAGE, status);
    });
    body.append(h('div', { class: 'reach-map-actions' }, copy), status);
    const list = h('ul', { class: 'reach-map-events' });
    group.records.forEach((r) => list.append(h('li', {}, renderRecord(r, 4, false, true, false))));
    body.append(list);
  }

  // The full window view: the map, its buttons, the locations list and the details move into a modal dialog that
  // fills the browser window (this is not the browser's own fullscreen mode). Escape closes it and focus goes back.
  function setFullWindow(open) {
    const dialog = $('map-dialog');
    const stage = $('map-stage');
    if (open) {
      $('map-dialog-host').append(stage);
      dialog.showModal();
      syncFullWindowButton(true);
      if (app.map) app.map.invalidateSize();
      $('map-fullwindow').focus();
    } else if (dialog.open) {
      dialog.close();
    }
  }

  function syncFullWindowButton(open) {
    const button = $('map-fullwindow');
    button.querySelector('.reach-fw-enter').toggleAttribute('hidden', open);
    button.querySelector('.reach-fw-exit').toggleAttribute('hidden', !open);
    const fullLabel = open ? 'Exit full window' : 'Full window';
    button.setAttribute('aria-label', fullLabel);
    button.title = fullLabel;
  }

  // Escape in the details goes back to the marker that opened them.
  function bindMapSelection() {
    $('map-selection').addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !app.mapSelected) return;
      e.preventDefault();
      focusMarkerOrMap(app.mapSelected);
    });
    $('map-clear').addEventListener('click', () => clearSelection(true));
    $('map-places').addEventListener('change', onPlacesChange);
    $('map-reset').addEventListener('click', () => { if (app.map) fitMap(); });
    const dialog = $('map-dialog');
    if (typeof dialog.showModal !== 'function') {
      $('map-fullwindow').hidden = true;
      return;
    }
    $('map-fullwindow').addEventListener('click', () => setFullWindow(!dialog.open));
    dialog.addEventListener('close', () => {
      $('map-stage-home').append($('map-stage'));
      $('copy-fallback-home').append($('copy-fallback'));
      syncFullWindowButton(false);
      if (app.map) app.map.invalidateSize();
      $('map-fullwindow').focus();
    });
  }

  function renderMap() {
    const points = S.mapPoints(app.filtered, todayISO());
    app.mapLocations = points.locations;
    $('map-status').textContent = S.mapSummary(app.filtered).text;
    const empty = points.locations.length === 0;
    $('map-empty').hidden = !empty;
    $('map-reset').hidden = empty;
    $('map-empty-text').textContent = app.filtered.length === 0
      ? 'No engagements match these filters.' : 'No mapped engagements match these filters.';
    if (typeof L === 'undefined') {
      $('map').hidden = true;
      $('map-selection').hidden = true;
      $('map-fullwindow').hidden = true;
      $('map-empty').hidden = false;
      $('map-empty-text').textContent = 'The map could not load. Every engagement is still available in List.';
      return;
    }
    const map = ensureMap();
    map.invalidateSize(); // the panel was hidden when the map was created

    const keys = new Set(points.locations.map((g) => g.key));
    app.markers.forEach((entry, key) => {
      if (!keys.has(key)) { app.clusterLayer.removeLayer(entry.marker); app.markers.delete(key); }
    });
    points.locations.forEach((group) => {
      let entry = app.markers.get(group.key);
      if (!entry) {
        const marker = L.marker([group.latitude, group.longitude], {
          icon: L.divIcon({ className: 'reach-pin', html: PIN_SVG, iconSize: [36, 36], iconAnchor: [18, 33] }),
          keyboard: true,
        });
        marker.reachKey = group.key;
        entry = { marker: marker, group: group };
        app.markers.set(group.key, entry);
        // A click with no pointer behind it (detail 0) comes from a screen reader or keyboard, so focus moves too.
        marker.on('click', (e) => selectLocation(group.key, !e.originalEvent || e.originalEvent.detail === 0, false));
        marker.on('add', () => decorateMarker(group.key));
        app.clusterLayer.addLayer(marker);
      }
      entry.group = group;
      decorateMarker(group.key);
    });

    // The selected location lives in the URL state; drop it when the filters have removed that location.
    const wanted = app.state.place;
    app.mapSelected = wanted && app.markers.has(wanted) ? wanted : null;
    if (wanted && !app.mapSelected) { app.state.place = ''; writeUrl(); }
    app.markers.forEach((entry, key) => decorateMarker(key));
    renderSelection();
    renderPlaces(points.locations);
    app.clusterLayer.refreshClusters();

    // Refit only when the set of locations changes, so panning and zooming are not undone by a re-render.
    const signature = points.locations.map((g) => g.key).join('|');
    if (signature !== app.mapSignature) {
      app.mapSignature = signature;
      fitMap();
    }
  }

  // Frames every marker: Marin County when there are none, a close view for one, all of them otherwise.
  function fitMap() {
    const locations = app.mapLocations || [];
    if (!locations.length) app.map.fitBounds(MARIN_EXTENT);
    else if (locations.length === 1) app.map.setView([locations[0].latitude, locations[0].longitude], 15);
    else app.map.fitBounds(locations.map((g) => [g.latitude, g.longitude]), { padding: [48, 48], maxZoom: 16 });
  }

  // Opens the map on one engagement's location. Used by the Show on map buttons.
  function showOnMap(record) {
    const key = S.placeKey(record);
    const dialog = $('record-dialog');
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    app.state.place = key;
    setView('map', false);
    selectLocation(key, true, true);
  }

  // --- orchestration ---

  function renderView() {
    const view = app.state.view;
    document.body.dataset.view = view;
    $('map-status').hidden = view !== 'map';
    const list = view === 'list';
    $('no-results').hidden = !(list && app.filtered.length === 0);
    ['list', 'calendar', 'map', 'stats'].forEach((v) => { $('panel-' + v).hidden = v !== view; });
    document.querySelectorAll('#view-tabs [role=tab]').forEach((tab) => {
      const on = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    // On the calendar the Link button sits beside the < and > buttons, so the toolbar's buttons step aside (the search stays).
    $('copy-link-button').hidden = view === 'calendar';
    $('sort-group').hidden = !list;
    $('sort-newest').setAttribute('aria-pressed', String(app.state.sort === 'newest'));
    $('sort-oldest').setAttribute('aria-pressed', String(app.state.sort === 'oldest'));
    $('copy-list-button').hidden = !list;
    $('download-data-button').hidden = !list;
    $('rss-feed-link').hidden = !(list && app.rssAvailable);
    $('copy-stats-button').hidden = view !== 'stats';
    $('download-all-png-button').hidden = view !== 'stats';
    renderList();
    renderCalendar();
    if (view === 'map') renderMap();
    // Chart.js sizes a canvas when it is created, so draw only once the panel is visible.
    renderStats(view === 'stats');
  }

  function update(focusSummary) {
    clearActionStatus();
    app.filtered = S.applyFilters(app.records, app.state);
    app.shown = PAGE_SIZE;
    // In month range, jump to a month that has results if the current one is empty. Day and week
    // ranges stay where the person put them.
    if (app.state.range === 'month' && app.filtered.length &&
        !app.filtered.some((r) => S.monthKey(r.date) === S.monthKey(app.anchor))) {
      app.anchor = S.initialMonth(app.filtered, todayISO()) + '-01';
    }
    writeUrl();
    syncControls();
    updateRssLink();
    $('active-filters').textContent = 'Showing: ' + S.describeFilters(app.state, app.filtered);
    renderView();
    if (focusSummary) $('active-filters').focus();
  }

  function setView(view, focusTab) {
    clearActionStatus();
    $('copy-fallback').hidden = true;
    app.state.view = view;
    writeUrl();
    renderView();
    if (focusTab) $('tab-' + view).focus();
  }

  function resetFilters() {
    const view = app.state.view;
    const range = app.state.range;
    const sort = app.state.sort;
    app.state = S.emptyState();
    app.state.view = view;
    app.state.range = range;
    app.state.sort = sort;
    update(true);
    say('Filters reset.');
  }

  function bindEvents() {
    let timer = 0;
    $('filter-search').addEventListener('input', (e) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { app.state.q = e.target.value.trim(); update(false); }, 200);
    });
    $('filters').addEventListener('submit', (e) => e.preventDefault());
    ['from', 'to'].forEach((key) => {
      $('filter-' + key).addEventListener('change', (e) => {
        app.state[key] = e.target.value;
        if (app.state.from && app.state.to && app.state.from > app.state.to) {
          const swap = app.state.from;
          app.state.from = app.state.to;
          app.state.to = swap;
          say('The From and To dates were swapped so the range runs forward.');
        }
        update(false);
      });
    });
    $('facet-groups').addEventListener('change', (e) => {
      const input = e.target;
      if (input.type !== 'checkbox') return;
      const facet = S.FACETS.filter((f) => f.param === input.name)[0];
      const current = app.state.facets[facet.key];
      app.state.facets[facet.key] = input.checked ? current.concat(input.value) : current.filter((v) => v !== input.value);
      update(false);
    });
    $('reset-filters-button').addEventListener('click', resetFilters);
    $('map-go-list').addEventListener('click', () => setView('list', true));
    bindMapSelection();

    const tabs = Array.from(document.querySelectorAll('#view-tabs [role=tab]'));
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => setView(tab.dataset.view, false));
      tab.addEventListener('keydown', (e) => {
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        setView(tabs[(next + tabs.length) % tabs.length].dataset.view, true);
      });
    });

    $('record-list').addEventListener('change', (e) => {
      const id = e.target.dataset.selectId;
      if (!id) return;
      if (e.target.checked) app.selected.add(id);
      else app.selected.delete(id);
      syncSelectAll();
    });
    $('select-all-checkbox').addEventListener('change', (e) => {
      app.filtered.forEach((r) => { if (e.target.checked) app.selected.add(r.id); else app.selected.delete(r.id); });
      renderList();
    });
    $('show-more').addEventListener('click', () => { app.shown += PAGE_SIZE; renderList(); });

    ['newest', 'oldest'].forEach((order) => {
      $('sort-' + order).addEventListener('click', () => {
        if (app.state.sort === order) return;
        clearActionStatus(); // an earlier copy message no longer describes what is shown
        app.state.sort = order;
        app.shown = PAGE_SIZE;
        writeUrl();
        renderView();
      });
    });
    $('copy-list-button').addEventListener('click', copyList);
    $('copy-link-button').addEventListener('click', () => copyLink());
    $('cal-link').addEventListener('click', () => copyLink($('cal-status')));
    $('download-data-button').addEventListener('click', downloadCsv);
    $('copy-stats-button').addEventListener('click', copyStats);
    $('download-all-png-button').addEventListener('click', downloadAllPngs);
    document.querySelectorAll('[data-chart-download]').forEach((b) => {
      b.addEventListener('click', () => downloadChartPng(b.dataset.chartDownload));
    });

    $('cal-prev').addEventListener('click', () => { app.anchor = S.shiftAnchor(app.state.range, app.anchor, -1); renderCalendar(); });
    $('cal-next').addEventListener('click', () => { app.anchor = S.shiftAnchor(app.state.range, app.anchor, 1); renderCalendar(); });
    // The range sets how far < and > move. Going from Month to Week or Day starts on today when
    // today is in the month being shown, otherwise on the month's first event, so the first
    // view is one with something to see.
    $('cal-range').addEventListener('change', (e) => {
      const next = e.target.value;
      if (app.state.range === 'month' && next !== 'month') {
        const key = S.monthKey(app.anchor);
        if (key === S.monthKey(todayISO())) app.anchor = todayISO();
        else {
          const first = app.filtered.map((r) => r.date).filter((d) => S.monthKey(d) === key).sort()[0];
          app.anchor = first || key + '-01';
        }
      }
      app.state.range = next;
      writeUrl();
      renderCalendar();
    });

    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    (scheme.addEventListener ? scheme.addEventListener.bind(scheme, 'change') : scheme.addListener.bind(scheme))(() => {
      app.themeApplied = false;
      rebuildCharts();
    });
    // A link styled as a button should also answer the Space key, as a button does.
    // Links with role="button" (directions) answer the Space key like a button.
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' && e.target.matches && e.target.matches('a.directions-button')) {
        e.preventDefault();
        e.target.click();
      }
    });
    $('rss-feed-link').addEventListener('keydown', (e) => {
      if (e.key === ' ' && $('rss-feed-link').hasAttribute('href')) {
        e.preventDefault();
        $('rss-feed-link').click();
      }
    });
    $('record-dialog-close').addEventListener('click', closeRecord);
    $('record-dialog-copy').addEventListener('click', () => {
      if (app.dialogRecord) copyItem(app.dialogRecord, $('record-dialog-copy'), $('record-dialog-status'));
    });
    $('record-dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeRecord(); });
    $('record-dialog').addEventListener('close', () => {
      if (app.lastFocus && document.contains(app.lastFocus)) app.lastFocus.focus();
    });
    $('reach-retry').addEventListener('click', load);
  }

  function showError(message) {
    $('reach-loading').hidden = true;
    $('reach-app').hidden = true;
    $('reach-error-text').textContent = message;
    $('reach-error').hidden = false;
  }

  async function load() {
    $('reach-error').hidden = true;
    $('reach-loading').hidden = false;
    let data;
    try {
      const response = await fetch('data/engagements.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      data = await response.json();
      if (!data || !Array.isArray(data.records)) throw new Error('Unexpected data format');
    } catch (err) {
      showError('The engagement records could not be loaded (' + err.message + '). Check your connection and try again.');
      return;
    }
    app.records = data.records;
    app.state = S.parseQuery(window.location.search);
    sanitizeState();
    buildFacets();
    app.filtered = S.applyFilters(app.records, app.state);
    app.anchor = S.initialMonth(app.filtered, todayISO()) + '-01';
    if (app.state.range !== 'month' && S.monthKey(app.anchor) === S.monthKey(todayISO())) app.anchor = todayISO();
    $('reach-loading').hidden = true;
    $('reach-app').hidden = false;
    update(false);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    load();
  });
})();
