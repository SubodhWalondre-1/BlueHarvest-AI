# BlueHarvest AI - Security Policy & Hardening

## Defense-in-Depth Measures
- **Environment Isolation**: Zero hardcoded secrets; strict validation via Pydantic BaseSettings.
- **CORS Protection**: Explicit allow-origin whitelist for production frontend domains.
- **Rate Limiting**: Sliding window rate limiting on authentication and inference endpoints.
- **Input Sanitization**: File magic number validation preventing polyglot file execution.
## File Upload Constraints
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Maximum upload size: 15 MB per image.
- Image dimensions must satisfy minimum $640 \times 480$ px and maximum $4096 \times 4096$ px.
