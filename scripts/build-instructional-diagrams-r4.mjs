import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { buildRulebookKnowledgeModel } = require('../src/services/rulebookKnowledge.cjs');

const ROOT = path.resolve(process.cwd());
const WIDTH = 1600;
const HEIGHT = 900;
const COLORS = Object.freeze({
  espresso: '#241710', walnut: '#3b261a', cream: '#f6ecd5', ink: '#221812',
  gold: '#c89b58', green: '#a8dc55', greenDark: '#35552a', blue: '#4f87bd',
  red: '#b24f45', yellow: '#d9ad42', purple: '#8062a8', gray: '#9f988b',
});

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1]; i += 1;
  }
  return out;
}

function escapeXml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }

function wrapText(text, max = 31) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(lines, { x = 800, y = 170, size = 54, lineHeight = 72, anchor = 'middle', color = COLORS.cream, weight = 700 } = {}) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="${anchor}" fill="${color}" font-family="Nunito,Arial,sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`).join('');
}

function svgFrame(atom, body, { subtitle = null } = {}) {
  const title = atom.teaching?.heading || atom.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1c120d"/><stop offset="0.5" stop-color="#3d281c"/><stop offset="1" stop-color="#261710"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#000" flood-opacity=".35"/></filter>
      <pattern id="grain" width="19" height="19" patternUnits="userSpaceOnUse"><path d="M0 5 Q9 0 19 5 M0 15 Q9 10 19 15" fill="none" stroke="#d8ad70" stroke-opacity=".045" stroke-width="2"/></pattern>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${COLORS.green}"/></marker>
    </defs>
    <rect width="1600" height="900" rx="48" fill="url(#bg)"/>
    <rect x="18" y="18" width="1564" height="864" rx="42" fill="url(#grain)" stroke="${COLORS.gold}" stroke-width="4"/>
    <text x="800" y="86" text-anchor="middle" fill="${COLORS.cream}" font-family="Lora,Georgia,serif" font-size="58" font-weight="700">${escapeXml(title)}</text>
    ${subtitle ? `<text x="800" y="125" text-anchor="middle" fill="${COLORS.gold}" font-family="Nunito,Arial,sans-serif" font-size="26">${escapeXml(subtitle)}</text>` : ''}
    ${body}
  </svg>`;
}

function card(x, y, w, h, { face = 'up', label = '', color = COLORS.cream, highlight = false } = {}) {
  const fill = face === 'down' ? '#66533f' : color;
  const inner = face === 'down'
    ? `<path d="M${x + 10} ${y + 10} L${x + w - 10} ${y + h - 10} M${x + w - 10} ${y + 10} L${x + 10} ${y + h - 10}" stroke="${COLORS.gold}" stroke-opacity=".45" stroke-width="5"/>`
    : `<rect x="${x + 9}" y="${y + 9}" width="${w - 18}" height="${Math.max(12, h * .18)}" rx="5" fill="${COLORS.greenDark}" opacity=".82"/><circle cx="${x + w * .74}" cy="${y + h * .67}" r="${Math.min(w, h) * .13}" fill="${COLORS.gold}" opacity=".8"/>`;
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${highlight ? COLORS.green : COLORS.gold}" stroke-width="${highlight ? 8 : 3}"/>${inner}${label ? `<text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" fill="${face === 'down' ? COLORS.cream : COLORS.ink}" font-family="Nunito,Arial,sans-serif" font-size="${Math.max(16, Math.min(30, w / 5))}" font-weight="800">${escapeXml(label)}</text>` : ''}</g>`;
}

function ageRows(rows, x, y, width, height, { label, highlightAccessible = false, maxCardWidth = 76, maxRowHeight = 96 } = {}) {
  const rowGap = 9;
  const rowHeight = Math.min(maxRowHeight, (height - rowGap * (rows.length - 1)) / rows.length);
  let out = `<text x="${x + width / 2}" y="${y - 22}" text-anchor="middle" fill="${COLORS.green}" font-family="Lora,Georgia,serif" font-size="40" font-weight="700">${escapeXml(label)}</text>`;
  rows.forEach((row, rowIndex) => {
    const cardWidth = Math.min(maxCardWidth, (width - 14 * (row.count - 1)) / row.count);
    const total = cardWidth * row.count + 14 * (row.count - 1);
    const start = x + (width - total) / 2;
    for (let i = 0; i < row.count; i += 1) {
      const isAccessible = highlightAccessible && rowIndex === rows.length - 1;
      out += card(start + i * (cardWidth + 14), y + rowIndex * (rowHeight + rowGap), cardWidth, rowHeight, { face: row.face, highlight: isAccessible });
    }
  });
  return out;
}

function buildAgeLayouts(atom, model, { ageIndexes = null, accessible = false } = {}) {
  const ages = model.diagramData?.ageLayouts?.ages || [];
  const requested = Array.isArray(ageIndexes) && ageIndexes.length
    ? ageIndexes.map((index) => ages[Number(index)]).filter(Boolean)
    : ages;
  if (accessible) {
    const age = requested[0] || ages[0];
    const body = `${ageRows(age.rows, 255, 205, 1090, 550, { label: age.label, highlightAccessible: true, maxCardWidth: 132, maxRowHeight: 112 })}
      <text x="800" y="825" text-anchor="middle" fill="${COLORS.green}" font-family="Nunito,Arial,sans-serif" font-size="38" font-weight="800">Contour vert = carte accessible, non recouverte</text>`;
    return svgFrame(atom, body, { subtitle: 'La structure reste complète; seules les cartes libres sont choisissables.' });
  }
  const count = requested.length;
  const geometry = count === 1
    ? { startX: 255, gap: 0, width: 1090, height: 525, maxCardWidth: 132, maxRowHeight: 110 }
    : count === 2
      ? { startX: 90, gap: 760, width: 660, height: 500, maxCardWidth: 100, maxRowHeight: 100 }
      : { startX: 70, gap: 515, width: 430, height: 500, maxCardWidth: 76, maxRowHeight: 96 };
  const body = requested.map((age, index) => ageRows(age.rows, geometry.startX + index * geometry.gap, 220, geometry.width, geometry.height, {
    label: age.label,
    maxCardWidth: geometry.maxCardWidth,
    maxRowHeight: geometry.maxRowHeight,
  })).join('') +
    `<g transform="translate(430 785)"><rect width="48" height="66" rx="6" fill="${COLORS.cream}" stroke="${COLORS.gold}" stroke-width="3"/><text x="63" y="43" fill="${COLORS.cream}" font-family="Nunito,Arial,sans-serif" font-size="30">Face visible</text><rect x="350" width="48" height="66" rx="6" fill="#66533f" stroke="${COLORS.gold}" stroke-width="3"/><path d="M358 10 L390 56 M390 10 L358 56" stroke="${COLORS.gold}" stroke-width="4"/><text x="413" y="43" fill="${COLORS.cream}" font-family="Nunito,Arial,sans-serif" font-size="30">Face cachée</text></g>`;
  return svgFrame(atom, body, { subtitle: count === 1 ? 'Structure complète — 20 cartes' : 'Structures complètes — 20 cartes par âge' });
}

function buildComponentGrid(atom) {
  const labels = atom.teaching?.displayLines || atom.visualRequirement.requiredObjects;
  const colors = [COLORS.blue, COLORS.yellow, COLORS.green, COLORS.purple, COLORS.red, COLORS.gray];
  const body = labels.map((label, index) => {
    const col = index % 2; const row = Math.floor(index / 2);
    const x = 145 + col * 680; const y = 190 + row * 205;
    return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="630" height="150" rx="28" fill="#f4ead4" stroke="${COLORS.gold}" stroke-width="4"/><circle cx="${x + 80}" cy="${y + 75}" r="44" fill="${colors[index % colors.length]}"/><text x="${x + 150}" y="${y + 90}" fill="${COLORS.ink}" font-family="Nunito,Arial,sans-serif" font-size="42" font-weight="800">${escapeXml(label)}</text></g>`;
  }).join('');
  return svgFrame(atom, body);
}

function buildMilitary(atom, model) {
  const data = model.diagramData?.militaryTrack || {};
  const spaces = Number(data.spaces || 19); const startX = 150; const endX = 1450; const y = 410; const step = (endX - startX) / (spaces - 1);
  let ticks = '';
  for (let i = 0; i < spaces; i += 1) {
    const x = startX + i * step;
    const threshold = [4, 6, 12, 14].includes(i);
    ticks += `<circle cx="${x}" cy="${y}" r="${threshold ? 22 : 14}" fill="${i === Math.floor(spaces / 2) ? COLORS.green : threshold ? COLORS.yellow : COLORS.cream}" stroke="${COLORS.gold}" stroke-width="3"/>`;
  }
  const body = `<text x="150" y="255" fill="${COLORS.cream}" font-family="Nunito,Arial,sans-serif" font-size="36" font-weight="800">Votre capitale</text><text x="1450" y="255" text-anchor="end" fill="${COLORS.cream}" font-family="Nunito,Arial,sans-serif" font-size="36" font-weight="800">Capitale adverse</text>
    <line x1="150" y1="410" x2="1450" y2="410" stroke="${COLORS.gold}" stroke-width="14"/>${ticks}
    <path d="M760 330 L930 330" stroke="${COLORS.green}" stroke-width="12" marker-end="url(#arrow)"/><text x="845" y="295" text-anchor="middle" fill="${COLORS.green}" font-family="Nunito,Arial,sans-serif" font-size="34" font-weight="800">1 bouclier = 1 case</text>
    <text x="410" y="520" text-anchor="middle" fill="${COLORS.yellow}" font-family="Nunito,Arial,sans-serif" font-size="34" font-weight="800">−5 pièces</text><text x="585" y="520" text-anchor="middle" fill="${COLORS.yellow}" font-family="Nunito,Arial,sans-serif" font-size="34" font-weight="800">−2 pièces</text>
    <text x="1015" y="520" text-anchor="middle" fill="${COLORS.yellow}" font-family="Nunito,Arial,sans-serif" font-size="34" font-weight="800">−2 pièces</text><text x="1190" y="520" text-anchor="middle" fill="${COLORS.yellow}" font-family="Nunito,Arial,sans-serif" font-size="34" font-weight="800">−5 pièces</text>
    <rect x="200" y="640" width="1200" height="100" rx="24" fill="#f4ead4" stroke="${COLORS.gold}" stroke-width="4"/><text x="800" y="705" text-anchor="middle" fill="${COLORS.ink}" font-family="Nunito,Arial,sans-serif" font-size="32" font-weight="800">Atteindre la capitale adverse = suprématie militaire immédiate</text>`;
  return svgFrame(atom, body);
}

function buildScoring(atom, model) {
  const rows = model.diagramData?.scoringLedger || ['Militaire', 'Bâtiments', 'Merveilles', 'Progrès', 'Trésorerie', 'Total'];
  const diagramKind = atom.visualRequirement?.diagramKind;
  const highlightLabel = atom.visualRequirement?.highlightLabel || null;
  const body = rows.map((label, index) => {
    const y = 160 + index * 105;
    const selected = ['SCORING_LEDGER_OVERVIEW', 'SCORING_LEDGER_TOTAL'].includes(diagramKind) || highlightLabel === label;
    const note = label === 'Militaire' ? '0 / 2 / 5 / 10' : label === 'Trésorerie' ? '3 pièces = 1 point' : label === 'Total' ? 'Addition finale' : 'Points vérifiés';
    return `<g><rect x="260" y="${y}" width="1080" height="82" rx="18" fill="${selected ? '#f4ead4' : '#56402e'}" stroke="${selected ? COLORS.green : COLORS.gold}" stroke-width="${selected ? 6 : 3}"/><text x="310" y="${y + 54}" fill="${selected ? COLORS.ink : COLORS.cream}" font-family="Nunito,Arial,sans-serif" font-size="38" font-weight="800">${escapeXml(label)}</text><text x="1290" y="${y + 52}" text-anchor="end" fill="${selected ? COLORS.greenDark : COLORS.gold}" font-family="Nunito,Arial,sans-serif" font-size="31" font-weight="700">${escapeXml(note)}</text></g>`;
  }).join('');
  return svgFrame(atom, body, { subtitle: 'Registre MOBIUS fondé sur les catégories vérifiées du livret' });
}

function buildFlow(atom) {
  // The diagram presents concise teaching atoms; narration carries the full
  // source-grounded procedure. A bounded grid keeps type mobile-readable
  // instead of shrinking five horizontal columns into postcard-sized text.
  const source = atom.teaching?.displayLines?.length ? atom.teaching.displayLines : atom.procedureSteps || [];
  const steps = source.slice(0, 5);
  const count = Math.max(1, steps.length);
  const columns = count <= 3 ? count : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const boxWidth = columns === 3 ? 430 : columns === 2 ? 570 : 760;
  const gapX = columns === 3 ? 45 : 70;
  const boxHeight = rows === 1 ? 330 : 225;
  const gapY = 40;
  const totalWidth = columns * boxWidth + (columns - 1) * gapX;
  const startX = (WIDTH - totalWidth) / 2;
  const startY = rows === 1 ? 245 : 175;
  let body = '';
  steps.forEach((step, index) => {
    const row = Math.floor(index / columns); const col = index % columns;
    const rowItems = Math.min(columns, count - row * columns);
    const rowWidth = rowItems * boxWidth + (rowItems - 1) * gapX;
    const rowStartX = (WIDTH - rowWidth) / 2;
    const x = rowStartX + col * (boxWidth + gapX); const y = startY + row * (boxHeight + gapY);
    const itemFont = columns === 3 ? 38 : 42;
    const chars = Math.max(12, Math.floor((boxWidth - 90) / (itemFont * 0.58)));
    const cleanStep = String(step).replace(/^\s*[→➜]\s*/, '');
    const lines = wrapText(cleanStep, chars).slice(0, 3);
    body += `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="28" fill="#f4ead4" stroke="${COLORS.gold}" stroke-width="4"/><circle cx="${x + 48}" cy="${y + 48}" r="29" fill="${COLORS.greenDark}"/><text x="${x + 48}" y="${y + 60}" text-anchor="middle" fill="${COLORS.cream}" font-family="Nunito,Arial,sans-serif" font-size="32" font-weight="900">${index + 1}</text>${textLines(lines, { x: x + boxWidth / 2, y: y + (rows === 1 ? 130 : 105), size: itemFont, lineHeight: columns === 3 ? 49 : 54, color: COLORS.ink })}</g>`;
  });
  const result = atom.result ? wrapText(atom.result, 68).slice(0, 2) : [];
  body += `<rect x="230" y="735" width="1140" height="100" rx="24" fill="#314928" stroke="${COLORS.green}" stroke-width="4"/>${textLines(result, { x: 800, y: 790, size: 34, lineHeight: 38 })}`;
  return svgFrame(atom, body);
}

function buildComparison(atom) {
  const lines = atom.teaching?.displayLines || atom.procedureSteps || [];
  const half = Math.ceil(lines.length / 2);
  const groups = [lines.slice(0, half), lines.slice(half)];
  const body = groups.map((group, index) => {
    const x = 110 + index * 750;
    return `<g filter="url(#shadow)"><rect x="${x}" y="205" width="630" height="500" rx="34" fill="${index ? '#3f3153' : '#304c2e'}" stroke="${index ? COLORS.purple : COLORS.green}" stroke-width="5"/>${textLines(group.flatMap((line) => wrapText(line, 31)), { x: x + 315, y: 310, size: 39, lineHeight: 76 })}</g>`;
  }).join('');
  return svgFrame(atom, body);
}

function buildDiagram(atom, model) {
  const composition = atom.visualRequirement?.preferredComposition || 'PROCEDURE_FLOW';
  const diagramKind = atom.visualRequirement?.diagramKind || null;
  if (['AGE_LAYOUT_OVERVIEW', 'AGE_LAYOUT_FOCUS', 'AGE_LAYOUT_REFERENCE'].includes(diagramKind)) {
    return buildAgeLayouts(atom, model, { ageIndexes: atom.visualRequirement?.ageIndexes, accessible: false });
  }
  if (diagramKind === 'AGE_ACCESSIBILITY') {
    return buildAgeLayouts(atom, model, { ageIndexes: atom.visualRequirement?.ageIndexes, accessible: true });
  }
  if (composition === 'HORIZONTAL_TRACK_FOCUS') return buildMilitary(atom, model);
  if (composition.startsWith('SCORING_LEDGER')) return buildScoring(atom, model);
  if (composition === 'LABELED_COMPONENT_GRID') return buildComponentGrid(atom);
  if (['COMPARISON', 'CENTERED_CALLOUT', 'MATCHING_SYMBOL_FLOW'].includes(composition)) return buildComparison(atom);
  return buildFlow(atom);
}

async function main() {
  const args = parseArgs();
  if (!args.knowledge || !args.out) throw new Error('Usage: --knowledge <rulebook-knowledge.json> --out <visual-output-directory>');
  const knowledgePath = path.resolve(args.knowledge);
  const outputDir = path.resolve(args.out);
  const seed = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
  const model = seed.contract ? seed : buildRulebookKnowledgeModel({ projectSeed: seed });
  fs.mkdirSync(outputDir, { recursive: true });
  const assets = [];
  for (const atom of model.ruleAtoms.filter((entry) => entry.reviewState === 'accepted' && entry.teaching?.narration)) {
    const target = path.join(outputDir, `${atom.id}.png`);
    const svg = buildDiagram(atom, model);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(target);
    const metadata = await sharp(target).metadata();
    assets.push({
      id: `visual-${atom.id}`,
      atomIds: [atom.id],
      filePath: target,
      sourceType: 'DETERMINISTIC_VECTOR',
      visualUtility: 'EXACT_INSTRUCTIONAL',
      semanticObjects: atom.visualRequirement.requiredObjects,
      visibleLabels: [...atom.visualRequirement.requiredLabels, ...(atom.teaching.displayLines || [])],
      relationship: atom.visualRequirement.requiredRelationship,
      width: metadata.width,
      height: metadata.height,
      sourceDimensions: { width: metadata.width, height: metadata.height },
      nativeMaster: true,
      reviewedDerivative: true,
      dominantInstructionalLanguage: 'fr-CA',
      cropCompleteness: 'complete',
      cropPurity: 'clean',
      sourceRefs: atom.sourceRefs,
      provenance: { kind: 'deterministic-source-grounded-schematic', atomId: atom.id, sourcePdfSha256: model.sourcePdfSha256, generator: path.relative(ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/'), knowledgeModel: knowledgePath },
      sha256: sha256(target),
      reviewState: 'accepted',
    });
  }
  const manifest = { contract: 'mobius-instructional-visual-manifest-v1', generatedAt: new Date().toISOString(), projectId: model.projectId, sourcePdfSha256: model.sourcePdfSha256, knowledgePath, width: WIDTH, height: HEIGHT, assetCount: assets.length, assets };
  const manifestPath = path.join(outputDir, 'manifest.json');
  writeJson(manifestPath, manifest);
  console.log(JSON.stringify({ status: 'PASS', manifestPath, assets: assets.length }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

export { buildDiagram, buildAgeLayouts, buildMilitary, buildScoring };
