# BlueHarvest AI Production Deployment Guide

This guide details the production deployment architecture, security policies, CORS configuration, and environment variables for the BlueHarvest AI stack.

## Architecture Overview

- **Frontend:** Single-page application built with React + Vite, hosted on **Netlify** (`https://blueharvest-ai.netlify.app`).
- **Backend:** FastAPI service with PostgreSQL database, hosted on **Render** (`https://blueharvest-api.onrender.com`).
- **Inference Engine:** Modal-hosted P2PNet deep learning service for live fish fry spawn counting.
- **Cross-Site Authentication:** Dual-token security architecture:
  - Short-lived Bearer access tokens held in memory/sessionStorage.
  - Long-lived HttpOnly refresh-token cookies with `SameSite=None; Secure; Path=/api/auth`.
  - Anti-CSRF protection header `X-CSRF-Protection: 1` required for refresh and logout operations.

---

## Production Environment Variables

### Backend (Render Web Service)

Configure these environment variables in your Render Dashboard (**Settings > Environment**):

| Variable | Value / Format | Purpose |
| :--- | :--- | :--- |
| `APP_ENV` | `production` | Enables production security checks, disables test/demo bypasses. |
| `CORS_ORIGINS` | `https://blueharvest-ai.netlify.app` | Exact allowed frontend origin(s), comma-separated. No wildcards, credentials, or trailing slashes. |
| `COOKIE_SECURE` | `true` | Requires HTTPS for all auth cookies. |
| `COOKIE_SAMESITE` | `none` | Allows credentialed cross-site requests between Netlify and Render. |
| `DATABASE_URL` | Auto-populated by Render | PostgreSQL connection string. |
| `SECRET_KEY` | At least 32 random characters | Signs JWT access tokens and hashes session tokens. |
| `GOOGLE_CLIENT_ID` | `537540751411-...apps.googleusercontent.com` | Google OAuth Client ID for identity verification. |
| `SENTRY_DSN` | *(Optional)* Sentry project DSN | Production exception monitoring and telemetry. |
| `MODAL_ENABLED` | `true` | Enables live P2PNet model inference. |
| `MODAL_BASE_URL` | Modal service endpoint URL | P2PNet inference server URL. |

> [!IMPORTANT]
> - In production (`APP_ENV=production`), the backend validates `CORS_ORIGINS` at startup and **fails fast** if the variable is omitted, empty, contains wildcards (`*`), or includes paths.
> - The backend also refuses to start if `COOKIE_SAMESITE=none` is combined with `COOKIE_SECURE=false`.

### Frontend (Netlify Build Environment)

Configure these build variables in your Netlify Dashboard (**Site configuration > Environment variables**) or via `netlify.toml`:

| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://blueharvest-api.onrender.com` | Base URL of the deployed FastAPI backend. |
| `VITE_GOOGLE_CLIENT_ID` | `537540751411-...apps.googleusercontent.com` | Public Google OAuth Web Client ID for Identity Services. |

---

## CORS & Preflight Specification

The FastAPI backend uses `CORSMiddleware` configured as the outermost application layer:

- **Allowed Origins:** Driven by `CORS_ORIGINS` (exact origin matching).
- **Allowed Methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
- **Allowed Headers:** `Authorization`, `Content-Type`, `X-CSRF-Protection`.
- **Exposed Headers:** `Retry-After`.
- **Credentials:** `allow_credentials=True`.
- **Max Age:** `600` seconds (10 minutes) for preflight caching.
- **Safety Net:** Unhandled server exceptions (HTTP 500) are caught inside the CORS boundary and returned with valid CORS headers to prevent deceptive browser CORS blocks.

---

## Production Verification Commands

Test the deployed backend endpoint from your terminal using `curl`:

### 1. Preflight OPTIONS Verification (Allowed Origin)
```bash
curl -i -X OPTIONS https://blueharvest-api.onrender.com/api/auth/refresh \
  -H "Origin: https://blueharvest-ai.netlify.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: x-csrf-protection,content-type"
```
**Expected Response:**
- HTTP status `200 OK`
- `access-control-allow-origin: https://blueharvest-ai.netlify.app`
- `access-control-allow-credentials: true`
- `access-control-allow-headers: authorization, content-type, x-csrf-protection` (case-insensitive)
- `access-control-max-age: 600`

### 2. Disallowed Origin Rejection (Negative Test)
```bash
curl -i -X OPTIONS https://blueharvest-api.onrender.com/api/auth/refresh \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST"
```
**Expected Response:**
- No `access-control-allow-origin` header returned.

### 3. API Health & Diagnostics
```bash
curl -s https://blueharvest-api.onrender.com/api/diagnostics | jq .
```
