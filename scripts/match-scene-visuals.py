#!/usr/bin/env python3
"""Choose a semantically relevant, vision-qualified component for each reviewed scene.

This optional QA sidecar is deliberately reviewable. It never changes rules,
source assets, or a reviewed explicit scene assignment.
"""
from __future__ import annotations

import base64
import concurrent.futures
import json
import os
import sys
from pathlib import Path

from openai import OpenAI

MODEL = os.getenv("MOBIUS_VISUAL_MATCH_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5"
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


def normalize(value: str) -> str:
    import unicodedata
    value = unicodedata.normalize("NFD", str(value or ""))
    return "".join(ch for ch in value.lower() if not unicodedata.combining(ch))


def tokens(value: str) -> set[str]:
    return {token for token in normalize(value).replace("-", " ").split() if len(token) > 2}


def scene_concepts(scene: dict) -> set[str]:
    text = normalize(" ".join(str(scene.get(key) or "") for key in ("section", "narration", "on_screen_text")))
    concepts = set()
    groups = {
        "setup": {"setup", "set", "mise", "place", "placer", "material", "materiel", "preparer", "marche", "market"},
        "take": {"take", "prendre", "prenez", "echange", "echanger", "exchange", "camel", "chameau", "market", "marche"},
        "sell": {"sell", "vendre", "vente", "sale", "goods", "marchandise", "marchandises"},
        "scoring": {"score", "scoring", "decompte", "manche", "round", "sceau", "seal", "riche", "rich", "fin", "end"},
        "objective": {"objectif", "aim", "but", "goal", "gagner", "gagne", "game", "jeu"},
    }
    words = tokens(text)
    for concept, members in groups.items():
        if words & members:
            concepts.add(concept)
    return concepts


def preferred_page(scene: dict) -> int | None:
    section = normalize(scene.get("section"))
    if any(word in section for word in ("mise en place", "materiel", "matériel", "setup", "objectif", "presentation", "présentation", "pause")):
        return 2
    if any(word in section for word in ("tour", "action", "prendre", "take", "vendre", "sell")):
        return 3
    if any(word in section for word in ("fin", "decompte", "décompte", "scoring", "conclusion")):
        return 4
    return None


def concept_weight(scene: dict, concept: str) -> int:
    words = tokens(" ".join(str(scene.get(key) or "") for key in ("section", "narration", "on_screen_text")))
    members = {
        "setup": {"setup", "mise", "place", "placer", "materiel", "marche", "market"},
        "take": {"take", "prendre", "prenez", "echange", "echanger", "exchange", "camel", "chameau"},
        "sell": {"sell", "vendre", "vente", "vendu", "vends", "goods", "marchandise", "jeton"},
        "scoring": {"score", "scoring", "decompte", "manche", "round", "sceau", "seal", "riche", "rich", "fin", "end"},
        "objective": {"objectif", "aim", "but", "goal", "gagner", "gagne", "game", "jeu"},
    }
    return len(words & members.get(concept, set()))


def local_relevance(scene: dict, asset: dict) -> dict:
    metadata = asset.get("asset_metadata") or {}
    labels = " ".join(metadata.get("layout_labels") or [])
    label_tokens = tokens(labels)
    scene_words = tokens(" ".join(str(scene.get(key) or "") for key in ("section", "narration", "on_screen_text")))
    concepts = scene_concepts(scene)
    label_concepts = set()
    label_text = normalize(labels)
    if any(word in label_text for word in ("setup", "set-up", "material", "mise")): label_concepts.add("setup")
    if any(word in label_text for word in ("take", "exchange", "game turn")): label_concepts.add("take")
    if "sell" in label_text: label_concepts.add("sell")
    if any(word in label_text for word in ("scoring", "round", "end of the game")): label_concepts.add("scoring")
    if any(word in label_text for word in ("introduction", "aim", "objective")): label_concepts.add("objective")
    overlap = len(scene_words & label_tokens)
    concept_overlap = len(concepts & label_concepts)
    scene_concept = max(concepts, key=lambda concept: concept_weight(scene, concept), default=None)
    strongest_weight = concept_weight(scene, scene_concept) if scene_concept else 0
    candidate_weight = max((concept_weight(scene, concept) for concept in label_concepts), default=0)
    kind = normalize(metadata.get("visual_kind") or metadata.get("type") or metadata.get("classification"))
    page_match = metadata.get("source_page") in {int(page) for page in scene.get("source_pages", []) if str(page).isdigit()}
    page_priority = preferred_page(scene)
    preferred = page_priority is not None and int(metadata.get("source_page") or 0) == page_priority
    if kind == "focused-page-crop" and (concept_overlap or overlap):
        return {"relevant": True, "relevance_score": 98 if preferred and candidate_weight >= strongest_weight else 92, "reason": "local-semantic: focused source panel label directly matches the teaching concept"}
    if kind == "focused-page-crop" and page_match and concepts & {"objective", "setup", "take", "sell", "scoring"}:
        return {"relevant": True, "relevance_score": 84 if preferred else 74, "reason": "local-semantic: cited focused source panel supports the teaching concept"}
    asset_type = normalize(metadata.get("type") or metadata.get("classification"))
    type_match = ((asset_type in {"card", "tile"} and concepts & {"setup", "take", "sell", "objective"})
                  or (asset_type in {"token", "marker"} and concepts & {"setup", "scoring"}))
    if type_match and page_match:
        return {"relevant": True, "relevance_score": 73, "reason": "local-semantic: cited extracted component type supports the teaching concept"}
    return {"relevant": False, "relevance_score": 25 if page_match else 5, "reason": "local-semantic-rejected: no direct concept or component-type evidence"}


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
        # Keep a diverse bounded pool. The old first-eight slice could be
        # exhausted by page 2 components when a scene cited a broad range,
        # hiding the more explanatory panel on the later teaching page.
        unique = {}
        for asset in candidates:
            unique[asset.get("asset_id")] = asset
        preferred = preferred_page(scene)
        candidates = sorted(unique.values(), key=lambda asset: (
            0 if preferred is not None and int((asset.get("asset_metadata") or {}).get("source_page") or 0) == preferred else 1,
            0 if (asset.get("asset_metadata") or {}).get("visual_kind") == "focused-page-crop" else 1,
            -int(asset.get("quality_score") or 0),
        ))
        if not candidates:
            scene_rows.append({"scene_id": scene_id, "status": "no-qualified-source-asset", "selected_asset_id": None, "relevance_score": 0, "reason": "no vision-qualified component available on cited source pages", "candidates": []})
            continue
        for asset in candidates[:8]:
            jobs.append((scene, asset))
        scene_rows.append({"scene_id": scene_id, "status": "pending", "selected_asset_id": None, "relevance_score": 0, "reason": "", "candidates": []})

    client = None if os.getenv("MOBIUS_VISUAL_LOCAL_ONLY", "").lower() in {"1", "true", "yes"} else OpenAI()
    judgements: list[dict] = []
    if client is not None:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(judge_one, client, scene, asset) for scene, asset in jobs]
            for future, (scene, asset) in zip(futures, jobs):
                try:
                    judgements.append({"scene_id": scene["id"], **future.result()})
                except Exception as exc:
                    judgements.append({"scene_id": scene["id"], "asset_id": asset["asset_id"], **local_relevance(scene, asset), "reason": f"local-semantic-fallback after vision failure: {exc}"})
    else:
        for scene, asset in jobs:
            judgements.append({"scene_id": scene["id"], "asset_id": asset["asset_id"], **local_relevance(scene, asset)})

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
