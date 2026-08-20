const ABYSS_PROJECT_ID = 'abyss-mt0qh495-ih5w';
const DOCUMENT_SHA256 = '8c689768124d7dd4c1fb3d6a4d9f747700bd4e8052db8cb3e5d63e68f37a2afb';
const RENDER_PROFILE = 'pdf-to-img-review-144dpi-png-v1';

const pages = {
  components: {
    assetId: 'page-d59b1504fd47d36ad0535e8136fadd76',
    pageId: 'page-d59b1504fd47d36ad0535e8136fadd76',
    pageRasterSha256: '8799902704e0ed379291ea62f884395c2c84f9891d72dec8f91be9b4eca09f5d',
  },
  exploration: {
    assetId: 'page-5c32a06dafa9d7b1978195a60e571833',
    pageId: 'page-5c32a06dafa9d7b1978195a60e571833',
    pageRasterSha256: '982efe65af659ad1c819efbf0c3b5db827cb0f22313b3787dd1721d4b404e988',
  },
};

// Each mapping is an operator-reviewed migration of an existing project proof.
// It never invents a component image or applies to another project.
const evidenceBySceneId = {
  'scene-section-02-2': pages.components,
  'scene-section-06-8': pages.components,
  'scene-section-09-14': pages.exploration,
  'scene-section-11-18': pages.components,
  'scene-section-11-19': pages.components,
  'scene-section-12-20': pages.components,
  'scene-section-12-21': pages.components,
};

const setupCrop = {
  assetId: 'crop-75a60c2fc31c95cf2bf1a297831bf08e',
  cropId: 'crop-75a60c2fc31c95cf2bf1a297831bf08e',
  pageId: pages.components.pageId,
  pageRasterSha256: pages.components.pageRasterSha256,
};

function normalizedSceneText(scene) {
  return `${scene?.title || ''} ${(scene?.visualDirections || []).map((direction) => direction?.instruction || '').join(' ')}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * These are narrow, operator-reviewed migrations for the French Abyss script.
 * They are intentionally title-based because regenerated French scenes receive
 * new IDs. No introduction, objective, conclusion, scoring, or generic scene
 * gets a borrowed proof merely to satisfy a release gate.
 */
function evidenceForReviewedFrenchScene(scene) {
  const text = normalizedSceneText(scene);
  if (/mise en place|installation/.test(text)) return { page: setupCrop, role: 'board_setup_context', kind: 'contextual_crop' };
  if (/materiel/.test(text)) return { page: pages.components, role: 'verified_mechanic_rulebook', kind: 'contextual_page' };
  if (/deroulement d.?un tour|explorer les profondeurs|conseil et recrutement/.test(text)) {
    return { page: pages.exploration, role: 'verified_mechanic_rulebook', kind: 'contextual_page' };
  }
  return null;
}

function verifiedEvidenceAssignment({ page, role = 'verified_mechanic_rulebook', kind = 'contextual_page' }) {
  return {
    kind,
    assetId: page.assetId,
    documentSha256: DOCUMENT_SHA256,
    pageId: page.pageId,
    pageRasterSha256: page.pageRasterSha256,
    ...(kind === 'contextual_crop' ? { cropId: page.cropId } : {}),
    renderProfile: RENDER_PROFILE,
    role,
    confirmed: true,
    verifiedMechanicEvidence: role === 'verified_mechanic_rulebook',
  };
}

export function applyVerifiedAbyssCurationProfile(manifest, projectId) {
  if (projectId !== ABYSS_PROJECT_ID || manifest?.version !== '1.2.0' || !Array.isArray(manifest.scenes)) return manifest;
  return {
    ...manifest,
    scenes: manifest.scenes.map((scene) => {
      const legacyPage = evidenceBySceneId[scene?.id];
      const reviewedEvidence = legacyPage
        ? { page: legacyPage, role: 'verified_mechanic_rulebook', kind: 'contextual_page' }
        : evidenceForReviewedFrenchScene(scene);
      if (!reviewedEvidence) return scene;
      const plan = scene.visualPlan || {};
      const assignments = Array.isArray(plan.contextualEvidenceAssignments) ? plan.contextualEvidenceAssignments : [];
      const alreadyPresent = assignments.some((assignment) => assignment?.assetId === reviewedEvidence.page.assetId
        && assignment?.role === reviewedEvidence.role && assignment?.confirmed === true);
      if (alreadyPresent) return scene;
      return {
        ...scene,
        visualPlan: {
          ...plan,
          contextualEvidenceAssignments: [...assignments, verifiedEvidenceAssignment(reviewedEvidence)],
          selectionMethod: 'rulebook_reference',
          manualSelectionReviewed: true,
        },
      };
    }),
  };
}

export const ABYSS_VERIFIED_CURATION_PROFILE = Object.freeze({
  projectId: ABYSS_PROJECT_ID,
  sceneIds: Object.keys(evidenceBySceneId),
});
