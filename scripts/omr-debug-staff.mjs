#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCorpus } from './omr-bench-corpus.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
require(path.join(root, '../app/web/src/core.js'));
require(path.join(root, '../app/web/src/omr-image.js'));
require(path.join(path.join(root, '../app/web/vendor/verovio/verovio-toolkit-wasm.js')));

const toolkitPath = path.join(root, '../app/web/vendor/verovio/verovio-toolkit-wasm.js');
const verovio = require(toolkitPath);

async function render(){
  const Mei = require('../app/web/src/verovio-mei.js');
  if (!verovio.module.calledRun) await new Promise(r => verovio.module.onRuntimeInitialized = r);
  const tk = new verovio.toolkit();
  tk.setOptions({ font: 'Bravura', scale: 55, pageWidth: 2200, pageHeight: 2800, adjustPageHeight: true, svgViewBox: true, header: 'none', footer: 'none' });
  const score = buildCorpus()[0].score;
  tk.loadData(Mei.meiForPart(score).mei);
  const svg = tk.renderToSVG(1);
  const { Resvg } = await import('@resvg/resvg-js');
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1400 }, background: '#ffffff' }).render().asPng();
}

async function main(){
  const sharp = (await import('sharp')).default;
  const png = await render();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imageData = { width: info.width, height: info.height, data };
  const Img = global.KanadeOmrImage;
  const gray = Img.bitmapFromRGBA(imageData);
  const sauvola = Img.sauvola(Img.contrast(gray, 1.25));
  const engraved = Img.binarizeEngraved(gray);
  for (const [name, bitmap] of [['sauvola', sauvola], ['engraved', engraved]]) {
    const { width, height, data: b } = bitmap;
    let top = 0, max = 0;
    const peaks = [];
    for (let y = 10; y < height - 10; y++) {
      let dark = 0;
      for (let x = 0; x < width; x++) if (b[y * width + x]) dark++;
      const v = dark / width;
      if (v > max) max = v;
      if (v > 0.5) peaks.push({ y, v, dark });
    }
    console.log(name, 'maxRatio', max, 'peaks>0.5', peaks.length, 'sample', peaks.slice(0, 5));
  }
}

main().catch(e => { console.error(e); process.exit(1); });