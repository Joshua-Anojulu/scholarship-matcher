"""Authentication dependencies that read the signed session cookie."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import User

SESSION_USER_KEY = "user_id"


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Return the logged-in user if a valid session exists, else None."""

    user_id = request.session.get(SESSION_USER_KEY)
    if user_id is None:
        return None

    user = db.get(User, user_id)
    if user is None:
        # The session points at a user that no longer exists; clear it.
        request.session.pop(SESSION_USER_KEY, None)
    return user


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    """Require an authenticated user or raise 401."""

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "You need to be logged in to do that."},
        )
    return user
