import fs from "fs";
import path from "path";

const SCENARIO_FILENAMES = [
  "genesis_scenario_v1.0.0.json",
  "genesis_scenario.json",
  "scenario.json",
  "project_scenario.json",
];

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

export function loadProjectScenario(projectId) {
  const dir = getProjectOutputDir(projectId);

  for (const filename of SCENARIO_FILENAMES) {
    const attempt = safeReadJson(path.join(dir, filename));
    if (attempt) {
      const scenario = attempt.scenario || attempt;
      const scenarioId = attempt.scenarioId || attempt.id || scenario?.id || null;
      return { scenarioId, scenario };
    }
  }

  return { scenarioId: null, scenario: null };
}
