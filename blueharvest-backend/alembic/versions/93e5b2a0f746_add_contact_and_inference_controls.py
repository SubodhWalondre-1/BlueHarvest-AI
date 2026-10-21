"""Add verified contact changes and shared inference resource reservations.

Revision ID: 93e5b2a0f746
Revises: 82c4a1d9e635
"""
from alembic import op
import sqlalchemy as sa


revision = "93e5b2a0f746"
down_revision = "82c4a1d9e635"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_verified", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("uploaded_images", sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False))
    op.add_column("uploaded_images", sa.Column("cleanup_pending", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_uploaded_images_cleanup_pending", "uploaded_images", ["cleanup_pending"])
    op.create_table(
        "contact_change_challenges",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("destination", sa.String(254), nullable=False),
        sa.Column("new_value", sa.String(254)),
        sa.Column("previous_value", sa.String(254)),
        sa.Column("credential_hash", sa.String(64), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_contact_change_challenges_user_id", "contact_change_challenges", ["user_id"])
    op.create_table("inference_capacity", sa.Column("id", sa.Integer(), primary_key=True))
    op.create_table(
        "inference_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(64), unique=True, nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_inference_jobs_user_id", "inference_jobs", ["user_id"])
    op.create_index("ix_inference_jobs_expires_at", "inference_jobs", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_inference_jobs_expires_at", table_name="inference_jobs")
    op.drop_index("ix_inference_jobs_user_id", table_name="inference_jobs")
    op.drop_table("inference_jobs")
    op.drop_table("inference_capacity")
    op.drop_index("ix_contact_change_challenges_user_id", table_name="contact_change_challenges")
    op.drop_table("contact_change_challenges")
    op.drop_index("ix_uploaded_images_cleanup_pending", table_name="uploaded_images")
    op.drop_column("uploaded_images", "cleanup_pending")
    op.drop_column("uploaded_images", "size_bytes")
    op.drop_column("users", "phone_verified")
