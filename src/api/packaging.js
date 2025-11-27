import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CONFIG_DIR = path.join(process.cwd(), 'config');
const LOCALIZATION_GENERATED_PATH = path.join(CONFIG_DIR, 'localization.generated.json');
const LOCALIZATION_FALLBACK_PATH = path.join(CONFIG_DIR, 'localization.json');

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

function loadLocalizationConfig() {
  const pathToUse = fs.existsSync(LOCALIZATION_GENERATED_PATH)
    ? LOCALIZATION_GENERATED_PATH
    : LOCALIZATION_FALLBACK_PATH;
  if (!pathToUse || !fs.existsSync(pathToUse)) return {};
  try {
    const raw = fs.readFileSync(pathToUse, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      subtitleLocaleCodes:
        parsed.subtitleLocaleCodes || parsed.subtitle_locale_codes || parsed.locales || {},
    };
  } catch (err) {
    return {};
  }
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

function inferCaptionFromFilename(filename, localizationConfig) {
  const base = path.basename(filename);
  const entries = Object.entries(localizationConfig.subtitleLocaleCodes || {});
  for (const [locale, code] of entries) {
    const regex = new RegExp(`(^|[-_\.])${code}(?=\.)`, 'i');
    if (regex.test(base)) {
      return { locale, languageCode: code };
    }
  }

  const fallbackLanguage = inferLanguage(base);
  const fallbackLocale = fallbackLanguage
    ? entries.find(([, code]) => code === fallbackLanguage)?.[0]
    : undefined;

  return { locale: fallbackLocale, languageCode: fallbackLanguage };
}

async function buildMediaSection({
  videos,
  audios,
  captions,
  images,
  outputDir,
  localizationConfig,
}) {
  const [videoEntries, audioEntries, captionEntries, imageEntries] = await Promise.all([
    describeMediaEntries({ files: videos, outputDir, kind: 'video' }),
    describeMediaEntries({ files: audios, outputDir, kind: 'audio' }),
    (async () => {
      const entries = [];
      for (const file of captions) {
        const sha256 = await computeSha256(file);
        const stat = await fs.promises.stat(file);
        const inferred = inferCaptionFromFilename(path.basename(file), localizationConfig || {});
        const format = path.extname(file).replace('.', '').toLowerCase();
        entries.push({
          kind: 'captions',
          path: path.relative(outputDir, file),
          sizeBytes: stat.size,
          sha256,
          language: inferred.languageCode || inferLanguage(path.basename(file)),
          languageCode: inferred.languageCode || inferLanguage(path.basename(file)),
          locale: inferred.locale,
          format: format || undefined,
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
  const localizationConfig = loadLocalizationConfig();
  const media = await buildMediaSection({
    ...artifactGroups,
    outputDir,
    localizationConfig,
  });
  const tools = await buildToolsSection();
  const env = buildEnvSection();

  const manifest = {
    version: '1.0',
    jobId,
    generatedAt: new Date().toISOString(),
    tools,
    env,
    localization: localizationConfig,
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
