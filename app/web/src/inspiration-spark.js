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
 function cloneFragment(fragment){
  return fragment.map(item=>({offset:item.offset,event:C.copy(item.event)}));
 }
 function phraseCard(fragment,label,style,id){
  return {id:id||C.uid(),label,style,fragment:cloneFragment(fragment)};
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
 function ornamentVariations(fragment,rng){
  const out=[];
  for(let pass=0;pass<2;pass++){
   const decorated=[];
   let cursor=0;
   for(const item of fragment){
    decorated.push({...item,offset:cursor});
    cursor=item.offset+C.durationTicks(item.event.den,item.event.dots||0);
    if(rng()<.55){
     const p=item.event.pitches[0];
     const alter=(p.alter||0)+(pass===0?1:-1);
     const neighbor={...p,alter:Math.max(-2,Math.min(2,alter))};
     const graceDen=Math.min(16,item.event.den*2);
     const graceOffset=cursor-Math.floor(C.durationTicks(item.event.den,item.event.dots||0)/3);
     decorated.push({offset:Math.max(0,graceOffset),event:C.makeNote(neighbor,graceDen,0)});
    }
   }
   out.push(phraseCard(decorated,pass===0?'装飾（経過）':'装飾（短縮）','ornament',`orn${pass}`));
  }
  return out;
 }
 function reharmVariations(fragment,ctx,rng){
  if(!fragment?.length)return [];
  const fifths=ctx.fifths,mode=ctx.mode;
  const baseRoman=Pop.symbolToRoman(ctx.timeline[0]?.symbol,fifths,mode)||'I';
  const alts=Pop.rankNext([baseRoman],fifths,mode,5);
  return alts.slice(0,3).map((alt,i)=>{
   const sym=alt.symbol;
   const pool=P.chordPitches(sym,5);
   const mapped=fragment.map(item=>{
    const root=item.event.pitches[0];
    const target=pool.reduce((best,p)=>{
     const d=Math.abs(C.pitchMidi(p)-C.pitchMidi(root));
     return d<(best?.d??99)?{p,d}:best;
    },null)?.p||pool[0];
    const event={...item.event,pitches:C.normalizeChord([target])};
    return {...item,event};
   });
   return phraseCard(mapped,`再和声（${sym}）`,'reharm',`reharm${i}`);
  });
 }
 const PHRASE_PROFILES=[
  {id:'lyrical',label:'歌うメロディ',style:'歌',contour:'arch',octave:5,den:4,density:3,minMidi:60,maxMidi:79},
  {id:'march',label:'マーチの呼び',style:'マーチ',contour:'up',octave:4,den:4,density:4,minMidi:55,maxMidi:72},
  {id:'staccato',label:'軽い8分',style:'軽快',contour:'leap',octave:5,den:8,density:6,minMidi:58,maxMidi:84},
  {id:'brassLow',label:'低音ブラス',style:'低音',contour:'down',octave:3,den:4,density:3,minMidi:48,maxMidi:65},
  {id:'fanfare',label:'ファンファーレ',style:'金管',contour:'leap',octave:5,den:4,density:5,minMidi:60,maxMidi:84},
  {id:'calm',label:'長い音',style:'穏やか',contour:'arch',octave:4,den:2,density:2,minMidi:55,maxMidi:76},
  {id:'clarinet',label:'クラリネット風',style:'木管',contour:'step',octave:5,den:8,density:5,minMidi:62,maxMidi:81},
  {id:'answer',label:'応答フレーズ',style:'対話',contour:'down',octave:4,den:4,density:3,bars:2,minMidi:55,maxMidi:77}
 ];
 function generateProceduralPhrase(ctx,rng,profile){
  const bars=profile.bars||(rng()>.4?2:1);
  const cap=C.measureTicks(ctx.time);
  const notes=[];
  let last=(profile.baseMidi??67);
  for(let bar=0;bar<bars;bar++){
   const sym=ctx.timeline[bar%ctx.timeline.length]?.symbol||'C';
   const pool=P.chordPitches(sym,profile.octave);
   const steps=profile.density||3;
   for(let s=0;s<steps;s++){
    const tick=Math.round((cap/steps)*s);
    let midi;
    if(profile.contour==='up')midi=last+Math.max(1,Math.round(rng()*2));
    else if(profile.contour==='down')midi=last-Math.max(1,Math.round(rng()*2));
    else if(profile.contour==='arch')midi=last+(s<steps/2?1:-1);
    else if(profile.contour==='leap')midi=last+pick(rng,[0,3,4,5,7,-2,-3]);
    else if(profile.contour==='step')midi=C.pitchMidi(pool[Math.floor(rng()*pool.length)]);
    else midi=C.pitchMidi(pool[Math.floor(rng()*pool.length)]);
    last=Math.max(profile.minMidi,Math.min(profile.maxMidi,midi));
    const pitch=P.fromMidi(last,ctx.fifths);
    const dots=rng()>.82?1:0;
    notes.push({offset:bar*cap+tick,event:C.makeNote(pitch,profile.den,dots)});
   }
  }
  return phraseCard(notes,profile.label,profile.style,profile.id);
 }
 function harmonyContext(part,fromMi,draftTimeline){
  const start=Math.max(0,fromMi||0);
  const fifths=part.key||0;
  const mode=fifths<0?'minor':'major';
  const time=part.time||{num:4,den:4};
  let timeline=draftTimeline?.length?draftTimeline:null;
  if(!timeline){
   const symbols=[];
   for(let mi=start;mi<Math.min(part.measures.length,start+8);mi++){
    const marks=(part.measures[mi]?.directions||[]).filter(d=>d.key==='chordSymbol').sort((a,b)=>a.tick-b.tick);
    if(marks[0]?.text)symbols.push(marks[0].text);
   }
   if(symbols.length)timeline=symbols.map(symbol=>({symbol,roman:Pop.symbolToRoman(symbol,fifths,mode)||'I'}));
  }
  if(!timeline?.length){
   timeline=['I','IV','V','vi'].map(roman=>({roman,symbol:Pop.romanToSymbol(roman,fifths,mode)}));
  }
  return {fifths,mode,time,timeline,tempo:part.tempo||100,fromMi:start};
 }
 function buildPhraseStream(ctx,options={}){
  const seed=options.seed>>>0||1;
  const rng=mulberry32(seed);
  const count=options.count||10;
  const seedFragment=options.seedFragment;
  const out=[],seen=new Set();
  function push(card){
   const sig=`${card.label}:${card.fragment.length}:${C.pitchMidi(card.fragment[0]?.event.pitches?.[0]||{step:'C',octave:4,alter:0})}`;
   if(seen.has(sig))return;
   seen.add(sig);
   out.push(card);
  }
  if(seedFragment?.length){
   for(const v of variationDescriptors(seedFragment))push(phraseCard(v.fragment,v.label,'変奏',v.id));
   for(const v of ornamentVariations(seedFragment,rng))push(v);
   for(const v of reharmVariations(seedFragment,ctx,rng))push(v);
  }
  let tries=0;
  while(out.length<count&&tries<count*5){
   tries++;
   const profile={...pick(rng,PHRASE_PROFILES)};
   push(generateProceduralPhrase(ctx,rng,profile));
  }
  return out;
 }
 function previewFragment(fragment,tempo){
  const ms=Math.max(120,Math.min(520,Math.round(60000/(tempo||100)/2)));
  return fragment.map((item,i)=>({pitch:item.event.pitches[0],delayMs:i*ms,duration:item.event.den}));
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
  applyFragment,previewSequence,pushHistory,loadHistory,emptyLocks,harmonyContext,buildPhraseStream,previewFragment,phraseCard,PHRASE_PROFILES
 };
});