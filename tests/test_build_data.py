#!/usr/bin/env python3
"""Unit tests for scripts/build_data.py (parsing, normalization, validation)."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_data as bd  # noqa: E402

HEADER = ("Project,Owner,Agency/Department,Partner,Audience,Event Name,Type of Engagement,"
          "Geographic Area,Date,Start Time,End Time,Location ,Engagement Status\n")
ALIASES = bd.load_aliases()


def build(*rows):
    return bd.build_records(HEADER + "\n".join(rows) + "\n", ALIASES)


class ParsingTests(unittest.TestCase):
    def test_times_and_dates_are_normalized(self):
        r = build("P,,CDA,,,E,Meeting,,4/1/2026,7:00:00 PM,8:30 PM,Hall,Planned")[0]
        self.assertEqual((r["date"], r["startTime"], r["endTime"]), ("2026-04-01", "19:00", "20:30"))

    def test_end_time_and_start_time_may_be_blank(self):
        r = build("P,,,,,,,,5/6/2026,,,,Planned")[0]
        self.assertIsNone(r["startTime"])
        self.assertIsNone(r["endTime"])

    def test_header_whitespace_and_value_whitespace_are_trimmed(self):
        r = build("P,,,Golden Gate Village ,,,,,5/6/2026,,,  Marin   Humane ,Planned")[0]
        self.assertEqual(r["partners"], ["Golden Gate Village"])
        self.assertEqual(r["location"], "Marin Humane")

    def test_project_and_date_are_required(self):
        with self.assertRaisesRegex(bd.DataError, "Row 2: Project is required"):
            build(",,,,,,,,5/6/2026,,,,Planned")
        with self.assertRaisesRegex(bd.DataError, "Row 2: Date is required"):
            build("P,,,,,,,,,,,,Planned")

    def test_bad_date_time_and_status_fail_with_row_number(self):
        with self.assertRaisesRegex(bd.DataError, "Row 2: Date"):
            build("P,,,,,,,,13/45/2026,,,,Planned")
        with self.assertRaisesRegex(bd.DataError, "Row 2: Start Time"):
            build("P,,,,,,,,5/6/2026,soon,,,Planned")
        with self.assertRaisesRegex(bd.DataError, "Row 2: Engagement Status"):
            build("P,,,,,,,,5/6/2026,,,,Postponed")

    def test_status_enum_accepts_canceled_in_any_case(self):
        self.assertEqual(build("P,,,,,,,,5/6/2026,,,,canceled")[0]["status"], "Canceled")

    def test_unknown_header_fails(self):
        with self.assertRaisesRegex(bd.DataError, "headers"):
            bd.build_records("Project,Date,Surprise\nP,5/6/2026,x\n", ALIASES)

    def test_replacement_character_fails(self):
        with self.assertRaisesRegex(bd.DataError, "U\\+FFFD"):
            bd.build_records(HEADER + "P,,,�,,,,,5/6/2026,,,,Planned\n", ALIASES)


class NormalizationTests(unittest.TestCase):
    def test_agency_and_area_aliases_keep_raw_value(self):
        r = build("P,,CDA,,,,,D3,5/6/2026,,,,Planned")[0]
        self.assertEqual(r["agencies"], ["Community Development Agency"])
        self.assertEqual(r["geographicAreas"], ["District 3"])
        self.assertEqual(r["raw"], {"agencies": ["CDA"], "geographicAreas": ["D3"]})

    def test_unaliased_values_pass_through_without_raw(self):
        r = build("P,,Public Works,,,,,Ross,5/6/2026,,,,Planned")[0]
        self.assertEqual(r["agencies"], ["Public Works"])
        self.assertNotIn("raw", r)

    def test_multi_value_splits_on_semicolons_only_and_dedupes(self):
        r = build('P,,CDA; oce; CDA,"Tam, Inc.; Tam, Inc.",,,,,5/6/2026,,,,Planned')[0]
        self.assertEqual(r["agencies"], ["Community Development Agency", "Office of the County Executive"])
        self.assertEqual(r["partners"], ["Tam, Inc."])

    def test_ids_are_stable_and_unique(self):
        row = "P,,,,,E,,,5/6/2026,,,,Planned"
        first, second = build(row, row)
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(second["id"], first["id"] + "-2")
        self.assertEqual(build(row)[0]["id"], first["id"])


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
        records = build("A,,,,,E1,,,5/6/2026,,,,Planned", "B & C,,,,,E2,,,5/7/2026,,,,Completed")
        feeds = bd.build_feeds(records)
        self.assertEqual(sorted(feeds), ["all.xml", "project-a.xml", "project-b-c.xml"])
        self.assertEqual(feeds["all.xml"].count("<item>"), 2)
        self.assertEqual(feeds["project-a.xml"].count("<item>"), 1)
        self.assertLess(feeds["all.xml"].index("E2"), feeds["all.xml"].index("E1"))
        self.assertIn("B &amp; C", feeds["project-b-c.xml"])

    def test_abbreviation_without_alias_is_flagged_not_merged(self):
        records = build("P,,PW,,,,,,5/6/2026,,,,Planned")
        self.assertIn("`PW`", bd.ambiguity_report(records, ALIASES))


if __name__ == "__main__":
    unittest.main()
