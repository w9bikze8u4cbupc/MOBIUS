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

function verifiedMechanicAssignment(page) {
  return {
    kind: 'contextual_page',
    assetId: page.assetId,
    documentSha256: DOCUMENT_SHA256,
    pageId: page.pageId,
    pageRasterSha256: page.pageRasterSha256,
    renderProfile: RENDER_PROFILE,
    role: 'verified_mechanic_rulebook',
    confirmed: true,
    verifiedMechanicEvidence: true,
  };
}

export function applyVerifiedAbyssCurationProfile(manifest, projectId) {
  if (projectId !== ABYSS_PROJECT_ID || manifest?.version !== '1.2.0' || !Array.isArray(manifest.scenes)) return manifest;
  return {
    ...manifest,
    scenes: manifest.scenes.map((scene) => {
      const page = evidenceBySceneId[scene?.id];
      if (!page) return scene;
      const plan = scene.visualPlan || {};
      const assignments = Array.isArray(plan.contextualEvidenceAssignments) ? plan.contextualEvidenceAssignments : [];
      const alreadyPresent = assignments.some((assignment) => assignment?.assetId === page.assetId && assignment?.verifiedMechanicEvidence === true);
      if (alreadyPresent) return scene;
      return {
        ...scene,
        visualPlan: {
          ...plan,
          contextualEvidenceAssignments: [...assignments, verifiedMechanicAssignment(page)],
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
