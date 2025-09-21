#!/usr/bin/env node
 
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats');

function readJson(p) {
  const abs = path.resolve(p);
  const raw = fs.readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${abs}\n${e.message}`);
  }
}

function getArg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function getAllArgs(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name && i + 1 < process.argv.length) {
      out.push(process.argv[i + 1]);
    }
  }
  return out;
}

const schemaPath = getArg('--schema');
const dataPaths = getAllArgs('--data');

if (!schemaPath || dataPaths.length === 0) {
  console.error('Usage: node scripts/validate-schema.cjs --schema <schema.json> --data <file1.json> [--data <file2.json> ...]');
  process.exit(2);
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let failed = 0;
let passed = 0;

try {
  const schema = readJson(schemaPath);
  const validate = ajv.compile(schema);

  for (const p of dataPaths) {
    let ok = false;
    try {
      const data = readJson(p);
      ok = validate(data);
      if (ok) {
        console.log(`PASS: ${p}`);
        passed++;
      } else {
        console.error(`FAIL: ${p}`);
        console.error(ajv.errorsText(validate.errors, { separator: '\n  ' }));
        failed++;
      }
    } catch (e) {
      console.error(`ERROR reading ${p}: ${e.message}`);
      failed++;
    }
  }
} catch (e) {
  console.error(`ERROR compiling schema: ${e.message}`);
  process.exit(2);
}

console.log(`Summary: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);