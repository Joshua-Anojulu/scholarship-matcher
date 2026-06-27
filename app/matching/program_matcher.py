"""Transparent matching for elite summer programs.

Mirrors the scholarship matcher's additive, explainable approach and reuses its
field, demographic, citizenship, and deadline helpers so the two stay
consistent. Programs are scored on subject overlap, demographic fit, and a
financial-accessibility signal (a free or stipend program is a strong fit for a
student who indicated financial need). Grade level, GPA, citizenship, and a
passed deadline act as gates only when a real (non-VERIFY) value is present.
"""

from __future__ import annotations

from datetime import date

from app.matching.matcher import (
    _citizenship_satisfies,
    _matching_demographics,
    _matching_fields,
    _parse_iso_deadline,
)
from app.models.program import (
    ProgramMatchResult,
    ProgramScoreBreakdown,
    SummerProgram,
)
from app.models.student import StudentProfile

WEIGHT_SUBJECT = 40.0
WEIGHT_SUBJECT_OPEN = 10.0
WEIGHT_DEMOGRAPHICS = 25.0
WEIGHT_FINANCIAL_ACCESS = 10.0
STRONG_MATCH_THRESHOLD = 35.0


def _match_tier(score: float) -> str:
    return "strong" if score >= STRONG_MATCH_THRESHOLD else "possible"


def _grade_compatible(student_grade: str, program_grades: list[str]) -> bool:
    """Whether a student's grade satisfies a program's accepted grades.

    Exact grades match. A broad program tag such as "high_school" also accepts
    specific student class years, but the reverse is intentionally not true:
    a vague legacy student value should not satisfy a junior-only program.
    """
    for grade in program_grades:
        if grade == student_grade:
            return True
        broad_high_school_program = grade == "high_school" and student_grade.startswith(
            "high_school_"
        )
        if broad_high_school_program:
            return True
    return False


def _evaluate_program(
    student: StudentProfile,
    program: SummerProgram,
    today: date,
) -> ProgramMatchResult | None:
    reasons: list[str] = []
    breakdown = ProgramScoreBreakdown()
    elig = program.eligibility

    # Grade level is a gate when the program states which grades it accepts.
    if elig.grade_levels:
        if not _grade_compatible(student.grade_level, elig.grade_levels):
            return None
        reasons.append(f"Open to your grade level ({student.grade_level})")
    else:
        reasons.append("No specific grade level requirement")

    # GPA gates only on a real numeric floor.
    if isinstance(elig.min_gpa, (int, float)):
        if student.gpa < float(elig.min_gpa):
            return None
        reasons.append(f"Meets GPA requirement (minimum {elig.min_gpa})")

    # Citizenship gates only when known and not satisfied.
    citizenship_result = _citizenship_satisfies(
        student.citizenship, elig.citizenship_requirement
    )
    if citizenship_result is False:
        return None
    if citizenship_result is True:
        if elig.citizenship_requirement == "any":
            reasons.append("Open regardless of citizenship")
        else:
            reasons.append("Meets citizenship requirement")
    else:
        reasons.append("Citizenship requirement not yet verified")

    # A passed deadline excludes only when a real date is published.
    parsed_deadline = _parse_iso_deadline(program.deadline)
    if parsed_deadline is not None and parsed_deadline < today:
        return None

    # Subject overlap is the primary fit signal.
    required_fields = elig.fields_of_study
    matched_fields = _matching_fields(student.intended_majors, required_fields)
    field_mismatch = bool(required_fields) and not matched_fields
    if not required_fields:
        breakdown.subject = WEIGHT_SUBJECT_OPEN
        reasons.append("Open to all subject areas")
    elif matched_fields:
        breakdown.subject = WEIGHT_SUBJECT
        reasons.append("Subject overlap: " + ", ".join(matched_fields))
    else:
        reasons.append("May focus on a different subject area, check eligibility")

    matched_demographics = _matching_demographics(
        student.demographic_tags, elig.demographics
    )
    if elig.demographics and matched_demographics:
        fraction = len(matched_demographics) / len(elig.demographics)
        breakdown.demographics = round(WEIGHT_DEMOGRAPHICS * fraction, 2)
        for tag in matched_demographics:
            reasons.append(f"Demographic match: {tag}")

    # A free or stipend program is a strong practical fit for a student who
    # indicated financial need.
    if program.cost_category in {"free", "stipend"} and student.financial_need_level in {
        "medium",
        "high",
    }:
        breakdown.financial_access = WEIGHT_FINANCIAL_ACCESS
        reasons.append("Low-cost program fits your indicated financial need")

    breakdown.total = round(
        breakdown.subject + breakdown.demographics + breakdown.financial_access, 2
    )
    match_tier = _match_tier(breakdown.total)
    # A subject-mismatched program stays visible but never as a strong match.
    if field_mismatch and match_tier == "strong":
        match_tier = "possible"

    return ProgramMatchResult(
        program_id=program.id,
        name=program.name,
        host=program.host,
        subject=program.subject,
        cost=program.cost,
        cost_category=program.cost_category,
        selectivity=program.selectivity,
        program_format=program.program_format,
        location=program.location,
        program_dates=program.program_dates,
        deadline=program.deadline,
        estimated_deadline=program.estimated_deadline,
        url=str(program.url),
        verified=program.verified,
        verification_source_url=(
            str(program.verification.source_url)
            if program.verification is not None
            else None
        ),
        last_verified_at=(
            program.verification.last_verified_at
            if program.verification is not None
            else None
        ),
        essay_required=program.eligibility.essay_required,
        score=breakdown.total,
        match_tier=match_tier,
        match_reasons=reasons,
        score_breakdown=breakdown,
        application_requirements=program.application_requirements,
    )


def match_programs(
    student: StudentProfile,
    programs: list[SummerProgram],
    *,
    today: date | None = None,
) -> list[ProgramMatchResult]:
    """Return summer programs ranked by transparent additive score (highest first)."""
    reference_date = today or date.today()
    results: list[ProgramMatchResult] = []
    for program in programs:
        match = _evaluate_program(student, program, reference_date)
        if match is not None:
            results.append(match)
    results.sort(key=lambda result: (-result.score, result.name.lower()))
    return results
