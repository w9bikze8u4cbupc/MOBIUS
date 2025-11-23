import fs from "fs";
import path from "path";

const GOALS_FILENAME = "quality_goals.json";

function getProjectOutputDir(projectId) {
  return path.join(process.cwd(), "output", String(projectId));
}

export function loadQualityGoals(projectId) {
  const file = path.join(getProjectOutputDir(projectId), GOALS_FILENAME);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function saveQualityGoals(projectId, goals) {
  const dir = getProjectOutputDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, GOALS_FILENAME);
  fs.writeFileSync(file, JSON.stringify(goals, null, 2), "utf8");
  return goals;
}
