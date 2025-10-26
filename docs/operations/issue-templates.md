# Issue Templates for Phase F+ Development

## Issue 1: Preview Worker Implementation

### Summary
Implement the actual preview renderer that converts chapter content into short preview renders (images/audio → MP4 or JSON manifest).

### Description
Build the worker component that processes queued preview requests and generates actual preview content instead of just stubbing the functionality. The worker should consume artifacts from the DATA_DIR/previews directory and produce rendered outputs.

### Subtasks
- [ ] Define renderer contract (input schema, expected artifact format)
- [ ] Implement job runner to pick up queued preview artifacts
- [ ] Integrate with existing ffmpeg/python tooling or stub LLM-based steps
- [ ] Add proper error handling and retry logic
- [ ] Implement cleanup of processed artifacts
- [ ] Add metrics for worker performance (jobs processed, errors, duration)

### Acceptance Criteria
- [ ] Worker processes preview requests from queue
- [ ] Generates valid preview output (MP4 or JSON manifest)
- [ ] Handles errors gracefully and logs appropriately
- [ ] Cleans up processed artifacts to prevent disk bloat
- [ ] Exposes metrics for monitoring
- [ ] Unit tests cover worker functionality
- [ ] Integration test validates end-to-end preview generation

### Labels
feature, phase-g, preview-worker, backend

---

## Issue 2: Asset Uploads & Hashed Storage

### Summary
Implement an asset upload endpoint and storage system with content-addressable storage using hashing.

### Description
Create an API endpoint for uploading assets associated with projects, store them with content-based hashing to prevent duplicates, and generate thumbnails for UI display.

### Subtasks
- [ ] Create /api/projects/:id/assets upload endpoint
- [ ] Implement file validation (type, size limits)
- [ ] Add content hashing for deduplication
- [ ] Store assets under DATA_DIR/assets with hashed filenames
- [ ] Generate thumbnails for image assets
- [ ] Implement listing endpoint for project assets
- [ ] Add cleanup mechanism for orphaned assets

### Acceptance Criteria
- [ ] Assets can be uploaded via API endpoint
- [ ] Files are validated for type and size
- [ ] Content hashing prevents duplicate storage
- [ ] Assets stored in organized directory structure
- [ ] Thumbnails generated for image assets
- [ ] Assets can be listed per project
- [ ] Cleanup mechanism removes orphaned files
- [ ] Unit tests cover upload and storage logic
- [ ] Integration test validates complete upload flow

### Labels
feature, phase-g, asset-upload, backend

---

## Issue 3: Packaging & Export Endpoint

### Summary
Implement an export endpoint that bundles tutorial components into a distributable zip file.

### Description
Create an API endpoint that packages all components of a tutorial (container.json, SRT files, matched assets) into a single zip file for distribution.

### Subtasks
- [ ] Create /api/export endpoint
- [ ] Implement packaging logic for tutorial components
- [ ] Add compression and archive creation
- [ ] Implement progress tracking for large exports
- [ ] Add proper error handling for missing components
- [ ] Implement temporary file cleanup
- [ ] Add rate limiting to prevent resource exhaustion

### Acceptance Criteria
- [ ] Export endpoint bundles all tutorial components
- [ ] Zip file contains correct directory structure
- [ ] Progress tracking works for large exports
- [ ] Errors handled gracefully with useful messages
- [ ] Temporary files cleaned up after export
- [ ] Rate limiting prevents resource exhaustion
- [ ] Unit tests cover packaging logic
- [ ] Integration test validates complete export flow

### Labels
feature, phase-g, packaging, backend