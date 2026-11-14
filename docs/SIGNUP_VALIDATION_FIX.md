# Signup Username Pattern Validation Fix

## 1. Issue Description

During user signup on the registration screen, submitting an invalid username format (such as containing spaces, special symbols, or unsupported punctuation) surfaced a raw, technical Pydantic regular expression error in the error banner:

```
(!) String should match pattern '^[A-Za-z0-9_.-]+$'
```

### Why This Happened
1. **Backend Validation Message**: The Pydantic schema `SignupRequest` in `app/schemas/auth.py` specified `pattern=r"^[A-Za-z0-9_.-]+$"`. When Pydantic v2 fails regex pattern matching, its default error string is literally `String should match pattern '^[A-Za-z0-9_.-]+$'`.
2. **Missing Client-Side Regex Validation**: In `SignUpView.jsx`, the client-side `handleSubmit` check only checked `if (!formData.username.trim())`, allowing usernames with spaces (e.g., `Rahul Sharma`) or unsupported characters to be submitted to the backend.
3. **Raw Error Message Propagation**: The API client helper `parseError` in `client.js` concatenated `item.msg` directly without normalizing Pydantic `string_pattern_mismatch` errors into human-friendly explanations.

---

## 2. Changes Made

### 2.1 Backend Schemas (`blueharvest-backend`)
- **`app/schemas/auth.py` (`SignupRequest`)**:
  - Replaced the generic `pattern=r"^[A-Za-z0-9_.-]+$"` constraint with a custom `@field_validator("username")`.
  - On format mismatch, raises a clear, human-readable `ValueError`:
    `"Username can only contain letters, numbers, underscores, hyphens, and periods (no spaces)."`
- **`app/schemas/user.py` (`UserUpdate`)**:
  - Applied the identical `@field_validator("username")` to ensure profile username updates share the same friendly error message.

### 2.2 Frontend API Client (`blueharvest-frontend/src/api/client.js`)
- **Enhanced `parseError`**:
  - Automatically strips Pydantic's `"Value error, "` prefix.
  - Detects regex pattern mismatch errors (`string_pattern_mismatch` or `msg.includes('pattern')`).
  - If the affected field is `username` or references `'^[A-Za-z0-9_.-]+$'`, maps it to:
    `"Username can only contain letters, numbers, underscores, hyphens, and periods (no spaces)."`
  - If the affected field is `code` (OTP) or references `^\d{6}$`, maps it to:
    `"Verification code must be exactly 6 digits."`

### 2.3 Frontend Signup View (`blueharvest-frontend/src/components/SignUpView.jsx`)
- **Client-Side Validation in `handleSubmit`**:
  - Added strict pre-flight checks:
    - Minimum length: 3 characters.
    - Maximum length: 50 characters.
    - Pattern regex: `/^[A-Za-z0-9_.-]+$/`.
    - If invalid: sets `newErrors.username` with a clean error message and blocks submission.
- **Inline Field Error & Hint UI**:
  - Added persistent inline hint:
    `"Letters, numbers, underscores, hyphens, and periods only (no spaces)."`
  - When an error occurs, highlights the username input with `.has-error` and displays the error message directly under the input field in red.
  - In `catch (error)`, detects username-specific failures and surfaces them both inline at the input and in the top alert banner.

### 2.4 Styling (`blueharvest-frontend/src/App.css`)
- Added `.field-hint-message` style matching the BlueHarvest design system with soft slate coloring (`#64748b`) and clean typography.

---

## 3. Verification & Results

1. **Frontend Unit Tests**: All 63 tests passed (`npm test` via `node --test`).
2. **Frontend Production Build**: `npm run build` succeeded cleanly in 758ms with 0 errors.
3. **Backend Tests**: `pytest` passed 46/46 auth and profile validation tests.
