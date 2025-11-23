import fs from "fs";
import path from "path";
import { loadQualityGoals } from "../api/genesisGoals.js";

const LOG_RELATIVE_PATH = "logs/genesis_evaluations.jsonl";

const gradeOrder = { A: 4, B: 3, C: 2, D: 1, F: 0 };

function loadAllEvalEntries() {
  const logPath = path.join(process.cwd(), LOG_RELATIVE_PATH);
  if (!fs.existsSync(logPath)) return [];

  const lines = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      entries.push(e);
    } catch {
      // ignore malformed lines
    }
  }
  return entries;
}

/**
 * For each project, take latest evaluation and compute a priority score.
 */
export function computeCampaignPlan() {
  const entries = loadAllEvalEntries();
  if (entries.length === 0) return [];

  // group by projectId
  const byProject = new Map();
  for (const e of entries) {
    const pid = String(e.projectId);
    const existing = byProject.get(pid) || [];
    existing.push(e);
    byProject.set(pid, existing);
  }

  const plan = [];

  for (const [projectId, list] of byProject.entries()) {
    // sort evaluations newest first
    list.sort((a, b) => {
      const ta = a.createdAtUtc || "";
      const tb = b.createdAtUtc || "";
      return tb.localeCompare(ta);
    });
    const latest = list[0];
    const goals = loadQualityGoals(projectId);

    if (!goals) {
      // no goals → still show, but priority 0
      plan.push({
        projectId,
        latest,
        goals: null,
        compliant: null,
        priorityScore: 0,
      });
      continue;
    }

    const grade = latest.grade;
    const clarity = latest.clarityScore ?? 0;
    const distance = latest.distanceFromCentroid ?? 0;

    const minGrade = goals.minGrade || "B";
    const minClarity = goals.minClarity ?? 0.75;
    const maxDistance = goals.maxDistance ?? 0.55;

    const gradeGap =
      Math.max(0, (gradeOrder[minGrade] || 0) - (gradeOrder[grade] || 0)) /
      4.0; // normalize [0,1]
    const clarityGap = Math.max(0, minClarity - clarity); // [0,1]
    const distanceGap = Math.max(0, distance - maxDistance); // ~[0,1]

    const compliant =
      gradeGap === 0 && clarityGap === 0 && distanceGap === 0;

    let priorityScore = 0;
    if (!compliant) {
      // weighted sum, tuned: clarity > grade > distance
      priorityScore = gradeGap * 0.3 + clarityGap * 0.5 + distanceGap * 0.2;
    }

    plan.push({
      projectId,
      latest,
      goals,
      compliant,
      priorityScore: Number(priorityScore.toFixed(4)),
    });
  }

  // sort by priority desc, then projectId asc
  plan.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return a.projectId.localeCompare(b.projectId);
  });

  return plan;
}
