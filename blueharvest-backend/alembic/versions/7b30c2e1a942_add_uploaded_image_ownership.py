"""Record server-verified ownership for uploaded images.

Revision ID: 7b30c2e1a942
Revises: 4ac9e78b2d31
"""
from alembic import op
import sqlalchemy as sa


revision = "7b30c2e1a942"
down_revision = "4ac9e78b2d31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Client-supplied ledger paths cannot establish ownership of legacy uploads.
    op.create_table(
        "uploaded_images",
        sa.Column("filename", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_type", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_uploaded_images_user_id", "uploaded_images", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_uploaded_images_user_id", table_name="uploaded_images")
    op.drop_table("uploaded_images")
