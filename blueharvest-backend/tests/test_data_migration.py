import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from app.db.base import Base
from app.models.user import User, UserSettings
from app.models.count_session import CountSession
from scripts.migrate_render_to_neon import migrate_data, get_table_counts


def test_migration_copies_data_with_foreign_keys_intact(tmp_path):
    src_db = str(tmp_path / "src.db")
    tgt_db = str(tmp_path / "tgt.db")
    src_url = f"sqlite:///{src_db}"
    tgt_url = f"sqlite:///{tgt_db}"

    src_engine = create_engine(src_url)
    Base.metadata.create_all(bind=src_engine)

    # Insert sample data into source
    with src_engine.connect() as conn:
        from sqlalchemy.orm import Session
        with Session(bind=conn) as session:
            u = User(
                id="test-user-id-1",
                username="aquafarmer",
                full_name="Aqua Farmer",
                email="farmer@example.com",
                display_role="Aquafarm Operator",
                pond_location="Pond 1",
            )
            settings = UserSettings(user_id=u.id)
            u.settings = settings
            session.add(u)
            session.flush()

            cs = CountSession(
                id="test-count-1",
                batch_code="BATCH-001",
                user_id=u.id,
                status="completed",
                count=450,
                pond_location="Pond A",
            )
            session.add(cs)
            session.commit()

    # Target DB
    tgt_engine = create_engine(tgt_url)
    Base.metadata.create_all(bind=tgt_engine)

    # Verify target is initially empty
    init_counts = get_table_counts(tgt_engine)
    assert init_counts["users"] == 0
    assert init_counts["count_sessions"] == 0

    # Run migration
    success = migrate_data(src_url, tgt_url, dry_run=False)
    assert success is True

    # Verify target now has matching records
    tgt_counts = get_table_counts(tgt_engine)
    assert tgt_counts["users"] == 1
    assert tgt_counts["user_settings"] == 1
    assert tgt_counts["count_sessions"] == 1
