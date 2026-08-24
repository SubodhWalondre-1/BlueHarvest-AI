# Authentication & Authorization Architecture

## Security Protocol
- **Tokens**: JSON Web Tokens (JWT) signed with HMAC-SHA256 (`HS256`).
- **Access Token Expiry**: 60 minutes.
- **Refresh Token Expiry**: 7 days.
- **Password Storage**: Passwords hashed using `bcrypt` with automatic work factor 12 salt generation.