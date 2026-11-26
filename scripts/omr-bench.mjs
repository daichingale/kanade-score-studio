#!/usr/bin/env node
/**
 * Real OMR benchmark: Verovio render → degrade → classic/ml-node/oemer → align F1.
 * Usage: node scripts/omr-bench.mjs [--limit N] [--quick] [--no-oemer]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { buildCorpus, truthEvents } from './omr-bench-corpus.mjs';
import { recognizeMlNode } from './omr-ml-node.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const toolkitPath = path.join(root, '../app/web/vendor/verovio/verovio-toolkit-wasm.js');
const outPath = path.join(root, '../docs/omr-bench-results.json');

const args = new Set(process.argv.slice(2));
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || (args.has('--quick') ? 4 : 15));
const noOemer = args.has('--no-oemer');
const noMl = args.has('--no-ml');

function boot(){
  require('../app/web/src/core.js');
  require('../app/web/src/performance.js');
  require('../app/web/src/omr-image.js');
  require('../app/web/src/omr-staff.js');
  require('../app/web/src/omr-glyphs.js');
  require('../app/web/src/omr-priors.js');
  require('../app/web/src/omr-classic.js');
  require('../app/web/src/omr-preprocess.js');
  require('../app/web/src/omr-solver.js');
  require('../app/web/src/omr-align.js');
  require('../app/web/src/omr-recognize.js');
}

async function initVerovio(){
  const verovio = require(toolkitPath);
  if (!verovio.module.calledRun) {
    await new Promise(resolve => { verovio.module.onRuntimeInitialized = resolve; });
  }
  return verovio;
}

async function renderPng(score, tk){
  const Mei = require('../app/web/src/verovio-mei.js');
  if (!tk) {
    const verovio = await initVerovio();
    tk = new verovio.toolkit();
    tk.setOptions({ font: 'Bravura', scale: 55, pageWidth: 2200, pageHeight: 2800, adjustPageHeight: true, svgViewBox: true, header: 'none', footer: 'none' });
  }
  const built = Mei.meiForPart(score);
  if (!tk.loadData(built.mei)) throw new Error('Verovio loadData failed');
  const svg = tk.renderToSVG(1);
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1400 }, background: '#ffffff' });
  return resvg.render().asPng();
}

async function pngToImageData(pngBuffer){
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

async function degradePhone(pngBuffer){
  const sharp = (await import('sharp')).default;
  const degraded = await sharp(pngBuffer)
    .rotate(2.2, { background: '#f8f8f8' })
    .modulate({ brightness: 1.08, saturation: 0.85 })
    .blur(0.6)
    .jpeg({ quality: 68, chromaSubsampling: '4:2:0' })
    .toBuffer();
  return pngToImageData(degraded);
}

function recognitionToEvents(result, score){
  const barTicks = truthEvents(score).barTicks;
  const out = [];
  for (const note of result.notes || []) {
    const mi = note.mi ?? Math.floor((note.tick || 0) / barTicks);
    const tick = note.tick ?? 0;
    if (note.rest) out.push({ mi, tick: tick % barTicks, rest: true, den: note.den, dots: note.dots || 0 });
    else if (note.pitches) {
      for (const pitch of note.pitches) out.push({ mi, tick: tick % barTicks, pitch, den: note.den, dots: note.dots || 0 });
    } else out.push({ mi, tick: tick % barTicks, pitch: note.pitch, den: note.den, dots: note.dots || 0 });
  }
  return out;
}

function scoreEventsFromMusicXml(xml){
  require('../app/web/src/musicxml-import.js');
  const { score } = global.KanadeMusicXMLImport.parse(xml);
  return truthEvents(score).events;
}

async function runOemer(pngPath){
  const bin = process.env.PATH?.includes('.local/bin') ? 'oemer' : `${os.homedir()}/.local/bin/oemer`;
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'kanade-bench-oemer-'));
  await new Promise((resolve, reject) => {
    const child = spawn(bin, [pngPath, '-o', workDir], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`oemer exit ${code}`))));
  });
  const files = fs.readdirSync(workDir).filter(f => f.endsWith('.musicxml') || f.endsWith('.xml'));
  if (!files.length) throw new Error('no musicxml from oemer');
  const xml = await readFile(path.join(workDir, files[0]), 'utf8');
  return scoreEventsFromMusicXml(xml);
}

function aggregate(rows){
  const sum = rows.reduce((acc, row) => {
    for (const k of ['f1','pitchAcc','durationAcc','precision','recall']) {
      const v = row[k];
      if (typeof v === 'number' && Number.isFinite(v)) acc[k] = (acc[k] || 0) + v;
    }
    acc.n++;
    return acc;
  }, { n: 0 });
  const n = Math.max(1, sum.n);
  return {
    f1: sum.f1 / n,
    pitchAcc: sum.pitchAcc / n,
    durationAcc: sum.durationAcc / n,
    precision: sum.precision / n,
    recall: sum.recall / n,
    samples: n
  };
}

async function main(){
  boot();
  const Align = global.KanadeOmrAlign;
  const O = global.KanadeOMR;
  const corpus = buildCorpus().slice(0, limit);
  const rows = [];
  const tmpBase = await mkdtemp(path.join(os.tmpdir(), 'kanade-bench-'));
  const hasOemer = !noOemer && fs.existsSync(`${os.homedir()}/.local/bin/oemer`);

  const verovioTk = await initVerovio().then(v => {
    const tk = new v.toolkit();
    tk.setOptions({ font: 'Bravura', scale: 55, pageWidth: 2200, pageHeight: 2800, adjustPageHeight: true, svgViewBox: true, header: 'none', footer: 'none' });
    return tk;
  });

  for (const item of corpus) {
    let png, clean, phone;
    try {
    const { events: truth, barTicks } = truthEvents(item.score);
    png = await renderPng(item.score, verovioTk);
    clean = await pngToImageData(png);
    phone = await degradePhone(png);
    const pngPath = path.join(tmpBase, `${item.id}.png`);
    await writeFile(pngPath, png);

    const variants = [['clean', clean], ['phone', phone]];
    for (const [variant, imageData] of variants) {
      const methodRuns=[
        ['v2_before', () => O.recognizeRGBA(imageData, { time: item.score.time, solver: false })],
        ['v2_after', () => O.recognizeRGBA(imageData, { time: item.score.time, solver: true })]
      ];
      if(!noMl)methodRuns.push(['ml_node', async()=>await Promise.race([
        recognizeMlNode(imageData),
        new Promise((_,reject)=>setTimeout(()=>reject(new Error('ml timeout')),120000))
      ])]);
      for (const [method, run] of methodRuns) {
        try {
          const rec = await run();
          const predicted = recognitionToEvents(rec, item.score);
          const m = Align.align(truth, predicted, { barTicks });
          rows.push({ id: item.id, variant, method, ...m });
        } catch (error) {
          rows.push({ id: item.id, variant, method, error: error.message, f1: 0, pitchAcc: 0, durationAcc: 0 });
        }
      }
      if (hasOemer && variant === 'clean') {
        try {
          const predicted = await runOemer(pngPath);
          const m = Align.align(truth, predicted, { barTicks });
          rows.push({ id: item.id, variant: 'clean', method: 'oemer_cli', ...m });
        } catch (error) {
          rows.push({ id: item.id, variant: 'clean', method: 'oemer_cli', error: error.message, f1: 0 });
        }
      }
    }
    process.stderr.write(`bench ${item.id}\n`);
    } catch (error) {
      process.stderr.write(`skip ${item.id}: ${error.message}\n`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    corpusSize: corpus.length,
    limit,
    methods: {},
    beforeAfter: {}
  };
  for (const method of ['v2_before', 'v2_after', 'ml_node', 'oemer_cli']) {
    summary.methods[method] = {
      clean: aggregate(rows.filter(r => r.method === method && r.variant === 'clean' && !r.error)),
      phone: aggregate(rows.filter(r => r.method === method && r.variant === 'phone' && !r.error))
    };
  }
  summary.beforeAfter = {
    phoneF1Delta: summary.methods.v2_after?.phone?.f1 - summary.methods.v2_before?.phone?.f1,
    cleanF1Delta: summary.methods.v2_after?.clean?.f1 - summary.methods.v2_before?.clean?.f1
  };
  summary.rows = rows;
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ outPath, methods: summary.methods, beforeAfter: summary.beforeAfter }, null, 2));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}