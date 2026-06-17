"""Request and response schemas for accounts and saved data."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.scholarship import Scholarship
from app.models.student import StudentProfile

# bcrypt only uses the first 72 bytes, so there is no value in allowing more.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime


class ProfileResponse(BaseModel):
    """A saved profile, or null when the user has not saved one yet."""

    profile: StudentProfile | None = None
    updated_at: datetime | None = None


class SavedScholarshipItem(BaseModel):
    scholarship_id: str
    saved_at: datetime
    scholarship: Scholarship | None = Field(
        default=None,
        description="Full scholarship record, or null if it left the dataset.",
    )


class SavedListResponse(BaseModel):
    saved: list[SavedScholarshipItem]
