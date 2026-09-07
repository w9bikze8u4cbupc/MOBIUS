#!/usr/bin/env python3
"""Write the canonical PDF raster-placement lineage used by visual QA."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from hephaestus.native_extract import collect_native_image_lineage


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    pdf = Path(args.pdf).resolve()
    output = Path(args.out).resolve()
    report = collect_native_image_lineage(str(pdf))
    report["pdfSha256"] = hashlib.sha256(pdf.read_bytes()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS",
        "output": str(output),
        "pages": report["pageCount"],
        "nativeObjects": len(report["nativeObjects"]),
        "occurrences": sum(page["rasterOccurrenceCount"] for page in report["pages"]),
    }, indent=2))


if __name__ == "__main__":
    main()
