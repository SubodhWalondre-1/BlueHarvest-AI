# API Rate Limits

BlueHarvest stores rate-limit counters in the application database. Counters are
shared across workers and instances that use the same database and `SECRET_KEY`.
Restarting a worker does not clear an active limit. No additional service is required.

## Default Policies

| Endpoint | Account or user limit | IP limit | Window |
| --- | --- | --- | --- |
| `POST /api/auth/login` | 5 attempts | 30 attempts | 300 seconds |
| `POST /api/auth/signup` | — | 10 requests | 3,600 seconds |
| `POST /api/auth/password-reset/request` | Existing 5 requests per 15 minutes | 10 requests | 60 seconds for IP |
| `POST /api/auth/password-reset/verify` | 10 requests | 30 requests | 60 seconds |
| `POST /api/auth/password-reset/confirm` | 10 requests | 30 requests | 60 seconds |
| `POST /api/image-processing` | 10 requests | 30 requests | 60 seconds |
| `POST /api/preprocess-image` | 10 requests | 30 requests | 60 seconds |
| `GET /api/model/health` | 10 requests | 30 requests | 60 seconds |

Each endpoint has its own counters. Both account and IP budgets must permit a
request. Username and email logins share the same account counter. Email and SMS
verification for the same user also share an account counter within each endpoint.

A successful password login clears that account's login counter. It does not clear
the IP counter. Invalid credentials consume the available budget. Existing OTP
expiry, per-challenge attempt limits, and recovery-request controls remain active.
Google authentication is unchanged.

Windows begin with the first request and expire automatically. Rejected requests
do not extend the deadline or increase an already exhausted counter. Expired
counters are removed as subsequent limited requests arrive. Stored counter keys
are HMAC digests rather than plaintext contact details or IP addresses.

## Responses

Limits return HTTP `429` with a `Retry-After` header. The shared limiter also
returns `detail.code = "rate_limited"`, an English message, and
`detail.retry_after` in seconds. The existing recovery-request limit retains its
`recovery_rate_limited` code. Successful response formats are unchanged.

Requests rejected by an image endpoint's limiter do not run image validation,
write uploaded files, or call Modal. Multipart parsing by the ASGI framework still
occurs before the endpoint executes.

## Configuration and Deployment

Limits and window lengths are positive integer settings documented in
`blueharvest-backend/.env.example`. Tune IP limits for expected shared-network
traffic, such as multiple operators using one hatchery connection.

Apply the additive migration before starting the updated backend:

```powershell
cd blueharvest-backend
python -m alembic upgrade head
```

The limiter supports SQLite and PostgreSQL using atomic conditional upserts.
Production instances must share the same database and stable `SECRET_KEY`.

Client addresses come from `request.client.host`. Raw forwarding headers are
never read by the limiter. Configure Uvicorn to trust only your reverse proxy.
Render's native Python runtime sets `FORWARDED_ALLOW_IPS=*`; keep the application
behind Render's managed ingress. Docker and other hosting setups need their own
trusted-proxy configuration. Verify the effective client address after deployment.

References checked on October 21, 2026:

- [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling)
- [Render default environment variables](https://render.com/docs/environment-variables#python-3)
- [FastAPI behind a proxy](https://fastapi.tiangolo.com/advanced/behind-a-proxy/)
