# Backend-Owned Inference Results

The backend stores each successful inference as an unsaved `CountSession`.
Count, confidence, length, density, processing time, and model name come from the
validated inference response. The private image path comes from the upload
handled by that request. User identity and pond location come from the
authenticated account. Camera/upload source is optional upload metadata.

The session and image ownership row commit in one database transaction. Failed
inference or persistence creates neither row and removes the incomplete file.
Missing optional model metrics stay empty; a zero count remains valid.

## API Flow

1. Send the image to `POST /api/image-processing`, optionally with form field
   `source=Camera` or `source=Uploaded`. The response includes `session_id`.
2. Save it with `POST /api/count-sessions` and only this JSON body:

   ```json
   { "session_id": "d057e6ab-4610-42a8-a929-65f38f62cb57" }
   ```

3. Read the returned session or reload the saved ledger. Repeating the save
   updates the same row; it does not create another result.

Saving returns `200`. Metric fields, image paths, owner IDs, provenance flags,
and status overrides are rejected with `422`, including when a valid session ID
is supplied. Unknown and other users' sessions return the same `404`.
Deleting a session prevents its ID from being saved again.

`PATCH /api/count-sessions/{session_id}/save` remains available for an existing
session's boolean `is_saved` state. It cannot change metrics or image links.
Demo fixtures cannot be promoted into inference results.

## Ledger, Analytics, and Legacy Records

Only inference code sets `inference_verified=true`. This flag records server
provenance; it does not assert that the model's prediction is accurate.

The frontend ledger requests saved sessions. Dashboard and PDF report totals
require saved sessions with inference provenance. Explicit demo mode retains its
separate labels and opt-in totals. CSV exports use the filtered ledger records.

Migration `82c4a1d9e635` preserves existing records and marks them unverified.
Old client-submitted metrics cannot establish whether inference actually ran.
They are excluded from the default history, dashboard, and reports, even if
previously saved. No records or image bytes are deleted by this migration.

Owners can inspect their archived records with
`GET /api/count-sessions?include_unverified=true`, or fetch an individual session.
Such records carry `inference_verified=false` and `Unverified legacy record`.
Trying to save them returns `409`; run inference again to create a trusted result.
Legacy image access restrictions remain in effect.

## Applying and Checking

Run the migration before starting the updated backend, and update the frontend
with it. Clients that submit metrics directly must adopt the ID-only contract.

```powershell
cd blueharvest-backend
python -m alembic upgrade head
python -m pytest -q
```

From `blueharvest-frontend`, run `npm.cmd test`, `npm.cmd run build`, and
`npm.cmd run lint`.

Regression coverage includes fabricated counts, metric overrides, ownership,
failed transaction rollback, zero counts, repeated saves, deleted IDs, legacy
exclusion, demo isolation, and authenticated frontend requests. Local migration
checks cover SQLite upgrade/downgrade, data preservation, and ORM schema parity.
PostgreSQL migration SQL was compiled without a live database connection. Live
Modal, Render deployment, and browser interaction were not exercised.

Reference: [OWASP business logic security guidance](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html),
checked October 21, 2026.
