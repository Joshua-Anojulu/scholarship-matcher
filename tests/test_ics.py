from app.data.loader import load_scholarships, load_summer_programs
from app.ics import build_calendar


def test_calendar_exports_scholarship_and_program_verified_deadlines():
    scholarship = next(
        item
        for item in load_scholarships()
        if item.deadline and not item.deadline.startswith("VERIFY") and item.deadline != "rolling"
    )
    program = load_summer_programs()[0].model_copy(update={"deadline": "2026-02-01"})

    calendar = build_calendar([scholarship], [program])

    assert "BEGIN:VCALENDAR" in calendar
    assert f"UID:scholarship-{scholarship.id}@scholarships4u" in calendar
    assert f"UID:program-{program.id}@scholarships4u" in calendar
    assert f"SUMMARY:Apply: {program.name}" in calendar
    assert "X-WR-CALNAME:Scholarships4U verified deadlines" in calendar


def test_calendar_skips_unverified_program_deadlines():
    program = load_summer_programs()[0].model_copy(update={"deadline": "VERIFY"})

    calendar = build_calendar([], [program])

    assert f"UID:program-{program.id}@scholarships4u" not in calendar
    assert "BEGIN:VCALENDAR" in calendar
