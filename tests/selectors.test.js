// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/selectors.js');

function rec(over) {
  return Object.assign({
    id: 'eng-x', project: 'P', owner: null, agencies: [], partners: [], audience: null,
    eventName: null, type: null, geographicAreas: [], date: '2026-10-01', startTime: null,
    endTime: null, location: null, status: 'Planned',
  }, over);
}
const data = [
  rec({ id: 'a', project: 'Envision', agencies: ['OCE'], partners: ['Tam CSD'], date: '2026-10-03', status: 'Completed', location: 'Civic Center' }),
  rec({ id: 'b', project: 'Envision', agencies: ['OCE', 'CDA'], date: '2026-11-14', startTime: '13:30', status: 'Planned', eventName: 'Workshop' }),
  rec({ id: 'c', project: 'Outreach', agencies: ['D3'], partners: ['Tam CSD', 'Golden Gate'], date: '2026-11-14', startTime: '10:00', status: 'Canceled' }),
];

test('filters OR within a facet and AND across facets', () => {
  const st = S.emptyState();
  st.facets.project = ['Envision', 'Outreach'];
  assert.equal(S.applyFilters(data, st).length, 3);
  st.facets.status = ['Planned'];
  assert.deepEqual(S.applyFilters(data, st).map((r) => r.id), ['b']);
});

test('multi-value agency matches any value', () => {
  const st = S.emptyState();
  st.facets.agency = ['CDA'];
  assert.deepEqual(S.applyFilters(data, st).map((r) => r.id), ['b']);
});

test('search combines with filters and covers location and event name', () => {
  const st = S.emptyState();
  st.q = 'civic';
  assert.deepEqual(S.applyFilters(data, st).map((r) => r.id), ['a']);
  st.q = 'workshop';
  st.facets.status = ['Completed'];
  assert.equal(S.applyFilters(data, st).length, 0);
});

test('date range is inclusive', () => {
  const st = S.emptyState();
  st.from = '2026-10-03';
  st.to = '2026-11-14';
  assert.equal(S.applyFilters(data, st).length, 3);
  st.to = '2026-11-13';
  assert.equal(S.applyFilters(data, st).length, 1);
});

test('facet options omit blanks and count against other filters only', () => {
  const st = S.emptyState();
  st.facets.status = ['Planned'];
  const partners = S.facetOptions(data, st, 'partner');
  assert.deepEqual(partners, [{ value: 'Golden Gate', count: 0 }, { value: 'Tam CSD', count: 0 }]);
  const status = S.facetOptions(data, st, 'status');
  assert.deepEqual(status.map((o) => o.value), ['Planned', 'Completed', 'Canceled']);
  assert.deepEqual(status.map((o) => o.count), [1, 1, 1]);
});

test('URL state round-trips and ignores invalid dates and views', () => {
  const st = S.emptyState();
  st.view = 'calendar';
  st.q = 'tam junction';
  st.from = '2026-10-01';
  st.facets.agency = ['OCE', 'District 3'];
  const parsed = S.parseQuery(S.serializeState(st));
  assert.deepEqual(parsed, st);
  const bad = S.parseQuery('?from=tomorrow&view=map');
  assert.equal(bad.from, '');
  assert.equal(bad.view, 'list');
  assert.equal(S.serializeState(S.emptyState()), '');
});

test('groupByDate keeps every record, ordered by time', () => {
  const grouped = S.groupByDate(data);
  assert.deepEqual(grouped.get('2026-11-14').map((r) => r.id), ['c', 'b']);
  assert.equal(Array.from(grouped.values()).flat().length, 3);
});

test('monthGrid covers the month on Sunday-first weeks', () => {
  const weeks = S.monthGrid('2026-10');
  assert.equal(weeks[0][0].date, '2026-09-27');
  assert.equal(weeks[weeks.length - 1][6].date, '2026-10-31');
  const inMonth = weeks.flat().filter((c) => c.inMonth);
  assert.equal(inMonth.length, 31);
  assert.equal(inMonth[0].date, '2026-10-01');
});

test('shiftMonth crosses year boundaries', () => {
  assert.equal(S.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(S.shiftMonth('2026-01', -1), '2025-12');
});

test('initialMonth prefers today, then the next record, then the last', () => {
  assert.equal(S.initialMonth(data, '2026-10-12'), '2026-10');
  assert.equal(S.initialMonth(data, '2026-09-01'), '2026-10');
  assert.equal(S.initialMonth([data[1]], '2026-10-20'), '2026-11');
  assert.equal(S.initialMonth(data, '2027-03-01'), '2026-11');
  assert.equal(S.initialMonth([], '2026-10-12'), '2026-10');
});

test('stats: status counts, distinct partners, zero-filled months, per-agency counts', () => {
  const stats = S.computeStats(data);
  assert.equal(stats.planned, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.canceled, 1);
  assert.equal(stats.partnersReached, 2);
  assert.deepEqual(stats.byMonth, [{ label: '2026-10', count: 1 }, { label: '2026-11', count: 2 }]);
  assert.deepEqual(stats.byAgency[0], { label: 'OCE', count: 2 });
  assert.equal(stats.byAgency.reduce((n, a) => n + a.count, 0), 4);
  assert.deepEqual(stats.byProject, [{ label: 'Envision', count: 2 }, { label: 'Outreach', count: 1 }]);
});

test('stats follow the filtered set', () => {
  const st = S.emptyState();
  st.facets.partner = ['Golden Gate'];
  const stats = S.computeStats(S.applyFilters(data, st));
  assert.equal(stats.total, 1);
  assert.equal(stats.partnersReached, 2);
  assert.equal(stats.canceled, 1);
});

test('label and time formatting', () => {
  assert.equal(S.label(data[1]), 'Workshop');
  assert.equal(S.label(data[0]), 'Envision');
  assert.equal(S.formatTime('13:30'), '1:30 PM');
  assert.equal(S.formatTime('00:05'), '12:05 AM');
  assert.equal(S.formatTimeRange(rec({ startTime: '10:00', endTime: '11:30' })), '10:00 AM to 11:30 AM');
  assert.equal(S.formatTimeRange(rec({ startTime: '10:00' })), '10:00 AM');
  assert.equal(S.formatTimeRange(rec()), '');
});

test('sidebar facet order', () => {
  assert.deepEqual(S.FACETS.map((f) => f.key),
    ['audience', 'type', 'project', 'agency', 'partner', 'status', 'area', 'owner']);
});

test('describeFilters uses the "Showing:" line format with status counts', () => {
  assert.equal(S.describeFilters(S.emptyState(), data),
    'All dates · All projects · All agencies (3 engagements — Planned 1, Completed 1, Canceled 1)');
  const st = S.emptyState();
  st.from = '2026-11-01';
  st.facets.project = ['Envision'];
  st.facets.status = ['Planned'];
  st.q = 'work';
  const subset = S.applyFilters(data, st);
  assert.equal(S.describeFilters(st, subset),
    'From Nov 1, 2026 · Envision · All agencies · Status: Planned · matching "work" (1 engagement — Planned 1, Completed 0, Canceled 0)');
});

test('CSV quotes fields, joins multi-values with semicolons, and honors the given records', () => {
  const csv = S.toCsv([rec({ id: 'z', project: 'A, B', agencies: ['X', 'Y'], location: 'say "hi"', startTime: '09:00' })]).split('\r\n');
  assert.equal(csv.length, 2);
  assert.equal(csv[1], '"A, B",,2026-10-01,09:00,,"say ""hi""",X; Y,,,,,,Planned');
});

test('digest has text and html flavors and escapes html', () => {
  const d = S.buildDigest([rec({ project: 'A & B', date: '2026-10-03', status: 'Completed' })], 'All dates');
  assert.match(d.text, /^Marin Reach\nAll dates\n\nA & B\nDate: Sat, Oct 3, 2026/);
  assert.doesNotMatch(d.text + d.html, /🔔|Showing:/);
  assert.match(d.text, /Status: Completed$/);
  assert.match(d.html, /<b>A &amp; B<\/b><br>Date: Sat, Oct 3, 2026/);
});

test('item block is one listing', () => {
  const b = S.buildItemBlock(rec({ eventName: 'Town hall', project: 'P', status: 'Planned' }));
  assert.equal(b.text.split('\n')[0], 'Town hall');
  assert.match(b.text, /Project: P/);
  assert.match(b.html, /^<b>Town hall<\/b><br>Date:/);
});

test('slugify matches the feed file names', () => {
  assert.equal(S.slugify('Envision Marin'), 'envision-marin');
  assert.equal(S.slugify('B & C'), 'b-c');
});

test('newest first: later dates on top, earliest start time first within a day, input untouched', () => {
  const input = [
    rec({ id: 'a', date: '2026-10-03', startTime: '13:00' }),
    rec({ id: 'b', date: '2026-11-14', startTime: '13:30' }),
    rec({ id: 'c', date: '2026-11-14', startTime: '10:00' }),
    rec({ id: 'd', date: '2026-04-01' }),
  ];
  assert.deepEqual(S.sortNewestFirst(input).map((r) => r.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(input.map((r) => r.id), ['a', 'b', 'c', 'd']);
  const csvDates = S.toCsv(input).split('\r\n').slice(1).map((line) => line.split(',')[2]);
  assert.deepEqual(csvDates, ['2026-11-14', '2026-11-14', '2026-10-03', '2026-04-01']);
  const digest = S.buildDigest(input, 'x').text;
  assert.ok(digest.indexOf('Nov 14, 2026') < digest.indexOf('Oct 3, 2026'));
  assert.ok(digest.indexOf('Oct 3, 2026') < digest.indexOf('Apr 1, 2026'));
});
