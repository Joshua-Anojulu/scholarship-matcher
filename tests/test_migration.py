"""Verify the in-place migration that backfills the tracker columns on an older
saved_scholarships table (created before status/notes existed)."""

import os
import tempfile

from sqlalchemy import create_engine, inspect, text

from app.db.database import _ensure_saved_columns


def test_ensure_saved_columns_adds_missing_columns_and_backfills():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        engine = create_engine("sqlite:///" + path.replace("\\", "/"))
        # Recreate the pre-tracker schema, with one existing row.
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE saved_scholarships ("
                    "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, "
                    "scholarship_id VARCHAR(128) NOT NULL, created_at DATETIME)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO saved_scholarships (user_id, scholarship_id, created_at) "
                    "VALUES (1, 'coca-cola-scholars', '2026-01-01 00:00:00')"
                )
            )

        _ensure_saved_columns(engine)

        columns = {col["name"] for col in inspect(engine).get_columns("saved_scholarships")}
        assert "status" in columns
        assert "notes" in columns

        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT status, notes FROM saved_scholarships")
            ).first()
        assert row.status == "interested"
        assert row.notes == ""

        # Running again must be a no-op (idempotent), not an error.
        _ensure_saved_columns(engine)
        engine.dispose()
    finally:
        os.remove(path)


def test_ensure_saved_columns_uses_existing_connection_transaction():
    """Alembic supplies a Connection that already has an open transaction."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        engine = create_engine("sqlite:///" + path.replace("\\", "/"))
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE TABLE saved_scholarships ("
                    "id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, "
                    "scholarship_id VARCHAR(128) NOT NULL, created_at DATETIME)"
                )
            )
            _ensure_saved_columns(conn)

            columns = {col["name"] for col in inspect(conn).get_columns("saved_scholarships")}
            assert {"status", "notes"}.issubset(columns)
        engine.dispose()
    finally:
        os.remove(path)
