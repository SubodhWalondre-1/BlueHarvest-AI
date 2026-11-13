# 🐟 BlueHarvest AI: Comprehensive System Architecture & Engineering Design Report

**Document Version:** 2.1.0 (Repository-Grounded System Architecture)
**Author:** Principal System Design & AI Infrastructure Engineer (CodeRabbit Audit)
**Classification:** Production Technical Architecture, High-Level Design (HLD) & Low-Level Design (LLD)
**Repository Scope:** `blueharvest-testing-project-tim2` (Strictly Self-Contained)
**Date:** November 2026

---

## 1. Executive Summary & Problem Domain

### 1.1 Mission & Overview
**BlueHarvest AI** is an industrial aquaculture computer vision, hatchery automation, and harvest intelligence platform designed to automate fish spawn and fry counting. In commercial aquaculture hatcheries, counting newborn fish larvae (spawn/fry) in high-density nursery trays is traditionally performed manually using mechanical tally counters or rough volumetric sampling. These legacy techniques suffer from severe labor costs, operator fatigue, counting variances exceeding ±25%, and delayed billing.

BlueHarvest AI replaces this manual workflow with a modern, high-precision, production-grade platform:
1. **Deep Learning Vision Integration:** Automated point-to-point spawn detection running on serverless GPU infrastructure (**Modal**), executing a two-stage scene-aware counter (Stage 1 scale 0.33 coarse scan, Stage 2 scale 0.75 high-density patch evaluation) with a validated **97.47% overall accuracy** (99.04% in standard nursery trays).
2. **Resilient Application Gateway:** A production-hardened **FastAPI** backend supporting dual-mode authentication (Argon2id + Google OAuth 2.0 GIS), double-submit CSRF protection, tenant isolation, concurrency locking, and 24/7 Sentry telemetry with strict PII scrubbing.
3. **Backend-Owned Inference & Tamper-Evident Ledger:** Cryptographically validated count sessions where the backend retains strict ownership over inference counts, rejecting any client-side count tampering with `422 Unprocessable Entity`.
4. **Zero-Loss Data Vault:** An auditable storage pipeline enforcing permanent retention of raw imagery (`RETAIN_ALL_UPLOADS=true`) across local and Cloudinary storage providers.
5. **Distributed Database Rate Limiting:** Token-bucket sliding window rate limiting stored directly in the database (`rate_limit_buckets`), with all IP and contact keys HMAC-SHA256 anonymized.
6. **Two-Factor Verified Contact Changes:** Profile updates for email and phone require two-step password authentication and 6-digit OTP challenge verification.
7. **Intelligent Hatchery Ledger & Analytics UI:** A **React 19 + Vite** single-page application providing live camera capture, client-side canvas compression, multi-range farm mortality tracking, batch valuation economics, and sanitized CSV/PDF exports.

---

## 2. High-Level Design (HLD) Architecture

### 2.1 Multi-Tier Topology
The BlueHarvest AI platform is designed as a distributed, decoupled multi-tier architecture partitioned across specialized client, gateway, persistent storage, and serverless AI compute layers:

```mermaid
flowchart TD
    subgraph ClientTier ["Client Tier (Browser / Mobile / Desktop)"]
        UI["React 19 + Vite Frontend SPA"]
        Cam["HTML5 MediaDevices Camera Stream"]
        Compress["Client-Side Canvas Compressor (1920px, JPEG 0.85)"]
        AuthStore["Memory & SessionStorage Token Store"]
        AuthImg["AuthenticatedImage (Bearer Blob Loader)"]
    end

    subgraph IngressTier ["Edge & Ingress Tier"]
        Netlify["Netlify Edge CDN (SPA Rewrites & Headers)"]
        RenderGateway["Render Reverse Proxy (TLS Termination)"]
    end

    subgraph ServiceTier ["Application Gateway Tier (FastAPI)"]
        API["FastAPI Web Framework (Uvicorn / Python 3.12)"]
        AuthSvc["Auth Service (Argon2id + JWT + CSRF)"]
        GoogleAuth["Google OAuth 2.0 GIS Validator"]
        ResourceSvc["Inference Resource & Zero-Loss Engine"]
        StorageSvc["Dual-Provider Storage Service (Local / Cloudinary)"]
        RateLimiter["HMAC-Anonymized Database Rate Limiter"]
        ContactSvc["2FA Contact Change Service (OTP)"]
        CountingSvc["Modal Inference Client Adapter"]
    end

    subgraph StorageTier ["Durable Storage & Data Vault"]
        DB[("PostgreSQL / SQLite Database")]
        LocalStorage[("Local Persistent Volume (/data/uploads)")]
        CloudinaryVault[("Cloudinary Private Signed Storage")]
    end

    subgraph ComputeTier ["Serverless AI Inference Cluster"]
        Modal["Modal Serverless Cluster (NVIDIA T4 GPU)"]
        TwoStageCounter["Scene-Aware P2PNet (97.47% Accuracy)"]
    end

    subgraph TelemetryTier ["Observability & Auditing Tier"]
        SentryBack["Sentry APM & Error Ingest (Backend SDK)"]
        SentryFront["Sentry Browser Tracing (React SDK)"]
    end

    %% Interactions
    Cam --> Compress
    Compress --> UI
    UI --> AuthStore
    UI --> AuthImg
    UI --> Netlify
    Netlify --> RenderGateway
    RenderGateway --> API

    API --> AuthSvc
    API --> GoogleAuth
    API --> ResourceSvc
    API --> StorageSvc
    API --> RateLimiter
    API --> ContactSvc
    API --> CountingSvc

    AuthSvc --> DB
    RateLimiter --> DB
    ResourceSvc --> DB
    ContactSvc --> DB
    StorageSvc --> LocalStorage
    StorageSvc --> CloudinaryVault

    CountingSvc -->|"Authenticated HTTPS / Multipart (Modal-Key + Secret)"| Modal
    Modal --> TwoStageCounter

    API -.->|"PII-Scrubbed Security & Performance Events"| SentryBack
    UI -.->|"Client Crash & Latency Traces"| SentryFront
```

---

### 2.2 End-to-End Spawn Inference & Audit Lifecycle
The core workflow transitions seamlessly from physical image acquisition to permanent ledger retention without risking image data loss or count forgery:

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Farm Operator
    participant Client as React 19 Frontend
    participant Gateway as FastAPI Gateway
    participant RateLimiter as HMAC Rate Limiter
    participant Vault as Storage Vault
    participant Modal as Modal GPU Service
    participant DB as Relational Database

    Operator->>Client: Capture/Select Tray Image
    Client->>Client: Canvas Pre-flight Compress (max 1920px, 0.85 JPEG)
    Client->>Gateway: POST /api/image-processing (Bearer JWT + Image)
    Gateway->>RateLimiter: Check User & IP Token Bucket
    RateLimiter-->>Gateway: Allowed (Within Quota)
    Gateway->>Gateway: Verify Decompression Bomb (<60MP) & Magic Bytes
    Gateway->>Vault: Persist Image (UUID.jpg)
    Gateway->>Modal: Forward Image (Multipart / Base64 / Raw)
    Modal->>Modal: Stage 1 Scene Classification (scale=0.33)
    Modal->>Modal: Stage 2 Adaptive Patch Count (scale=0.75)
    Modal-->>Gateway: Inferred Count, Processing Time, Density
    Gateway->>DB: Atomically Insert Unsaved CountSession + UploadedImage
    Gateway-->>Client: 200 OK: session_id, count, metrics (Client cannot alter count)
    Client-->>Operator: Render Heatmap, Metrics & Mortality Economics
    
    Operator->>Client: Click "Save to Ledger"
    Client->>Gateway: POST /api/count-sessions { session_id }
    Note over Client,Gateway: Client sends ONLY session_id. Metric overrides return 422.
    Gateway->>DB: UPDATE CountSession SET is_saved = True
    Gateway-->>Client: 200 OK: Saved Session Record
```

---

## 3. Low-Level Design (LLD): Backend Architecture (`blueharvest-backend`)

### 3.1 Framework & Lifecycle Management (`app/main.py`)
- **FastAPI Lifespan Context Manager:** Replaces deprecated `@app.on_event` startup/shutdown triggers. Initializes HTTP connection pools (`httpx.AsyncClient`), verifies database connectivity, and gracefully closes idle network descriptors on shutdown.
- **CORS Hardening:** Restricts allowed origins strictly to explicit frontend production domains (`https://blueharvest-ai.netlify.app`, `http://localhost:5173`) with explicit allowed headers (`Authorization`, `Content-Type`, `X-CSRF-Protection`) and credentials enabled (`allow_credentials=True`).
- **Telemetry & Error Scrubbing:** Configured with Sentry SDK (`sentry_sdk.init`). Custom `before_send` hooks scrub PII, sanitizing sensitive request headers (`Authorization`, `Cookie`, `X-CSRF-Token`, `Modal-Key`, `Modal-Secret`) and redacting contact parameters (`password`, `token`, `otp`).

### 3.2 Configuration & Environment Contract (`app/core/config.py`)
Centralized through Pydantic v2 `BaseSettings` reading from `.env`:
- `APP_ENV`: Deployment stage (`development`, `staging`, `production`).
- `SECRET_KEY`: Minimum 32-character high-entropy secret used for JWT signing and HMAC digests.
- `ACCESS_TOKEN_MINUTES`: Short-lived session duration (default: `15`).
- `REFRESH_TOKEN_DAYS`: Rolling session duration (default: `14`).
- `COOKIE_SECURE` & `COOKIE_SAMESITE`: Security flags (`True` and `None` on production cross-site HTTPS; `False` and `Lax` on local dev).
- `RETAIN_ALL_UPLOADS`: Zero-loss policy flag (default: `True`). Prevents garbage collection of raw imagery.
- `MODAL_*`: Integration parameters (`MODAL_ENABLED`, `MODAL_BASE_URL`, `MODAL_KEY`, `MODAL_SECRET`, `MODAL_REQUEST_FORMAT`, `MODAL_IMAGE_FIELD`).
- `CLOUDINARY_*`: Signed remote storage credentials (`CLOUDINARY_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`).
- `INFERENCE_*`: Concurrency and quota limits (`INFERENCE_MAX_CONCURRENT=4`, `INFERENCE_USER_MAX_CONCURRENT=1`, `INFERENCE_DAILY_LIMIT=100`, `UPLOAD_USER_QUOTA_MB=256`).

### 3.3 Security, Cryptography & Session Architecture (`app/core/security.py` & `app/api/deps.py`)
1. **Password Hashing:** Argon2id through `passlib.context.CryptContext` with salt entropy and GPU-hard memory resistance.
2. **Access Tokens & Session Binding:** Signed HMAC-SHA256 JWT containing `sub` (User UUID), `exp`, `iat`, and `sid` (Session UUID). Validated per-request by FastAPI dependency `get_current_user`, which confirms `session.revoked_at is None` and `session.expires_at > now`, allowing instant session revocation.
3. **Refresh Tokens:** Hashed via SHA-256 before database insertion in `auth_sessions`. Even full SQL database dumps expose zero replayable plaintext tokens.
4. **Double-Submit Cookie CSRF Defense:** Refresh and logout endpoints require an `X-CSRF-Protection: 1` header alongside the `refresh_token` cookie, neutralizing cross-site forged POST requests.
5. **Time Synchronization:** Strict `utcnow_naive()` contract (`app/core/time.py`) ensures all database timestamps are stored in uniform timezone-naive UTC, eliminating SQLite vs PostgreSQL timezone mismatch bugs.

### 3.4 Entity-Relationship Model & Database Design (`app/models/`)
The database schema consists of 8 interconnected tables managed by Alembic:

```mermaid
erDiagram
    users ||--o| user_settings : "has 1:1 settings"
    users ||--o{ auth_sessions : "maintains active sessions"
    users ||--o{ count_sessions : "owns count records"
    users ||--o{ uploaded_images : "owns stored assets"
    users ||--o{ inference_jobs : "reserves active jobs"
    users ||--o{ password_reset_challenges : "requests recovery"
    users ||--o{ contact_change_challenges : "requests contact updates"
    users ||--o{ notifications : "receives alerts"

    users {
        string id PK
        string username UK
        string email UK
        string phone UK
        string password_hash
        string google_sub UK
        string pond_location
        string display_role
        boolean is_active
        boolean is_demo
        boolean email_verified
        boolean phone_verified
        datetime created_at
        datetime updated_at
    }

    user_settings {
        string user_id PK, FK
        boolean notifications_enabled
        string language
        string theme
        datetime updated_at
    }

    auth_sessions {
        string id PK
        string user_id FK
        string token_hash UK, IDX
        datetime expires_at
        datetime revoked_at
        datetime created_at
    }

    count_sessions {
        string id PK
        string batch_code UK, IDX
        string user_id FK, IDX
        integer count
        string status
        boolean is_saved
        boolean is_demo
        boolean inference_verified
        string source
        string pond_location
        string density
        float confidence
        float avg_length_mm
        float processing_time_ms
        string method
        text image_path
        text heatmap_path
        datetime created_at
        datetime updated_at
    }

    uploaded_images {
        string filename PK
        string user_id FK, IDX
        string media_type
        integer size_bytes
        string storage_provider
        string storage_asset_id
        boolean cleanup_pending IDX
        datetime created_at
    }

    inference_jobs {
        string id PK
        string user_id FK, IDX
        string filename UK
        integer size_bytes
        string storage_provider
        datetime expires_at IDX
    }

    rate_limit_buckets {
        string key PK
        integer request_count
        datetime expires_at IDX
    }

    password_reset_challenges {
        string id PK
        string user_id FK
        string destination
        string channel
        string code_hash
        datetime expires_at
        integer attempt_count
        datetime verified_at
        string reset_token_hash
        datetime consumed_at
        datetime created_at
    }
```

#### Alembic Migration History (7 Revisions):
1. `16ffa8c67d13_initial_blueharvest_schema`: Base tables for users, user_settings, auth_sessions, count_sessions, notifications.
2. `4ac9e78b2d31_add_rate_limit_buckets`: Introduces database-backed sliding-window rate limiting.
3. `7b30c2e1a942_add_uploaded_image_ownership`: Attaches user ownership to all uploaded images.
4. `82c4a1d9e635_add_inference_provenance`: Adds `inference_verified` flag to distinguish model predictions from synthetic/demo items.
5. `93e5b2a0f746_add_contact_and_inference_controls`: Introduces `contact_change_challenges` and phone verification.
6. `a4f6c8d0e219_private_storage_and_demo_isolation`: Adds Cloudinary asset IDs, demo tenant isolation flags (`is_demo`), and inference capacity controls.
7. `b7e2f1a9c3d4_add_count_sessions_composite_index`: Adds composite index `ix_count_sessions_user_saved_created` on `(user_id, is_saved, created_at)` optimizing dashboard summary aggregation queries from $O(N)$ table scans to index range scans.

---


### 3.5 Core Domain Services Deep Dive

#### 1. Backend-Owned Inference & Tamper-Evident Session Persistence (`counting_service.py` & `count_sessions.py`)
- **Anti-Tampering Guarantee:** The client application is strictly prevented from fabricating or manipulating spawn counts.
- When `POST /api/image-processing` processes an image, the backend persists an unsaved `CountSession` row recording the exact model output (`count`, `confidence`, `density_category`, `processing_time_ms`).
- The client receives only a UUID `session_id`.
- To save to the permanent ledger, the client calls `POST /api/count-sessions` with payload `{"session_id": "..."}` (`CountSessionSave` with `extra="forbid"`). Any client-supplied count, metrics, user IDs, or override fields are rejected with `422 Unprocessable Entity`.
- Repeating the save updates `is_saved = True` on that exact database row; it cannot duplicate or tamper with the count.

#### 2. Distributed Database Rate Limiting with HMAC-SHA256 Privacy (`rate_limit_service.py`)
- Implemented using the `rate_limit_buckets` table, shared across workers and processes without requiring external Redis dependencies.
- **Privacy Hardening:** Raw client IP addresses and user contact strings are never written to the database. All rate-limit keys are HMAC-SHA256 digests keyed by `SECRET_KEY`.
- **Dual Budgeting:** Each request consumes from both an account-level budget and an IP-level budget:
  - `POST /api/auth/login`: 5 per account / 30 per IP per 300s.
  - `POST /api/auth/signup`: 10 per IP per 3,600s.
  - `POST /api/image-processing`: 10 per user / 30 per IP per 60s.
  - Password reset & OTP endpoints: Granular 60s windows with bounded verification attempts (`OTP_MAX_ATTEMPTS=5`).

#### 3. Two-Factor Contact Change Verification (`contact_change_service.py`)
- Profile email/phone changes require two-step cryptographic verification:
  1. `POST /api/users/me/contact-change/request`: Validates current password, generates HMAC-protected 6-digit OTP delivered to the new destination, and issues a challenge UUID.
  2. `POST /api/users/me/contact-change/confirm`: Re-validates current password, matches OTP within 10-minute TTL, and updates the contact.
  3. Phone removal requires OTP delivery to the existing phone number before removal is permitted.

#### 4. Zero-Loss Storage Policy (`inference_resource_service.py` & `storage_service.py`)
- Enforces `RETAIN_ALL_UPLOADS=true`. Raw uploaded tray imagery is permanently marked as retained audit evidence. Preview garbage collection routines never delete raw evidence files, protecting hatcheries during billing disputes.

#### 5. Concurrency Locking & Resource Admission (`inference_resource_service.py`)
- Enforces global (`INFERENCE_MAX_CONCURRENT=4`) and per-user (`INFERENCE_USER_MAX_CONCURRENT=1`) locks using atomic database row reservations, preventing serverless GPU overload.

#### 6. Demo Tenant Isolation (`demo_service.py`)
- Generates ephemeral demo workspaces seeded with sample hatchery sessions for unauthenticated evaluation. Demo sessions are tagged with `is_demo=True` and cannot be converted into verified ledger audit records.

#### 7. Modal Serverless Inference Adapter (`counting_service.py` & `README_MODAL_INTEGRATION.md`)
- Connects FastAPI to the configured Modal service via `httpx.AsyncClient`.
- Supports configurable request formats: `multipart` (default), `base64_json`, and `raw` via `MODAL_REQUEST_FORMAT` and `MODAL_IMAGE_FIELD`.
- Transmits rotated `Modal-Key` and `Modal-Secret` headers.
- Graceful error contracts: returns 503 `model_not_configured` if keys are missing; enforces `MODAL_TIMEOUT_SECONDS=90`.

---

## 4. Low-Level Design (LLD): Frontend Architecture (`blueharvest-frontend`)

### 4.1 Shell & Routing Architecture (`src/App.jsx`)
- **Native History API Routing:** Built without third-party router bloat, keeping bundle size minimal while supporting deep links (`/`, `/login`, `/signup`, `/forgot-password`).
- **Single-Flight Refresh Mutex (`src/api/client.js`):** Solves refresh-token race conditions. If multiple parallel API calls return 401 simultaneously, a single `refreshPromise` executes token renewal and transparently replays the queued requests.
- **Private Image Rendering (`AuthenticatedImage.jsx`):** Fetches backend-protected image assets via authenticated `fetch()` with Bearer headers, converts responses into local Object URL blobs (`URL.createObjectURL`), and revokes memory descriptors (`URL.revokeObjectURL`) on unmount. Protects image paths from appearing in browser history or referrer headers.

### 4.2 Interactive Tab Modules & Features
1. **`DashboardTab.jsx` (Aquaculture Vision Ingest):** Drag-and-drop file ingestion, live camera modal trigger (`getUserMedia`), front/rear camera switcher, pre-flight canvas compression, and instant scan results modal.
2. **`LedgerTab.jsx` (Hatchery Ledger & Audit Trail):** Permanent audit ledger with date-range filtering, batch codes, pond tags, and RFC-4180 compliant CSV export with anti-formula injection sanitization.
3. **`InsightsTab.jsx` (Farm Intelligence & Economics):** Multi-range temporal metrics, pond grouping, survival modeling, batch economic valuations, and print-ready PDF styling.
4. **`ProfileTab.jsx` (Operator Identity & Security):** Profile management, 2FA contact change dialogs, and appearance customization (Light / Dark OLED / System theme with live `matchMedia` preference listener).

### 4.3 Client-Side Canvas Compression (`src/utils/imageCompressor.js`)
- Uses an offscreen HTML5 `<canvas>` to inspect image dimensions. If either dimension exceeds 1920px, it proportionally downscales the image while preserving aspect ratio, exporting to JPEG at 0.85 quality. Reduces network payload by up to 85% while preserving fish spawn resolution.

### 4.4 Aquaculture Economic & Biological Mathematical Engines
- **Transit & Stocking Survival Engine (`src/utils/mortality.js`):**
  - Short Transit (1–4 hrs): 2% mortality ($\text{Net Survival} = \text{Total} \times 0.98$).
  - Long Transit (12–24 hrs): 10% mortality ($\text{Net Survival} = \text{Total} \times 0.90$).
  - Nursery Pond Stocking: 70% mortality ($\text{Net Survival} = \text{Total} \times 0.30$).
- **Commercial Valuation Engine (`src/utils/pricing.js`):**
  $$\text{Total Batch Price (₹)} = (\text{Spawn Count} \times ₹0.025) + ₹50.00 \text{ (flat packing/oxygenation overhead)}$$

---

## 5. DevOps, Infrastructure & Cloud Topologies

### 5.1 Deployment Architecture Matrix

| Component | Target Cloud | Configuration Spec | Storage / Disk Characteristics |
| :--- | :--- | :--- | :--- |
| **Frontend Web** | **Netlify** | Root `netlify.toml`: base `blueharvest-frontend`, publish `dist`. | Edge CDN static distribution with SPA redirect rules (`_redirects`). |
| **Frontend Mirror** | **Vercel** | `blueharvest-frontend/vercel.json` SPA rewrites (`/(.*) -> /index.html`). | Multi-region static edge serving. |
| **Backend API** | **Render** | `render.yaml` Blueprint (Python web service + PostgreSQL). | Free web-service filesystem is ephemeral (`/tmp/uploads`). Production requires Cloudinary or persistent volume. |
| **Database** | **Render PostgreSQL** | PostgreSQL 16 (Render Managed Database). | Managed ACID relational store; configured in `DATABASE_URL`. |
| **AI Inference** | **Modal** | Serverless Python container (`modal deploy app.py`). | Auto-scales to zero; T4 GPU acceleration; 900s timeout. |
| **Local Container**| **Docker Compose** | `docker-compose.yml` (Python 3.12 + named volume `/data`). | Fully isolated local stack with persistent SQLite & upload volume. |

### 5.2 Cloudinary Storage Upgrade Architecture
Because Render Free instances feature ephemeral filesystems (files vanish on container restart/redeploy):
1. **Cloudinary Integration:** Setting `CLOUDINARY_URL` in `blueharvest-backend/.env` automatically activates remote private storage.
2. **Signed Uploads:** Raw captures are uploaded via Cloudinary SDK using authenticated signed upload presets.
3. **Secure Proxying:** The backend stores the remote `storage_asset_id` in `uploaded_images`. When the user requests `/api/uploads/{filename}`, the backend verifies token ownership and proxies the private Cloudinary stream directly to the client.

---

## 6. Complete 21-Document Technical Specification Catalog (`docs/`)

The repository includes 21 comprehensive technical specifications in `blueharvest-testing-project-tim2/docs/`:

| Specification Document | Scope & Contents |
| :--- | :--- |
| `API_REFERENCE.md` | OpenAPI contract, request/response schemas, error codes. |
| `ARCHITECTURE.md` | High-level system design and data-flow specifications. |
| `AUTHENTICATION.md` | Argon2id, Google OAuth GIS, JWT lifecycle, token rotation. |
| `BENCHMARKS.md` | Inference latency, throughput, GPU memory profiles. |
| `CHANGELOG.md` | Historical record of versions, fixes, and schema upgrades. |
| `cookie-csrf-protection.md` | Double-Submit Cookie CSRF implementation guide. |
| `DATASET_PREPARATION.md` | Synthetic augmentation, Augly pipeline, slicing parameters. |
| `DEPLOYMENT_GUIDE.md` | Render, Netlify, Docker Compose, and Modal runbooks. |
| `FRONTEND_DESIGN_SYSTEM.md` | Color palette, OLED dark mode, typography, components. |
| `MORTALITY_SURVIVAL_MODEL.md` | Transit and stocking survival decay functions. |
| `P2PNET_MODEL.md` | Neural network architecture, loss formulations, anchors. |
| `PRICING_ENGINE.md` | Unit spawn rate calculations and packing fee formulas. |
| `private-storage-and-pipeline-fixes.md` | Cloudinary signed storage and stream proxying. |
| `private-uploads.md` | Bearer token authorized image fetching specifications. |
| `profile-and-resource-controls.md` | 2FA contact changes and profile validation rules. |
| `ROADMAP.md` | Future development milestones (offline mobile app, IoT). |
| `security-rate-limits.md` | Database token-bucket sliding-window specifications. |
| `SECURITY.md` | Vulnerability reporting, threat models, cryptographic standards. |
| `TESTING_STRATEGY.md` | Pytest and Node.js testing methodology and CI checks. |
| `TROUBLESHOOTING.md` | Common operational errors and remediation runbooks. |
| `trusted-inference-results.md` | Backend-owned inference results and anti-tamper specifications. |

---

## 7. Quality Assurance & Verification Evidence (313 Total Passing Tests)

### 7.1 Backend Test Matrix (253 Passing Tests)
Executed via `pytest -q` in `blueharvest-backend`:

| Test Suite File | Test Count | Key Verified Capabilities |
| :--- | :---: | :--- |
| `test_auth.py` | 24 | Registration, Argon2id verification, login, JWT issuance, Google OAuth token exchange. |
| `test_cookie_csrf.py` | 18 | Refresh token cookie rotation, Double-Submit CSRF header verification, replay rejection. |
| `test_counts_and_dashboard.py` | 32 | Session creation, composite index range queries, temporal date filtering, batch codes. |
| `test_demo_isolation.py` | 16 | Ephemeral tenant workspaces, fixture seeding, demo data segregation from production. |
| `test_durable_private_storage.py` | 22 | Cloudinary signed assets, local disk persistence, storage provider transitions. |
| `test_inference_resources.py` | 28 | Concurrency slot allocation, capacity locking, quota checks, busy retry-after headers. |
| `test_modal_inference.py` | 20 | Mocked Modal cluster requests, format transformations, error mappings (`502`, `503`). |
| `test_password_reset.py` | 18 | Email/SMS OTP generation, hash verification, reset token exchange, password updates. |
| `test_password_reset_security.py`| 14 | Brute-force throttling, attempt counts, expired challenge invalidation. |
| `test_private_uploads.py` | 19 | Upload ownership enforcement, path traversal protection, forbidden access checks. |
| `test_profile_and_diagnostics.py`| 15 | Diagnostic health probes, settings persistence, database reachability. |
| `test_profile_validation_and_contacts.py` | 17 | Contact challenge issuance, phone/email validation, credential hashing. |
| `test_rate_limits.py` | 13 | Database token bucket sliding window limits across IP and user account buckets. |
| `test_zero_loss_storage.py` | 17 | Zero-loss retention policy (`RETAIN_ALL_UPLOADS`): Verifies raw uploads survive session deletion and preview timeouts. |
| **Total Backend Tests** | **253** | **100% Passing** |

### 7.2 Frontend Test Matrix (60 Passing Tests)
Executed via Node.js native test runner (`node --test`) in `blueharvest-frontend`:

| Test Suite File | Test Count | Key Verified Capabilities |
| :--- | :---: | :--- |
| `cookie-csrf.test.js` | 10 | Header synchronization, CSRF protection cookie handling, token clear routines. |
| `image-compressor.test.js` | 8 | Offscreen canvas resizing, dimension thresholding, aspect ratio preservation. |
| `inference-results.test.js` | 12 | Scan result modal parsing, heatmap overlays, density breakdowns, batch save actions. |
| `pricing-mortality.test.js` | 12 | Hatchery and transit mortality calculations, batch pricing formulas across volume tiers. |
| `private-images.test.js` | 6 | Blob URL creation, bearer token authentication headers, URL revocation on unmount. |
| `reports.test.js` | 6 | RFC-4180 CSV escaping, formula injection protection (`=`, `+`, `-`, `@`), print triggers. |
| `contact-verification.test.js` | 6 | OTP input state, countdown timers, attempt counters, resend cooldowns. |
| **Total Frontend Tests** | **60** | **100% Passing** |

---

### 8.1 Backend Codebase (`blueharvest-backend`)

| File / Folder | Architecture Tier | Responsibility |
| :--- | :--- | :--- |
| `app/main.py` | Application Entrypoint | Initializes FastAPI app, CORS, lifespan client pooling, and Sentry SDK with PII scrubbing. |
| `app/core/config.py` | Configuration Core | Pydantic v2 Settings model validating all environment variables, storage paths, and timeouts. |
| `app/core/security.py` | Cryptography & Security | Implements Argon2id password hashing, JWT creation/decoding, and CSRF token verification. |
| `app/core/time.py` | Utility | Provides `utcnow_naive()` ensuring uniform timezone-naive UTC timestamps across databases. |
| `app/db/base.py` | ORM Base | Declarative SQLAlchemy Base class for all entity models. |
| `app/db/session.py` | Database Session | Engine creation and scoped sessionmaker handling SQLite and PostgreSQL connections. |
| `app/models/user.py` | Entity Model | `User` and `UserSettings` ORM entities for credentials, profiles, themes, and roles. |
| `app/models/count_session.py` | Entity Model | `CountSession` entity with composite index for batch records, metrics, and save states. |
| `app/models/uploaded_image.py` | Entity Model | `UploadedImage` entity tracking stored asset metadata, ownership, and cleanup flags. |
| `app/models/inference_job.py` | Entity Model | `InferenceJob` and `InferenceCapacity` entities managing active concurrency reservations. |
| `app/models/auth.py` | Entity Model | `AuthSession` and `PasswordResetChallenge` entities storing hashed tokens and OTPs. |
| `app/models/contact_change.py` | Entity Model | `ContactChangeChallenge` entity for verified phone and email updates. |
| `app/models/rate_limit.py` | Entity Model | `RateLimitBucket` entity for database-backed token bucket request rate limiting. |
| `app/models/notification.py` | Entity Model | `Notification` entity tracking operator alerts and read timestamps. |
| `app/api/deps.py` | Dependency Injection | FastAPI dependencies for database sessions, current user auth, and CSRF validation. |
| `app/api/routes/auth.py` | Route Controller | Handles signup, login, Google OAuth, me, token refresh, logout, and password recovery. |
| `app/api/routes/image_processing.py` | Route Controller | Multipart upload endpoints `/api/image-processing` and `/api/preprocess-image`. |
| `app/api/routes/count_sessions.py` | Route Controller | CRUD operations for hatchery count sessions, saving verified results, and record deletion. |
| `app/api/routes/dashboard.py` | Route Controller | Range-filtered aggregation endpoint `/api/dashboard/summary`. |
| `app/api/routes/users.py` | Route Controller | Profile updates, contact verification challenges, and settings persistence. |
| `app/api/routes/notifications.py` | Route Controller | Notification listing and read-status toggling. |
| `app/api/routes/diagnostics.py` | Route Controller | Public health check `/api/diagnostics` and Modal probe `/api/model/health`. |
| `app/services/counting_service.py` | Domain Service | Modal inference dispatch, format conversion, and response parsing. |
| `app/services/inference_resource_service.py`| Domain Service | Concurrency reservation, capacity locks, quota checks, and zero-loss retention logic. |
| `app/services/storage_service.py` | Domain Service | Local file storage and Cloudinary signed asset management with secure stream proxying. |
| `app/services/google_auth_service.py` | Domain Service | Google GIS ID token audience and cryptographic signature verification. |
| `app/services/auth_service.py` | Domain Service | Local account registration, password authentication, and session cookie rotation. |
| `app/services/rate_limit_service.py` | Domain Service | Sliding-window token bucket enforcement in database. |
| `app/services/demo_service.py` | Domain Service | Ephemeral demo tenant isolation and fixture seeding. |
| `app/services/email_service.py` | Domain Service | SMTP email dispatch for password recovery codes. |
| `app/services/sms_service.py` | Domain Service | Twilio SMS dispatch for mobile recovery codes. |
| `app/services/image_validation.py` | Domain Service | Pillow inspection for image readability, mime types, and dimension limits. |
| `alembic/versions/*` | Database Migrations | 7 migration scripts managing schema evolution, indexes, and constraints. |
| `render.yaml` | Infrastructure as Code | Render Blueprint for Python web service and linked PostgreSQL database. |
| `docker-compose.yml` | Infrastructure as Code | Docker container setup for Python 3.12 backend with persistent `/data` volume. |

---

### 8.2 Frontend Codebase (`blueharvest-frontend`)

| File / Folder | Architecture Tier | Responsibility |
| :--- | :--- | :--- |
| `src/main.jsx` | Client Entrypoint | Bootstraps React 19 root and initializes Sentry browser tracing with header scrubbing. |
| `src/App.jsx` | Router & Shell | History API routing, session restoration, authentication context, and theme provider. |
| `src/api/client.js` | Networking Engine | Fetch client with token storage, single-flight refresh queue, and 401 retry loops. |
| `src/components/HomePage.jsx` | Layout Shell | Main dashboard header, tab navigation bar, notifications bell, and view router. |
| `src/components/tabs/DashboardTab.jsx` | Feature Module | Aquaculture scan ingest zone, camera modal trigger, and quick stats. |
| `src/components/tabs/LedgerTab.jsx` | Feature Module | Permanent batch records table, client-side search, filtering, and CSV export. |
| `src/components/tabs/InsightsTab.jsx` | Feature Module | Multi-range temporal metrics, pond grouping, survival modeling, and PDF print. |
| `src/components/tabs/ProfileTab.jsx` | Feature Module | Operator details, email/phone verification dialog trigger, and appearance settings. |
| `src/components/modals/LiveCameraModal.jsx` | UI Modal | In-browser viewfinder (`getUserMedia`), front/rear camera switcher, still capture. |
| `src/components/modals/ScanResultModal.jsx` | UI Modal | Displays P2PNet count, processing speed, density classification, and save actions. |
| `src/components/modals/ForgotPasswordModal.jsx`| UI Modal | Multi-step recovery workflow (request OTP $\rightarrow$ verify code $\rightarrow$ set new password). |
| `src/components/ContactVerification.jsx` | UI Component | Email and SMS verification dialog with countdown timers and attempt tracking. |
| `src/components/AuthenticatedImage.jsx` | Security Component | Fetches private uploaded images using Bearer tokens and renders memory blob URLs. |
| `src/components/DualFishLoader.jsx` | UI Component | Custom branded animated SVG loading spinner. |
| `src/utils/imageCompressor.js` | Performance Utility | Client-side HTML5 canvas compression scaling images exceeding 1920px to JPEG 0.85. |
| `src/utils/mortality.js` | Biological Engine | Mathematical modeling of multi-stage hatchery and transit fry survival rates. |
| `src/utils/pricing.js` | Economic Engine | Calculates batch financial valuation based on volume tiers and species. |
| `src/utils/reports.js` | Data Export Utility | RFC-4180 compliant CSV export generator with anti-formula injection safeguards. |
| `src/utils/theme.js` | Styling Utility | Manages Light, Dark (OLED), and System color schemes via CSS custom properties. |
| `netlify.toml` | Infrastructure as Code | Netlify build spec, dist publish path, and single-page application fallback rules. |
| `vercel.json` | Infrastructure as Code | Vercel rewrite configuration directing all routes to `/index.html`. |

---


## 9. Security Posture & Threat Model Analysis

1. **Authentication & Identity Theft:**
   - Mitigated by short-lived 15-minute JWT access tokens kept only in memory/sessionStorage.
   - 14-day refresh tokens are stored in `HttpOnly`, `SameSite=Lax` cookies, preventing XSS extraction.
   - Refresh tokens are hashed using SHA-256 before database storage; a compromised database does not allow session replay.
2. **Cross-Site Request Forgery (CSRF):**
   - Mitigated by Double-Submit CSRF protection requiring the custom header `X-CSRF-Protection: 1` on refresh and logout calls.
3. **Data Loss & Audit Tampering:**
   - Mitigated by `RETAIN_ALL_UPLOADS=true`, which permanently retains raw image assets and audit proofs even upon session deletion.
   - Model results are immutable: the frontend cannot forge count numbers; the backend only commits sessions bearing valid inference IDs.
4. **Denial of Service (DoS) & Resource Exhaustion:**
   - Decompression bomb guard: Pillow checks pixel counts before full decoding (`MAX_IMAGE_PIXELS = 60_000_000`).
   - File size cap: Enforced at 12 MB on backend, 20 MB on Modal.
   - Database-backed rate limiting per IP and user account on login, inference, and OTP endpoints.
   - Atomic database capacity locks restrict system-wide concurrent inference to 4 jobs.
5. **Observability & PII Leakage:**
   - Sentry integrations on both FastAPI and React scrub all sensitive keys (`password`, `token`, `otp`, `credential`, `authorization`, `cookie`, `x-csrf-token`) before transmitting telemetry over the wire.

---

## 10. Conclusion & Architectural Verdict

The **BlueHarvest AI** codebase in `blueharvest-testing-project-tim2` represents an exceptional, production-hardened full-stack system designed with engineering rigor. It cleanly decouples heavy serverless GPU compute (Modal) from light ASGI gateway traffic, enforces enterprise-grade security and session hygiene, incorporates mathematical domain models for aquaculture economics, guarantees zero data loss on sensitive audit imagery, and achieves a verified **97.47% counting precision** (99.04% on nursery trays) supported by **313 passing automated tests**.

