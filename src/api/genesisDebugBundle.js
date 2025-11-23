import fs from "fs";
import path from "path";
import { loadProjectScenario } from "./genesisScenario.js";
import { loadQualityGoals } from "./genesisGoals.js";
import { checkGenesisFeedbackCompat } from "../compat/genesisCompat.js";
import { getGenesisMode } from "../config/genesisConfig.js";
import { getGenesisProfile } from "../config/genesisProfiles.js";

const EVAL_LOG_RELATIVE = "logs/genesis_evaluations.jsonl";

function getProjectOutputDir(projectId) {
  return path.join(process.cwd(), "output", String(projectId));
}

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error("Failed to read JSON", filePath, err);
    return null;
  }
}

function loadEvalHistoryForProject(projectId, limit = 20) {
  const logPath = path.join(process.cwd(), EVAL_LOG_RELATIVE);
  if (!fs.existsSync(logPath)) return [];

  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (String(e.projectId) === String(projectId)) {
        entries.push(e);
      }
    } catch {
      // ignore malformed
    }
  }
  // newest first
  entries.sort((a, b) => {
    const ta = a.createdAtUtc || "";
    const tb = b.createdAtUtc || "";
    return tb.localeCompare(ta);
  });
  return entries.slice(0, limit);
}

export function buildGenesisDebugBundle(projectId) {
  const outDir = getProjectOutputDir(projectId);

  const g3 = safeReadJson(path.join(outDir, "genesis_visualization_g3_v1.0.0.json"));
  const g4 = safeReadJson(path.join(outDir, "genesis_clarity_g4_v1.0.0.json"));
  const g5 = safeReadJson(path.join(outDir, "genesis_analytics_g5_v1.0.0.json"));
  const g6 = safeReadJson(path.join(outDir, "genesis_feedback_v1.0.0.json"));

  const goals = loadQualityGoals(projectId);
  const { scenarioId, scenario } = loadProjectScenario(projectId);

  const mode = getGenesisMode();
  const profile = getGenesisProfile();
  const compat = g6 ? checkGenesisFeedbackCompat(g6) : null;
  const evalHistory = loadEvalHistoryForProject(projectId);

  return {
    schema: {
      name: "genesis_debug_bundle",
      version: "1.0.0",
    },
    projectId: String(projectId),
    runtime: {
      mode,
      profile,
      scenarioId,
      scenario,
    },
    compatibility: compat,
    goals,
    artifacts: {
      g3,
      g4,
      g5,
      g6,
    },
    evalHistory,
    generatedAtUtc: new Date().toISOString(),
  };
}
