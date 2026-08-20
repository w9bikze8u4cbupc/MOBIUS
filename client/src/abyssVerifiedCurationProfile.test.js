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
