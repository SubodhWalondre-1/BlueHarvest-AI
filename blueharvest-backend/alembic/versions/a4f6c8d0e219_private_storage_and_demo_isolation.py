"""Track durable private images and isolate demo visitors.

Revision ID: a4f6c8d0e219
Revises: 93e5b2a0f746
"""
from alembic import op
import sqlalchemy as sa


revision = "a4f6c8d0e219"
down_revision = "93e5b2a0f746"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("uploaded_images", sa.Column("storage_provider", sa.String(24), server_default="local", nullable=False))
    op.add_column("uploaded_images", sa.Column("storage_asset_id", sa.String(128)))
    op.add_column("inference_jobs", sa.Column("storage_provider", sa.String(24), server_default="local", nullable=False))
    op.add_column("users", sa.Column("is_demo", sa.Boolean(), server_default=sa.false(), nullable=False))
    images = sa.table("uploaded_images", sa.column("filename", sa.String(64)),
                      sa.column("user_id", sa.String(36)), sa.column("storage_provider", sa.String(24)))
    counts = sa.table("count_sessions", sa.column("image_path", sa.Text()), sa.column("user_id", sa.String(36)))
    remote_path = "https://res.cloudinary.com/%/image/upload/%blueharvest/uploads/" + sa.func.substr(images.c.filename, 1, 32, type_=sa.String()) + ".%"
    owned_remote = sa.exists(sa.select(1).where(counts.c.user_id == images.c.user_id, counts.c.image_path.like(remote_path)))
    op.execute(images.update().where(owned_remote).values(storage_provider="cloudinary_legacy"))
    filename = sa.select(images.c.filename).where(
        images.c.user_id == counts.c.user_id, images.c.storage_provider == "cloudinary_legacy",
        counts.c.image_path.like(remote_path),
    ).correlate(counts).limit(1).scalar_subquery()
    op.execute(counts.update().where(filename.is_not(None)).values(image_path="/api/uploads/" + filename))
    # Revoke sessions that could still access the old shared demo workspace.
    op.execute(sa.text("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id IN "
                       "(SELECT id FROM users WHERE username = 'samarth_aquafarm' AND email = 'demo@blueharvest.local')"))


def downgrade() -> None:
    op.drop_column("users", "is_demo")
    op.drop_column("inference_jobs", "storage_provider")
    op.drop_column("uploaded_images", "storage_asset_id")
    op.drop_column("uploaded_images", "storage_provider")
