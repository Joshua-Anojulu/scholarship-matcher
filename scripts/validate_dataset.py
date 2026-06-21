"""Audit app/data/scholarships.json for structural and vocabulary issues.

Run:  python scripts/validate_dataset.py

Exits non-zero if any structural errors are found (duplicate ids, unparseable
deadlines, out-of-range GPA). Warnings (such as VERIFY placeholders or tags
outside the canonical vocabulary) are reported but do not fail, because
unverified data is an expected state for this curated seed set.
"""

from __future__ import annotations

import sys
from collections import Counter
from datetime import date
from pathlib import Path

# Allow running as a plain script: python scripts/validate_dataset.py
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.data.loader import load_scholarships  # noqa: E402
from app.matching.matcher import _parse_iso_deadline  # noqa: E402
from app.models.scholarship import Scholarship  # noqa: E402
from app.vocabulary import (  # noqa: E402
    DEMOGRAPHIC_TAG_VALUES,
    FIELD_OF_STUDY_VALUES,
    GRADE_LEVEL_VALUES,
    STATE_CODE_VALUES,
)


def _deadline_ok(deadline: str) -> bool:
    if deadline == "rolling" or deadline.startswith("VERIFY"):
        return True
    return _parse_iso_deadline(deadline) is not None


def audit_dataset(scholarships: list[Scholarship]) -> dict:
    """Return {errors, warnings, stats}. Errors are structural; warnings advisory."""
    errors: list[str] = []
    warnings: list[str] = []

    ids = [s.id for s in scholarships]
    for sid, count in Counter(ids).items():
        if count > 1:
            errors.append(f"Duplicate id: {sid} (appears {count} times)")

    verify_counts: Counter[str] = Counter()
    for s in scholarships:
        if not _deadline_ok(s.deadline):
            errors.append(f"{s.id}: unparseable deadline {s.deadline!r}")
        if s.estimated_deadline is not None and _parse_iso_deadline(s.estimated_deadline) is None:
            errors.append(f"{s.id}: invalid estimated_deadline {s.estimated_deadline!r} (must be an ISO date)")

        elig = s.eligibility
        if isinstance(elig.min_gpa, (int, float)) and not 0.0 <= float(elig.min_gpa) <= 4.0:
            errors.append(f"{s.id}: min_gpa out of range ({elig.min_gpa})")

        for field in elig.fields_of_study:
            if field not in FIELD_OF_STUDY_VALUES:
                warnings.append(f"{s.id}: field_of_study not in vocabulary: {field!r}")
        for tag in elig.demographics:
            if tag not in DEMOGRAPHIC_TAG_VALUES:
                warnings.append(f"{s.id}: demographic not in vocabulary: {tag!r}")
        for grade in elig.grade_levels:
            if grade not in GRADE_LEVEL_VALUES:
                warnings.append(f"{s.id}: grade_level not in vocabulary: {grade!r}")
        if isinstance(elig.states, list):
            for state in elig.states:
                if state.upper() not in STATE_CODE_VALUES:
                    warnings.append(f"{s.id}: state not a valid code: {state!r}")
        for school in elig.eligible_schools:
            aliases = [alias.strip().lower() for alias in school.aliases]
            if len(aliases) != len(set(aliases)):
                warnings.append(f"{s.id}: duplicate aliases for school {school.name!r}")

        if s.verification is not None:
            if (
                s.verification.last_verified_at is not None
                and s.verification.last_verified_at > date.today()
            ):
                errors.append(
                    f"{s.id}: last_verified_at is in the future "
                    f"({s.verification.last_verified_at})"
                )
            if (
                s.verification.provenance_recorded_at is not None
                and s.verification.provenance_recorded_at > date.today()
            ):
                errors.append(
                    f"{s.id}: provenance_recorded_at is in the future "
                    f"({s.verification.provenance_recorded_at})"
                )
            if not s.verified:
                warnings.append(f"{s.id}: has verification metadata but verified is false")

        if elig.min_gpa == "VERIFY":
            verify_counts["min_gpa"] += 1
        if s.deadline.startswith("VERIFY"):
            verify_counts["deadline"] += 1
        if elig.citizenship_requirement == "VERIFY":
            verify_counts["citizenship"] += 1
        if elig.states == "VERIFY":
            verify_counts["states"] += 1

    verified = sum(1 for s in scholarships if s.verified)
    estimated = sum(1 for s in scholarships if s.estimated_deadline)
    with_provenance = sum(1 for s in scholarships if s.verification is not None)
    verified_with_audit_date = sum(
        1
        for s in scholarships
        if s.verified and s.verification is not None and s.verification.last_verified_at is not None
    )
    source_recorded_without_audit = sum(
        1
        for s in scholarships
        if s.verified
        and s.verification is not None
        and s.verification.last_verified_at is None
    )
    stats = {
        "total": len(scholarships),
        "verified": verified,
        "unverified": len(scholarships) - verified,
        "estimated_deadlines": estimated,
        "with_provenance": with_provenance,
        "verified_with_audit_date": verified_with_audit_date,
        "source_recorded_without_audit": source_recorded_without_audit,
        "verified_without_provenance": verified - with_provenance,
        "verify_placeholders": dict(verify_counts),
    }
    return {"errors": errors, "warnings": warnings, "stats": stats}


def main() -> int:
    scholarships = load_scholarships()
    report = audit_dataset(scholarships)
    stats = report["stats"]

    print(f"Scholarships: {stats['total']}")
    print(f"  verified:   {stats['verified']}")
    print(f"  unverified: {stats['unverified']}")
    print(f"  estimated deadlines: {stats['estimated_deadlines']}")
    print(f"  records with official source: {stats['with_provenance']}")
    print(f"  verified records with audit date: {stats['verified_with_audit_date']}")
    print(f"  source recorded without new audit: {stats['source_recorded_without_audit']}")
    print(f"  verified records awaiting source: {stats['verified_without_provenance']}")
    print("VERIFY placeholders:")
    for field, count in sorted(stats["verify_placeholders"].items()):
        print(f"  {field:12} {count}")

    if report["warnings"]:
        print(f"\nWarnings ({len(report['warnings'])}):")
        for warning in report["warnings"][:50]:
            print(f"  - {warning}")
        if len(report["warnings"]) > 50:
            print(f"  ... and {len(report['warnings']) - 50} more")

    if report["errors"]:
        print(f"\nERRORS ({len(report['errors'])}):")
        for error in report["errors"]:
            print(f"  - {error}")
        return 1

    print("\nNo structural errors.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
