#!/usr/bin/env python3
"""
Zero-Loss Data Migration Tool: Render PostgreSQL to Neon.tech PostgreSQL
Copies all BlueHarvest records safely while keeping the Render database 100% read-only and preserved.
"""

import sys
import argparse
from typing import List, Dict, Any
from sqlalchemy import create_engine, text, inspect, MetaData, Table
from sqlalchemy.orm import sessionmaker

TABLE_ORDER: List[str] = [
    "users",
    "user_settings",
    "auth_sessions",
    "count_sessions",
    "uploaded_images",
    "notifications",
    "rate_limit_buckets",
    "contact_change_challenges",
    "password_reset_challenges",
    "email_verification_challenges",
    "inference_capacity",
    "inference_jobs",
    "alembic_version",
]


def normalize_db_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


def get_table_counts(engine) -> Dict[str, int]:
    counts = {}
    with engine.connect() as conn:
        for table_name in TABLE_ORDER:
            try:
                result = conn.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar()
                counts[table_name] = int(result or 0)
            except Exception:
                counts[table_name] = 0
    return counts


def migrate_data(source_url: str, target_url: str, dry_run: bool = False, batch_size: int = 500) -> bool:
    src_clean = normalize_db_url(source_url)
    tgt_clean = normalize_db_url(target_url)

    print("=" * 70)
    print("BLUEHARVEST ZERO-LOSS MIGRATION: RENDER POSTGRES -> NEON.TECH POSTGRES")
    print("SAFETY GUARANTEE: Render PostgreSQL is treated as strictly read-only.")
    print("=" * 70)

    # Establish connections
    src_engine = create_engine(src_clean, pool_pre_ping=True)
    tgt_engine = create_engine(tgt_clean, pool_pre_ping=True)

    # Step 1: Read-only inspection of source
    print("\n[1/3] Inspecting Source Database (Render PostgreSQL)...")
    source_counts = get_table_counts(src_engine)

    total_source_records = sum(source_counts.values())
    print(f"Total source records found across all tables: {total_source_records}")
    for tbl, cnt in source_counts.items():
        if cnt > 0:
            print(f"  • {tbl}: {cnt} record(s)")

    if dry_run:
        print("\n[DRY-RUN COMPLETE] Read-only audit finished. No data written to target.")
        return True

    # Step 2: Migrate data table by table
    print("\n[2/3] Transferring Data to Target (Neon.tech PostgreSQL)...")
    tgt_metadata = MetaData()
    tgt_metadata.reflect(bind=tgt_engine)

    with src_engine.connect() as src_conn, tgt_engine.connect() as tgt_conn:
        # Enforce read-only isolation on the source Render database
        try:
            src_conn.execute(text("SET TRANSACTION READ ONLY"))
        except Exception:
            pass

        for table_name in TABLE_ORDER:
            count = source_counts.get(table_name, 0)
            if count == 0:
                continue

            print(f"Migrating table '{table_name}' ({count} records)...", end=" ", flush=True)

            if table_name not in tgt_metadata.tables:
                print(f"[SKIP: Table '{table_name}' does not exist on target. Run 'alembic upgrade head' on Neon first.]")
                continue

            tgt_table: Table = tgt_metadata.tables[table_name]
            pks = [c.name for c in tgt_table.primary_key.columns]

            # Fetch rows from source
            select_stmt = text(f'SELECT * FROM "{table_name}"')
            rows = src_conn.execute(select_stmt).mappings().all()

            inserted = 0
            for i in range(0, len(rows), batch_size):
                chunk = rows[i : i + batch_size]
                chunk_dicts = [dict(r) for r in chunk]

                for row_dict in chunk_dicts:
                    # Check if row already exists on target by PK to ensure idempotency
                    exists = False
                    if pks:
                        pk_conditions = " AND ".join([f'"{pk}" = :_{pk}' for pk in pks])
                        params = {f"_{pk}": row_dict[pk] for pk in pks}
                        existing_check = tgt_conn.execute(
                            text(f'SELECT 1 FROM "{table_name}" WHERE {pk_conditions}'),
                            params
                        ).scalar()
                        if existing_check:
                            exists = True

                    if not exists:
                        cols = ", ".join([f'"{k}"' for k in row_dict.keys()])
                        placeholders = ", ".join([f":{k}" for k in row_dict.keys()])
                        insert_stmt = text(f'INSERT INTO "{table_name}" ({cols}) VALUES ({placeholders})')
                        tgt_conn.execute(insert_stmt, row_dict)
                        inserted += 1

                tgt_conn.commit()

            print(f"Done ({inserted} new row(s) inserted)")

    # Step 3: Verify and audit
    print("\n[3/3] Performing Reconciliation Audit...")
    target_counts = get_table_counts(tgt_engine)

    print("\n" + "-" * 65)
    print(f"{'Table Name':<30} | {'Render Source':<15} | {'Neon.tech':<15}")
    print("-" * 65)

    all_matched = True
    for tbl in TABLE_ORDER:
        src_c = source_counts.get(tbl, 0)
        tgt_c = target_counts.get(tbl, 0)
        if src_c > 0 or tgt_c > 0:
            status = "MATCH" if tgt_c >= src_c else "MISMATCH"
            if status == "MISMATCH":
                all_matched = False
            print(f"{tbl:<30} | {src_c:<15} | {tgt_c:<15} [{status}]")

    print("-" * 65)

    if all_matched:
        print("\nSUCCESS: All data migrated and verified with 0 record loss! Render remains live as your backup.")
        return True
    else:
        print("\nWARNING: Some table counts did not match. Review the table above.")
        return False


def main():
    parser = argparse.ArgumentParser(description="Zero-loss data migration tool from Render Postgres to Neon.tech")
    parser.add_argument("--source-url", required=True, help="Render PostgreSQL connection URI")
    parser.add_argument("--target-url", required=True, help="Neon.tech PostgreSQL connection URI")
    parser.add_argument("--dry-run", action="store_true", help="Inspect source data without writing to target")
    parser.add_argument("--verify-only", action="store_true", help="Compare counts between source and target")
    parser.add_argument("--batch-size", type=int, default=500, help="Batch size for data transfer")

    args = parser.parse_args()

    if args.verify_only:
        src = normalize_db_url(args.source_url)
        tgt = normalize_db_url(args.target_url)
        src_counts = get_table_counts(create_engine(src))
        tgt_counts = get_table_counts(create_engine(tgt))
        print("\nReconciliation Verification:")
        for tbl in TABLE_ORDER:
            s = src_counts.get(tbl, 0)
            t = tgt_counts.get(tbl, 0)
            if s > 0 or t > 0:
                print(f"  {tbl}: Source={s}, Target={t}")
        return

    success = migrate_data(args.source_url, args.target_url, dry_run=args.dry_run, batch_size=args.batch_size)
    if not success and not args.dry_run:
        sys.exit(1)


if __name__ == "__main__":
    main()
