/* Optional Ollama: flag suspicious measures (local dev proxy or direct). */
(function(root){
  'use strict';

  async function flagBars(notes,scoreMeta={}){
    if(!root.__KANADE_DEV__)return [];
    const Agent=root.KanadeAgent;
    if(!Agent?.postChat)return [];
    try{
      const health=await fetch('/__agent/health',{signal:AbortSignal.timeout(1200)});
      if(!health.ok)return [];
    }catch{return [];}
    const low=notes.filter(note=>(note.confidence??1)<0.72).slice(0,12);
    if(!low.length)return [];
    const prompt=`以下はOMRの低信頼度音符です。要確認の小節番号だけをJSON配列で返してください。\n${JSON.stringify(low.map(n=>({mi:n.mi,tick:n.tick,pitch:n.pitch,den:n.den,conf:n.confidence})))}`;
    const res=await Agent.postChat({
      model:'llama3.2:1b',
      messages:[{role:'user',content:prompt}],
      stream:false
    },{signal:AbortSignal.timeout(8000)}).catch(()=>null);
    if(!res?.ok)return low.map(n=>n.mi||0);
    const json=await res.json().catch(()=>null);
    const text=json?.message?.content||'';
    const found=[...text.matchAll(/\d+/g)].map(m=>Number(m[0]));
    return found.length?found:low.map(n=>n.mi||0);
  }

  root.KanadeOmrReviewAi={flagBars};
})(globalThis);