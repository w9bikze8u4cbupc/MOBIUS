#!/usr/bin/env python3
"""Find higher-detail occurrences of known component art in an authorized BGG gallery.

This is an audit/recovery utility, not a production extractor.  It downloads the
large gallery derivative with provenance and uses local feature matching against
small canonical component references.  Decisions still require physical review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import urllib.request

import cv2


def fetch_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "MOBIUS-source-audit/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def download(url: str, target: pathlib.Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "MOBIUS-source-audit/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        target.write_bytes(response.read())


def descriptors(path: pathlib.Path):
    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        return None, None
    detector = cv2.SIFT_create(nfeatures=2400)
    return detector.detectAndCompute(image, None)


def match_score(template_desc, candidate_desc) -> tuple[int, float]:
    if template_desc is None or candidate_desc is None or len(template_desc) < 4 or len(candidate_desc) < 4:
        return 0, 0.0
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = matcher.knnMatch(template_desc, candidate_desc, k=2)
    good = [first for first, second in pairs if first.distance < 0.72 * second.distance]
    if not good:
        return 0, 0.0
    return len(good), sum(item.distance for item in good) / len(good)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--object-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--targets", required=True, help="JSON object mapping semantic IDs to local image paths")
    parser.add_argument("--pages", type=int, default=9)
    args = parser.parse_args()

    output = pathlib.Path(args.output).resolve()
    cache = output / "gallery-large"
    cache.mkdir(parents=True, exist_ok=True)
    targets = json.loads(pathlib.Path(args.targets).read_text(encoding="utf-8"))
    target_desc = {key: descriptors(pathlib.Path(value).resolve())[1] for key, value in targets.items()}
    images = []

    for page in range(1, args.pages + 1):
        endpoint = (
            "https://boardgamegeek.com/api/images?ajax=1&gallery=game&nosession=1"
            f"&objectid={args.object_id}&objecttype=thing&pageid={page}&showcount=60&size=large&sort=hot"
        )
        payload = fetch_json(endpoint)
        for item in payload.get("images", []):
            image_id = str(item.get("imageid"))
            url = item.get("imageurl_lg") or item.get("imageurl")
            if not image_id or not url:
                continue
            local = cache / f"{image_id}.jpg"
            if not local.exists():
                try:
                    download(url, local)
                except Exception:
                    continue
            keypoints, candidate_desc = descriptors(local)
            if candidate_desc is None:
                continue
            matches = {}
            for semantic_id, reference_desc in target_desc.items():
                good, mean_distance = match_score(reference_desc, candidate_desc)
                matches[semantic_id] = {"goodMatches": good, "meanDistance": round(mean_distance, 3)}
            images.append({
                "imageId": int(image_id),
                "caption": item.get("caption"),
                "sourceUrl": url,
                "canonicalLink": f"https://boardgamegeek.com/image/{image_id}",
                "localPath": str(local),
                "sha256": hashlib.sha256(local.read_bytes()).hexdigest(),
                "detectedFeatures": len(keypoints or []),
                "matches": matches,
            })

    rankings = {
        semantic_id: sorted(
            images,
            key=lambda entry: (-entry["matches"][semantic_id]["goodMatches"], entry["matches"][semantic_id]["meanDistance"]),
        )[:20]
        for semantic_id in targets
    }
    report = {
        "contract": "mobius-authorized-gallery-feature-audit-v1",
        "authority": "BoardGameGeek exact-game gallery; physical review required",
        "objectId": args.object_id,
        "galleryImageCount": len(images),
        "targets": targets,
        "rankings": rankings,
    }
    report_path = output / "feature-match-report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "report": str(report_path), "galleryImageCount": len(images)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
