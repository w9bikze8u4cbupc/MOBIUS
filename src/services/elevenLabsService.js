import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`ElevenLabs narration requires a non-empty ${fieldName}.`);
  }
  return value.trim();
}

/**
 * Generate one MP3 narration file through ElevenLabs using curl.
 *
 * The request lets the local cURL installation negotiate its supported HTTP
 * version. Forcing HTTP/2 is not portable across Windows cURL builds.
 * curl is intentionally invoked with an argument vector rather than a shell
 * command, so narration text, voice identifiers, and output paths are never
 * interpreted as shell syntax.
 */
export async function generateNarration(narrationText, voiceId, outputPath) {
  const text = requireNonEmptyString(narrationText, 'narrationText');
  const normalizedVoiceId = requireNonEmptyString(voiceId, 'voiceId');
  const targetPath = requireNonEmptyString(outputPath, 'outputPath');
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('ElevenLabs narration requires ELEVENLABS_API_KEY to be configured.');
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const curlArguments = [
    '-s',
    '--fail',
    '-X',
    'POST',
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(normalizedVoiceId)}`,
    '-H',
    `xi-api-key: ${apiKey}`,
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify({ text, model_id: ELEVENLABS_MODEL_ID }),
    '--output',
    targetPath,
  ];

  try {
    await execFileAsync('curl', curlArguments, {
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const detail = typeof error?.stderr === 'string' && error.stderr.trim()
      ? `: ${error.stderr.trim()}`
      : '';
    throw new Error(`ElevenLabs narration curl request failed${detail}`);
  }

  return targetPath;
}

export { ELEVENLABS_MODEL_ID };
