import fs from "node:fs";
import path from "node:path";

interface GigDoc {
  id: string;
  verification?: {
    coverageGoals?: { id: string; name: string; targets: ({ stepId?: string; actionId?: string })[]; minHits: number }[];
    invariants?: any[];
  };
}
interface Shotlist { shots: { sourceStepId?: string; label: string }[] }
interface ActionsDoc { actions?: { id: string; name: string }[] }

function verify(gigPath: string, shotlistPath: string) {
  const doc = JSON.parse(fs.readFileSync(path.resolve(gigPath), "utf-8")) as GigDoc & ActionsDoc;
  const sl = JSON.parse(fs.readFileSync(path.resolve(shotlistPath), "utf-8")) as Shotlist;

  const stepHits = new Map<string, number>();
  const actionHits = new Map<string, number>();

  sl.shots.forEach(s => {
    if (s.sourceStepId) stepHits.set(s.sourceStepId, (stepHits.get(s.sourceStepId) ?? 0) + 1);
    // heuristic: action shots are labeled "Action: NAME" and not tied to sourceStepId
    if (s.label.startsWith("Action:")) {
      const name = s.label.slice(8).trim();
      const action = doc.actions?.find(a => a.name === name);
      if (action) actionHits.set(action.id, (actionHits.get(action.id) ?? 0) + 1);
    }
  });

  const results: { id: string; ok: boolean; detail: string }[] = [];
  for (const goal of doc.verification?.coverageGoals ?? []) {
    let ok = true;
    let details: string[] = [];
    for (const t of goal.targets) {
      if (t.stepId) {
        const hits = stepHits.get(`shot:${t.stepId}`) ?? stepHits.get(t.stepId) ?? 0;
        const pass = hits >= goal.minHits;
        ok = ok && pass;
        details.push(`step ${t.stepId}: ${hits}/${goal.minHits} ${pass ? "OK" : "MISS"}`);
      } else if (t.actionId) {
        const hits = actionHits.get(t.actionId) ?? 0;
        const pass = hits >= goal.minHits;
        ok = ok && pass;
        details.push(`action ${t.actionId}: ${hits}/${goal.minHits} ${pass ? "OK" : "MISS"}`);
      }
    }
    results.push({ id: goal.id, ok, detail: `${goal.name} -> ${details.join("; ")}` });
  }

  const allOk = results.every(r => r.ok);
  return { ok: allOk, results };
}

// CLI
if (require.main === module) {
  const gig = process.argv[1 + 1] ?? "data/hanamikoji.gig.json";
  const sl = process.argv[1 + 2] ?? "out/shotlist.json";
  const r = verify(gig, sl);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}