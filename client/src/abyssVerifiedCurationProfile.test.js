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
