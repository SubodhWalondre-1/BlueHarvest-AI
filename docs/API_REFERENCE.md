# BlueHarvest AI - REST API Reference

## Authentication Endpoints
- `POST /api/v1/auth/register`: Create user account with email and password.
- `POST /api/v1/auth/login`: Authenticate credentials, return access & refresh tokens.
- `POST /api/v1/auth/google`: Authenticate via Google OAuth ID token.
- `POST /api/v1/auth/refresh`: Issue new access token from valid refresh token.
- `POST /api/v1/auth/password-reset/request`: Send password reset verification email.