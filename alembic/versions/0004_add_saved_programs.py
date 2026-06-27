"""Add saved summer-program tracker rows.

Revision ID: 0004_add_saved_programs
Revises: 0003_add_password_reset_tokens
Create Date: 2026-06-27
"""

import sqlalchemy as sa
from alembic import op


revision = "0004_add_saved_programs"
down_revision = "0003_add_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # Revision 0001 creates tables from current metadata for clean installs, so
    # fresh databases can already have this table before 0004 runs.
    if "saved_programs" in inspector.get_table_names():
        return
    op.create_table(
        "saved_programs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("program_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="interested"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("completed_requirement_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "program_id", name="uq_user_program"),
    )
    op.create_index("ix_saved_programs_user_id", "saved_programs", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "saved_programs" in inspector.get_table_names():
        op.drop_table("saved_programs")
