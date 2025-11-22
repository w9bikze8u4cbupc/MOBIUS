import * as fs from "fs";
import * as path from "path";
import { parseMobiusFeedback } from "../../src/contracts/mobiusFeedback";
// CommonJS shim is used here because the production genesisCompat module is ESM-only.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { checkGenesisFeedbackCompat } = require("../../src/compat/genesisCompat.cjs");

const GOLDEN_G6_PATH = path.join(
  process.cwd(),
  "tests",
  "golden",
  "genesis",
  "sample_project_001",
  "g6_feedback.json"
);

describe("GENESIS G6 golden feedback", () => {
  test("is parseable by MobiusFeedback contract", () => {
    const raw = fs.readFileSync(GOLDEN_G6_PATH, "utf8");
    const json = JSON.parse(raw);
    const bundle = parseMobiusFeedback(json);

    expect(bundle.contract.name).toBe("g6_mobius_feedback_contract");
    expect(bundle.summary).toBeDefined();
    expect(bundle.summary.grade).toBeDefined();
    expect(bundle.recommendations.length).toBeGreaterThan(0);
  });

  test("is considered compatible by default compat rules", () => {
    const raw = fs.readFileSync(GOLDEN_G6_PATH, "utf8");
    const json = JSON.parse(raw);
    const bundle = parseMobiusFeedback(json);
    const compat = checkGenesisFeedbackCompat(bundle);

    // For golden v1.0.x we expect compatibility.
    expect(compat.compatible).toBe(true);
  });
});
