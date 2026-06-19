"""Account endpoints: signup, login, logout, and current user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import SESSION_USER_KEY, get_current_user
from app.auth.security import hash_password, verify_password
from app.db.database import get_db
from app.db.models import User
from app.models.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    SignupRequest,
    UserResponse,
)
from app.rate_limit import rate_limiter

router = APIRouter(prefix="/auth", tags=["auth"])

_signup_limit = rate_limiter(10, 60, "signup")
_login_limit = rate_limiter(20, 60, "login")
_password_limit = rate_limiter(10, 60, "password")


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.post(
    "/signup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_signup_limit)],
)
def signup(request: Request, body: SignupRequest, db: Session = Depends(get_db)) -> User:
    email = _normalize_email(body.email)

    existing = db.query(User).filter(User.email == email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An account with that email already exists. Try logging in."},
        )

    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "An account with that email already exists. Try logging in."},
        ) from None
    db.refresh(user)

    request.session[SESSION_USER_KEY] = user.id
    return user


@router.post("/login", response_model=UserResponse, dependencies=[Depends(_login_limit)])
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)) -> User:
    email = _normalize_email(body.email)
    user = db.query(User).filter(User.email == email).first()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Email or password is incorrect."},
        )

    request.session[SESSION_USER_KEY] = user.id
    return user


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(request: Request) -> dict[str, bool]:
    request.session.pop(SESSION_USER_KEY, None)
    return {"ok": True}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.post("/change-password", dependencies=[Depends(_password_limit)])
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Your current password is incorrect."},
        )
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.post("/delete-account")
def delete_account(
    request: Request,
    body: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "Password is incorrect."},
        )
    db.delete(user)
    db.commit()
    request.session.pop(SESSION_USER_KEY, None)
    return {"ok": True}
