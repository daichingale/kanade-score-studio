import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants as fsConstants } from 'node:fs';

export const OMR_BODY_LIMIT = 12 * 1024 * 1024;
export const OMR_ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
]);

const AUDIVERIS_CANDIDATES = process.platform === 'win32'
  ? [
      process.env.AUDIVERIS_CMD,
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Audiveris', 'bin', 'Audiveris.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Audiveris', 'bin', 'Audiveris.exe')
    ].filter(Boolean)
  : process.platform === 'darwin'
    ? [process.env.AUDIVERIS_CMD, '/Applications/Audiveris.app/Contents/MacOS/Audiveris', 'audiveris']
    : [process.env.AUDIVERIS_CMD, 'audiveris', 'Audiveris'];

function runCommand(cmd, args, { cwd, timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('OMR エンジンがタイムアウトしました'));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `終了コード ${code}`));
    });
  });
}

async function pathExists(file) {
  try { await access(file, fsConstants.X_OK); return true; } catch { return false; }
}

export async function detectEngines() {
  let oemer = null;
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await runCommand(which, ['oemer'], { timeoutMs: 5000 });
    const line = stdout.split(/\r?\n/).find(Boolean);
    if (line) oemer = line.trim();
  } catch { /* optional */ }
  let audiveris = null;
  for (const candidate of AUDIVERIS_CANDIDATES) {
    if (await pathExists(candidate)) { audiveris = candidate; break; }
  }
  return { oemer, audiveris, prefer: audiveris ? 'audiveris' : (oemer ? 'oemer' : null) };
}

function extForMime(mime) {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

async function runOemer(imagePath, workDir) {
  await runCommand('oemer', ['-o', workDir, imagePath], { cwd: workDir });
  const base = path.basename(imagePath, path.extname(imagePath));
  const xmlPath = path.join(workDir, `${base}.musicxml`);
  const xml = await readFile(xmlPath, 'utf8');
  return { musicxml: xml, engine: 'oemer' };
}

async function runAudiveris(imagePath, workDir) {
  const aud = (await detectEngines()).audiveris;
  if (!aud) throw new Error('Audiveris が見つかりません');
  const args = ['-batch', '-export', '-output', workDir, imagePath];
  await runCommand(aud, args, { cwd: workDir });
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(workDir);
  const xmlName = files.find(name => name.endsWith('.musicxml') || name.endsWith('.mxl'));
  if (!xmlName) throw new Error('Audiveris から MusicXML が得られませんでした');
  const xmlPath = path.join(workDir, xmlName);
  if (xmlName.endsWith('.mxl')) {
    return { musicxml: null, mxlPath: xmlPath, engine: 'audiveris', warnings: ['MXL を返しました（クライアントで展開）'] };
  }
  return { musicxml: await readFile(xmlPath, 'utf8'), engine: 'audiveris' };
}

export async function recognizeOnPc({ bytes, mime, filename, engine = 'auto' }) {
  if (!bytes?.length) throw new Error('空のファイルです');
  if (bytes.length > OMR_BODY_LIMIT) throw new Error('ファイルが大きすぎます（12MB 上限）');
  if (!OMR_ALLOWED_MIME.has(mime)) throw new Error('この形式は PC OMR では未対応です');
  const { oemer, audiveris } = await detectEngines();
  const pick = engine === 'auto'
    ? (audiveris ? 'audiveris' : (oemer ? 'oemer' : null))
    : engine;
  if (!pick || (pick === 'oemer' && !oemer) || (pick === 'audiveris' && !audiveris)) {
    throw new Error('PC に Audiveris または oemer がインストールされていません');
  }
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'kanade-omr-'));
  try {
    const safe = (filename || 'scan').replace(/[^\w.\-()+\u3000-\u9fff]/g, '_').slice(0, 80);
    const imagePath = path.join(workDir, safe.endsWith(extForMime(mime)) ? safe : safe + extForMime(mime));
    await writeFile(imagePath, bytes);
  const result = pick === 'audiveris'
      ? await runAudiveris(imagePath, workDir)
      : await runOemer(imagePath, workDir);
    return result;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export function prepareOmrRequest(body) {
  if (!body || typeof body !== 'object') throw Object.assign(new Error('invalid-request'), { status: 400 });
  const { mime, dataBase64, filename, engine } = body;
  if (typeof mime !== 'string' || !OMR_ALLOWED_MIME.has(mime)) throw Object.assign(new Error('invalid-mime'), { status: 400 });
  if (typeof dataBase64 !== 'string') throw Object.assign(new Error('invalid-payload'), { status: 400 });
  const bytes = Buffer.from(dataBase64, 'base64');
  if (bytes.length > OMR_BODY_LIMIT) throw Object.assign(new Error('payload-too-large'), { status: 413 });
  const pick = engine === 'audiveris' || engine === 'oemer' ? engine : 'auto';
  return { bytes, mime, filename: typeof filename === 'string' ? filename : 'scan', engine: pick };
}