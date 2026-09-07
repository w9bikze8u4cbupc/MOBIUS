#!/usr/bin/env python3
"""Perspective-rectify a source-grounded rectangular component.

The four project-supplied points are canonical evidence, not generic game
knowledge. This utility performs only deterministic geometry and never invents
or repaints card content.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def parse_points(value: str) -> np.ndarray:
    points = json.loads(value)
    if not isinstance(points, list) or len(points) != 4:
        raise argparse.ArgumentTypeError("points must be [[tl],[tr],[br],[bl]]")
    result = np.asarray(points, dtype=np.float32)
    if result.shape != (4, 2):
        raise argparse.ArgumentTypeError("points must contain four x/y pairs")
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--points", required=True, type=parse_points)
    parser.add_argument("--width", required=True, type=int)
    parser.add_argument("--height", required=True, type=int)
    parser.add_argument("--padding", type=int, default=0)
    args = parser.parse_args()

    source_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    if args.width < 32 or args.height < 32:
        raise SystemExit("output dimensions are implausibly small")
    source = cv2.imread(str(source_path), cv2.IMREAD_UNCHANGED)
    if source is None:
        raise SystemExit(f"cannot decode {source_path}")

    padding = max(0, args.padding)
    destination = np.asarray([
        [padding, padding],
        [args.width - 1 - padding, padding],
        [args.width - 1 - padding, args.height - 1 - padding],
        [padding, args.height - 1 - padding],
    ], dtype=np.float32)
    transform = cv2.getPerspectiveTransform(args.points, destination)
    border = (0, 0, 0, 0) if source.ndim == 3 and source.shape[2] == 4 else (24, 16, 12)
    result = cv2.warpPerspective(
        source,
        transform,
        (args.width, args.height),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), result):
        raise SystemExit(f"cannot write {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
