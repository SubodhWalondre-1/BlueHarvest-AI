"""Add email verification challenges table.

Revision ID: c8f3e2b1a0d5
Revises: b7e2f1a9c3d4
"""
from alembic import op
import sqlalchemy as sa


revision = "c8f3e2b1a0d5"
down_revision = "b7e2f1a9c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_verification_challenges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_verification_challenges_user_id",
        "email_verification_challenges",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_email_verification_challenges_email",
        "email_verification_challenges",
        ["email"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_verification_challenges_email", table_name="email_verification_challenges")
    op.drop_index("ix_email_verification_challenges_user_id", table_name="email_verification_challenges")
    op.drop_table("email_verification_challenges")
