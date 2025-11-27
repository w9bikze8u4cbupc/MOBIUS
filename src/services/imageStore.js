import fs from 'fs';
import * as path from 'path';

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

function linkImagesToComponent(projectId, componentId, imageIds = []) {
  const key = getProjectKey(projectId);
  const links = { ...(store.componentLinks[key] || {}) };
  links[componentId] = Array.isArray(imageIds) ? imageIds : [];
  store.componentLinks[key] = links;
  persist();
  return links;
}

function resetImageStore() {
  store = { imagesByProject: {}, componentLinks: {} };
  persist();
}

ensureStorage();

export {
  listImages,
  saveImages,
  upsertImage,
  appendImages,
  linkImagesToComponent,
  resetImageStore,
};

