#!/usr/bin/env python3
"""Rank recovered exact-game originals by verified component pixel detail."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cv2
import numpy as np


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feature-report", required=True)
    parser.add_argument("--original-manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ratio", type=float, default=0.76)
    parser.add_argument("--minimum-inliers", type=int, default=10)
    args = parser.parse_args()

    feature = json.loads(Path(args.feature_report).read_text(encoding="utf-8"))
    originals = json.loads(Path(args.original_manifest).read_text(encoding="utf-8"))
    original_by_id = {
        int(item["imageId"]): item for item in originals.get("candidates", [])
        if item.get("status") == "RECOVERED"
    }
    sift = cv2.SIFT_create(nfeatures=10000, contrastThreshold=0.015)
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    rankings = {}

    for target, template_name in feature.get("targets", {}).items():
        template = cv2.imread(str(Path(template_name)), cv2.IMREAD_GRAYSCALE)
        key_t, desc_t = sift.detectAndCompute(template, None)
        height_t, width_t = template.shape[:2]
        corners_t = np.float32([[0, 0], [width_t - 1, 0], [width_t - 1, height_t - 1], [0, height_t - 1]]).reshape(-1, 1, 2)
        entries = []
        for candidate in feature.get("rankings", {}).get(target, []):
            item = original_by_id.get(int(candidate["imageId"]))
            if not item:
                continue
            source = cv2.imread(item["localPath"], cv2.IMREAD_GRAYSCALE)
            key_s, desc_s = sift.detectAndCompute(source, None)
            if desc_t is None or desc_s is None:
                continue
            pairs = matcher.knnMatch(desc_t, desc_s, k=2)
            good = [a for a, b in pairs if a.distance < args.ratio * b.distance]
            if len(good) < args.minimum_inliers:
                continue
            points_t = np.float32([key_t[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
            points_s = np.float32([key_s[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
            matrix, mask = cv2.findHomography(points_t, points_s, cv2.RANSAC, 4.0, maxIters=10000, confidence=0.999)
            if matrix is None or mask is None or int(mask.ravel().sum()) < args.minimum_inliers:
                continue
            corners = cv2.perspectiveTransform(corners_t, matrix).reshape(4, 2)
            source_h, source_w = source.shape[:2]
            if any(x < 0 or y < 0 or x >= source_w or y >= source_h for x, y in corners):
                continue
            top = float(np.linalg.norm(corners[1] - corners[0]))
            bottom = float(np.linalg.norm(corners[2] - corners[3]))
            left = float(np.linalg.norm(corners[3] - corners[0]))
            right = float(np.linalg.norm(corners[2] - corners[1]))
            width = (top + bottom) / 2
            height = (left + right) / 2
            area = abs(float(cv2.contourArea(corners.astype(np.float32))))
            entries.append({
                "imageId": int(candidate["imageId"]),
                "caption": item.get("caption"),
                "canonicalLink": item.get("canonicalLink"),
                "sourcePath": item["localPath"],
                "sourceDimensions": {"width": source_w, "height": source_h},
                "ratioMatches": len(good),
                "inliers": int(mask.ravel().sum()),
                "estimatedComponentWidthPx": round(width, 1),
                "estimatedComponentHeightPx": round(height, 1),
                "estimatedComponentAreaPx": round(area, 1),
                "minimumLinearDetailPx": round(min(width, height), 1),
                "sourceCorners": corners.round(2).tolist(),
            })
        rankings[target] = sorted(entries, key=lambda item: item["estimatedComponentAreaPx"], reverse=True)

    result = {
        "contract": "mobius-authorized-component-detail-ranking-v1",
        "method": "SIFT_RANSAC_HOMOGRAPHY_ON_ORIGINAL_EXACT_GAME_GALLERY_PIXELS",
        "rankings": rankings,
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({target: entries[:3] for target, entries in rankings.items()}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
