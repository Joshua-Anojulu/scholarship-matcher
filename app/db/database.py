"""Database engine and session setup.

Uses SQLite for local development and Postgres in production. The target is
chosen from the DATABASE_URL environment variable. When it is unset, a local
SQLite file is created in the project directory.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parent.parent.parent / "scholarships4u.db"


def _resolve_database_url() -> str:
    """Read DATABASE_URL and normalize it for SQLAlchemy with psycopg3.

    Render and some hosts hand out URLs that start with postgres:// or
    postgresql://. SQLAlchemy needs an explicit driver, so we route those to
    the psycopg (v3) driver. When DATABASE_URL is unset we fall back to a local
    SQLite file so the app runs with no configuration.
    """

    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{DEFAULT_SQLITE_PATH}"

    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


DATABASE_URL = _resolve_database_url()

_engine_kwargs: dict = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    # SQLite needs this flag because FastAPI may use the connection across threads.
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""


def init_db() -> None:
    """Create tables that do not exist yet.

    This is enough for a small project. A schema migration tool (for example
    Alembic) would be the next step if the models change over time.
    """

    from app.db import models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a database session per request."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
