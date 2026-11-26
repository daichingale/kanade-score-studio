import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { constants as fsConstants } from 'node:fs';
import { readMusicXmlFile } from './omr-xml-node.mjs';

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
    : [
      process.env.AUDIVERIS_CMD,
      '/opt/audiveris/bin/Audiveris',
      'audiveris',
      'Audiveris'
    ].filter(Boolean);

function runCommand(cmd, args, { cwd, timeoutMs = 300_000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: env || process.env });
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
      else {
        const tail = (stderr.trim() || stdout.trim() || `終了コード ${code}`).split('\n').slice(-6).join('\n');
        reject(new Error(tail));
      }
    });
  });
}

async function pathExists(file) {
  try { await access(file, fsConstants.X_OK); return true; } catch { return false; }
}

async function pathExistsFile(file) {
  try { await access(file, fsConstants.F_OK); return true; } catch { return false; }
}

export async function detectEngines() {
  let oemer = null;
  let homr = null;
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await runCommand(which, ['oemer'], { timeoutMs: 5000 });
    const line = stdout.split(/\r?\n/).find(Boolean);
    if (line) oemer = line.trim();
  } catch { /* optional */ }
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await runCommand(which, ['homr'], { timeoutMs: 5000 });
    const line = stdout.split(/\r?\n/).find(Boolean);
    if (line) homr = line.trim();
  } catch { /* optional */ }
  let audiveris = null;
  for (const candidate of AUDIVERIS_CANDIDATES) {
    if (await pathExists(candidate)) { audiveris = candidate; break; }
  }
  const prefer = homr ? 'homr' : (audiveris ? 'audiveris' : (oemer ? 'oemer' : null));
  return { oemer, homr, audiveris, prefer };
}

function extForMime(mime) {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

async function runOemer(imagePath, workDir) {
  const onnxOnly = { ...process.env, CUDA_VISIBLE_DEVICES: '' };
  await runCommand('oemer', [imagePath, '-o', workDir], { cwd: workDir, env: onnxOnly });
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(workDir);
  const xmlName = files.find(f => f.endsWith('.musicxml') || (f.endsWith('.xml') && !f.includes('META')));
  if (!xmlName) throw new Error('oemer が MusicXML を出力しませんでした');
  const xmlPath = path.join(workDir, xmlName);
  const xml = xmlPath.endsWith('.mxl') ? await readMusicXmlFile(xmlPath) : await readFile(xmlPath, 'utf8');
  return { musicxml: xml, engine: 'oemer' };
}

async function runHomr(imagePath) {
  const homr = (await detectEngines()).homr;
  if (!homr) throw new Error('homr が見つかりません');
  await runCommand(homr, [imagePath], { timeoutMs: 600_000 });
  const base = imagePath.replace(/\.[^.]+$/, '');
  const candidates = [`${base}.musicxml`, `${imagePath}.musicxml`];
  for (const xmlPath of candidates) {
    if (await pathExistsFile(xmlPath)) {
      return { musicxml: await readFile(xmlPath, 'utf8'), engine: 'homr' };
    }
  }
  throw new Error('homr が MusicXML を出力しませんでした');
}

async function runAudiveris(imagePath, workDir) {
  const aud = (await detectEngines()).audiveris;
  if (!aud) throw new Error('Audiveris が見つかりません');
  const args = ['-batch', '-export', '-output', workDir, imagePath];
  await runCommand(aud, args, { cwd: workDir, timeoutMs: 600_000 });
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(workDir);
  const xmlName = files.find(name => name.endsWith('.musicxml') || name.endsWith('.mxl'));
  if (!xmlName) throw new Error('Audiveris から MusicXML が得られませんでした');
  const xmlPath = path.join(workDir, xmlName);
  const musicxml = xmlName.endsWith('.mxl') ? await readMusicXmlFile(xmlPath) : await readFile(xmlPath, 'utf8');
  return { musicxml, engine: 'audiveris' };
}

export async function recognizeOnPc({ bytes, mime, filename, engine = 'auto' }) {
  if (!bytes?.length) throw new Error('空のファイルです');
  if (bytes.length > OMR_BODY_LIMIT) throw new Error('ファイルが大きすぎます（12MB 上限）');
  if (!OMR_ALLOWED_MIME.has(mime)) throw new Error('この形式は PC OMR では未対応です');
  const { oemer, homr, audiveris } = await detectEngines();
  const pick = engine === 'auto'
    ? (homr ? 'homr' : (audiveris ? 'audiveris' : (oemer ? 'oemer' : null)))
    : engine;
  if (!pick || (pick === 'oemer' && !oemer) || (pick === 'homr' && !homr) || (pick === 'audiveris' && !audiveris)) {
    throw new Error('PC に Audiveris / homr / oemer のいずれも利用できません');
  }
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'kanade-omr-'));
  try {
    const safe = (filename || 'scan').replace(/[^\w.\-()+\u3000-\u9fff]/g, '_').slice(0, 80);
    const imagePath = path.join(workDir, safe.endsWith(extForMime(mime)) ? safe : safe + extForMime(mime));
    await writeFile(imagePath, bytes);
    if (pick === 'homr') return await runHomr(imagePath);
    if (pick === 'audiveris') return await runAudiveris(imagePath, workDir);
    return await runOemer(imagePath, workDir);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function recognizeImageFile(imagePath, engine = 'auto') {
  const bytes = await readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return recognizeOnPc({ bytes, mime, filename: path.basename(imagePath), engine });
}

export function prepareOmrRequest(body) {
  if (!body || typeof body !== 'object') throw Object.assign(new Error('invalid-request'), { status: 400 });
  const { mime, dataBase64, filename, engine } = body;
  if (typeof mime !== 'string' || !OMR_ALLOWED_MIME.has(mime)) throw Object.assign(new Error('invalid-mime'), { status: 400 });
  if (typeof dataBase64 !== 'string') throw Object.assign(new Error('invalid-payload'), { status: 400 });
  const bytes = Buffer.from(dataBase64, 'base64');
  if (bytes.length > OMR_BODY_LIMIT) throw Object.assign(new Error('payload-too-large'), { status: 413 });
  const pick = ['audiveris', 'homr', 'oemer', 'auto'].includes(engine) ? engine : 'auto';
  return { bytes, mime, filename: typeof filename === 'string' ? filename : 'scan', engine: pick };
}