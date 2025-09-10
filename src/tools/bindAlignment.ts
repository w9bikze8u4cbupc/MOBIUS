import fs from "node:fs";
import path from "node:path";
import { deadZoneMerge, syllableSnap } from "../render/PacingUtils";

interface Shot { id: string; label: string; voStart?: string; voEnd?: string; durationSec: number; section: string; }
interface Shotlist { meta: any; shots: Shot[]; }
interface Alignment { audioPath: string; marks: { id: string; t: number }[]; durationSec?: number; }

interface TimelineItem extends Shot {
  tStart: number;
  tEnd: number;
}

function bind(shotlist: Shotlist, align: Alignment) {
  const markMap = new Map(align.marks.map(m => [m.id, m.t]));
  const items: TimelineItem[] = [];
  let cursor = 0;

  for (const s of shotlist.shots) {
    const sMark = s.voStart ? markMap.get(s.voStart) : undefined;
    const eMark = s.voEnd ? markMap.get(s.voEnd) : undefined;

    const start = sMark !== undefined ? sMark : cursor;
    const end = eMark !== undefined ? eMark : start + s.durationSec;

    const clampedEnd = Math.max(start + 0.4, end); // avoid zero-length
    items.push({ ...s, tStart: start, tEnd: clampedEnd });
    cursor = clampedEnd;
  }

  // Apply pacing polish: dead-zone merging and syllable snapping
  const timelineSegments = items.map(item => ({
    id: item.id,
    type: item.section,
    start: item.tStart,
    end: item.tEnd
  }));

  // Apply dead-zone merging (collapse segments < 300ms)
  const mergedSegments = deadZoneMerge(timelineSegments, 0.3);
  
  // Apply syllable snapping (ensure minimum visibility)
  const snappedSegments = syllableSnap(mergedSegments, {}, 0.1);
  
  // Update items with processed timing
  const processedItems = items.map((item, index) => {
    const processedSegment = snappedSegments[index];
    return {
      ...item,
      tStart: processedSegment.start,
      tEnd: processedSegment.end
    };
  });

  const timeline = {
    meta: {
      generatedAt: new Date().toISOString(),
      audioPath: align.audioPath,
      durationSec: align.durationSec ?? processedItems[processedItems.length - 1]?.tEnd ?? 0
    },
    items: processedItems
  };
  return timeline;
}

// CLI
if (require.main === module) {
  const slPath = process.argv[2] ?? "out/shotlist.json";
  const alPath = process.argv[3] ?? "out/alignment.json";
  const out = process.argv[4];

  const shotlist = JSON.parse(fs.readFileSync(path.resolve(slPath), "utf-8")) as Shotlist;
  const alignment = JSON.parse(fs.readFileSync(path.resolve(alPath), "utf-8")) as Alignment;
  const timeline = bind(shotlist, alignment);

  if (out) {
    fs.writeFileSync(path.resolve(out), JSON.stringify(timeline, null, 2), "utf-8");
    console.log(`Timeline written: ${out}`);
  } else {
    console.log(JSON.stringify(timeline, null, 2));
  }
}