from datetime import date

import pytest

from app.matching.matcher import match_scholarships
from app.models.scholarship import Eligibility, Scholarship
from app.models.student import StudentProfile

TEST_URL = "https://example.org/scholarship"
FIXED_TODAY = date(2026, 6, 13)


def make_student(**overrides) -> StudentProfile:
    defaults = {
        "gpa": 3.8,
        "grade_level": "high_school_senior",
        "intended_majors": ["engineering"],
        "demographic_tags": ["african_american"],
        "state": "CA",
        "citizenship": "us_citizen",
        "financial_need_level": "high",
        "activities": ["robotics club"],
    }
    defaults.update(overrides)
    return StudentProfile(**defaults)


def make_scholarship(**overrides) -> Scholarship:
    eligibility_defaults = {
        "min_gpa": 3.5,
        "fields_of_study": ["engineering"],
        "grade_levels": ["high_school_senior"],
        "demographics": ["african_american"],
        "states": "any",
        "essay_required": True,
        "citizenship_requirement": "us_citizen",
    }
    scholarship_defaults = {
        "id": "test-scholarship",
        "name": "Test Scholarship",
        "sponsor": "Test Foundation",
        "award_amount": 10000,
        "deadline": "2026-09-30",
        "url": TEST_URL,
        "eligibility": eligibility_defaults,
        "description": "A test scholarship for unit tests.",
        "verified": False,
    }
    if "eligibility" in overrides:
        merged = {**eligibility_defaults, **overrides.pop("eligibility")}
        scholarship_defaults["eligibility"] = merged
    scholarship_defaults.update(overrides)
    return Scholarship(**scholarship_defaults)


def match_one(student: StudentProfile, scholarship: Scholarship):
    results = match_scholarships(student, [scholarship], today=FIXED_TODAY)
    return results[0] if results else None


class TestPerfectMatch:
    def test_perfect_match_scores_high_and_lists_reasons(self):
        student = make_student()
        scholarship = make_scholarship(
            eligibility={"fields_of_study": ["engineering"]},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score == pytest.approx(65.0)
        assert result.verified is False
        assert "Meets GPA requirement (minimum 3.5)" in result.match_reasons
        assert "Grade level matches (high_school_senior)" in result.match_reasons
        assert "Meets citizenship requirement" in result.match_reasons
        assert "Field of study overlap: engineering" in result.match_reasons
        assert "Demographic match: african_american" in result.match_reasons
        assert result.score_breakdown.total == result.score
        assert result.closing_soon is False


class TestFieldScoring:
    def test_specific_field_match_scores_above_open_to_all(self):
        student = make_student(intended_majors=["engineering"])
        specific = make_scholarship(
            id="specific-field",
            eligibility={"fields_of_study": ["engineering"], "demographics": []},
        )
        open_field = make_scholarship(
            id="open-field",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        specific_result = match_one(student, specific)
        open_result = match_one(student, open_field)

        assert specific_result is not None
        assert open_result is not None
        assert specific_result.score_breakdown.field_of_study == 40.0
        assert open_result.score_breakdown.field_of_study == 10.0
        assert specific_result.score > open_result.score

    def test_specific_field_ranks_above_open_with_demographic(self):
        student = make_student(
            intended_majors=["science"],
            demographic_tags=["african_american"],
        )
        field_specific = make_scholarship(
            id="science-scholarship",
            name="Science Scholarship",
            eligibility={"fields_of_study": ["science"], "demographics": []},
        )
        open_with_demo = make_scholarship(
            id="open-demo-scholarship",
            name="Open Demo Scholarship",
            eligibility={"fields_of_study": [], "demographics": ["african_american"]},
        )
        results = match_scholarships(
            student,
            [open_with_demo, field_specific],
            today=FIXED_TODAY,
        )

        assert results[0].scholarship_id == "science-scholarship"
        assert results[0].score > results[1].score


class TestTieBreaking:
    def test_equal_scores_prefer_confirmed_deadline(self):
        student = make_student()
        with_deadline = make_scholarship(
            id="with-deadline",
            name="Zulu Scholarship",
            deadline="2026-09-30",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        verify_deadline = make_scholarship(
            id="verify-deadline",
            name="Alpha Scholarship",
            deadline="VERIFY",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        results = match_scholarships(
            student,
            [verify_deadline, with_deadline],
            today=FIXED_TODAY,
        )

        assert results[0].scholarship_id == "with-deadline"

    def test_equal_scores_and_deadlines_sort_alphabetically(self):
        student = make_student()
        scholarship_z = make_scholarship(
            id="z-scholarship",
            name="Zulu Scholarship",
            deadline="VERIFY",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        scholarship_a = make_scholarship(
            id="a-scholarship",
            name="Alpha Scholarship",
            deadline="VERIFY",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        results = match_scholarships(
            student,
            [scholarship_z, scholarship_a],
            today=FIXED_TODAY,
        )

        assert results[0].scholarship_name == "Alpha Scholarship"
        assert results[1].scholarship_name == "Zulu Scholarship"


class TestMatchTier:
    def test_strong_tier_for_high_scores(self):
        student = make_student()
        scholarship = make_scholarship(
            eligibility={"fields_of_study": ["engineering"], "demographics": ["african_american"]},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.match_tier == "strong"

    def test_possible_tier_for_low_scores(self):
        student = make_student()
        scholarship = make_scholarship(
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.match_tier == "possible"

    def test_field_mismatch_caps_an_otherwise_strong_match_at_possible(self):
        student = make_student(
            intended_majors=["literature"],
            activities=["robotics", "debate"],
            financial_need_level="high",
        )
        scholarship = make_scholarship(
            description="A need-based award for financial need, robotics, and debate.",
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score == pytest.approx(45.0)
        assert result.match_tier == "possible"
        assert (
            "May not match this scholarship's field of study, check eligibility"
            in result.match_reasons
        )


class TestTargetSchoolMatching:
    def test_target_school_alias_adds_points_and_reason(self):
        student = make_student(target_schools=["UT Austin"])
        scholarship = make_scholarship(
            eligibility={
                "eligible_schools": [
                    {
                        "name": "The University of Texas at Austin",
                        "aliases": ["UT Austin"],
                    }
                ]
            }
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.target_school == pytest.approx(15.0)
        assert "Target school match: The University of Texas at Austin" in result.match_reasons

    def test_school_mismatch_caps_an_otherwise_strong_match_at_possible(self):
        student = make_student(target_schools=["Rice University"])
        scholarship = make_scholarship(
            eligibility={
                "eligible_schools": [
                    {"name": "The University of Texas at Austin", "aliases": ["UT Austin"]}
                ]
            }
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score == pytest.approx(65.0)
        assert result.match_tier == "possible"
        assert "May only be available at another school, check eligibility" in result.match_reasons

    def test_empty_target_schools_do_not_trigger_school_mismatch(self):
        student = make_student()
        scholarship = make_scholarship(
            eligibility={
                "eligible_schools": [
                    {"name": "The University of Texas at Austin", "aliases": ["UT Austin"]}
                ]
            }
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.target_school == pytest.approx(0.0)
        assert result.match_tier == "strong"
        assert not any("another school" in reason for reason in result.match_reasons)

    def test_verification_metadata_flows_to_match_result(self):
        scholarship = make_scholarship(
            verification={
                "source_url": "https://example.org/official-source",
                "last_verified_at": "2026-06-21",
            }
        )
        result = match_one(make_student(), scholarship)

        assert result is not None
        assert result.verification_source_url == "https://example.org/official-source"
        assert result.last_verified_at == date(2026, 6, 21)


class TestClosingSoon:
    def test_deadline_within_30_days_sets_closing_soon(self):
        student = make_student()
        scholarship = make_scholarship(deadline="2026-07-01")
        result = match_one(student, scholarship)

        assert result is not None
        assert result.closing_soon is True
        assert "Closing soon (within 30 days)" in result.match_reasons

    def test_deadline_beyond_30_days_does_not_set_closing_soon(self):
        student = make_student()
        scholarship = make_scholarship(deadline="2026-09-30")
        result = match_one(student, scholarship)

        assert result is not None
        assert result.closing_soon is False

    def test_deadline_does_not_affect_match_score(self):
        student = make_student()
        near_deadline = make_scholarship(
            id="near-deadline",
            deadline="2026-07-01",
            eligibility={"fields_of_study": ["engineering"]},
        )
        far_deadline = make_scholarship(
            id="far-deadline",
            deadline="2026-12-31",
            eligibility={"fields_of_study": ["engineering"]},
        )
        near_result = match_one(student, near_deadline)
        far_result = match_one(student, far_deadline)

        assert near_result is not None
        assert far_result is not None
        assert near_result.score == far_result.score


class TestGpaExclusion:
    def test_student_below_numeric_min_gpa_is_excluded(self):
        student = make_student(gpa=3.0)
        scholarship = make_scholarship(eligibility={"min_gpa": 3.5})
        results = match_scholarships(student, [scholarship], today=FIXED_TODAY)
        assert results == []


class TestDeadlineExclusion:
    def test_past_iso_deadline_excludes_scholarship(self):
        student = make_student()
        scholarship = make_scholarship(deadline="2020-01-01")
        results = match_scholarships(student, [scholarship], today=FIXED_TODAY)
        assert results == []


class TestPartialMatch:
    def test_partial_overlap_returns_lower_score(self):
        student = make_student(
            intended_majors=["literature"],
            demographic_tags=["african_american"],
        )
        scholarship = make_scholarship()
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.field_of_study == 0.0
        assert result.score_breakdown.demographics == pytest.approx(25.0)
        assert "No field of study overlap" in result.match_reasons
        assert "Demographic match: african_american" in result.match_reasons


class TestActivitiesScoring:
    def test_activity_keyword_in_description_adds_points(self):
        student = make_student(activities=["robotics club"])
        scholarship = make_scholarship(
            description="Award for students passionate about robotics and engineering.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.activities == pytest.approx(5.0)
        assert any("robotics" in reason for reason in result.match_reasons)

    def test_activities_bonus_is_capped(self):
        student = make_student(activities=["robotics", "debate", "chess"])
        scholarship = make_scholarship(
            description="We reward excellence in robotics, debate, and chess.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.activities == pytest.approx(10.0)

    def test_no_activity_overlap_scores_zero(self):
        student = make_student(activities=["swimming"])
        scholarship = make_scholarship(
            description="A test scholarship for unit tests.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.activities == pytest.approx(0.0)

    def test_structural_words_do_not_match(self):
        # "club" and "team" are stopwords and must not score on their own.
        student = make_student(activities=["chess club", "track team"])
        scholarship = make_scholarship(
            description="Our club and team value dedication.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.activities == pytest.approx(0.0)


class TestFinancialNeedScoring:
    def test_need_based_description_rewards_high_need(self):
        student = make_student(financial_need_level="high")
        scholarship = make_scholarship(
            description="A need-based scholarship for students with financial need.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.financial_need == pytest.approx(10.0)
        assert "Need-based award matches your high financial need" in result.match_reasons

    def test_need_based_medium_need_gets_partial(self):
        student = make_student(financial_need_level="medium")
        scholarship = make_scholarship(
            description="A need based award for low-income students.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.financial_need == pytest.approx(5.0)

    def test_low_need_student_gets_no_need_points(self):
        student = make_student(financial_need_level="low")
        scholarship = make_scholarship(
            description="A need-based scholarship for students with financial need.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.financial_need == pytest.approx(0.0)

    def test_non_need_based_scholarship_scores_zero(self):
        student = make_student(financial_need_level="high")
        scholarship = make_scholarship(
            description="A merit scholarship recognizing academic achievement.",
            eligibility={"fields_of_study": [], "demographics": []},
        )
        result = match_one(student, scholarship)

        assert result is not None
        assert result.score_breakdown.financial_need == pytest.approx(0.0)


class TestVerifyPlaceholders:
    def test_verify_min_gpa_does_not_exclude(self):
        student = make_student(gpa=2.0)
        scholarship = make_scholarship(eligibility={"min_gpa": "VERIFY"})
        result = match_one(student, scholarship)

        assert result is not None
        assert "GPA requirement not yet verified" in result.match_reasons

    def test_null_min_gpa_does_not_exclude(self):
        student = make_student(gpa=2.0)
        scholarship = make_scholarship(eligibility={"min_gpa": None})
        result = match_one(student, scholarship)

        assert result is not None
        assert "GPA requirement not yet verified" in result.match_reasons

    def test_verify_deadline_does_not_exclude(self):
        student = make_student()
        scholarship = make_scholarship(deadline="VERIFY")
        result = match_one(student, scholarship)

        assert result is not None
        assert result.closing_soon is False
        assert "Deadline not yet verified" in result.match_reasons

    def test_verify_deadline_with_extra_text_does_not_exclude(self):
        student = make_student()
        scholarship = make_scholarship(deadline="VERIFY (PSAT/NMSQT qualifying year)")
        result = match_one(student, scholarship)

        assert result is not None
        assert "Deadline not yet verified" in result.match_reasons

    def test_rolling_deadline_does_not_exclude(self):
        student = make_student()
        scholarship = make_scholarship(deadline="rolling")
        result = match_one(student, scholarship)

        assert result is not None
        assert result.closing_soon is False
        assert "Rolling deadline (no fixed cutoff)" in result.match_reasons


class TestUnverifiedScholarshipsStillMatch:
    def test_unverified_scholarship_is_included_in_results(self):
        student = make_student()
        scholarship = make_scholarship(verified=False)
        result = match_one(student, scholarship)

        assert result is not None
        assert result.verified is False

    def test_verified_flag_is_carried_in_result(self):
        student = make_student()
        scholarship = make_scholarship(verified=True)
        result = match_one(student, scholarship)

        assert result is not None
        assert result.verified is True


class TestEstimatedDeadline:
    def test_estimate_flows_through_and_never_excludes(self):
        student = make_student()
        # Deadline unknown, but an estimate that is already in the past: the
        # scholarship must NOT be excluded, and the estimate is carried through.
        scholarship = make_scholarship(deadline="VERIFY", estimated_deadline="2000-01-01")
        result = match_one(student, scholarship)

        assert result is not None
        assert result.estimated_deadline == "2000-01-01"

    def test_confirmed_past_deadline_still_excludes_despite_estimate(self):
        student = make_student()
        scholarship = make_scholarship(deadline="2020-01-01", estimated_deadline="2027-01-01")
        results = match_scholarships(student, [scholarship], today=FIXED_TODAY)

        assert results == []

    def test_estimate_does_not_set_closing_soon(self):
        student = make_student()
        # An estimate within 30 days must not raise a closing-soon badge.
        soon = (FIXED_TODAY).isoformat()
        scholarship = make_scholarship(deadline="VERIFY", estimated_deadline=soon)
        result = match_one(student, scholarship)

        assert result is not None
        assert result.closing_soon is False


class TestDataLoader:
    def test_loader_parses_scholarships_array(self):
        from app.data.loader import load_scholarships

        scholarships = load_scholarships()
        assert len(scholarships) >= 15
        assert all(scholarship.id for scholarship in scholarships)
