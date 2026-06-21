"""Create the account and tracker schema, including legacy tracker backfill.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-06-21
"""

from alembic import op

from app.db import models  # noqa: F401  (register ORM models)
from app.db.database import Base, _ensure_saved_columns

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create missing tables and adopt pre-Alembic local databases safely."""
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    _ensure_saved_columns(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
