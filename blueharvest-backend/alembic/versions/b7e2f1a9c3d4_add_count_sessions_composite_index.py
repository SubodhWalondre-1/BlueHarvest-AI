"""Add composite index on count_sessions for user_id, is_saved, created_at.

Revision ID: b7e2f1a9c3d4
Revises: a4f6c8d0e219
"""
from alembic import op
import sqlalchemy as sa


revision = "b7e2f1a9c3d4"
down_revision = "a4f6c8d0e219"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_count_sessions_user_saved_created",
        "count_sessions",
        ["user_id", "is_saved", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_count_sessions_user_saved_created",
        table_name="count_sessions",
    )
