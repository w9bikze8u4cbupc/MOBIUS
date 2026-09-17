import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
const ELEVENLABS_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_VOICE_SETTINGS = Object.freeze({
  stability: 0.38,
  similarity_boost: 0.78,
  style: 0.22,
  use_speaker_boost: true,
});

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
export async function generateNarration(narrationText, voiceId, outputPath, options = {}) {
  const text = requireNonEmptyString(narrationText, 'narrationText');
  const normalizedVoiceId = requireNonEmptyString(voiceId, 'voiceId');
  const targetPath = requireNonEmptyString(outputPath, 'outputPath');
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('ElevenLabs narration requires ELEVENLABS_API_KEY to be configured.');
  }
  if(/[\r\n"]/.test(apiKey))throw new Error('ElevenLabs credential has an invalid header format.');

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const modelId = options.modelId || ELEVENLABS_MODEL_ID;
  const voiceSettings = options.voiceSettings || DEFAULT_VOICE_SETTINGS;
  const budgetPath=process.env.MOBIUS_NARRATION_BUDGET_LEDGER;
  if(budgetPath){
    const lock=fsSync.openSync(`${budgetPath}.lock`,'wx');
    try {const budget=JSON.parse(fsSync.readFileSync(budgetPath));
      if(budget.blocker||budget.calls.length>=budget.maxCalls||budget.calls.reduce((sum,c)=>sum+c.characters,0)+text.length>budget.maxCharacters)throw new Error('NARRATION_BUDGET_EXHAUSTED_OR_BLOCKED');
      budget.calls.push({textHash:crypto.createHash('sha256').update(text).digest('hex'),characters:text.length,model:modelId,at:new Date().toISOString()});
      fsSync.writeFileSync(`${budgetPath}.tmp`,JSON.stringify(budget,null,2));fsSync.renameSync(`${budgetPath}.tmp`,budgetPath);
    }finally{fsSync.closeSync(lock);fsSync.unlinkSync(`${budgetPath}.lock`);}
  }
  const curlArguments = [
    '-s',
    '--fail',
    '-X',
    'POST',
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(normalizedVoiceId)}`,
    '--config',
    '-',
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify({ text, model_id: modelId, voice_settings: voiceSettings }),
    '--output',
    targetPath,
  ];

  try {
    await new Promise((resolve,reject)=>{
      const child=execFile('curl',curlArguments,{maxBuffer:1024*1024,windowsHide:true},error=>error?reject(error):resolve());
      // Credentials never appear in argv/process listings or thrown command text.
      child.stdin.end(`header = "xi-api-key: ${apiKey}"\n`);
    });
  } catch (error) {
    const status=String(error?.stderr||'').match(/(?:HTTP[^\d]*|error:\s*)(\d{3})/i)?.[1]||null;
    if(budgetPath){const budget=JSON.parse(fsSync.readFileSync(budgetPath));budget.blocker={provider:'elevenlabs',httpStatus:status,at:new Date().toISOString()};
      fsSync.writeFileSync(`${budgetPath}.tmp`,JSON.stringify(budget,null,2));fsSync.renameSync(`${budgetPath}.tmp`,budgetPath);}
    throw Object.assign(new Error(`ElevenLabs narration request failed${status?`: HTTP ${status}`:''}`),{code:'ELEVENLABS_REQUEST_FAILED',statusCode:status?Number(status):null});
  }

  return targetPath;
}

export { DEFAULT_VOICE_SETTINGS, ELEVENLABS_MODEL_ID };
