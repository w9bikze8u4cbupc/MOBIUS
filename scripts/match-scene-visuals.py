#!/usr/bin/env python3
"""Bounded object-scoped pixel evidence. Metadata ranks hypotheses, never validates them."""
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path
from openai import OpenAI

CONTRACT = "mobius-object-visual-evidence-v1"
MODEL = os.getenv("MOBIUS_VISUAL_MATCH_MODEL") or os.getenv("OPENAI_MODEL")
_probe_spec = importlib.util.spec_from_file_location('mobius_visual_probe', Path(__file__).with_name('qualify-source-visuals.py'))
_probe_module = importlib.util.module_from_spec(_probe_spec)
_probe_spec.loader.exec_module(_probe_module)
# Reuse the existing bounded image representation; native pixels/hash stay authoritative.
image_data_url = _probe_module.image_data_url

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def schema():
    props = {"requiredObject": {"type": "string"}, "present": {"type": "boolean"},
        "confidence": {"type": "number"}, "complete": {"type": "boolean"}, "isolated": {"type": "boolean"},
        "stateCompatible": {"type": "boolean"}, "bbox": {"type": "array", "items": {"type": "number"}}, "reason": {"type": "string"}}
    return {"type": "json_schema", "json_schema": {"name": "object_pixel_evidence", "strict": True, "schema": {
        "type": "object", "properties": {"objects": {"type": "array", "items": {"type": "object",
        "properties": props, "required": list(props), "additionalProperties": False}}},
        "required": ["objects"], "additionalProperties": False}}}

def packet_for(scene, terms):
    req = scene.get("visualRequirement") or {}
    return {"contract": CONTRACT, "requiredObjects": [{"id": ident, "term": terms.get(ident) or ident}
        for ident in req.get("requiredObjects", [])], "requirement": req,
        "sourceRefs": scene.get("sourceRefs") or [], "sourcePages": scene.get("source_pages") or []}

def candidates_for(packet, assets):
    rows = [a for a in assets if a.get("path") and Path(a["path"]).is_file()
        and (a.get("asset_metadata") or {}).get("source_page") in packet["sourcePages"]
        and a.get("category") != "blank_or_unusable"]
    def key(a):
        m = a.get("asset_metadata") or {}
        d = m.get("original_dimensions") or m.get("dimensions") or {}
        return (-int(d.get("width") or 0) * int(d.get("height") or 0), a["asset_id"])
    return sorted(rows, key=key)[:3]

def validate_rows(rows, packet):
    ids = {item["id"] for item in packet["requiredObjects"]}
    if not isinstance(rows, list) or len(rows) != len(ids) or {r.get("requiredObject") for r in rows} != ids:
        raise ValueError("exact requested referents required")
    for r in rows:
        if not isinstance(r.get("confidence"), (int, float)) or not 0 <= r["confidence"] <= 1:
            raise ValueError("invalid confidence")
        if not r.get("reason") or any(type(r.get(k)) is not bool for k in ("present", "complete", "isolated", "stateCompatible")):
            raise ValueError("incomplete verdict")
        b = r.get("bbox")
        if r["present"] and (not isinstance(b, list) or len(b) != 4
            or not all(isinstance(v, (int, float)) for v in b) or not (0 <= b[0] < b[2] <= 1 and 0 <= b[1] < b[3] <= 1)):
            raise ValueError("invalid bounds")
    return rows

def run(script, qa, cache_dir, max_calls=8, client=None):
    cache_dir.mkdir(parents=True, exist_ok=True)
    source_identities = [(a.get('asset_id'), hashlib.sha256(Path(a['path']).read_bytes()).hexdigest())
        for a in qa.get('assets', []) if a.get('path') and Path(a['path']).is_file()]
    run_cache = cache_dir / ('run-' + digest([CONTRACT, MODEL, script, source_identities, max_calls, client is not None]) + '.json')
    if run_cache.exists():
        previous = json.loads(run_cache.read_text(encoding='utf-8'))
        return {**previous, 'summary': {**previous['summary'], 'providerCalls': 0,
            'cacheHits': sum(c['status'] == 'MEASURED' for s in previous['scenes'] for c in s['candidates']), 'runCacheReused': True}}
    calls = hits = 0
    blocker = None
    scenes = []
    for scene in script.get("scenes", []):
        packet = packet_for(scene, script.get("componentTerms") or {})
        packet_hash = digest(packet)
        results = []
        for asset in candidates_for(packet, qa.get("assets", [])) if packet["requiredObjects"] else []:
            pixels = Path(asset["path"]).read_bytes()
            image_hash = hashlib.sha256(pixels).hexdigest()
            identity = {"contract": CONTRACT, "model": MODEL, "packet": packet_hash, "image": image_hash}
            cache = cache_dir / (digest(identity) + ".json")
            result = {"asset_id": asset["asset_id"], "path": asset["path"], "status": "UNKNOWN",
                "objects": [], "evidencePacket": packet}
            try:
                if cache.exists():
                    stored = json.loads(cache.read_text(encoding="utf-8"))
                    if stored.get("identity") != identity:
                        raise ValueError("cache identity mismatch")
                    objects = validate_rows(stored["objects"], packet)
                    hits += 1
                elif client is None or calls >= max_calls or blocker or os.getenv('MOBIUS_VISUAL_CACHE_ONLY') == 'true':
                    result["reason"] = blocker or "pixel analysis unavailable or bounded budget exhausted"
                    results.append(result)
                    continue
                else:
                    try:
                        probe = image_data_url(Path(asset['path']))
                    except Exception as exc:
                        result['reason'] = f'IMAGE_PROBE_UNAVAILABLE:{type(exc).__name__}'
                        results.append(result)
                        continue
                    calls += 1
                    prompt = ("Inspect ONLY these pixels and supplied official context. Caller terms are hypotheses, not proof. "
                        "Return exactly one verdict per requiredObject. Confidence 0..1; unknown means false. "
                        "complete requires every physical boundary/corner; isolated requires unrelated content not dominating. "
                        "bbox is normalized [left,top,right,bottom] for the exact object, not the page (absent uses []). "
                        "stateCompatible requires every specified face, orientation, quantity, placement and relationship visibly satisfied. "
                        "Do not invent game facts. Explain visible evidence and missing evidence.\n" + json.dumps(packet, ensure_ascii=False))
                    response = client.chat.completions.create(model=MODEL, max_completion_tokens=1800, response_format=schema(),
                        messages=[{"role": "user", "content": [{"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": probe, "detail": "high"}}]}])
                    objects = validate_rows(json.loads(response.choices[0].message.content)["objects"], packet)
                    tmp = cache.with_suffix(".tmp")
                    tmp.write_text(json.dumps({"identity": identity, "objects": objects,
                        "usage": response.usage.model_dump() if response.usage else None}, ensure_ascii=False), encoding="utf-8")
                    tmp.replace(cache)
                result.update(status="MEASURED", objects=[{**r, "contract": CONTRACT, "assetId": asset["asset_id"],
                    "imageSha256": image_hash, "evidencePacketHash": packet_hash, "model": MODEL,
                    "method": "provider-pixel-analysis", "evidenceRequirement": packet['requirement']} for r in objects])
            except Exception as exc:
                result["reason"] = f"{type(exc).__name__}; HTTP {getattr(exc, 'status_code', 'unavailable')}"
                if not isinstance(exc, (ValueError, KeyError)):
                    blocker = result["reason"]
            results.append(result)
        scenes.append({"scene_id": scene.get("id"), "status": "object-evidence-ready" if any(r["status"] == "MEASURED" for r in results) else "needs_visual_review",
            "selected_asset_id": None, "reason": "Canonical object/detail/state validation required", "candidates": results})
    report = {"version": 2, "contract": CONTRACT, "model": MODEL, "scenes": scenes,
        "summary": {"providerCalls": calls, "cacheHits": hits, "maxProviderCalls": max_calls, "retries": 0, "providerBlocker": blocker}}
    tmp = run_cache.with_suffix('.tmp')
    tmp.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    tmp.replace(run_cache)
    return report

def main():
    if len(sys.argv) != 4:
        raise SystemExit("usage: match-scene-visuals.py SCRIPT.json QUALITY.json OUTPUT.json")
    script, quality, output = map(Path, sys.argv[1:])
    local = os.getenv("MOBIUS_VISUAL_LOCAL_ONLY", "").lower() in {"1", "true", "yes"}
    budget = max(0, min(32, int(os.getenv("MOBIUS_VISUAL_MATCH_MAX_CALLS", "8"))))
    client = None if local or not MODEL or not os.getenv("OPENAI_API_KEY") else OpenAI(max_retries=0, timeout=90)
    payload = run(json.loads(script.read_text(encoding="utf-8-sig")), json.loads(quality.read_text(encoding="utf-8-sig")),
        output.parent / "object-evidence-cache", budget, client)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"]))

if __name__ == "__main__":
    main()
