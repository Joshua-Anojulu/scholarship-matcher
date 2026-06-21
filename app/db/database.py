"""Database engine and session setup.

Uses SQLite for local development and Postgres in production. The target is
chosen from the DATABASE_URL environment variable. When it is unset, a local
SQLite file is created in the project directory.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DEFAULT_SQLITE_PATH = Path(__file__).resolve().parent.parent.parent / "scholarships4u.db"
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


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
    """Bring the configured database to the latest Alembic revision."""

    config = Config(str(PROJECT_ROOT / "alembic.ini"))
    # Resolve the migration scripts by absolute path so init works regardless of
    # the process's current working directory (alembic.ini's script_location is
    # relative, which only works when launched from the project root).
    config.set_main_option("script_location", str(PROJECT_ROOT / "alembic"))
    config.set_main_option("prepend_sys_path", str(PROJECT_ROOT))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.upgrade(config, "head")


def _ensure_saved_columns(bind: Engine | Connection) -> None:
    """Add the tracker columns (status, notes) to an older saved_scholarships table."""

    inspector = inspect(bind)
    if "saved_scholarships" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("saved_scholarships")}
    statements: list[str] = []
    if "status" not in existing:
        statements.append(
            "ALTER TABLE saved_scholarships "
            "ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'interested'"
        )
    if "notes" not in existing:
        statements.append(
            "ALTER TABLE saved_scholarships ADD COLUMN notes TEXT NOT NULL DEFAULT ''"
        )
    if not statements:
        return
    # Alembic passes an already-transactional Connection; opening another
    # transaction there raises an error. The standalone migration test passes
    # an Engine, which owns the transaction for this small backfill.
    if isinstance(bind, Connection):
        for statement in statements:
            bind.execute(text(statement))
        return
    with bind.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields a database session per request."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
