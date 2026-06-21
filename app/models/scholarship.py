from datetime import date
from typing import Literal, Union

from pydantic import BaseModel, Field, HttpUrl


class EligibleSchool(BaseModel):
    """A college or university where a scholarship is available.

    ``aliases`` lets a student-entered name such as "UT Austin" match the
    canonical institution name without relying on fuzzy matching.
    """

    name: str = Field(min_length=1)
    aliases: list[str] = Field(default_factory=list)


class VerificationMetadata(BaseModel):
    """Official source plus either an audit date or source-recording date."""

    source_url: HttpUrl
    last_verified_at: date | None = Field(
        default=None,
        description="Date the entry's facts were last independently checked against the source.",
    )
    provenance_recorded_at: date | None = Field(
        default=None,
        description="Date an official source was attached without performing a new fact audit.",
    )
    notes: str | None = Field(default=None, max_length=500)


class Eligibility(BaseModel):
    """Rules used by the matching algorithm to score student fit."""

    min_gpa: Union[float, Literal["VERIFY"], None] = Field(
        default=None,
        description="Minimum GPA requirement, or VERIFY if not yet confirmed.",
    )
    fields_of_study: list[str] = Field(
        default_factory=list,
        description="Intended majors or study areas; empty list means any field.",
    )
    grade_levels: list[str] = Field(
        default_factory=list,
        description='Grade levels such as "high_school_senior", "college_freshman".',
    )
    demographics: list[str] = Field(
        default_factory=list,
        description='Race and ethnicity tags like "african_american", "hispanic_latino", "asian_pacific_islander".',
    )
    states: Union[list[str], Literal["any", "VERIFY"]] = "any"
    essay_required: bool = False
    citizenship_requirement: str = Field(
        default="VERIFY",
        description='Citizenship rule, e.g. "us_citizen", "us_citizen_or_permanent_resident".',
    )
    eligible_schools: list[EligibleSchool] = Field(
        default_factory=list,
        description=(
            "Institutions where this award is available. Empty means the award is not "
            "school-specific."
        ),
    )


class Scholarship(BaseModel):
    """A curated scholarship entry from the seed dataset."""

    id: str
    name: str
    sponsor: str
    award_amount: Union[float, str] = Field(
        description="Dollar amount or descriptive range string.",
    )
    deadline: Union[str, Literal["rolling"]] = Field(
        description='ISO date (YYYY-MM-DD) or "rolling".',
    )
    estimated_deadline: str | None = Field(
        default=None,
        description=(
            "Approximate deadline (ISO date) inferred from the most recent cycle when the "
            "upcoming date is not yet published. Informational only: it is shown as an "
            "estimate and never used to exclude a scholarship or trigger a closing-soon badge."
        ),
    )
    url: HttpUrl
    eligibility: Eligibility
    description: str
    verified: bool = Field(
        default=False,
        description="True once this entry is confirmed against official sources.",
    )
    verification: VerificationMetadata | None = Field(
        default=None,
        description="Official source and date for a verification pass, when recorded.",
    )
