const {
  resolveCanonicalGameIdentity,
  resolveCanonicalGameMetadata,
  sanitizeSpokenGameName,
  sanitizeNarrationGameIdentity,
  spokenRepresentation,
} = require('../../src/services/gameIdentity.cjs');

describe('canonical game identity', () => {
  test('prefers authoritative BGG identity over a hash-prefixed filename', () => {
    const identity = resolveCanonicalGameIdentity({
      bgg: { bggId: 167791, name: 'Terraforming Mars' },
      rulebook: { text: 'In Terraformation de Mars, vous incarnez une corporation.' },
      filename: 'fa0678822223-tm-eng-bgg.pdf',
    });
    expect(identity).toMatchObject({
      displayName: 'Terraforming Mars',
      spokenName: 'Terraforming Mars',
      bggId: '167791',
      preserveOriginalTitle: true,
      provenance: { source: 'bgg', authoritative: true, filenameUsed: false },
    });
    expect(identity.spokenName).not.toMatch(/fa067|bgg|project|pdf/i);
  });

  test('keeps 7 Wonders Duel official on screen and supports an English spoken representation', () => {
    const identity = resolveCanonicalGameIdentity({
      bgg: { name: '7 Wonders Duel', bggId: 173346 },
      filename: '173346-7-wonders-duel-rules.pdf',
      locale: 'fr-CA',
    });
    expect(identity).toMatchObject({ displayName: '7 Wonders Duel', officialEditionTitle: '7 Wonders Duel', spokenName: 'Seven Wonders Duel' });
    expect(identity.displayName).not.toMatch(/Sept|Merveilles/i);
  });

  test('honours an operator pronunciation override without changing display identity', () => {
    const identity = resolveCanonicalGameIdentity({
      explicitOverride: { displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel', pronunciationRepresentation: 'Seven Wonders duel', operatorConfirmed: true },
      bgg: { name: 'Wrong result' },
    });
    expect(identity).toMatchObject({ displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel', pronunciationRepresentation: 'Seven Wonders duel', pronunciationStatus: 'operator-override', provenance: { source: 'operator-confirmed' } });
  });

  test('treats a direct identity override as authoritative even without a separate confirmation flag', () => {
    const identity = resolveCanonicalGameIdentity({
      explicitOverride: { displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel' },
      bgg: { name: 'Wrong result', bggId: 999 },
    });
    expect(identity).toMatchObject({ displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel', provenance: { source: 'operator-confirmed' } });
  });

  test('does not confuse the identity contract version with a game edition', () => {
    const identity = resolveCanonicalGameIdentity({
      explicitOverride: { version: 'game-identity-v1', displayName: '7 Wonders Duel', operatorConfirmed: true },
    });
    expect(identity.version).toBe('game-identity-v1');
    expect(identity.versionName).toBeNull();
  });

  test('normalizes metadata with BGG as the fallback and keeps practical fields prominent', () => {
    expect(resolveCanonicalGameMetadata({
      explicit: { playerCount: '2-5' },
      bgg: { minPlayers: 2, maxPlayers: 5, minPlayTime: 120, maxPlayTime: 180, minimumAge: 12, averageWeight: 3.24 },
    })).toMatchObject({ playerCount: '2-5', gameLength: '120-180 min', minimumAge: '12', weight: '3.24' });
  });

  test('sanitizes technical identity strings and converts numeric title tokens generally', () => {
    expect(sanitizeSpokenGameName('fa0678822223-tm-eng-bgg.pdf', 'Terraforming Mars')).toBe('Terraforming Mars');
    expect(spokenRepresentation('7 Wonders Duel')).toBe('Seven Wonders Duel');
    const identity = resolveCanonicalGameIdentity({ bgg: { name: 'Terraforming Mars' } });
    expect(sanitizeNarrationGameIdentity('Bienvenue dans Terraformation de Mars.', identity)).toBe('Bienvenue dans Terraforming Mars.');
    const duel = resolveCanonicalGameIdentity({
      explicitOverride: { displayName: '7 Wonders Duel', spokenName: 'Seven Wonders Duel', pronunciationRepresentation: 'Seven Wonders duel', operatorConfirmed: true },
    });
    expect(sanitizeNarrationGameIdentity('Dans 7 Wonders Duel, bâtissez votre cité.', duel))
      .toBe('Dans Seven Wonders duel, bâtissez votre cité.');
  });
});
