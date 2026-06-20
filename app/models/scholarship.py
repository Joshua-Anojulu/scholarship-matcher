from typing import Literal, Union

from pydantic import BaseModel, Field, HttpUrl


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
