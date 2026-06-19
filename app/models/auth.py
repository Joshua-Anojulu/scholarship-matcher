"""Request and response schemas for accounts and saved data."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

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


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime


class ProfileResponse(BaseModel):
    """A saved profile, or null when the user has not saved one yet."""

    profile: StudentProfile | None = None
    updated_at: datetime | None = None


SavedStatus = Literal["interested", "drafting", "submitted", "awarded", "rejected"]


class SavedScholarshipItem(BaseModel):
    scholarship_id: str
    saved_at: datetime
    status: SavedStatus = "interested"
    notes: str = ""
    scholarship: Scholarship | None = Field(
        default=None,
        description="Full scholarship record, or null if it left the dataset.",
    )


class SavedUpdateRequest(BaseModel):
    """Patch the tracker fields on a saved scholarship. Omitted fields are unchanged."""

    status: Optional[SavedStatus] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class SavedListResponse(BaseModel):
    saved: list[SavedScholarshipItem]
