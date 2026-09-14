const transport = require('../../src/services/projectStateTransport.cjs');

test('content references preserve all candidates, decisions and arbitrary JSON keys without aliasing after hydration', () => {
  const asset = { id: 'component', path: 'C:\\evidence\\card.png', provenance: { excerpt: 'é'.repeat(600) }, candidates: ['a', 'b'], decision: 'pending' };
  const value = { assets: [asset], reviews: [{ candidates: [asset, asset] }], literal: { $ref: 'not-a-reference' } };
  const packed = transport.packProjectState(value);
  expect(transport.unpackProjectState(packed)).toEqual(value);
  expect(transport.packProjectState(value)).toEqual(packed);
  const restored = transport.unpackProjectState(packed);
  restored.assets[0].decision = 'accepted';
  expect(restored.reviews[0].candidates[0].decision).toBe('pending');
  expect(transport.bytes(packed)).toBeLessThan(transport.bytes(value));
});

test('corrupt, missing and unbounded references are rejected before state is written', () => {
  const packed = transport.packProjectState({ text: 'é'.repeat(600) });
  const [key] = Object.keys(packed.definitions);
  delete packed.definitions[key];
  expect(() => transport.unpackProjectState(packed)).toThrow(/reference/);
  expect(() => transport.packProjectState({ text: 'x'.repeat(transport.TRANSPORT_BUDGET_BYTES) })).toThrow(/budget/);
  expect(() => transport.unpackProjectState({ contract: 'unknown' })).toThrow(/contract/);
});

test('storage hydrates historical rows and exact serialized fields for Cockpit and renderer', () => {
  const row = { id: 1, metadata: JSON.stringify({ projectContext: { projectId: 'fixture', evidence: 'source'.repeat(300) } }), scenes: '[{"id":"one"}]', script: 'prose' };
  expect(transport.unpackProjectRow(transport.packProjectRow(row))).toEqual(row);
  expect(transport.unpackProjectRow(row)).toEqual(row);
});

test('repeated source strings across distinct assets are interned losslessly with bounded replay', () => {
  const excerpt = 'Source officielle avec quantité et condition. '.repeat(200);
  const value = { assets: Array.from({length: 200}, (_, i) => ({id: `asset-${i}`, pageText: excerpt, score: i / 200})) };
  const packed = transport.packProjectState(value);
  expect(Object.values(packed.definitions).filter(x => x === excerpt)).toHaveLength(1);
  expect(transport.bytes(packed)).toBeLessThan(transport.bytes(value) / 10);
  let current = packed;
  for (let i = 0; i < 3; i++) {
    expect(transport.unpackProjectState(current)).toEqual(value);
    current = transport.packProjectState(transport.unpackProjectState(current));
    expect(current).toEqual(packed);
  }
  const key = Object.keys(packed.definitions).find(k => packed.definitions[k] === excerpt);
  packed.definitions[key] += 'corrupt';
  expect(() => transport.unpackProjectState(packed)).toThrow(/checksum/);
});
