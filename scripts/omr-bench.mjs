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
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { buildCorpus, truthEvents } from './omr-bench-corpus.mjs';
import { recognizeMlNode } from './omr-ml-node.mjs';
import { bootXmlDom, parseScoreFromMusicXml } from './omr-xml-node.mjs';
import { detectEngines, recognizeImageFile } from './omr-pc.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const toolkitPath = path.join(root, '../app/web/vendor/verovio/verovio-toolkit-wasm.js');
const outPath = path.join(root, '../docs/omr-bench-results.json');

const args = new Set(process.argv.slice(2));
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || (args.has('--quick') ? 4 : 15));
const noOemer = args.has('--no-oemer');
const noMl = args.has('--no-ml');
const noAudiveris = args.has('--no-audiveris');
const noHomr = args.has('--no-homr');
const noV2 = args.has('--no-v2');

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
    tk.setOptions({ font: 'Bravura', scale: 70, pageWidth: 3000, pageHeight: 3600, adjustPageHeight: true, svgViewBox: true, header: 'none', footer: 'none', pageMarginTop: 120, pageMarginBottom: 80, pageMarginLeft: 120, pageMarginRight: 80 });
  }
  const built = Mei.meiForPart(score);
  if (!tk.loadData(built.mei)) throw new Error('Verovio loadData failed');
  const svg = tk.renderToSVG(1);
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 2000 }, background: '#ffffff' });
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
  bootXmlDom();
  const score = parseScoreFromMusicXml(xml);
  return truthEvents(score).events;
}

async function engineEventsFromFile(imagePath, engine){
  const { musicxml } = await recognizeImageFile(imagePath, engine);
  if (!musicxml) throw new Error(`${engine} が MusicXML を返しませんでした`);
  return scoreEventsFromMusicXml(musicxml);
}

async function writePhoneJpeg(pngBuffer, outPath){
  const sharp = (await import('sharp')).default;
  await sharp(pngBuffer)
    .rotate(2.2, { background: '#f8f8f8' })
    .modulate({ brightness: 1.08, saturation: 0.85 })
    .blur(0.6)
    .jpeg({ quality: 68, chromaSubsampling: '4:2:0' })
    .toFile(outPath);
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
  if (!sum.n) return { f1: 0, pitchAcc: 0, durationAcc: 0, precision: 0, recall: 0, samples: 0 };
  const n = sum.n;
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
  const engines = await detectEngines();
  const pcEngines = [];
  if (!noAudiveris && engines.audiveris) pcEngines.push('audiveris');
  if (!noHomr && engines.homr) pcEngines.push('homr');
  if (!noOemer && engines.oemer) pcEngines.push('oemer');

  const verovioTk = await initVerovio().then(v => {
    const tk = new v.toolkit();
    tk.setOptions({ font: 'Bravura', scale: 70, pageWidth: 3000, pageHeight: 3600, adjustPageHeight: true, svgViewBox: true, header: 'none', footer: 'none', pageMarginTop: 120, pageMarginBottom: 80, pageMarginLeft: 120, pageMarginRight: 80 });
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
    const phonePath = path.join(tmpBase, `${item.id}-phone.jpg`);
    await writeFile(pngPath, png);
    await writePhoneJpeg(png, phonePath);

    const sanity = Align.align(truth, truth, { barTicks });
    rows.push({ id: item.id, variant: 'sanity', method: 'ground_truth', ...sanity });

    const variants = [
      ['clean', clean, pngPath],
      ['phone', phone, phonePath]
    ];
    for (const [variant, imageData, filePath] of variants) {
      const methodRuns=[];
      if (!noV2) {
        methodRuns.push(['v2_before', () => O.recognizeRGBA(imageData, { time: item.score.time, solver: false })]);
        methodRuns.push(['v2_after', () => O.recognizeRGBA(imageData, { time: item.score.time, solver: true })]);
      }
      if (!noMl) {
        methodRuns.push(['ml_node', async () => Promise.race([
          recognizeMlNode(imageData),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ml timeout')), 180000))
        ])]);
      }
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
      for (const engine of pcEngines) {
        const method = engine === 'audiveris' ? 'audiveris' : engine === 'homr' ? 'homr_cli' : 'oemer_cli';
        try {
          const predicted = await engineEventsFromFile(filePath, engine);
          const m = Align.align(truth, predicted, { barTicks });
          rows.push({ id: item.id, variant, method, ...m });
        } catch (error) {
          rows.push({ id: item.id, variant, method, error: error.message, f1: 0, pitchAcc: 0, durationAcc: 0 });
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
  const methodNames = ['ground_truth', 'audiveris', 'homr_cli', 'oemer_cli', 'ml_node', 'v2_before', 'v2_after'];
  summary.engines = engines;
  for (const method of methodNames) {
    if (method === 'ground_truth') {
      summary.methods[method] = {
        sanity: aggregate(rows.filter(r => r.method === method && !r.error))
      };
      continue;
    }
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