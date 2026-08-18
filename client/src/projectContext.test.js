import { TextEncoder } from 'util';
import { webcrypto } from 'crypto';
import {
  buildDeterministicIngestionPages,
  buildScriptGenerationRequest,
  getIngestionDocumentId,
  getScriptInputReadiness,
  loadLatestProjectContext,
  loadProjectContext,
  PROJECT_CONTEXT_VERSION,
  resolveMatchingIngestionManifest,
  saveProjectContext,
  SCRIPT_PROVENANCE,
  validateMatchingIngestionManifest,
} from './projectContext';

Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

describe('project context persistence', () => {
  beforeEach(() => {
Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    window.localStorage.clear();
  });

  test('preserves a complete approved project context through browser hydration', () => {
    const rulebookText = 'A'.repeat(20916);
    const components = Array.from({ length: 9 }, (_, index) => ({
      id: `component-${index + 1}`,
      name: `Abyss component ${index + 1}`,
    }));
    const context = {
      projectId: 'abyss-approved-project',
      gameName: 'Abyss',
      language: 'english',
      rulebookText,
      rulebookPages: [{ number: 1, text: rulebookText }],
      components,
      metadata: { publisher: 'Bombyx', theme: 'undersea strategy' },
      images: [{ id: 'image-1', path: '/uploads/abyss-card.png' }],
      componentImageLinks: { 'component-1': ['image-1'] },
      script: 'Operator-approved script',
      scriptPackage: {
        contractVersion: '1.0',
        sections: [{ id: 'section-01', order: 1, title: 'Introduction', spokenText: 'Operator-approved script', visualDirections: [], sources: [{ section: 1, startOffset: 0, endOffset: rulebookText.length }] }],
      },
      generatedScript: true,
      activeStepId: 'script',
      completedStepIds: ['project', 'metadata', 'ingestion', 'images'],
    };

    saveProjectContext(window.localStorage, context);
    const hydrated = loadLatestProjectContext(window.localStorage);

    expect(hydrated).toEqual(expect.objectContaining(context));
    expect(hydrated.components).toHaveLength(9);
    expect(buildScriptGenerationRequest(hydrated)).toEqual({
      readiness: { ready: true, message: '' },
      request: {
        projectId: context.projectId,
        gameName: context.gameName,
        language: context.language,
        rulebookText,
        components,
        metadata: context.metadata,
      },
    });
  });

  test.each([
    ['placeholder component', [{ id: 'components', name: 'Components' }]],
    ['sentence-shaped component', [{ id: 'sentence', name: 'This is a whole page of rulebook text with no component boundary.' }]],
  ])('rejects a %s as validated script inventory', (_label, components) => {
    const context = {
      projectId: 'abyss-approved-project',
      gameName: 'Abyss',
      language: 'english',
      rulebookText: 'Approved rulebook text',
      components,
    };

    expect(getScriptInputReadiness(context)).toEqual({
      ready: false,
      message: 'Cannot generate: this project has no validated component inventory. Return to Ingestion Review and confirm at least one named component.',
    });
    expect(buildScriptGenerationRequest(context)).toEqual({
      request: null,
      readiness: getScriptInputReadiness(context),
    });
  });
});


test('rejects unsupported script languages', () => {
  const context = {
    projectId: 'abyss-approved-project',
    gameName: 'Abyss',
    language: 'german',
    rulebookText: 'Approved rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
  };

  expect(getScriptInputReadiness(context)).toEqual({
    ready: false,
    message: 'Cannot generate: this project has an unsupported language. Return to Project Setup and select English or French.',
  });
  expect(buildScriptGenerationRequest(context).request).toBeNull();
});


test('migrates only the known legacy fallback to invalid output and removes script confirmation', () => {
  const fallback = 'Rulebook Text section is empty. I can’t produce a complete, rules-accurate tutorial.';
  saveProjectContext(window.localStorage, {
    version: 1,
    projectId: 'abyss-legacy-fallback',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    script: fallback,
    generatedScript: true,
    activeStepId: 'script',
    completedStepIds: ['project', 'script'],
  });

  const hydrated = loadLatestProjectContext(window.localStorage);

  expect(hydrated).toMatchObject({
    version: PROJECT_CONTEXT_VERSION,
    script: '',
    generatedScript: false,
    scriptProvenance: SCRIPT_PROVENANCE.LEGACY_INVALID_FALLBACK,
  });
  expect(hydrated.completedStepIds).not.toContain('script');
});

test('preserves legacy non-generated operator text as manual and confirmable', () => {
  saveProjectContext(window.localStorage, {
    version: 1,
    projectId: 'abyss-legacy-manual',
    gameName: 'Abyss',
    language: 'english',
    rulebookText: 'Approved rulebook text',
    components: [{ id: 'cards', name: 'Cards' }],
    script: 'Operator-authored manual tutorial.',
    generatedScript: false,
    activeStepId: 'script',
    completedStepIds: ['project', 'script'],
  });

  const hydrated = loadLatestProjectContext(window.localStorage);

  expect(hydrated).toMatchObject({
    script: 'Operator-authored manual tutorial.',
    scriptProvenance: SCRIPT_PROVENANCE.MANUAL,
    generatedScript: false,
  });
  expect(hydrated.completedStepIds).toContain('script');
});


test('persists a canonical script package and preserves source and visual notes while narration is edited', async () => {
  const { applyEditedNarration, scriptPackageToEditableNarration } = await import('./projectContext');
  const scriptPackage = {
    contractVersion: '1.0',
    sections: [{
      id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.',
      visualDirections: [{ instruction: 'Show the board.' }],
      sources: [{ section: 1, startOffset: 0, endOffset: 100 }],
    }],
  };
  const edited = applyEditedNarration(scriptPackage, '## Setup\n\nDeal two cards.');
  expect(scriptPackageToEditableNarration(edited)).toBe('## Setup\n\nDeal two cards.');
  expect(edited.sections[0]).toMatchObject({
    visualDirections: [{ instruction: 'Show the board.' }],
    sources: [{ section: 1, startOffset: 0, endOffset: 100 }],
  });
});


test('downgrades pre-package generated text to an editable manual draft without claiming source-complete provenance', () => {
  saveProjectContext(window.localStorage, {
    version: 2, projectId: 'legacy-generated', gameName: 'Abyss', language: 'english',
    rulebookText: 'Approved rulebook text', components: [{ id: 'cards', name: 'Cards' }],
    script: 'Legacy generated tutorial.', generatedScript: true, activeStepId: 'script', completedStepIds: ['script'],
  });
  expect(loadLatestProjectContext(window.localStorage)).toMatchObject({
    script: 'Legacy generated tutorial.', scriptProvenance: SCRIPT_PROVENANCE.MANUAL, generatedScript: false,
  });
});


test('turns structural narration changes into an unbound manual package instead of misapplying sources', async () => {
  const { applyEditedNarration } = await import('./projectContext');
  const scriptPackage = {
    contractVersion: '1.0',
    sections: [
      { id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.', visualDirections: [{ instruction: 'Show board.' }], sources: [{ section: 1, startOffset: 0, endOffset: 100 }] },
      { id: 'section-02', order: 2, title: 'Turn', spokenText: 'Choose a card.', visualDirections: [{ instruction: 'Show cards.' }], sources: [{ section: 2, startOffset: 101, endOffset: 200 }] },
    ],
  };
  const edited = applyEditedNarration(scriptPackage, '## Turn\n\nChoose a card.\n\n## Setup\n\nPlace the board.');
  expect(edited).toMatchObject({ legacy: true });
  expect(edited.sections).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: 'Turn', visualDirections: [], sources: [] }),
    expect.objectContaining({ title: 'Setup', visualDirections: [], sources: [] }),
  ]));
});


test('treats narration inserted before the first heading as a structural manual edit', async () => {
  const { applyEditedNarration } = await import('./projectContext');
  const scriptPackage = { contractVersion: '1.0', sections: [{
    id: 'section-01', order: 1, title: 'Setup', spokenText: 'Place the board.',
    visualDirections: [{ instruction: 'Show board.' }], sources: [{ section: 1, startOffset: 0, endOffset: 100 }],
  }] };
  const edited = applyEditedNarration(scriptPackage, 'Welcome to the tutorial.\n\n## Setup\n\nPlace the board.');
  expect(edited).toMatchObject({ legacy: true });
  expect(edited.sections.map((section) => section.spokenText)).toContain('Welcome to the tutorial.');
  expect(edited.sections.every((section) => section.sources.length === 0 && section.visualDirections.length === 0)).toBe(true);
});


async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createMatchingIngestionManifest(context) {
  const pages = buildDeterministicIngestionPages(context.rulebookText);
  return {
    version: '1.0.0',
    document: {
      id: getIngestionDocumentId(context),
      title: context.gameName,
      gameId: getIngestionDocumentId(context),
      source: 'client-ui',
    },
    outline: [{ id: 'heading-setup', title: 'Setup', slug: 'setup', page: 1 }],
    components: [{ id: 'comp-setup', sourceHeading: 'heading-setup' }],
    assets: {
      pages: await Promise.all(pages.map(async (page) => ({
        page: page.number,
        hash: await sha256Hex(`${page.number}:${page.blocks.map((block) => block.text.normalize('NFKC').replace(/\s+/g, ' ').trim()).join('\n')}`),
      }))),
      components: [{ id: 'comp-setup', hash: 'validated-component-hash' }],
    },
  };
}

test('keeps a matching deterministic ingestion manifest through reload and script persistence', async () => {
  const context = {
    projectId: 'abyss-handoff', gameName: 'Abyss', language: 'english',
    rulebookText: 'Setup\nPlace the board.', components: [{ id: 'board', name: 'Board' }],
    script: 'Validated tutorial narration.', scriptProvenance: SCRIPT_PROVENANCE.GENERATED_SOURCE_COMPLETE,
    scriptPackage: { contractVersion: '1.0', sections: [{ id: 'section-01', order: 1, title: 'Setup', spokenText: 'Validated tutorial narration.', visualDirections: [{ instruction: 'Show board.' }], sources: [{ section: 1, startOffset: 0, endOffset: 24 }] }] },
    completedStepIds: ['ingestion', 'script'],
  };
  const ingestionManifest = await createMatchingIngestionManifest(context);
  saveProjectContext(window.localStorage, { ...context, ingestionManifest });
  const afterReload = loadLatestProjectContext(window.localStorage);
  saveProjectContext(window.localStorage, { ...afterReload, script: 'Confirmed narration remains source grounded.' });
  const afterScriptConfirmation = loadLatestProjectContext(window.localStorage);

  expect(afterScriptConfirmation.ingestionManifest).toEqual(ingestionManifest);
  await expect(resolveMatchingIngestionManifest({
    manifest: null,
    storage: window.localStorage,
    context: afterScriptConfirmation,
  })).resolves.toMatchObject({ valid: true, code: null, manifest: ingestionManifest });
  await expect(validateMatchingIngestionManifest(afterScriptConfirmation.ingestionManifest, afterScriptConfirmation))
    .resolves.toMatchObject({ valid: true, code: null });
});

test('fails closed for missing, project-mismatched, rulebook-mismatched, and component-only ingestion state', async () => {
  const context = { projectId: 'abyss-handoff', gameName: 'Abyss', rulebookText: 'Setup\nPlace the board.' };
  const matchingManifest = await createMatchingIngestionManifest(context);
  await expect(validateMatchingIngestionManifest(null, context)).resolves.toMatchObject({
    valid: false, code: 'INGESTION_MANIFEST_MISSING',
  });
  await expect(validateMatchingIngestionManifest({ ...matchingManifest, document: { ...matchingManifest.document, id: 'other-game', gameId: 'other-game' } }, context)).resolves.toMatchObject({
    valid: false, code: 'INGESTION_MANIFEST_PROJECT_MISMATCH',
  });
  await expect(validateMatchingIngestionManifest(matchingManifest, { ...context, rulebookText: 'Different rulebook text.' })).resolves.toMatchObject({
    valid: false, code: 'INGESTION_MANIFEST_INVALID',
  });
  await expect(validateMatchingIngestionManifest({ components: matchingManifest.components }, context)).resolves.toMatchObject({
    valid: false, code: 'INGESTION_MANIFEST_INVALID',
  });
});

test('legacy project contexts without a manifest remain safely unconfirmed for ingestion', () => {
  saveProjectContext(window.localStorage, {
    version: 3, projectId: 'abyss-legacy-safe', gameName: 'Abyss', language: 'english',
    rulebookText: 'Setup\nPlace the board.', components: [{ id: 'board', name: 'Board' }],
    script: 'Legacy manual tutorial.', scriptProvenance: SCRIPT_PROVENANCE.MANUAL,
  });
  expect(loadLatestProjectContext(window.localStorage).ingestionManifest).toBeNull();
});


test('recovers only when both live and persisted browser manifests are absent', async () => {
  const context = {
    projectId: 'abyss-legacy-recovery', gameName: 'Abyss', language: 'english',
    rulebookText: 'Setup\nPlace the board.', components: [{ id: 'board', name: 'Board' }],
  };
  const recovered = await createMatchingIngestionManifest(context);
  const recover = jest.fn().mockResolvedValue({ ok: true, manifest: recovered });

  const resolution = await resolveMatchingIngestionManifest({
    manifest: null, storage: window.localStorage, context, recover,
  });

  expect(recover).toHaveBeenCalledWith(context.projectId);
  expect(resolution).toMatchObject({ valid: true, code: null, manifest: recovered });
  saveProjectContext(window.localStorage, { ...context, ingestionManifest: resolution.manifest });
  expect(loadProjectContext(window.localStorage, context.projectId).ingestionManifest).toEqual(recovered);
});

test('does not call recovery when a current persisted manifest is valid', async () => {
  const context = { projectId: 'abyss-current-manifest', gameName: 'Abyss', rulebookText: 'Setup\nPlace the board.' };
  const manifest = await createMatchingIngestionManifest(context);
  saveProjectContext(window.localStorage, { ...context, ingestionManifest: manifest });
  const recover = jest.fn();

  await expect(resolveMatchingIngestionManifest({
    manifest: null, storage: window.localStorage, context, recover,
  })).resolves.toMatchObject({ valid: true, manifest });
  expect(recover).not.toHaveBeenCalled();
});

test.each([
  ['missing durable manifest', 'INGESTION_MANIFEST_MISSING'],
  ['foreign durable project', 'INGESTION_MANIFEST_PROJECT_MISMATCH'],
  ['invalid durable manifest', 'INGESTION_MANIFEST_INVALID'],
])('preserves fail-closed recovery result for %s', async (_label, code) => {
  const context = { projectId: 'abyss-fail-closed', gameName: 'Abyss', rulebookText: 'Setup\nPlace the board.' };
  await expect(resolveMatchingIngestionManifest({
    manifest: null,
    storage: window.localStorage,
    context,
    recover: () => Promise.resolve({ ok: false, code }),
  })).resolves.toMatchObject({ valid: false, code, manifest: null });
});
