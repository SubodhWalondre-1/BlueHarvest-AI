# Cookie Endpoint CSRF Protection

`POST /api/auth/refresh` and `POST /api/auth/logout` require both:

- One `Origin` header that exactly matches a configured frontend origin.
- One `X-CSRF-Protection: 1` request header.

Missing, null, untrusted, malformed, or duplicate headers return `403` with
`detail.code=csrf_failed`. Rejected requests do not rotate or revoke sessions,
clear cookies, or issue access tokens. A bearer token, query parameter, form
field, or `Referer` header does not replace either required header.

The custom header is a fixed browser-request marker, not a secret token. It
requires a CORS preflight for cross-origin browser requests. The backend also
checks the exact origin independently of the browser's CORS enforcement.
Valid CSRF headers do not replace the refresh cookie or its session validation.

## Frontend and CORS Configuration

The API client adds the custom header to automatic token refresh, session
restoration, and logout. The browser supplies `Origin`; frontend code must not
try to set it manually. Existing bearer-authenticated API routes retain their
current authentication flow.

CORS permits the custom header and credentials only for the configured exact
origins. `CORS_ORIGINS` is a comma-separated list of frontend origins including
scheme and any non-default port, with no trailing slash:

```dotenv
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

For production, list only the frontend origins you control and intend to trust.
Wildcard origins, wildcard subdomains, `null`, an empty list, credentials, paths,
queries, fragments, and invalid ports are rejected during settings validation.
Do not derive trusted origins from request headers or accept URL prefixes.

Update the backend and frontend together, and restart the backend after changing
the allowlist. This change requires no database migration. Non-browser clients
must explicitly provide both headers and the refresh cookie when calling these
cookie endpoints. Curl or other non-browser tools can set `Origin` themselves;
the check targets browser CSRF and is not client authentication.

## Verification

Backend tests cover accepted refresh/logout, token rotation, logout revocation,
requests carrying real test cookies but missing CSRF headers, untrusted origins,
duplicate headers, form/query substitutes, CORS preflight, configuration
validation, and preservation of session state on rejection. Frontend tests cover
all refresh/logout call paths and CSRF rejection without retry loops.

Run `python -m pytest -q` from `blueharvest-backend`. From
`blueharvest-frontend`, run `npm.cmd test`, `npm.cmd run build`, and
`npm.cmd run lint`.

The application checks are confirmed by automated HTTP and API-client tests.
A live cross-site browser exploit was not reproduced; actual browser exposure
also depends on cookie policy and deployment configuration. This protection
does not address script execution within an already trusted frontend origin.

References checked October 21, 2026:

- [OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [FastAPI CORS configuration](https://fastapi.tiangolo.com/tutorial/cors/)
