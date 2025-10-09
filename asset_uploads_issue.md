Implement server-side asset upload endpoints and hashed storage under DATA_DIR/assets. Compute content-hash for dedupe and generate thumbnails.

Acceptance criteria:
- POST /api/projects/:id/assets accepts image uploads (multipart/form-data), validates MIME and size.
- Stores file at DATA_DIR/assets/<hash>/<original.ext> and generates thumb.jpg.
- GET /api/projects/:id/assets returns list with previewUrl, dimensions, mime type.
- Duplicate uploads deduped by hash.
- Unit & integration tests (upload -> thumbnail -> listing).

Subtasks:
- Endpoint + validation.
- Hash-based store + thumbnail generation (sharp).
- Asset metadata store (JSON or SQLite table).
- Client integration for asset library listing.

Owner: developer
ETA: 3 days
Labels: feature, phase-f, ux