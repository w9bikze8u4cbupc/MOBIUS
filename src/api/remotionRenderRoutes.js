import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { promisify } from 'node:util';
import { generateNarration } from '../services/elevenLabsService.js';
import { sanitizeSpokenText } from '../services/scriptPackage.js';
import { contextualEvidenceService } from '../services/contextualEvidenceService.js';

const execFileAsync = promisify(execFile);
// Keep this compatible with the repository's Jest CommonJS transform.
const moduleDirectory = path.join(process.cwd(), 'src', 'api');
const projectDirectory = path.resolve(moduleDirectory, '..', '..');
const rendererScript = path.join(projectDirectory, 'scripts', 'render-remotion.mjs');
const defaultOutputBaseDirectory = path.join(moduleDirectory, 'uploads', 'remotion');
const defaultBackgroundMusicUploadDirectory = path.join(moduleDirectory, 'uploads');
const defaultBackgroundMusicAsset = path.join(projectDirectory, 'src', 'assets', 'music', 'mobius-underwater-bed.mp3');
const supportedMusicExtensions = new Set(['.m4a', '.mp3', '.ogg', '.wav']);

function createRemotionError(code, message, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.publicMessage = message;
  return error;
}

function createBackgroundMusicUpload(uploadDirectory) {
  if (!existsSync(uploadDirectory)) {
    mkdirSync(uploadDirectory, { recursive: true });
  }

  return multer({
    storage: multer.diskStorage({
      destination: uploadDirectory,
      filename: (request, file, callback) => {
        callback(null, `remotion-music-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (request, file, callback) => {
      if (!supportedMusicExtensions.has(path.extname(file.originalname).toLowerCase())) {
        callback(new Error('REMOTION_BACKGROUND_MUSIC_INVALID'));
        return;
      }
      callback(null, true);
    },
  });
}

function updateProjectMetadata(db, projectId, metadata) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE projects SET metadata = ? WHERE id = ?',
      [JSON.stringify(metadata), projectId],
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

function loadProject(db, projectId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM projects WHERE id = ?', [projectId], (error, project) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(project || null);
    });
  });
}

function parseProjectScenes(project) {
  if (project.scenes === undefined) {
    const error = new Error('REMOTION_SCENES_MISSING');
    error.status = 400;
    throw error;
  }

  let scenes;
  try {
    scenes = typeof project.scenes === 'string' ? JSON.parse(project.scenes) : project.scenes;
  } catch {
    const error = new Error('REMOTION_SCENES_INVALID');
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    const error = new Error('REMOTION_SCENES_INVALID');
    error.status = 400;
    throw error;
  }

  return scenes;
}

function isExternalAssetReference(value) {
  return /^(?:https?:|data:)/i.test(value);
}

function rejectUnsafeAssetReference(value) {
  const error = new Error(`REMOTION_ASSET_INVALID: ${value}`);
  error.status = 400;
  throw error;
}

function resolveProjectAsset(value) {
  if (typeof value !== 'string') {
    return value;
  }
  if (isExternalAssetReference(value) || /^file:/i.test(value)) {
    rejectUnsafeAssetReference(value);
  }

  const uploadRoot = path.join(moduleDirectory, 'uploads');
  const assetRoot = value.startsWith('/uploads/') ? uploadRoot : projectDirectory;
  const assetPath = value.startsWith('/uploads/')
    ? path.resolve(moduleDirectory, `.${value}`)
    : path.resolve(projectDirectory, value);
  const relativePath = path.relative(assetRoot, assetPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    rejectUnsafeAssetReference(value);
  }

  return assetPath;
}

function resolveProjectImageAsset(value) {
  if (typeof value === 'string' && isExternalAssetReference(value)) {
    throw createRemotionError(
      'REMOTION_IMAGE_ASSET_INVALID',
      'Tutorial images must be stored in the project before rendering.',
    );
  }
  return resolveProjectAsset(value);
}

function toPublicRenderPath(renderId, outputPath) {
  return `/uploads/remotion/${encodeURIComponent(renderId)}/${encodeURIComponent(path.basename(outputPath))}`;
}

function parseProjectMetadata(project) {
  try {
    const metadata = typeof project.metadata === 'string'
      ? JSON.parse(project.metadata)
      : project.metadata;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  } catch {
    return {};
  }
}

function getBackgroundMusic(project) {
  const backgroundMusic = parseProjectMetadata(project).renderState?.backgroundMusic;
  if (!backgroundMusic || typeof backgroundMusic !== 'object') {
    return null;
  }

  const file = typeof backgroundMusic.file === 'string' ? backgroundMusic.file.trim() : '';
  if (!file) {
    return null;
  }
  const expectedPrefix = `/uploads/remotion-music/${project.id}/`;
  if (!file.startsWith(expectedPrefix)) {
    throw createRemotionError(
      'REMOTION_BACKGROUND_MUSIC_INVALID',
      'Background music must belong to the project being rendered.',
    );
  }

  return {
    file,
    volume: Number.isFinite(backgroundMusic.volume)
      ? Math.min(1, Math.max(0, backgroundMusic.volume))
      : 0.12,
  };
}

function parseProjectImages(project) {
  try {
    const images = typeof project.images === 'string' ? JSON.parse(project.images) : project.images;
    return Array.isArray(images) ? images.filter((image) => image?.id) : [];
  } catch {
    return [];
  }
}

function getProjectImageRenderReference(image) {
  const reference = typeof image?.fileKey === 'string' && image.fileKey.trim()
    ? image.fileKey
    : typeof image?.localUrl === 'string' && image.localUrl.trim()
      ? image.localUrl
      : null;
  return reference || null;
}

const AUTO_LINK_CONFIDENCE_THRESHOLD = 0.9;

function uniqueComponentRefs(scene) {
  return [...new Set((scene?.visualDirections || []).flatMap((direction) => direction?.componentRefs || [])
    .filter((componentId) => typeof componentId === 'string' && componentId.trim())
    .map((componentId) => componentId.trim()))];
}

function isApprovedComponentLinkDetail(detail, policy) {
  if (!detail || typeof detail !== 'object') return false;
  if (detail.origin === 'manual' || detail.origin === 'legacy') return true;
  return detail.origin === 'auto'
    && policy?.allowAutomaticComponentLinks === true
    && Number(detail.confidence) >= AUTO_LINK_CONFIDENCE_THRESHOLD;
}

function approvedComponentSelectionIsPersisted(scene, visualPlan, projectMetadata) {
  const projectContext = projectMetadata?.projectContext;
  const componentImageLinks = projectContext?.componentImageLinks;
  const componentImageLinkDetails = projectContext?.componentImageLinkDetails;
  const policy = projectContext?.visualPlanPolicy || { allowAutomaticComponentLinks: false };
  const primaryComponentRefs = Array.isArray(visualPlan?.primaryComponentRefs) ? visualPlan.primaryComponentRefs.filter(Boolean) : [];
  const assignments = Array.isArray(visualPlan?.assetAssignments) ? visualPlan.assetAssignments : [];
  const selectedAssetIds = Array.isArray(visualPlan?.selectedAssetIds) ? visualPlan.selectedAssetIds.filter(Boolean) : [];
  if (!primaryComponentRefs.length || !componentImageLinks || !componentImageLinkDetails) return false;
  return selectedAssetIds.every((assetId) => assignments.some((assignment) => assignment?.assetId === assetId
    && assignment.role === 'primary'
    && primaryComponentRefs.includes(assignment.componentId)
    && Array.isArray(componentImageLinks[assignment.componentId])
    && componentImageLinks[assignment.componentId].includes(assetId)
    && isApprovedComponentLinkDetail(componentImageLinkDetails[assignment.componentId]?.[assetId], policy)));
}

const DEFAULT_NON_BRAND_REUSE_THRESHOLD = 2;
const COMPONENT_PRIMARY_INTENTS = new Set(['board_setup', 'component_closeup', 'card_action', 'token_action']);
const RELEASE_PRIMARY_INTENTS = new Set([
  'game_overview', 'assembled_tableau', 'board_setup', 'component_closeup', 'card_action',
  'token_action', 'rulebook_reference', 'brand_outro', 'operator_defined',
]);

function selectedAssetAssignments(visualPlan) {
  const selectedAssetIds = [...new Set((Array.isArray(visualPlan?.selectedAssetIds) ? visualPlan.selectedAssetIds : [])
    .filter((assetId) => typeof assetId === 'string' && assetId.trim()))];
  const selected = new Set(selectedAssetIds);
  const assignments = Array.isArray(visualPlan?.assetAssignments) ? visualPlan.assetAssignments : [];
  if (!selectedAssetIds.length || !assignments.length || assignments.some((assignment) => !selected.has(assignment?.assetId))) return null;
  const byAssetId = new Map();
  assignments.forEach((assignment) => {
    if (!byAssetId.has(assignment.assetId)) byAssetId.set(assignment.assetId, assignment);
  });
  if (selectedAssetIds.some((assetId) => !byAssetId.has(assetId))) return null;
  return selectedAssetIds.map((assetId) => byAssetId.get(assetId));
}

function contextualAssignmentRoleIsAllowedForRelease(intent, assignment) {
  if (intent === 'board_setup') {
    return assignment.kind === 'contextual_crop' && assignment.role === 'board_setup_context' && assignment.confirmed === true;
  }
  if (COMPONENT_PRIMARY_INTENTS.has(intent) && assignment.role === 'verified_mechanic_rulebook') {
    // A full rulebook page can serve as an operator-reviewed explanation of a
    // mechanic when an isolated asset is unavailable. It remains source-bound,
    // explicit and non-generic: it must be a confirmed, dedicated verification.
    return assignment.kind === 'contextual_page'
      && assignment.confirmed === true
      && assignment.verifiedMechanicEvidence === true;
  }
  return ['game_overview', 'assembled_tableau', 'rulebook_reference'].includes(intent)
    && assignment.role === 'rulebook_reference';
}

function contextualPlanClaimIsEligible(visualPlan) {
  const assignments = Array.isArray(visualPlan?.contextualEvidenceAssignments) ? visualPlan.contextualEvidenceAssignments : [];
  if (!assignments.length || visualPlan?.coverageStatus !== 'resolved') return false;
  const validProvenance = assignments.every((assignment) => assignment
    && ['contextual_page', 'contextual_crop'].includes(assignment.kind)
    && typeof assignment.assetId === 'string' && assignment.assetId.trim()
    && typeof assignment.pageId === 'string' && assignment.pageId.trim()
    && /^[a-f0-9]{64}$/.test(assignment.documentSha256 || '')
    && /^[a-f0-9]{64}$/.test(assignment.pageRasterSha256 || '')
    && typeof assignment.renderProfile === 'string' && assignment.renderProfile.trim()
    && (assignment.kind !== 'contextual_page' || assignment.assetId === assignment.pageId)
    && (assignment.kind !== 'contextual_crop' || assignment.assetId === assignment.cropId)
    && contextualAssignmentRoleIsAllowedForRelease(visualPlan.primaryIntent, assignment));
  if (!validProvenance) return false;
  if (visualPlan.primaryIntent === 'board_setup') {
    const primaryRefs = (visualPlan.primaryComponentRefs || []).filter(Boolean);
    return primaryRefs.length === 0 && assignments.some((assignment) => assignment.kind === 'contextual_crop'
      && assignment.role === 'board_setup_context' && assignment.confirmed === true);
  }
  if (COMPONENT_PRIMARY_INTENTS.has(visualPlan.primaryIntent)) {
    return assignments.some((assignment) => assignment.kind === 'contextual_page'
      && assignment.role === 'verified_mechanic_rulebook'
      && assignment.confirmed === true
      && assignment.verifiedMechanicEvidence === true);
  }
  if (!['game_overview', 'assembled_tableau', 'rulebook_reference'].includes(visualPlan.primaryIntent)) return false;
  return assignments.some((assignment) => assignment.role === 'rulebook_reference');
}

async function resolveContextualReleaseAssets(visualPlan, projectId, contextualEvidence) {
  if (!contextualPlanClaimIsEligible(visualPlan)) return null;
  try {
    const resolved = await Promise.all(visualPlan.contextualEvidenceAssignments.map((assignment) => contextualEvidence.resolveAssignment(projectId, assignment)));
    if (resolved.some(({ capabilities }, index) => {
      const assignment = visualPlan.contextualEvidenceAssignments[index];
      const requiredCapability = assignment.role === 'verified_mechanic_rulebook'
        ? 'rulebook_reference'
        : assignment.role;
      return !capabilities.includes(requiredCapability);
    })) return null;
    return resolved.map(({ path: assetPath }) => assetPath);
  } catch {
    return null;
  }
}

function reviewStateIsReleaseReady(visualPlan) {
  return visualPlan?.reviewState === 'resolved'
    || visualPlan?.coverageStatus === 'resolved'
    || visualPlan?.coverageStatus === 'operator_override';
}

function isDocumentedBrandOutroOverride(visualPlan) {
  return visualPlan?.primaryIntent === 'brand_outro'
    && visualPlan?.coverageStatus === 'operator_override'
    && typeof visualPlan?.operatorOverride?.reason === 'string'
    && visualPlan.operatorOverride.reason.trim().length >= 3;
}

function coverageIsReleaseReady(visualPlan) {
  if (!visualPlan || !RELEASE_PRIMARY_INTENTS.has(visualPlan.primaryIntent)
    || (visualPlan.coverageStatus !== 'resolved' && visualPlan.coverageStatus !== 'operator_override')) return false;
  if (visualPlan.coverageStatus === 'operator_override' && typeof visualPlan.operatorOverride?.reason !== 'string') return false;
  if (visualPlan.coverageStatus === 'operator_override' && visualPlan.operatorOverride.reason.trim().length < 3) return false;
  if (isDocumentedBrandOutroOverride(visualPlan)) return true;
  if (contextualPlanClaimIsEligible(visualPlan)) return true;
  const assignments = selectedAssetAssignments(visualPlan);
  if (!assignments) return false;
  const roles = new Set(assignments.map((assignment) => assignment?.role));
  if (visualPlan.coverageStatus === 'operator_override') return assignments.length > 0;
  if (visualPlan.primaryIntent === 'brand_outro') return visualPlan.overviewSelectionConfirmed === true && (roles.has('brand') || roles.has('rulebook_reference'));
  if (visualPlan.primaryIntent === 'rulebook_reference') return visualPlan.overviewSelectionConfirmed === true && roles.has('rulebook_reference');
  if (visualPlan.primaryIntent === 'game_overview' || visualPlan.primaryIntent === 'assembled_tableau') return visualPlan.overviewSelectionConfirmed === true && (roles.has('overview') || roles.has('brand') || roles.has('rulebook_reference'));
  const primaryComponentRefs = [...new Set((Array.isArray(visualPlan.primaryComponentRefs) ? visualPlan.primaryComponentRefs : [])
    .filter((componentId) => typeof componentId === 'string' && componentId.trim()))];
  if (visualPlan.primaryIntent === 'operator_defined') return roles.has('primary');
  if (!COMPONENT_PRIMARY_INTENTS.has(visualPlan.primaryIntent) || !primaryComponentRefs.length) return false;
  return primaryComponentRefs.every((componentId) => assignments.some((assignment) => assignment?.role === 'primary' && assignment.componentId === componentId));
}

function hasReviewedReuseReferenceExemption(assignment, visualPlan) {
  return visualPlan?.selectionMethod === 'operator_selected'
    && visualPlan?.manualSelectionReviewed === true
    && assignment?.reuseExempt === true
    && typeof assignment.reuseReason === 'string'
    && assignment.reuseReason.trim().length >= 12;
}

function releaseReuseExceeded(scenes, projectMetadata = {}) {
  const threshold = Number.isInteger(projectMetadata?.projectContext?.visualPlanPolicy?.maxNonBrandAssetReuse)
    ? projectMetadata.projectContext.visualPlanPolicy.maxNonBrandAssetReuse
    : DEFAULT_NON_BRAND_REUSE_THRESHOLD;
  const nonBrandUsage = new Map();
  (scenes || []).forEach((scene) => {
    const visualPlan = scene?.visualPlan;
    if (visualPlan?.requiresExplicitVisual !== true) return;
    const assignments = selectedAssetAssignments(visualPlan);
    if (!assignments) return;
    assignments.forEach((assignment) => {
      const explicitBrandAsset = assignment.role === 'brand'
        && visualPlan.primaryIntent === 'brand_outro'
        && visualPlan.overviewSelectionConfirmed === true;
      if (explicitBrandAsset || hasReviewedReuseReferenceExemption(assignment, visualPlan)) return;
      const scenesUsingAsset = nonBrandUsage.get(assignment.assetId) || new Set();
      scenesUsingAsset.add(scene.id || 'unknown-scene');
      nonBrandUsage.set(assignment.assetId, scenesUsingAsset);
    });
  });
  return [...nonBrandUsage.values()].some((sceneIds) => sceneIds.size > threshold);
}

function canonicalStoryboardSceneIds(projectMetadata) {
  const manifest = projectMetadata?.renderState?.storyboardManifest;
  if (!manifest || manifest.version !== '1.2.0' || !Array.isArray(manifest.scenes)) return null;
  return new Set(manifest.scenes.map((scene) => scene?.id).filter((sceneId) => typeof sceneId === 'string' && sceneId));
}

export async function bindReleaseVisualPlanAssets(scenes, project, { contextualEvidence = contextualEvidenceService } = {}) {
  const projectMetadata = parseProjectMetadata(project);
  const canonicalSceneIds = canonicalStoryboardSceneIds(projectMetadata);
  // The render persistence row has a database key, while contextual rulebook
  // assets are stored under the operator's canonical project identifier.
  const persistedContextProjectId = projectMetadata?.projectContext?.projectId;
  const contextualProjectId = typeof persistedContextProjectId === 'string'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(persistedContextProjectId)
    ? persistedContextProjectId
    : String(project.id);
  const imagesById = new Map(parseProjectImages(project).map((image) => [image.id, image]));
  return Promise.all((scenes || []).map(async (scene) => {
    const isCanonicalScene = canonicalSceneIds
      ? canonicalSceneIds.has(scene?.id)
      : scene?.storyboardVersion === '1.2.0';
    if (canonicalSceneIds && !isCanonicalScene) {
      throw createRemotionError(
        'VISUAL_PLAN_INCOMPLETE',
        `Release render scene does not match the persisted canonical storyboard: ${scene?.id || 'unknown-scene'}.`,
      );
    }
    if (!isCanonicalScene) return scene;
    const visualPlan = scene.visualPlan;
    const selectedAssetIds = Array.isArray(visualPlan?.selectedAssetIds) ? visualPlan.selectedAssetIds.filter(Boolean) : [];
    const contextualImagePaths = await resolveContextualReleaseAssets(visualPlan, contextualProjectId, contextualEvidence);
    const usesContextualEvidence = Array.isArray(contextualImagePaths) && contextualImagePaths.length > 0;
    const documentedBrandOutro = isDocumentedBrandOutroOverride(visualPlan);
    // A channel-branded outro is intentionally an approved generated visual rather
    // than a per-project image. Its documented override is the required evidence.
    const overviewValid = documentedBrandOutro || visualPlan?.overviewExceptionAllowed !== true
      || ((visualPlan.selectionMethod === 'brand_asset' || visualPlan.selectionMethod === 'rulebook_reference')
        && visualPlan.overviewSelectionConfirmed === true);
    const selectedImageUrls = selectedAssetIds.map((assetId) => getProjectImageRenderReference(imagesById.get(assetId)));
    if (!visualPlan || visualPlan.requiresExplicitVisual !== true
      || !reviewStateIsReleaseReady(visualPlan)
      || !coverageIsReleaseReady(visualPlan)
      || (!usesContextualEvidence && !documentedBrandOutro && selectedAssetIds.length === 0)
      || !overviewValid
      || (!usesContextualEvidence && !documentedBrandOutro && visualPlan.selectionMethod === 'approved_component_link'
        && !approvedComponentSelectionIsPersisted(scene, visualPlan, projectMetadata))
      || (!usesContextualEvidence && selectedImageUrls.some((url) => !url))) {
      throw createRemotionError(
        'VISUAL_PLAN_INCOMPLETE',
        `Release render requires resolved project-owned visual plans for: ${scene.id || 'unknown-scene'}.`,
      );
    }
    const imageUrls = usesContextualEvidence ? contextualImagePaths : selectedImageUrls;
    return { ...scene, storyboardVersion: '1.2.0', imageUrls, imageUrl: imageUrls[0] };
  }));
}

export function validateReleaseVisualPlans(scenes, projectMetadata = {}) {
  const incompleteSceneIds = (scenes || []).filter((scene) => {
    const visualPlan = scene?.visualPlan;
    const isCanonicalScene = scene?.storyboardVersion === '1.2.0';
    if (isCanonicalScene && (!visualPlan || visualPlan.requiresExplicitVisual !== true)) return true;
    if (!visualPlan || visualPlan.requiresExplicitVisual !== true) return false;
    const selectedAssetIds = Array.isArray(visualPlan.selectedAssetIds) ? visualPlan.selectedAssetIds.filter(Boolean) : [];
    const imageUrls = Array.isArray(scene.imageUrls) ? scene.imageUrls.filter(Boolean) : [];
    const documentedBrandOutro = isDocumentedBrandOutroOverride(visualPlan);
    const overviewValid = documentedBrandOutro || visualPlan.overviewExceptionAllowed !== true
      || ((visualPlan.selectionMethod === 'brand_asset' || visualPlan.selectionMethod === 'rulebook_reference')
        && visualPlan.overviewSelectionConfirmed === true);
    const usesContextualEvidence = contextualPlanClaimIsEligible(visualPlan);
    return !reviewStateIsReleaseReady(visualPlan)
      || !coverageIsReleaseReady(visualPlan)
      || (!usesContextualEvidence && !documentedBrandOutro && selectedAssetIds.length === 0)
      || (!documentedBrandOutro && imageUrls.length === 0)
      || !overviewValid
      || imageUrls.some((url) => String(url).includes('placeholder'));
  }).map((scene) => scene.id || 'unknown-scene');
  const reuseExceeded = releaseReuseExceeded(scenes, projectMetadata);
  if (incompleteSceneIds.length || reuseExceeded) {
    const reason = incompleteSceneIds.length
      ? `for: ${incompleteSceneIds.join(', ')}`
      : 'because a non-brand visual asset exceeds the configured reuse threshold.';
    throw createRemotionError(
      'VISUAL_PLAN_INCOMPLETE',
      `Release render requires resolved project-owned visual plans ${reason}`,
    );
  }
}

function prepareScenesForRenderer(scenes, backgroundMusic) {
  const resolvedBackgroundMusicFile = backgroundMusic
    ? resolveProjectAsset(backgroundMusic.file)
    : null;
  let backgroundMusicStartFrom = 0;

  return scenes.map((scene) => {
    const imageUrls = Array.isArray(scene.imageUrls)
      ? scene.imageUrls.map((imageUrl) => resolveProjectImageAsset(imageUrl))
      : scene.imageUrls;
    const legacyImageUrl = Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls[0]
      : resolveProjectImageAsset(scene.imageUrl);
    const preparedScene = {
      ...scene,
      narrationText: sanitizeSpokenText(scene.narrationText),
      ...(imageUrls !== undefined ? { imageUrls } : {}),
      imageUrl: legacyImageUrl,
      ...(scene.audioFile ? { audioFile: resolveProjectAsset(scene.audioFile) } : {}),
      ...(resolvedBackgroundMusicFile
        ? {
            backgroundMusicFile: resolvedBackgroundMusicFile,
            backgroundMusicVolume: backgroundMusic.volume,
            backgroundMusicStartFrom,
          }
        : {}),
    };
    backgroundMusicStartFrom += Number.isInteger(scene.durationInFrames) ? scene.durationInFrames : 0;
    return preparedScene;
  });
}

function normalizeVoiceId(voiceId) {
  return typeof voiceId === 'string' && voiceId.trim() !== '' ? voiceId.trim() : null;
}

async function attachGeneratedNarration(scenes, voiceId, configurationDirectory, narrationGenerator) {
  if (!voiceId) {
    return scenes;
  }

  const narratedScenes = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const audioFile = path.join(configurationDirectory, `scene-${index + 1}.mp3`);
    const narrationText = sanitizeSpokenText(scene.narrationText);
    await narrationGenerator(narrationText, voiceId, audioFile);
    narratedScenes.push({ ...scene, narrationText, audioFile });
  }
  return narratedScenes;
}

export async function runRemotionRender({
  scenes,
  outputDirectory,
  voiceId,
  generateNarration: generateSceneNarration = generateNarration,
}) {
  const normalizedVoiceId = normalizeVoiceId(voiceId);
  if (normalizedVoiceId && !process.env.ELEVENLABS_API_KEY?.trim()) {
    throw createRemotionError(
      'REMOTION_NARRATION_UNAVAILABLE',
      'Narration is unavailable because ElevenLabs is not configured.',
    );
  }

  const configurationDirectory = await fs.mkdtemp(path.join(tmpdir(), 'mobius-remotion-config-'));
  const configurationPath = path.join(configurationDirectory, 'scenes.json');

  try {
    const scenesWithNarration = await attachGeneratedNarration(
      scenes,
      normalizeVoiceId(voiceId),
      configurationDirectory,
      generateSceneNarration,
    );
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(configurationPath, JSON.stringify(scenesWithNarration, null, 2), 'utf8');
    const shouldConcatenate = scenesWithNarration.length > 1
      && scenesWithNarration.some((scene) => Boolean(scene.audioFile || scene.backgroundMusicFile));
    const rendererArgs = [rendererScript, configurationPath, '--out-dir', outputDirectory];
    if (shouldConcatenate) {
      rendererArgs.push('--concat');
    }
    await execFileAsync(
      process.execPath,
      rendererArgs,
      {
        cwd: projectDirectory,
        maxBuffer: 1024 * 1024,
      },
    );

    const renderedEntries = await fs.readdir(outputDirectory, { withFileTypes: true });
    const outputPaths = renderedEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mp4'))
      .map((entry) => path.join(outputDirectory, entry.name))
      .sort();

    if (outputPaths.length === 0) {
      throw new Error('REMOTION_OUTPUT_MISSING');
    }

    return { outputPaths };
  } finally {
    await fs.rm(configurationDirectory, { recursive: true, force: true });
  }
}

export function registerRemotionRenderRoutes(
  app,
  {
    db,
    runRemotionRender: executeRemotionRender = runRemotionRender,
    generateNarration: generateSceneNarration = generateNarration,
    isNarrationAvailable = () => Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    backgroundMusicUploadDirectory = defaultBackgroundMusicUploadDirectory,
    defaultBackgroundMusicFile = defaultBackgroundMusicAsset,
    outputBaseDirectory = defaultOutputBaseDirectory,
    contextualEvidence = contextualEvidenceService,
  } = {},
) {
  if (!db) {
    throw new Error('registerRemotionRenderRoutes requires a db dependency.');
  }
  const musicUpload = createBackgroundMusicUpload(backgroundMusicUploadDirectory);

  app.post('/api/render-remotion/default-background-music', async (req, res) => {
    const requestedProjectId = req.query?.projectId;
    if ((typeof requestedProjectId !== 'string' && typeof requestedProjectId !== 'number')
      || String(requestedProjectId).trim() === '') {
      return res.status(400).json({
        ok: false,
        code: 'REMOTION_PROJECT_ID_REQUIRED',
        error: 'A projectId is required to use the default background music.',
      });
    }

    try {
      const project = await loadProject(db, requestedProjectId);
      if (!project) {
        return res.status(404).json({
          ok: false,
          code: 'REMOTION_PROJECT_NOT_FOUND',
          error: 'Project not found.',
        });
      }
      if (!existsSync(defaultBackgroundMusicFile)) {
        throw createRemotionError(
          'REMOTION_DEFAULT_BACKGROUND_MUSIC_MISSING',
          'The bundled background music is unavailable.',
          500,
        );
      }

      const projectMusicDirectory = path.join(
        backgroundMusicUploadDirectory,
        'remotion-music',
        String(project.id),
      );
      await fs.mkdir(projectMusicDirectory, { recursive: true });
      const storedFileName = 'mobius-default-underwater-bed.mp3';
      const storedFilePath = path.join(projectMusicDirectory, storedFileName);
      await fs.copyFile(defaultBackgroundMusicFile, storedFilePath);
      const requestedVolume = Number(req.body?.volume);
      const backgroundMusic = {
        file: `/uploads/remotion-music/${project.id}/${storedFileName}`,
        volume: Number.isFinite(requestedVolume) ? Math.min(0.4, Math.max(0, requestedVolume)) : 0.12,
      };
      const metadata = parseProjectMetadata(project);
      metadata.renderState = {
        ...(metadata.renderState || {}),
        backgroundMusic,
      };
      await updateProjectMetadata(db, project.id, metadata);

      return res.status(201).json({
        ok: true,
        backgroundMusicPath: backgroundMusic.file,
        source: 'bundled-default',
      });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Unable to prepare default background music', error);
      }
      return res.status(status).json({
        ok: false,
        code: error.code || 'REMOTION_DEFAULT_BACKGROUND_MUSIC_FAILED',
        error: error.publicMessage || 'Unable to prepare the default background music.',
      });
    }
  });

  app.post('/api/render-remotion/background-music', async (req, res) => {
    const requestedProjectId = req.query?.projectId;
    if ((typeof requestedProjectId !== 'string' && typeof requestedProjectId !== 'number')
      || String(requestedProjectId).trim() === '') {
      return res.status(400).json({
        ok: false,
        code: 'REMOTION_PROJECT_ID_REQUIRED',
        error: 'A projectId is required to upload background music.',
      });
    }

    try {
      const project = await loadProject(db, requestedProjectId);
      if (!project) {
        return res.status(404).json({
          ok: false,
          code: 'REMOTION_PROJECT_NOT_FOUND',
          error: 'Project not found.',
        });
      }

      return musicUpload.single('backgroundMusic')(req, res, async (error) => {
        if (error) {
          return res.status(400).json({
            ok: false,
            code: 'REMOTION_BACKGROUND_MUSIC_INVALID',
            error: 'Upload an MP3, M4A, OGG, or WAV background-music file up to 25 MB.',
          });
        }
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            code: 'REMOTION_BACKGROUND_MUSIC_REQUIRED',
            error: 'A background-music file is required.',
          });
        }

        try {
          const projectMusicDirectory = path.join(
            backgroundMusicUploadDirectory,
            'remotion-music',
            String(project.id),
          );
          await fs.mkdir(projectMusicDirectory, { recursive: true });
          const storedFilePath = path.join(projectMusicDirectory, req.file.filename);
          await fs.rename(req.file.path, storedFilePath);
          const volume = Number(req.body?.volume);
          const backgroundMusic = {
            file: `/uploads/remotion-music/${project.id}/${req.file.filename}`,
            volume: Number.isFinite(volume) ? Math.min(0.4, Math.max(0, volume)) : 0.12,
          };
          const metadata = parseProjectMetadata(project);
          metadata.renderState = {
            ...(metadata.renderState || {}),
            backgroundMusic,
          };
          await updateProjectMetadata(db, project.id, metadata);

          return res.status(201).json({
            ok: true,
            backgroundMusicPath: backgroundMusic.file,
          });
        } catch (uploadError) {
          console.error('Unable to persist background music', uploadError);
          return res.status(500).json({
            ok: false,
            code: 'REMOTION_BACKGROUND_MUSIC_UPLOAD_FAILED',
            error: 'Unable to save background music.',
          });
        }
      });
    } catch (error) {
      console.error('Unable to prepare background music upload', error);
      return res.status(500).json({
        ok: false,
        code: 'REMOTION_BACKGROUND_MUSIC_UPLOAD_FAILED',
        error: 'Unable to save background music.',
      });
    }
  });

  app.post('/api/render-remotion', async (req, res) => {
    const { projectId, voiceId } = req.body || {};
    if ((typeof projectId !== 'string' && typeof projectId !== 'number') || String(projectId).trim() === '') {
      return res.status(400).json({
        ok: false,
        code: 'REMOTION_PROJECT_ID_REQUIRED',
        error: 'A projectId is required.',
      });
    }

    try {
      const project = await loadProject(db, projectId);
      if (!project) {
        return res.status(404).json({
          ok: false,
          code: 'REMOTION_PROJECT_NOT_FOUND',
          error: 'Project not found.',
        });
      }
      const normalizedVoiceId = normalizeVoiceId(voiceId);
      if (normalizedVoiceId && !isNarrationAvailable()) {
        throw createRemotionError(
          'REMOTION_NARRATION_UNAVAILABLE',
          'Narration is unavailable because ElevenLabs is not configured.',
        );
      }

      const persistedScenes = parseProjectScenes(project);
      const releaseScenes = await bindReleaseVisualPlanAssets(persistedScenes, project, { contextualEvidence });
      validateReleaseVisualPlans(releaseScenes, parseProjectMetadata(project));
      const scenes = prepareScenesForRenderer(
        releaseScenes,
        getBackgroundMusic(project),
      );
      const renderId = `remotion-${randomUUID()}`;
      const outputDirectory = path.join(outputBaseDirectory, renderId);
      const result = await executeRemotionRender({
        scenes,
        outputDirectory,
        voiceId: normalizedVoiceId,
        generateNarration: generateSceneNarration,
      });
      const outputPaths = result?.outputPaths || [];

      if (outputPaths.length === 0) {
        throw new Error('REMOTION_OUTPUT_MISSING');
      }

      const publicOutputPaths = outputPaths.map((outputPath) => toPublicRenderPath(renderId, outputPath));
      return res.json({
        ok: true,
        projectId: String(project.id),
        outputPath: publicOutputPaths[0],
        outputPaths: publicOutputPaths,
      });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Remotion render failed', error);
      }
      return res.status(status).json({
        ok: false,
        code: error.code || (error.message === 'REMOTION_SCENES_MISSING' || error.message === 'REMOTION_SCENES_INVALID'
          ? error.message
          : 'REMOTION_RENDER_FAILED'),
        error: error.publicMessage || (status === 400
          ? 'The project does not contain a valid Remotion scenes array.'
          : 'Unable to render the project with Remotion.'),
      });
    }
  });
}
