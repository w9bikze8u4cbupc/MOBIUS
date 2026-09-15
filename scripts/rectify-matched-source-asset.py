#!/usr/bin/env python3
"""Recover an exact rectangular component from a higher-resolution source photo.

The low-resolution canonical template is used only for identity/geometry. Pixels
in the output come from the higher-resolution source. SIFT feature matches and a
RANSAC homography make the operation deterministic and auditable; no content is
painted or invented.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--width", type=int, default=900)
    parser.add_argument("--height", type=int, default=1390)
    parser.add_argument("--ratio", type=float, default=0.76)
    parser.add_argument("--minimum-inliers", type=int, default=12)
    parser.add_argument("--padding", type=int, default=8)
    args = parser.parse_args()

    template_path = Path(args.template).resolve()
    source_path = Path(args.source).resolve()
    output_path = Path(args.output).resolve()
    report_path = Path(args.report).resolve()
    template = cv2.imread(str(template_path), cv2.IMREAD_COLOR)
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if template is None or source is None:
        raise SystemExit("template or source could not be decoded")
    if args.width < 64 or args.height < 64:
        raise SystemExit("output dimensions are implausibly small")

    sift = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.015)
    key_template, descriptors_template = sift.detectAndCompute(
        cv2.cvtColor(template, cv2.COLOR_BGR2GRAY), None
    )
    key_source, descriptors_source = sift.detectAndCompute(
        cv2.cvtColor(source, cv2.COLOR_BGR2GRAY), None
    )
    if descriptors_template is None or descriptors_source is None:
        raise SystemExit("insufficient SIFT descriptors")

    matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = matcher.knnMatch(descriptors_template, descriptors_source, k=2)
    good = [first for first, second in pairs if first.distance < args.ratio * second.distance]
    if len(good) < max(4, args.minimum_inliers):
        raise SystemExit(f"insufficient ratio-test matches: {len(good)}")

    template_points = np.float32([key_template[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    source_points = np.float32([key_source[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    template_to_source, mask = cv2.findHomography(
        template_points, source_points, cv2.RANSAC, 4.0, maxIters=10000, confidence=0.999
    )
    if template_to_source is None or mask is None:
        raise SystemExit("homography could not be estimated")
    inliers = int(mask.ravel().sum())
    if inliers < args.minimum_inliers:
        raise SystemExit(f"insufficient homography inliers: {inliers}")

    template_height, template_width = template.shape[:2]
    source_height, source_width = source.shape[:2]
    template_corners = np.float32(
        [[0, 0], [template_width - 1, 0], [template_width - 1, template_height - 1], [0, template_height - 1]]
    ).reshape(-1, 1, 2)
    source_corners = cv2.perspectiveTransform(template_corners, template_to_source).reshape(4, 2)
    outside = sum(
        1
        for x, y in source_corners
        if x < 0 or y < 0 or x >= source_width or y >= source_height
    )
    if outside:
        raise SystemExit(f"estimated component has {outside} corner(s) outside source bounds")

    padding = max(0, args.padding)
    output_corners = np.float32(
        [
            [padding, padding],
            [args.width - 1 - padding, padding],
            [args.width - 1 - padding, args.height - 1 - padding],
            [padding, args.height - 1 - padding],
        ]
    )
    source_to_output = cv2.getPerspectiveTransform(source_corners.astype(np.float32), output_corners)
    recovered = cv2.warpPerspective(
        source,
        source_to_output,
        (args.width, args.height),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(24, 16, 12),
    )

    polygon_area = float(cv2.contourArea(source_corners.astype(np.float32)))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(output_path), recovered):
        raise SystemExit(f"cannot write {output_path}")

    report = {
        "schemaVersion": "matched-source-rectification-v1",
        "template": {
            "path": str(template_path),
            "sha256": sha256(template_path),
            "width": template_width,
            "height": template_height,
            "role": "IDENTITY_AND_GEOMETRY_ONLY",
        },
        "source": {
            "path": str(source_path),
            "sha256": sha256(source_path),
            "width": source_width,
            "height": source_height,
            "role": "AUTHORITATIVE_OUTPUT_PIXELS",
        },
        "output": {
            "path": str(output_path),
            "sha256": sha256(output_path),
            "width": args.width,
            "height": args.height,
        },
        "matching": {
            "method": "SIFT_RANSAC_HOMOGRAPHY",
            "ratioThreshold": args.ratio,
            "ratioMatches": len(good),
            "inliers": inliers,
            "inlierRatio": round(inliers / len(good), 4),
            "sourceCorners": source_corners.round(2).tolist(),
            "sourcePolygonAreaPx": round(polygon_area, 2),
            "estimatedSourcePixelsPerOutputPixel": round(
                (polygon_area / max(1, args.width * args.height)) ** 0.5, 4
            ),
        },
        "contentPolicy": {
            "inventedPixels": False,
            "templatePixelsPromotedToMaster": False,
            "completeSilhouetteRequired": True,
            "physicalReviewRequired": True,
        },
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "output": str(output_path), "inliers": inliers}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
