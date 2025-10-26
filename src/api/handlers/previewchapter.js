import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { getDirs, resolveDataPath } from '../../config/paths.js';
import { Metrics } from '../../metrics/metrics.js';
import { createLogger } from '../../logging/logger.js';

const PREVIEW_SUBDIR = 'previews';

export async function previewChapterHandler(req, res, next) {
  const start = performance.now();
  // Create a logger for this request if not available
  const logger = req.logger || createLogger({ component: 'preview' });
  
  try {
    const { projectId, chapterId, chapter } = req.body ?? {};
    if (!projectId || !chapterId || !chapter) {
      Metrics.inc('preview_failures_total');
      return res.status(400).json({ error: 'projectId, chapterId, and chapter payload are required' });
    }

    if (!chapter?.steps || !Array.isArray(chapter.steps)) {
      Metrics.inc('preview_failures_total');
      return res.status(422).json({ error: 'chapter.steps must be an array' });
    }

    const dryRun = req.query.dryRun === 'true' || req.headers['x-mobius-dry-run'] === '1';
    const dataDir = getDirs().root;
    const previewRoot = path.join(dataDir, PREVIEW_SUBDIR, sanitize(projectId));
    const previewPath = path.join(previewRoot, `${sanitize(chapterId)}.json`);

    await fs.mkdir(previewRoot, { recursive: true });

    const artifact = {
      projectId,
      chapterId,
      chapter,
      requestedAt: new Date().toISOString(),
      dryRun,
      jobToken: crypto.randomUUID(),
      status: dryRun ? 'dry_run' : 'queued'
    };

    await fs.writeFile(previewPath, JSON.stringify(artifact, null, 2), 'utf8');

    Metrics.inc('preview_requests_total');

    logger.info('preview_request_success', {
      projectId,
      chapterId,
      dryRun,
      previewPath
    });

    return res.status(202).json({
      status: dryRun ? 'dry_run' : 'queued',
      requestId: req.requestId,
      jobToken: artifact.jobToken,
      previewPath: path.relative(dataDir, previewPath)
    });
  } catch (error) {
    Metrics.inc('preview_failures_total');
    logger.error('preview_request_failed', {
      error: error.message,
      stack: error.stack,
      projectId: req.body?.projectId,
      chapterId: req.body?.chapterId
    });
    return next(error);
  }
}

function sanitize(value) {
  return String(value).replace(/[^a-zA-Z0-9-_]/g, '_');
}