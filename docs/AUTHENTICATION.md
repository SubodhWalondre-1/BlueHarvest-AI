# Authentication & Authorization Architecture

## Security Protocol
- **Tokens**: JSON Web Tokens (JWT) signed with HMAC-SHA256 (`HS256`).
- **Access Token Expiry**: 60 minutes.
- **Refresh Token Expiry**: 7 days.
- **Password Storage**: Passwords hashed using `bcrypt` with automatic work factor 12 salt generation.
## Google OAuth2 Federation
- Standard OAuth 2.0 authorization code grant flow with Google Identity Services.
- Automatic account provisioning for verified email domains.
- Token validation performed server-side via Google public keys.
