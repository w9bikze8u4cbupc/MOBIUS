#!/usr/bin/env python3
import re
import sys
from pathlib import Path

def parse_metrics(text: str) -> dict:
    metrics = {}
    match = re.search(r"Integrated loudness:\s*([-\d.]+)\s*LUFS", text, re.IGNORECASE)
    if match:
        metrics["integrated_lufs"] = float(match.group(1))
    match = re.search(r"Loudness range:\s*([-\d.]+)\s*LU", text, re.IGNORECASE)
    if match:
        metrics["loudness_range_lu"] = float(match.group(1))
    match = re.search(r"True peak:\s*([-\d.]+)\s*dBTP", text, re.IGNORECASE)
    if match:
        metrics["true_peak_db"] = float(match.group(1))
    return metrics

def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/check_audio_compliance.py <ebur128-log>", file=sys.stderr)
        return 1

    log_path = Path(sys.argv[1])
    if not log_path.is_file():
        print(f"Audio analysis log not found: {log_path}", file=sys.stderr)
        return 2

    metrics = parse_metrics(log_path.read_text())
    if not metrics:
        print("Unable to parse EBUR128 metrics from log; ensure the preview includes audio.", file=sys.stderr)
        return 3

    integrated = metrics.get("integrated_lufs", -999.0)
    if integrated < -32 or integrated > -5:
        print(f"Integrated loudness {integrated:.2f} LUFS is outside the acceptable window (-32, -5).", file=sys.stderr)
        return 4

    true_peak = metrics.get("true_peak_db", -999.0)
    if true_peak > -1.0:
        print(f"True peak {true_peak:.2f} dBTP exceeds the ceiling (-1.0 dBTP).", file=sys.stderr)
        return 5

    print("Audio levels are within the acceptable range.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
