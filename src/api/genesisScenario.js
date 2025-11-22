import fs from 'fs';
import path from 'path';
import { resolveScenario } from '../config/genesisScenarios.js';

const SCENARIO_FILENAME = 'scenario.json';

function getProjectOutputDir(projectId) {
  return path.join(process.cwd(), 'output', String(projectId));
}

function getScenarioPath(projectId) {
  return path.join(getProjectOutputDir(projectId), SCENARIO_FILENAME);
}

export function loadProjectScenario(projectId) {
  const filePath = getScenarioPath(projectId);
  if (!fs.existsSync(filePath)) {
    const scenario = resolveScenario(null);
    return { scenarioId: scenario.id, scenario };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    const scenarioId = json.scenarioId || null;
    const scenario = resolveScenario(scenarioId);
    return { scenarioId: scenario.id, scenario };
  } catch (err) {
    console.error('Failed to read scenario.json:', err);
    const scenario = resolveScenario(null);
    return { scenarioId: scenario.id, scenario };
  }
}

export function saveProjectScenario(projectId, scenarioId) {
  const scenario = resolveScenario(scenarioId);
  const outDir = getProjectOutputDir(projectId);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const filePath = getScenarioPath(projectId);
  const payload = { scenarioId: scenario.id };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { scenarioId: scenario.id, scenario };
}
