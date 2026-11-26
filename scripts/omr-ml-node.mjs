import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const MODEL_DIR = path.join(rootDir, '.omr-models');
const CHECKPOINTS = [
  { id: 'unet_big', file: '1st_model.onnx', url: 'https://github.com/BreezeWhite/oemer/releases/download/checkpoints/1st_model.onnx' },
  { id: 'seg_net', file: '2nd_model.onnx', url: 'https://github.com/BreezeWhite/oemer/releases/download/checkpoints/2nd_model.onnx' }
];

async function ensureModels(){
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  for (const item of CHECKPOINTS) {
    const target = path.join(MODEL_DIR, item.file);
    if (fs.existsSync(target)) continue;
    process.stderr.write(`Downloading ${item.file}…\n`);
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`model fetch failed ${item.file}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  }
  return Object.fromEntries(CHECKPOINTS.map(item => [item.id, fs.readFileSync(path.join(MODEL_DIR, item.file))]));
}

function boot(){
  require('../app/web/src/performance.js');
  require('../app/web/src/omr-image.js');
  require('../app/web/src/omr-staff.js');
  require('../app/web/src/omr-glyphs.js');
  require('../app/web/src/omr-priors.js');
  require('../app/web/src/omr-preprocess.js');
  require('../app/web/src/omr-solver.js');
  require('../app/web/src/omr-ml-masks.js');
  require('../app/web/src/omr-ml-post.js');
  require('../app/web/src/omr-recognize.js');
}

function imageTensorFromRGBA(imageData, size = 256){
  const { width, height, data } = imageData;
  const out = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.floor(x * width / size), sy = Math.floor(y * height / size);
      const o = (sy * width + sx) * 4;
      const gray = Math.round(data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114);
      const idx = (y * size + x) * 3;
      out[idx] = out[idx + 1] = out[idx + 2] = gray;
    }
  }
  return { data: out, size };
}

function argmaxMask(output){
  const [,, h, w] = output.dims;
  const ch = output.dims[1];
  const data = output.data;
  const labels = new Uint8Array(h * w);
  for (let i = 0; i < h * w; i++) {
    let best = -Infinity, label = 0;
    for (let c = 0; c < ch; c++) {
      const v = data[c * h * w + i];
      if (v > best) { best = v; label = c; }
    }
    labels[i] = label;
  }
  return { data: labels, width: w, height: h };
}

export async function recognizeMlNode(imageData){
  const ort = (await import('onnxruntime-node')).default;
  boot();
  const models = await ensureModels();
  const unet = await ort.InferenceSession.create(models.unet_big);
  const seg = await ort.InferenceSession.create(models.seg_net);
  const staffIn = imageTensorFromRGBA(imageData, 256);
  const segIn = imageTensorFromRGBA(imageData, 288);
  const staffTensor = await unet.run({ [unet.inputNames[0]]: new ort.Tensor('uint8', staffIn.data, [1, 256, 256, 3]) });
  const segTensor = await seg.run({ [seg.inputNames[0]]: new ort.Tensor('uint8', segIn.data, [1, 288, 288, 3]) });
  const staff = argmaxMask(staffTensor[unet.outputNames[0]]);
  const segOut = argmaxMask(segTensor[seg.outputNames[0]]);
  return global.KanadeOmrMlPost.recognizeFromMlSeg(imageData, { staffMask: staff, segMask: segOut });
}