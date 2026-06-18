"""Transparent scholarship matching with explicit handling of VERIFY placeholders."""

from __future__ import annotations

from datetime import date

from app.models.match import MatchResult, ScoreBreakdown
from app.models.scholarship import Scholarship
from app.models.student import StudentProfile

WEIGHT_FIELD_OF_STUDY = 40.0
WEIGHT_FIELD_OF_STUDY_OPEN = 10.0
WEIGHT_DEMOGRAPHICS = 25.0
STRONG_MATCH_THRESHOLD = 35.0
CLOSING_SOON_DAYS = 30

_CITIZENSHIP_ALLOWED: dict[str, set[str]] = {
    "us_citizen": {"us_citizen"},
    "permanent_resident": {"permanent_resident"},
    "us_citizen_or_permanent_resident": {"us_citizen", "permanent_resident"},
    "us_citizen_national_or_permanent_resident": {
        "us_citizen",
        "permanent_resident",
        "us_national",
    },
    "us_citizen_permanent_resident_or_daca": {
        "us_citizen",
        "permanent_resident",
        "daca",
    },
    "us_citizen_permanent_resident_or_national": {
        "us_citizen",
        "permanent_resident",
        "us_national",
    },
    "us_citizen_permanent_resident_or_us_national": {
        "us_citizen",
        "permanent_resident",
        "us_national",
    },
}


def _normalize_tag(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("-", "_")


def _parse_iso_deadline(deadline: str) -> date | None:
    if deadline == "rolling":
        return None
    if deadline == "VERIFY" or deadline.startswith("VERIFY"):
        return None
    try:
        return date.fromisoformat(deadline)
    except ValueError:
        return None


def _citizenship_satisfies(student_citizenship: str, requirement: str) -> bool | None:
    """Return True/False when requirement is known, None when unverified."""
    if requirement == "VERIFY":
        return None
    allowed = _CITIZENSHIP_ALLOWED.get(requirement)
    if allowed is None:
        allowed = {_normalize_tag(requirement)}
    return _normalize_tag(student_citizenship) in allowed


def _matching_fields(student_majors: list[str], required_fields: list[str]) -> list[str]:
    if not required_fields:
        return []
    norm_majors = [_normalize_tag(major) for major in student_majors]
    matches: list[str] = []
    for field in required_fields:
        norm_field = _normalize_tag(field)
        for major in norm_majors:
            if norm_field == major or norm_field in major or major in norm_field:
                matches.append(field)
                break
    return matches


def _matching_demographics(student_tags: list[str], required_tags: list[str]) -> list[str]:
    if not required_tags:
        return []
    student_set = {_normalize_tag(tag) for tag in student_tags}
    return [tag for tag in required_tags if _normalize_tag(tag) in student_set]


def _state_matches(student_state: str, states: list[str] | str) -> bool:
    if states == "any" or states == "VERIFY":
        return True
    norm_state = _normalize_tag(student_state)
    return norm_state in {_normalize_tag(state) for state in states}


def _closing_soon(deadline_date: date, today: date) -> bool:
    days_until = (deadline_date - today).days
    return 0 <= days_until <= CLOSING_SOON_DAYS


def _has_upcoming_deadline(deadline: str, today: date) -> bool:
    parsed = _parse_iso_deadline(deadline)
    return parsed is not None and parsed >= today


def _match_tier(score: float) -> str:
    if score >= STRONG_MATCH_THRESHOLD:
        return "strong"
    return "possible"


def _sort_key(result: MatchResult, today: date) -> tuple:
    deadline_priority = 0 if _has_upcoming_deadline(result.deadline, today) else 1
    return (-result.score, deadline_priority, result.scholarship_name.lower())


def _evaluate_scholarship(
    student: StudentProfile,
    scholarship: Scholarship,
    today: date,
) -> MatchResult | None:
    reasons: list[str] = []
    breakdown = ScoreBreakdown()
    closing_soon = False

    # GPA, grade level, and state are gate-only criteria: they can exclude a
    # scholarship but never add ranking points. Fit scoring uses field overlap
    # and demographic overlap only.
    min_gpa = scholarship.eligibility.min_gpa
    if isinstance(min_gpa, (int, float)):
        if student.gpa < float(min_gpa):
            return None
        reasons.append(f"Meets GPA requirement (minimum {min_gpa})")
    else:
        reasons.append("GPA requirement not yet verified")

    grade_levels = scholarship.eligibility.grade_levels
    if grade_levels:
        if student.grade_level not in grade_levels:
            return None
        reasons.append(f"Grade level matches ({student.grade_level})")
    else:
        reasons.append("No specific grade level requirement")

    parsed_deadline = _parse_iso_deadline(scholarship.deadline)
    if parsed_deadline is not None:
        if parsed_deadline < today:
            return None
        closing_soon = _closing_soon(parsed_deadline, today)
        reasons.append(f"Deadline is upcoming ({scholarship.deadline})")
        if closing_soon:
            reasons.append("Closing soon (within 30 days)")
    elif scholarship.deadline == "rolling":
        reasons.append("Rolling deadline (no fixed cutoff)")
    else:
        reasons.append("Deadline not yet verified")

    citizenship_result = _citizenship_satisfies(
        student.citizenship,
        scholarship.eligibility.citizenship_requirement,
    )
    if citizenship_result is False:
        return None
    if citizenship_result is True:
        reasons.append("Meets citizenship requirement")
    else:
        reasons.append("Citizenship requirement not yet verified")

    states = scholarship.eligibility.states
    if not _state_matches(student.state, states):
        return None
    if states == "any":
        reasons.append("Eligible in all states")
    elif states == "VERIFY":
        reasons.append("State eligibility not yet verified (treated as all states)")
    else:
        reasons.append(f"State matches ({student.state})")

    required_fields = scholarship.eligibility.fields_of_study
    matched_fields = _matching_fields(student.intended_majors, required_fields)
    if not required_fields:
        breakdown.field_of_study = WEIGHT_FIELD_OF_STUDY_OPEN
        reasons.append("Open to all fields of study (weaker fit signal, partial score)")
    elif matched_fields:
        breakdown.field_of_study = WEIGHT_FIELD_OF_STUDY
        for field in matched_fields:
            reasons.append(f"Field of study overlap: {field}")
    else:
        reasons.append("No field of study overlap")

    required_demographics = scholarship.eligibility.demographics
    matched_demographics = _matching_demographics(
        student.demographic_tags,
        required_demographics,
    )
    if not required_demographics:
        reasons.append("No specific demographic requirements")
    elif matched_demographics:
        fraction = len(matched_demographics) / len(required_demographics)
        breakdown.demographics = round(WEIGHT_DEMOGRAPHICS * fraction, 2)
        for tag in matched_demographics:
            reasons.append(f"Demographic match: {tag}")
    else:
        reasons.append("No demographic tag overlap")

    breakdown.total = round(
        breakdown.field_of_study + breakdown.demographics,
        2,
    )

    return MatchResult(
        scholarship_id=scholarship.id,
        scholarship_name=scholarship.name,
        sponsor=scholarship.sponsor,
        award_amount=scholarship.award_amount,
        deadline=scholarship.deadline,
        url=str(scholarship.url),
        verified=scholarship.verified,
        essay_required=scholarship.eligibility.essay_required,
        closing_soon=closing_soon,
        score=breakdown.total,
        match_tier=_match_tier(breakdown.total),
        match_reasons=reasons,
        score_breakdown=breakdown,
    )


def match_scholarships(
    student: StudentProfile,
    scholarships: list[Scholarship],
    *,
    today: date | None = None,
) -> list[MatchResult]:
    """Return scholarships ranked by transparent additive score (highest first)."""
    reference_date = today or date.today()
    results: list[MatchResult] = []
    for scholarship in scholarships:
        match = _evaluate_scholarship(student, scholarship, reference_date)
        if match is not None:
            results.append(match)
    results.sort(key=lambda result: _sort_key(result, reference_date))
    return results
