"""Models for the elite summer-programs feature.

A SummerProgram reuses the scholarship building blocks (Eligibility,
ApplicationRequirement, VerificationMetadata) and adds the facts that matter for
a program rather than an award: cost, selectivity, format, location, and run
dates. The same VERIFY discipline applies: an unconfirmed field stays "VERIFY"
rather than being guessed.
"""

from __future__ import annotations

from datetime import date
from typing import Literal, Union

from pydantic import BaseModel, Field, HttpUrl

from app.models.scholarship import (
    ApplicationRequirement,
    Eligibility,
    VerificationMetadata,
)

CostCategory = Literal["free", "stipend", "paid", "VERIFY"]
ProgramFormat = Literal["residential", "commuter", "virtual", "hybrid", "VERIFY"]


class SummerProgram(BaseModel):
    """A curated, verified elite summer program (a college-application enhancer)."""

    id: str
    name: str
    host: str = Field(description="Hosting institution or organization.")
    subject: str = Field(description="Short subject label, e.g. 'STEM research'.")
    url: HttpUrl
    cost: str = Field(
        default="VERIFY",
        description='Human-readable cost, e.g. "Free" or "Tuition-based; aid available".',
    )
    cost_category: CostCategory = Field(
        default="VERIFY",
        description="free, stipend (the program pays the student), paid, or VERIFY.",
    )
    selectivity: str = Field(
        default="VERIFY",
        description='Human-readable selectivity, e.g. "Highly competitive".',
    )
    program_format: ProgramFormat = "VERIFY"
    location: str = "VERIFY"
    program_dates: str = Field(
        default="VERIFY",
        description="When the program runs, distinct from the application deadline.",
    )
    deadline: Union[str, Literal["rolling"]] = Field(
        default="VERIFY",
        description='Application deadline: ISO date (YYYY-MM-DD), "rolling", or "VERIFY".',
    )
    estimated_deadline: str | None = Field(
        default=None,
        description="Approximate ISO deadline from a prior cycle; informational only.",
    )
    eligibility: Eligibility
    description: str
    application_requirements: list[ApplicationRequirement] = Field(default_factory=list)
    verified: bool = False
    verification: VerificationMetadata | None = None


class ProgramScoreBreakdown(BaseModel):
    """Per-component contributions to a program's fit score (all additive)."""

    subject: float = 0.0
    demographics: float = 0.0
    financial_access: float = 0.0
    total: float = 0.0


class ProgramMatchResult(BaseModel):
    """A summer program scored for one student, with transparent reasons."""

    program_id: str
    name: str
    host: str
    subject: str
    cost: str
    cost_category: CostCategory
    selectivity: str
    program_format: ProgramFormat
    location: str
    program_dates: str
    deadline: str
    estimated_deadline: str | None
    url: str
    verified: bool
    verification_source_url: str | None
    last_verified_at: date | None
    essay_required: bool
    score: float
    match_tier: str
    match_reasons: list[str]
    score_breakdown: ProgramScoreBreakdown
    application_requirements: list[ApplicationRequirement] = Field(default_factory=list)
