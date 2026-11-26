/* Download oemer ONNX assets into Cache Storage with progress. */
(function(root){
  'use strict';
  const M=()=>root.KanadeOmrMlManifest;

  function isBrowser(){return typeof caches!=='undefined'&&typeof fetch!=='undefined';}

  async function cachedUrl(asset){
    const cache=await caches.open(M().cacheName);
    const hit=await cache.match(asset.url);
    if(hit)return hit.url;
    return null;
  }

  async function isReady(){
    if(!isBrowser())return false;
    for(const asset of M().assets){
      if(!await cachedUrl(asset))return false;
    }
    return true;
  }

  async function downloadedBytes(){
    if(!isBrowser())return 0;
    let sum=0;
    const cache=await caches.open(M().cacheName);
    for(const asset of M().assets){
      const hit=await cache.match(asset.url);
      if(hit)sum+=Number(hit.headers.get('content-length'))||asset.bytes;
      else sum+=0;
    }
    return sum;
  }

  async function download({onProgress}={}){
    if(!isBrowser())throw Error('モデルのダウンロードはブラウザでのみ可能です');
    const cache=await caches.open(M().cacheName);
    const total=M().totalBytes;
    let done=0;
    for(const asset of M().assets){
      if(await cache.match(asset.url)){
        done+=asset.bytes;
        onProgress?.({done,total,asset:asset.id,phase:'cached'});
        continue;
      }
      const response=await fetch(asset.url);
      if(!response.ok)throw Error(`モデルの取得に失敗しました: ${asset.id}`);
      const reader=response.body?.getReader();
      const chunks=[];
      let received=0;
      if(reader){
        while(true){
          const {value,done:finished}=await reader.read();
          if(finished)break;
          chunks.push(value);
          received+=value.length;
          onProgress?.({done:done+received,total,asset:asset.id,phase:'download'});
        }
      }
      const blob=reader?new Blob(chunks):await response.blob();
      done+=asset.bytes;
      const stored=new Response(blob,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(blob.size)}});
      await cache.put(asset.url,stored);
      onProgress?.({done,total,asset:asset.id,phase:'stored'});
    }
    localStorage.setItem(M().storageKey,JSON.stringify({version:M().version,at:Date.now()}));
    onProgress?.({done:total,total,phase:'complete'});
    return true;
  }

  async function assetBuffer(asset){
    const cache=await caches.open(M().cacheName);
    const hit=await cache.match(asset.url);
    if(!hit)throw Error('モデルが未ダウンロードです');
    return hit.arrayBuffer();
  }

  async function allBuffers(){
    const out={};
    for(const asset of M().assets)out[asset.id]=await assetBuffer(asset);
    return out;
  }

  root.KanadeOmrMlCache={isReady,download,downloadedBytes,allBuffers,assetBuffer};
})(globalThis);