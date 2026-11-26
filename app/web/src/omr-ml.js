/* On-device ML OMR public API — models fetched on demand (see omr-ml-manifest.js). */
(function(root){
  'use strict';
  const M=()=>root.KanadeOmrMlManifest;

  root.KanadeOmrMl={
    manifest:M,
    displaySize:()=>M()?.displaySize||'約104MB',
    license:()=>M()?.license,
    status:{
      enabled:true,
      reason:`oemer ONNX（${M()?.displaySize}）は初回利用時に GitHub Release からダウンロードされます。ライセンス: ${M()?.license?.name} (${M()?.license?.project})。`
    }
  };
})(globalThis);