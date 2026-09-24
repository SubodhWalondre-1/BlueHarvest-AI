from datetime import datetime, timezone


def utcnow_naive() -> datetime:
    """Return UTC for SQLite DateTime columns, which don't preserve tzinfo."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
