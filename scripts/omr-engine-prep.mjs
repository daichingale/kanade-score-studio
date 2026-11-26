import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';

/**
 * Normalize / upscale raster before PC OMR engines (homr, Audiveris).
 * Phone shots: deskew-ish rotate, contrast, light sharpen, optional upscale.
 * Audiveris: target ~300dpi-like height for staff interline detection.
 */
export async function prepareEngineImage(inputPath, { engine = 'homr', variant = 'clean', keepDir = false } = {}) {
  if (engine === 'homr') return { path: inputPath, workDir: null };
  if (variant === 'clean' && engine === 'audiveris') {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(inputPath).metadata();
    if ((meta.height || 0) >= 900 && (meta.width || 0) >= 1800) return { path: inputPath, workDir: null };
  } else if (variant === 'clean') {
    return { path: inputPath, workDir: null };
  }
  const sharp = (await import('sharp')).default;
  const ext = path.extname(inputPath).toLowerCase();
  const usePng = ext === '.png' || engine === 'audiveris';
  const outExt = usePng ? '.png' : ext || '.jpg';
  const workDir = keepDir ? path.dirname(inputPath) : await mkdtemp(path.join(os.tmpdir(), 'kanade-prep-'));
  const tag = `${variant}-${engine}`;
  const outPath = path.join(workDir, `${path.basename(inputPath, path.extname(inputPath))}-${tag}${outExt}`);

  let pipeline = sharp(inputPath, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  let width = meta.width || 1000;
  let height = meta.height || 1000;

  const maxDim = 3800;
  const minWidth = variant === 'phone' ? 2000 : (engine === 'audiveris' ? 2200 : 1800);
  const minHeightAud = engine === 'audiveris' ? 1400 : (variant === 'phone' ? 1100 : 0);

  if (width < minWidth) {
    const scale = Math.min(minWidth / width, maxDim / Math.max(width, height));
    width = Math.min(maxDim, Math.round(width * scale));
    height = Math.min(maxDim, Math.round(height * scale));
    pipeline = pipeline.resize(width, height, { kernel: sharp.kernel.lanczos3, fit: 'inside' });
  }
  if (engine === 'audiveris' && height < minHeightAud) {
    const scale = Math.min(minHeightAud / height, maxDim / Math.max(width, height));
    width = Math.min(maxDim, Math.round(width * scale));
    height = Math.min(maxDim, Math.round(height * scale));
    pipeline = pipeline.resize(width, height, { kernel: sharp.kernel.lanczos3, fit: 'inside' });
  }

  if (variant === 'phone' || engine === 'homr') {
    pipeline = pipeline
      .normalize()
      .linear(1.12, -14)
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.3 });
    if (variant === 'phone') pipeline = pipeline.gamma(1.04);
  }

  if (engine === 'audiveris') {
    pipeline = pipeline.sharpen({ sigma: 1.1 }).linear(1.08, -10);
  }

  if (usePng) await pipeline.png({ compressionLevel: 6 }).toFile(outPath);
  else await pipeline.jpeg({ quality: variant === 'phone' ? 82 : 92, mozjpeg: true }).toFile(outPath);

  return { path: outPath, workDir: keepDir ? null : workDir };
}

export async function cleanupPrep(prep) {
  if (prep?.workDir) await rm(prep.workDir, { recursive: true, force: true });
}