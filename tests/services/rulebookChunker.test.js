import { buildRulebookChunks, MAX_RULEBOOK_CHUNK_CHARS } from '../../src/services/rulebookChunker.js';

test('splits a 20,914-character rulebook deterministically with complete bounded coverage', () => {
  const source = 'A'.repeat(20914);
  expect(source).toHaveLength(20914);

  const first = buildRulebookChunks(source);
  const second = buildRulebookChunks(source);

  expect(first).toEqual(second);
  expect(first.chunks).toHaveLength(4);
  expect(first.chunks.every((chunk) => chunk.text.length <= MAX_RULEBOOK_CHUNK_CHARS)).toBe(true);
  expect(first.chunks.map((chunk) => chunk.text).join('')).toBe(source);
  expect(first.coverage).toMatchObject({
    sourceChars: 20914,
    assignedNonWhitespaceChars: first.coverage.sourceNonWhitespaceChars,
    coverageRatio: 1,
    complete: true,
  });
});
