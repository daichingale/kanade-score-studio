import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';

const TARGET_MP = 2_500_000;
const SCALES = Object.freeze([0.96, 1, 1.04]);

/**
 * Scale image toward homr's ~2.5MP normalization (see homr upstream).
 */
export async function prepareHomrImage(inputPath, { scaleMul = 1, variant = 'clean' } = {}) {
  const sharp = (await import('sharp')).default;
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'kanade-homr-'));
  const ext = path.extname(inputPath).toLowerCase() || '.jpg';
  const tag = `${variant}-s${String(scaleMul).replace('.', '')}`;
  const outPath = path.join(workDir, `${path.basename(inputPath, ext)}-${tag}${ext === '.png' ? '.png' : '.jpg'}`);

  let pipeline = sharp(inputPath, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();
  let w = meta.width || 1000;
  let h = meta.height || 1000;
  const mp = w * h;
  let factor = Math.sqrt((TARGET_MP / Math.max(1, mp))) * scaleMul;
  factor = Math.max(0.75, Math.min(1.45, factor));
  const nw = Math.min(4200, Math.round(w * factor));
  const nh = Math.min(5200, Math.round(h * factor));
  pipeline = pipeline.resize(nw, nh, { kernel: sharp.kernel.lanczos3, fit: 'fill' });

  if (variant === 'phone') {
    pipeline = pipeline.normalize().linear(1.08, -12).sharpen({ sigma: 0.7 });
  } else {
    pipeline = pipeline.sharpen({ sigma: 0.4 });
  }

  if (ext === '.png') await pipeline.png().toFile(outPath);
  else await pipeline.jpeg({ quality: 92, mozjpeg: true }).toFile(outPath);

  return { path: outPath, workDir, scaleMul };
}

export function homrScaleVariants({ multiscale = false } = {}) {
  return multiscale ? SCALES : [1];
}

export async function cleanupHomrPrep(prep) {
  if (prep?.workDir) await rm(prep.workDir, { recursive: true, force: true });
}