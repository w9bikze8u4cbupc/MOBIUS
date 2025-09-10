import fs from "node:fs";
import path from "node:path";

type ID = string;
type StepKind = "atomic" | "compound" | "branch" | "loop" | "actionChoice";

interface GigDoc {
  _schema: "GIG";
  version: "1.1.0";
  id: ID;
  rules: {
    setup: Step;
    turnStructure: {
      perRound?: Step;
      perTurn: Step;
    };
    scoring: Step;
  };
  actions?: { id: ID; name: string; timing?: TimingHint }[];
  timingHints?: GlobalTimingHints;
}

interface Step {
  id: ID;
  kind: StepKind;
  label: string;
  children?: Step[];
  actionSet?: { id: ID }[];
  speak?: { markStart?: string; markEnd?: string };
  timing?: TimingHint;
}

interface TimingHint { effort?: "tiny"|"short"|"medium"|"long"; minSec?: number; maxSec?: number; preferredSec?: number; }
interface GlobalTimingHints { atomicMinSec?: number; atomicMaxSec?: number; beatGapSec?: number; }

interface Shot {
  id: ID;
  label: string;
  sourceStepId?: ID;
  voStart?: string;
  voEnd?: string;
  durationSec: number;
  section: "setup" | "turn" | "scoring";
}

// Heuristic micro-pacing
function effortToSec(e?: TimingHint, g?: GlobalTimingHints): number {
  const min = g?.atomicMinSec ?? 2.0;
  const max = g?.atomicMaxSec ?? 7.0;
  if (e?.preferredSec) return Math.max(min, Math.min(max, e.preferredSec));
  switch (e?.effort) {
    case "tiny": return Math.max(1.5, min);
    case "short": return Math.max(2.2, min);
    case "medium": return Math.min(5.5, max);
    case "long": return max;
    default: return 3.0;
  }
}

function flattenSteps(step: Step, section: Shot["section"], g?: GlobalTimingHints): Shot[] {
  if (step.kind === "atomic") {
    return [{
      id: `shot:${step.id}`,
      label: step.label,
      sourceStepId: step.id,
      voStart: step.speak?.markStart,
      voEnd: step.speak?.markEnd,
      durationSec: effortToSec(step.timing, g),
      section
    }];
  }
  if (step.kind === "actionChoice") {
    // Emit a generic prompt plus representative action demo shots (one per action)
    const prompt: Shot = {
      id: `shot:${step.id}:prompt`,
      label: step.label,
      sourceStepId: step.id,
      voStart: step.speak?.markStart,
      voEnd: step.speak?.markEnd,
      durationSec: effortToSec(step.timing, g),
      section
    };
    return [prompt];
  }
  if (step.kind === "compound" && step.children) {
    return step.children.flatMap((c) => flattenSteps(c, section, g));
  }
  // ignore branch/loop for simple compile; can be elaborated later
  return [];
}

function representativeActionShots(doc: GigDoc): Shot[] {
  if (!doc.actions) return [];
  const g = doc.timingHints;
  return doc.actions.map((a) => ({
    id: `shot:action:${a.id}`,
    label: `Action: ${a.name}`,
    sourceStepId: a.id,
    durationSec: effortToSec(a.timing ?? { effort: "medium" }, g),
    section: "turn" as const
  }));
}

function compile(gigPath: string, outPath?: string) {
  const abs = path.resolve(gigPath);
  const doc = JSON.parse(fs.readFileSync(abs, "utf-8")) as GigDoc;
  const shots: Shot[] = [];

  // Setup
  shots.push(...flattenSteps(doc.rules.setup, "setup", doc.timingHints));

  // Round header (optional)
  if (doc.rules.turnStructure.perRound) {
    shots.push(...flattenSteps(doc.rules.turnStructure.perRound, "turn", doc.timingHints));
  }

  // Turn skeleton
  shots.push(...flattenSteps(doc.rules.turnStructure.perTurn, "turn", doc.timingHints));

  // Representative actions (ensures coverage)
  shots.push(...representativeActionShots(doc));

  // Scoring
  shots.push(...flattenSteps(doc.rules.scoring, "scoring", doc.timingHints));

  const result = { meta: { gig: doc.id, schema: doc.version, generatedAt: new Date().toISOString() }, shots };
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), JSON.stringify(result, null, 2), "utf-8");
    console.log(`Shotlist written: ${outPath} (${shots.length} shots)`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  return result;
}

// CLI
if (require.main === module) {
  const gig = process.argv[2] ?? "data/hanamikoji.gig.json";
  const out = process.argv[3];
  compile(gig, out);
}

export {};