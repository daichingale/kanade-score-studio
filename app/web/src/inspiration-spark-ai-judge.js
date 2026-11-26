/* Optional Ollama judge for inspiration phrases — critique only, never edits notes. */
(function(root,factory){
 const api=factory(
   root.KanadeCore||(typeof require==='function'?require('./core.js'):null)
 );
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeInspirationSparkJudge=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
 'use strict';
 const JUDGE_TIMEOUT_MS=8000;
 const AI_DROP=4;
 const cache=new Map();
 const SYSTEM_PROMPT='吹奏楽フレーズの審査員。音符の生成や編集はしない。入力JSONの各フレーズについて musicality 1-10, singable, reason(日本語20字以内)だけを返す。出力はJSON配列のみ。';
 function encodeDuration(den,dots){
  const map={1:'w',2:'h',4:'q',8:'e',16:'s',32:'t'};
  return (map[den]||String(den))+(dots?'.':'');
 }
 function encodePitch(p){
  const alter=p.alter===1?'♯':p.alter===-1?'♭':'';
  return `${p.step}${alter}${p.octave}`;
 }
 function encodePhraseForJudge(card,ctx){
  const cap=C.measureTicks(ctx.time);
  const rows=[];
  for(const item of card.fragment){
   const bar=Math.floor(item.offset/cap);
   const chord=ctx.timeline[bar%ctx.timeline.length]?.symbol||'?';
   let row=rows.find(r=>r.b===bar);
   if(!row){row={b:bar,c:chord,n:[]};rows.push(row);}
   row.n.push(`${encodePitch(item.event.pitches[0])}${encodeDuration(item.event.den,item.event.dots||0)}`);
  }
  rows.sort((a,b)=>a.b-b.b);
  return {id:card.id,k:ctx.fifths,m:ctx.mode,bars:rows};
 }
 function buildJudgePrompt(cards,ctx){
  const payload=cards.map(card=>encodePhraseForJudge(card,ctx));
  return JSON.stringify({key:ctx.fifths,mode:ctx.mode,time:ctx.time,phrases:payload});
 }
 function parseJudgeResponse(text){
  const raw=String(text||'').trim();
  const match=raw.match(/\[[\s\S]*\]/);
  if(!match)throw new Error('JSONが見つかりません');
  const data=JSON.parse(match[0]);
  if(!Array.isArray(data))throw new Error('配列ではありません');
  return data.map(row=>({
   id:String(row.id),
   musicality:Math.max(1,Math.min(10,Math.round(Number(row.musicality)))),
   singable:row.singable===true||row.singable==='true',
   reason:String(row.reason||'').slice(0,20)
  })).filter(row=>row.id);
 }
 function phraseHash(card){
  const midis=card.fragment.map(item=>C.pitchMidi(item.event.pitches[0]));
  const rhythm=card.fragment.map(item=>`${item.event.den}.${item.event.dots||0}@${item.offset}`).join(';');
  return `${card.label}:${midis.join('-')}:${rhythm}`;
 }
 function combineRank(ruleQuality,musicality){return ruleQuality+(Number(musicality)||0)*10;}
 function applyJudgments(cards,judgments){
  const map=new Map(judgments.map(j=>[j.id,j]));
  const enriched=[];
  for(const card of cards){
   const j=map.get(card.id);
   if(!j)continue;
   if(j.musicality<=AI_DROP)continue;
   const hash=phraseHash(card);
   cache.set(hash,j);
   enriched.push({
    ...card,
    aiMusicality:j.musicality,
    aiSingable:j.singable,
    aiReason:j.reason,
    finalRank:combineRank(card.quality||0,j.musicality)
   });
  }
  enriched.sort((a,b)=>b.finalRank-a.finalRank);
  return enriched;
 }
 function mergeCached(cards){
  const need=[],hit=[];
  for(const card of cards){
   const cached=cache.get(phraseHash(card));
   if(cached)hit.push({...card,aiMusicality:cached.musicality,aiSingable:cached.singable,aiReason:cached.reason,finalRank:combineRank(card.quality||0,cached.musicality)});
   else need.push(card);
  }
  return {need,hit};
 }
 async function judgePhrases(cards,ctx,{enabled=true,postChat,model,timeoutMs=JUDGE_TIMEOUT_MS}={}){
  const ruleOnly=list=>list.map(c=>({...c,finalRank:c.quality??0})).sort((a,b)=>b.finalRank-a.finalRank);
  if(!enabled||!cards?.length||typeof postChat!=='function')return {cards:ruleOnly(cards),aiActive:false};
  const {need,hit}=mergeCached(cards);
  let judged=hit.filter(c=>(c.aiMusicality??0)>AI_DROP);
  if(!need.length)return {cards:[...judged].sort((a,b)=>b.finalRank-a.finalRank),aiActive:hit.length>0};
  const batch=need.slice(0,12);
  const user=buildJudgePrompt(batch,ctx);
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
   const response=await postChat({
    model:model||'qwen2.5:3b',
    stream:false,
    options:{temperature:0,num_predict:512},
    messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:user}]
   },controller?{signal:controller.signal}:{});
   if(timer)clearTimeout(timer);
   if(!response?.ok)throw new Error('judge http '+response.status);
   const body=await response.json();
   const text=body?.message?.content||'';
   const rows=parseJudgeResponse(text);
   judged=judged.concat(applyJudgments(batch,rows));
  }catch{
   if(timer)clearTimeout(timer);
   return {cards:ruleOnly(cards),aiActive:false};
  }
  const merged=[...judged,...hit.filter(c=>(c.aiMusicality??0)>AI_DROP&&!judged.some(j=>j.id===c.id))];
  if(!merged.length)return {cards:ruleOnly(cards).slice(0,cards.length),aiActive:false};
  merged.sort((a,b)=>b.finalRank-a.finalRank);
  return {cards:merged,aiActive:true};
 }
 function clearJudgeCache(){cache.clear();}
 return {
  JUDGE_TIMEOUT_MS,AI_DROP,SYSTEM_PROMPT,encodePhraseForJudge,buildJudgePrompt,parseJudgeResponse,phraseHash,
  combineRank,applyJudgments,judgePhrases,clearJudgeCache
 };
});