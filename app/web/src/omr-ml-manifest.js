/* oemer ONNX weights — NOT bundled; downloaded on first ML OMR use. */
(function(root){
  'use strict';
  const STAFF_MODEL_BYTES=70_778_880;
  const SEG_MODEL_BYTES=38_481_920;
  const manifest={
    version:1,
    label:'oemer ONNX',
    license:{
      name:'MIT',
      project:'https://github.com/BreezeWhite/oemer',
      models:'https://github.com/BreezeWhite/oemer/releases/tag/checkpoints',
      note:'oemer 本体・学習済みチェックポイント（1st_model.onnx / 2nd_model.onnx）。クリーン譜向け。手書き譜は非推奨。'
    },
    totalBytes:STAFF_MODEL_BYTES+SEG_MODEL_BYTES,
    displaySize:'約104MB',
    assets:[
      {
        id:'unet_big',
        filename:'1st_model.onnx',
        url:'https://github.com/BreezeWhite/oemer/releases/download/checkpoints/1st_model.onnx',
        bytes:STAFF_MODEL_BYTES,
        inputName:'input',
        outputName:'output'
      },
      {
        id:'seg_net',
        filename:'2nd_model.onnx',
        url:'https://github.com/BreezeWhite/oemer/releases/download/checkpoints/2nd_model.onnx',
        bytes:SEG_MODEL_BYTES,
        inputName:'input',
        outputName:'output'
      }
    ],
    runtime:{
      module:'vendor/onnx/ort.wasm.min.mjs',
      wasmPath:'vendor/onnx/',
      worker:'src/omr-ml-worker.js'
    },
    cacheName:'kanade-omr-models-v1',
    storageKey:'kanade.omr.ml.ready.v1'
  };
  root.KanadeOmrMlManifest=manifest;
})(globalThis);