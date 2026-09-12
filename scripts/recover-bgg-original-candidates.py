#!/usr/bin/env python3
"""Recover original-resolution BGG exact-game candidates selected by a feature audit.

This utility does not choose production imagery. It preserves the canonical BGG
page, original download URL, dimensions and checksum so the normal source
resolver can compare authorized candidates without mistaking a 1024px gallery
derivative for the available original.
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
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def download(url: str, target: pathlib.Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "MOBIUS-source-audit/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        target.write_bytes(response.read())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--object-id", required=True)
    parser.add_argument("--feature-report", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--top-per-target", type=int, default=12)
    parser.add_argument("--pages", type=int, default=9)
    args = parser.parse_args()

    report = json.loads(pathlib.Path(args.feature_report).read_text(encoding="utf-8"))
    wanted_by_target: dict[str, list[int]] = {
        target: [int(item["imageId"]) for item in ranking[: args.top_per_target]]
        for target, ranking in report.get("rankings", {}).items()
    }
    wanted = {image_id for ids in wanted_by_target.values() for image_id in ids}
    metadata: dict[int, dict] = {}
    for page in range(1, args.pages + 1):
        endpoint = (
            "https://boardgamegeek.com/api/images?ajax=1&gallery=game&nosession=1"
            f"&objectid={args.object_id}&objecttype=thing&pageid={page}"
            "&showcount=60&size=original&sort=hot"
        )
        for item in fetch_json(endpoint).get("images", []):
            image_id = int(item.get("imageid") or 0)
            if image_id in wanted:
                metadata[image_id] = item

    output = pathlib.Path(args.output).resolve()
    cache = output / "gallery-original"
    cache.mkdir(parents=True, exist_ok=True)
    recovered = []
    for image_id in sorted(wanted):
        item = metadata.get(image_id)
        if not item or not item.get("imageurl"):
            recovered.append({"imageId": image_id, "status": "MISSING_FROM_CURRENT_GALLERY"})
            continue
        suffix = pathlib.Path(str(item["imageurl"]).split("?")[0]).suffix or ".jpg"
        local = cache / f"{image_id}{suffix}"
        if not local.exists():
            try:
                download(item["imageurl"], local)
            except Exception as exc:  # provider evidence must remain explicit
                recovered.append({"imageId": image_id, "status": "DOWNLOAD_FAILED", "error": str(exc)})
                continue
        image = cv2.imread(str(local), cv2.IMREAD_UNCHANGED)
        if image is None:
            recovered.append({"imageId": image_id, "status": "DECODE_FAILED", "localPath": str(local)})
            continue
        height, width = image.shape[:2]
        recovered.append({
            "imageId": image_id,
            "status": "RECOVERED",
            "caption": item.get("caption"),
            "canonicalLink": f"https://boardgamegeek.com/image/{image_id}",
            "sourceUrl": item["imageurl"],
            "localPath": str(local),
            "width": width,
            "height": height,
            "sha256": hashlib.sha256(local.read_bytes()).hexdigest(),
            "targets": [target for target, ids in wanted_by_target.items() if image_id in ids],
        })

    output_report = {
        "contract": "mobius-bgg-original-candidate-recovery-v1",
        "authority": "BoardGameGeek exact-game gallery original-resolution download",
        "objectId": str(args.object_id),
        "featureReport": str(pathlib.Path(args.feature_report).resolve()),
        "requestedCount": len(wanted),
        "recoveredCount": sum(item["status"] == "RECOVERED" for item in recovered),
        "targets": wanted_by_target,
        "candidates": recovered,
    }
    (output / "original-candidate-manifest.json").write_text(
        json.dumps(output_report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "status": "PASS" if output_report["recoveredCount"] == len(wanted) else "WARN",
        "requested": len(wanted),
        "recovered": output_report["recoveredCount"],
        "manifest": str(output / "original-candidate-manifest.json"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
