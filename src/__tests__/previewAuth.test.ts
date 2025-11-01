// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getPreviewTokens, validatePreviewToken } = require('../api/previewAuth.js');

describe('previewAuth token rotation', () => {
  it('issues valid preview tokens', () => {
    const tokens = getPreviewTokens();
    expect(tokens.length).toBeGreaterThan(0);
    const first = tokens[0];
    expect(validatePreviewToken(first.token)).toBe(true);
  });
});
