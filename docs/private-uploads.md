# Private Uploaded Images

Each successful upload creates an `uploaded_images` row containing its generated
filename, authenticated uploader ID, validated media type, and creation time.
The server derives the owner from the authenticated session. Form fields and
client-supplied ledger image paths cannot assign or transfer ownership.

`GET /api/uploads/{filename}` requires a valid bearer token on every request,
including range requests. Anonymous callers receive `401`. Other users,
untracked files, invalid filenames, and missing files receive the same `404`
response. Files are served with `Cache-Control: private, no-store`,
`Vary: Authorization`, and `X-Content-Type-Options: nosniff`.

Uploaded files remain inside the configured upload directory. Symlinks and paths
outside that directory are rejected. Failed or cancelled inference and failed
ownership commits remove incomplete uploaded files.

## Frontend Loading

`AuthenticatedImage` fetches backend uploads through the existing API client,
including its token-refresh behavior, and renders the resulting image blob.
Bearer tokens are never put in image URLs. Only the configured API's protected
upload paths accept authenticated image fetches. Redirects are rejected.

Requests are cancelled and object URLs are revoked when the source changes or
the component unmounts. Local previews, public artwork, and existing layout are
preserved. History thumbnails, batch details, and detection previews use the
component and show their existing fallback artwork when an image is unavailable.

## Migration and Legacy Files

Apply the migration before starting the updated backend:

```powershell
cd blueharvest-backend
python -m alembic upgrade head
```

Existing uploaded bytes and ledger rows are preserved. Previously uploaded files
have no server-recorded uploader, so the migration does not guess their owners
from ledger paths. Such files remain inaccessible until their ownership is
independently verified. Re-uploading an image records authenticated ownership for
the new upload. Download authorization never falls back to ledger associations.

This change protects backend uploads. Storage durability and any image URLs
hosted by an external inference provider remain separate concerns.

References checked on October 21, 2026:

- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [React effect cleanup](https://react.dev/reference/react/useEffect)
- [Object URL cleanup](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)
