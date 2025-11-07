param(
  [Parameter(Mandatory = $true)][string]$LogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

python - <<'PY' $LogPath
import re
import sys
from pathlib import Path

log_path = Path(sys.argv[1])
if not log_path.is_file():
    print(f"Audio analysis log not found: {log_path}", file=sys.stderr)
    sys.exit(2)

text = log_path.read_text()
integrated = re.search(r"Integrated loudness:\s*([-\d.]+)\s*LUFS", text, re.IGNORECASE)
lra = re.search(r"Loudness range:\s*([-\d.]+)\s*LU", text, re.IGNORECASE)
tp = re.search(r"True peak:\s*([-\d.]+)\s*dBTP", text, re.IGNORECASE)
if not integrated:
    print("Unable to parse EBUR128 metrics from log; ensure the preview includes audio.", file=sys.stderr)
    sys.exit(3)

integrated_value = float(integrated.group(1))
if integrated_value < -32 or integrated_value > -5:
    print(f"Integrated loudness {integrated_value:.2f} LUFS is outside the acceptable window (-32, -5).", file=sys.stderr)
    sys.exit(4)

if tp:
    true_peak = float(tp.group(1))
    if true_peak > -1.0:
        print(f"True peak {true_peak:.2f} dBTP exceeds the ceiling (-1.0 dBTP).", file=sys.stderr)
        sys.exit(5)

print("Audio levels are within the acceptable range.")
PY
