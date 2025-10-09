# Asset uploads & hashed storage (Phase F)

## Description

Implement server-side asset upload endpoints and hashed storage under DATA_DIR/assets. Use content-hash (sha256) for canonical filenames and dedupe. Generate thumbnails on upload and expose listing endpoints.

## Acceptance criteria

- POST /api/projects/:id/assets accepts uploads, validates MIME/size.
- Stores file under DATA_DIR/assets/<hash>/<original.ext> and generates thumb.jpg.
- GET /api/projects/:id/assets returns asset list with previewUrl, dimensions, mime type.
- Duplicate uploads return existing assetId (dedupe).
- Unit & integration tests for hashing, dedupe, and thumbnail generation.

## Subtasks

- Endpoint & validations
- Hash-based store, thumbnail generation (sharp)
- Asset metadata store (JSON or SQLite)
- Client integration for the asset library

## Owner
developer

## ETA
3 days

## Labels
feature, phase-f, ux