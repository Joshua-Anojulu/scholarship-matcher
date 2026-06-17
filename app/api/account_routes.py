"""Endpoints for a logged-in user's saved profile and saved scholarships."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.db.database import get_db
from app.db.models import SavedScholarship, User, UserProfile
from app.models.auth import (
    ProfileResponse,
    SavedListResponse,
    SavedScholarshipItem,
)
from app.models.scholarship import Scholarship
from app.models.student import StudentProfile

router = APIRouter(prefix="/account", tags=["account"])


def _scholarship_index(request: Request) -> dict[str, Scholarship]:
    scholarships: list[Scholarship] = request.app.state.scholarships
    return {s.id: s for s in scholarships}


@router.get("/profile", response_model=ProfileResponse)
def get_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    record = db.get(UserProfile, user.id)
    if record is None:
        return ProfileResponse(profile=None, updated_at=None)
    return ProfileResponse(
        profile=StudentProfile.model_validate(record.data),
        updated_at=record.updated_at,
    )


@router.put("/profile", response_model=ProfileResponse)
def save_profile(
    profile: StudentProfile,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    data = profile.model_dump()
    record = db.get(UserProfile, user.id)
    if record is None:
        record = UserProfile(user_id=user.id, data=data)
        db.add(record)
    else:
        record.data = data
    db.commit()
    db.refresh(record)
    return ProfileResponse(
        profile=StudentProfile.model_validate(record.data),
        updated_at=record.updated_at,
    )


@router.get("/saved", response_model=SavedListResponse)
def list_saved(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedListResponse:
    index = _scholarship_index(request)
    rows = (
        db.query(SavedScholarship)
        .filter(SavedScholarship.user_id == user.id)
        .order_by(SavedScholarship.created_at.desc())
        .all()
    )
    items = [
        SavedScholarshipItem(
            scholarship_id=row.scholarship_id,
            saved_at=row.created_at,
            scholarship=index.get(row.scholarship_id),
        )
        for row in rows
    ]
    return SavedListResponse(saved=items)


@router.post(
    "/saved/{scholarship_id}",
    response_model=SavedScholarshipItem,
    status_code=status.HTTP_201_CREATED,
)
def save_scholarship(
    scholarship_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedScholarshipItem:
    index = _scholarship_index(request)
    scholarship = index.get(scholarship_id)
    if scholarship is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "That scholarship was not found in the current dataset."},
        )

    existing = (
        db.query(SavedScholarship)
        .filter(
            SavedScholarship.user_id == user.id,
            SavedScholarship.scholarship_id == scholarship_id,
        )
        .first()
    )
    if existing is not None:
        return SavedScholarshipItem(
            scholarship_id=existing.scholarship_id,
            saved_at=existing.created_at,
            scholarship=scholarship,
        )

    row = SavedScholarship(user_id=user.id, scholarship_id=scholarship_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return SavedScholarshipItem(
        scholarship_id=row.scholarship_id,
        saved_at=row.created_at,
        scholarship=scholarship,
    )


@router.delete("/saved/{scholarship_id}", status_code=status.HTTP_200_OK)
def unsave_scholarship(
    scholarship_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    row = (
        db.query(SavedScholarship)
        .filter(
            SavedScholarship.user_id == user.id,
            SavedScholarship.scholarship_id == scholarship_id,
        )
        .first()
    )
    if row is not None:
        db.delete(row)
        db.commit()
    return {"ok": True}
