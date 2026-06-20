from typing import Literal

from pydantic import BaseModel, Field


class ScoreBreakdown(BaseModel):
    """Points contributed by each scored factor (gates are not included)."""

    field_of_study: float = 0.0
    demographics: float = 0.0
    activities: float = 0.0
    financial_need: float = 0.0
    total: float = 0.0


class MatchResult(BaseModel):
    """A ranked scholarship match with transparent scoring."""

    scholarship_id: str
    scholarship_name: str
    sponsor: str
    award_amount: str | float
    deadline: str
    estimated_deadline: str | None = None
    url: str
    verified: bool
    essay_required: bool = Field(
        default=False,
        description="Whether the scholarship requires an essay (used by the no-essay filter).",
    )
    closing_soon: bool = Field(
        default=False,
        description="True when a real parsed deadline falls within 30 days (badge only, not scored).",
    )
    score: float = Field(description="Sum of fit-related score_breakdown components.")
    match_tier: Literal["strong", "possible"] = Field(
        description="Frontend grouping band: strong for high-confidence fits, possible for weaker fits.",
    )
    match_reasons: list[str]
    score_breakdown: ScoreBreakdown
