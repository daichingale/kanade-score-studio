/* Discover Kanade dev server PC OMR endpoint on LAN or localhost. */
(function(root){
  'use strict';
  const KEY='kanade.omr.pc.origin';

  function storedOrigin(){
    try{return localStorage.getItem(KEY)||'';}catch{return '';}
  }

  function saveOrigin(origin){
    try{if(origin)localStorage.setItem(KEY,origin);}catch{}
  }

  async function ping(origin){
    const url=new URL('/__omr/status',origin);
    const res=await fetch(url,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(2500)});
    if(!res.ok)throw Error('status failed');
    const json=await res.json();
    if(!json.ok)throw Error('engine offline');
    return json;
  }

  async function discover(){
    const candidates=new Set();
    if(location.origin)candidates.add(location.origin);
    const saved=storedOrigin();
    if(saved)candidates.add(saved);
    for(const origin of candidates){
      try{
        const status=await ping(origin);
        saveOrigin(origin);
        return {origin,status};
      }catch{}
    }
    return null;
  }

  async function recognize({bytes,mime,filename,engine='auto'}){
    const found=await discover();
    if(!found)throw Error('PC の OMR エンジンが見つかりません（開発サーバーを HOST=0.0.0.0 で起動し、同じ Wi‑Fi から開いてください）');
    let dataBase64='';
    const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk){
      dataBase64+=String.fromCharCode(...bytes.subarray(i,i+chunk));
    }
    dataBase64=btoa(dataBase64);
    const res=await fetch(new URL('/__omr/recognize',found.origin),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mime,dataBase64,filename,engine}),
      signal:AbortSignal.timeout(180000)
    });
    const json=await res.json();
    if(!res.ok||!json.ok)throw Error(json.error||'PC OMR に失敗しました');
    return {...json,origin:found.origin};
  }

  root.KanadeOmrPcClient={discover,ping,recognize,storedOrigin,saveOrigin};
})(globalThis);