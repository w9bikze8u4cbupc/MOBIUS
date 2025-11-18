#!/usr/bin/env node
/**
 * MOBIUS Ingestion Contract Validator (Phase E1)
 *
 * Usage:
 *   node scripts/check_ingestion.cjs --input path/to/ingestion.json \
 *     --contract docs/spec/ingestion_contract.json \
 *     --junit out/junit/ingestion-contract.xml
 *
 * Exits:
 *   0 on success
 *   2 on contract violation
 *   3 on IO/usage error
 */

const fs = require("fs");
const path = require("path");

// --- Simple CLI arg parsing --------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

// --- Minimal JSON file loader ------------------------------------------------

function readJson(filePath, label) {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    return JSON.parse(txt);
  } catch (err) {
    console.error(`[INGESTION] Failed to read ${label} at ${filePath}: ${err.message}`);
    process.exitCode = 3;
    throw err;
  }
}

// --- Core validation ---------------------------------------------------------

function validateIngestion(ingestion, contract) {
  const errors = [];
  const warnings = [];

  // Contract version
  if (ingestion.ingestionContractVersion !== contract.contractVersion) {
    errors.push(
      `ingestionContractVersion mismatch: expected ${contract.contractVersion}, got ${ingestion.ingestionContractVersion}`
    );
  }

  // Required top-level keys
  const requiredTop = contract.required || [];
  for (const key of requiredTop) {
    if (!(key in ingestion)) {
      errors.push(`Missing required top-level key: ${key}`);
    }
  }

  // Simple shape checks (minimal, not full JSON Schema)
  if (ingestion.game) {
    if (!ingestion.game.slug || typeof ingestion.game.slug !== "string") {
      errors.push("game.slug must be a non-empty string");
    }
    if (!ingestion.game.name || typeof ingestion.game.name !== "string") {
      errors.push("game.name must be a non-empty string");
    }
  }

  if (ingestion.rulebook) {
    if (!ingestion.rulebook.filename) {
      errors.push("rulebook.filename must be set");
    }
    if (
      typeof ingestion.rulebook.pages !== "number" ||
      ingestion.rulebook.pages < 1
    ) {
      errors.push("rulebook.pages must be a positive integer");
    }
    if (!ingestion.rulebook.sha256 || ingestion.rulebook.sha256.length < 32) {
      errors.push("rulebook.sha256 must be a hex string of length >= 32");
    }
  }

  if (ingestion.text) {
    if (!ingestion.text.full || typeof ingestion.text.full !== "string") {
      errors.push("text.full must be a non-empty string");
    }
    if (!Array.isArray(ingestion.text.pages) || ingestion.text.pages.length === 0) {
      errors.push("text.pages must be a non-empty array");
    }
    if (!ingestion.text.sha256 || ingestion.text.sha256.length < 32) {
      errors.push("text.sha256 must be a hex string of length >= 32");
    }
  }

  if (ingestion.structure) {
    const s = ingestion.structure;
    if (!Array.isArray(s.components) || s.components.length === 0) {
      warnings.push("structure.components is empty; game may not be playable yet");
    }
    if (!Array.isArray(s.setupSteps) || s.setupSteps.length === 0) {
      warnings.push("structure.setupSteps is empty; setup may be incomplete");
    }
    // Check monotonically increasing order for setupSteps
    if (Array.isArray(s.setupSteps) && s.setupSteps.length > 0) {
      let lastOrder = -1;
      for (const step of s.setupSteps) {
        if (typeof step.order !== "number") {
          errors.push(`structure.setupSteps[${step.id || "?"}].order must be a number`);
          break;
        }
        if (step.order < lastOrder) {
          errors.push("structure.setupSteps.order must be non-decreasing");
          break;
        }
        lastOrder = step.order;
      }
    }
  }

  if (ingestion.diagnostics) {
    if (Array.isArray(ingestion.diagnostics.errors) && ingestion.diagnostics.errors.length > 0) {
      errors.push(
        `diagnostics.errors is non-empty: ${ingestion.diagnostics.errors.join("; ")}`
      );
    }
  } else {
    errors.push("diagnostics block is missing");
  }

  return { errors, warnings };
}

// --- JUnit emission ----------------------------------------------------------

function buildJUnitXml(result) {
  const { errors, warnings } = result;
  const tests = 1;
  const failures = errors.length > 0 ? 1 : 0;
  const skipped = 0;

  let xml = "";
  xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuite name="ingestion-contract" tests="${tests}" failures="${failures}" skipped="${skipped}">\n`;
  xml += `  <testcase classname="ingestion" name="contract">\n`;

  if (errors.length > 0) {
    const msg = errors.join(" | ");
    xml += `    <failure message="INGESTION_CONTRACT_FAILED">${escapeXml(msg)}</failure>\n`;
  } else if (warnings.length > 0) {
    const msg = warnings.join(" | ");
    xml += `    <system-out>${escapeXml("WARNINGS: " + msg)}</system-out>\n`;
  }

  xml += "  </testcase>\n";
  xml += "</testsuite>\n";
  return xml;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- Main --------------------------------------------------------------------

(function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input;
  const contractPath =
    args.contract || path.join("docs", "spec", "ingestion_contract.json");
  const junitPath = args.junit;

  if (!inputPath) {
    console.error(
      "[INGESTION] Usage: node scripts/check_ingestion.cjs --input path/to/ingestion.json [--contract path/to/ingestion_contract.json] [--junit path/to/report.xml]"
    );
    process.exit(3);
  }

  const ingestion = readJson(inputPath, "ingestion payload");
  const contract = readJson(contractPath, "ingestion contract");

  const { errors, warnings } = validateIngestion(ingestion, contract);

  if (warnings.length > 0) {
    console.warn("[INGESTION] Warnings:");
    for (const w of warnings) {
      console.warn("  - " + w);
    }
  }

  if (errors.length > 0) {
    console.error("[INGESTION] Contract violations:");
    for (const e of errors) {
      console.error("  - " + e);
    }
  }

  const junitXml = buildJUnitXml({ errors, warnings });

  if (junitPath) {
    fs.mkdirSync(path.dirname(junitPath), { recursive: true });
    fs.writeFileSync(junitPath, junitXml, "utf8");
    console.log(`[INGESTION] Wrote JUnit report to ${junitPath}`);
  } else {
    // Allow piping in CI if desired
    console.log(junitXml);
  }

  if (errors.length > 0) {
    process.exit(2);
  } else {
    console.log("[INGESTION] Ingestion contract validation passed.");
    process.exit(0);
  }
})();
