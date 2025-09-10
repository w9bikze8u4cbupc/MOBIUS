#!/usr/bin/env python3
import re, sys, json, pathlib

if len(sys.argv) < 2:
    print("Usage: check_audio_compliance.py <ebur128_log.txt>")
    sys.exit(2)

p = pathlib.Path(sys.argv[1])
text = p.read_text(encoding="utf-8", errors="ignore")

# Extract Integrated (I), Loudness Range (LRA), and True Peak (TP) from common ebur128 summary lines
I = None; LRA = None; TP = None

# Tolerate different spacings and decimal formats
for line in text.splitlines():
    if I is None:
        m = re.search(r'\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS\b', line)
        if m: I = float(m.group(1))
    if LRA is None:
        m = re.search(r'\bLRA:\s*(\d+(?:\.\d+)?)\s*LU\b', line)
        if m: LRA = float(m.group(1))
    if TP is None:
        m = re.search(r'\bTP:\s*(-?\d+(?:\.\d+)?)\s*dBFS\b', line)
        if m: TP = float(m.group(1))

result = {"integrated_lufs": I, "lra_lu": LRA, "true_peak_dbfs": TP}
print(json.dumps(result, indent=2))

# Gates (adjust as desired)
fail = False
if I is None or I < -17.0 or I > -15.0:  # target -16 ±1 LU
    fail = True
if LRA is None or LRA > 11.0:
    fail = True
if TP is None or TP > -1.0:  # must be <= -1.0 dBFS
    fail = True

sys.exit(1 if fail else 0)