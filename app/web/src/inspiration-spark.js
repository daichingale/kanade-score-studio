/* Composition inspiration: seeded rolls, motifs, variations, local history. */
(function(root,factory){
 const api=factory(
   root.KanadeCore||(typeof require==='function'?require('./core.js'):null),
   root.KanadePerformance||(typeof require==='function'?require('./performance.js'):null),
   root.KanadePopProgression||(typeof require==='function'?require('./pop-progression.js'):null),
   root.KanadeEditing||(typeof require==='function'?require('./editing.js'):null)
 );
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeInspirationSpark=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,P,Pop,B){
 'use strict';
 const HISTORY_KEY='kanade.inspiration.history.v1';
 const HISTORY_LIMIT=24;
 const MOODS=['明るい','切ない','勇ましい','ミステリアス','穏やか','軽快','荘厳','切迫'];
 const KEYS=[-4,-3,-2,-1,0,1,2,3,4];
 const TEMPLATES_BY_MOOD={
  '明るい':['I-V-vi-IV','I-vi-IV-V','komuro'],
  '切ない':['vi-IV-I-V','I-vi-IV-V','canon'],
  '勇ましい':['IV-V-iii-vi','I-IV-V-IV','I-V-vi-IV'],
  'ミステリアス':['ii-V-I','canon','IV-V-iii-vi'],
  '穏やか':['I-vi-IV-V','vi-IV-I-V'],
  '軽快':['I-V-vi-IV','komuro'],
  '荘厳':['canon','ii-V-I'],
  '切迫':['IV-V-iii-vi','ii-V-I']
 };
 const TIMES_BY_MOOD={
  '明るい':[{num:4,den:4},{num:2,den:2}],
  '切ない':[{num:3,den:4},{num:4,den:4}],
  '勇ましい':[{num:4,den:4},{num:2,den:2}],
  'ミステリアス':[{num:6,den:8},{num:3,den:4}],
  '穏やか':[{num:4,den:4},{num:3,den:4}],
  '軽快':[{num:2,den:2},{num:4,den:4}],
  '荘厳':[{num:4,den:4},{num:3,den:4}],
  '切迫':[{num:4,den:4},{num:5,den:4}]
 };
 const SCENE_PROMPTS=[
  '吹奏楽のパレード風に','静かな朝の連絡曲から','ソロと伴奏の対話','低音だけで布を敷く','呼びのフレーズから入る',
  'サビ前の溜め','鐘と木管の披露','マーチの中間休憩風','合唱向けの歌いやすい音程','窓辺の三拍子'
 ];
 const CONSTRAINTS=[
  'この曲は3拍子で','サビはサブドミナントマイナーから','低音楽器だけで始める','木管メロディ・金管用IV度',
  'トリオで拍を抜く','コルネットに歌うフレーズ','転調は1回だけ','終始ppからfへ','第2パートは ostinato',
  '外音は1音まで','管と打のダイアローグ','短調っぽくでも属七を一度'
 ];
 function mulberry32(seed){
  let state=seed>>>0;
  return ()=>{
   state=state+0x6d2b79f5|0;
   let t=Math.imul(state^(state>>>15),state|1);
   t=(t+Math.imul(t^(t>>>7),t|61))^t;
   return ((t^(t>>>14))>>>0)/4294967296;
  };
 }
 function pick(rng,list){return list[Math.floor(rng()*list.length)];}
 function tempoFor(mood,rng){
  const span={明るい:[96,128],切ない:[68,96],勇ましい:[112,156],ミステリアス:[76,108],穏やか:[72,104],軽快:[108,140],荘厳:[60,92],切迫:[100,138]}[mood]||[80,120];
  return Math.round(span[0]+rng()*(span[1]-span[0]));
 }
 function keyFor(mood,rng){
  const fifths=pick(rng,KEYS);
  const minor=['切ない','ミステリアス','切迫'].includes(mood);
  if(minor&&fifths>0)return -fifths;
  if(!minor&&fifths<0&&rng()>.35)return Math.abs(fifths);
  return fifths;
 }
 function modeFor(fifths,mood){return ['切ない','ミステリアス','切迫'].includes(mood)||fifths<0?'minor':'major';}
 function rollProgression(rng,fifths,mode,mood,bars){
  const templates=TEMPLATES_BY_MOOD[mood]||Pop.TEMPLATE_KEYS;
  const template=pick(rng,templates);
  const romans=Pop.progressionForTemplate(template,bars);
  const timeline=romans.map(roman=>({roman,symbol:Pop.romanToSymbol(roman,fifths,mode)}));
  return {template,romans,timeline};
 }
 function generateMotif(timeline,time,fifths,mode,bars,rng){
  const cap=C.measureTicks(time);
  const beats=time.num*(4/time.den);
  const beatTicks=cap/beats;
  const den=beats>=6?8:4;
  const notes=[];
  let last=60;
  for(let bar=0;bar<bars;bar++){
   const chord=timeline[bar%timeline.length]?.symbol||'C';
   const pool=P.chordPitches(chord,5);
   for(let beat=0;beat<Math.min(beats,4);beat++){
    if(beat>0&&rng()<.25)continue;
    const pickPitch=pool[Math.floor(rng()*pool.length)]||pool[0];
    const midi=C.pitchMidi(pickPitch);
    const lean=midi>last?-2:2;
    if(rng()<.4)last=Math.max(55,Math.min(84,midi+lean));
    else last=midi;
    const pitch=P.fromMidi(last,fifths);
    const tick=Math.round(beat*beatTicks);
    notes.push({bar,tick,den,dots:0,pitch,chord});
   }
  }
  return {bars,den,notes};
 }
 function emptyLocks(){return {key:false,tempo:false,rhythm:false,progression:false,motif:false,mood:false};}
 function rollSpark(seed,prev=null,locks=emptyLocks()){
  const rng=mulberry32(seed>>>0);
  const mood=locks.mood&&prev?prev.mood:pick(rng,MOODS);
  const key=locks.key&&prev?prev.key:keyFor(mood,rng);
  const mode=locks.key&&prev?.mode?prev.mode:modeFor(key,mood);
  const tempo=locks.tempo&&prev?prev.tempo:tempoFor(mood,rng);
  const time=locks.rhythm&&prev?prev.time:pick(rng,TIMES_BY_MOOD[mood]||[{num:4,den:4}]);
  const bars=2+Math.floor(rng()*3);
  const progression=locks.progression&&prev?{...prev.progression}:rollProgression(rng,key,mode,mood,bars);
  const motif=locks.motif&&prev?{...prev.motif,notes:prev.motif.notes.map(n=>({...n}))}:generateMotif(progression.timeline,time,key,mode,bars,rng);
  const scene=pick(rng,SCENE_PROMPTS);
  const constraints=[pick(rng,CONSTRAINTS),pick(rng,CONSTRAINTS)].filter((v,i,a)=>a.indexOf(v)===i);
  return {
   version:1,id:C.uid(),seed:seed>>>0,createdAt:new Date(0+Date.now()).toISOString(),
   mood,key,mode,tempo,time,bars,progression,motif,scene,constraints,locks:{...emptyLocks(),...locks}
  };
 }
 function assemble(doc,parts){
  const [first,...rest]=parts;
  const next={...first};
  if(rest.length)next.ensembleParts=rest;
  const errors=C.validateScore(next);
  if(errors.length)throw new Error(errors[0]);
  return next;
 }
 function ensureBarCount(part,from,bars){
  let next={...part,measures:part.measures.map(b=>({...b,events:[...b.events],directions:[...(b.directions||[])]}))};
  const need=from+bars;
  while(next.measures.length<need)next=C.addMeasure(next);
  return next;
 }
 function clearBars(part,from,bars){
  return {...part,measures:part.measures.map((bar,mi)=>
    mi>=from&&mi<from+bars?{...bar,events:[],directions:(bar.directions||[]).filter(d=>d.key!=='chordSymbol')}:bar)};
 }
 function writeMotifPart(part,from,motif,fifths){
  let next=part;
  for(const note of motif.notes){
   const mi=from+note.bar;
   const event=C.makeNote(note.pitch,note.den,note.dots||0);
   next=C.placeEventsAt(next,mi,note.tick,[event],{overwrite:false}).score;
   const bar=next.measures[mi];
   const dirs=[...(bar.directions||[])];
   if(note.tick===0&&!dirs.some(d=>d.key==='chordSymbol'&&d.tick===0))dirs.push({key:'chordSymbol',tick:0,text:note.chord||''});
   next.measures[mi]={...bar,directions:dirs.sort((a,b)=>a.tick-b.tick)};
  }
  return next;
 }
 function writeChordDirections(part,from,timeline){
  let next=part;
  for(let i=0;i<timeline.length;i++){
   const mi=from+i;if(!next.measures[mi])break;
   const symbol=timeline[i].symbol;
   const bar=next.measures[mi];
   const dirs=[...(bar.directions||[]).filter(d=>d.key!=='chordSymbol')];
   dirs.push({key:'chordSymbol',tick:0,text:symbol});
   next.measures[mi]={...bar,directions:dirs.sort((a,b)=>a.tick-b.tick)};
  }
  return next;
 }
 function applySparkDocument(doc,spark,options={}){
  const from=(options.from||1)-1;
  const partIndex=(options.part||1)-1;
  const parts=C.scoreParts(doc).map(p=>({...p,key:spark.key,tempo:spark.tempo,time:spark.time}));
  let part=ensureBarCount(parts[partIndex],from,spark.bars);
  part=clearBars(part,from,spark.bars);
  part=writeChordDirections(part,from,spark.progression.timeline);
  part=writeMotifPart(part,from,spark.motif,spark.key);
  parts[partIndex]=part;
  let next=assemble(doc,parts);
  const meterFrom=from;
  try{next=C.setMeter(next,meterFrom,[spark.time],spark.bars);}catch{}
  next=C.withSettings(next,{tempo:spark.tempo,time:spark.time,key:spark.key});
  if(next.ensembleParts)next.ensembleParts=next.ensembleParts.map(p=>({...p,key:spark.key,tempo:spark.tempo,time:spark.time}));
  return {document:next,summary:`ひらめきを採用（${spark.mood}・${spark.bars}小節）`,focusPart:partIndex};
 }
 function fragmentFromRange(score,start,end){
  const spans=B.entries(score,start,end,false).filter(s=>s.event.type==='note');
  if(!spans.length)return null;
  const origin=spans[0].start;
  return spans.map(s=>({offset:s.start-origin,event:C.copy(s.event)}));
 }
 function invertFragment(fragment){
  const base=C.pitchMidi(fragment[0].event.pitches[0]);
  return fragment.map(item=>{
   const midi=C.pitchMidi(item.event.pitches[0]);
   const delta=base-midi;
   const inv=base+delta;
   const pitch=P.fromMidi(inv,0);
   return {...item,event:{...item.event,pitches:C.normalizeChord([pitch])}};
  });
 }
 function retrogradeFragment(fragment){
  const reversed=[...fragment].reverse();
  const end=fragment.at(-1).offset+C.durationTicks(fragment.at(-1).event.den,fragment.at(-1).event.dots||0);
  return reversed.map(item=>({...item,offset:end-item.offset-C.durationTicks(item.event.den,item.event.dots||0)}));
 }
 function sequenceFragment(fragment,steps){
  return fragment.map(item=>{
   const p=item.event.pitches[0];
   const n=C.diatonicNumber(p)+steps;
   const pitch={...p,step:C.STEPS[((n%7)+7)%7],octave:Math.floor(n/7)-1};
   return {...item,event:{...item.event,pitches:C.normalizeChord([pitch])}};
  });
 }
 function scaleDurationFragment(fragment,factor){
  return fragment.map(item=>{
   const den=Math.min(64,Math.max(1,Math.round(item.event.den*factor)));
   return {...item,event:{...item.event,den}};
  });
 }
 function variationDescriptors(fragment){
  if(!fragment?.length)return [];
  return [
   {id:'inversion',label:'転回',fragment:invertFragment(fragment)},
   {id:'retrograde',label:'逆行',fragment:retrogradeFragment(fragment)},
   {id:'sequenceUp',label:'上行順次',fragment:sequenceFragment(fragment,2)},
   {id:'sequenceDown',label:'下行順次',fragment:sequenceFragment(fragment,-2)},
   {id:'augment',label:'音価拡大',fragment:scaleDurationFragment(fragment,.5)},
   {id:'diminish',label:'音価縮小',fragment:scaleDurationFragment(fragment,2)}
  ];
 }
 function applyFragment(part,fromTick,fragment){
  let next=part;
  const offsets=C.measureOffsets(part);
  for(const item of fragment){
   const abs=fromTick+item.offset;
   const {mi,tick}=C.locateTick(offsets,abs);
   const event=C.copy(item.event);event.id=C.uid();
   event.pitches=event.pitches.map(p=>({...p,id:C.uid()}));
   next=C.placeEventsAt(next,mi,tick,[event],{overwrite:false}).score;
  }
  return next;
 }
 function previewSequence(spark){
  const rows=[];
  for(const note of spark.motif.notes){
   const beat=spark.motif.den;
   rows.push({kind:'note',symbol:note.chord,pitch:note.pitch,den:beat});
  }
  for(const {symbol} of spark.progression.timeline)rows.push({kind:'chord',symbol,den:1});
  return rows;
 }
 function pushHistory(spark){
  try{
   const list=loadHistory();
   list.unshift({id:spark.id,createdAt:spark.createdAt,mood:spark.mood,key:spark.key,tempo:spark.tempo,
     template:spark.progression.template,seed:spark.seed,time:spark.time,bars:spark.bars});
   localStorage.setItem(HISTORY_KEY,JSON.stringify({version:1,items:list.slice(0,HISTORY_LIMIT)}));
  }catch{}
 }
 function loadHistory(){
  try{
   const raw=JSON.parse(localStorage.getItem(HISTORY_KEY)||'null');
   if(raw?.version===1&&Array.isArray(raw.items))return raw.items;
  }catch{}
  return [];
 }
 return {
  HISTORY_KEY,MOODS,SCENE_PROMPTS,CONSTRAINTS,mulberry32,rollSpark,applySparkDocument,variationDescriptors,fragmentFromRange,
  applyFragment,previewSequence,pushHistory,loadHistory,emptyLocks
 };
});