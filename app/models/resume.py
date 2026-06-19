"""Schema for the resume auto-fill feature.

Every field is optional: resumes vary, and the extracted values pre-fill the form
for the student to review and complete. The endpoint never submits a match on its
own, so a partial profile is the expected, valid result.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class ResumeExtraction(BaseModel):
    """A best-effort student profile pulled from a resume."""

    gpa: Optional[float] = None
    grade_level: Optional[str] = None
    intended_majors: list[str] = Field(default_factory=list)
    demographic_tags: list[str] = Field(default_factory=list)
    state: Optional[str] = None
    citizenship: Optional[str] = None
    financial_need_level: Optional[str] = None
    activities: list[str] = Field(default_factory=list)
    target_schools: list[str] = Field(default_factory=list)


class ResumeExtractionResponse(BaseModel):
    """Extracted profile plus an optional note on what to complete manually."""

    profile: ResumeExtraction
    notes: Optional[str] = None
