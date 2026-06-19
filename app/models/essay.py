from pydantic import BaseModel, Field

from app.models.student import StudentProfile


class EssayAdviceRequest(BaseModel):
    """Request body for tailored essay guidance."""

    student: StudentProfile
    scholarship_id: str = Field(min_length=1)


class EssayAdviceResponse(BaseModel):
    """Generated essay guidance for one student and scholarship pair."""

    scholarship_id: str
    scholarship_name: str
    advice: str


# Caps the draft size so a single review stays within a predictable token budget.
DRAFT_MAX_LENGTH = 8000


class EssayReviewRequest(BaseModel):
    """Request body for feedback on a student's actual essay draft."""

    student: StudentProfile
    scholarship_id: str = Field(min_length=1)
    draft: str = Field(min_length=1, max_length=DRAFT_MAX_LENGTH)


class EssayReviewResponse(BaseModel):
    """Generated feedback on one student's draft for one scholarship."""

    scholarship_id: str
    scholarship_name: str
    feedback: str
