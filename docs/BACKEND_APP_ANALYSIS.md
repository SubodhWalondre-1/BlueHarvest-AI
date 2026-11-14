# BlueHarvest Backend (`app/`) Comprehensive Architecture & Logic Analysis

## 1. Executive Summary & Purpose

The `blueharvest-backend/app` package contains the entire core backend application for **BlueHarvest AI**, an aquaculture intelligence platform designed for live and batch fish/shrimp spawn counting, hatchery ledger management, and inventory analytics.

### Why This Architecture Was Built
In commercial aquaculture (fish hatcheries and shrimp nurseries), manual fry counting is prone to human error, fatigue, and fraud. BlueHarvest AI replaces manual sampling with an authenticated computer vision pipeline using a specialized deep-learning model (P2PNet). To operate safely in production, the backend addresses five critical engineering challenges:
1. **Zero-Synthetic Inference Integrity**: Aquaculture operations rely on exact data for sales and pond stocking. The backend guarantees that all counts originate exclusively from the authenticated Modal-hosted P2PNet vision model—no fabricated or synthetic numbers are ever generated.
2. **Hardened Multi-Tenant Auth & Route Protection**: Protects hatchery data using short-lived Bearer JWTs, HttpOnly/SameSite cross-site refresh cookies, mandatory email OTP verification on signup, and cryptographic CSRF preflight protection.
3. **Defense-in-Depth Resource & DoS Protection**: Prevents server exhaustion and API abuse through database-backed atomic sliding-window rate limiting, concurrent inference admission locks, upload pixel/byte budgets, and storage quotas.
4. **Private, Multi-Provider Media Storage**: Ensures hatchery photographs are securely stored either in local persistent disk or authenticated Cloudinary storage, accessible only by the verified asset owner with byte-range streaming support.
5. **Operational Resilience & Telemetry**: Employs dual-mode verification for Google OAuth, middleware-level CORS preservation on 500 crashes, Sentry error monitoring with strict PII scrubbing, and full SQLite/PostgreSQL cross-compatibility.

---

## 2. Directory Tree & Module Map

```
blueharvest-backend/app/
├── __init__.py
├── main.py                        # Application entrypoint, lifespan, CORS & error middleware
├── api/                           # HTTP delivery layer
│   ├── __init__.py
│   ├── deps.py                    # Shared FastAPI dependencies (Auth, CSRF)
│   └── routes/                    # Domain API route handlers
│       ├── __init__.py
│       ├── auth.py                # Signup, login, OAuth, OTP verification & password recovery
│       ├── count_sessions.py      # Spawn count ledger CRUD & save workflow
│       ├── dashboard.py           # Aggregated hatchery analytics & pond breakdowns
│       ├── diagnostics.py         # System health, DB, storage & model readiness probes
│       ├── image_processing.py    # Image upload, validation & Modal P2PNet inference
│       ├── notifications.py       # In-app notifications & read receipts
│       └── users.py               # User profiles, UI preferences & staged contact changes
├── core/                          # Foundation utilities & security primitives
│   ├── __init__.py
│   ├── config.py                  # Pydantic Settings, environment & CORS origin parsing
│   ├── security.py                # Argon2 hashing, JWT tokens & HMAC OTP digests
│   └── time.py                    # Cross-database UTC naive timestamp normalization
├── db/                            # Persistence configuration & session lifecycle
│   ├── __init__.py
│   ├── base.py                    # SQLAlchemy DeclarativeBase
│   └── session.py                 # Engine pooling, SQLite/PostgreSQL connection management
├── models/                        # SQLAlchemy database entity models
│   ├── __init__.py                # Export registry for Alembic discovery
│   ├── auth.py                    # AuthSession, PasswordResetChallenge, EmailVerificationChallenge
│   ├── contact_change.py          # ContactChangeChallenge for phone/email modifications
│   ├── count_session.py           # CountSession spawn records & inference metadata
│   ├── inference_job.py           # InferenceCapacity concurrency lock & InferenceJob reservations
│   ├── notification.py            # User notification entries
│   ├── rate_limit.py              # Database-backed rate limit buckets
│   ├── uploaded_image.py          # Uploaded image catalog & storage provider tracking
│   └── user.py                    # User account entity & UserSettings preferences
├── schemas/                       # Pydantic request/response validation schemas
│   ├── __init__.py
│   ├── auth.py                    # Auth requests, credentials, OTP & token contracts
│   ├── count.py                   # Count session save/update & inference response contracts
│   └── user.py                    # Profile updates, contact changes & phone normalization
└── services/                      # Encapsulated business domain services
    ├── __init__.py
    ├── auth_service.py            # User creation, credential authentication & session issuance
    ├── contact_change_service.py  # Staged email/phone updates with password re-auth
    ├── counting_service.py        # Modal P2PNet HTTP adapter, payload builder & parser
    ├── demo_service.py            # Sample demo fixtures & isolated tenant sandboxes
    ├── email_service.py           # SMTP TLS email delivery for verification & recovery
    ├── google_auth_service.py     # Resilient Google ID token verification (local + tokeninfo)
    ├── image_validation.py        # Pillow-based byte validation, format checks & pixel budgets
    ├── inference_resource_service.py # Concurrency admission, quotas, cleanup & preview TTL
    ├── rate_limit_service.py      # Database atomic UPSERT rate limiter (IP & account scopes)
    ├── sms_service.py             # Twilio SMS delivery for mobile OTPs
    └── storage_service.py         # Local filesystem & Cloudinary Authenticated asset storage
```

---

## 3. Detailed Logic & Analysis of Each Folder

### 3.1 Application Entrypoint (`app/main.py`)

#### Purpose & Logic
`app/main.py` serves as the root application bootstrap. It configures the FastAPI instance, orchestrates global lifespan events, registers error and CORS middleware in the correct sequence, and mounts all domain routers.

#### Key Implementations:
1. **Lifespan Context Manager (`lifespan`)**:
   - Manages application startup and shutdown deterministically.
   - Logs effective CORS allowed origins at startup for operational visibility without leaking credentials.
   - Instantiates a shared `httpx.AsyncClient` with connection pooling (`max_connections=100`, `max_keepalive_connections=20`) attached to `app.state.http_client` to avoid connection exhaustion during upstream inference calls.
   - Triggers startup maintenance tasks: ensures upload directories exist, invokes `secure_legacy_images` to migrate any unauthenticated legacy Cloudinary assets to authenticated storage, and cleans up expired inference reservations.
   - Seeds isolated demo data when `demo_mode_enabled` is active.
2. **Two-Tier Middleware Architecture**:
   - **Outermost Layer: `CORSMiddleware`**: Configured with explicit `allow_origins`, `allow_credentials=True`, allowed HTTP methods, allowed headers (`Authorization`, `Content-Type`, `X-CSRF-Protection`), exposed header `Retry-After`, and `max_age=600`. Being outermost ensures all browser preflight `OPTIONS` requests are answered before reaching application routes or auth checks.
   - **Inner Layer: `ServerErrorCatcherMiddleware`**: Catches unhandled 500 exceptions inside the application. Because Starlette by default returns plain 500 responses outside custom middleware, uncaught exceptions would otherwise lose CORS headers and surface as confusing browser CORS errors. This middleware catches unexpected exceptions, logs them, captures them to Sentry, and returns a clean `500` JSON response *with* CORS headers intact.
3. **Telemetry & Sentry Scrubbing**:
   - Initializes Sentry only when `sentry_dsn` is provided and the environment is not `test` or `pytest`.
   - `_scrub_sentry_event` scrubs sensitive fields (`authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `password`, `credential`, `otp`, `file`) and filters out intentional client errors (HTTP < 500 or 503 feature-disabled states) to eliminate false alarm noise.

---

### 3.2 Core Foundation (`app/core/`)

#### Purpose & Logic
The `core` directory centralizes runtime configuration, cryptographic security mechanisms, and cross-platform date-time consistency.

#### Component Breakdown:
* **`config.py` (Settings & Environment Management)**:
  - Inherits from Pydantic's `BaseSettings` reading from `.env`.
  - Strict validator (`validate_environment_and_cors`):
    - Parses and normalizes `CORS_ORIGINS` (strips trailing slashes, trims whitespace, rejects wildcard `*` when credentials are used, validates scheme/host/port).
    - Enforces fail-fast production rules: rejects empty origins, enforces `SECRET_KEY` length >= 32 characters without default placeholder keywords, validates `COOKIE_SAMESITE`, and mandates `COOKIE_SECURE=True` whenever `COOKIE_SAMESITE=none`.
    - Normalizes `database_url` to translate legacy `postgres://` or `postgresql://` into SQLAlchemy-compatible `postgresql+psycopg2://`.
* **`security.py` (Cryptographic Primitives)**:
  - **Argon2id Hashing**: Uses `argon2.PasswordHasher` for memory-hard, GPU-resistant password hashing.
  - **JWT Bearer Tokens**: Signs short-lived access tokens (default 15 minutes) with HMAC-SHA256 (`HS256`) embedding `sub` (user ID), `sid` (session ID), and `exp`.
  - **Opaque Refresh Tokens**: Generates 48-byte URL-safe cryptographic tokens stored on disk/database strictly as SHA-256 digests (`digest_token`).
  - **Salted HMAC-SHA256 OTPs**: Hashes 6-digit numeric OTPs via `digest_otp(destination, code)` combining `settings.secret_key` and the recipient destination. This prevents attackers with read-only database access from pre-computing the entire 1,000,000 code space via rainbow tables.
* **`time.py` (Time Normalization)**:
  - Exposes `utcnow_naive()` returning UTC `datetime` objects stripped of `tzinfo`. SQLite does not preserve timezone offsets; this utility enforces uniform UTC representation across both SQLite and PostgreSQL.

---

### 3.3 Database Layer (`app/db/`)

#### Purpose & Logic
Provides declarative base models and manages database connection pooling and session lifecycles.

#### Component Breakdown:
* **`base.py`**: Defines the modern SQLAlchemy 2.0 `DeclarativeBase`.
* **`session.py`**:
  - Automatically initializes directory parents if using local SQLite database files.
  - For PostgreSQL, configures production-grade connection pooling: `pool_size=20`, `max_overflow=30`, `pool_recycle=1800` (recycles connections before Render/cloud firewalls drop idle sockets), `pool_timeout=30`, and `pool_pre_ping=True` (detects stale connections).
  - Exposes `SessionLocal` and the FastAPI dependency generator `get_db()` ensuring all request sessions are safely closed via `finally`.

---

### 3.4 Data Models (`app/models/`)

#### Purpose & Logic
Defines relational schemas mapping business entities to database tables using SQLAlchemy 2.0 type-annotated mapped columns (`Mapped[...]`).

#### Key Models:
1. **`user.py` (`User`, `UserSettings`)**:
   - `User`: Primary identity table containing username, email, phone, Argon2 password hash, optional Google OAuth `google_sub`, display role, pond location, active/demo flags, and verification flags (`email_verified`, `phone_verified`).
   - `UserSettings`: 1-to-1 relationship storing UI preferences: `notifications_enabled`, `language`, and `theme`.
2. **`auth.py` (`AuthSession`, `PasswordResetChallenge`, `EmailVerificationChallenge`)**:
   - `AuthSession`: Manages active sessions linking user IDs to SHA-256 hashed refresh tokens with expiration and explicit revocation (`revoked_at`).
   - `PasswordResetChallenge`: Manages password reset OTPs with expiration, attempt counters (max 5 attempts), and transient `reset_token_hash`.
   - `EmailVerificationChallenge`: Tracks email verification OTPs required at signup before a user is permitted into the application.
3. **`contact_change.py` (`ContactChangeChallenge`)**:
   - Implements zero-trust staged contact updates. Holds proposed email/phone modifications, verified password hashes, and OTP codes until verified by the destination channel.
4. **`count_session.py` (`CountSession`)**:
   - The central ledger of spawn counts. Stores `batch_code` (e.g., `BAT-261114-AB12CD`), `count`, `confidence`, `avg_length_mm`, `density`, `source` (Uploaded/Camera), `container`, `pond_location`, `image_path`, `heatmap_path`, `is_saved`, and `inference_verified`.
5. **`inference_job.py` (`InferenceCapacity`, `InferenceJob`)**:
   - Implements distributed resource reservation. `InferenceCapacity` acts as a database row lock; `InferenceJob` tracks in-flight inference tasks with file sizes and timeouts to enforce strict concurrency and quota limits.
6. **`notification.py` (`Notification`)**:
   - In-app notification queue for account alerts, quota notices, and report completions.
7. **`rate_limit.py` (`RateLimitBucket`)**:
   - High-throughput sliding-window rate limit store using atomic DB UPSERTs on hashed scope+identity keys.
8. **`uploaded_image.py` (`UploadedImage`)**:
   - Metadata catalog for stored image files, associating each file with its owner, MIME type, size, storage provider (`local` vs `cloudinary`), and asset ID.

---

### 3.5 API Validation Schemas (`app/schemas/`)

#### Purpose & Logic
Implements Pydantic v2 schemas providing strict input sanitization, data normalization, and serialization contracts.

#### Component Breakdown:
* **`auth.py`**:
  - `SignupRequest`: Validates username regex (`^[A-Za-z0-9_.-]+$`), email format, phone normalization, and password length (>= 8).
  - `SignupVerifyRequest` & `SignupResendRequest`: Validates 6-digit numeric OTP format and normalizes emails to lowercase.
  - `LoginRequest` & `GoogleLoginRequest`: Validates credentials and Google JWT ID token string bounds.
  - `PasswordResetRequest`, `PasswordResetVerify`, `PasswordResetConfirm`: Three-stage recovery contracts.
* **`count.py`**:
  - `CountSessionSave` & `CountSessionUpdate`: Strict models (`extra="forbid"`) preventing client tampering with verified count figures.
  - `InferenceResultResponse`: Output model returning verified fish count, image path, processing time, and confidence.
* **`user.py`**:
  - Contains `normalize_phone` validator stripping whitespace, dashes, and parens, enforcing E.164 international phone formats (e.g. `+919876543210`).
  - `ContactChangeRequest` & `ContactChangeConfirm`: Validates password re-authentication and destination targets.
  - `SettingsUpdate`: Validates theme, language, and notification toggles.

---

### 3.6 API Routes & Delivery Layer (`app/api/`)

#### Purpose & Logic
Implements RESTful HTTP controllers, maps URLs, applies rate limits, and coordinates service executions.

#### Key Modules:
* **`deps.py` (Dependencies)**:
  - `get_current_user`: Parses `Authorization: Bearer <token>`, verifies JWT signature and expiry, checks database session table (`AuthSession`) to ensure session has not been revoked or expired, and confirms the user account is active.
  - `require_cookie_csrf`: Enforces that any request using cookie authentication (`/api/auth/refresh`, `/api/auth/logout`) arrives from an origin in `settings.allowed_origins` and carries the custom header `X-CSRF-Protection: 1`. Because custom headers trigger browser CORS preflights, cross-site attackers cannot forge cookie requests.
* **`routes/auth.py` (Authentication Lifecycle)**:
  - `POST /api/auth/signup`: Registers a user in an unverified state, generates a 6-digit OTP, stores an `EmailVerificationChallenge`, sends the email via SMTP, and returns `verification_required: true`.
  - `POST /api/auth/signup/verify`: Validates the signup OTP, marks `user.email_verified = True`, and issues session tokens and cookies.
  - `POST /api/auth/signup/resend`: Rate-limited endpoint with a 30-second cooldown to re-issue verification OTPs.
  - `POST /api/auth/login`: Authenticates username/email and password. Blocks unverified accounts with HTTP 403 `email_not_verified`. Intercepts demo credentials to spawn isolated demo sessions.
  - `POST /api/auth/google`: Accepts a Google Identity Services JWT, verifies its signature and claims, matches or provisions a local user, and issues a session.
  - `POST /api/auth/refresh`: Rotates the refresh token stored in the HttpOnly cookie, revokes the old session, and issues a new access token and refresh cookie.
  - `POST /api/auth/logout`: Revokes the session in the database and clears the refresh cookie.
  - `POST /api/auth/password-reset/*`: Secure multi-step account recovery via email or SMS.
* **`routes/count_sessions.py` (Spawn Ledger)**:
  - `GET /api/count-sessions`: Lists count history with pagination (`limit`, `offset`), filtering by saved/unsaved, verified/unverified, and demo data.
  - `POST /api/count-sessions`: Saves a verified inference session to the permanent ledger.
  - `PATCH /api/count-sessions/{id}/save`: Toggles save state; prevents saving unverified legacy records or demo fixtures as real counts.
  - `DELETE /api/count-sessions/{id}`: Deletes a count record and triggers asynchronous cleanup of its backing image files.
* **`routes/image_processing.py` (Inference Pipeline)**:
  - `POST /api/image-processing`: The primary entrypoint for fish spawn counting. Enforces rate limits, validates image bytes via Pillow, reserves system capacity, uploads the image to private storage, transmits the file to Modal P2PNet, records the verified count in `CountSession`, and returns the exact count.
  - `GET /api/uploads/{filename}`: Authenticated endpoint serving private images. Validates filename regex, confirms user ownership, and streams image data from local disk or Cloudinary Authenticated storage with HTTP Range support.
  - `GET /api/model/health`: Authenticated upstream health check probing the Modal P2PNet service.
* **`routes/dashboard.py` (Analytics)**:
  - `GET /api/dashboard/summary`: Computes total fish counted, total sessions, and location breakdowns over configurable windows (`today`, `this_week`, `7_days`, `30_days`, `this_month`, `all_time`), isolating demo data.
* **`routes/users.py` & `notifications.py` & `diagnostics.py`**:
  - Handles profile editing, staged contact verification, in-app notifications, and system health checks (`/api/diagnostics`).

---

### 3.7 Business Services Layer (`app/services/`)

#### Purpose & Logic
Encapsulates domain business logic away from the HTTP transport layer, ensuring code is testable, decoupled, and reusable.

#### Component Breakdown:
* **`auth_service.py`**:
  - Handles user creation and Argon2 verification.
  - `issue_session`: Atomically creates `AuthSession` in the database and sets the HttpOnly, Secure, SameSite refresh cookie while returning the Bearer access token.
* **`counting_service.py`**:
  - Upstream client adapter for the Modal-hosted P2PNet model.
  - Formats payloads as `multipart`, `base64_json`, or `raw`.
  - Injects `Modal-Key` and `Modal-Secret` headers.
  - Parses upstream responses searching for legitimate count keys (`final_fish_count`, `count`, etc.). Strict validation rejects non-integer, negative, or infinite values. **Guarantees no synthetic counts are ever returned.**
* **`google_auth_service.py`**:
  - Implements resilient ID token verification.
  - **Primary**: Local cryptographic validation via `google-auth` + `requests`.
  - **Fallback**: If `google-auth` or its optional dependencies are unavailable, automatically falls back to querying Google's official HTTPS endpoint (`https://oauth2.googleapis.com/tokeninfo`) using `httpx`.
* **`image_validation.py`**:
  - Validates image uploads using PIL/Pillow.
  - Performs magic bytes verification (`image.verify()`) to prevent polyglot file attacks.
  - Whitelists allowed formats (`JPEG`, `PNG`, `WEBP`, `BMP`, `TIFF`).
  - Enforces a 60,000,000 pixel budget to prevent decompression bomb (zip-bomb) memory exhaustion.
* **`inference_resource_service.py`**:
  - Concurrency & Quota Governor.
  - Uses `lock_capacity(db)` to serialize admissions across multiple Uvicorn workers.
  - Enforces global concurrency (`inference_max_concurrent=4`) and per-user concurrency (`inference_user_max_concurrent=1`).
  - Enforces per-user image storage quotas (`upload_user_quota_mb=256MB`) and daily inference limits (`inference_daily_limit=100`).
  - Cleans up abandoned or expired inference jobs and temporary previews older than 24 hours.
* **`rate_limit_service.py`**:
  - Database-backed sliding window rate limiter.
  - Uses atomic database UPSERTs (`ON CONFLICT DO UPDATE`) on `RateLimitBucket`.
  - Supports dual-budget rate limiting: IP-level budgets and Account-level budgets.
  - Calculates exact `Retry-After` seconds upon rate limit exhaustion and emits standard HTTP 429 headers.
* **`storage_service.py`**:
  - Multi-provider private image storage abstraction.
  - **Local Storage**: Saves images to `data/uploads/` with UUID-based filenames and path-traversal prevention.
  - **Cloudinary Storage**: Uses Cloudinary's `authenticated` delivery type (assets are private and inaccessible without signed requests). Implements chunked streaming and byte-range downloads.
  - **Migration & Healing**: `secure_legacy_images` automatically detects and promotes any older public uploads to authenticated private storage.
* **`contact_change_service.py`**:
  - Implements two-phase contact changes (email/phone). Requires the user to enter their current password, generates an OTP challenge to the *new* contact destination, and commits the change only after successful verification.
* **`email_service.py` & `sms_service.py`**:
  - Provides SMTP (TLS) and Twilio SMS transport for OTP delivery, with automatic mock fallbacks in development/test environments.
* **`demo_service.py`**:
  - Generates demo fixtures tagged with `is_demo=True`. When a demo user signs in, it clones an isolated, ephemeral workspace so test users never mutate or view production hatchery ledgers.

---

## 4. Key Design Decisions & Why They Were Made

| Design Area | Implementation Choice | Rationale & Why |
| :--- | :--- | :--- |
| **Inference Integrity** | Strict upstream parsing; zero synthetic fallback | Hatcheries make commercial packaging and pricing decisions based on counts. Returning synthetic numbers or silent fallback guesses damages farmer trust. |
| **Authentication** | Bearer JWT + HttpOnly Cookie Refresh | Storing refresh tokens in HttpOnly, Secure, SameSite cookies protects long-term sessions against XSS theft, while short-lived in-memory access tokens protect API requests. |
| **CSRF Defense** | Custom header `X-CSRF-Protection: 1` + Origin check | Modern cross-site requests require preflight when custom headers are present. This eliminates classic cookie-replay CSRF attacks without requiring synchronizer token storage. |
| **Error Handling** | `ServerErrorCatcherMiddleware` inside CORS boundary | When an unhandled exception occurs in Python, Starlette's default 500 response bypasses CORS headers, causing browsers to report misleading CORS errors instead of 500. This middleware guarantees CORS headers accompany 500 errors. |
| **Rate Limiting** | DB-backed atomic UPSERTs | In distributed or multi-worker deployments (e.g., Render with multiple Uvicorn workers), in-memory rate limiters fail because each process has isolated state. A database-backed bucket ensures global rate limit enforcement. |
| **Image Privacy** | Authenticated gateway route (`/api/uploads/{filename}`) | Hatchery pond photos are proprietary business data. Images are never served from a public CDN URL; all image fetches require Bearer token validation and ownership verification. |
| **Google Auth** | In-process JWT verification with HTTPS tokeninfo fallback | Ensures Google sign-in functions immediately even if local C-libraries or `google-auth` dependencies fail in container environments. |

---

## 5. Summary & Verification

The `app/` folder represents a robust, production-hardened FastAPI architecture. Every module is strictly separated by responsibility:
- **`core/`** establishes security policies and environment safety.
- **`db/`** and **`models/`** guarantee relational integrity and state tracking.
- **`schemas/`** validates data boundaries.
- **`services/`** encapsulates critical business logic, rate limits, and third-party integrations.
- **`api/`** safely exposes authenticated endpoints to the frontend.

All code is thoroughly covered by 264 backend automated tests, ensuring high test coverage, strict type safety, zero synthetic inference leaks, and comprehensive protection against common web vulnerabilities.
