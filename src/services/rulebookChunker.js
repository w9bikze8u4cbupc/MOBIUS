export const MAX_RULEBOOK_CHUNK_CHARS = 6000;
const MIN_PREFERRED_CHUNK_CHARS = 2400;

function findBoundary(text, start, hardEnd) {
  const minimumBoundary = start + Math.floor((hardEnd - start) * 0.5);
  const window = text.slice(start, hardEnd);
  const candidates = [];

  for (const match of window.matchAll(/\n\s*\n/g)) {
    candidates.push(start + match.index + match[0].length);
  }
  for (const match of window.matchAll(/[.!?]["'\)\]]?\s+/g)) {
    candidates.push(start + match.index + match[0].length);
  }
  for (const match of window.matchAll(/\n/g)) {
    candidates.push(start + match.index + 1);
  }
  for (const match of window.matchAll(/\s+/g)) {
    candidates.push(start + match.index + match[0].length);
  }

  return candidates
    .filter((offset) => offset >= minimumBoundary && offset < hardEnd)
    .pop() || hardEnd;
}

function countNonWhitespace(text) {
  return (text.match(/\S/g) || []).length;
}

export function buildRulebookChunks(sourceText, { maxChunkChars = MAX_RULEBOOK_CHUNK_CHARS } = {}) {
  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 256) {
    throw new Error('maxChunkChars must be an integer of at least 256 characters.');
  }

  const source = typeof sourceText === 'string' ? sourceText : '';
  const chunks = [];
  let startOffset = 0;

  while (startOffset < source.length) {
    const hardEnd = Math.min(startOffset + maxChunkChars, source.length);
    const endOffset = hardEnd === source.length
      ? source.length
      : findBoundary(source, startOffset, hardEnd);

    chunks.push({
      index: chunks.length + 1,
      startOffset,
      endOffset,
      text: source.slice(startOffset, endOffset),
    });
    startOffset = endOffset;
  }

  // A tiny final chunk is merged only when doing so remains within the strict bound.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    const previous = chunks[chunks.length - 2];
    if (last.text.length < MIN_PREFERRED_CHUNK_CHARS && previous.text.length + last.text.length <= maxChunkChars) {
      previous.endOffset = last.endOffset;
      previous.text += last.text;
      chunks.pop();
    }
  }

  const sourceNonWhitespaceChars = countNonWhitespace(source);
  const assignedNonWhitespaceChars = chunks.reduce((total, chunk) => total + countNonWhitespace(chunk.text), 0);
  const contiguousOffsets = chunks.every((chunk, index) => (
    chunk.startOffset === (index === 0 ? 0 : chunks[index - 1].endOffset)
      && chunk.endOffset >= chunk.startOffset
      && chunk.endOffset - chunk.startOffset === chunk.text.length
  ));
  const coverage = {
    sourceChars: source.length,
    sourceNonWhitespaceChars,
    assignedNonWhitespaceChars,
    coverageRatio: sourceNonWhitespaceChars === 0 ? 1 : assignedNonWhitespaceChars / sourceNonWhitespaceChars,
    complete: contiguousOffsets && (chunks.at(-1)?.endOffset || 0) === source.length
      && assignedNonWhitespaceChars === sourceNonWhitespaceChars,
  };

  return { chunks, coverage, maxChunkChars };
}
