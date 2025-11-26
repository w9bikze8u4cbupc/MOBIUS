export function registerPhaseERoutes(app, deps) {
  const {
    runIngestionPipeline,
    normalizeBggMetadata,
    validateIngestionManifest,
    generateStoryboard,
    validateStoryboard,
  } = deps;

  function mapIngestionError(err) {
    if (!err) return { code: 'INGEST_UNKNOWN_ERROR', status: 500 };
    if (err.message === 'INGEST_HEADING_MISSING' || err.message === 'INGEST_OCR_EXCEEDED') {
      return { code: err.message, status: 400 };
    }
    return { code: 'INGEST_UNKNOWN_ERROR', status: 500 };
  }

  app.post('/api/ingest', (req, res) => {
    const { documentId, metadata, pages, ocr = {}, bggMetadata = {} } = req.body || {};

    if (!documentId || !metadata || !Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: 'documentId, metadata, and pages are required',
        code: 'INGEST_BAD_REQUEST'
      });
    }

    try {
      const manifest = runIngestionPipeline({
        documentId,
        metadata,
        pages,
        ocr,
        bggMetadata: normalizeBggMetadata(bggMetadata)
      });

      const { valid, errors } = validateIngestionManifest(manifest);
      if (!valid) {
        return res.status(400).json({
          error: 'Ingestion manifest failed validation',
          code: 'INGEST_CONTRACT_INVALID',
          details: errors
        });
      }

      return res.json({ ok: true, manifest });
    } catch (err) {
      console.error('Ingestion pipeline failed:', err);
      const mapped = mapIngestionError(err);
      return res.status(mapped.status).json({
        error: 'Failed to run ingestion',
        code: mapped.code
      });
    }
  });

  app.post('/api/storyboard', (req, res) => {
    const { ingestionManifest, options = {} } = req.body || {};

    if (!ingestionManifest) {
      return res.status(400).json({
        error: 'ingestionManifest is required',
        code: 'STORYBOARD_BAD_REQUEST'
      });
    }

    try {
      const manifest = generateStoryboard(ingestionManifest, options);
      const contractVersion = manifest.version || '1.0.0';
      const { valid, errors } = validateStoryboard(manifest, { contractVersion });
      if (!valid) {
        return res.status(400).json({
          error: 'Storyboard manifest failed validation',
          code: 'STORYBOARD_CONTRACT_INVALID',
          details: errors
        });
      }

      return res.json({ ok: true, manifest });
    } catch (err) {
      console.error('Storyboard generation failed:', err);
      const code = err.message === 'STORYBOARD_INVALID_INGESTION'
        ? 'STORYBOARD_INVALID_INGESTION'
        : 'STORYBOARD_UNKNOWN_ERROR';
      return res.status(code === 'STORYBOARD_INVALID_INGESTION' ? 400 : 500).json({
        error: 'Failed to generate storyboard',
        code
      });
    }
  });
}
