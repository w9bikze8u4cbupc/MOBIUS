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

// These assets were inspected in the operator UI for this exact persisted Abyss project.
// They are never inferred by filename or used for another project.
const reviewedAssets = {
  cover: 'manual-1787267082043-h1vohx',
  fullSetup: 'manual-1787268683125-4r63ee',
  boardOverview: 'manual-1787268705041-gxku89',
  exploration: 'heph_p1_img3_xref338',
  lords: 'heph_p2_img5_xref729',
  locations: 'heph_p2_img12_xref745',
  monsters: 'heph_p2_img28_xref775',
};

const objectiveAssetAssignments = [
  { assetId: reviewedAssets.exploration, componentId: 'comp-2' },
  { assetId: reviewedAssets.lords, componentId: 'comp-4' },
  { assetId: reviewedAssets.locations, componentId: 'comp-6' },
  { assetId: reviewedAssets.monsters, componentId: 'comp-8' },
];

function reviewedAssetSelection(assignments, { selectionMethod = 'operator_selected', overviewSelectionConfirmed = false } = {}) {
  return {
    selectedAssetIds: assignments.map((assignment) => assignment.assetId),
    assetAssignments: assignments.map((assignment) => ({
      assetId: assignment.assetId,
      componentId: assignment.componentId || null,
      role: assignment.role || 'primary',
      ...(assignment.reuseExempt === true && typeof assignment.reuseReason === 'string'
        ? { reuseExempt: true, reuseReason: assignment.reuseReason }
        : {}),
    })),
    selectionMethod,
    manualSelectionReviewed: true,
    ...(overviewSelectionConfirmed ? { overviewSelectionConfirmed: true } : {}),
  };
}

function reviewedAssetsForFrenchScene(scene) {
  const text = normalizedSceneText(scene);
  if (/presentation/.test(text)) {
    return reviewedAssetSelection([{ assetId: reviewedAssets.cover, role: 'brand' }], {
      selectionMethod: 'brand_asset', overviewSelectionConfirmed: true,
    });
  }
  if (/objectif du jeu/.test(text)) return reviewedAssetSelection(objectiveAssetAssignments);
  if (/mise en place|installation|pause avant de jouer/.test(text)) {
    return reviewedAssetSelection([{ assetId: reviewedAssets.fullSetup, role: 'primary' }]);
  }
  if (/deroulement d.?un tour|explorer les profondeurs|conseil et recrutement/.test(text)) {
    return reviewedAssetSelection([{
      assetId: reviewedAssets.boardOverview,
      role: 'primary',
      reuseExempt: true,
      reuseReason: 'Vue de plateau Abyss révisée : zones Exploration, Conseil, Cour, Menace et Lieu visibles.',
    }]);
  }
  if (/controler un lieu/.test(text)) {
    return reviewedAssetSelection([{
      assetId: reviewedAssets.boardOverview,
      componentId: 'comp-6',
      reuseExempt: true,
      reuseReason: 'Vue de plateau Abyss révisée : Lieu et jetons Clé visibles pour cette mécanique.',
    }]);
  }
  if (/fin de partie et decompte/.test(text)) return reviewedAssetSelection(objectiveAssetAssignments);
  if (/conclusion/.test(text)) {
    return reviewedAssetSelection([{ assetId: reviewedAssets.cover, role: 'brand' }], {
      selectionMethod: 'brand_asset', overviewSelectionConfirmed: true,
    });
  }
  return null;
}

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
      const reviewedAssetSelectionForScene = reviewedAssetsForFrenchScene(scene);
      const plan = scene.visualPlan || {};
      const existingAssetAssignments = Array.isArray(plan.assetAssignments) ? plan.assetAssignments : [];
      // Regeneration preserves some previously reviewed French scenes whose title
      // no longer carries a stable intent phrase. If—and only if—they already use
      // the exact inspected Abyss board reference, carry its documented reuse
      // rationale forward instead of treating it as an unreviewed generic asset.
      const usesReviewedBoardReference = existingAssetAssignments.some((assignment) => assignment?.assetId === reviewedAssets.boardOverview);
      const carriedBoardReferenceAssignments = usesReviewedBoardReference
        ? existingAssetAssignments.map((assignment) => assignment?.assetId === reviewedAssets.boardOverview
          ? {
            ...assignment,
            reuseExempt: true,
            reuseReason: 'Vue de plateau Abyss révisée : référence transversale des zones de mécanique visibles.',
          }
          : assignment)
        : existingAssetAssignments;
      if (!reviewedEvidence && !reviewedAssetSelectionForScene && !usesReviewedBoardReference) return scene;
      const assignments = Array.isArray(plan.contextualEvidenceAssignments) ? plan.contextualEvidenceAssignments : [];
      const alreadyPresent = assignments.some((assignment) => assignment?.assetId === reviewedEvidence?.page?.assetId
        && assignment?.role === reviewedEvidence?.role && assignment?.confirmed === true);
      const contextualEvidenceAssignments = !reviewedEvidence || alreadyPresent
        ? assignments
        : [...assignments, verifiedEvidenceAssignment(reviewedEvidence)];
      if ((!reviewedEvidence || alreadyPresent) && !reviewedAssets) return scene;
      return {
        ...scene,
        visualPlan: {
          ...plan,
          ...reviewedAssetSelectionForScene,
          ...(!reviewedAssetSelectionForScene && usesReviewedBoardReference ? {
            selectedAssetIds: [...new Set(carriedBoardReferenceAssignments.map((assignment) => assignment?.assetId).filter(Boolean))],
            assetAssignments: carriedBoardReferenceAssignments,
            selectionMethod: 'operator_selected',
          } : {}),
          ...(reviewedEvidence || assignments.length ? { contextualEvidenceAssignments } : {}),
          ...(reviewedEvidence ? { selectionMethod: reviewedAssetSelectionForScene?.selectionMethod || 'rulebook_reference' } : {}),
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
