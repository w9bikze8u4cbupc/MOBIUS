import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { FiltergraphBuilder, estimateSecondsByWPM } from "../render/FiltergraphBuilder";
import { ShotConcatenator } from "../render/ShotConcatenator";

interface Timeline { meta: { audioPath?: string; durationSec: number }; items: TLItem[]; }
interface TLItem { 
  id: string; 
  label: string; 
  tStart: number; 
  tEnd: number; 
  section: string;
  anim?: {
    templateId?: string;
    focus?: string | string[];
    params?: Record<string, any>;
  };
}
interface Manifest { assets: Record<string, { path: string }>; placeholders?: { image: string }; }

function hasFfmpeg(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function seconds(n: number) { return n.toFixed(3); }

function render(timelinePath: string, manifestPath: string, outMp4: string) {
  if (!hasFfmpeg()) {
    console.error("FFmpeg is not available. Install it and ensure 'ffmpeg' is in PATH.");
    console.error("- macOS: brew install ffmpeg");
    console.error("- Ubuntu: sudo apt-get install ffmpeg");
    console.error("- Windows: choco install ffmpeg");
    process.exit(1);
  }

  const tl = JSON.parse(fs.readFileSync(path.resolve(timelinePath), "utf-8")) as Timeline;
  const mf = JSON.parse(fs.readFileSync(path.resolve(manifestPath), "utf-8")) as Manifest;

  const tmpDir = path.resolve("out/.render");
  fs.mkdirSync(tmpDir, { recursive: true });

  // Use the new FiltergraphBuilder
  const baseImage = mf.placeholders?.image ?? "assets/placeholders/slate.png";
  const builder = new FiltergraphBuilder(tl, mf, baseImage);
  const { inputs, filtergraph, outputLabel } = builder.build();

  // Use the new ShotConcatenator
  const concatenator = new ShotConcatenator(tmpDir);
  
  // For now, we'll use a simple approach with a single filtergraph
  // A more sophisticated implementation would create segments and concatenate them
  
  const audioArgs = tl.meta.audioPath ? ["-i", path.resolve(tl.meta.audioPath)] : [];
  const audioMap = tl.meta.audioPath ? ["-map", "1:a"] : [];
  
  const renderArgs = [
    "-y",
    ...inputs,
    ...audioArgs,
    "-filter_complex", filtergraph,
    "-map", `[${outputLabel}]`,
    ...audioMap,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-shortest",
    outMp4
  ];
  
  console.log("Executing ffmpeg with args:", renderArgs.join(" "));
  
  const p = spawnSync("ffmpeg", renderArgs, { stdio: "inherit" });
  if (p.status !== 0) {
    throw new Error("ffmpeg render failed");
  }

  console.log(`Rendered: ${outMp4}`);
}

// CLI
if (require.main === module) {
  const tl = process.argv[2] ?? "out/timeline.json";
  const mf = process.argv[3] ?? "assets/manifest.hanamikoji.json";
  const out = process.argv[4] ?? "out/hanamikoji_tutorial.mp4";
  render(tl, mf, out);
}