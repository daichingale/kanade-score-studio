/* Ensemble proposals, migration, and redistribution for the local assistant. */
(function(root,factory){
 const C=root.KanadeCore||(typeof require==='function'?require('./core.js'):null);
 const I=root.KanadeInstruments||(typeof require==='function'?require('./instruments.js'):null);
 const Arrange=root.KanadeArrange||(typeof require==='function'?require('./agent-arrange.js'):null);
 const api=factory(C,I,Arrange);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeAgentEnsemble=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,I,Arrange){
 'use strict';
 let lastProposal=null;
 function fail(message){throw new Error(message);}
 function partsOf(doc){return C.scoreParts(doc);}
 function templateKeys(id){
  const template=I.templates.find(item=>item.id===id);
  if(!template)fail(`編成テンプレート「${id}」はありません`);
  return template.keys.slice();
 }
 function summaryKeys(keys){
  const lines=new Map();
  for(const key of keys){
   const name=I.byKey.get(key)?.name||key;
   lines.set(name,(lines.get(name)||0)+1);
  }
  return [...lines].map(([name,count])=>count>1?`${name}×${count}`:name).join('、');
 }
 function pickTemplates(args){
  const style=String(args.style||args.mood||'').toLowerCase();
  if(/march|マーチ/.test(style))return ['marching','schoolMarching','marchBattery'];
  if(/small|小編/.test(style))return ['smallWind','schoolWind','wind'];
  if(/brass|金管/.test(style))return ['brassBand','brassQuintet','brassTrio'];
  if(/symphony|シンフォ/.test(style))return ['windSymphony','wind','smallWind'];
  return ['smallWind','wind','marching'];
 }
 function buildOptions(doc,args={}){
  const level=Arrange.levelOf(args.level);
  const templates=pickTemplates(args);
  const planned=Arrange.plan(args);
  const options=[];
  templates.forEach((id,index)=>{
   const template=I.templates.find(item=>item.id===id);
   if(!template)return;
   options.push({
    id:`template-${index+1}`,
    title:template.name,
    reason:`テンプレート「${template.name}」。定番のパート並びで、編成変更が分かりやすいです。`,
    kind:'template',
    templateId:id,
    keys:template.keys,
    level,
    partCount:template.keys.length
   });
  });
  options.push({
   id:'planned-custom',
   title:`カスタム編成（${planned.keys.length}人）`,
   reason:planned.reasons.slice(0,2).join(' ')||planned.summary.split('\n')[0],
   kind:'keys',
   keys:planned.keys,
   level,
   partCount:planned.keys.length
  });
  if(planned.keys.length>10){
   const compact=Arrange.plan({...args,headcount:Math.max(8,Math.min(14,Number(args.headcount)||12))});
   options.push({
    id:'planned-compact',
    title:`コンパクト編成（${compact.keys.length}人）`,
    reason:'人数を抑えつつ木管・金管・打のバランスを残した案です。',
    kind:'keys',
    keys:compact.keys,
    level,
    partCount:compact.keys.length
   });
  }
  const uniq=[];
  const seen=new Set();
  for(const option of options){
   const key=option.templateId||option.keys.join('|');
   if(seen.has(key)||uniq.length>=3)continue;
   seen.add(key);
   uniq.push(option);
  }
  lastProposal={docId:doc?.id||'',created:Date.now(),options:uniq};
  return {
   options:uniq,
   summary:['編成の候補を3案用意しました。チャットのボタンで1つ選んでから適用できます。',...uniq.map((item,index)=>`${index+1}. ${item.title}（${item.partCount}パート）\n   ${item.reason}`)].join('\n')
  };
 }
 function optionById(optionId){
  if(!lastProposal?.options?.length)fail('先に proposeEnsembleOptions で候補を出してください');
  const option=lastProposal.options.find(item=>item.id===optionId);
  if(!option)fail(`候補「${optionId}」が見つかりません`);
  return option;
 }
 function roleScore(part){
  const key=part.instrumentKey||I.profile(part)?.key||'';
  if(/flute|piccolo|oboe|clarinet|trumpet|sax/i.test(key))return 3;
  if(/horn|alto|mellophone/i.test(key))return 2;
  if(/trombone|euphonium|baritone/i.test(key))return 1;
  if(/tuba|contrabass|bassoon|bass/i.test(key))return 0;
  if(part.clef==='percussion')return -1;
  return 1;
 }
 function transferBar(source,target,mi,level){
  const src=source.measures[mi],dst=target.measures[mi];
  if(!src?.events?.length)return dst;
  if(dst.events.some(event=>event.type==='note'))return dst;
  const events=src.events.map(event=>{
   if(event.type!=='note')return C.makeRest(event.den,event.dots);
   const concert=C.pitchMidi(event.pitches[0])+Arrange.offsetOf(source.transposition,source.clef);
   const written=Arrange.writtenFromConcert(target,concert,level);
   return C.makeNote({...Arrange.spell(written,(target.key||0)>=0)},event.den,event.dots);
  });
  return {...dst,events};
 }
 function migrateMusic(oldParts,newParts,level){
  const next=newParts.map(part=>({...part,measures:part.measures.map(bar=>({...bar,events:bar.events.slice()}))}));
  for(const source of oldParts){
   const has=source.measures.some(bar=>bar.events.some(event=>event.type==='note'));
   if(!has)continue;
   let targetIndex=next.findIndex(part=>(part.instrumentKey||I.profile(part)?.key)===(source.instrumentKey||I.profile(source)?.key));
   if(targetIndex<0)targetIndex=next.map((part,index)=>({index,score:roleScore(part)})).sort((a,b)=>b.score-a.score)[0]?.index??-1;
   if(targetIndex<0)continue;
   const bars=Math.max(source.measures.length,next[targetIndex].measures.length,next[0].measures.length);
   while(next[targetIndex].measures.length<bars)next[targetIndex]=C.addMeasure(next[targetIndex]);
   for(let mi=0;mi<bars;mi++)next[targetIndex].measures[mi]=transferBar(source,next[targetIndex],mi,level);
  }
  return next;
 }
 function concertOf(doc){
  const pitched=partsOf(doc).find(part=>part.clef!=='percussion');
  return pitched?(pitched.key||0)-(I.fifths[pitched.transposition]||0):0;
 }
 function applyOption(doc,option,{preserveMusic=true,level='中級'}={}){
  const concert=concertOf(doc);
  const measureSeed=partsOf(doc)[0]?.measures||C.createScore().measures;
  const created=(option.keys||templateKeys(option.templateId)).map((key,index)=>{
   const blank={...C.createScore(),measures:measureSeed.map(bar=>({id:C.uid(),events:[],...(bar.time?{time:{...bar.time}}:{})}))};
   return {...blank,instrument:I.byKey.get(key).name,instrumentKey:key,clef:I.byKey.get(key).clef,staffLines:I.byKey.get(key).staffLines,
    sound:I.byKey.get(key).sound,transposition:I.byKey.get(key).transposition,key:(()=>{const item=I.byKey.get(key);return item.clef==='percussion'?0:(concert+(I.fifths[item.transposition]||0));})(),
    title:doc.title,composer:doc.composer,tempo:doc.tempo,time:doc.time,...(doc.meterTail?{meterTail:doc.meterTail}:{})};
  });
  const old=partsOf(doc);
  const migrated=preserveMusic?migrateMusic(old,created,Arrange.levelOf(level)):created;
  const [first,...ensembleParts]=I.numberParts(migrated,migrated.map((_,index)=>index));
  const next={...first,ensembleParts,...(doc.publication?{publication:doc.publication}:{})};
  const errors=C.validateScore(next);
  if(errors.length)fail(errors[0]);
  const report=Arrange.reportProblems(migrated,Arrange.levelOf(level));
  return {document:next,focusPart:0,summary:`「${option.title}」に変更しました（${migrated.length}パート）。${preserveMusic?'既存の旋律はできるだけ移しました。':''}\n${report}`,ensembleChange:true};
 }
 function reorderParts(doc,order){
  if(!Array.isArray(order)||order.length<2)fail('order に並べ替えるパート番号を2つ以上指定してください');
  const parts=partsOf(doc);
  const indices=order.map((value,at)=>{const n=Number(value);if(!Number.isInteger(n)||n<1||n>parts.length)fail(`${at+1}番目のパート番号が不正です`);return n-1;});
  if(new Set(indices).size!==indices.length)fail('同じパート番号が重複しています');
  if(indices.length!==parts.length)fail('order には全パートの番号を並べてください');
  const reordered=indices.map(index=>parts[index]);
  const [first,...rest]=reordered;
  const next={...first,ensembleParts:rest,title:first.title,composer:first.composer,tempo:first.tempo,time:first.time,...(first.meterTail?{meterTail:first.meterTail}:{})};
  return {document:next,summary:`パート順を変更しました: ${reordered.map(part=>part.instrument).join(' → ')}`,ensembleChange:true};
 }
 function changePartInstrument(doc,part,instrument){
  const index=typeof part==='number'?part-1:partsOf(doc).findIndex(item=>item.instrument===part||item.instrumentKey===part);
  if(index<0)fail('パートが見つかりません');
  const item=I.byKey.get(instrument)||I.catalog.find(row=>row.name===instrument||row.key===instrument);
  if(!item)fail(`楽器「${instrument}」はカタログにありません`);
  const parts=partsOf(doc).map((row,i)=>{
   if(i!==index)return row;
   const concert=(row.key||0)-(I.fifths[row.transposition]||0);
   const fixed=Arrange.fixPart({...row,instrument:item.name,instrumentKey:item.key,clef:item.clef,staffLines:item.staffLines,sound:item.sound,transposition:item.transposition,key:item.clef==='percussion'?0:concert+(I.fifths[item.transposition]||0)},Arrange.levelOf('中級'));
   return fixed.part;
  });
  const [first,...rest]=parts;
  const next={...first,ensembleParts:rest};
  return {document:next,focusPart:index,summary:`${index+1}番を ${item.name} に変更しました（記譜・移調を合わせて音域も調整）`,ensembleChange:true};
 }
 function targetForRemoval(parts,removeIndex,level){
  let best=-1,score=-1;
  parts.forEach((part,index)=>{
   if(index===removeIndex)return;
   const role=roleScore(parts[removeIndex])-roleScore(part);
   const range=Arrange.rangeFor(part.instrumentKey,Arrange.levelOf(level));
   const bonus=part.measures.some(bar=>bar.events.some(event=>event.type==='note'))?-1:2;
   const total=role*3+bonus;
   if(total>score){score=total;best=index;}
  });
  return best;
 }
 function removePartRedistribute(doc,part,level){
  const parts=partsOf(doc);
  const removeIndex=typeof part==='number'?part-1:parts.findIndex(item=>item.instrument===part||item.instrumentKey===part);
  if(removeIndex<0)fail('パートが見つかりません');
  if(parts.length<2)fail('最後のパートは削除できません');
  const source=parts[removeIndex];
  const targetIndex=targetForRemoval(parts,removeIndex,level);
  let nextParts=parts.map(part=>({...part,measures:part.measures.map(bar=>({...bar,events:bar.events.slice()}))}));
  const targetName=targetIndex>=0?nextParts[targetIndex].instrument:'';
  if(targetIndex>=0){
   const bars=Math.max(source.measures.length,nextParts[targetIndex].measures.length);
   while(nextParts[targetIndex].measures.length<bars)nextParts[targetIndex]=C.addMeasure(nextParts[targetIndex]);
   for(let mi=0;mi<bars;mi++)nextParts[targetIndex].measures[mi]=transferBar(source,nextParts[targetIndex],mi,Arrange.levelOf(level));
  }
  const focusPart=targetIndex>=0?(targetIndex>removeIndex?targetIndex-1:targetIndex):0;
  nextParts=nextParts.filter((_,index)=>index!==removeIndex);
  const [first,...rest]=nextParts;
  const next={...first,ensembleParts:rest};
  return {document:next,focusPart:Math.max(0,focusPart),summary:targetName?`${source.instrument} を削除し、内容を ${targetName} へ移しました。`:`${source.instrument} を削除しました。`,ensembleChange:true};
 }
 return {buildOptions,optionById,applyOption,reorderParts,changePartInstrument,removePartRedistribute,lastProposal:()=>lastProposal,clearProposal:()=>{lastProposal=null;}};
});