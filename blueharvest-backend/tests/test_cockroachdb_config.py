import pytest
from app.core.config import Settings


def test_cockroachdb_uri_normalization():
    # Test standard CockroachDB cloud URI starting with postgresql://
    s1 = Settings(
        database_url="postgresql://user:pass@blueharvest-1234.gcp-us-central1.cockroachlabs.cloud:26257/blueharvest_dev?sslmode=verify-full",
        secret_key="a" * 32,
    )
    assert s1.normalized_database_url.startswith("postgresql+psycopg2://")
    assert "26257" in s1.normalized_database_url
    assert "sslmode=verify-full" in s1.normalized_database_url

    # Test CockroachDB URI starting with cockroachdb://
    s2 = Settings(
        database_url="cockroachdb://user:pass@blueharvest-1234.gcp-us-central1.cockroachlabs.cloud:26257/blueharvest_prod?sslmode=verify-full",
        secret_key="a" * 32,
    )
    assert s2.normalized_database_url.startswith("postgresql+psycopg2://")
    assert "blueharvest_prod" in s2.normalized_database_url

    # Test standard SQLite remains unchanged
    s3 = Settings(
        database_url="sqlite:///./data/blueharvest.db",
        secret_key="a" * 32,
    )
    assert s3.normalized_database_url == "sqlite:///./data/blueharvest.db"
