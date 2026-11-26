/* On-device ML OMR coordinator (download, worker, progress). */
(function(root){
  'use strict';
  let worker=null,inflight=null,loadingUi=null;

  function manifest(){return root.KanadeOmrMlManifest;}
  function cache(){return root.KanadeOmrMlCache;}

  async function ready(){try{return await cache().isReady();}catch{return false;}}

  function workerUrl(){
    return new URL(manifest().runtime.worker,location.href).href;
  }

  function ensureWorker(){
    if(worker)return worker;
    worker=new Worker(workerUrl(),{type:'module'});
    return worker;
  }

  function callWorker(payload,timeoutMs=180000){
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const w=ensureWorker();
      const timer=setTimeout(()=>{w.removeEventListener('message',onMsg);reject(Error('OMR 推論がタイムアウトしました'));},timeoutMs);
      function onMsg(event){
        const msg=event.data;
        if(!msg||msg.id!==id)return;
        clearTimeout(timer);
        w.removeEventListener('message',onMsg);
        if(msg.type==='error')reject(Error(msg.message||'推論に失敗しました'));
        else resolve(msg);
      }
      w.addEventListener('message',onMsg);
      w.postMessage({...payload,id});
    });
  }

  async function ensureDownloaded({onProgress}={}){
    if(await ready())return true;
    return cache().download({onProgress});
  }

  async function infer(imageData){
    if(typeof Worker==='undefined')throw Error('Web Worker が利用できません');
    const models=await cache().allBuffers();
    const result=await callWorker({type:'infer',imageData,models:{
      unet_big:models.unet_big,
      seg_net:models.seg_net
    }});
    return root.KanadeOmrMlMasks.recognizeFromMlOutputs(imageData,{
      staffLogits:result.staff.data,
      segLogits:result.seg.data,
      symbolSize:result.seg.width
    });
  }

  function bindDownloadUi(rootEl){
    loadingUi=rootEl;
  }

  function renderProgress(ratio,text){
    const bar=loadingUi?.querySelector('[data-omr-ml-bar]');
    const label=loadingUi?.querySelector('[data-omr-ml-progress]');
    if(bar)bar.style.width=`${Math.round(ratio*100)}%`;
    if(label)label.textContent=text;
  }

  async function enableHighPrecision({uiRoot}={}){
    if(uiRoot)bindDownloadUi(uiRoot);
    renderProgress(0,`高精度モードを準備中…（${manifest().displaySize}）`);
    await ensureDownloaded({
      onProgress:({done,total,asset,phase})=>{
        const ratio=total?done/total:0;
        const phaseLabel=phase==='download'?`${asset} をダウンロード中…`:phase==='stored'?'保存中…':'準備中…';
        renderProgress(ratio,`${phaseLabel} ${Math.round(ratio*100)}%`);
      }
    });
    renderProgress(1,'高精度モードを有効にしました');
    return true;
  }

  root.KanadeOmrMlRuntime={
    ready,ensureDownloaded,enableHighPrecision,infer,manifestSize:()=>manifest().displaySize
  };
})(globalThis);