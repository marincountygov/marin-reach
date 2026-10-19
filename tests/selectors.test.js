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
  st.range = 'week';
  st.sort = 'oldest';
  st.q = 'tam junction';
  st.from = '2026-10-01';
  st.facets.agency = ['OCE', 'District 3'];
  const parsed = S.parseQuery(S.serializeState(st));
  assert.deepEqual(parsed, st);
  const bad = S.parseQuery('?from=tomorrow&view=globe');
  assert.equal(bad.from, '');
  assert.equal(bad.view, 'list');
  assert.equal(S.parseQuery('?range=decade').range, 'month');
  assert.equal(S.parseQuery('?range=day').range, 'day');
  assert.equal(S.parseQuery('?sort=oldest').sort, 'oldest');
  assert.equal(S.parseQuery('?sort=sideways').sort, 'newest');
  assert.ok(!S.serializeState(S.emptyState()).includes('sort'));
  assert.ok(!S.serializeState(S.emptyState()).includes('range'));
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

test('calendar ranges: bounds, titles, and how far < and > move', () => {
  assert.deepEqual(S.rangeBounds('day', '2026-10-14'), { start: '2026-10-14', end: '2026-10-14' });
  assert.deepEqual(S.rangeBounds('week', '2026-10-14'), { start: '2026-10-11', end: '2026-10-17' });
  assert.deepEqual(S.rangeBounds('month', '2026-10-14'), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(S.weekDays('2026-10-14'), ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(S.shiftAnchor('day', '2026-10-01', -1), '2026-09-30');
  assert.equal(S.shiftAnchor('week', '2026-10-14', 1), '2026-10-21');
  assert.equal(S.shiftAnchor('week', '2026-10-14', -1), '2026-10-07');
  assert.equal(S.shiftAnchor('month', '2026-12-15', 1), '2027-01-01');
  assert.equal(S.shiftAnchor('month', '2026-01-20', -1), '2025-12-01');
  assert.equal(S.calendarTitle('month', '2026-10-14'), 'October 2026');
  assert.equal(S.calendarTitle('week', '2026-10-14'), 'Oct 11 \u2013 Oct 17, 2026');
  assert.equal(S.calendarTitle('week', '2026-09-30'), 'Sep 27 \u2013 Oct 3, 2026');
  assert.equal(S.calendarTitle('week', '2026-12-30'), 'Dec 27, 2026 \u2013 Jan 2, 2027');
  assert.equal(S.calendarTitle('day', '2026-10-14'), 'Wednesday, October 14, 2026');
});

test('sorting by date: newest or oldest first, earliest start within a day, exports follow the order', () => {
  const input = [
    rec({ id: 'a', date: '2026-10-03', startTime: '13:00' }),
    rec({ id: 'b', date: '2026-11-14', startTime: '13:30' }),
    rec({ id: 'c', date: '2026-11-14', startTime: '10:00' }),
    rec({ id: 'd', date: '2026-04-01' }),
  ];
  assert.deepEqual(S.sortByDate(input, 'newest').map((r) => r.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(S.sortByDate(input, 'oldest').map((r) => r.id), ['d', 'a', 'c', 'b']);
  assert.deepEqual(S.sortByDate(input).map((r) => r.id), ['c', 'b', 'a', 'd'], 'newest is the default');
  const dates = (csv) => csv.split('\r\n').slice(1).map((line) => line.split(',')[2]);
  assert.deepEqual(dates(S.toCsv(input, 'oldest')), ['2026-04-01', '2026-10-03', '2026-11-14', '2026-11-14']);
  assert.deepEqual(dates(S.toCsv(input)), ['2026-11-14', '2026-11-14', '2026-10-03', '2026-04-01']);
  const text = S.buildDigest(input, 'x', 'oldest').text;
  assert.ok(text.indexOf('Apr 1, 2026') < text.indexOf('Nov 14, 2026'));
});

// --- map selectors ---

const PHYSICAL = { kind: 'physical', address: { streetAddress: '180 Camino Alto', locality: 'Mill Valley', region: 'CA', postalCode: '94941' } };
const at = (lat, lon, extra) => Object.assign({}, PHYSICAL, { geo: { latitude: lat, longitude: lon } }, extra);
const mapData = [
  rec({ id: 'm1', eventName: 'Workshop', date: '2026-11-19', location: 'Mill Valley CC', place: at(37.9, -122.5) }),
  rec({ id: 'm2', eventName: 'Town Hall', date: '2026-10-21', location: 'Mill Valley CC', place: at(37.9, -122.5) }),
  rec({ id: 'm3', date: '2026-11-12', location: 'Ross Hall', place: at(37.96, -122.55) }),
  rec({ id: 'v1', location: 'Virtual', place: { kind: 'virtual' } }),
  rec({ id: 'n1', location: 'Homestead', place: PHYSICAL }),
  rec({ id: 'u1' }),
];

test('mapPoints groups exact coordinates and sorts events oldest first within a location', () => {
  const { locations } = S.mapPoints(mapData);
  assert.equal(locations.length, 2);
  const mv = locations.find((l) => l.name === 'Mill Valley CC');
  assert.deepEqual(mv.records.map((r) => r.id), ['m2', 'm1']);
  assert.deepEqual(mv.address, ['180 Camino Alto', 'Mill Valley, CA 94941']);
  assert.equal(mv.latitude, 37.9);
});

test('mapPoints reports why records are not mapped and never loses a record', () => {
  const p = S.mapPoints(mapData);
  assert.deepEqual(p.unmapped.map((u) => [u.record.id, u.reason]),
    [['v1', 'virtual'], ['n1', 'no-coordinates'], ['u1', 'no-location']]);
  const placed = p.locations.reduce((n, l) => n + l.records.length, 0);
  assert.equal(placed + p.unmapped.length, mapData.length);
});

test('mapPoints handles zero and one record', () => {
  assert.deepEqual(S.mapPoints([]), { locations: [], unmapped: [] });
  assert.equal(S.mapPoints([mapData[2]]).locations.length, 1);
});

test('mapSummary counts only the records it is given', () => {
  assert.equal(S.mapSummary(mapData).text,
    '3 of 6 engagements shown on map. 3 engagements do not have a map location (1 virtual, 1 without coordinates, 1 without a location).');
  assert.equal(S.mapSummary([mapData[0]]).text, '1 of 1 engagement shown on map.');
  assert.equal(S.mapSummary([mapData[3]]).text, '0 of 1 engagement shown on map. 1 engagement does not have a map location (1 virtual).');
  assert.equal(S.mapSummary([]).text, '0 of 0 engagements shown on map.');
});

test('map and the other views share one filtered set', () => {
  const st = S.emptyState();
  st.facets.project = ['Envision'];
  const input = mapData.map((r) => Object.assign({}, r, { project: r.id === 'm1' ? 'Envision' : 'Other' }));
  const filtered = S.applyFilters(input, st);
  const p = S.mapPoints(filtered);
  assert.deepEqual(filtered.map((r) => r.id), ['m1']);
  assert.equal(p.locations.reduce((n, l) => n + l.records.length, 0) + p.unmapped.length, filtered.length);
});

test('markerLabel names the event and place, falling back to the project, or the place and count', () => {
  const [mv, ross] = [S.mapPoints(mapData).locations.find((l) => l.name === 'Mill Valley CC'),
    S.mapPoints(mapData).locations.find((l) => l.name === 'Ross Hall')];
  assert.equal(S.markerLabel(ross), 'P at Ross Hall');
  assert.equal(S.markerLabel(mv), 'Mill Valley CC \u2014 2 engagements');
  assert.equal(S.markerLabel(S.mapPoints([mapData[0]]).locations[0]), 'Workshop at Mill Valley CC');
});

test('map is a recognized view between calendar and stats, and round-trips through the URL', () => {
  assert.deepEqual(S.VIEWS, ['list', 'calendar', 'map', 'stats']);
  const st = S.parseQuery('?view=map&project=Envision');
  assert.equal(st.view, 'map');
  assert.deepEqual(st.facets.project, ['Envision']);
  assert.match(S.serializeState(st), /view=map/);
  assert.deepEqual(S.parseQuery(S.serializeState(st)), st);
});

test('the selected map location is kept in the URL only on the map view and only if it is a coordinate pair', () => {
  const st = S.parseQuery('?view=map&place=37.898796,-122.528346');
  assert.equal(st.place, '37.898796,-122.528346');
  assert.match(S.serializeState(st), /place=37\.898796%2C-122\.528346/);
  assert.deepEqual(S.parseQuery(S.serializeState(st)), st);
  st.view = 'list';
  assert.doesNotMatch(S.serializeState(st), /place=/);
  assert.equal(S.parseQuery('?view=map&place=<script>').place, '');
  assert.equal(S.parseQuery('?view=map').place, '');
});

test('placeKey matches the map grouping key and is empty without coordinates', () => {
  assert.equal(S.placeKey(mapData[0]), '37.9,-122.5');
  assert.equal(S.placeKey(mapData[3]), '');
  assert.equal(S.mapPoints(mapData).locations[0].key, S.placeKey(S.mapPoints(mapData).locations[0].records[0]));
});

test('mapPoints lists upcoming engagements first, soonest first, then past ones, latest first', () => {
  const at1 = (id, date) => rec({ id: id, date: date, location: 'Hall', place: at(37.9, -122.5) });
  const group = S.mapPoints([at1('p1', '2026-01-10'), at1('f2', '2026-12-01'), at1('p2', '2026-03-05'), at1('f1', '2026-10-20')], '2026-10-19').locations[0];
  assert.deepEqual(group.records.map((r) => r.id), ['f1', 'f2', 'p2', 'p1']);
  assert.deepEqual(S.mapPoints([at1('b', '2026-02-01'), at1('a', '2026-01-01')]).locations[0].records.map((r) => r.id), ['a', 'b']);
});

test('directionsUrl uses the address, or the coordinates when there is none', () => {
  const group = S.mapPoints(mapData).locations.find((l) => l.name === 'Mill Valley CC');
  assert.equal(S.directionsUrl(group), 'https://www.google.com/maps/dir/?api=1&destination=180%20Camino%20Alto%2C%20Mill%20Valley%2C%20CA%2094941');
  const bare = S.mapPoints([rec({ id: 'x', location: 'Park', place: { kind: 'physical', geo: { latitude: 37.9, longitude: -122.5 } } })]).locations[0];
  assert.equal(S.directionsUrl(bare), 'https://www.google.com/maps/dir/?api=1&destination=37.9%2C-122.5');
});

test('buildPlaceBlock has the place, its address, the count, and every engagement', () => {
  const group = S.mapPoints(mapData).locations.find((l) => l.name === 'Mill Valley CC');
  const block = S.buildPlaceBlock(group);
  assert.match(block.text, /^Mill Valley CC\n180 Camino Alto\nMill Valley, CA 94941\n\(2 engagements\)\n\nTown Hall/);
  assert.match(block.text, /Workshop/);
  assert.match(block.html, /<b>Mill Valley CC<\/b><br>180 Camino Alto<br>Mill Valley, CA 94941<br>\(2 engagements\)/);
});

test('clusters are named by what they hold', () => {
  assert.equal(S.clusterLabel(3, 7), '3 locations, 7 engagements. Press Enter to zoom in.');
  assert.equal(S.clusterLabel(1, 1), '1 location, 1 engagement. Press Enter to zoom in.');
});

test('recordDirectionsUrl uses the address, falls back to coordinates, and is empty for virtual or unlocated records', () => {
  assert.equal(S.recordDirectionsUrl(mapData[0]), 'https://www.google.com/maps/dir/?api=1&destination=180%20Camino%20Alto%2C%20Mill%20Valley%2C%20CA%2094941');
  assert.equal(S.recordDirectionsUrl(rec({ place: { kind: 'physical', geo: { latitude: 37.9, longitude: -122.5 } } })), 'https://www.google.com/maps/dir/?api=1&destination=37.9%2C-122.5');
  assert.equal(S.recordDirectionsUrl(rec({ place: { kind: 'physical', address: { streetAddress: '1 Main St' } } })), 'https://www.google.com/maps/dir/?api=1&destination=1%20Main%20St');
  assert.equal(S.recordDirectionsUrl(mapData[3]), '');
  assert.equal(S.recordDirectionsUrl(mapData[5]), '');
  assert.equal(S.recordDirectionsUrl(mapData[4]), 'https://www.google.com/maps/dir/?api=1&destination=180%20Camino%20Alto%2C%20Mill%20Valley%2C%20CA%2094941');
});
