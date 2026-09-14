#!/usr/bin/env python3
"""Vision-based QA sidecar for source-grounded MOBIUS visual selection.

It evaluates a bounded set of promising extracted assets from the rulebook pages
actually cited by a reviewed script. The result is an operator-reviewable JSON
sidecar; it does not alter source assets or rules content.
"""
from __future__ import annotations

import base64
import concurrent.futures
import io
import json
import os
import sys
from pathlib import Path

from openai import OpenAI
from PIL import Image

MODEL = os.getenv("MOBIUS_VISUAL_QA_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5-mini"
MAX_PER_PAGE = 18
MAX_PER_TYPE = 6

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "mobius_visual_asset_qa",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "primary_explanatory": {"type": "boolean"},
                "quality_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "category": {"type": "string", "enum": ["board_or_tableau", "component_or_card", "token_or_marker", "decorative_or_fragment", "blank_or_unusable", "uncertain"]},
                "reason": {"type": "string"},
            },
            "required": ["primary_explanatory", "quality_score", "category", "reason"],
            "additionalProperties": False,
        },
    },
}


def usage() -> None:
    print("usage: qualify_source_visuals.py SCRIPT.json MANIFEST.json OUTPUT.json", file=sys.stderr)
    raise SystemExit(2)


def asset_path(asset: dict, manifest_path: Path) -> Path | None:
    candidates = [
        asset.get("file_path"),
        asset.get("fileKey"),
        asset.get("path"),
        str(manifest_path.parent / "images" / "all" / asset.get("file_name", "")),
        str(manifest_path.parent / asset.get("file_name", "")),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    return None


def dimensions(asset: dict) -> tuple[int, int]:
    d = asset.get("dimensions") or {}
    return int(d.get("width") or asset.get("width") or 0), int(d.get("height") or asset.get("height") or 0)


def priority(asset: dict) -> tuple[int, int, int]:
    width, height = dimensions(asset)
    classification = str(asset.get("classification") or "unknown").lower()
    type_rank = 3 if asset.get("visual_kind") == "focused-page-crop" else 2 if classification in {"board", "card", "tile", "token", "marker", "dice"} else 0
    return type_rank, int(asset.get("confidence") or 0) * 1000, width * height


def asset_metadata(asset: dict) -> dict:
    return {
        "type": asset.get("type"),
        "classification": asset.get("classification"),
        "visual_kind": asset.get("visual_kind"),
        "source_page": asset.get("source_page"),
        "page_index": asset.get("page_index"),
        "layout_labels": asset.get("layout_labels") or [],
        "layout_text": asset.get("layout_text") or '',
        "heading": asset.get("heading") or '',
        "retrieval_context": asset.get("retrieval_context"),
        "bbox": asset.get("bbox") or asset.get("bounding_box"),
        "normalized_bbox": asset.get("normalized_bbox"),
        "content_hash": asset.get("contentHash") or asset.get("content_hash"),
        "source_pdf_sha256": asset.get("sourcePdfSha256") or asset.get("source_pdf_sha256"),
        "provenance": asset.get("provenance"),
        "dimensions": asset.get("dimensions"),
        "original_dimensions": asset.get("original_dimensions"),
    }


def local_judgement(asset: dict) -> dict:
    """Conservative quality fallback when the optional vision API is unavailable."""
    width, height = dimensions(asset)
    metrics = asset.get("visual_metrics") or {}
    kind = str(asset.get("visual_kind") or asset.get("type") or asset.get("classification") or "").lower()
    if metrics.get("nearBlank") is True or width < 96 or height < 96 or width * height < 20000:
        return {"primary_explanatory": False, "quality_score": 0, "category": "blank_or_unusable", "reason": "local-quality-rejected: blank or too small"}
    return {"primary_explanatory": False, "quality_score": 0, "category": "uncertain", "evidenceStatus": "UNKNOWN", "reason": "geometry is a candidate-screening hint, not object pixel validation"}


def eligible_hypothesis(asset: dict) -> bool:
    # UNKNOWN is eligible for examination, not a positive or negative verdict.
    # In particular, a layout crop must not need a fabricated is_component=True
    # merely to reach the object-scoped matcher and its already valid cache.
    if (asset.get('native') and asset.get('classification') == 'other'
            and asset.get('retrieval_context') and asset.get('visual_metrics', {}).get('nearBlank') is False):
        # Native geometry's catch-all is not an object-scoped negative pixel verdict.
        # Admit for examination only; the original classification remains preserved.
        return True
    return asset.get("is_component") is not False


def image_data_url(image_path: Path) -> str:
    # HEPHAESTUS intentionally preserves source pixels and may produce very
    # large native rasters. Vision QA needs the visual evidence, not a 241 MB
    # upload; bound the in-memory probe representation while keeping the
    # canonical asset path/hash and provenance untouched.
    with Image.open(image_path) as source:
        image = source.convert("RGB")
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        encoded = io.BytesIO()
        image.save(encoded, format="JPEG", quality=85, optimize=True)
    return f"data:image/jpeg;base64,{base64.b64encode(encoded.getvalue()).decode('ascii')}"


def judge_one(client: OpenAI, entry: dict) -> dict:
    image_path = Path(entry["path"])
    prompt = (
        "You are quality-controlling visual assets for a beginner board-game tutorial. "
        "Judge the image itself, not its filename. A primary explanatory asset clearly shows a board area, a usable component, card, tile, token, marker, or a focused rulebook panel/diagram large enough to teach from. "
        "Reject arrows, isolated icons, decorative fragments, tiny crops, blank/mostly empty assets, or an unfocused full rulebook page as a primary visual. A focused panel crop is acceptable when it visibly demonstrates a rule. "
        "Use a score of 75+ only when this image should confidently be the main demonstration visual for one tutorial scene."
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_data_url(image_path), "detail": "low"}},
            ],
        }],
        response_format=SCHEMA,
        max_completion_tokens=300,
    )
    judgement = json.loads(response.choices[0].message.content)
    return {"asset_id": entry["asset_id"], "page_index": entry["page_index"], "path": str(image_path), "asset_metadata": entry.get("asset_metadata") or {}, **judgement}


def main() -> None:
    if len(sys.argv) != 4:
        usage()
    script_path, manifest_path, out_path = map(Path, sys.argv[1:])
    # Node writes canonical manifests as UTF-8.  Passing no encoding makes
    # Windows use the active ANSI code page (often cp1252), which rejects
    # perfectly valid French/Unicode source text and incorrectly aborts an
    # otherwise resumable production.
    script = json.loads(script_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    cited_pages = {int(page) for scene in script.get("scenes", []) for page in scene.get("source_pages", [])}
    by_page: dict[int, list[dict]] = {}
    for asset in manifest.get("images", []):
        if not eligible_hypothesis(asset):
            continue
        page = int(asset.get("page_index", -1))
        # HEPHAESTUS page_index is zero-based; storyboard source_pages are
        # canonical one-based rulebook pages.
        if asset.get('visual_kind') != 'source-page-localization' and not asset.get('retrieval_context') and page not in cited_pages and page + 1 not in cited_pages:
            continue
        resolved = asset_path(asset, manifest_path)
        width, height = dimensions(asset)
        if not resolved or width < 96 or height < 96 or width * height < 20000:
            continue
        by_page.setdefault(page, []).append(asset)

    candidates = []
    for page, assets in sorted(by_page.items()):
        selected = []
        for asset_type in sorted({str(asset.get("visual_kind") or asset.get("classification") or asset.get("type") or "unknown") for asset in assets}):
            typed = [asset for asset in sorted(assets, key=priority, reverse=True)
                     if str(asset.get("visual_kind") or asset.get("classification") or asset.get("type") or "unknown") == asset_type]
            selected.extend(typed[:MAX_PER_TYPE])
        ordinary = [a for a in selected if a.get('visual_kind') != 'source-page-localization']
        context = [a for a in selected if a.get('visual_kind') == 'source-page-localization']
        for asset in sorted(ordinary, key=priority, reverse=True)[:MAX_PER_PAGE] + context:
            candidates.append({"asset_id": asset.get("id"), "page_index": page, "path": str(asset_path(asset, manifest_path)), "asset_metadata": asset_metadata(asset)})

    # Object identity/quality are assessed together by the bounded matcher.
    client = None
    results: list[dict] = []
    vision_failed = client is None
    if not vision_failed:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(judge_one, client, candidate) for candidate in candidates]
            for future, candidate in zip(futures, candidates):
                try:
                    results.append(future.result())
                except Exception as exc:  # Preserve the failure while retaining locally verifiable candidates.
                    vision_failed = True
                    results.append({"asset_id": candidate["asset_id"], "page_index": candidate["page_index"], "path": candidate["path"], "asset_metadata": candidate.get("asset_metadata") or {}, **local_judgement(next(item for item in manifest.get("images", []) if item.get("id") == candidate["asset_id"])), "reason": f"local-quality-fallback after vision failure: {exc}"})
    if vision_failed and len(results) < len(candidates):
        done = {item.get("asset_id") for item in results}
        by_id = {item.get("id"): item for item in manifest.get("images", [])}
        for candidate in candidates:
            if candidate["asset_id"] in done:
                continue
            judgement = local_judgement(by_id[candidate["asset_id"]])
            results.append({"asset_id": candidate["asset_id"], "page_index": candidate["page_index"], "path": candidate["path"], "asset_metadata": candidate.get("asset_metadata") or {}, **judgement, "reason": f"local-quality-fallback: {judgement['reason']}"})

    results.sort(key=lambda row: ((row.get("page_index") is None), row.get("page_index") or 9999, row.get("asset_id") or ""))
    output = {
        "version": 1,
        "model": None,
        "mode": "LOCAL_SCREENING_NOT_PIXEL_VALIDATION",
        "script": str(script_path),
        "manifest": str(manifest_path),
        "cited_pages": sorted(cited_pages),
        "assets": results,
        "summary": {
            "screened": len(results),
            "reviewed": 0,
            "primary_explanatory": sum(1 for item in results if item.get("primary_explanatory")),
            "rejected": sum(1 for item in results if item.get("category") == "blank_or_unusable"),
            "review_required": sum(1 for item in results if item.get("category") != "blank_or_unusable"),
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
