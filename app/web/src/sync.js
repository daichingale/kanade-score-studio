/* Conditional measure patches. A conflicting edit is never silently replaced. */
(function(root,factory){const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.KanadeSync=api;})(globalThis,function(C){
 'use strict';
 const fields=['title','composer','instrument','instrumentKey','customInstrumentName','clef','time','meterTail','key','tempo','sound','staffLines','transposition','notehead','printName','shortName','publication','ensembleParts','clipBank','sceneLinks'];
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),clone=v=>v===undefined?null:C.copy(v);
 function diff(before,after){
  if(before.id!==after.id)throw Error('共同編集から退出してから別の楽譜を開いてください');
  const patch={fields:[],measures:[],order:null};
  for(const key of fields)if(!same(before[key],after[key]))patch.fields.push({key,before:clone(before[key]),after:clone(after[key])});
  const old=new Map(before.measures.map(m=>[m.id,m])),next=new Map(after.measures.map(m=>[m.id,m]));
  for(const id of new Set([...old.keys(),...next.keys()]))if(!same(old.get(id),next.get(id)))patch.measures.push({id,before:clone(old.get(id)),after:clone(next.get(id))});
  const a=before.measures.map(m=>m.id),b=after.measures.map(m=>m.id);if(!same(a,b))patch.order={before:a,after:b};return patch;
 }
 function mergeVoices(current,before,after){
  if(!current||!before||!after)return null;
  const {events,voice2,...metadata}=current;
  const {events:beforeFirst,voice2:beforeSecond,...beforeMetadata}=before;
  const {events:afterFirst,voice2:afterSecond,...afterMetadata}=after;
  if(!same(metadata,beforeMetadata)||!same(metadata,afterMetadata))return null;
  const firstChanged=!same(beforeFirst,afterFirst),secondChanged=!same(beforeSecond,afterSecond);
  if(firstChanged===secondChanged)return null;
  if(firstChanged&&!same(events,beforeFirst)&&!same(events,afterFirst)||
     secondChanged&&!same(voice2,beforeSecond)&&!same(voice2,afterSecond))return null;
  const second=secondChanged?afterSecond:voice2;
  const bar={...current,events:firstChanged?afterFirst:events};
  if(second===undefined)delete bar.voice2;else bar.voice2=second;
  return bar;
 }
 function merge(score,patch){
  if(!patch||!Array.isArray(patch.fields)||!Array.isArray(patch.measures)||patch.fields.length>fields.length||patch.measures.length>500)throw Error('変更データが不正です');
  const next={...score,measures:score.measures.slice()},conflicts=[];
  for(const item of patch.fields){
   if(!fields.includes(item.key))throw Error('変更できない設定です');
   const current=clone(score[item.key]);
   if(item.key==='ensembleParts'&&!same(current,item.before)&&!same(current,item.after)&&Array.isArray(current)&&Array.isArray(item.before)&&Array.isArray(item.after)){
    const ids=parts=>parts.map(part=>part?.id);
    if(same(ids(current),ids(item.before))&&same(ids(current),ids(item.after))){
     next.ensembleParts=current.map((part,i)=>{
      const previous=item.before[i],updated=item.after[i];
      if(same(previous,updated))return part;
      const result=merge(part,diff(previous,updated));
      conflicts.push(...result.conflicts);
      return result.score;
     });
    }else conflicts.push(item.key);
   }else if(!same(current,item.before)&&!same(current,item.after))conflicts.push(item.key);
   else if(item.after===null)delete next[item.key];else next[item.key]=C.copy(item.after);
  }
  const measures=new Map(score.measures.map(m=>[m.id,m]));
  for(const item of patch.measures){
   if(typeof item.id!=='string'||(item.after&&item.after.id!==item.id))throw Error('小節の変更が不正です');
   const current=clone(measures.get(item.id));
   if(!same(current,item.before)&&!same(current,item.after)){
    const mixed=mergeVoices(current,item.before,item.after);
    if(mixed)measures.set(item.id,C.copy(mixed));else conflicts.push(item.id);
   }
   else if(item.after===null)measures.delete(item.id);else measures.set(item.id,C.copy(item.after));
  }
  const currentOrder=score.measures.map(m=>m.id);
  if(patch.order){if(!Array.isArray(patch.order.before)||!Array.isArray(patch.order.after)||patch.order.after.length>500)throw Error('小節順が不正です');if(!same(currentOrder,patch.order.before)&&!same(currentOrder,patch.order.after))conflicts.push('小節順');}
  if(conflicts.length)return {score,conflicts};
  const order=patch.order?.after||currentOrder;if(order.length!==measures.size||new Set(order).size!==order.length||order.some(id=>!measures.has(id)))throw Error('小節順が一致しません');
  next.measures=order.map(id=>measures.get(id));const errors=C.validateScore(next);if(errors.length)throw Error(errors[0]);return {score:next,conflicts:[]};
 }
 // Older clients can still submit a bass edit against a room with no stored bass.
 function part(score,name){
  if(name==='bass'){
   const bass=score.bassPart||{
    schema:score.schema,id:'bass:'+score.id,instrument:'ベース',sound:'ピアノ',clef:'bass',
    measures:score.measures.map(m=>({id:'bass:'+m.id,events:[]}))
   };
   return {...bass,title:score.title,composer:score.composer,time:score.time,key:score.key,tempo:score.tempo,
     ...(score.meterTail?{meterTail:score.meterTail,measures:bass.measures.map((bar,mi)=>({...bar,time:C.timeAt(score,mi)}))}:{})};
  }
  const {bassPart,...melody}=score;return melody;
 }
 function peerPosition(score,peer){
  const parts=score.bassPart?[part(score,'melody'),part(score,'bass')]:C.scoreParts(score);
  const specified=parts.find(candidate=>candidate.id===peer.partId);
  const track=specified||parts.find(candidate=>candidate.measures.some(bar=>bar.id===peer.measureId));
  if(!track)return null;
  return {part:track,measure:track.measures.findIndex(bar=>bar.id===peer.measureId)};
 }
 function replacePart(score,name,next){
  if(name==='bass')return {...score,bassPart:next};
  return score.bassPart?{...next,bassPart:score.bassPart}:next;
 }
 function mergeRoom(score,patch,name='melody'){
  if(!['melody','bass'].includes(name))throw Error('パートが不正です');
  if(name==='bass'&&patch?.fields?.some(item=>['title','composer','time','meterTail','key','tempo','publication'].includes(item.key)))throw Error('曲名・拍子・調号・テンポはメロディー側で変更してください');
  const merged=merge(part(score,name),patch);
  if(merged.conflicts.length)return {score,conflicts:merged.conflicts};
  const next=replacePart(score,name,merged.score);
  if(next.bassPart){
   const errors=C.validateScore(part(next,'bass'));
   if(errors.length)throw Error('ベースの譜面を確認してください。'+errors[0]);
  }
  return {score:next,conflicts:[]};
 }
 function inverse(patch){return {fields:patch.fields.map(i=>({...i,before:i.after,after:i.before})),measures:patch.measures.map(i=>({...i,before:i.after,after:i.before})),order:patch.order?{before:patch.order.after,after:patch.order.before}:null};}
 const empty=p=>!p.fields.length&&!p.measures.length&&!p.order;
 return {diff,merge,mergeRoom,part,replacePart,peerPosition,inverse,empty};
});
