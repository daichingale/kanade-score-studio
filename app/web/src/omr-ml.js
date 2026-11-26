/* Optional ONNX OMR — models are not bundled (oemer weights are 100MB+; mobile PWA budget). */
(function(root){
  'use strict';

  async function tryOnnxAssist(/* bitmap */){
    return null;
  }

  const status={
    enabled:false,
    reason:'oemer/ONNX モデル（約100MB以上）は未同梱です。古典パイプラインとレビュー画面で補正してください。Audiveris（GPL）をローカルで実行して MusicXML で取り込む方法も利用できます。'
  };

  root.KanadeOmrMl={tryOnnxAssist,status};
})(globalThis);