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
import { buildAllCorpus, truthEvents } from './omr-bench-corpus.mjs';
import { recognizeMlNode } from './omr-ml-node.mjs';
import { bootXmlDom, parseMusicXmlImport } from './omr-xml-node.mjs';
import { detectEngines, recognizeImageFile, recognizeImageFileBestOf } from './omr-pc.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const toolkitPath = path.join(root, '../app/web/vendor/verovio/verovio-toolkit-wasm.js');
const outOverride = process.argv.find(a => a.startsWith('--out='))?.split('=').slice(1).join('=');
const outPath = outOverride ? path.resolve(outOverride) : path.join(root, '../docs/omr-bench-results.json');

const args = new Set(process.argv.slice(2));
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || (args.has('--quick') ? 4 : 15));
const noOemer = args.has('--no-oemer');
const noMl = args.has('--no-ml');
const noAudiveris = args.has('--no-audiveris');
const noHomr = args.has('--no-homr');
const noV2 = args.has('--no-v2');
const noPrep = args.has('--no-prep');
const noBestOf = args.has('--no-bestof');
const extended = args.has('--extended');
const homrMs = args.has('--homr-ms');
const noHomrLegacy = args.has('--no-homr-legacy');

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

async function renderPng(score, tk, layout = 'single'){
  const Mei = require('../app/web/src/verovio-mei.js');
  const ensemble = layout === 'ensemble' && score.ensembleParts?.length;
  if (!tk) {
    const verovio = await initVerovio();
    tk = new verovio.toolkit();
    tk.setOptions({ font: 'Bravura', scale: 70, pageWidth: 3000, pageHeight: 3600, adjustPageHeight: true, svgViewBox: true, header: 'none', footer: 'none', pageMarginTop: 120, pageMarginBottom: 80, pageMarginLeft: 120, pageMarginRight: 80 });
  }
  tk.setOptions({
    font: 'Bravura',
    scale: ensemble ? 58 : 70,
    pageWidth: ensemble ? 3200 : 3000,
    pageHeight: ensemble ? 5200 : 3600,
    adjustPageHeight: true,
    svgViewBox: true,
    header: 'none',
    footer: 'none',
    pageMarginTop: ensemble ? 160 : 120,
    pageMarginBottom: 120,
    pageMarginLeft: 120,
    pageMarginRight: 120
  });
  const built = ensemble ? Mei.meiForParts([score, ...score.ensembleParts]) : Mei.meiForPart(score);
  if (!tk.loadData(built.mei)) throw new Error('Verovio loadData failed');
  const svg = tk.renderToSVG(1);
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: ensemble ? 2200 : 2000 }, background: '#ffffff' });
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

const REPAIR_WARN=/短縮|切り詰め|統合|省略|調整|重なり|連符|超える|修復|伴奏声部/i;

function importPenalty(warnings){
  return (warnings||[]).reduce((n,w)=>n+(REPAIR_WARN.test(w)?2:1),0);
}

function scoreEventsFromMusicXml(xml){
  bootXmlDom();
  const { score } = parseMusicXmlImport(xml);
  return truthEvents(score).events;
}

function scoreEventsWithPenalty(xml){
  const parsed = parseMusicXmlImport(xml);
  return { events: truthEvents(parsed.score).events, penalty: importPenalty(parsed.warnings), warnings: parsed.warnings };
}

async function engineEventsFromFile(imagePath, engine, variant, homrOpts = {}){
  const prep = !noPrep && ((variant === 'phone' && engine === 'audiveris') || (engine === 'audiveris' && variant === 'clean'));
  const { musicxml } = await recognizeImageFile(imagePath, engine, { prep, variant, ...homrOpts });
  if (!musicxml) throw new Error(`${engine} が MusicXML を返しませんでした`);
  return scoreEventsFromMusicXml(musicxml);
}

async function engineEventsBestOfFile(imagePath, variant){
  const { musicxml, alternatives } = await recognizeImageFileBestOf(imagePath, { prep: !noPrep, variant });
  const scored = [scoreEventsWithPenalty(musicxml)];
  for (const alt of alternatives || []) {
    if (alt.musicxml) scored.push(scoreEventsWithPenalty(alt.musicxml));
  }
  scored.sort((a, b) => a.penalty - b.penalty);
  return scored[0].events;
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
  const allCorp = buildAllCorpus({ extended });
  const corpus = allCorp.slice(0, limit);
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
    png = await renderPng(item.score, verovioTk, item.layout || 'single');
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
          const predicted = await engineEventsFromFile(filePath, engine, variant);
          const m = Align.align(truth, predicted, { barTicks });
          const cats = Align.categorize(truth, predicted, { barTicks });
          rows.push({ id: item.id, variant, method, ...m, errorCats: cats });
        } catch (error) {
          rows.push({ id: item.id, variant, method, error: error.message, f1: 0, pitchAcc: 0, durationAcc: 0 });
        }
      }
      if (engines.homr && !noHomr) {
        const extraHomr = [
          ...(noHomrLegacy ? [] : [['homr_legacy', { homrLegacy: true, normalized: false }]]),
          ...(homrMs ? [['homr_multiscale', { multiscale: true }]] : [])
        ];
        for (const [method, homrOpts] of extraHomr) {
          try {
            const predicted = await engineEventsFromFile(filePath, 'homr', variant, homrOpts);
            const m = Align.align(truth, predicted, { barTicks });
            rows.push({ id: item.id, variant, method, ...m });
          } catch (error) {
            rows.push({ id: item.id, variant, method, error: error.message, f1: 0, pitchAcc: 0, durationAcc: 0 });
          }
        }
      }
      if (!noBestOf && engines.homr && engines.audiveris) {
        const method = 'pc_best_of';
        try {
          const predicted = await engineEventsBestOfFile(filePath, variant);
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
  const methodNames = ['ground_truth', 'audiveris', 'homr_cli', 'homr_legacy', 'homr_multiscale', 'pc_best_of', 'oemer_cli', 'ml_node', 'v2_before', 'v2_after'];
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
    cleanF1Delta: summary.methods.v2_after?.clean?.f1 - summary.methods.v2_before?.clean?.f1,
    homrVsBaseline: {
      baselineRef: 'main@7245c61 (PR #13 import/prep)',
      homrCleanF1: summary.methods.homr_cli?.clean?.f1,
      homrPhoneF1: summary.methods.homr_cli?.phone?.f1,
      homrCleanDur: summary.methods.homr_cli?.clean?.durationAcc,
      homrPhoneDur: summary.methods.homr_cli?.phone?.durationAcc,
      baselineHomrCleanF1: 0.801973581973582,
      baselineHomrPhoneF1: 0.8050505050505051,
      baselineHomrCleanDur: 0.775952380952381,
      baselineHomrPhoneDur: 0.7809523809523807
    }
  };
  const homrRows = rows.filter(r => r.method === 'homr_cli' && !r.error && r.errorCats);
  summary.errorCategories = homrRows.reduce((acc, r) => {
    for (const [k, v] of Object.entries(r.errorCats)) acc[k] = (acc[k] || 0) + v;
    return acc;
  }, {});
  summary.corpusTag = extended ? 'legacy+extended' : 'legacy15';
  summary.successRates = {};
  const corpusN = corpus.length;
  for (const method of methodNames) {
    if (method === 'ground_truth') {
      summary.successRates[method] = { sanity: rows.filter(r => r.method === method && !r.error).length, of: corpusN };
      continue;
    }
    summary.successRates[method] = {
      clean: rows.filter(r => r.method === method && r.variant === 'clean' && !r.error).length,
      phone: rows.filter(r => r.method === method && r.variant === 'phone' && !r.error).length,
      of: corpusN
    };
  }
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