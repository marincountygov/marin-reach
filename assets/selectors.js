// Pure data selectors shared by the List, Calendar, and Stats views.
// No DOM access: the browser exposes this as window.ReachSelectors and Node
// tests load it with require(). All views filter through applyFilters().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReachSelectors = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Sidebar facets, in sidebar order (the Date range is a separate control above
  // them). Multi-select: OR within a facet, AND across facets. Event Name, times,
  // and Location are deliberately not facets.
  const FACETS = [
    { key: 'audience', param: 'audience', label: 'Audience', all: 'All audiences', values: (r) => (r.audience ? [r.audience] : []) },
    { key: 'type', param: 'type', label: 'Type', all: 'All types', values: (r) => (r.type ? [r.type] : []) },
    { key: 'project', param: 'project', label: 'Project', all: 'All projects', values: (r) => [r.project] },
    { key: 'agency', param: 'agency', label: 'Agency/Department', all: 'All agencies', values: (r) => r.agencies },
    { key: 'partner', param: 'partner', label: 'Partner', all: 'All partners', values: (r) => r.partners },
    { key: 'status', param: 'status', label: 'Status', all: 'All statuses', values: (r) => [r.status] },
    { key: 'area', param: 'area', label: 'Location', all: 'All locations', values: (r) => r.geographicAreas },
    { key: 'owner', param: 'owner', label: 'Owner', all: 'All owners', values: (r) => (r.owner ? [r.owner] : []) },
  ];
  const VIEWS = ['list', 'calendar', 'stats'];
  const RANGES = ['day', 'week', 'month'];
  const SORTS = ['newest', 'oldest'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const STATUS_ORDER = ['Planned', 'Completed', 'Canceled'];

  function emptyState() {
    const facets = {};
    FACETS.forEach((f) => { facets[f.key] = []; });
    return { q: '', from: '', to: '', facets: facets, view: 'list', range: 'month', sort: 'newest' };
  }

  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  function parseQuery(search) {
    const params = new URLSearchParams(search);
    const state = emptyState();
    state.q = (params.get('q') || '').trim();
    const from = params.get('from') || '';
    const to = params.get('to') || '';
    state.from = ISO.test(from) ? from : '';
    state.to = ISO.test(to) ? to : '';
    FACETS.forEach((f) => { state.facets[f.key] = params.getAll(f.param).filter(Boolean); });
    const view = params.get('view');
    state.view = VIEWS.indexOf(view) >= 0 ? view : 'list';
    const range = params.get('range');
    state.range = RANGES.indexOf(range) >= 0 ? range : 'month';
    state.sort = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
    return state;
  }

  function serializeState(state) {
    const params = new URLSearchParams();
    if (state.view && state.view !== 'list') params.set('view', state.view);
    if (state.range && state.range !== 'month') params.set('range', state.range);
    if (state.sort && state.sort !== 'newest') params.set('sort', state.sort);
    if (state.q) params.set('q', state.q);
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    FACETS.forEach((f) => state.facets[f.key].forEach((v) => params.append(f.param, v)));
    return params.toString();
  }

  function activeFilterCount(state) {
    let n = (state.q ? 1 : 0) + (state.from || state.to ? 1 : 0);
    FACETS.forEach((f) => { n += state.facets[f.key].length; });
    return n;
  }

  function searchText(r) {
    return [r.eventName, r.project, r.partners.join(' '), r.agencies.join(' '),
      r.geographicAreas.join(' '), r.location].filter(Boolean).join(' ').toLowerCase();
  }

  function matches(r, state, skipFacet) {
    const q = state.q.toLowerCase();
    if (q && !q.split(/\s+/).every((word) => searchText(r).indexOf(word) >= 0)) return false;
    if (state.from && r.date < state.from) return false;
    if (state.to && r.date > state.to) return false;
    for (let i = 0; i < FACETS.length; i++) {
      const f = FACETS[i];
      const selected = state.facets[f.key];
      if (f.key === skipFacet || !selected.length) continue;
      const values = f.values(r);
      if (!selected.some((s) => values.indexOf(s) >= 0)) return false;
    }
    return true;
  }

  function applyFilters(records, state) {
    return records.filter((r) => matches(r, state, null));
  }

  // Options for one facet, derived from the data. Counts reflect every other
  // active filter but not this facet's own selection, so choices stay visible.
  function facetOptions(records, state, facetKey) {
    const facet = FACETS.filter((f) => f.key === facetKey)[0];
    const counts = new Map();
    records.forEach((r) => {
      if (!matches(r, state, facetKey)) return;
      facet.values(r).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    });
    records.forEach((r) => facet.values(r).forEach((v) => { if (!counts.has(v)) counts.set(v, 0); }));
    const options = Array.from(counts, (e) => ({ value: e[0], count: e[1] }));
    if (facetKey === 'status') {
      options.sort((a, b) => STATUS_ORDER.indexOf(a.value) - STATUS_ORDER.indexOf(b.value));
    } else {
      options.sort((a, b) => a.value.localeCompare(b.value));
    }
    return options;
  }

  function compareRecords(a, b) {
    return a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || '') ||
      a.project.localeCompare(b.project) || a.id.localeCompare(b.id);
  }

  function sortRecords(records) { return records.slice().sort(compareRecords); }

  // The list, CSV, and copied text: newest date first, earliest start time first within a day.
  function sortNewestFirst(records) {
    return records.slice().sort((a, b) => b.date.localeCompare(a.date) ||
      (a.startTime || '').localeCompare(b.startTime || '') || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
  }

  // The same order for the list, the CSV, and copied text. Within a day, earliest start time first.
  function sortByDate(records, order) {
    const dir = order === 'oldest' ? 1 : -1;
    return records.slice().sort((a, b) => dir * a.date.localeCompare(b.date) ||
      (a.startTime || '').localeCompare(b.startTime || '') || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
  }

  function label(r) { return r.eventName || r.project; }

  // --- dates (string based, timezone independent) ---

  function parseISO(iso) {
    const p = iso.split('-').map(Number);
    return { y: p[0], m: p[1], d: p[2] };
  }
  function toISO(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear().toString().padStart(4, '0') + '-' +
      String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dt.getUTCDate()).padStart(2, '0');
  }
  function monthKey(iso) { return iso.slice(0, 7); }
  function shiftMonth(key, delta) {
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7)) - 1 + delta;
    return toISO(y + Math.floor(m / 12), (((m % 12) + 12) % 12) + 1, 1).slice(0, 7);
  }

  function groupByDate(records) {
    const map = new Map();
    sortRecords(records).forEach((r) => {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push(r);
    });
    return map;
  }

  // Weeks (Sunday first) covering a month; each cell is { date, inMonth }.
  function monthGrid(key) {
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const weekCount = Math.ceil((offset + daysInMonth) / 7);
    const weeks = [];
    for (let w = 0; w < weekCount; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const iso = toISO(y, m, 1 + w * 7 + d - offset);
        week.push({ date: iso, inMonth: monthKey(iso) === key });
      }
      weeks.push(week);
    }
    return weeks;
  }

  // --- calendar ranges: the dropdown (day, week, month) sets how far < and > move ---

  function addDays(iso, n) {
    const p = parseISO(iso);
    return toISO(p.y, p.m, p.d + n);
  }

  function weekStart(iso) {
    const p = parseISO(iso);
    return addDays(iso, -new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay());
  }

  function weekDays(iso) {
    const start = weekStart(iso);
    return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(start, n));
  }

  // First and last day shown for a range around an anchor date.
  function rangeBounds(range, anchor) {
    if (range === 'day') return { start: anchor, end: anchor };
    if (range === 'week') return { start: weekStart(anchor), end: addDays(weekStart(anchor), 6) };
    const key = monthKey(anchor);
    return { start: key + '-01', end: addDays(shiftMonth(key, 1) + '-01', -1) };
  }

  // The anchor after pressing < (delta -1) or > (delta 1).
  function shiftAnchor(range, anchor, delta) {
    if (range === 'day') return addDays(anchor, delta);
    if (range === 'week') return addDays(anchor, 7 * delta);
    return shiftMonth(monthKey(anchor), delta) + '-01';
  }

  function calendarTitle(range, anchor) {
    if (range === 'month') return monthTitle(monthKey(anchor));
    if (range === 'day') {
      const p = parseISO(anchor);
      const day = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
      return day + ', ' + MONTHS[p.m - 1] + ' ' + p.d + ', ' + p.y;
    }
    const b = rangeBounds('week', anchor);
    const s = parseISO(b.start);
    const e = parseISO(b.end);
    const short = (p, withYear) => MONTHS[p.m - 1].slice(0, 3) + ' ' + p.d + (withYear ? ', ' + p.y : '');
    return short(s, s.y !== e.y) + ' \u2013 ' + short(e, true);
  }

  // Month to show first: the one holding today if it has records, else the
  // first record's month, else today's.
  function initialMonth(records, todayISO) {
    if (!records.length) return monthKey(todayISO);
    const dates = records.map((r) => r.date).sort();
    if (dates.some((d) => monthKey(d) === monthKey(todayISO))) return monthKey(todayISO);
    const upcoming = dates.filter((d) => d >= todayISO)[0];
    return monthKey(upcoming || dates[dates.length - 1]);
  }

  // --- stats ---

  function countBy(records, getValues) {
    const counts = new Map();
    records.forEach((r) => getValues(r).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    return Array.from(counts, (e) => ({ label: e[0], count: e[1] }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  function eventsByMonth(records) {
    if (!records.length) return [];
    const keys = records.map((r) => monthKey(r.date)).sort();
    const counts = new Map();
    keys.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
    const out = [];
    for (let k = keys[0]; k <= keys[keys.length - 1]; k = shiftMonth(k, 1)) {
      out.push({ label: k, count: counts.get(k) || 0 });
    }
    return out;
  }

  function computeStats(records) {
    const partners = new Set();
    records.forEach((r) => r.partners.forEach((p) => partners.add(p)));
    return {
      total: records.length,
      planned: records.filter((r) => r.status === 'Planned').length,
      completed: records.filter((r) => r.status === 'Completed').length,
      canceled: records.filter((r) => r.status === 'Canceled').length,
      partnersReached: partners.size,
      byMonth: eventsByMonth(records),
      byAgency: countBy(records, (r) => r.agencies),
      byProject: countBy(records, (r) => [r.project]),
    };
  }

  // --- display helpers ---

  function formatTime(hhmm) {
    if (!hhmm) return '';
    const h = Number(hhmm.slice(0, 2));
    return (h % 12 || 12) + ':' + hhmm.slice(3) + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function formatTimeRange(r) {
    if (!r.startTime) return '';
    return r.endTime ? formatTime(r.startTime) + ' to ' + formatTime(r.endTime) : formatTime(r.startTime);
  }


  function formatDate(iso, withWeekday) {
    const p = parseISO(iso);
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
    const base = MONTHS[p.m - 1].slice(0, 3) + ' ' + p.d + ', ' + p.y;
    return withWeekday ? WEEKDAYS[day].slice(0, 3) + ', ' + base : base;
  }

  function monthTitle(key) {
    return MONTHS[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(0, 4);
  }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function statusCounts(records) {
    const counts = { Planned: 0, Completed: 0, Canceled: 0 };
    records.forEach((r) => { counts[r.status] += 1; });
    return counts;
  }

  // "All dates · All projects · All agencies (18 engagements — Planned 10, Completed 8, Canceled 0)"
  function describeFilters(state, records) {
    const parts = [];
    if (state.from && state.to) parts.push(formatDate(state.from) + ' to ' + formatDate(state.to));
    else if (state.from) parts.push('From ' + formatDate(state.from));
    else if (state.to) parts.push('Through ' + formatDate(state.to));
    else parts.push('All dates');
    FACETS.forEach((f) => {
      const chosen = state.facets[f.key];
      if (f.key === 'project' || f.key === 'agency') parts.push(chosen.length ? chosen.join(', ') : f.all);
      else if (chosen.length) parts.push(f.label + ': ' + chosen.join(', '));
    });
    if (state.q) parts.push('matching "' + state.q + '"');
    const c = statusCounts(records);
    return parts.join(' \u00b7 ') + ' (' + plural(records.length, 'engagement') + ' \u2014 Planned ' +
      c.Planned + ', Completed ' + c.Completed + ', Canceled ' + c.Canceled + ')';
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // --- export ---

  function csvField(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCsv(records, order) {
    const header = ['Project', 'Event Name', 'Date', 'Start Time', 'End Time', 'Location',
      'Agency/Department', 'Partner', 'Audience', 'Type of Engagement', 'Geographic Area', 'Owner', 'Status'];
    const rows = sortByDate(records, order).map((r) => [r.project, r.eventName, r.date, r.startTime, r.endTime,
      r.location, r.agencies.join('; '), r.partners.join('; '), r.audience, r.type,
      r.geographicAreas.join('; '), r.owner, r.status]);
    return [header].concat(rows).map((row) => row.map(csvField).join(',')).join('\r\n');
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Detail lines shared by the on-screen card, the dialog, and the copied digest.
  function detailPairs(r) {
    const join = (v) => v.join(', ');
    return [
      ['Date', formatDate(r.date, true)],
      ['Project', r.eventName ? r.project : ''],
      ['Time', formatTimeRange(r)],
      ['Location', r.location || ''],
      ['Agency/Department', join(r.agencies)],
      ['Partner', join(r.partners)],
      ['Audience', r.audience || ''],
      ['Type', r.type || ''],
      ['Geographic area', join(r.geographicAreas)],
      ['Owner', r.owner || ''],
      ['Status', r.status],
    ].filter((pair) => pair[1]);
  }

  // One listing as plain text and HTML (also the per-listing Copy button's content).
  function buildItemBlock(r) {
    const text = [label(r)];
    const html = ['<b>' + escapeHtml(label(r)) + '</b>'];
    detailPairs(r).forEach((pair) => {
      text.push(pair[0] + ': ' + pair[1]);
      html.push('<br>' + escapeHtml(pair[0]) + ': ' + escapeHtml(pair[1]));
    });
    return { text: text.join('\n'), html: html.join('') };
  }

  // Rich (HTML) and plain-text flavors of a digest, in list order.
  function buildDigest(records, filtersText, order) {
    const blocks = sortByDate(records, order).map(buildItemBlock);
    return {
      text: ['Marin Reach', filtersText, ''].concat(blocks.map((b) => b.text + '\n')).join('\n').trim(),
      html: '<div><b>Marin Reach</b><br>' + escapeHtml(filtersText) + '<br><br>' +
        blocks.map((b) => b.html).join('<br><br>') + '</div>',
    };
  }

  return {
    FACETS, VIEWS, RANGES, addDays, weekStart, weekDays, rangeBounds, shiftAnchor, calendarTitle, emptyState, parseQuery, serializeState, activeFilterCount, applyFilters,
    facetOptions, sortRecords, sortNewestFirst, sortByDate, SORTS, label, groupByDate, monthGrid, monthKey, shiftMonth, initialMonth,
    computeStats, formatTime, formatTimeRange, toISO, parseISO, formatDate, monthTitle, plural,
    statusCounts, describeFilters, slugify, toCsv, detailPairs, buildItemBlock, buildDigest, csvField,
  };
});
