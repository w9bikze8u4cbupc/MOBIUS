import importlib.util
import json
import tempfile
import types
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('matcher', ROOT / 'scripts/match-scene-visuals.py')
matcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matcher)
spec = importlib.util.spec_from_file_location('qualifier', ROOT / 'scripts/qualify-source-visuals.py')
qualifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualifier)

class ObjectEvidenceTests(unittest.TestCase):
    def test_named_variant_context_is_preserved_and_cannot_reuse_generic_component_evidence(self):
        scene = {'id': 'ed-ability', 'source_pages': [17], 'visualRequirement': {
            'requiredObjects': ['character-board'],
            'requiredObjectDescriptors': [{'id': 'character-board', 'identityContextTerms': ['Ed', 'ED_A'],
                'identityContextEvidence': [{'page': 17, 'excerptHash': 'official-ed'}]}]}}
        packet = matcher.packet_for(scene, {'character-board': {
            'canonicalTerm': 'Character board', 'category': 'board',
            'evidence': [{'page': 17, 'quote': 'Character boards'}]}})
        context_hash = packet['requiredObjects'][0]['identityContextHash']
        self.assertTrue(context_hash)
        scoped = matcher.component_identity_packet(packet, 'COMPONENT')
        self.assertEqual(scoped['identityEvidence'][0]['variantTerms'], ['ED_A', 'Ed'])
        generic_report = {'scenes': [{'candidates': [{'objects': [{
            'requiredObject': 'character-board', 'visualRole': 'COMPONENT', 'present': True,
            'complete': True, 'isolated': True, 'stateCompatible': True, 'confidence': .99,
        }]}]}]}
        self.assertFalse(matcher.component_identity_proven('character-board', generic_report, context_hash))
        self.assertTrue(matcher.component_identity_proven('character-board', generic_report))

    def test_new_recovery_epoch_skips_compatible_retained_component_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory)
            first = cache / 'first.png'
            second = cache / 'second.png'
            pixels = (ROOT / 'tests/fixtures/images/test-bg-100x100.png').read_bytes()
            first.write_bytes(pixels)
            second.write_bytes(pixels + b'\0')
            first_hash = matcher.hashlib.sha256(first.read_bytes()).hexdigest()
            prior_row = {
                'requiredObject': 'known-board', 'present': True, 'confidence': .99,
                'complete': True, 'isolated': True, 'stateCompatible': True,
                'bbox': [.1, .1, .9, .9], 'reason': 'Exact retained board',
                'visualRole': 'COMPONENT', 'imageSha256': first_hash,
            }
            (cache / 'run-prior.json').write_text(json.dumps({'scenes': [{
                'scene_id': 'prior', 'candidates': [{
                    'asset_id': 'first', 'status': 'MEASURED', 'objects': [prior_row],
                    'evidencePacket': {'visualRole': 'COMPONENT'},
                }],
            }]}))
            script = {'scenes': [
                {'id': 'known', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['known-board']}},
                {'id': 'missing', 'source_pages': [3], 'visualRequirement': {'requiredObjects': ['missing-token']}},
            ]}
            qa = {'assets': [
                {'asset_id': 'first', 'path': str(first), 'asset_metadata': {'source_page': 2}},
                {'asset_id': 'second', 'path': str(second), 'asset_metadata': {'source_page': 3}},
            ]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                row = {'requiredObject': 'missing-token', 'present': True, 'confidence': .99,
                    'complete': True, 'isolated': True, 'stateCompatible': True,
                    'bbox': [.1, .1, .9, .9], 'reason': 'Exact new token'}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            result = matcher.run(script, qa, cache, 1, client)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result['summary']['providerCalls'], 1)
            self.assertEqual([scene['scene_id'] for scene in result['scenes']], ['known', 'missing'])
            self.assertEqual(result['scenes'][0]['candidates'][0]['objects'][0]['requiredObject'], 'known-board')
            self.assertEqual(result['scenes'][1]['candidates'][0]['objects'][0]['requiredObject'], 'missing-token')

    def test_shared_ledger_budget_receipt_is_explicitly_resumable(self):
        report = {'summary': {'providerCalls': 0, 'maxProviderCalls': 1, 'providerBlocker': None}, 'scenes': [{
            'candidates': [{'status': 'UNKNOWN', 'reason': 'cumulative visual budget exhausted or provider blocked'}]
        }]}
        self.assertTrue(matcher.continuation_required(report, 1))
        self.assertTrue(matcher.budget_exhausted_reason('pixel analysis unavailable or bounded budget exhausted'))
        self.assertFalse(matcher.budget_exhausted_reason('AuthenticationError; HTTP 401'))

    def test_exact_echoed_id_label_can_be_canonicalized_but_wrong_identity_cannot(self):
        packet={'requiredObjects':[{'id':'c','term':'Card'}]}
        row={'requiredObject':'c: Card','present':True,'confidence':.99,'complete':True,'isolated':True,'stateCompatible':True,'bbox':[.1,.1,.9,.9],'reason':'Visible card'}
        result=matcher.validate_rows([row],packet)[0]
        self.assertEqual(result['requiredObject'],'c')
        self.assertEqual(result['providerRequiredObject'],'c: Card')
        with self.assertRaises(ValueError):matcher.validate_rows([{**row,'requiredObject':'other: Card'}],packet)
        self.assertEqual(matcher.schema('COMPONENT',['c'])['json_schema']['schema']['properties']['objects']['items']['properties']['requiredObject']['enum'],['c'])

    def test_track_plan_is_source_bound_and_not_a_component_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels=ROOT/'tests/fixtures/images/test-bg-100x100.png'
            script={'scenes':[{'id':'scene','source_pages':[2],'visualRequirement':{'requiredObjects':['board'],'trackStateRequired':True}}]}
            qa={'assets':[{'asset_id':'board-image','path':str(pixels),'asset_metadata':{'source_page':2,'visual_kind':'track-geometry'}}]}
            row={'requiredObject':'board','present':True,'confidence':.99,'complete':True,'isolated':True,'stateCompatible':True,'bbox':[.1,.1,.9,.9],'reason':'Fixture geometry',
                'trackLabelFrench':'Réserve','trackPoints':[{'value':1,'x':.2,'y':.8}],
                'stateStages':[{'label':'Début','caption':'Un marqueur','narration':'La réserve commence à un.', 'position':1,'isExample':False,'sourcePages':[2]}]}
            def create(**kwargs):return types.SimpleNamespace(usage=None,choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects':[row]})))])
            client=types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first=matcher.run(script,qa,Path(directory),1,client)
            self.assertEqual(first['scenes'][0]['candidates'][0]['objects'][0]['visualRole'],'TRACK')
            self.assertEqual(matcher.run(script,qa,Path(directory),1,client)['summary']['providerCalls'],0)
            self.assertIsNone(first['scenes'][0]['selected_asset_id'])

    def test_localized_component_schedules_scene_scoped_track_measurement(self):
        """Identity and track geometry use distinct packets and provider roles."""
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [{'id': 'track', 'source_pages': [2], 'visualRequirement': {
                'requiredObjects': ['board'], 'trackStateRequired': True,
                'beforeState': 'Start at 1 Fuel.', 'afterState': 'Fuel is saved next turn.'}}]}
            qa = {'assets': [{'asset_id': 'localized-board', 'path': str(pixels), 'asset_metadata': {
                'source_page': 2, 'localizedReferent': 'board', 'layout_text': 'Fuel board'}}]}
            calls = []
            component = {'requiredObject': 'board', 'present': True, 'confidence': .99, 'complete': True,
                'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9], 'reason': 'complete board'}
            track = {**component, 'trackLabelFrench': 'Carburant', 'trackPoints': [{'value': 1, 'x': .2, 'y': .8}],
                'stateStages': [{'label': 'Début', 'caption': '1', 'narration': 'Un.', 'position': 1,
                    'isExample': False, 'sourcePages': [2]}]}
            def create(**kwargs):
                calls.append(kwargs)
                prompt = kwargs['messages'][0]['content'][0]['text']
                row = track if 'Map the VISIBLE numbered track' in prompt else component
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            result = matcher.run(script, qa, Path(directory), 2, client)
            rows = result['scenes'][0]['candidates']
            self.assertEqual([row['objects'][0]['visualRole'] for row in rows], ['COMPONENT', 'TRACK'])
            self.assertEqual(result['summary']['providerCalls'], 2)
            self.assertEqual(len(calls), 2)

    def test_retained_component_identity_still_schedules_scene_scoped_track_measurement(self):
        """Replay keeps exact identity pixels but must not skip track geometry."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            image_hash = matcher.hashlib.sha256(pixels.read_bytes()).hexdigest()
            component = {'requiredObject': 'board', 'present': True, 'confidence': .99,
                'complete': True, 'isolated': True, 'stateCompatible': True,
                'bbox': [.1, .1, .9, .9], 'reason': 'Exact retained board',
                'visualRole': 'COMPONENT', 'imageSha256': image_hash}
            # This retained report is intentionally component-only. A former
            # scheduler treated it as sufficient for a later stateful scene.
            (root / 'run-retained.json').write_text(json.dumps({'scenes': [{
                'scene_id': 'identity-scene', 'candidates': [{
                    'asset_id': 'board-image', 'path': str(pixels), 'status': 'MEASURED',
                    'objects': [component], 'evidencePacket': {'visualRole': 'COMPONENT'},
                }],
            }]}), encoding='utf-8')
            script = {'scenes': [{'id': 'track-scene', 'source_pages': [2], 'visualRequirement': {
                'requiredObjects': ['board'], 'trackStateRequired': True,
                'beforeState': 'Start at 1.', 'afterState': 'Keep the value next turn.'}}]}
            qa = {'assets': [{'asset_id': 'board-image', 'path': str(pixels), 'asset_metadata': {'source_page': 2}}]}
            track = {**component, 'trackLabelFrench': 'Réserve',
                'trackPoints': [{'value': 1, 'x': .2, 'y': .8}, {'value': 2, 'x': .7, 'y': .4}],
                'stateStages': [{'label': 'Début', 'caption': '1', 'narration': 'Un.', 'position': 1,
                    'isExample': False, 'sourcePages': [2]}, {'label': 'Après', 'caption': '2', 'narration': 'Deux.', 'position': 2,
                    'isExample': True, 'sourcePages': [2]}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                self.assertIn('Map the VISIBLE numbered track', kwargs['messages'][0]['content'][0]['text'])
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content=json.dumps({'objects': [track]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            result = matcher.run(script, qa, root, 1, client)
            candidates = result['scenes'][0]['candidates']
            self.assertEqual(result['summary']['providerCalls'], 1)
            self.assertEqual(len(calls), 1)
            self.assertEqual([candidate['objects'][0]['visualRole'] for candidate in candidates], ['COMPONENT', 'TRACK'])

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_bounded_continuation_preserves_history_and_does_not_reopen_auth(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, mandate = Path(directory) / 'budget.json', Path(directory) / 'mandate.json'
            original = {'maxTotal': 16, 'maxPerGroup': 8, 'calls': [{'group': 'a'}, {'group': 'b'}], 'providerBlocker': 'ValueError; HTTP unavailable'}
            ledger.write_text(json.dumps(original))
            mandate.write_text(json.dumps({'id': 'new-mission', 'model': matcher.MODEL,
                'authorization': 'operator fixture', 'reason': 'new corrected evidence path', 'additionalCallsByGroup': {'a': 2}}))
            first = matcher.authorize_continuation(ledger, mandate)
            self.assertEqual(first, matcher.authorize_continuation(ledger, mandate))
            resumed = json.loads(ledger.read_text())
            self.assertEqual(resumed['calls'], original['calls'])
            self.assertEqual(resumed['maxTotal'], 18)
            self.assertEqual(resumed['groupCaps'], {'a': 10, 'b': 8})
            self.assertEqual(first['priorBlocker'], original['providerBlocker'])
            with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_BUDGET_LEDGER': str(ledger), 'MOBIUS_VISUAL_BUDGET_GROUP': 'b'}):
                self.assertTrue(matcher.reserve_call({'test': True}))
            original['providerBlocker'] = 'AuthenticationError; HTTP 401'
            ledger.write_text(json.dumps(original))
            with self.assertRaises(ValueError): matcher.authorize_continuation(ledger, mandate)

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_later_continuation_preserves_unspent_prior_group_caps(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, mandate = Path(directory) / 'budget.json', Path(directory) / 'mandate.json'
            ledger.write_text(json.dumps({'maxTotal': 40, 'maxPerGroup': 8,
                'groupCaps': {'source': 24, 'composition': 32},
                'calls': [{'group': 'source'}]}))
            mandate.write_text(json.dumps({'id': 'default-resume', 'model': matcher.MODEL,
                'authorization': 'operator fixture', 'reason': 'resume deferred source measurements',
                'additionalCallsByGroup': {'default': 8}}))
            matcher.authorize_continuation(ledger, mandate)
            resumed = json.loads(ledger.read_text())
            self.assertEqual(resumed['maxTotal'], 48)
            self.assertEqual(resumed['groupCaps'], {'source': 24, 'composition': 32, 'default': 16})

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_durable_source_analysis_mandate_reserves_only_named_referent_substeps(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, mandate = Path(directory) / 'budget.json', Path(directory) / 'mandate.json'
            ledger.write_text(json.dumps({'maxTotal': 10, 'maxPerGroup': 4,
                'groupCaps': {'source': 4}, 'calls': []}), encoding='utf-8')
            mandate.write_text(json.dumps({'id': 'component-slice', 'model': matcher.MODEL,
                'authorization': 'fixture operator', 'reason': 'bounded component evidence',
                'additionalCallsByGroup': {'source': 3},
                'sourceAnalysisMandate': {'contract': matcher.SOURCE_ANALYSIS_MANDATE_CONTRACT,
                    'referents': [
                        {'id': 'target-token', 'maxCalls': 2, 'allowedRoles': ['LOCALIZATION', 'COMPONENT']},
                        {'id': 'target-board', 'maxCalls': 1, 'allowedRoles': ['COMPONENT']},
                    ]}}), encoding='utf-8')
            matcher.authorize_continuation(ledger, mandate)
            token_packet = {'requiredObjects': [{'id': 'target-token'}]}
            board_packet = {'requiredObjects': [{'id': 'target-board'}]}
            other_packet = {'requiredObjects': [{'id': 'comp-5'}]}
            with patch.dict(matcher.os.environ, {
                'MOBIUS_VISUAL_BUDGET_LEDGER': str(ledger), 'MOBIUS_VISUAL_BUDGET_GROUP': 'source',
                'MOBIUS_VISUAL_SOURCE_MANDATE_ID': 'component-slice',
            }, clear=False):
                self.assertTrue(matcher.reserve_call({'call': 'loc'}, reservation=matcher.source_reservation(token_packet, 'LOCALIZATION')))
                self.assertTrue(matcher.reserve_call({'call': 'component'}, reservation=matcher.source_reservation(token_packet, 'COMPONENT')))
                self.assertTrue(matcher.reserve_call({'call': 'board'}, reservation=matcher.source_reservation(board_packet, 'COMPONENT')))
                self.assertFalse(matcher.reserve_call({'call': 'token-repeat'}, reservation=matcher.source_reservation(token_packet, 'COMPONENT')))
                self.assertFalse(matcher.reserve_call({'call': 'wrong-component'}, reservation=matcher.source_reservation(other_packet, 'COMPONENT')))
            resumed = json.loads(ledger.read_text(encoding='utf-8'))
            reservations = [row['sourceReservation'] for row in resumed['calls']]
            self.assertEqual([(row['referent'], row['role']) for row in reservations], [
                ('target-token', 'LOCALIZATION'), ('target-token', 'COMPONENT'), ('target-board', 'COMPONENT'),
            ])

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_source_analysis_mandate_cannot_hide_two_substeps_in_one_referent_allowance(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, mandate = Path(directory) / 'budget.json', Path(directory) / 'mandate.json'
            ledger.write_text(json.dumps({'maxTotal': 8, 'maxPerGroup': 4,
                'groupCaps': {'source': 4}, 'calls': []}), encoding='utf-8')
            mandate.write_text(json.dumps({'id': 'too-small-plan', 'model': matcher.MODEL,
                'authorization': 'fixture operator', 'reason': 'invalid hidden substeps',
                'additionalCallsByGroup': {'source': 1},
                'sourceAnalysisMandate': {'contract': matcher.SOURCE_ANALYSIS_MANDATE_CONTRACT,
                    'referents': [{'id': 'token', 'maxCalls': 2, 'allowedRoles': ['LOCALIZATION', 'COMPONENT']}]}}), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'exceeds'):
                matcher.authorize_continuation(ledger, mandate)

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_reallocation_moves_only_unspent_continuation_calls(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, continuation, request = Path(directory) / 'budget.json', Path(directory) / 'continuation.json', Path(directory) / 'reallocate.json'
            ledger.write_text(json.dumps({'maxTotal': 10, 'maxPerGroup': 5,
                'groupCaps': {'source': 5, 'composition': 5}, 'calls': [{'group': 'composition'}],
                'continuations': [{'id': 'continuation', 'additionalCallsByGroup': {'composition': 3}}]}))
            request.write_text(json.dumps({'id': 'move-unspent', 'continuationId': 'continuation', 'model': matcher.MODEL,
                'authorization': 'operator fixture', 'reason': 'next evidence belongs to source analysis',
                'fromGroup': 'composition', 'toGroup': 'source', 'calls': 2}))
            record = matcher.reallocate_unspent_continuation(ledger, request)
            resumed = json.loads(ledger.read_text())
            self.assertEqual(record['maxTotalPreserved'], 10)
            self.assertEqual(resumed['maxTotal'], 10)
            self.assertEqual(resumed['groupCaps'], {'source': 7, 'composition': 3})
            self.assertEqual(resumed['calls'], [{'group': 'composition'}])
            with self.assertRaises(ValueError):
                request.write_text(json.dumps({**json.loads(request.read_text()), 'id': 'move-too-many', 'calls': 2}))
                matcher.reallocate_unspent_continuation(ledger, request)

    def test_invalid_provider_verdict_preserves_response_and_suspends_without_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}}]}
            qa = {'assets': [{'asset_id': 'final', 'path': str(pixels), 'asset_metadata': {'source_page': 2}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content='{"objects":[]}'))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first = matcher.run(script, qa, Path(directory), 1, client)
            replay = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(len(calls), 1)
            self.assertIsNotNone(first['summary']['providerBlocker'])
            self.assertEqual(replay['summary']['providerCalls'], 0)
            row = first['scenes'][0]['candidates'][0]
            self.assertEqual(row['validationIssue'], 'exact requested referents required')
            self.assertEqual(json.loads(Path(row['responseReceipt']).read_text())['content'], '{"objects":[]}')

    def test_reasoning_budget_exhaustion_is_explicit_and_never_retried_automatically(self):
        """A reasoning model can spend its output allowance before emitting JSON.

        This must be a durable, recoverable provider boundary rather than the
        misleading JSONDecodeError that previously obscured the real response.
        The receipt is kept for provenance, but replay must make no second
        provider call until an explicitly versioned recovery changes identity.
        """
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}}]}
            qa = {'assets': [{'asset_id': 'board', 'path': str(pixels), 'asset_metadata': {'source_page': 2}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content=''), finish_reason='length')])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first = matcher.run(script, qa, Path(directory), 1, client)
            replay = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(len(calls), 1)
            self.assertEqual(first['summary']['providerBlocker'], 'VISUAL_RESPONSE_REASONING_BUDGET_EXHAUSTED')
            self.assertEqual(replay['summary']['providerCalls'], 0)
            self.assertEqual(calls[0]['max_completion_tokens'], 4800)
            row = first['scenes'][0]['candidates'][0]
            self.assertEqual(row['providerFailure']['code'], 'VISUAL_RESPONSE_REASONING_BUDGET_EXHAUSTED')
            receipt = json.loads(Path(row['responseReceipt']).read_text())
            self.assertEqual(receipt['content'], '')
            self.assertEqual(receipt['finishReason'], 'length')
            self.assertEqual(receipt['identity']['executionContract'], matcher.RESPONSE_BUDGET_CONTRACT)

    def test_composition_reviews_final_pixels_and_phone_without_revalidating_component(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board'], 'purpose': 'Identify board'}}]}
            qa = {'assets': [{'asset_id': 'final', 'path': str(pixels), 'asset_metadata': {'source_page': 2,
                'visual_kind': 'instructional-composition', 'phonePath': str(pixels)}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                row = {'requiredObject': 'board', 'present': True, 'confidence': .99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9], 'reason': 'Synthetic composition fixture',
                    'purposeSatisfied': True, 'phoneReadable': True}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first = matcher.run(script, qa, Path(directory), 1, client)
            replay = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(len(calls), 1)
            self.assertEqual(replay['summary']['providerCalls'], 0)
            self.assertEqual(first['scenes'][0]['candidates'][0]['objects'][0]['visualRole'], 'COMPOSITION')
            self.assertEqual(len(calls[0]['messages'][0]['content']), 3)
            self.assertIn('WHOLE SCENE', calls[0]['messages'][0]['content'][0]['text'])

    def test_composition_cache_ignores_component_search_pages_but_not_final_evidence(self):
        """Discovery-index changes cannot re-spend a final-composition verdict.

        Component inventory pages help locate pixels before a composition is
        made.  They are not part of the final composition's source authority,
        requirement, frame hashes, or phone preview, so they must not fork a
        provider cache entry for identical final pixels.
        """
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            scene = {'id': 'scene', 'source_pages': [2], 'visualRequirement': {
                'requiredObjects': ['board'], 'purpose': 'Identify board'}}
            qa = {'assets': [{'asset_id': 'final', 'path': str(pixels), 'asset_metadata': {
                'source_page': 2, 'visual_kind': 'instructional-composition', 'phonePath': str(pixels)}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                row = {'requiredObject': 'board', 'present': True, 'confidence': .99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9], 'reason': 'Final composition',
                    'purposeSatisfied': True, 'phoneReadable': True}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first = matcher.run({'scenes': [scene]}, qa, Path(directory), 1, client)
            enriched = matcher.run({'scenes': [scene], 'componentTerms': {
                'board': {'canonicalTerm': 'Player board', 'evidence': [{'page': 4, 'quote': 'Player board'}]}
            }}, qa, Path(directory), 1, client)
            self.assertEqual(len(calls), 1)
            self.assertEqual(enriched['summary']['providerCalls'], 0)
            self.assertEqual(enriched['summary']['cacheHits'], 1)
            self.assertNotIn('componentEvidencePages', first['scenes'][0]['candidates'][0]['evidencePacket'])
            self.assertNotIn('componentEvidencePages', enriched['scenes'][0]['candidates'][0]['evidencePacket'])

    def test_composition_sequence_sends_each_frame_exactly_once_in_order(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            frames = [
                {'id': 'before', 'stage': {'id': 'before'}, 'outputPath': str(pixels), 'phonePath': str(pixels)},
                {'id': 'after', 'stage': {'id': 'after'}, 'outputPath': str(pixels), 'phonePath': str(pixels)},
            ]
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {
                'requiredObjects': ['board'], 'purpose': 'Show a transition', 'transitionRequired': True}}]}
            qa = {'assets': [{'asset_id': 'final', 'path': str(pixels), 'asset_metadata': {
                'source_page': 2, 'visual_kind': 'instructional-composition', 'phonePath': str(pixels),
                'sequenceFrames': frames, 'materializerContract': 'fixture-materializer-v2',
                'sequenceContract': 'fixture-sequence-v2'}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                row = {'requiredObject': 'board', 'present': True, 'confidence': .99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9],
                    'reason': 'Ordered fixture composition', 'purposeSatisfied': True, 'phoneReadable': True}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(
                    message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            result = matcher.run(script, qa, Path(directory), 1, client)
            content = calls[0]['messages'][0]['content']
            self.assertEqual(len(content), 1 + 3 * len(frames))
            self.assertEqual([item['text'] for item in content if item['type'] == 'text'][1:], ['before', 'after'])
            self.assertEqual(sum(item['type'] == 'image_url' for item in content), 4)
            packet = result['scenes'][0]['candidates'][0]['evidencePacket']
            self.assertEqual(packet['compositionMediaContract'], 'mobius-ordered-composition-media-v2')

    def test_native_recovery_uses_same_page_real_detail_without_granting_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            a = Path(directory) / 'pixels'
            a.write_bytes(b'fixture')
            def row(ident, page, width, native):
                return {'asset_id': ident, 'path': str(a), 'asset_metadata': {'source_page': page,
                    'dimensions': {'width': width, 'height': width}, 'original_dimensions': {'width': native, 'height': native},
                    'retrieval_context': {'role': 'PAGE_SEARCH_HYPOTHESIS'}}}
            rows = [row('tiny-upscaled', 4, 4000, 100), row('native', 4, 800, 800), row('wrong-page', 8, 2000, 2000)]
            chosen = matcher.native_localization_alternatives({'asset_metadata': {'source_page': 4}}, rows)
            self.assertEqual([r['asset_id'] for r in chosen], ['native', 'tiny-upscaled'])
            self.assertNotIn('objects', chosen[0])
            self.assertEqual(matcher.candidates_for({'sourcePages': [4], 'requiredObjects': []}, rows), [])

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_explicit_recovery_preserves_budget_and_failure_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, access, failure = [Path(directory) / name for name in ['budget.json', 'access.json', 'failure.json']]
            failure.write_text(json.dumps({'httpStatus': 401}))
            matcher.os.utime(failure, (1, 1))
            access.write_text(json.dumps({'operation': 'models.retrieve', 'httpStatus': 200,
                'authentication': 'PASS', 'modelAccess': 'PASS', 'model': matcher.MODEL,
                'provider': 'openai', 'recordedAt': 'test-fixture'}))
            original = {'maxTotal': 16, 'maxPerGroup': 8, 'calls': [{'group': 'a'}, {'group': 'b'}], 'providerBlocker': 'HTTP 401'}
            ledger.write_text(json.dumps(original))
            r = matcher.reopen_provider_blocker(str(ledger), str(access), str(failure), 'explicit-recovery')
            self.assertEqual(r, matcher.reopen_provider_blocker(str(ledger), str(access), str(failure), 'explicit-recovery'))
            data = json.loads(ledger.read_text())
            self.assertEqual(data['calls'], original['calls'])
            self.assertEqual(data['maxTotal'], 16)
            self.assertEqual(data['maxPerGroup'], 8)
            self.assertEqual(len(data['providerRecoveries']), 1)
            self.assertEqual(data['providerRecoveries'][0]['priorBlocker'], 'HTTP 401')
            self.assertIsNone(data['providerBlocker'])
            with self.assertRaises(ValueError):
                matcher.reopen_provider_blocker(str(ledger), str(access), str(failure), 'reuse-old-receipt')
            access.write_text(json.dumps({'httpStatus': 401}))
            with self.assertRaises(ValueError):
                matcher.reopen_provider_blocker(str(ledger), str(access), str(failure), 'bad-recovery')

    def test_shared_budget_survives_directories_and_provider_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Path(directory) / 'budget.json'
            ledger.write_text(json.dumps({'maxTotal': 3, 'maxPerGroup': 2, 'calls': []}))
            with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_BUDGET_LEDGER': str(ledger), 'MOBIUS_VISUAL_BUDGET_GROUP': 'source-a'}):
                self.assertTrue(matcher.reserve_call({'image': 'one'}))
                self.assertTrue(matcher.reserve_call({'image': 'two'}))
                self.assertFalse(matcher.reserve_call({'image': 'three'}))
                with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_BUDGET_GROUP': 'source-b'}):
                    self.assertTrue(matcher.reserve_call({'image': 'four'}))
                    self.assertFalse(matcher.reserve_call({'image': 'five'}))
                matcher.reserve_call({}, provider_failure='AuthenticationError; HTTP 401')
                self.assertFalse(matcher.reserve_call({'image': 'new-directory'}))
            self.assertEqual(len(json.loads(ledger.read_text())['calls']), 3)
            self.assertFalse(ledger.with_suffix('.lock').exists())

    def test_ledger_without_optional_group_uses_deterministic_default_bucket(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Path(directory) / 'budget.json'
            ledger.write_text(json.dumps({'maxTotal': 2, 'maxPerGroup': 1, 'calls': []}))
            with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_BUDGET_LEDGER': str(ledger)}, clear=False):
                matcher.os.environ.pop('MOBIUS_VISUAL_BUDGET_GROUP', None)
                self.assertTrue(matcher.reserve_call({'image': 'one'}))
                self.assertFalse(matcher.reserve_call({'image': 'two'}))
            rows = json.loads(ledger.read_text())['calls']
            self.assertEqual(rows, [{'group': 'default', 'identity': {'image': 'one'}, 'ordinal': 1}])

    @patch.object(matcher, 'MODEL', 'fixture-model')
    def test_verified_unreserved_receipt_is_accounted_once_without_erasing_an_overage(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger, receipt = Path(directory) / 'budget.json', Path(directory) / 'receipt.json'
            ledger.write_text(json.dumps({'maxTotal': 1, 'maxPerGroup': 1, 'calls': []}))
            receipt.write_text(json.dumps({'identity': {'contract': matcher.CONTRACT, 'model': matcher.MODEL,
                'packet': 'packet', 'image': 'image'}, 'content': '{"objects":[]}'}))
            first = matcher.reconcile_provider_receipt(ledger, receipt, 'composition')
            self.assertEqual(first, {'recorded': True, 'overCap': False, 'ordinal': 1})
            self.assertEqual(matcher.reconcile_provider_receipt(ledger, receipt, 'composition')['reason'], 'receipt-identity-already-accounted')
            second = Path(directory) / 'over-cap.json'
            second.write_text(json.dumps({'identity': {'contract': matcher.CONTRACT, 'model': matcher.MODEL,
                'packet': 'next-packet', 'image': 'next-image'}, 'content': '{"objects":[]}'}))
            overage = matcher.reconcile_provider_receipt(ledger, second, 'composition')
            data = json.loads(ledger.read_text())
            self.assertTrue(overage['overCap'])
            self.assertEqual(len(data['calls']), 2)
            self.assertEqual(data['accountingExceptions'][0]['type'], 'UNRESERVED_PROVIDER_RECEIPT_OVER_CAP')

    def test_ambiguous_budget_owner_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Path(directory) / 'budget.json'
            ledger.with_suffix('.lock').touch()
            with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_BUDGET_LEDGER': str(ledger)}):
                with self.assertRaises(FileExistsError):
                    matcher.reserve_call({})
            self.assertTrue(ledger.with_suffix('.lock').exists())

    def test_referent_search_uses_linked_component_page_not_largest_background(self):
        with tempfile.TemporaryDirectory() as directory:
            a, b = Path(directory) / 'a', Path(directory) / 'b'
            a.write_bytes(b'component-page')
            b.write_bytes(b'background-page')
            packet = {'requiredObjects': [{'id': 'comp-1', 'term': {'name': 'Player boards'}}], 'sourcePages': [9]}
            assets = [
                {'asset_id': 'background', 'path': str(b), 'asset_metadata': {'source_page': 9, 'classification': 'background', 'dimensions': {'width': 9000, 'height': 9000}}},
                {'asset_id': 'context', 'path': str(a), 'asset_metadata': {'source_page': 4, 'heading': 'Player boards', 'layout_text': 'Player boards store resources', 'visual_kind': 'source-page-localization'}},
                {'asset_id': 'same-pixels', 'path': str(a), 'asset_metadata': {'source_page': 4, 'layout_text': 'Player boards'}}]
            result = matcher.candidates_for(packet, assets)
            self.assertEqual(result[0]['asset_id'], 'context')
            self.assertEqual(len(result), 2)

    def test_distinct_native_images_on_one_page_are_not_collapsed_before_pixel_qa(self):
        """A page render and each embedded image are distinct discovery hypotheses."""
        with tempfile.TemporaryDirectory() as directory:
            page, first, second = [Path(directory) / name for name in ['page', 'first', 'second']]
            page.write_bytes(b'page-render-pixels')
            first.write_bytes(b'first-native-pixels')
            second.write_bytes(b'second-native-pixels')
            packet = {'requiredObjects': [{'id': 'comp-board', 'term': {'name': 'Player board'}}],
                'sourcePages': [4]}
            assets = [
                {'asset_id': 'page-render', 'path': str(page), 'asset_metadata': {
                    'source_page': 4, 'visual_kind': 'source-page-localization',
                    'layout_text': 'Player board', 'dimensions': {'width': 2000, 'height': 1400}}},
                {'asset_id': 'native-one', 'path': str(first), 'asset_metadata': {
                    'source_page': 4, 'retrieval_context': {'role': 'PAGE_SEARCH_HYPOTHESIS'},
                    'component_bindings': [{'componentId': 'comp-board', 'confidence': .4,
                        'reviewState': 'needs_review'}], 'dimensions': {'width': 700, 'height': 500}}},
                {'asset_id': 'native-two', 'path': str(second), 'asset_metadata': {
                    'source_page': 4, 'retrieval_context': {'role': 'PAGE_SEARCH_HYPOTHESIS'},
                    'component_bindings': [{'componentId': 'comp-board', 'confidence': .4,
                        'reviewState': 'needs_review'}], 'dimensions': {'width': 650, 'height': 500}}},
            ]
            self.assertEqual([row['asset_id'] for row in matcher.candidates_for(packet, assets)],
                ['page-render', 'native-one', 'native-two'])

    def test_component_inventory_pages_and_bindings_expand_search_without_proving_identity(self):
        """Inventory provenance is a retrieval hint, never an auto-acceptance."""
        with tempfile.TemporaryDirectory() as directory:
            page, native, background = [Path(directory) / name for name in ['page', 'native', 'background']]
            page.write_bytes(b'component-page')
            native.write_bytes(b'bound-native-pixels')
            background.write_bytes(b'background')
            scene = {'id': 'teach-card', 'source_pages': [9], 'visualRequirement': {'requiredObjects': ['comp-card']}}
            packet = matcher.packet_for(scene, {'comp-card': {
                'canonicalTerm': 'Criminal card', 'category': 'card',
                'evidence': [{'page': 4, 'quote': '21 Criminal cards'}]}})
            assets = [
                {'asset_id': 'background', 'path': str(background), 'asset_metadata': {
                    'source_page': 9, 'classification': 'background', 'dimensions': {'width': 9000, 'height': 9000}}},
                {'asset_id': 'inventory-page', 'path': str(page), 'asset_metadata': {
                    'source_page': 4, 'visual_kind': 'source-page-localization', 'heading': 'Criminal cards'}},
                {'asset_id': 'bound-native', 'path': str(native), 'asset_metadata': {
                    'source_page': 4, 'retrieval_context': {'role': 'PAGE_SEARCH_HYPOTHESIS'},
                    'component_bindings': [{'componentId': 'comp-card', 'confidence': .41, 'reviewState': 'needs_review'}]}},
            ]
            result = matcher.candidates_for(packet, assets)
            self.assertEqual(packet['sourcePages'], [4, 9])
            self.assertEqual(packet['ruleSourcePages'], [9])
            self.assertEqual(packet['componentEvidencePages'], [4])
            self.assertEqual([row['asset_id'] for row in result][:2], ['inventory-page', 'bound-native'])
            self.assertEqual(result[-1]['asset_id'], 'background')
            self.assertTrue(all('objects' not in row for row in result))

    def test_setup_visual_search_pages_rank_candidates_without_becoming_identity_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            inventory, setup = Path(directory) / 'inventory', Path(directory) / 'setup'
            inventory.write_bytes(b'inventory-pixels')
            setup.write_bytes(b'setup-pixels')
            scene = {'id': 'discovery', 'source_pages': [3], 'visualSearchPages': [8, 9],
                'visualRequirement': {'requiredObjects': ['board'], 'componentDiscovery': True}}
            packet = matcher.packet_for(scene, {'board': {
                'canonicalTerm': 'Player board', 'category': 'board',
                'evidence': [{'page': 3, 'quote': '1 Player board'}]}})
            result = matcher.candidates_for(packet, [
                {'asset_id': 'inventory', 'path': str(inventory), 'asset_metadata': {
                    'source_page': 3, 'visual_kind': 'source-page-localization', 'layout_text': '1 Player board'}},
                {'asset_id': 'setup', 'path': str(setup), 'asset_metadata': {
                    'source_page': 9, 'visual_kind': 'source-page-localization', 'layout_text': 'Setup illustration'}},
            ])
            self.assertEqual(packet['visualSearchPages'], [8, 9])
            self.assertEqual([row['asset_id'] for row in result], ['setup', 'inventory'])
            identity = matcher.component_identity_packet(packet, 'LOCALIZATION', result[0])
            # Page 9 enters only because these exact pixels came from page 9;
            # it does not become source-defined component evidence. Page 8 is
            # merely a neighbouring search hypothesis and remains absent.
            self.assertNotIn(8, identity['sourcePages'])
            self.assertEqual(identity['identityEvidence'][0]['componentEvidence'], [
                {'page': 3, 'quote': '1 Player board', 'excerptHash': None}])
            self.assertTrue(all('objects' not in row for row in result))

    def test_localized_referent_crop_is_replayed_before_unrelated_page_hypotheses(self):
        """A generated crop remains a hypothesis, but it must reach the next COMPONENT pass."""
        with tempfile.TemporaryDirectory() as directory:
            crop, page = Path(directory) / 'crop', Path(directory) / 'page'
            crop.write_bytes(b'localized-child-pixels')
            page.write_bytes(b'broad-page-pixels')
            packet = {
                'requiredObjects': [{'id': 'comp-board', 'term': {'name': 'Player board'}}],
                'sourcePages': [3],
                'visualSearchPages': [9],
                'requirement': {'componentDiscovery': True},
            }
            result = matcher.candidates_for(packet, [
                {'asset_id': 'broad-page', 'path': str(page), 'asset_metadata': {
                    'source_page': 3, 'visual_kind': 'source-page-localization',
                    'layout_text': 'Player board', 'dimensions': {'width': 2500, 'height': 3500}}},
                {'asset_id': 'localized-child', 'path': str(crop), 'asset_metadata': {
                    # The component was localized on a setup page, not the
                    # inventory/rule citation carried by this packet.
                    'source_page': 9, 'visual_kind': 'localized-object-crop',
                    'localizedReferent': 'comp-board',
                    'dimensions': {'width': 500, 'height': 320}}},
            ])
            self.assertEqual([row['asset_id'] for row in result], ['localized-child', 'broad-page'])
            self.assertTrue(all('objects' not in row for row in result))

    def test_localized_crop_for_another_referent_does_not_enter_search(self):
        with tempfile.TemporaryDirectory() as directory:
            crop = Path(directory) / 'crop'
            crop.write_bytes(b'other-component-pixels')
            packet = {'requiredObjects': [{'id': 'wanted', 'term': {'name': 'Wanted board'}}],
                'sourcePages': [3], 'requirement': {'componentDiscovery': True}}
            result = matcher.candidates_for(packet, [{'asset_id': 'other-crop', 'path': str(crop),
                'asset_metadata': {'source_page': 9, 'visual_kind': 'localized-object-crop',
                    'localizedReferent': 'different'}}])
            self.assertEqual(result, [])

    def test_stateful_source_terms_rank_retrieval_but_do_not_prove_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            inventory, state_page = Path(directory) / 'inventory', Path(directory) / 'state'
            inventory.write_bytes(b'inventory')
            state_page.write_bytes(b'state-page')
            scene = {'id': 'track', 'source_pages': [7], 'visualRequirement': {
                'requiredObjects': ['board'], 'trackStateRequired': True,
                'beforeState': 'Each player begins with 1 Fuel.',
                'actionState': 'The Fuel marker moves whenever Fuel is gained or used.',
                'afterState': 'Stored Fuel is saved from one turn to the next.',
            }}
            packet = matcher.packet_for(scene, {'board': {
                'canonicalTerm': 'Character board', 'evidence': [{'page': 3, 'quote': '4 Character boards'}]}})
            assets = [
                {'asset_id': 'inventory', 'path': str(inventory), 'asset_metadata': {
                    'source_page': 3, 'visual_kind': 'source-page-localization', 'layout_text': '4 Character boards and 7 Fuel cubes'}},
                {'asset_id': 'state-page', 'path': str(state_page), 'asset_metadata': {
                    'source_page': 17, 'visual_kind': 'source-page-localization',
                    'layout_text': 'Character abilities spend Fuel. Fuel marker and stored Fuel are kept from one turn to the next.'}},
            ]
            result = matcher.candidates_for(packet, assets)
            self.assertEqual([row['asset_id'] for row in result], ['state-page', 'inventory'])
            self.assertFalse(any('objects' in row for row in result))

    def test_authorized_candidates_preserve_diversity_and_rank_by_authority_after_term_evidence(self):
        """A retrieval hypothesis widens search but cannot collapse a gallery or prove identity."""
        with tempfile.TemporaryDirectory() as directory:
            local, first, second, unrelated = [Path(directory) / name for name in ['local', 'first', 'second', 'unrelated']]
            local.write_bytes(b'local-pixels')
            first.write_bytes(b'first-official-pixels')
            second.write_bytes(b'second-official-pixels')
            unrelated.write_bytes(b'unrelated-official-pixels')
            packet = {'requiredObjects': [{'id': 'captain-card', 'term': {'name': 'Captain card'}}], 'sourcePages': [4]}
            hypothesis = [{'componentId': 'captain-card', 'confidence': None, 'reviewState': 'hypothesis'}]
            assets = [
                {'asset_id': 'local-page', 'path': str(local), 'asset_metadata': {
                    'source_page': 4, 'heading': 'Components', 'dimensions': {'width': 2000, 'height': 1400}}},
                {'asset_id': 'official-captain-a', 'path': str(first), 'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES',
                    'asset_metadata': {'label': 'Captain card A', 'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES',
                        'component_bindings': hypothesis, 'dimensions': {'width': 800, 'height': 1200}}},
                {'asset_id': 'official-captain-b', 'path': str(second), 'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES',
                    'asset_metadata': {'label': 'Captain card B', 'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES',
                        'component_bindings': hypothesis, 'dimensions': {'width': 800, 'height': 1200}}},
                {'asset_id': 'official-unrelated', 'path': str(unrelated), 'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES',
                    'asset_metadata': {'label': 'Rival portrait', 'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES',
                        'component_bindings': hypothesis, 'dimensions': {'width': 800, 'height': 1200}}},
            ]
            result = matcher.candidates_for(packet, assets)
            self.assertEqual([row['asset_id'] for row in result][:2], ['official-captain-a', 'official-captain-b'])
            self.assertEqual(len(result), 3)
            self.assertTrue(all('objects' not in row for row in result))

    def test_uncaptioned_exact_publisher_gallery_is_one_bounded_component_discovery_fallback(self):
        """Opaque publisher gallery metadata may schedule inspection, never identity."""
        with tempfile.TemporaryDirectory() as directory:
            local, gallery = Path(directory) / 'local', Path(directory) / 'gallery'
            local.write_bytes(b'local-pixels')
            gallery.write_bytes(b'publisher-gallery-pixels')
            packet = {
                'requiredObjects': [{'id': 'board', 'term': {'name': 'Player board'}}],
                'sourcePages': [4],
                'requirement': {'componentDiscovery': True},
            }
            result = matcher.candidates_for(packet, [
                {'asset_id': 'local', 'path': str(local), 'asset_metadata': {
                    'source_page': 4, 'heading': 'Components', 'dimensions': {'width': 900, 'height': 600}}},
                {'asset_id': 'gallery', 'path': str(gallery), 'asset_metadata': {
                    'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES', 'source_page': None,
                    'label': 'opaque-gallery-image', 'component_bindings': [{'componentId': 'board', 'reviewState': 'hypothesis'}],
                    'dimensions': {'width': 1600, 'height': 1000},
                    'provenance': {'retrievalKind': 'publisher-product-page-gallery'}}},
            ])
            self.assertEqual([row['asset_id'] for row in result], ['local', 'gallery'])
            self.assertTrue(all('objects' not in row for row in result))

    def test_uncaptioned_official_setup_gallery_outranks_box_art_only_for_discovery(self):
        """A URL's editorial role ranks retrieval; it never proves identity."""
        with tempfile.TemporaryDirectory() as directory:
            local, box, setup = [Path(directory) / name for name in ['local', 'box', 'setup']]
            local.write_bytes(b'local-pixels')
            box.write_bytes(b'box-pixels')
            setup.write_bytes(b'setup-pixels')
            packet = {
                'requiredObjects': [{'id': 'board', 'term': {'name': 'Player board'}}],
                'sourcePages': [4], 'requirement': {'componentDiscovery': True},
            }
            base = {'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES', 'source_page': None,
                'component_bindings': [{'componentId': 'board', 'reviewState': 'hypothesis'}],
                'dimensions': {'width': 1600, 'height': 1000},
                'provenance': {'retrievalKind': 'publisher-product-page-gallery'}}
            result = matcher.candidates_for(packet, [
                {'asset_id': 'local', 'path': str(local), 'asset_metadata': {
                    'source_page': 4, 'heading': 'Components', 'dimensions': {'width': 900, 'height': 600}}},
                {'asset_id': 'box', 'path': str(box), 'asset_metadata': {
                    **base, 'provenance': {**base['provenance'], 'sourceUrl': 'https://publisher.example/game-box.jpg'}}},
                {'asset_id': 'setup', 'path': str(setup), 'asset_metadata': {
                    **base, 'provenance': {**base['provenance'], 'sourceUrl': 'https://publisher.example/game-setup.jpg'}}},
            ])
            self.assertEqual([row['asset_id'] for row in result], ['local', 'setup'])

    def test_uncaptioned_gallery_is_not_used_for_normal_scene_or_product_jsonld(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / 'gallery'
            image.write_bytes(b'publisher-gallery-pixels')
            base = {'asset_id': 'gallery', 'path': str(image), 'asset_metadata': {
                'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES', 'source_page': None,
                'dimensions': {'width': 1600, 'height': 1000},
                'provenance': {'retrievalKind': 'publisher-product-page-gallery'}}}
            normal = {'requiredObjects': [{'id': 'board', 'term': {'name': 'Player board'}}], 'sourcePages': [4], 'requirement': {}}
            jsonld = {'requiredObjects': [{'id': 'board', 'term': {'name': 'Player board'}}], 'sourcePages': [4],
                'requirement': {'componentDiscovery': True}}
            self.assertEqual(matcher.candidates_for(normal, [base]), [])
            base['asset_metadata']['provenance']['retrievalKind'] = 'product-jsonld'
            self.assertEqual(matcher.candidates_for(jsonld, [base]), [])

    def test_prioritized_analysis_spends_bounded_budget_on_track_before_multi_component_summary(self):
        scenes = [
            {'id': 'summary', 'visualRequirement': {'requiredObjects': ['a', 'b', 'c']}},
            {'id': 'ordinary', 'visualRequirement': {'requiredObjects': ['card']}},
            {'id': 'track', 'visualRequirement': {'requiredObjects': ['board'], 'trackStateRequired': True, 'transitionRequired': True}},
            {'id': 'discovery', 'visualRequirement': {'requiredObjects': ['a', 'b', 'c', 'd'], 'componentDiscovery': True}},
        ]
        self.assertEqual([scene['id'] for scene in matcher.prioritize_scenes(scenes)], ['track', 'discovery', 'ordinary', 'summary'])
        self.assertEqual([scene['id'] for scene in scenes], ['summary', 'ordinary', 'track', 'discovery'])

    def test_explicit_recovery_referents_precede_unrelated_track_work_in_director_order(self):
        scenes = [
            {'id': 'fuel-track', 'visualRequirement': {'requiredObjects': ['fuel-board'], 'trackStateRequired': True}},
            {'id': 'capture-discovery', 'visualRequirement': {'requiredObjects': ['capture-token'], 'componentDiscovery': True}},
            {'id': 'basic-discovery', 'visualRequirement': {'requiredObjects': ['basic-action-card'], 'componentDiscovery': True}},
        ]
        with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_SOURCE_PRIORITY_REFERENTS': 'capture-token,basic-action-card'}, clear=False):
            self.assertEqual([scene['id'] for scene in matcher.prioritize_scenes(scenes)], [
                'capture-discovery', 'basic-discovery', 'fuel-track',
            ])

    def test_explicit_recovery_scope_rejects_unlisted_or_mixed_provider_packets(self):
        allowed = {'capture-token', 'basic-action-card'}
        self.assertTrue(matcher.packet_is_within_explicit_referent_scope({
            'requiredObjects': [{'id': 'capture-token'}],
        }, allowed))
        self.assertFalse(matcher.packet_is_within_explicit_referent_scope({
            'requiredObjects': [{'id': 'fuel-board'}],
        }, allowed))
        self.assertFalse(matcher.packet_is_within_explicit_referent_scope({
            'requiredObjects': [{'id': 'capture-token'}, {'id': 'unrelated-card'}],
        }, allowed))
        self.assertTrue(matcher.packet_is_within_explicit_referent_scope({
            'requiredObjects': [{'id': 'fuel-board'}],
        }, set()))

    def test_explicit_recovery_allows_one_new_pixel_attempt_per_named_referent(self):
        allowed = {'capture-token', 'basic-action-card'}
        attempted = {'capture-token'}
        self.assertTrue(matcher.packet_repeats_explicit_referent({
            'requiredObjects': [{'id': 'capture-token'}],
        }, allowed, attempted))
        self.assertFalse(matcher.packet_repeats_explicit_referent({
            'requiredObjects': [{'id': 'basic-action-card'}],
        }, allowed, attempted))
        self.assertFalse(matcher.packet_repeats_explicit_referent({
            'requiredObjects': [{'id': 'capture-token'}],
        }, set(), attempted))

    def test_explicit_recovery_distributes_provider_calls_across_named_referents(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [
                {'id': 'capture-discovery', 'source_pages': [2], 'visualRequirement': {
                    'requiredObjects': ['capture-token'], 'componentDiscovery': True}},
                {'id': 'basic-discovery', 'source_pages': [3], 'visualRequirement': {
                    'requiredObjects': ['basic-action-card'], 'componentDiscovery': True}},
            ], 'componentTerms': {
                'capture-token': {'canonicalTerm': 'Capture token', 'evidence': [{'page': 2, 'quote': 'Capture tokens'}]},
                'basic-action-card': {'canonicalTerm': 'Basic Action card', 'evidence': [{'page': 3, 'quote': 'Basic Action cards'}]},
            }}
            qa = {'assets': [
                {'asset_id': 'capture-one', 'path': str(pixels), 'asset_metadata': {'source_page': 2}},
                {'asset_id': 'capture-two', 'path': str(pixels), 'asset_metadata': {'source_page': 2}},
                {'asset_id': 'basic-one', 'path': str(pixels), 'asset_metadata': {'source_page': 3}},
                {'asset_id': 'basic-two', 'path': str(pixels), 'asset_metadata': {'source_page': 3}},
            ]}
            calls = []
            def create(**kwargs):
                text = kwargs['messages'][0]['content'][0]['text']
                calls.append(text)
                required = 'capture-token' if 'capture-token' in text else 'basic-action-card'
                row = {'requiredObject': required, 'present': False, 'confidence': .99, 'complete': False,
                    'isolated': False, 'stateCompatible': False, 'bbox': [], 'reason': 'fixture negative'}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            with patch.dict(matcher.os.environ, {
                'MOBIUS_VISUAL_SOURCE_PRIORITY_REFERENTS': 'capture-token,basic-action-card',
                'MOBIUS_VISUAL_SOURCE_ALLOWED_REFERENTS': 'capture-token,basic-action-card',
            }, clear=False):
                result = matcher.run(script, qa, Path(directory), 2, client)
            self.assertEqual(result['summary']['providerCalls'], 2)
            self.assertEqual(len(calls), 2)
            self.assertIn('capture-token', calls[0])
            self.assertIn('basic-action-card', calls[1])

    def test_track_geometry_is_scheduled_from_outer_scene_not_identity_packet(self):
        packet = {'requirement': {'trackStateRequired': True}}
        scoped = {'requiredObjects': [{'id': 'board'}], 'requirement': {'identityOnly': True}}
        measured = [{'requiredObject': 'board', 'present': True, 'complete': True,
            'isolated': True, 'confidence': .95}]
        self.assertTrue(matcher.should_measure_track_geometry(packet, scoped, 'COMPONENT', measured))
        self.assertFalse(matcher.should_measure_track_geometry(packet, scoped, 'LOCALIZATION', measured))
        self.assertFalse(matcher.should_measure_track_geometry(packet, scoped, 'COMPONENT', [{**measured[0], 'complete': False}]))

    def test_complete_cluttered_component_gets_one_fresh_crop_verdict(self):
        measured = {'present': True, 'complete': True, 'isolated': False,
            'confidence': .96, 'bbox': [.1, .2, .8, .9]}
        self.assertTrue(matcher.should_refine_measured_object_crop('LOCALIZATION', measured, 0))
        self.assertTrue(matcher.should_refine_measured_object_crop('COMPONENT', measured, 0))
        self.assertFalse(matcher.should_refine_measured_object_crop('COMPONENT', measured, 1))
        self.assertFalse(matcher.should_refine_measured_object_crop('COMPONENT', {**measured, 'isolated': True}, 0))
        self.assertFalse(matcher.should_refine_measured_object_crop('COMPONENT', {**measured, 'complete': False}, 0))
        self.assertFalse(matcher.should_refine_measured_object_crop('COMPOSITION', measured, 0))

    def test_identity_coverage_prioritizes_reused_single_referent_before_an_unrelated_transition(self):
        scenes = [
            {'id': 'transition', 'visualRequirement': {'requiredObjects': ['rare'], 'transitionRequired': True}},
            {'id': 'shared-a', 'visualRequirement': {'requiredObjects': ['shared']}},
            {'id': 'shared-b', 'visualRequirement': {'requiredObjects': ['shared']}},
            {'id': 'summary', 'visualRequirement': {'requiredObjects': ['shared', 'rare']}},
        ]
        self.assertEqual([scene['id'] for scene in matcher.prioritize_scenes(scenes)][:3], ['shared-a', 'shared-b', 'transition'])

    def test_authorized_external_caption_prioritizes_only_matching_referent_for_pixel_inspection(self):
        scenes = [
            {'id': 'ordinary-board', 'visualRequirement': {'requiredObjects': ['board']}},
            {'id': 'named-card', 'visualRequirement': {'requiredObjects': ['antagonist-card']}},
        ]
        terms = {
            'board': {'canonicalTerm': 'Game board'},
            'antagonist-card': {'canonicalTerm': 'Antagonist card'},
        }
        assets = [{
            'asset_id': 'official-antagonist-figure', 'path': str(ROOT / 'tests/fixtures/images/test-bg-100x100.png'),
            'asset_metadata': {'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES', 'source_page': None,
                'label': 'antagonist figure', 'component_bindings': [{'componentId': 'board', 'reviewState': 'hypothesis'}]},
        }]

        ordered = matcher.prioritize_scenes(scenes, terms, assets)

        self.assertEqual([scene['id'] for scene in ordered], ['named-card', 'ordinary-board'])

    def test_external_caption_never_displaces_stateful_teaching_priority(self):
        scenes = [
            {'id': 'track', 'visualRequirement': {'requiredObjects': ['board'], 'trackStateRequired': True}},
            {'id': 'discovery', 'visualRequirement': {'requiredObjects': ['card'], 'componentDiscovery': True}},
        ]
        terms = {'board': {'canonicalTerm': 'Game board'}, 'card': {'canonicalTerm': 'Captain card'}}
        assets = [{
            'asset_id': 'official-captain', 'path': str(ROOT / 'tests/fixtures/images/test-bg-100x100.png'),
            'asset_metadata': {'sourceAuthority': 'OFFICIAL_PUBLISHER_HIGH_RES', 'source_page': None,
                'label': 'Captain card'},
        }]
        self.assertEqual([scene['id'] for scene in matcher.prioritize_scenes(scenes, terms, assets)], ['track', 'discovery'])

    def test_explicit_bounded_continuation_reuses_complete_scene_and_measures_next_candidate(self):
        """A later Inbox re-open advances deferred work without repeating pixels.

        The first bounded run proves one exact component and records the other
        as deferred.  The second run must retain the first scene verbatim and
        spend its only call on the second scene, not restart the batch.
        """
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [
                {'id': 'a-board', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}},
                {'id': 'b-token', 'source_pages': [3], 'visualRequirement': {'requiredObjects': ['token']}}
            ]}
            qa = {'assets': [
                {'asset_id': 'board-page', 'path': str(pixels), 'asset_metadata': {'source_page': 2}},
                {'asset_id': 'token-page', 'path': str(pixels), 'asset_metadata': {'source_page': 3}}
            ]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                text = kwargs['messages'][0]['content'][0]['text']
                required = 'board' if '"id": "board"' in text else 'token'
                row = {'requiredObject': required, 'present': True, 'confidence': .99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9], 'reason': 'fixture object'}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(first['summary']['providerCalls'], 1)
            self.assertTrue(first['summary']['continuationRequired'])
            self.assertEqual(first['scenes'][0]['scene_id'], 'a-board')
            self.assertEqual(first['scenes'][1]['candidates'][0]['status'], 'UNKNOWN')
            second = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(second['summary']['providerCalls'], 1)
            self.assertFalse(second['summary']['continuationRequired'])
            self.assertEqual(len(calls), 2)
            self.assertEqual(second['scenes'][0], first['scenes'][0])
            self.assertEqual(second['scenes'][1]['candidates'][0]['status'], 'MEASURED')

    def test_component_identity_measurement_is_shared_by_stateful_scenes_without_claiming_state_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [
                {'id': 'static-board', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}},
                {'id': 'stateful-board', 'source_pages': [3], 'visualRequirement': {
                    'requiredObjects': ['board'], 'transitionRequired': True,
                    'beforeState': 'before', 'actionState': 'action', 'afterState': 'after'}}
            ]}
            qa = {'assets': [{'asset_id': 'board', 'path': str(pixels), 'asset_metadata': {'source_page': 2, 'layout_text': 'board'}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                row = {'requiredObject': 'board', 'present': True, 'confidence': .99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9], 'reason': 'fixture board'}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            result = matcher.run(script, qa, Path(directory), 2, client)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result['summary']['providerCalls'], 1)
            self.assertEqual(result['summary']['cacheHits'], 1)
            packet = result['scenes'][1]['candidates'][0]['evidencePacket']
            self.assertEqual(packet['identityContract'], matcher.COMPONENT_IDENTITY_PACKET_CONTRACT)
            self.assertTrue(packet['requirement']['identityOnly'])
            self.assertNotIn('transitionRequired', packet['requirement'])

    def test_component_identity_keeps_bounded_official_family_context_but_not_scene_state(self):
        scene = {'id': 'criminal-card', 'source_pages': [7], 'sourceRefs': [{
            'page': 7, 'quote': 'The number of Clues required is indicated on the Criminal card.', 'excerptHash': 'abc'}],
            'visualRequirement': {'requiredObjects': ['criminal'], 'transitionRequired': True,
                'beforeState': 'before', 'actionState': 'action', 'afterState': 'after'}}
        packet = matcher.packet_for(scene, {'criminal': {
            'canonicalTerm': 'Criminal card', 'frenchTerm': 'carte Criminel', 'category': 'card',
            'evidence': [{'page': 3, 'quote': '21 Criminal cards'}]}})
        scoped = matcher.component_identity_packet(packet, 'COMPONENT', {'asset_metadata': {
            'source_page': 13, 'layout_text': 'This criminal originally has 3 Resistance tokens.'}})
        self.assertEqual(scoped['identityContract'], matcher.COMPONENT_IDENTITY_PACKET_CONTRACT)
        self.assertEqual(scoped['identityEvidence'][0]['category'], 'card')
        self.assertEqual(scoped['identityEvidence'][0]['componentEvidence'][0]['quote'], '21 Criminal cards')
        self.assertEqual(scoped['assetOfficialContext'][0]['page'], 13)
        self.assertIn('This criminal', scoped['assetOfficialContext'][0]['text'])
        self.assertNotIn('transitionRequired', scoped['requirement'])
        self.assertNotIn('beforeState', json.dumps(scoped))
        self.assertNotIn('The number of Clues required', json.dumps(scoped))

    def test_component_identity_reuses_exact_pixels_across_distinct_rule_scenes(self):
        """Rule prose cannot fork a reusable component-identity measurement."""
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            scenes = [
                {'id': 'discard', 'source_pages': [2], 'sourceRefs': [{'page': 2, 'quote': 'Discard this card'}],
                    'visualRequirement': {'requiredObjects': ['card'], 'transitionRequired': True}},
                {'id': 'draw', 'source_pages': [7], 'sourceRefs': [{'page': 7, 'quote': 'Draw this card'}],
                    'visualRequirement': {'requiredObjects': ['card'], 'transitionRequired': True}},
            ]
            qa = {'assets': [{'asset_id': 'card-source', 'path': str(pixels), 'asset_metadata': {
                'source_page': 4, 'layout_text': 'Criminal card', 'heading': 'Criminal cards'}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                row = {'requiredObject': 'card', 'present': True, 'confidence': .99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [.1, .1, .9, .9], 'reason': 'Complete card'}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': [row]})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            result = matcher.run({'scenes': scenes, 'componentTerms': {'card': {
                'canonicalTerm': 'Criminal card', 'evidence': [{'page': 4, 'quote': 'Criminal cards'}]}}}, qa, Path(directory), 2, client)
            self.assertEqual(len(calls), 1)
            self.assertEqual(result['summary']['providerCalls'], 1)
            self.assertEqual(result['summary']['cacheHits'], 1)
            packets = [scene['candidates'][0]['evidencePacket'] for scene in result['scenes']]
            self.assertEqual(packets[0], packets[1])
            self.assertEqual(packets[0]['sourcePages'], [4])

    def test_component_discovery_yields_to_track_state_but_precedes_ordinary_transition(self):
        scenes = [
            {'id': 'lesson', 'visualRequirement': {'requiredObjects': ['card'], 'transitionRequired': True}},
            {'id': 'discovery', 'visualRequirement': {'requiredObjects': ['card', 'token'], 'componentDiscovery': True,
                'purpose': 'component-identity-discovery'}},
            {'id': 'track', 'visualRequirement': {'requiredObjects': ['board'], 'trackStateRequired': True}},
        ]
        ordered = matcher.prioritize_scenes(scenes, {}, [])
        self.assertEqual([scene['id'] for scene in ordered], ['track', 'discovery', 'lesson'])

    def test_context_enriched_contract_reuses_only_prior_localization_not_component_verdict(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            old = Path(directory) / 'previous.json'
            image_hash = matcher.hashlib.sha256(pixels.read_bytes()).hexdigest()
            old.write_text(json.dumps({'scenes': [{'candidates': [
                {'asset_id': 'page', 'status': 'MEASURED', 'objects': [{'requiredObject': 'card', 'present': True,
                    'confidence': .99, 'complete': True, 'isolated': True, 'stateCompatible': True,
                    'bbox': [.1,.1,.9,.9], 'reason': 'old page measurement', 'visualRole': 'LOCALIZATION',
                    'imageSha256': image_hash}]}
            ]}]}))
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['card']}}],
                'componentTerms': {'card': {'canonicalTerm': 'Criminal card', 'evidence': [{'page': 2, 'quote': 'Criminal card'}]}}}
            qa = {'assets': [
                {'asset_id': 'page', 'path': str(pixels), 'asset_metadata': {'source_page': 2, 'visual_kind': 'source-page-localization', 'layout_text': 'Criminal card'}}]}
            calls=[]
            def create(**kwargs):
                calls.append(kwargs)
                row={'requiredObject':'card','present':True,'confidence':.99,'complete':True,'isolated':True,'stateCompatible':True,'bbox':[.1,.1,.9,.9],'reason':'fresh crop'}
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects':[row]})))])
            client=types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            with patch.dict(matcher.os.environ, {'MOBIUS_VISUAL_PREVIOUS_REPORT': str(old)}, clear=False):
                result=matcher.run(script,qa,Path(directory)/'cache',2,client)
            page=next(c for c in result['scenes'][0]['candidates'] if c['asset_id']=='page')
            crop=next(c for c in result['scenes'][0]['candidates'] if c['asset_id'].startswith('localized-'))
            self.assertEqual(page['validationRecovery'], 'official-context-enriched-localization; no new provider call')
            self.assertEqual(crop['status'], 'MEASURED')
            self.assertEqual(len(calls), 1)

    def test_positive_component_and_exact_track_survive_context_upgrade_but_negative_component_does_not(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            image_hash = matcher.hashlib.sha256(pixels.read_bytes()).hexdigest()
            requirement = {'requiredObjects': ['board'], 'trackStateRequired': True}
            component = {'requiredObject': 'board', 'present': True, 'confidence': .99, 'complete': True,
                'isolated': True, 'stateCompatible': True, 'bbox': [.1,.1,.9,.9], 'reason': 'complete board',
                'visualRole': 'COMPONENT', 'imageSha256': image_hash}
            track = {**component, 'visualRole': 'TRACK', 'trackPoints': [{'value': 1, 'x': .2, 'y': .8}],
                'stateStages': [{'label':'Début','caption':'Un','narration':'Un.', 'position':1,'isExample':False,'sourcePages':[2]}]}
            (root/'run-retained.json').write_text(json.dumps({'scenes': [{'scene_id': 'scene', 'candidates': [
                {'asset_id':'board','status':'MEASURED','evidencePacket':{'requirement':requirement},'objects':[component]},
                {'asset_id':'board','status':'MEASURED','evidencePacket':{'requirement':requirement},'objects':[track]},
                {'asset_id':'negative','status':'MEASURED','objects':[ {**component, 'present':False, 'complete':False,
                    'isolated':False, 'stateCompatible':False, 'confidence':.2, 'bbox':[]} ]}
            ]}]}))
            retained = matcher.retained_measurements('', root)
            identity = ('board', image_hash, ('board',))
            self.assertIn(('COMPONENT', identity), retained['identity'])
            self.assertIn(('scene', identity, matcher.digest(requirement)), retained['track'])
            self.assertNotIn(('COMPONENT', ('negative', image_hash, ('board',))), retained['identity'])

    def test_unknown_component_hypothesis_is_not_dropped_before_pixel_analysis(self):
        self.assertTrue(qualifier.eligible_hypothesis({'is_component': None, 'type': 'focused-page-crop'}))
        self.assertTrue(qualifier.eligible_hypothesis({}))
        self.assertFalse(qualifier.eligible_hypothesis({'is_component': False}))
        self.assertTrue(qualifier.eligible_hypothesis({'is_component': False, 'native': True,
            'classification': 'other', 'retrieval_context': {'role': 'PAGE_SEARCH_HYPOTHESIS'}, 'visual_metrics': {'nearBlank': False}}))
        self.assertFalse(qualifier.eligible_hypothesis({'is_component': False, 'native': True,
            'classification': 'other', 'retrieval_context': {}, 'visual_metrics': {'nearBlank': True}}))

    def test_local_geometry_never_implies_complete_component(self):
        for kind in ['focused-page-crop', 'focused-page-region', 'card', 'token', 'board']:
            verdict = qualifier.local_judgement({'type': kind, 'dimensions': {'width': 1500, 'height': 1800}})
            self.assertFalse(verdict['primary_explanatory'])
            self.assertEqual(verdict['evidenceStatus'], 'UNKNOWN')

    def test_budget_cache_and_exact_object_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            pixels = ROOT / 'tests/fixtures/images/test-bg-100x100.png'
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}}]}
            qa = {'assets': [{'asset_id': 'a', 'path': str(pixels), 'asset_metadata': {'source_page': 2}}]}
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                rows = [{'requiredObject': 'board', 'present': True, 'confidence': 0.99, 'complete': True,
                    'isolated': True, 'stateCompatible': True, 'bbox': [0.1, 0.1, 0.9, 0.9], 'reason': 'synthetic unit fixture'}]
                return types.SimpleNamespace(usage=None, choices=[types.SimpleNamespace(message=types.SimpleNamespace(content=json.dumps({'objects': rows})))])
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            first = matcher.run(script, qa, Path(directory), 1, client)
            second = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(first['summary']['providerCalls'], 1)
            self.assertEqual(second['summary']['providerCalls'], 0)
            self.assertEqual(len(calls), 1)
            self.assertEqual(first['scenes'], second['scenes'])
            with patch.object(matcher, 'recovery_epoch', return_value='explicit-recovery'):
                recovered = matcher.run(script, qa, Path(directory), 1, client)
                self.assertEqual(recovered['summary']['providerCalls'], 0)
                self.assertEqual(recovered['summary']['cacheHits'], 1)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]['model'], matcher.MODEL)
            self.assertTrue(calls[0]['messages'][0]['content'][1]['image_url']['url'].startswith('data:image/jpeg;base64,'))
            with self.assertRaises(ValueError):
                matcher.validate_rows([{'requiredObject': 'other'}], matcher.packet_for(script['scenes'][0], {}))

    def test_unsafe_image_probe_never_counts_as_provider_call(self):
        with tempfile.TemporaryDirectory() as directory:
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=lambda **kwargs: self.fail('provider must not be called'))))
            script = {'scenes': [{'id': 'scene', 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}}]}
            qa = {'assets': [{'asset_id': 'a', 'path': str(ROOT / 'tests/fixtures/images/test-bg-100x100.png'), 'asset_metadata': {'source_page': 2}}]}
            with patch.object(matcher, 'image_data_url', side_effect=OSError('unsafe pixels')):
                result = matcher.run(script, qa, Path(directory), 1, client)
            self.assertEqual(result['summary']['providerCalls'], 0)
            self.assertEqual(result['scenes'][0]['candidates'][0]['status'], 'UNKNOWN')
            self.assertIn('IMAGE_PROBE_UNAVAILABLE', result['scenes'][0]['candidates'][0]['reason'])

    def test_provider_failure_stops_calls_without_favourable_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            def create(**kwargs):
                calls.append(kwargs)
                raise RuntimeError('provider unavailable')
            client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
            script = {'scenes': [{'id': str(i), 'source_pages': [2], 'visualRequirement': {'requiredObjects': ['board']}} for i in range(5)]}
            qa = {'assets': [{'asset_id': 'a', 'path': str(ROOT / 'tests/fixtures/images/test-bg-100x100.png'), 'asset_metadata': {'source_page': 2}}]}
            result = matcher.run(script, qa, Path(directory), 6, client)
            self.assertEqual(len(calls), 1)
            self.assertTrue(all(c['status'] == 'UNKNOWN' for s in result['scenes'] for c in s['candidates']))

if __name__ == '__main__':
    unittest.main()
