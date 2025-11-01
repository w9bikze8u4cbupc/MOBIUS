#!/usr/bin/env python3
"""Verify HMAC signatures emitted by the MOBIUS audit logger.

The script reads a JSONL audit file and recomputes the expected signatures
for each record using the provided secret.  Any mismatches are reported on
STDOUT and cause a non-zero exit status.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import sys
from pathlib import Path
from typing import Iterable, Tuple


def iter_records(path: Path) -> Iterable[Tuple[int, dict]]:
    with path.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            yield index, json.loads(line)


def compute_signature(record: dict, secret: bytes) -> str:
    canonical = {key: value for key, value in record.items() if key != "signature"}
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    digest = hmac.new(secret, payload, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_file", type=Path, help="Path to the JSONL audit log")
    parser.add_argument("--secret", required=True, help="Audit signing secret to verify against")
    args = parser.parse_args(argv)

    if not args.audit_file.exists():
        parser.error(f"audit file {args.audit_file} does not exist")

    secret = args.secret.encode("utf-8")
    mismatches = []
    unsigned = []

    for line_no, record in iter_records(args.audit_file):
        signature = record.get("signature")
        if signature is None:
            unsigned.append(line_no)
            continue
        expected = compute_signature(record, secret)
        if not hmac.compare_digest(signature, expected):
            mismatches.append((line_no, signature, expected))

    if mismatches:
        for line_no, signature, expected in mismatches:
            print(
                f"line {line_no}: signature mismatch (actual={signature}, expected={expected})",
                file=sys.stderr,
            )
        return 2

    if unsigned:
        print(
            "warning: unsigned records encountered on lines "
            + ", ".join(str(num) for num in unsigned),
            file=sys.stderr,
        )

    print("All signed records verified successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
