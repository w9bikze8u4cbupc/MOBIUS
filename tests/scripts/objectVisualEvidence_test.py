import importlib.util
import json
import tempfile
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('matcher', ROOT / 'scripts/match-scene-visuals.py')
matcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matcher)
spec = importlib.util.spec_from_file_location('qualifier', ROOT / 'scripts/qualify-source-visuals.py')
qualifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualifier)

class ObjectEvidenceTests(unittest.TestCase):
    def test_unknown_component_hypothesis_is_not_dropped_before_pixel_analysis(self):
        self.assertTrue(qualifier.eligible_hypothesis({'is_component': None, 'type': 'focused-page-crop'}))
        self.assertTrue(qualifier.eligible_hypothesis({}))
        self.assertFalse(qualifier.eligible_hypothesis({'is_component': False}))

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
            self.assertEqual(calls[0]['model'], matcher.MODEL)
            with self.assertRaises(ValueError):
                matcher.validate_rows([{'requiredObject': 'other'}], matcher.packet_for(script['scenes'][0], {}))

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
