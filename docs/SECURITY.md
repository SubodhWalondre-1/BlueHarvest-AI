# BlueHarvest AI - Security Policy & Hardening

## Defense-in-Depth Measures
- **Environment Isolation**: Zero hardcoded secrets; strict validation via Pydantic BaseSettings.
- **CORS Protection**: Explicit allow-origin whitelist for production frontend domains.
- **Rate Limiting**: Sliding window rate limiting on authentication and inference endpoints.
- **Input Sanitization**: File magic number validation preventing polyglot file execution.