"""Tests for matching helpers shared by both matchers (app.matching.common)."""

from app.matching.common import (
    citizenship_satisfies,
    grade_level_matches,
    matching_fields,
)


def test_broad_high_school_accepts_specific_class_year():
    assert grade_level_matches("high_school_junior", ["high_school"]) is True


def test_broad_undergraduate_accepts_specific_college_year():
    # Regression: the program matcher previously only expanded the high_school
    # umbrella, so a college program open to "college_undergraduate" would not
    # match a "college_junior". Both matchers now share this helper.
    assert grade_level_matches("college_junior", ["college_undergraduate"]) is True


def test_vague_legacy_value_does_not_satisfy_specific_requirement():
    assert grade_level_matches("high_school", ["high_school_senior"]) is False


def test_field_children_are_asymmetric():
    assert matching_fields(["computer_science"], ["science"]) == ["science"]
    assert matching_fields(["science"], ["computer_science"]) == []


def test_citizenship_unverified_returns_none():
    assert citizenship_satisfies("us_citizen", "VERIFY") is None
    assert citizenship_satisfies("international", "any") is True
    assert citizenship_satisfies("international", "us_citizen") is False
