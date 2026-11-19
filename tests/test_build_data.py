#!/usr/bin/env python3
"""Unit tests for scripts/build_data.py (parsing, normalization, validation)."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_data as bd  # noqa: E402

ALIASES = bd.load_aliases()


def event(name="E", start="2026-04-01T19:00:00-07:00", end=None, status="Planned", project="P",
          organizer=None, sponsor=None, location=None, **props):
    node = {"@id": "urn:t:" + name, "@type": "Event", "name": name, "startDate": start,
            "about": {"@id": "urn:t:project:" + project},
            "additionalProperty": [{"@type": "PropertyValue", "name": "Engagement Status", "value": status}]
            + [{"@type": "PropertyValue", "name": k.replace("_", " "), "value": v} for k, v in props.items()]}
    if end:
        node["endDate"] = end
    if organizer:
        node["organizer"] = {"@id": "urn:t:org:" + organizer}
    if sponsor:
        node["sponsor"] = {"@id": "urn:t:org:" + sponsor}
    if isinstance(location, dict):
        node["location"] = location  # inline Place / VirtualLocation
    elif location:
        node["location"] = {"@id": "urn:t:place:" + location}
    return node


def build(*events):
    graph = [{"@id": "urn:t:project:P", "@type": "gs:Project", "name": "P"},
             {"@id": "urn:t:project:B & C", "@type": "gs:Project", "name": "B & C"}]
    for kind in ("org", "place"):
        for e in events:
            for field in ("organizer", "sponsor", "location"):
                ref = e.get(field)
                if ref and "@id" in ref and ref["@id"].startswith(f"urn:t:{kind}:"):
                    name = ref["@id"].split(":", 3)[3]
                    if not any(g["@id"] == ref["@id"] for g in graph):
                        graph.append({"@id": ref["@id"], "@type": "Organization", "name": name})
    return bd.build_records(json.dumps({"@graph": graph + list(events)}), ALIASES)


class ParsingTests(unittest.TestCase):
    def test_times_and_dates_keep_the_written_local_time(self):
        r = build(event(start="2026-04-01T19:00:00-07:00", end="2026-04-01T20:30:00-07:00"))[0]
        self.assertEqual((r["date"], r["startTime"], r["endTime"]), ("2026-04-01", "19:00", "20:30"))
        r = build(event(start="2026-11-12T18:00:00-08:00"))[0]
        self.assertEqual(r["startTime"], "18:00")

    def test_date_only_start_has_no_times(self):
        r = build(event(start="2026-08-05"))[0]
        self.assertEqual((r["date"], r["startTime"], r["endTime"]), ("2026-08-05", None, None))

    def test_references_resolve_to_names_and_whitespace_is_trimmed(self):
        r = build(event(sponsor="Golden Gate Village ", location=" Marin   Humane"))[0]
        self.assertEqual(r["partners"], ["Golden Gate Village"])
        self.assertEqual(r["location"], "Marin Humane")

    def test_unresolved_reference_fails(self):
        node = event()
        node["location"] = {"@id": "urn:t:place:missing"}
        with self.assertRaisesRegex(bd.DataError, "does not resolve"):
            bd.build_records(json.dumps({"@graph": [node]}), ALIASES)

    def test_project_and_start_date_are_required(self):
        project = {"@id": "urn:t:project:P", "name": "P"}
        node = event()
        del node["about"]
        with self.assertRaisesRegex(bd.DataError, "one project is required"):
            bd.build_records(json.dumps({"@graph": [project, node]}), ALIASES)
        node = event()
        del node["startDate"]
        with self.assertRaisesRegex(bd.DataError, "startDate is required"):
            bd.build_records(json.dumps({"@graph": [project, node]}), ALIASES)

    def test_bad_date_and_status_fail_with_event_id(self):
        with self.assertRaisesRegex(bd.DataError, "Event urn:t:E: startDate"):
            build(event(start="2026-13-45"))
        with self.assertRaisesRegex(bd.DataError, "Event urn:t:E: startDate"):
            build(event(start="soon"))
        with self.assertRaisesRegex(bd.DataError, "Engagement Status"):
            build(event(status="Postponed"))

    def test_status_enum_accepts_canceled_in_any_case(self):
        self.assertEqual(build(event(status="canceled"))[0]["status"], "Canceled")

    def test_non_graph_and_invalid_json_fail(self):
        with self.assertRaisesRegex(bd.DataError, "@graph"):
            bd.build_records("{}", ALIASES)
        with self.assertRaisesRegex(bd.DataError, "not valid JSON"):
            bd.build_records("{", ALIASES)

    def test_replacement_character_fails(self):
        with self.assertRaisesRegex(bd.DataError, "U\\+FFFD"):
            bd.build_records('{"@graph": ["\ufffd"]}', ALIASES)


class NormalizationTests(unittest.TestCase):
    def test_agency_and_area_aliases_keep_raw_value(self):
        r = build(event(organizer="CDA", Geographic_Area="D3"))[0]
        self.assertEqual(r["agencies"], ["Community Development Agency"])
        self.assertEqual(r["geographicAreas"], ["District 3"])
        self.assertEqual(r["raw"], {"agencies": ["CDA"], "geographicAreas": ["D3"]})

    def test_unaliased_values_pass_through_without_raw(self):
        r = build(event(organizer="Public Works", Geographic_Area="Ross"))[0]
        self.assertEqual(r["agencies"], ["Public Works"])
        self.assertNotIn("raw", r)

    def test_geographic_area_splits_on_semicolons_only_and_dedupes(self):
        r = build(event(Geographic_Area="Ross; ross; Tam, Valley"))[0]
        self.assertEqual(r["geographicAreas"], ["Ross", "Tam, Valley"])

    def test_ids_are_stable_and_unique(self):
        first, second = build(event(), event())
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(second["id"], first["id"] + "-2")
        self.assertEqual(build(event())[0]["id"], first["id"])


def place(lat=None, lon=None, **extra):
    node = {"@type": "Place", "name": "Hall", "address": {"@type": "PostalAddress", "streetAddress": "1 Main St",
            "addressLocality": "Mill Valley", "addressRegion": "CA", "postalCode": "94941", "addressCountry": "US"}}
    geo = {"@type": "GeoCoordinates"}
    if lat is not None:
        geo["latitude"] = lat
    if lon is not None:
        geo["longitude"] = lon
    if len(geo) > 1 or extra.get("empty_geo"):
        node["geo"] = geo
    return node


class LocationTests(unittest.TestCase):
    def test_physical_place_with_coordinates_and_address(self):
        r = build(event(location=place(37.9, -122.5)))[0]
        self.assertEqual(r["location"], "Hall")
        self.assertEqual(r["place"]["kind"], "physical")
        self.assertEqual(r["place"]["geo"], {"latitude": 37.9, "longitude": -122.5})
        self.assertEqual(r["place"]["address"]["streetAddress"], "1 Main St")
        self.assertEqual(r["place"]["address"]["locality"], "Mill Valley")

    def test_venue_in_marin_data_takes_its_name_and_place_from_there(self):
        r = build(event(location={"@type": "Place", "name": "marin county civic center"}))[0]
        self.assertEqual(r["location"], "Marin County Civic Center")
        self.assertEqual(r["place"]["facility"], "https://marincountygov.github.io/marin-data/id/facility/civic-center")
        self.assertEqual(r["place"]["address"]["streetAddress"], "3501 Civic Center Dr")
        self.assertIn("geo", r["place"])

    def test_source_place_that_differs_from_marin_data_loses_and_is_flagged(self):
        elsewhere = dict(place(37.0, -122.0), name="Marin Humane")
        r = build(event(location=elsewhere))
        self.assertEqual(r[0]["place"]["geo"], {"latitude": 38.06810087685585, "longitude": -122.53657216568276})
        self.assertIn("differs from marin-data", bd.ambiguity_report(r, ALIASES))

    def test_venue_that_is_not_in_marin_data_is_flagged_not_changed(self):
        r = build(event(location=place(37.9, -122.5)))
        self.assertEqual(r[0]["location"], "Hall")
        self.assertNotIn("facility", r[0]["place"])
        self.assertIn("`Hall` is not a facility in marin-data", bd.ambiguity_report(r, ALIASES))

    def test_physical_place_without_coordinates_is_valid(self):
        r = build(event(location=place()))[0]
        self.assertEqual(r["place"]["kind"], "physical")
        self.assertNotIn("geo", r["place"])

    def test_virtual_location_has_no_coordinates(self):
        r = build(event(location={"@type": "VirtualLocation", "name": "Virtual"}))[0]
        self.assertEqual(r["place"], {"kind": "virtual"})
        self.assertEqual(r["location"], "Virtual")
        r = build(event(location={"@type": "VirtualLocation"}))[0]
        self.assertEqual((r["place"], r["location"]), ({"kind": "virtual"}, "Virtual"))

    def test_event_without_location_is_valid_and_has_no_place(self):
        r = build(event())[0]
        self.assertIsNone(r["location"])
        self.assertNotIn("place", r)

    def test_coordinate_ranges(self):
        for lat, lon in ((90, 180), (-90, -180), (0, 0)):
            self.assertIn("geo", build(event(location=place(lat, lon)))[0]["place"])
        for lat, lon in ((90.1, 0), (-90.1, 0), (0, 180.1), (0, -180.1)):
            with self.assertRaisesRegex(bd.DataError, "must be between"):
                build(event(location=place(lat, lon)))

    def test_coordinates_must_come_as_a_pair(self):
        with self.assertRaisesRegex(bd.DataError, "both latitude and longitude"):
            build(event(location=place(lat=37.9)))
        with self.assertRaisesRegex(bd.DataError, "both latitude and longitude"):
            build(event(location=place(lon=-122.5)))

    def test_coordinates_must_be_numbers(self):
        with self.assertRaisesRegex(bd.DataError, "must be a number"):
            build(event(location=place("37.9", -122.5)))
        with self.assertRaisesRegex(bd.DataError, "must be a number"):
            build(event(location=place(True, -122.5)))

    def test_coordinates_outside_marin_are_reported_not_rejected(self):
        records = build(event(location=place(40.7, -74.0)))
        self.assertIn("outside Marin County", bd.ambiguity_report(records, ALIASES))
        records = build(event(location=place(37.9, -122.5)))
        self.assertNotIn("outside Marin County", bd.ambiguity_report(records, ALIASES))

    def test_schema_rejects_out_of_range_coordinates(self):
        schema = json.loads(bd.SCHEMA.read_text(encoding="utf-8"))
        data = {"schemaVersion": 1, "source": "x", "records": build(event(location=place(37.9, -122.5)))}
        bd.validate(data, schema, schema)
        data["records"][0]["place"]["geo"]["latitude"] = 95
        with self.assertRaises(bd.DataError):
            bd.validate(data, schema, schema)


class DatasetTests(unittest.TestCase):
    def test_committed_outputs_are_current(self):
        output, report, _, feeds = bd.generate()
        self.assertEqual(bd.OUTPUT.read_text(encoding="utf-8"), output)
        self.assertEqual(bd.REPORT.read_text(encoding="utf-8"), report)
        self.assertEqual(sorted(p.name for p in bd.FEEDS.glob("*.xml")), sorted(feeds))
        for name, text in feeds.items():
            self.assertEqual((bd.FEEDS / name).read_text(encoding="utf-8"), text)

    def test_dataset_matches_schema_and_rejects_bad_records(self):
        schema = json.loads(bd.SCHEMA.read_text(encoding="utf-8"))
        data = json.loads(bd.OUTPUT.read_text(encoding="utf-8"))
        bd.validate(data, schema, schema)
        data["records"][0]["status"] = "Maybe"
        with self.assertRaises(bd.DataError):
            bd.validate(data, schema, schema)

    def test_feeds_cover_every_record_and_project(self):
        records = build(event("E1", start="2026-05-06"), event("E2", start="2026-05-07", project="B & C", status="Completed"))
        feeds = bd.build_feeds(records)
        self.assertEqual(sorted(feeds), ["all.xml", "project-b-c.xml", "project-p.xml"])
        self.assertEqual(feeds["all.xml"].count("<item>"), 2)
        self.assertEqual(feeds["project-p.xml"].count("<item>"), 1)
        self.assertLess(feeds["all.xml"].index("E2"), feeds["all.xml"].index("E1"))
        self.assertIn("B &amp; C", feeds["project-b-c.xml"])

    def test_a_shared_project_with_no_engagements_still_has_a_feed(self):
        records = build(event("E1", start="2026-05-06"))
        feeds = bd.build_feeds(records, ["P", "West Marin Visioning"])
        self.assertEqual(sorted(feeds), ["all.xml", "project-p.xml", "project-west-marin-visioning.xml"])
        self.assertEqual(feeds["project-west-marin-visioning.xml"].count("<item>"), 0)
        self.assertIn("Marin Reach: West Marin Visioning", feeds["project-west-marin-visioning.xml"])
        self.assertEqual(feeds["project-p.xml"].count("<item>"), 1)

    def test_the_dataset_lists_every_shared_reach_project_and_only_those(self):
        text, _, _, _ = bd.generate()
        projects = json.loads(text)["projects"]
        shared = json.loads(bd.PROJECTS.read_text(encoding="utf-8"))["projects"]
        self.assertEqual(projects, sorted((p["name"] for p in shared if p.get("reach")), key=str.casefold))
        self.assertIn("West Marin Visioning", projects)
        self.assertNotIn("Weather Together", projects)  # a Links campaign that Reach does not show

    def test_an_engagement_for_a_project_outside_the_shared_list_fails(self):
        import tempfile
        real = bd.PROJECTS
        with tempfile.TemporaryDirectory() as d:
            short = Path(d) / "projects.json"
            short.write_text(json.dumps({"projects": [{"id": "envision-marin", "name": "Envision Marin", "reach": True}]}), encoding="utf-8")
            bd.PROJECTS = short
            try:
                with self.assertRaises(bd.DataError) as caught:
                    bd.generate()
            finally:
                bd.PROJECTS = real
        self.assertIn("not in the shared list of projects", str(caught.exception))
        self.assertIn("Tam Junction Placemaking", str(caught.exception))

    def test_abbreviation_without_alias_is_flagged_not_merged(self):
        records = build(event(organizer="PW"))
        self.assertIn("`PW`", bd.ambiguity_report(records, ALIASES))

    def test_organization_names_come_from_marin_data(self):
        r = build(event(organizer="OCE"), event("E2", organizer="Marin County Executive"))
        self.assertEqual([x["agencies"] for x in r], [["Office of the County Executive"]] * 2)
        self.assertEqual(sorted(x["raw"]["agencies"][0] for x in r), ["Marin County Executive", "OCE"])

    def test_name_shared_by_two_organizations_is_flagged(self):
        report = bd.ambiguity_report(build(event(organizer="Health and Human Services")), ALIASES)
        self.assertIn("more than one County organization", report)

    def test_agency_that_is_not_an_organization_is_flagged(self):
        report = bd.ambiguity_report(build(event(organizer="Parks and Recreation Dept")), ALIASES)
        self.assertIn("not a County organization name or alias", report)
        self.assertNotIn("not a County organization", bd.ambiguity_report(build(event(organizer="D3")), ALIASES))

    def test_local_alias_may_not_disagree_with_marin_data(self):
        real = bd.ALIASES
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "aliases.json"
            bad.write_text(json.dumps({"agencies": {"CDA": "Something Else"}}), encoding="utf-8")
            bd.ALIASES = bad
            try:
                with self.assertRaises(bd.DataError):
                    bd.load_aliases()
            finally:
                bd.ALIASES = real

    def test_place_names_come_from_marin_data(self):
        r = build(event(Geographic_Area="D3; Marin District 4; Town of Ross; City of San Rafael"))[0]
        self.assertEqual(r["geographicAreas"], ["District 3", "District 4", "Ross", "San Rafael"])
        self.assertEqual(r["raw"]["geographicAreas"], ["D3", "Marin District 4", "Town of Ross", "City of San Rafael"])

    def test_geographic_area_that_is_not_a_place_is_flagged(self):
        report = bd.ambiguity_report(build(event(Geographic_Area="Atlantis")), ALIASES)
        self.assertIn("`Atlantis` is not a place name or alias", report)
        self.assertNotIn("not a place name", bd.ambiguity_report(build(event(Geographic_Area="D3; Novato")), ALIASES))

    def test_local_area_alias_may_not_disagree_with_marin_data(self):
        real = bd.ALIASES
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            bad = Path(d) / "aliases.json"
            bad.write_text(json.dumps({"geographicAreas": {"D3": "District 4"}}), encoding="utf-8")
            bd.ALIASES = bad
            try:
                with self.assertRaises(bd.DataError):
                    bd.load_aliases()
            finally:
                bd.ALIASES = real


if __name__ == "__main__":
    unittest.main()
