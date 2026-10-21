from datetime import timedelta
import hashlib
import hmac
from ipaddress import IPv6Address, ip_address
from math import ceil

from fastapi import HTTPException, Request
from sqlalchemy import case, delete, or_, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.time import utcnow_naive
from app.models import RateLimitBucket


def client_ip(request: Request) -> str:
    # Uvicorn resolves forwarded addresses only for configured trusted proxies.
    try:
        address = ip_address(request.client.host if request.client else "")
    except ValueError:
        return "unknown"
    if isinstance(address, IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped
    return str(address)


def _bucket_key(scope: str, identity: str) -> str:
    return hmac.new(
        settings.secret_key.encode("utf-8"), f"{scope}:{identity}".encode("utf-8"), hashlib.sha256,
    ).hexdigest()


def enforce_rate_limit(
    db: Session, request: Request, scope: str, *, ip_limit: int | None, window_seconds: int,
    account: str | None = None, account_limit: int | None = None, commit: bool = True,
) -> None:
    """Reserve shared request budgets before performing any business writes."""
    now = utcnow_naive()
    expires_at = now + timedelta(seconds=window_seconds)
    budgets = [] if ip_limit is None else [(f"{scope}:ip", client_ip(request), ip_limit)]
    if account is not None and account_limit is not None:
        budgets.append((f"{scope}:account", account, account_limit))

    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
    db.execute(delete(RateLimitBucket).where(RateLimitBucket.expires_at <= now))
    for budget_scope, identity, limit in budgets:
        key = _bucket_key(budget_scope, identity)
        expired = RateLimitBucket.expires_at <= now
        statement = insert(RateLimitBucket).values(key=key, request_count=1, expires_at=expires_at)
        statement = statement.on_conflict_do_update(
            index_elements=[RateLimitBucket.key],
            set_={
                "request_count": case((expired, 1), else_=RateLimitBucket.request_count + 1),
                "expires_at": case((expired, expires_at), else_=RateLimitBucket.expires_at),
            },
            where=or_(expired, RateLimitBucket.request_count < limit),
        ).returning(RateLimitBucket.expires_at)
        if db.scalar(statement) is None:
            deadline = db.scalar(select(RateLimitBucket.expires_at).where(RateLimitBucket.key == key))
            db.commit()
            retry_after = max(1, ceil((deadline - now).total_seconds()))
            raise HTTPException(
                status_code=429,
                detail={"code": "rate_limited", "message": f"Too many requests. Try again in {retry_after} seconds.", "retry_after": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
    if commit:
        db.commit()


def clear_account_limit(db: Session, scope: str, account: str) -> None:
    db.execute(delete(RateLimitBucket).where(RateLimitBucket.key == _bucket_key(f"{scope}:account", account)))
    db.commit()
