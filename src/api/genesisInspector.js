import fs from "fs";
import path from "path";
import { loadProjectScenario } from "./genesisScenario.js";
import { loadQualityGoals } from "./genesisGoals.js";

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

export function loadGenesisInspectorBundle(projectId) {
  const dir = getProjectOutputDir(projectId);

  const g3 = safeReadJson(path.join(dir, "genesis_visualization_g3_v1.0.0.json"));
  const g4 = safeReadJson(path.join(dir, "genesis_clarity_g4_v1.0.0.json"));
  const g5 = safeReadJson(path.join(dir, "genesis_analytics_g5_v1.0.0.json"));
  const g6 = safeReadJson(path.join(dir, "genesis_feedback_v1.0.0.json"));

  let { scenarioId, scenario } = loadProjectScenario(projectId);
  const goals = loadQualityGoals(projectId);

  if (!scenario && g6?.input?.scenario) {
    scenario = g6.input.scenario;
  }

  if (!scenarioId && (g6?.input?.scenarioId || scenario?.id)) {
    scenarioId = g6?.input?.scenarioId || scenario?.id;
  }

  return {
    projectId: String(projectId),
    scenarioId,
    scenario,
    goals,
    g3,
    g4,
    g5,
    g6,
  };
}
