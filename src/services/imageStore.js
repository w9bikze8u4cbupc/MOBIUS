import fs from 'fs';
import path from 'path';

// ImageAsset DTO shape
// {
//   id, source: "bgg"|"rulebook"|"manual"|"image-extractor",
//   originalUrl?, fileKey?,
//   crops: [{ id, x, y, w, h, purpose: "component"|"overview"|"box" }],
//   tags: string[],
//   width, height,
//   quality: { score: number, notes? },
//   license?: { name, url?, attribution? }
// }

const DATA_DIR = process.env.DB_DATA_DIR || path.resolve(process.cwd(), 'data');
const DATA_FILE = process.env.DB_IMAGE_DATA_FILE || path.join(DATA_DIR, 'images.json');
const USE_FILE_STORAGE = process.env.DB_IN_MEMORY === 'true' ? false : process.env.NODE_ENV !== 'test';

let store = {
  imagesByProject: {},
  componentLinks: {},
  componentLinkMetadata: {},
};

function ensureStorage() {
  if (!USE_FILE_STORAGE) {
    return;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DATA_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      store = {
        imagesByProject: parsed.imagesByProject || {},
        componentLinks: parsed.componentLinks || {},
        componentLinkMetadata: parsed.componentLinkMetadata || {},
      };
    } catch (err) {
      console.warn('Failed to load image store, starting fresh', err);
    }
  }
}

function persist() {
  if (!USE_FILE_STORAGE) {
    return;
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function getProjectKey(projectId) {
  return String(projectId || '');
}

function listImages(projectId) {
  const key = getProjectKey(projectId);
  return {
    images: [...(store.imagesByProject[key] || [])],
    componentImages: { ...(store.componentLinks[key] || {}) },
    componentImageLinkDetails: { ...(store.componentLinkMetadata[key] || {}) },
  };
}

function saveImages(projectId, images = []) {
  const key = getProjectKey(projectId);
  store.imagesByProject[key] = images;
  persist();
  return listImages(projectId);
}

function upsertImage(projectId, image) {
  const key = getProjectKey(projectId);
  const { images } = listImages(projectId);
  const idx = images.findIndex((img) => img.id === image.id);
  if (idx >= 0) {
    images[idx] = { ...images[idx], ...image };
  } else {
    images.push(image);
  }
  store.imagesByProject[key] = images;
  persist();
  return image;
}

function appendImages(projectId, newImages = []) {
  const { images } = listImages(projectId);
  const merged = [...images];
  newImages.forEach((img) => {
    const exists = merged.some(
      (existing) =>
        (img.originalUrl && existing.originalUrl === img.originalUrl) ||
        (img.fileKey && existing.fileKey === img.fileKey) ||
        existing.id === img.id
    );
    if (!exists) {
      merged.push(img);
    }
  });
  return saveImages(projectId, merged);
}

function removeImagesBySource(projectId, source) {
  const { images } = listImages(projectId);
  const filtered = images.filter(img => img.source !== source);
  const removedCount = images.length - filtered.length;
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} images with source "${source}" from ${projectId}`);
  }
  return saveImages(projectId, filtered);
}

function linkImagesToComponent(projectId, componentId, imageIds = [], { origin = 'manual', manualImageIds = null } = {}) {
  const key = getProjectKey(projectId);
  const links = { ...(store.componentLinks[key] || {}) };
  const metadata = { ...(store.componentLinkMetadata[key] || {}) };
  const existingMetadata = metadata[componentId] || {};
  const ids = [...new Set((Array.isArray(imageIds) ? imageIds : []).filter(Boolean))];
  const explicitlyManual = Array.isArray(manualImageIds) ? new Set(manualImageIds) : null;
  links[componentId] = ids;
  metadata[componentId] = Object.fromEntries(ids.map((imageId) => [imageId, {
    ...(existingMetadata[imageId] || {}),
    origin: explicitlyManual
      ? (explicitlyManual.has(imageId) ? 'manual' : (existingMetadata[imageId]?.origin || origin))
      : origin,
  }]));
  store.componentLinks[key] = links;
  store.componentLinkMetadata[key] = metadata;
  persist();
  return links;
}

/** Removes only matcher-owned links, preserving legacy and operator-manual links. */
function reconcileAutomaticLinks(projectId, components = [], matches = {}) {
  const key = getProjectKey(projectId);
  const links = { ...(store.componentLinks[key] || {}) };
  const metadata = { ...(store.componentLinkMetadata[key] || {}) };
  const currentComponents = new Map(components.map((component) => [component.id, component]));

  for (const [componentId, imageIds] of Object.entries(links)) {
    const component = currentComponents.get(componentId);
    const details = metadata[componentId] || {};
    const preservedIds = imageIds.filter((imageId) => details[imageId]?.origin !== 'auto');
    if (preservedIds.length > 0) {
      links[componentId] = preservedIds;
      metadata[componentId] = Object.fromEntries(preservedIds.map((imageId) => [imageId, details[imageId] || { origin: 'manual' }]));
    } else {
      delete links[componentId];
      delete metadata[componentId];
    }
    if (!component) continue;
  }

  for (const [componentId, imageIds] of Object.entries(matches)) {
    if (!currentComponents.has(componentId) || !Array.isArray(imageIds) || imageIds.length === 0) continue;
    const existingIds = links[componentId] || [];
    const details = metadata[componentId] || {};
    const nextIds = [...new Set([...existingIds, ...imageIds])];
    links[componentId] = nextIds;
    metadata[componentId] = {
      ...details,
      ...Object.fromEntries(imageIds.map((imageId) => [imageId, { origin: details[imageId]?.origin || 'auto' }])),
    };
  }

  store.componentLinks[key] = links;
  store.componentLinkMetadata[key] = metadata;
  persist();
  return listImages(projectId);
}

function resetImageStore() {
  store = { imagesByProject: {}, componentLinks: {}, componentLinkMetadata: {} };
  persist();
}

ensureStorage();

export {
  listImages,
  saveImages,
  upsertImage,
  appendImages,
  removeImagesBySource,
  linkImagesToComponent,
  reconcileAutomaticLinks,
  resetImageStore,
};

