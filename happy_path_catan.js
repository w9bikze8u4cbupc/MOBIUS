#!/usr/bin/env node

/**
 * Happy Path Script for Catan Tutorial Generation
 * This script automates the entire flow from storyboard generation to video rendering
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const GAME_NAME = 'CATAN';
const BGG_URL = 'https://boardgamegeek.com/boardgame/13/catan';

console.log(`🚀 Starting happy path for ${GAME_NAME}...`);

// Step 1: Extract BGG metadata
console.log('1️⃣ Extracting BGG metadata...');
try {
  execSync(`curl -X POST http://localhost:5001/api/extract-bgg-html -H "Content-Type: application/json" -d "{\\"bggUrl\\": \\"${BGG_URL}\\"}" -o work/bgg.html.extract.json`, { stdio: 'inherit' });
  console.log('   ✅ BGG metadata extracted');
} catch (error) {
  console.error('   ❌ Failed to extract BGG metadata:', error.message);
  process.exit(1);
}

// Step 2: Generate EN storyboard
console.log('2️⃣ Generating English storyboard...');
try {
  const components = JSON.parse(fs.readFileSync('work/components.json', 'utf8')).components;
  const actions = fs.existsSync('work/actions.json') ? JSON.parse(fs.readFileSync('work/actions.json', 'utf8')).actions : [];
  
  const enPayload = {
    lang: 'en',
    policy: { minWords: 250, maxWords: 900, extend: false },
    components: components,
    actions: actions
  };
  
  fs.writeFileSync('work/en_payload.json', JSON.stringify(enPayload, null, 2));
  
  execSync(`curl -X POST http://localhost:5001/api/generate-storyboard -H "Content-Type: application/json" -d @work/en_payload.json -o work/script.en.json`, { stdio: 'inherit' });
  console.log('   ✅ English storyboard generated');
} catch (error) {
  console.error('   ❌ Failed to generate English storyboard:', error.message);
  process.exit(1);
}

// Step 3: Generate FR storyboard
console.log('3️⃣ Generating French storyboard...');
try {
  const components = JSON.parse(fs.readFileSync('work/components.json', 'utf8')).components;
  const actions = fs.existsSync('work/actions.json') ? JSON.parse(fs.readFileSync('work/actions.json', 'utf8')).actions : [];
  
  const frPayload = {
    lang: 'fr',
    policy: { minWords: 250, maxWords: 900, extend: false },
    components: components,
    actions: actions
  };
  
  fs.writeFileSync('work/fr_payload.json', JSON.stringify(frPayload, null, 2));
  
  execSync(`curl -X POST http://localhost:5001/api/generate-storyboard -H "Content-Type: application/json" -d @work/fr_payload.json -o work/script.fr.json`, { stdio: 'inherit' });
  console.log('   ✅ French storyboard generated');
} catch (error) {
  console.error('   ❌ Failed to generate French storyboard:', error.message);
  process.exit(1);
}

// Step 4: Fetch images
console.log('4️⃣ Fetching images...');
try {
  execSync(`curl -X POST http://localhost:5001/api/fetch-bgg-images -H "Content-Type: application/json" -d "{\\"bggUrl\\": \\"${BGG_URL}\\"}" -o work/images.search.json`, { stdio: 'inherit' });
  console.log('   ✅ Images fetched');
} catch (error) {
  console.error('   ❌ Failed to fetch images:', error.message);
  process.exit(1);
}

// Step 5: Build timeline (EN)
console.log('5️⃣ Building English timeline...');
try {
  const code = `
import { readFileSync, writeFileSync } from 'fs';
const sb = JSON.parse(readFileSync('work/script.en.json','utf8'));
const im = JSON.parse(readFileSync('work/images.search.json','utf8'));
const storyboard = sb.storyboard.scenes || [];
const results = im.images || [];
const timeline = { fps: 30, width: 1920, height: 1080, tracks: [{ type:'video', clips: [] }, { type:'audio', clips: [] }] };
let t = 0;
for (let i=0;i<storyboard.length;i++){
  const scene = storyboard[i];
  const firstSegment = scene.segments && scene.segments[0];
  const url = (results[i]?.path) || (results[0]?.path) || '';
  const wc = firstSegment?.textEn ? firstSegment.textEn.split(/\\s+/).filter(Boolean).length : 20;
  const dur = Math.max(4, Math.min(20, Math.round((wc||20)/2.5)));
  timeline.tracks[0].clips.push({ type:'image', src:url, start:t, duration:dur, fit:'cover' });
  t += dur;
}
writeFileSync('work/timeline.en.json', JSON.stringify(timeline, null, 2));
console.log('timeline seconds:', t);
`;
  fs.writeFileSync('work/build_timeline.js', code);
  execSync('node work/build_timeline.js', { stdio: 'inherit' });
  console.log('   ✅ English timeline built');
} catch (error) {
  console.error('   ❌ Failed to build English timeline:', error.message);
  process.exit(1);
}

// Step 6: Audit and replace remote assets
console.log('6️⃣ Auditing and replacing remote assets...');
try {
  // Get local images
  const localImgs = execSync('Get-ChildItem -Path .\\src\\api\\uploads -Recurse -Include *.png,*.jpg | Select-Object -First 100 -ExpandProperty FullName', { shell: 'powershell.exe' }).toString().trim().split('\r\n').filter(Boolean);
  fs.writeFileSync('work/local-imgs.json', JSON.stringify(localImgs, null, 2));
  
  const replaceCode = `
import { readFileSync, writeFileSync } from 'fs';

const timeline = JSON.parse(readFileSync('work/timeline.en.json','utf8'));
const local = JSON.parse(readFileSync('work/local-imgs.json','utf8'));

let i = 0;
for (const clip of (timeline.tracks?.[0]?.clips||[])) {
  if (clip.type==='image' && clip.src?.startsWith('http')) {
    clip.src = local[i % local.length];
    i++;
  }
}

writeFileSync('work/timeline.en.json', JSON.stringify(timeline, null, 2));
console.log('local images assigned:', i);
`;
  fs.writeFileSync('work/replace_assets.js', replaceCode);
  execSync('node work/replace_assets.js', { stdio: 'inherit' });
  console.log('   ✅ Assets audited and replaced');
} catch (error) {
  console.error('   ❌ Failed to audit/replace assets:', error.message);
  process.exit(1);
}

// Step 7: Synthesize TTS (EN)
console.log('7️⃣ Synthesizing English TTS...');
try {
  const en = JSON.parse(fs.readFileSync('work/script.en.json', 'utf8'));
  const textEn = (en.storyboard.scenes.segments || []).map(seg => seg.textEn).join(" ");
  
  const ttsPayload = {
    text: textEn,
    language: "en",
    voice: "21m00Tcm4TlvDq8ikWAM",
    gameName: GAME_NAME
  };
  
  fs.writeFileSync('work/tts_en_payload.json', JSON.stringify(ttsPayload, null, 2));
  
  execSync(`curl -X POST http://localhost:5001/tts -H "Content-Type: application/json" -d @work/tts_en_payload.json -o work/tts.en.mp3`, { stdio: 'inherit' });
  console.log('   ✅ English TTS synthesized');
} catch (error) {
  console.error('   ❌ Failed to synthesize English TTS:', error.message);
  process.exit(1);
}

// Step 8: Synthesize TTS (FR)
console.log('8️⃣ Synthesizing French TTS...');
try {
  const fr = JSON.parse(fs.readFileSync('work/script.fr.json', 'utf8'));
  const textFr = (fr.storyboard.scenes.segments || []).map(seg => seg.textFr).join(" ");
  
  const ttsPayload = {
    text: textFr,
    language: "fr",
    voice: "21m00Tcm4TlvDq8ikWAM",
    gameName: GAME_NAME
  };
  
  fs.writeFileSync('work/tts_fr_payload.json', JSON.stringify(ttsPayload, null, 2));
  
  execSync(`curl -X POST http://localhost:5001/tts -H "Content-Type: application/json" -d @work/tts_fr_payload.json -o work/tts.fr.mp3`, { stdio: 'inherit' });
  console.log('   ✅ French TTS synthesized');
} catch (error) {
  console.error('   ❌ Failed to synthesize French TTS:', error.message);
  process.exit(1);
}

// Step 9: Convert timeline for renderer
console.log('9️⃣ Converting timeline for renderer...');
try {
  const convertCode = `
import { readFileSync, writeFileSync } from 'fs';

const currentTimeline = JSON.parse(readFileSync('work/timeline.en.json','utf8'));
const timeline = [];
let time = 0;

for (let i = 0; i < currentTimeline.tracks[0].clips.length; i++) {
  const clip = currentTimeline.tracks[0].clips[i];
  
  timeline.push({
    id: \`shot:\${i}\`,
    type: 'components',
    start: time,
    end: time + clip.duration,
    data: {
      template: 'generic'
    }
  });
  
  time += clip.duration;
}

const output = {
  timeline: timeline
};

writeFileSync('work/converted_timeline.json', JSON.stringify(output, null, 2));
console.log('Converted timeline with', timeline.length, 'shots');
console.log('Total duration:', time, 'seconds');
`;
  fs.writeFileSync('work/convert_timeline.js', convertCode);
  execSync('node work/convert_timeline.js', { stdio: 'inherit' });
  console.log('   ✅ Timeline converted');
} catch (error) {
  console.error('   ❌ Failed to convert timeline:', error.message);
  process.exit(1);
}

// Step 10: Render MP4
console.log('🔟 Rendering MP4...');
try {
  // Create assets directory
  if (!fs.existsSync('work/assets')) {
    fs.mkdirSync('work/assets', { recursive: true });
  }
  
  // Copy placeholder images
  execSync('copy assets\\placeholder.png work\\assets\\', { stdio: 'inherit', shell: 'cmd.exe' });
  execSync('copy assets\\placeholder.png work\\assets\\table_bg.png', { stdio: 'inherit', shell: 'cmd.exe' });
  
  // Render
  execSync('node scripts/render-ffmpeg.mjs work/converted_timeline.json work/assets dist/tutorial.en.mp4 --preview', { stdio: 'inherit' });
  console.log('   ✅ MP4 rendered');
} catch (error) {
  console.error('   ❌ Failed to render MP4:', error.message);
  process.exit(1);
}

// Step 11: Run CI validation
console.log('1️⃣1️⃣ Running CI validation...');
try {
  execSync('npm run ci:validate', { stdio: 'inherit' });
  console.log('   ✅ CI validation passed');
} catch (error) {
  console.error('   ❌ CI validation failed:', error.message);
  process.exit(1);
}

console.log(`\n🎉 Happy path completed successfully for ${GAME_NAME}!`);
console.log('📁 Output files:');
console.log('   - work/script.en.json');
console.log('   - work/script.fr.json');
console.log('   - work/timeline.en.json');
console.log('   - work/tts.en.mp3');
console.log('   - work/tts.fr.mp3');
console.log('   - dist/tutorial.en.mp4');