import {
  buildScriptGenerationRequest,
  getScriptInputReadiness,
  loadLatestProjectContext,
  saveProjectContext,
} from './projectContext';

describe('project context persistence', () => {
  beforeEach(() => {
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
