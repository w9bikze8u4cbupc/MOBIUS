import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function isVideoFile(filename) {
  return /\.(mp4|mov|mkv|webm)$/i.test(filename);
}

function isAudioFile(filename) {
  return /\.(wav|mp3|aac|m4a|flac|ogg)$/i.test(filename);
}

function isCaptionFile(filename) {
  return /\.(srt|vtt)$/i.test(filename);
}

function isImageFile(filename) {
  return /\.(png|jpg|jpeg|webp)$/i.test(filename);
}

async function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => reject(err));
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function detectToolVersion(binary) {
  try {
    const { stdout } = await execFileAsync(binary, ['-version']);
    const firstLine = stdout.split(/\r?\n/)[0];
    return firstLine || null;
  } catch (err) {
    return null;
  }
}

async function probeMedia(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
    ]);
    const data = JSON.parse(stdout);
    const format = data.format || {};
    const streams = data.streams || [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    return {
      durationSec: format.duration ? Number(format.duration) : undefined,
      bitrate: format.bit_rate ? Number(format.bit_rate) : undefined,
      codec: videoStream?.codec_name || audioStream?.codec_name,
      width: videoStream?.width,
      height: videoStream?.height,
      fps: videoStream?.r_frame_rate
        ? (() => {
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            if (num && den) return Number((num / den).toFixed(2));
            return undefined;
          })()
        : undefined,
    };
  } catch (err) {
    return {};
  }
}

async function createZipArchive({ outputDir, jobId, files }) {
  const zipPath = path.join(outputDir, `${jobId}.zip`);
  const relativeFiles = files.map((file) => path.relative(outputDir, file));
  await execFileAsync('zip', ['-r', '-q', zipPath, ...relativeFiles], {
    cwd: outputDir,
  });
  return zipPath;
}

async function collectArtifacts(outputDir) {
  const entries = await fs.promises.readdir(outputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(outputDir, entry.name));

  const videos = files.filter((file) => isVideoFile(file));
  const audios = files.filter((file) => isAudioFile(file));
  const captions = files.filter((file) => isCaptionFile(file));
  const images = files.filter((file) => isImageFile(file));

  return { files, videos, audios, captions, images };
}

function buildEnvSection() {
  return {
    node: process.version,
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
  };
}

async function buildToolsSection() {
  const [ffmpeg, ffprobe] = await Promise.all([
    detectToolVersion('ffmpeg'),
    detectToolVersion('ffprobe'),
  ]);
  return {
    ffmpeg,
    ffprobe,
  };
}

async function describeMediaEntries({ files, outputDir, kind }) {
  const entries = [];
  for (const file of files) {
    const [sha256, probe] = await Promise.all([
      computeSha256(file),
      isVideoFile(file) || isAudioFile(file) ? probeMedia(file) : Promise.resolve({}),
    ]);

    entries.push({
      kind,
      path: path.relative(outputDir, file),
      sizeBytes: (await fs.promises.stat(file)).size,
      sha256,
      ...probe,
    });
  }
  return entries;
}

function inferLanguage(filename) {
  const match = filename.match(/\.([a-z]{2})(?:-[A-Z]{2})?\.(srt|vtt)$/i);
  return match ? match[1] : undefined;
}

async function buildMediaSection({ videos, audios, captions, images, outputDir }) {
  const [videoEntries, audioEntries, captionEntries, imageEntries] = await Promise.all([
    describeMediaEntries({ files: videos, outputDir, kind: 'video' }),
    describeMediaEntries({ files: audios, outputDir, kind: 'audio' }),
    (async () => {
      const entries = [];
      for (const file of captions) {
        const sha256 = await computeSha256(file);
        const stat = await fs.promises.stat(file);
        entries.push({
          kind: 'captions',
          path: path.relative(outputDir, file),
          sizeBytes: stat.size,
          sha256,
          language: inferLanguage(path.basename(file)),
        });
      }
      return entries;
    })(),
    describeMediaEntries({ files: images, outputDir, kind: 'image' }),
  ]);

  return {
    video: videoEntries,
    audio: audioEntries,
    captions: captionEntries,
    images: imageEntries,
    referenceDurationSec: videoEntries[0]?.durationSec,
  };
}

function buildChecksums(media) {
  const allEntries = [
    ...(media.video || []),
    ...(media.audio || []),
    ...(media.captions || []),
    ...(media.images || []),
  ];

  return allEntries
    .filter((entry) => entry?.sha256)
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }));
}

export async function packageRenderJob({ jobId, outputDir, jobConfig }) {
  const artifactGroups = await collectArtifacts(outputDir);
  const media = await buildMediaSection({ ...artifactGroups, outputDir });
  const tools = await buildToolsSection();
  const env = buildEnvSection();

  const manifest = {
    version: '1.0',
    jobId,
    generatedAt: new Date().toISOString(),
    tools,
    env,
    media,
    referenceDurationSec:
      jobConfig?.timing?.totalDurationSec || media.referenceDurationSec || null,
    checksums: buildChecksums(media),
  };

  const manifestPath = path.join(outputDir, 'container.json');
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  let zipPath;
  if (String(process.env.MOBIUS_PACKAGE_ZIP).toLowerCase() === 'true') {
    const filesForArchive = artifactGroups.files.filter(
      (file) => path.basename(file) !== `${jobId}.zip`,
    );
    filesForArchive.push(manifestPath);
    zipPath = await createZipArchive({ outputDir, jobId, files: filesForArchive });
  }

  return { manifestPath, zipPath, manifest };
}

export default packageRenderJob;
