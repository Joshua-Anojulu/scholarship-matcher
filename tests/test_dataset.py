"""Guards on the curated scholarship dataset. These keep structural quality green
as entries are edited or verified over time."""

from datetime import timedelta

from app.data.loader import load_scholarships
from scripts.validate_dataset import audit_dataset


def test_dataset_loads_and_has_entries():
    scholarships = load_scholarships()
    assert len(scholarships) >= 100


def test_dataset_has_no_structural_errors():
    report = audit_dataset(load_scholarships())
    assert report["errors"] == [], report["errors"]


def test_no_vocabulary_warnings():
    # The seed set should only use canonical field/grade/demographic/state tags.
    report = audit_dataset(load_scholarships())
    assert report["warnings"] == [], report["warnings"]


def test_school_pilot_entries_have_provenance():
    by_id = {s.id: s for s in load_scholarships()}
    pilot_ids = (
        "forty-acres-scholars-program",
        "tamu-opportunity-award",
        "georgia-tech-gold-scholars",
        "ut-dallas-aes",
        "cmu-pathway-program",
    )
    for scholarship_id in pilot_ids:
        entry = by_id[scholarship_id]
        assert entry.verified is True
        assert entry.verification is not None
        assert entry.verification.last_verified_at is not None
        assert entry.eligibility.eligible_schools
        assert entry.application_requirements


def test_ids_are_unique():
    ids = [s.id for s in load_scholarships()]
    assert len(ids) == len(set(ids))


def test_audit_reports_reverification_queue():
    scholarships = load_scholarships()
    report = audit_dataset(scholarships)
    assert "needs_reverification_ids" in report
    assert "stale_audit_ids" in report
    assert "needs_reverification" in report["stats"]
    assert "stale_audit" in report["stats"]
    source_only_ids = {
        scholarship.id
        for scholarship in scholarships
        if scholarship.verified
        and scholarship.verification is not None
        and scholarship.verification.last_verified_at is None
    }
    assert source_only_ids
    assert source_only_ids.issubset(set(report["needs_reverification_ids"]))


def _pilot_audit_dates(scholarships):
    pilot_ids = {
        "forty-acres-scholars-program",
        "tamu-opportunity-award",
        "georgia-tech-gold-scholars",
        "ut-dallas-aes",
        "cmu-pathway-program",
    }
    return [
        s.verification.last_verified_at
        for s in scholarships
        if s.id in pilot_ids and s.verification and s.verification.last_verified_at
    ]


def test_audits_are_not_stale_at_the_90_day_boundary():
    scholarships = load_scholarships()
    audit_dates = _pilot_audit_dates(scholarships)
    assert len(audit_dates) == 5
    # The policy is strictly older than 90 days, not 90 days or older.
    at_boundary = max(audit_dates) + timedelta(days=90)
    report = audit_dataset(scholarships, today=at_boundary)
    assert report["stats"]["stale_audit"] == 0


def test_audits_go_stale_after_window():
    scholarships = load_scholarships()
    audit_dates = _pilot_audit_dates(scholarships)
    # The next day, every audited pilot crosses the staleness threshold.
    just_after_window = max(audit_dates) + timedelta(days=91)
    report = audit_dataset(scholarships, today=just_after_window)
    assert report["stats"]["stale_audit"] >= 5
    # Stale entries are a subset of the actionable re-verification queue.
    assert set(report["stale_audit_ids"]).issubset(set(report["needs_reverification_ids"]))
