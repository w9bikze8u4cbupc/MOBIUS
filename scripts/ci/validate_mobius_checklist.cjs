#!/usr/bin/env node
/**
 * Mobius Checklist Validator
 * Validates auto items from ci/mobius_checklist.json against artifacts:
 * - JUnit XML reports under tests/golden/reports (default)
 * - container.json under tests/golden/${GAME}/${OS}
 * - baseline PNGs under tests/golden/${GAME}/${OS}
 *
 * Usage examples:
 *   node scripts/ci/validate_mobius_checklist.js --game=hanamikoji
 *   RUNNER_OS=macOS node scripts/ci/validate_mobius_checklist.js --game hanamikoji --reports_glob_dir tests/golden/reports
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.includes('=') ? a.slice(2).split('=') : [a.slice(2), argv[i + 1]];
      if (!a.includes('=') && v && !v.startsWith('--')) i++;
      out[k] = (v || '').trim();
    }
  }
  return out;
}

function osSlug() {
  const ro = process.env.RUNNER_OS;
  if (ro === 'Windows') return 'Windows';
  if (ro === 'macOS') return 'macOS';
  if (ro === 'Linux') return 'Linux';
  // Fallback to Node's platform
  const p = process.platform;
  if (p === 'win32') return 'Windows';
  if (p === 'darwin') return 'macOS';
  return 'Linux';
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function listFilesRecursive(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    const ents = fs.readdirSync(d, { withFileTypes: true });
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) stack.push(fp);
      else if (!exts || exts.includes(path.extname(e.name).toLowerCase())) out.push(fp);
    }
  }
  return out;
}

function getField(obj, dotted) {
  return dotted.split('.').reduce((acc, k) => (acc && k in acc ? acc[k] : undefined), obj);
}

function replaceVars(str, vars) {
  return str.replace(/\$\{(\w+)\}/g, (_, k) => vars[k] || '');
}

function getJUnitSummary(xml) {
  // naive parser: sum failures/errors across testsuite attributes
  const suites = [...xml.matchAll(/<testsuite\b[^>]*>/g)];
  let tests = 0, failures = 0, errors = 0;
  for (const m of suites) {
    const tag = m[0];
    const tf = /tests="(\d+)"/.exec(tag); tests += tf ? +tf[1] : 0;
    const ff = /failures="(\d+)"/.exec(tag); failures += ff ? +ff[1] : 0;
    const ee = /errors="(\d+)"/.exec(tag); errors += ee ? +ee[1] : 0;
  }
  return { tests, failures, errors };
}

function verifyJUnitAllPass(reportsDir) {
  const xmls = listFilesRecursive(reportsDir, ['.xml']);
  if (xmls.length === 0) {
    return { ok: false, msg: `No JUnit XML found in ${reportsDir}` };
  }
  let total = { tests: 0, failures: 0, errors: 0 };
  for (const f of xmls) {
    const xml = fs.readFileSync(f, 'utf8');
    const s = getJUnitSummary(xml);
    total.tests += s.tests; total.failures += s.failures; total.errors += s.errors;
  }
  const ok = total.failures === 0 && total.errors === 0;
  const msg = `JUnit summary: tests=${total.tests}, failures=${total.failures}, errors=${total.errors}`;
  return { ok, msg };
}

function verifyBaselinesExist(dir) {
  if (!fs.existsSync(dir)) return { ok: false, msg: `Baseline dir missing: ${dir}` };
  const pngs = listFilesRecursive(dir, ['.png']).filter(p => !p.includes('/debug/'));
  const hit = { '5s': false, '10s': false, '20s': false };
  for (const p of pngs) {
    const name = path.basename(p).toLowerCase();
    if (name.includes('5s')) hit['5s'] = true;
    if (name.includes('10s')) hit['10s'] = true;
    if (name.includes('20s')) hit['20s'] = true;
  }
  const missing = Object.entries(hit).filter(([, v]) => !v).map(([k]) => k);
  const ok = missing.length === 0;
  const msg = ok ? `Baselines present for 5s/10s/20s under ${dir}` : `Missing baseline(s): ${missing.join(', ')} in ${dir}`;
  return { ok, msg };
}

function verifyContainerFields(jsonPath, fields) {
  if (!fileExists(jsonPath)) return { ok: false, msg: `container.json missing: ${jsonPath}` };
  let obj;
  try { obj = readJson(jsonPath); } catch (e) { return { ok: false, msg: `Invalid JSON: ${jsonPath}` }; }
  const missing = [];
  for (const f of fields) {
    const v = getField(obj, f);
    if (v === undefined || v === null || v === '') missing.push(f);
  }
  const ok = missing.length === 0;
  const msg = ok ? `container.json fields present` : `Missing fields in container.json: ${missing.join(', ')}`;
  return { ok, msg };
}

function isDirEmpty(dir) {
  if (!fs.existsSync(dir)) return true;
  const files = fs.readdirSync(dir).filter(n => n !== '.' && n !== '..');
  return files.length === 0;
}

function verifyDebugEmptyOnPass(debugDir, reportsDir) {
  const junit = verifyJUnitAllPass(reportsDir);
  if (!junit.ok) {
    return { ok: true, warning: true, msg: `JUnit not passing; debug dir may contain expected diffs` };
  }
  const empty = isDirEmpty(debugDir);
  const ok = empty;
  const msg = empty ? `Debug directory is clean (${debugDir})` : `Debug directory not empty on pass: ${debugDir}`;
  return { ok, msg, warning: !ok };
}

function main() {
  const args = parseArgs(process.argv);
  const GAME = args.game || args.GAME;
  if (!GAME) {
    console.error('ERROR: --game <name> is required');
    process.exit(2);
  }
  const OS = args.os || args.OS || osSlug();
  const checklistPath = args.checklist || 'golden-tests/ci/mobius_checklist.json';

  if (!fileExists(checklistPath)) {
    console.error(`ERROR: Checklist JSON not found: ${checklistPath}`);
    process.exit(2);
  }
  const checklist = readJson(checklistPath);

  const vars = {
    GAME,
    OS,
    golden_dir: replaceVars(checklist.defaults.golden_dir, { GAME, OS }),
    reports_glob_dir: checklist.defaults.reports_glob_dir
  };

  const results = [];
  for (const item of checklist.items) {
    if (item.type !== 'auto') {
      results.push({ id: item.id, required: item.required, status: 'manual', msg: 'Manual review (not CI-enforced)' });
      continue;
    }
    const v = item.verifier;
    let outcome = { ok: false, msg: `Unknown verifier: ${v}` };
    if (v === 'junit_all_pass') {
      const dir = replaceVars((item.params && item.params.reports_glob_dir) || vars.reports_glob_dir, vars);
      outcome = verifyJUnitAllPass(dir);
    } else if (v === 'baselines_exist') {
      const dir = replaceVars((item.params && item.params.dir) || vars.golden_dir, vars);
      outcome = verifyBaselinesExist(dir);
    } else if (v === 'container_json_fields') {
      const base = replaceVars((item.params && item.params.base) || `${vars.golden_dir}/container.json`, vars);
      const fields = (item.params && item.params.fields) || [];
      outcome = verifyContainerFields(base, fields);
    } else if (v === 'debug_empty_on_pass') {
      const ddir = replaceVars((item.params && item.params.dir) || `${vars.golden_dir}/debug`, vars);
      const rdir = replaceVars((item.params && item.params.reports_glob_dir) || vars.reports_glob_dir, vars);
      outcome = verifyDebugEmptyOnPass(ddir, rdir);
    }
    const status = outcome.ok ? 'pass' : (outcome.warning ? 'warn' : 'fail');
    results.push({ id: item.id, required: item.required, status, msg: outcome.msg });
  }

  // Print transparent output
  let fails = 0, warns = 0, passes = 0, manuals = 0;
  for (const r of results) {
    const tag = r.status.toUpperCase().padEnd(5);
    console.log(`[${tag}] ${r.id}: ${r.msg}`);
    if (r.status === 'fail' && r.required) fails++;
    else if (r.status === 'warn') warns++;
    else if (r.status === 'pass') passes++;
    else if (r.status === 'manual') manuals++;
  }
  console.log(`Summary: pass=${passes}, warn=${warns}, manual=${manuals}, fail=${fails}`);

  if (fails > 0) process.exit(1);
}

main();