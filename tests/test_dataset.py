"""Guards on the curated scholarship dataset. These keep structural quality green
as entries are edited or verified over time."""

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
        assert entry.eligibility.eligible_schools


def test_ids_are_unique():
    ids = [s.id for s in load_scholarships()]
    assert len(ids) == len(set(ids))
