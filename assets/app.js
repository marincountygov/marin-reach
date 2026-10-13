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
    month: '',
    shown: PAGE_SIZE,
    facetInputs: new Map(),
    selected: new Set(),
    charts: {},
    lastFocus: null,
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
    $('filter-toggle').textContent = n ? 'Filters (' + n + ' active)' : 'Filters';
  }

  // --- records ---

  function renderRecord(r, headingLevel, withCheckbox) {
    const heading = S.label(r);
    // Per-listing controls are named with the date and time so repeated titles stay distinct.
    const named = heading + ', ' + S.formatDate(r.date) + (S.formatTimeRange(r) ? ', ' + S.formatTimeRange(r) : '');
    const rows = [];
    S.detailPairs(r).forEach((pair) => {
      rows.push(h('dt', { text: pair[0] }));
      rows.push(h('dd', {}, pair[0] === 'Status' ? h('span', { class: 'app-badge', text: pair[1] }) : pair[1]));
    });
    const parts = [
      h('h' + headingLevel, { class: 'mm-card__title' + (r.status === 'Canceled' ? ' is-canceled' : ''), text: heading }),
      h('dl', { class: 'reach-record__meta' }, rows),
    ];
    if (withCheckbox) {
      const copy = h('button', { type: 'button', class: 'copy-button', 'aria-label': 'Copy engagement: ' + named }, [
        copyIcon(), checkIcon(),
      ]);
      const status = h('p', { class: 'app-help-text mm-card__copy-status', role: 'status' });
      copy.addEventListener('click', () => copyItem(r, copy, status));
      parts.push(h('div', { class: 'mm-card__copy-actions' }, [copy, status]));
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
    const sorted = S.sortNewestFirst(app.filtered);
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
    const button = h('button', { type: 'button', class: 'reach-cal-event', 'data-status': r.status.toLowerCase(), 'data-id': r.id }, kids);
    button.addEventListener('click', () => openRecord(r, button));
    return button;
  }

  function renderCalendar() {
    const byDate = S.groupByDate(app.filtered);
    const today = todayISO();
    const title = S.monthTitle(app.month);
    $('cal-title').textContent = title;
    $('cal-caption').textContent = 'Engagements for ' + title;

    const body = $('cal-body');
    body.textContent = '';
    S.monthGrid(app.month).forEach((week) => {
      const row = h('tr');
      week.forEach((cell) => {
        const items = byDate.get(cell.date) || [];
        const td = h('td', { class: cell.inMonth ? '' : 'is-outside' });
        td.append(h('span', { class: 'reach-cal-day', 'aria-current': cell.date === today ? 'date' : false, text: String(S.parseISO(cell.date).d) }));
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
    const days = Array.from(byDate.keys()).filter((d) => S.monthKey(d) === app.month);
    if (!days.length) agenda.append(h('p', { text: 'No engagements in ' + title + '.' }));
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
    const digest = S.buildDigest(items, S.describeFilters(app.state, app.filtered));
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

  function copyLink() {
    $('copy-fallback').hidden = true;
    const text = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => say('Copied link to clipboard.'))
        .catch(() => { showCopyFallback(text); say(FALLBACK_MESSAGE); });
      return;
    }
    say(copyRichOrFallback(text, text) ? 'Copied link to clipboard.' : FALLBACK_MESSAGE);
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
    triggerDownload(new Blob([S.toCsv(items)], { type: 'text/csv;charset=utf-8' }), 'Marin Reach - ' + filenameDate() + '.csv');
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

  // RSS: static feeds exist for all engagements and for each single project.
  function updateRssLink() {
    const link = $('rss-feed-link');
    const st = app.state;
    const others = S.FACETS.some((f) => f.key !== 'project' && st.facets[f.key].length);
    let href = null;
    let reason = '';
    if (st.q) reason = "RSS feeds aren't available for search results.";
    else if (st.from || st.to) reason = "RSS feeds aren't available when filtering by date.";
    else if (others) reason = 'RSS feeds are only available for all engagements or a single project.';
    else if (st.facets.project.length > 1) reason = 'RSS feeds are only available for a single project at a time.';
    else href = st.facets.project.length === 1 ? 'feeds/project-' + S.slugify(st.facets.project[0]) + '.xml' : 'feeds/all.xml';
    if (href) {
      link.setAttribute('href', href);
      link.removeAttribute('aria-disabled');
      link.removeAttribute('title');
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.title = reason;
    }
    $('rss-feed-status').textContent = reason;
  }

  // --- orchestration ---

  function renderView() {
    const view = app.state.view;
    const list = view === 'list';
    $('no-results').hidden = !(list && app.filtered.length === 0);
    ['list', 'calendar', 'stats'].forEach((v) => { $('panel-' + v).hidden = v !== view; });
    document.querySelectorAll('#view-tabs [role=tab]').forEach((tab) => {
      const on = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    $('copy-list-button').hidden = !list;
    $('download-data-button').hidden = !list;
    $('rss-feed-link').hidden = !list;
    $('rss-feed-status').hidden = !list;
    $('copy-stats-button').hidden = view !== 'stats';
    $('download-all-png-button').hidden = view !== 'stats';
    renderList();
    renderCalendar();
    // Chart.js sizes a canvas when it is created, so draw only once the panel is visible.
    renderStats(view === 'stats');
  }

  function update(focusSummary) {
    clearActionStatus();
    app.filtered = S.applyFilters(app.records, app.state);
    app.shown = PAGE_SIZE;
    if (app.filtered.length && !app.filtered.some((r) => S.monthKey(r.date) === app.month)) {
      app.month = S.initialMonth(app.filtered, todayISO());
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
    app.state = S.emptyState();
    app.state.view = view;
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

    $('copy-list-button').addEventListener('click', copyList);
    $('copy-link-button').addEventListener('click', copyLink);
    $('download-data-button').addEventListener('click', downloadCsv);
    $('copy-stats-button').addEventListener('click', copyStats);
    $('download-all-png-button').addEventListener('click', downloadAllPngs);
    document.querySelectorAll('[data-chart-download]').forEach((b) => {
      b.addEventListener('click', () => downloadChartPng(b.dataset.chartDownload));
    });

    $('cal-prev').addEventListener('click', () => { app.month = S.shiftMonth(app.month, -1); renderCalendar(); });
    $('cal-next').addEventListener('click', () => { app.month = S.shiftMonth(app.month, 1); renderCalendar(); });
    $('cal-today').addEventListener('click', () => { app.month = S.monthKey(todayISO()); renderCalendar(); });

    $('filter-toggle').addEventListener('click', () => {
      const panel = $('filter-panel');
      const open = panel.dataset.open !== 'true';
      panel.dataset.open = String(open);
      $('filter-toggle').setAttribute('aria-expanded', String(open));
    });
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    (scheme.addEventListener ? scheme.addEventListener.bind(scheme, 'change') : scheme.addListener.bind(scheme))(() => {
      app.themeApplied = false;
      rebuildCharts();
    });
    // A link styled as a button should also answer the Space key, as a button does.
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
    app.month = S.initialMonth(app.filtered, todayISO());
    $('reach-loading').hidden = true;
    $('reach-app').hidden = false;
    update(false);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    load();
  });
})();
