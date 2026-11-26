#!/usr/bin/env node
/**
 * Fetch PDF.js + onnxruntime-web into app/web/vendor.
 * oemer ONNX weights are NOT fetched here — they download in-browser on first ML use.
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const web=path.join(root,'..','app','web','vendor');

mkdirSync(path.join(web,'pdfjs'),{recursive:true});
mkdirSync(path.join(web,'onnx'),{recursive:true});
const tmp=path.join(root,'.vendor-tmp');
rmSync(tmp,{recursive:true,force:true});
mkdirSync(tmp);
process.chdir(tmp);
execSync('npm pack pdfjs-dist@4.4.168 onnxruntime-web@1.20.0',{stdio:'inherit'});
execSync('tar -xf pdfjs-dist-4.4.168.tgz && tar -xf onnxruntime-web-1.20.0.tgz');
cpSync('package/build/pdf.min.mjs',path.join(web,'pdfjs','pdf.min.mjs'));
cpSync('package/build/pdf.worker.min.mjs',path.join(web,'pdfjs','pdf.worker.min.mjs'));
for(const name of ['ort.wasm.min.mjs','ort.wasm.min.js','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.jsep.wasm']){
  cpSync(`package/dist/${name}`,path.join(web,'onnx',name));
}
rmSync(tmp,{recursive:true,force:true});
console.log('Vendor assets updated under app/web/vendor');