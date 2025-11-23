// src/api/genesisReport.js

import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const REPORT_FILENAME = "genesis_qa_report_v1.0.0.md";

function getProjectOutputDir(projectId) {
  return path.join(process.cwd(), "output", String(projectId));
}

export function getReportPath(projectId) {
  return path.join(getProjectOutputDir(projectId), REPORT_FILENAME);
}

export function ensureGenesisReport(projectId) {
  return new Promise((resolve, reject) => {
    const reportPath = getReportPath(projectId);
    if (fs.existsSync(reportPath)) {
      return resolve(reportPath);
    }

    const proc = spawn("python", ["scripts/genesis_generate_qa_report.py", "--project-id", String(projectId)], {
      stdio: "inherit",
    });

    proc.on("exit", (code) => {
      if (code === 0 && fs.existsSync(reportPath)) {
        resolve(reportPath);
      } else if (code === 0) {
        reject(new Error("Report script succeeded but report file missing."));
      } else {
        reject(new Error(`Report generation failed with code ${code}`));
      }
    });
  });
}
