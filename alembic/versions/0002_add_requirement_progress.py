"""Persist application-checklist progress for saved scholarships.

Revision ID: 0002_add_requirement_progress
Revises: 0001_initial_schema
Create Date: 2026-06-21
"""

import sqlalchemy as sa
from alembic import op


revision = "0002_add_requirement_progress"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add checklist progress for existing trackers without losing saved items."""
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("saved_scholarships")}
    # Revision 0001 creates tables from the current metadata for clean installs,
    # so the column can already exist on a fresh database.
    if "completed_requirement_ids" in columns:
        return
    op.add_column(
        "saved_scholarships",
        sa.Column("completed_requirement_ids", sa.JSON(), nullable=True),
    )
    op.execute("UPDATE saved_scholarships SET completed_requirement_ids = '[]' ")
    op.alter_column(
        "saved_scholarships",
        "completed_requirement_ids",
        nullable=False,
        server_default=sa.text("'[]'"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("saved_scholarships")}
    if "completed_requirement_ids" in columns:
        op.drop_column("saved_scholarships", "completed_requirement_ids")
