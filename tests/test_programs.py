"""Tests for the elite summer-programs feature: dataset, matcher gates/scoring, API."""

from datetime import date

from fastapi.testclient import TestClient

from app.data.loader import load_summer_programs
from app.main import app
from app.matching.program_matcher import match_programs
from app.models.student import StudentProfile

REF_DATE = date(2026, 6, 26)


def _profile(**overrides) -> StudentProfile:
    base = {
        "gpa": 3.9,
        "grade_level": "high_school_junior",
        "citizenship": "us_citizen",
        "state": "TX",
        "intended_majors": ["engineering"],
        "demographic_tags": [],
        "financial_need_level": "high",
        "activities": [],
        "target_schools": [],
    }
    base.update(overrides)
    return StudentProfile(**base)


def test_programs_dataset_loads_and_is_verified():
    programs = load_summer_programs()
    assert len(programs) >= 3
    for program in programs:
        assert program.verified is True
        assert program.verification is not None
        assert program.verification.last_verified_at is not None
        requirement_ids = [requirement.id for requirement in program.application_requirements]
        assert len(requirement_ids) == len(set(requirement_ids))


def test_stem_junior_matches_free_program_with_financial_bonus():
    programs = load_summer_programs()
    results = match_programs(_profile(), programs, today=REF_DATE)
    by_id = {r.program_id: r for r in results}
    assert "mites-summer" in by_id
    mites = by_id["mites-summer"]
    assert mites.score_breakdown.subject > 0  # engineering overlaps MITES STEM
    assert mites.score_breakdown.financial_access > 0  # free + high need
    assert mites.match_tier == "strong"


def test_grade_level_gates_out_a_non_junior():
    programs = load_summer_programs()
    senior = _profile(grade_level="high_school_senior", intended_majors=["science"])
    ids = {r.program_id for r in match_programs(senior, programs, today=REF_DATE)}
    assert "mites-summer" not in ids  # MITES is juniors only
    assert "summer-science-program" not in ids  # SSP is current juniors / rising seniors


def test_junior_matches_ssp_and_programs_include_checklists():
    programs = load_summer_programs()
    junior = _profile(grade_level="high_school_junior", intended_majors=["science"])
    by_id = {r.program_id: r for r in match_programs(junior, programs, today=REF_DATE)}

    assert "summer-science-program" in by_id
    assert by_id["summer-science-program"].application_requirements
    assert by_id["mites-summer"].essay_required is True
    assert by_id["promys"].essay_required is True


def test_special_program_requirement_caps_strong_match_and_flags_manual_check():
    programs = load_summer_programs()
    junior = _profile(
        grade_level="high_school_junior",
        intended_majors=["science"],
        citizenship="us_citizen",
    )
    by_id = {r.program_id: r for r in match_programs(junior, programs, today=REF_DATE)}

    simons = by_id["simons-summer-research"]
    assert simons.match_tier == "possible"
    assert simons.requires_special_check is True
    assert simons.special_requirements[0].label == "High school nomination required"
    assert any("Special eligibility to check" in reason for reason in simons.match_reasons)


def test_broad_legacy_high_school_profile_does_not_match_junior_only_program():
    programs = load_summer_programs()
    broad = _profile(grade_level="high_school")
    ids = {r.program_id for r in match_programs(broad, programs, today=REF_DATE)}
    assert "mites-summer" not in ids


def test_citizenship_gates_out_international_for_us_only_program():
    programs = load_summer_programs()
    intl = _profile(
        grade_level="high_school",
        citizenship="international",
        intended_majors=["mathematics"],
    )
    ids = {r.program_id for r in match_programs(intl, programs, today=REF_DATE)}
    assert "mites-summer" not in ids  # requires US citizen / permanent resident
    assert "promys" in ids  # PROMYS is open regardless of citizenship


def test_api_programs_endpoints():
    # Context manager triggers the lifespan so app.state.programs is loaded.
    with TestClient(app) as client:
        listing = client.get("/programs")
        assert listing.status_code == 200
        assert len(listing.json()) >= 3

        matched = client.post(
            "/programs/match",
            json={
                "gpa": 3.8,
                "grade_level": "high_school_junior",
                "citizenship": "us_citizen",
                "state": "CA",
                "intended_majors": ["engineering"],
                "financial_need_level": "medium",
            },
        )
        assert matched.status_code == 200
        body = matched.json()
        assert isinstance(body, list) and len(body) >= 1
        first = body[0]
        assert {"program_id", "score", "match_tier", "match_reasons"} <= first.keys()
