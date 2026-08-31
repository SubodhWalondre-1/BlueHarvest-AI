# BlueHarvest AI - REST API Reference

## Authentication Endpoints
- `POST /api/v1/auth/register`: Create user account with email and password.
- `POST /api/v1/auth/login`: Authenticate credentials, return access & refresh tokens.
- `POST /api/v1/auth/google`: Authenticate via Google OAuth ID token.
- `POST /api/v1/auth/refresh`: Issue new access token from valid refresh token.
- `POST /api/v1/auth/password-reset/request`: Send password reset verification email.
## Count Sessions & Batch Ledgers
- `POST /api/v1/count-sessions`: Submit image multipart for computer vision inference.
- `GET /api/v1/count-sessions`: Retrieve paginated count batch records with date filters.
- `GET /api/v1/count-sessions/{session_id}`: Fetch detailed batch telemetry and coordinates.
- `DELETE /api/v1/count-sessions/{session_id}`: Soft delete or purge session record.
- `GET /api/v1/dashboard/summary`: Aggregate analytics across interval windows.
