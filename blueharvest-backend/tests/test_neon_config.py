import pytest
from app.core.config import Settings


def test_neon_uri_normalization():
    # Test standard Neon cloud pooled connection URI
    s1 = Settings(
        database_url="postgresql://user:pass@ep-shiny-pond-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
        secret_key="a" * 32,
    )
    assert s1.normalized_database_url.startswith("postgresql+psycopg2://")
    assert "neon.tech" in s1.normalized_database_url
    assert "sslmode=require" in s1.normalized_database_url

    # Test postgres:// short scheme from Neon
    s2 = Settings(
        database_url="postgres://user:pass@ep-shiny-pond-123456.us-east-2.aws.neon.tech/neondb?sslmode=require",
        secret_key="a" * 32,
    )
    assert s2.normalized_database_url.startswith("postgresql+psycopg2://")
    assert "neondb" in s2.normalized_database_url

    # Test standard SQLite remains unchanged
    s3 = Settings(
        database_url="sqlite:///./data/blueharvest.db",
        secret_key="a" * 32,
    )
    assert s3.normalized_database_url == "sqlite:///./data/blueharvest.db"
