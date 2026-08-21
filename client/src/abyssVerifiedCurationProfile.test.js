import { applyVerifiedAbyssCurationProfile } from './abyssVerifiedCurationProfile';
import { reconcileStoryboardVisualPlans, validateStoryboardVisualPlans } from './storyboardVisualPlan';

const components = [
  { id: 'comp-2', name: 'Exploration cards' },
  { id: 'comp-4', name: 'Lords' },
  { id: 'comp-6', name: 'Locations' },
  { id: 'comp-8', name: 'Monster tokens' },
];

function objectiveManifest() {
  return {
    version: '1.2.0',
    scenes: [{
      id: 'scene-section-02-2',
      title: 'Objective',
      spokenText: 'Score influence through your choices.',
      visualDirections: [{
        instruction: 'Show the relevant components.',
        componentRefs: ['Exploration cards', 'Lords', 'Locations', 'Monster tokens'],
      }],
      visualPlan: { requiresExplicitVisual: true },
    }],
  };
}

test('Abyss profile attaches a confirmed project rulebook proof only to its reviewed scene', () => {
  const profiled = applyVerifiedAbyssCurationProfile(objectiveManifest(), 'abyss-mt0qh495-ih5w');
  const assignment = profiled.scenes[0].visualPlan.contextualEvidenceAssignments[0];
  expect(assignment).toMatchObject({
    kind: 'contextual_page',
    role: 'verified_mechanic_rulebook',
    confirmed: true,
    verifiedMechanicEvidence: true,
  });

  const reconciled = reconcileStoryboardVisualPlans(profiled, { images: [], components });
  expect(reconciled.scenes[0].visualPlan.coverageStatus).toBe('resolved');
  expect(validateStoryboardVisualPlans(profiled, { images: [], components }).valid).toBe(true);
});

test('Abyss profile never applies its reviewed evidence to another project', () => {
  const untouched = applyVerifiedAbyssCurationProfile(objectiveManifest(), 'another-project');
  expect(untouched.scenes[0].visualPlan.contextualEvidenceAssignments).toBeUndefined();
  expect(validateStoryboardVisualPlans(untouched, { images: [], components }).valid).toBe(false);
});

test('Abyss profile maps only the reviewed French setup, materials, and exploration sections', () => {
  const manifest = {
    version: '1.2.0',
    scenes: [
      {
        id: 'scene-section-03-1', title: 'Matériel', spokenText: 'Inventaire.',
        visualDirections: [{ instruction: 'Présenter les cartes Exploration et les Seigneurs.', componentRefs: ['Exploration cards', 'Lords'] }],
        visualPlan: { requiresExplicitVisual: true },
      },
      {
        id: 'scene-section-04-1', title: 'Mise en place numérotée', spokenText: 'Installez le jeu.',
        visualDirections: [{ instruction: 'Montrer la mise en place du plateau.', componentRefs: [] }],
        visualPlan: { requiresExplicitVisual: true },
      },
      {
        id: 'scene-section-07-1', title: 'Action 1 : explorer les profondeurs', spokenText: 'Explorez.',
        visualDirections: [{ instruction: 'Révélez des cartes Exploration.', componentRefs: ['Exploration cards'] }],
        visualPlan: { requiresExplicitVisual: true },
      },
      {
        id: 'scene-section-10-1', title: 'Fin de partie et décompte', spokenText: 'Comptez les points.',
        visualDirections: [{ instruction: 'Montrer les Lieux contrôlés.', componentRefs: ['Locations'] }],
        visualPlan: { requiresExplicitVisual: true },
      },
    ],
  };

  const profiled = applyVerifiedAbyssCurationProfile(manifest, 'abyss-mt0qh495-ih5w');
  const byId = Object.fromEntries(profiled.scenes.map((scene) => [scene.id, scene]));
  expect(byId['scene-section-03-1'].visualPlan.contextualEvidenceAssignments[0]).toMatchObject({ role: 'verified_mechanic_rulebook', confirmed: true });
  expect(byId['scene-section-04-1'].visualPlan.contextualEvidenceAssignments[0]).toMatchObject({ kind: 'contextual_crop', role: 'board_setup_context', confirmed: true });
  expect(byId['scene-section-07-1'].visualPlan.contextualEvidenceAssignments[0]).toMatchObject({ role: 'verified_mechanic_rulebook', confirmed: true });
  expect(byId['scene-section-10-1'].visualPlan.contextualEvidenceAssignments).toBeUndefined();
});


test('Abyss profile applies inspected French objective assets only when the exact project inventory is present', () => {
  const manifest = {
    version: '1.2.0',
    scenes: [{
      id: 'scene-section-02-3', title: 'Objectif du jeu', spokenText: 'Marquez des points.',
      visualDirections: [{
        instruction: 'Afficher les cartes Exploration, les Seigneurs, les Lieux et les jetons Monstre.',
        componentRefs: ['Exploration cards', 'Lords', 'Locations', 'Monster tokens'],
      }],
      visualPlan: { requiresExplicitVisual: true },
    }],
  };
  const inventoryIds = [
    'heph_p1_img3_xref338', 'heph_p2_img5_xref729', 'heph_p2_img12_xref745', 'heph_p2_img28_xref775',
  ];
  const images = inventoryIds.map((id) => ({ id, curation: { candidate: true, isDuplicate: false, lowInformation: false } }));
  const profiled = applyVerifiedAbyssCurationProfile(manifest, 'abyss-mt0qh495-ih5w');
  expect(profiled.scenes[0].visualPlan.selectedAssetIds).toEqual(inventoryIds);
  const reconciled = reconcileStoryboardVisualPlans(profiled, { images, components });
  expect(reconciled.scenes[0].visualPlan.coverageStatus).toBe('resolved');
  expect(validateStoryboardVisualPlans(profiled, { images, components }).valid).toBe(true);
});


test('Abyss profile resolves French presentation scenes with the inspected persisted cover', () => {
  const manifest = {
    version: '1.2.0',
    scenes: [{
      id: 'scene-section-01-1', title: 'Présentation', spokenText: 'Bienvenue dans Abyss.',
      visualDirections: [{ instruction: 'Ouvrir sur une vue cinématique du plateau.', componentRefs: [] }],
      visualPlan: { requiresExplicitVisual: true },
    }],
  };
  const images = [{ id: 'manual-1787267082043-h1vohx', curation: { candidate: true, isDuplicate: false, lowInformation: false } }];
  const profiled = applyVerifiedAbyssCurationProfile(manifest, 'abyss-mt0qh495-ih5w');
  expect(profiled.scenes[0].visualPlan).toMatchObject({
    selectedAssetIds: ['manual-1787267082043-h1vohx'],
    selectionMethod: 'brand_asset',
    overviewSelectionConfirmed: true,
  });
  const reconciled = reconcileStoryboardVisualPlans(profiled, { images, components });
  expect(reconciled.scenes[0].visualPlan.coverageStatus).toBe('resolved');
});


test('Abyss profile carries a reuse rationale only for the exact inspected board reference already selected', () => {
  const manifest = {
    version: '1.2.0',
    scenes: [{
      id: 'scene-section-07-99',
      title: 'Résumé du tour',
      spokenText: 'Choisissez votre action.',
      visualDirections: [{ instruction: 'Montrez le plateau.', componentRefs: [] }],
      visualPlan: {
        requiresExplicitVisual: true,
        selectedAssetIds: ['manual-1787268705041-gxku89'],
        selectionMethod: 'operator_selected',
        assetAssignments: [{ assetId: 'manual-1787268705041-gxku89', role: 'primary', componentId: null }],
      },
    }],
  };

  const profiled = applyVerifiedAbyssCurationProfile(manifest, 'abyss-mt0qh495-ih5w');
  expect(profiled.scenes[0].visualPlan.assetAssignments[0]).toMatchObject({
    assetId: 'manual-1787268705041-gxku89',
    reuseExempt: true,
    reuseReason: expect.stringContaining('révisée'),
  });
});
