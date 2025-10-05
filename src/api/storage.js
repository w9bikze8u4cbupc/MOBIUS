import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_ROOT = path.resolve(__dirname, '../../data');
const UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');
const PDF_IMAGES_ROOT = path.resolve(__dirname, '../../pdf_images');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output');

export async function ensureStorageLayout() {
  await Promise.all(
    [DATA_ROOT, UPLOADS_ROOT, PDF_IMAGES_ROOT, OUTPUT_ROOT].map(async (dir) => {
      await fs.mkdir(dir, { recursive: true });
    }),
  );
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_ROOT),
  filename: (_req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${timestamp}-${file.originalname}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150 MB cap for large rulebooks
  },
});

export const paths = {
  DATA_ROOT,
  UPLOADS_ROOT,
  PDF_IMAGES_ROOT,
  OUTPUT_ROOT,
};