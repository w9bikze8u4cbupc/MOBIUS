#!/usr/bin/env python3
"""Bounded object-scoped pixel evidence. Metadata ranks hypotheses, never validates them."""
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from openai import OpenAI

CONTRACT = "mobius-object-visual-evidence-v2"
SEARCH_CONTRACT = "mobius-referent-localization-v1"
SEARCH_EXECUTION_VERSION = 'object-scoped-crop-verification-v2'
COMPOSITION_RESPONSE_CONTRACT = 'normalized-composition-sequence-v2'
MODEL = os.getenv("MOBIUS_VISUAL_MATCH_MODEL") or os.getenv("OPENAI_MODEL")
_probe_spec = importlib.util.spec_from_file_location('mobius_visual_probe', Path(__file__).with_name('qualify-source-visuals.py'))
_probe_module = importlib.util.module_from_spec(_probe_spec)
_probe_spec.loader.exec_module(_probe_module)
# Reuse the existing bounded image representation; native pixels/hash stay authoritative.
image_data_url = _probe_module.image_data_url

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def schema(role=None):
    props = {"requiredObject": {"type": "string"}, "present": {"type": "boolean"},
        "confidence": {"type": "number"}, "complete": {"type": "boolean"}, "isolated": {"type": "boolean"},
        "stateCompatible": {"type": "boolean"}, "bbox": {"type": "array", "items": {"type": "number", "minimum": 0, "maximum": 1}, "maxItems": 4}, "reason": {"type": "string"}}
    if role == 'COMPOSITION':
        props.update({k: {'type': 'boolean'} for k in ('purposeSatisfied', 'phoneReadable')})
    if role == 'TRACK':
        point={'value':{'type':'number'},'x':{'type':'number'},'y':{'type':'number'}}
        stage={'label':{'type':'string'},'caption':{'type':'string'},'narration':{'type':'string'},'position':{'type':'number'},'isExample':{'type':'boolean'},'sourcePages':{'type':'array','items':{'type':'integer'}}}
        props.update({'trackLabelFrench':{'type':'string'},
            'trackPoints':{'type':'array','items':{'type':'object','properties':point,'required':list(point),'additionalProperties':False}},
            'stateStages':{'type':'array','items':{'type':'object','properties':stage,'required':list(stage),'additionalProperties':False}}})
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
    # Page/term proximity generates hypotheses only. Identity still needs pixels.
    terms = [r['term'] if isinstance(r['term'], str) else r['term'].get('name', '') for r in packet['requiredObjects']]
    tokens = set(re.findall(r'[a-z]{3,}', ' '.join(terms).lower())) - {'the', 'and'}
    rows = []
    seen = set()
    for a in assets:
        if not a.get('path') or not Path(a['path']).is_file() or a.get('category') == 'blank_or_unusable':
            continue
        m = a.get('asset_metadata') or {}
        if m.get('retrieval_context') and not m.get('visual_kind'):
            # Text linked native images are expanded only after pixel localization;
            # an entire page's logos/backgrounds must not consume the first budget.
            continue
        text = str(m.get('layout_text') or '').lower()
        overlap = sum(t.rstrip('s') in text for t in tokens)
        linked = m.get('source_page') in packet['sourcePages'] or overlap == len(tokens) and bool(tokens)
        if not linked:
            continue
        pixel_hash = hashlib.sha256(Path(a['path']).read_bytes()).hexdigest()
        if pixel_hash in seen:
            continue
        seen.add(pixel_hash)
        rows.append(a)
    def key(a):
        m = a.get("asset_metadata") or {}
        d = m.get("original_dimensions") or m.get("dimensions") or {}
        text = str(m.get('layout_text') or '').lower()
        heading = str(m.get('heading') or '').lower()
        score = sum(8 for t in tokens if t.rstrip('s') in heading)
        score += sum(min(5, text.count(t.rstrip('s'))) for t in tokens)
        score += 5 if m.get('visual_kind') == 'source-page-localization' else 0
        score += 2 if m.get('source_page') in packet['sourcePages'] else 0
        score -= 20 if re.search(r'background|logo|decorative', str(m.get('classification') or '')) else 0
        return (-score, -min(1000000, int(d.get('width') or 0) * int(d.get('height') or 0)), a['asset_id'])
    # Keep page diversity rather than spending every call on one page's columns.
    result, pages = [], set()
    for a in sorted(rows, key=key):
        m = a.get('asset_metadata') or {}
        group = (m.get('source_page'), m.get('visual_kind') == 'source-page-localization')
        if group in pages:
            continue
        result.append(a)
        pages.add(group)
    return result[:6]


def native_localization_alternatives(asset, assets):
    """A located but occluded page object may have an unobscured native source.
    Page proximity is a hypothesis only; each alternative still needs pixel QA.
    """
    page = (asset.get('asset_metadata') or {}).get('source_page')
    rows = [a for a in assets if (a.get('asset_metadata') or {}).get('source_page') == page
        and (a.get('asset_metadata') or {}).get('retrieval_context')
        and not (a.get('asset_metadata') or {}).get('visual_kind')
        and a.get('path') and Path(a['path']).is_file()]
    def detail(a):
        m = a['asset_metadata']
        d = m.get('original_dimensions') or m.get('dimensions') or {}
        return -(d.get('width', 0) * d.get('height', 0)), a['asset_id']
    return sorted(rows, key=detail)[:2]

def reserve_call(identity, provider_failure=None):
    """Optional durable mission cap, shared by all phases/directories. Fail closed on concurrent ownership."""
    filename = os.getenv('MOBIUS_VISUAL_BUDGET_LEDGER')
    if not filename:
        return True
    ledger = Path(filename)
    lock = ledger.with_suffix('.lock')
    handle = lock.open('x', encoding='utf-8')
    try:
        data = json.loads(ledger.read_text(encoding='utf-8'))
        group = os.environ['MOBIUS_VISUAL_BUDGET_GROUP']
        rows = data['calls']
        if provider_failure:
            data['providerBlocker'] = data.get('providerBlocker') or provider_failure
        elif data.get('providerBlocker'):
            return False
        group_cap = data.get('groupCaps', {}).get(group, data['maxPerGroup'])
        if not provider_failure and (len(rows) >= data['maxTotal'] or sum(r['group'] == group for r in rows) >= group_cap):
            return False
        if not provider_failure:
            rows.append({'group': group, 'identity': identity, 'ordinal': len(rows) + 1})
        tmp = ledger.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, indent=2), encoding='utf-8')
        tmp.replace(ledger)
        return True
    finally:
        handle.close()
        lock.unlink()


def authorize_continuation(filename, request_path):
    """Explicit bounded operator mandate. Never a retry triggered by an error.

    Keep all spent calls, old caps and failures. Authentication/quota suspension
    still requires the access-recovery operation, not a budget extension.
    """
    request_file = Path(request_path).resolve()
    request = json.loads(request_file.read_text(encoding='utf-8'))
    ident = request.get('id', '')
    allocations = request.get('additionalCallsByGroup', {})
    if (not re.fullmatch(r'[A-Za-z0-9_-]{4,100}', ident)
            or not request.get('authorization') or not request.get('reason')
            or request.get('model') != MODEL or not allocations
            or any(not isinstance(g, str) or type(n) is not int or not 0 < n <= 100 for g, n in allocations.items())
            or sum(allocations.values()) > 100):
        raise ValueError('A bounded explicit same-model continuation mandate is required')
    ledger = Path(filename)
    lock = ledger.with_suffix('.lock')
    handle = lock.open('x', encoding='utf-8')
    try:
        data = json.loads(ledger.read_text(encoding='utf-8'))
        history = data.setdefault('continuations', [])
        previous = next((r for r in history if r['id'] == ident), None)
        request_hash = digest(request)
        if previous:
            if previous['requestHash'] != request_hash:
                raise ValueError('Continuation ID already belongs to another mandate')
            return previous
        blocker = str(data.get('providerBlocker') or '')
        if re.search(r'401|403|429|Authentication|quota|credit', blocker, re.I):
            raise ValueError('Access/account failure requires verified access recovery, not extra budget')
        spent = {g: sum(r['group'] == g for r in data['calls']) for g in set(allocations) | {r['group'] for r in data['calls']}}
        record = {'id': ident, 'recordedAt': datetime.now(timezone.utc).isoformat(),
            'requestHash': request_hash, 'requestPath': str(request_file), 'model': MODEL,
            'authorization': request['authorization'], 'reason': request['reason'],
            'priorBlocker': data.get('providerBlocker'), 'priorMaxTotal': data['maxTotal'],
            'priorMaxPerGroup': data['maxPerGroup'], 'callsPreserved': len(data['calls']),
            'additionalCallsByGroup': allocations}
        history.append(record)
        data['maxTotal'] = len(data['calls']) + sum(allocations.values())
        data['groupCaps'] = {g: n + allocations.get(g, 0) for g, n in spent.items()}
        data['providerBlocker'] = None
        data['recoveryEpoch'] = ident
        tmp = ledger.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, indent=2), encoding='utf-8')
        tmp.replace(ledger)
        return record
    finally:
        handle.close()
        lock.unlink()


def reopen_provider_blocker(filename, access_check, prior_failure, recovery_id):
    """Explicit operator recovery, never an automatic retry or a new allowance."""
    check_path, failure_path = Path(access_check), Path(prior_failure)
    check = json.loads(check_path.read_text(encoding='utf-8'))
    failure = json.loads(failure_path.read_text(encoding='utf-8'))
    if (check.get('operation') != 'models.retrieve' or check.get('httpStatus') != 200
            or check.get('authentication') != 'PASS' or check.get('modelAccess') != 'PASS'
            or not MODEL or check.get('model') != MODEL or check.get('provider') != 'openai'
            or failure.get('httpStatus') != 401 or not check.get('recordedAt')
            or not re.fullmatch(r'[A-Za-z0-9_-]{4,100}', recovery_id)):
        raise ValueError('Explicit recovery requires a successful current-model access receipt and historical failure')
    if check_path.stat().st_mtime <= failure_path.stat().st_mtime:
        raise ValueError('Access receipt must be newer than historical failure')
    ledger = Path(filename)
    lock = ledger.with_suffix('.lock')
    handle = lock.open('x', encoding='utf-8')
    try:
        data = json.loads(ledger.read_text(encoding='utf-8'))
        history = data.setdefault('providerRecoveries', [])
        existing = next((r for r in history if r['id'] == recovery_id), None)
        if existing:
            if existing['accessCheck'] != str(check_path.resolve()):
                raise ValueError('Recovery identity already used by different access evidence')
            return existing
        if any(r['accessCheck'] == str(check_path.resolve()) for r in history):
            raise ValueError('Access receipt already consumed; a later provider failure needs new operator evidence')
        record = {'id': recovery_id, 'recordedAt': datetime.now(timezone.utc).isoformat(),
            'accessCheck': str(check_path.resolve()), 'priorFailure': str(failure_path.resolve()),
            'priorBlocker': data.get('providerBlocker') or 'historical HTTP 401',
            'callsPreserved': len(data['calls']), 'model': MODEL}
        history.append(record)
        data['providerBlocker'] = None
        data['recoveryEpoch'] = recovery_id
        tmp = ledger.with_suffix('.tmp')
        tmp.write_text(json.dumps(data, indent=2), encoding='utf-8')
        tmp.replace(ledger)
        return record
    finally:
        handle.close()
        lock.unlink()


def recovery_epoch():
    filename = os.getenv('MOBIUS_VISUAL_BUDGET_LEDGER')
    return json.loads(Path(filename).read_text(encoding='utf-8')).get('recoveryEpoch') if filename else None


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
    imported_roots = [Path(p).resolve() for p in json.loads(os.getenv('MOBIUS_VISUAL_CACHE_SOURCES', '[]'))]
    imported_inventory = [(str(root), sorted((p.name,p.stat().st_size,p.stat().st_mtime_ns)
        for p in root.glob('*.json') if re.fullmatch(r'[a-f0-9]{64}\.json',p.name))) for root in imported_roots]
    source_identities = [(a.get('asset_id'), hashlib.sha256(Path(a['path']).read_bytes()).hexdigest())
        for a in qa.get('assets', []) if a.get('path') and Path(a['path']).is_file()]
    source_identities += [('phone:' + a.get('asset_id', ''), hashlib.sha256(Path(a['asset_metadata']['phonePath']).read_bytes()).hexdigest())
        for a in qa.get('assets', []) if (a.get('asset_metadata') or {}).get('phonePath')]
    run_cache = cache_dir / ('run-' + digest([SEARCH_EXECUTION_VERSION, COMPOSITION_RESPONSE_CONTRACT, SEARCH_CONTRACT, CONTRACT, MODEL, script, source_identities,
        [a.get('asset_metadata') for a in qa.get('assets', [])], imported_inventory, os.getenv('MOBIUS_VISUAL_SCENE_ID'), max_calls, client is not None, recovery_epoch()]) + '.json')
    if run_cache.exists():
        previous = json.loads(run_cache.read_text(encoding='utf-8'))
        # Older composition executions recorded a schema failure but did not
        # propagate the suspension. Preserve that receipt; do not issue it again.
        invalid_composition = next((c for s in previous['scenes'] for c in s['candidates']
            if c.get('evidencePacket', {}).get('visualRole') == 'COMPOSITION'
            and c.get('status') != 'MEASURED' and str(c.get('reason', '')).startswith('ValueError;')), None)
        if invalid_composition and previous['summary'].get('providerCalls', 0) > 0:
            blocker = 'VISUAL_RESPONSE_INVALID: archived composition validation failed; no automatic retry'
            reserve_call({}, provider_failure=blocker)
            previous = {**previous, 'summary': {**previous['summary'], 'providerBlocker': blocker}}
        return {**previous, 'summary': {**previous['summary'], 'providerCalls': 0,
            'cacheHits': sum(c['status'] == 'MEASURED' for s in previous['scenes'] for c in s['candidates']), 'runCacheReused': True}}
    calls = hits = 0
    blocker = None
    scenes = []
    generated = []
    for scene in script.get("scenes", []):
        if os.getenv('MOBIUS_VISUAL_SCENE_ID') and scene.get('id') != os.environ['MOBIUS_VISUAL_SCENE_ID']:
            continue
        packet = packet_for(scene, script.get("componentTerms") or {})
        results = []
        queue = candidates_for(packet, qa.get("assets", [])) if packet['requiredObjects'] else []
        visited = set()
        for asset in queue:
            visit_id = (asset['asset_id'], (asset.get('asset_metadata') or {}).get('visual_kind'))
            if visit_id in visited:
                continue
            visited.add(visit_id)
            kind = (asset.get('asset_metadata') or {}).get('visual_kind')
            role = 'TRACK' if kind == 'track-geometry' else ('COMPOSITION' if kind == 'instructional-composition' else ('LOCALIZATION' if kind == 'source-page-localization' else 'COMPONENT'))
            scoped_packet = {**packet, 'visualRole': role, 'searchContract': SEARCH_CONTRACT}
            focus = (asset.get('asset_metadata') or {}).get('localizedReferent')
            if focus and role == 'COMPONENT':
                scoped_packet['requiredObjects'] = [obj for obj in packet['requiredObjects'] if obj['id'] == focus]
                if not scoped_packet['requiredObjects']:
                    continue
            if role == 'COMPOSITION':
                # Source-bound requirements identify the referent. Labels are
                # retrieval hypotheses, not new composition evidence.
                scoped_packet['requiredObjects'] = [{'id':o['id'],'term':o['id']} for o in packet['requiredObjects']]
                scoped_packet['responseContract'] = COMPOSITION_RESPONSE_CONTRACT
                phone = (asset.get('asset_metadata') or {}).get('phonePath')
                scoped_packet['phoneSha256'] = hashlib.sha256(Path(phone).read_bytes()).hexdigest() if phone else None
                frames = (asset.get('asset_metadata') or {}).get('sequenceFrames', [])
                if len(frames) > 8:
                    raise ValueError('Unbounded composition sequence')
                scoped_packet['sequenceFrames'] = [{
                    'id': f['id'], 'stage': f['stage'],
                    'imageSha256': hashlib.sha256(Path(f['outputPath']).read_bytes()).hexdigest(),
                    'phoneSha256': hashlib.sha256(Path(f['phonePath']).read_bytes()).hexdigest()
                } for f in frames]
            packet_hash = digest(scoped_packet)
            pixels = Path(asset["path"]).read_bytes()
            image_hash = hashlib.sha256(pixels).hexdigest()
            identity = {"contract": CONTRACT, "model": MODEL, "packet": packet_hash, "image": image_hash}
            cache = cache_dir / (digest(identity) + ".json")
            read_cache = next((p for p in [cache] + [root / cache.name for root in imported_roots] if p.is_file()), cache)
            result = {"asset_id": asset["asset_id"], "path": asset["path"], "status": "UNKNOWN",
                "objects": [], "evidencePacket": scoped_packet}
            provider_attempted = False
            try:
                if read_cache.exists():
                    stored = json.loads(read_cache.read_text(encoding="utf-8"))
                    if stored.get("identity") != identity:
                        raise ValueError("cache identity mismatch")
                    objects = validate_rows(stored["objects"], scoped_packet)
                    result['measurementCache'] = str(read_cache)
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
                    if not reserve_call(identity):
                        result['reason'] = 'cumulative visual budget exhausted or provider blocked'
                        results.append(result)
                        continue
                    calls += 1
                    provider_attempted = True
                    prompt = ("Inspect ONLY these pixels and supplied official context. Caller terms are hypotheses, not proof. "
                        "Return exactly one verdict per requiredObject. Confidence 0..1; unknown means false. "
                        "complete requires every physical boundary/corner; isolated requires unrelated content not dominating. "
                        "bbox is normalized [left,top,right,bottom] for the exact object, not the page (absent uses []). "
                        "LOCALIZATION: identify a complete representative object anywhere on a page, even small; isolation may be false. "
                        "COMPONENT: verify the actual cropped object boundaries, identity and intrinsic face/orientation. "
                        "stateCompatible concerns intrinsic face/orientation only, NOT scene quantity, ownership, transitions or positions. "
                        "Scene relationships require separate final composition validation. "
                        "Do not invent game facts. Explain visible evidence and missing evidence.\n" + json.dumps(scoped_packet, ensure_ascii=False))
                    content = [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": probe, "detail": "high"}}]
                    if role == 'TRACK':
                        content[0]['text'] = ('Map the VISIBLE numbered track belonging to the exact requested referent on this verified component. '
                            'Return normalized x,y marker centers for every clearly readable printed track value, no guessed coordinates or values. '
                            'Plan a short source-grounded pedagogical state sequence in natural French Canadian using ONLY the supplied rule evidence. '
                            'Preserve the stated initial value and the stated retention/reset behavior across turns. '
                            'A gain or expenditure can be a CONDITIONAL ILLUSTRATIVE EXAMPLE: set isExample=true and explicitly say "Si" or "Par exemple"; '
                            'never claim a named card or ability supplies an invented amount. Include end-of-turn and next-turn states if retention is required. '
                            'Each state position must be an observed printed track value. Cite only supplied source pages. '
                            'Track geometry is a measurement, these states are a PLAN requiring final composition verification, not accepted production. '
                            'If source evidence or pixels are insufficient, return empty trackPoints/stateStages and explain. '
                            'Standard bbox is normalized [left,top,right,bottom], confidence is 0..1, requiredObject is the exact ID.\n'+json.dumps(scoped_packet,ensure_ascii=False))
                    if role == 'COMPOSITION':
                        content[0]['text'] = ('Inspect this FINAL instructional composition and its phone-scale preview against the supplied requirements. '
                            'No new game facts. Evaluate every required object, full boundaries, quantity, placement and stated relations. '
                            'stateCompatible here concerns the WHOLE SCENE, including requested transitions, not only object orientation. '
                            'purposeSatisfied must be false if the visual does not teach the supplied purpose. '
                            'phoneReadable means the referent and required instructional text/symbols remain identifiable at phone scale; '
                            'do not require reading unrelated decorative/map text. Explain all missing evidence. '
                            'Return exact requested object IDs, bbox NORMALIZED [left,top,right,bottom] each in 0..1 '
                            'relative to the FINAL full-size image, NEVER pixel coordinates. Confidence 0..1, unknown=false.\n'
                            + json.dumps(scoped_packet, ensure_ascii=False))
                        phone = (asset.get('asset_metadata') or {}).get('phonePath')
                        if phone:
                            content.append({'type': 'image_url', 'image_url': {'url': image_data_url(Path(phone)), 'detail': 'high'}})
                        if frames:
                            content[0]['text'] += ('\nThe following images are the COMPLETE ordered state sequence, '
                                'each followed by its phone preview. Judge transitions and retained/reset values across ALL frames. '
                                'Annotations may indicate a track value without pretending to be a photographed physical marker. '
                                'Reject if the highlighted printed value differs from the caption, or source-bound states conflict. '
                                'Conditional examples are not claimed card-specific facts. Return bbox in the first frame.')
                            for frame in frames:
                                content.append({'type':'text','text':frame['id']})
                                for key in ('outputPath', 'phonePath'):
                                    content.append({'type':'image_url','image_url':{'url':image_data_url(Path(frame[key])), 'detail':'high'}})
                    response = client.chat.completions.create(model=MODEL, max_completion_tokens=4800 if role == 'TRACK' else 1800, response_format=schema(role),
                        messages=[{"role": "user", "content": content}])
                    # Keep the actual completion before schema validation. Never
                    # persist a client, headers, credentials or raw API exceptions.
                    receipt = cache.with_suffix('.response.json')
                    receipt_tmp = receipt.with_suffix('.tmp')
                    receipt_tmp.write_text(json.dumps({'identity': identity, 'content': response.choices[0].message.content,
                        'finishReason': getattr(response.choices[0], 'finish_reason', None),
                        'usage': response.usage.model_dump() if response.usage else None}, ensure_ascii=False), encoding='utf-8')
                    receipt_tmp.replace(receipt)
                    result['responseReceipt'] = str(receipt)
                    objects = validate_rows(json.loads(response.choices[0].message.content)["objects"], scoped_packet)
                if role == 'COMPOSITION' and any(type(r.get(k)) is not bool for r in objects for k in ('purposeSatisfied', 'phoneReadable')):
                    raise ValueError('Incomplete composition verdict')
                if role == 'TRACK':
                    for obj in objects:
                        points=obj.get('trackPoints',[])
                        if (not isinstance(points,list) or any(not all(isinstance(p.get(k),(int,float)) for k in ('value','x','y'))
                                or not 0 <= p['x'] <= 1 or not 0 <= p['y'] <= 1 for p in points)
                                or len({p['value'] for p in points}) != len(points)):
                            raise ValueError('Invalid measured track geometry')
                        if any(s.get('position') not in {p['value'] for p in points} or not s.get('sourcePages')
                            or any(p not in packet['sourcePages'] for p in s['sourcePages']) for s in obj.get('stateStages',[])):
                            raise ValueError('Invalid source-bound track state')
                if provider_attempted:
                    tmp = cache.with_suffix('.tmp')
                    tmp.write_text(json.dumps({'identity': identity, 'objects': objects,
                        'usage': response.usage.model_dump() if response.usage else None}, ensure_ascii=False), encoding='utf-8')
                    tmp.replace(cache)
                result.update(status="MEASURED", objects=[{**r, "contract": CONTRACT, "assetId": asset["asset_id"],
                    "imageSha256": image_hash, "evidencePacketHash": packet_hash, "model": MODEL,
                    "method": "provider-pixel-analysis", "visualRole": role, "evidenceRequirement": packet['requirement']} for r in objects])
                if role == 'COMPONENT' and len(packet['requiredObjects']) == 1 and packet['requirement'].get('trackStateRequired') and all(
                    o['present'] and o['complete'] and o['isolated'] and o['confidence'] >= .9 for o in objects):
                    queue.insert(queue.index(asset)+1,{**asset,'asset_metadata':{**(asset.get('asset_metadata') or {}),'visual_kind':'track-geometry'}})
                if role == 'LOCALIZATION':
                    if any(o['present'] and o['confidence'] >= .9 for o in objects):
                        alternatives = native_localization_alternatives(asset, qa.get('assets', []))
                        for candidate in reversed(alternatives):
                            if (candidate['asset_id'], (candidate.get('asset_metadata') or {}).get('visual_kind')) not in visited:
                                queue.insert(queue.index(asset) + 1, candidate)
                    for obj in objects:
                        if not obj['present'] or obj['confidence'] < .9 or not obj['complete']:
                            continue
                        crop_input = {'sourcePath': asset['path'], 'sourceId': asset['asset_id'],
                            'sourceSha256': image_hash, 'sourcePage': (asset.get('asset_metadata') or {}).get('source_page'),
                            'sourcePdfSha256': (asset.get('asset_metadata') or {}).get('source_pdf_sha256'),
                            'sourcePdfPath': (asset.get('asset_metadata') or {}).get('source_pdf_path'),
                            'objectId': obj['requiredObject'], 'bbox': obj['bbox'], 'outputDir': str(cache_dir.parent / 'localized-crops')}
                        js = "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',async()=>{try{console.log(JSON.stringify(await require('./src/services/objectAwareCrop.cjs').materializeMeasuredObjectCrop(JSON.parse(s))))}catch(e){console.error(e.message);process.exitCode=1}})"
                        child = subprocess.run(['node', '-e', js], input=json.dumps(crop_input), capture_output=True, text=True, encoding='utf-8', timeout=60)
                        if child.returncode:
                            result['cropFailure'] = child.stderr[:300]
                            continue
                        crop = json.loads(child.stdout)
                        if crop['id'] not in {g['id'] for g in generated}:
                            generated.append(crop)
                            # Verify immediately, before looking for the next source page.
                            queue.insert(queue.index(asset) + 1, {'asset_id': crop['id'], 'path': crop['file_path'],
                                'asset_metadata': {'source_page': crop['source_page'], 'dimensions': crop['dimensions'], 'localizedReferent':obj['requiredObject']}})
                        if crop_input.get('sourcePdfPath'):
                            # Native tiles can restore the unobscured source
                            # object behind a page's vector callouts. They remain
                            # an unverified search candidate, never an acceptance.
                            native_input = {**crop_input, 'recoveryMode': 'native-cluster'}
                            native_child = subprocess.run(['node', '-e', js], input=json.dumps(native_input),
                                capture_output=True, text=True, encoding='utf-8', timeout=60)
                            if native_child.returncode:
                                result['nativeClusterRecovery'] = 'NO_VALID_CLUSTER'
                            else:
                                native_crop = json.loads(native_child.stdout)
                                if native_crop['id'] not in {g['id'] for g in generated}:
                                    generated.append(native_crop)
                                    queue.insert(queue.index(asset) + 1, {'asset_id': native_crop['id'], 'path': native_crop['file_path'],
                                        'asset_metadata': {'source_page': native_crop['source_page'], 'dimensions': native_crop['dimensions'], 'localizedReferent':obj['requiredObject']}})
            except Exception as exc:
                result["reason"] = f"{type(exc).__name__}; HTTP {getattr(exc, 'status_code', 'unavailable')}"
                safe_issues = {'exact requested referents required', 'invalid confidence', 'incomplete verdict', 'invalid bounds', 'Incomplete composition verdict'}
                if str(exc) in safe_issues:
                    result['validationIssue'] = str(exc)
                if provider_attempted or not isinstance(exc, (ValueError, KeyError)):
                    blocker = result["reason"]
                    # Stop across resumed directories too; no automatic retry after a provider error.
                    try:
                        reserve_call(identity, provider_failure=blocker)
                    except (OSError, KeyError, ValueError):
                        pass  # This run is already blocked; never call a provider to repair bookkeeping.
            results.append(result)
        scenes.append({"scene_id": scene.get("id"), "status": "object-evidence-ready" if any(r["status"] == "MEASURED" for r in results) else "needs_visual_review",
            "selected_asset_id": None, "reason": "Canonical object/detail/state validation required", "candidates": results})
    report = {"version": 2, "contract": CONTRACT, "searchContract": SEARCH_CONTRACT, "model": MODEL, "scenes": scenes, "generatedAssets": generated,
        "summary": {"providerCalls": calls, "cacheHits": hits, "maxProviderCalls": max_calls, "retries": 0, "providerBlocker": blocker}}
    tmp = run_cache.with_suffix('.tmp')
    tmp.write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
    tmp.replace(run_cache)
    return report

def main():
    if len(sys.argv) == 4 and sys.argv[1] == '--authorize-continuation':
        print(json.dumps(authorize_continuation(*sys.argv[2:])))
        return
    if len(sys.argv) == 6 and sys.argv[1] == '--reopen-provider-blocker':
        print(json.dumps(reopen_provider_blocker(*sys.argv[2:])))
        return
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
