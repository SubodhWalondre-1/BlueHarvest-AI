"""Distinguish backend inference results from unverified legacy records.

Revision ID: 82c4a1d9e635
Revises: 7b30c2e1a942
"""
from alembic import op
import sqlalchemy as sa


revision = "82c4a1d9e635"
down_revision = "7b30c2e1a942"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing client-submitted metrics cannot establish inference provenance.
    op.add_column("count_sessions", sa.Column("inference_verified", sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column("count_sessions", "inference_verified")
