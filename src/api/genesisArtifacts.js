import fs from 'fs';
import path from 'path';

const FILES = [
  { key: 'g0Export', filename: 'mobius_export_bundle_v1.0.0.json' },
  { key: 'g1Ingest', filename: 'genesis_ingest_snapshot_v1.0.0.json' },
  { key: 'g2Quality', filename: 'genesis_quality_g2_v1.0.0.json' },
  { key: 'g3Visualization', filename: 'genesis_visualization_g3_v1.0.0.json' },
  { key: 'g4Clarity', filename: 'genesis_clarity_g4_v1.0.0.json' },
  { key: 'g5Analytics', filename: 'genesis_analytics_g5_v1.0.0.json' },
  { key: 'g6Feedback', filename: 'genesis_feedback_v1.0.0.json' },
];

function getProjectOutputDir(projectId) {
  return path.join(process.cwd(), 'output', String(projectId));
}

export function listGenesisArtifacts(projectId) {
  const outputDir = getProjectOutputDir(projectId);
  const artifacts = {};

  for (const { key, filename } of FILES) {
    const full = path.join(outputDir, filename);
    if (fs.existsSync(full)) {
      artifacts[key] = {
        filename,
        path: `/api/projects/${projectId}/genesis-artifacts/${filename}`,
      };
    }
  }

  return artifacts;
}

export function readGenesisArtifact(projectId, filename) {
  const outputDir = getProjectOutputDir(projectId);
  const full = path.join(outputDir, filename);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}
