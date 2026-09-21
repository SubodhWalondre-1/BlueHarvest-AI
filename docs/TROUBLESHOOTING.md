# BlueHarvest AI - Diagnostics & Troubleshooting Guide

## Common Operational Issues

### 1. Camera Access Denied in Browser
- **Symptom**: "Webcam stream unavailable" warning on capture tab.
- **Resolution**: Ensure site is served over HTTPS or `http://localhost`. Grant browser video permissions.

### 2. CUDA Out of Memory
- **Symptom**: `RuntimeError: CUDA out of memory` during large image batch inference.
- **Resolution**: Reduce input batch size or configure `FALLBACK_TO_CPU=true` in `.env`.
### 3. Database Migration Lock
- **Symptom**: Alembic hangs on `alembic upgrade head`.
- **Resolution**: Check active database transactions: `SELECT * FROM pg_stat_activity;`
