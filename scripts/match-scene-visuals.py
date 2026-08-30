#!/usr/bin/env python3
"""Choose a semantically relevant, vision-qualified component for each reviewed scene.

This optional QA sidecar is deliberately reviewable. It never changes rules,
source assets, or a reviewed explicit scene assignment.
"""
from __future__ import annotations

import base64
import concurrent.futures
import json
import sys
from pathlib import Path

from openai import OpenAI

MODEL = "gpt-5"
MIN_RELEVANCE = 70
SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "mobius_scene_visual_match",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "relevant": {"type": "boolean"},
                "relevance_score": {"type": "integer", "minimum": 0, "maximum": 100},
                "reason": {"type": "string"},
            },
            "required": ["relevant", "relevance_score", "reason"],
            "additionalProperties": False,
        },
    },
}


def data_url(image_path: Path) -> str:
    extension = image_path.suffix.lower()
    mime = "jpeg" if extension in {".jpg", ".jpeg"} else extension.lstrip(".")
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f"data:image/{mime};base64,{encoded}"


def judge_one(client: OpenAI, scene: dict, asset: dict) -> dict:
    prompt = (
        "You are matching a board-game tutorial scene to one image. Judge whether the image directly helps a beginner understand the scene, not whether it is merely attractive. "
        "Use the full 0–100 scale: 90–100 for a direct demonstration of the scene’s central rule; 70–89 for a strongly useful visual that omits a secondary detail; 40–69 for a supporting but incomplete visual; 0–39 for a misleading or irrelevant visual. "
        "Set relevant=true at 70 or more. A generic card or decorative art is not relevant when the scene explains a different action.\n\n"
        f"Scene id: {scene.get('id', '')}\n"
        f"Scene section: {scene.get('section', '')}\n"
        f"French narration: {scene.get('narration', '')}\n"
        f"On-screen summary: {scene.get('on_screen_text', '')}\n"
        f"Candidate asset id: {asset['asset_id']}"
    )
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": data_url(Path(asset["path"])), "detail": "low"}},
        ]}],
        response_format=SCHEMA,
        max_completion_tokens=250,
    )
    verdict = json.loads(response.choices[0].message.content)
    return {"scene_id": scene["id"], "asset_id": asset["asset_id"], **verdict}


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: match_scene_visuals.py SCRIPT.json VISUAL_QA.json OUTPUT.json")
    script_path, qa_path, out_path = map(Path, sys.argv[1:])
    script = json.loads(script_path.read_text(encoding="utf-8"))
    qa = json.loads(qa_path.read_text(encoding="utf-8"))

    usable_by_page: dict[int, list[dict]] = {}
    for asset in qa.get("assets", []):
        if asset.get("primary_explanatory") is True and int(asset.get("quality_score") or 0) >= 70 and asset.get("path"):
            usable_by_page.setdefault(int(asset["page_index"]), []).append(asset)

    jobs: list[tuple[dict, dict]] = []
    scene_rows: list[dict] = []
    for scene in script.get("scenes", []):
        scene_id = scene.get("id")
        if not scene_id:
            continue
        if scene.get("visual_asset"):
            scene_rows.append({"scene_id": scene_id, "status": "explicit-assignment", "selected_asset_id": None, "relevance_score": 100, "reason": "reviewed explicit assignment", "candidates": []})
            continue
        candidates = []
        for page in scene.get("source_pages", []):
            page_number = int(page)
            candidates.extend(usable_by_page.get(page_number, []))
            candidates.extend(usable_by_page.get(page_number - 1, []))
        if not candidates:
            scene_rows.append({"scene_id": scene_id, "status": "no-qualified-source-asset", "selected_asset_id": None, "relevance_score": 0, "reason": "no vision-qualified component available on cited source pages", "candidates": []})
            continue
        for asset in candidates[:3]:
            jobs.append((scene, asset))
        scene_rows.append({"scene_id": scene_id, "status": "pending", "selected_asset_id": None, "relevance_score": 0, "reason": "", "candidates": []})

    client = OpenAI()
    judgements: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(judge_one, client, scene, asset) for scene, asset in jobs]
        for future in futures:
            try:
                judgements.append(future.result())
            except Exception as exc:
                judgements.append({"scene_id": "unknown", "asset_id": None, "relevant": False, "relevance_score": 0, "reason": f"semantic-vision-failed: {exc}"})

    by_scene: dict[str, list[dict]] = {}
    for judgement in judgements:
        by_scene.setdefault(judgement["scene_id"], []).append(judgement)
    for row in scene_rows:
        if row["status"] != "pending":
            continue
        candidates = sorted(by_scene.get(row["scene_id"], []), key=lambda item: int(item.get("relevance_score") or 0), reverse=True)
        row["candidates"] = candidates
        best = candidates[0] if candidates else None
        if best and best.get("relevant") is True and int(best.get("relevance_score") or 0) >= MIN_RELEVANCE:
            row.update({"status": "matched", "selected_asset_id": best["asset_id"], "relevance_score": best["relevance_score"], "reason": best["reason"]})
        else:
            row.update({"status": "no-semantic-match", "selected_asset_id": None, "relevance_score": int(best.get("relevance_score") or 0) if best else 0, "reason": best.get("reason", "no semantic candidate") if best else "no semantic candidate"})

    payload = {
        "version": 1,
        "model": MODEL,
        "min_relevance": MIN_RELEVANCE,
        "script": str(script_path),
        "visual_quality_report": str(qa_path),
        "scenes": scene_rows,
        "summary": {
            "matched": sum(1 for row in scene_rows if row["status"] == "matched"),
            "explicit": sum(1 for row in scene_rows if row["status"] == "explicit-assignment"),
            "review_required": sum(1 for row in scene_rows if row["status"] in {"no-qualified-source-asset", "no-semantic-match"}),
        },
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
