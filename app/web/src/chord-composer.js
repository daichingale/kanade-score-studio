/* Chord composer: timeline → accompaniment + bass (+ optional melody) via commit path. */
(function(root,factory){
 const api=factory(
   root.KanadeCore||(typeof require==='function'?require('./core.js'):null),
   root.KanadePerformance||(typeof require==='function'?require('./performance.js'):null),
   root.KanadePopProgression||(typeof require==='function'?require('./pop-progression.js'):null)
 );
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeChordComposer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,P,Pop){
 'use strict';
 const DRAFT_KEY='kanade.chordComposer.timeline.v1';

 function timelineTicks(timeline,den){return (timeline?.length||0)*C.durationTicks(Number(den)||4,0);}

 function ensureMeasures(part,startMi,totalTicks){
  let next={...part,measures:part.measures.map(bar=>({...bar,events:[...bar.events],directions:[...(bar.directions||[])]}))};
  const need=C.measureOffsets(next)[startMi]+totalTicks;
  while(C.measureOffsets(next).at(-1)+C.barTicks(next,next.measures.length-1)<need)next=C.addMeasure(next);
  return next;
 }

 function writeBassSlot(part,mi,tick,slotTicks,symbol,octave,den){
  const root=P.chordPitches(symbol,octave)[0];
  let next=part,used=0;
  for(const {den:d,dots} of C.exactDurations(slotTicks)){
   const note=C.makeNote(root,d,dots);
   note.pitches=C.normalizeChord([root]);
   next=C.placeEventsAt(next,mi,tick+used,[note],{overwrite:true}).score;
   used+=C.eventTicks(note);
  }
  return next;
 }

 function writeMelodySlot(part,mi,tick,slotTicks,symbol,octave,den,strong){
  const tones=P.chordPitches(symbol,octave);
  const pitch=tones[Math.min(strong?1:0,tones.length-1)]||tones[0];
  if(!pitch)return part;
  return C.placeEventsAt(part,mi,tick,[C.makeNote(pitch,den,0)],{overwrite:true}).score;
 }

 function slotAt(next,cursor){
  const offsets=C.measureOffsets(next);
  for(let mi=0;mi<next.measures.length;mi++){
   const start=offsets[mi],end=start+C.barTicks(next,mi);
   if(cursor<end||mi===next.measures.length-1)return {mi,tick:Math.max(0,cursor-start)};
  }
  return {mi:0,tick:0};
 }

 function writeHarmonyBassSlot(part,mi,tick,slotTicks,symbol,voicing,harmOct,bassOct,den){
  const harm=Pop.voicingPitches(symbol,voicing,harmOct);
  const bass=P.chordPitches(symbol,bassOct)[0];
  const merged=C.normalizeChord([...harm,bass]);
  let next=part,used=0;
  if(voicing==='arpeggio'){
   return Pop.writeSlot(part,mi,tick,slotTicks,symbol,voicing,harmOct,den);
  }
  for(const {den:d,dots} of C.exactDurations(slotTicks)){
   const note=C.makeNote(merged[0],d,dots);
   note.pitches=merged;
   next=C.placeEventsAt(next,mi,tick+used,[note],{overwrite:true}).score;
   used+=C.eventTicks(note);
  }
  const bar=next.measures[mi];
  const dirs=[...(bar.directions||[]).filter(m=>!(m.key==='chordSymbol'&&m.tick===tick))];
  dirs.push({key:'chordSymbol',tick,text:symbol});
  next.measures[mi]={...bar,directions:dirs.sort((a,b)=>a.tick-b.tick)};
  return next;
 }

 function applyTimelineToPart(part,timeline,options){
  if(!timeline?.length)throw new Error('コードがありません');
  const startMi=Math.max(0,(options.from||1)-1);
  const den=Number(options.den)||4;
  const slotTicks=C.durationTicks(den,0);
  const total=timelineTicks(timeline,den);
  const voicing=options.voicing||'block';
  const harmOct=Number(options.harmonyOctave)||4;
  const bassOct=Number(options.bassOctave)||3;
  const melOct=Number(options.melodyOctave)||5;
  const role=options.role||'harmony';
  let next=ensureMeasures(part,startMi,total);
  const offsets=C.measureOffsets(next);
  let cursor=offsets[startMi]||0;
  timeline.forEach((item,idx)=>{
   const {mi,tick}=slotAt(next,cursor);
   const symbol=item.symbol||item;
   if(role==='both'){
    next=writeHarmonyBassSlot(next,mi,tick,slotTicks,symbol,voicing,harmOct,bassOct,den);
   }else if(role==='harmony'){
    next=Pop.writeSlot(next,mi,tick,slotTicks,symbol,voicing,harmOct,den);
   }else if(role==='bass'){
    next=writeBassSlot(next,mi,tick,slotTicks,symbol,bassOct,den);
    if(options.writeSymbols!==false){
     const bar=next.measures[mi];
     const dirs=[...(bar.directions||[]).filter(m=>!(m.key==='chordSymbol'&&m.tick===tick))];
     dirs.push({key:'chordSymbol',tick,text:symbol});
     next.measures[mi]={...bar,directions:dirs.sort((a,b)=>a.tick-b.tick)};
    }
   }else if(role==='melody'){
    next=writeMelodySlot(next,mi,tick,slotTicks,symbol,melOct,den,idx%2===0);
   }
   cursor+=slotTicks;
  });
  if(options.learn)Pop.learnFromPart(next,{enabled:true,mode:options.mode||'major'});
  return next;
 }

 function applyTimelineDocument(doc,options){
  const parts=C.scoreParts(doc);
  const timeline=options.timeline;
  const hIdx=(options.harmonyPart||1)-1;
  const bIdx=(options.bassPart||options.harmonyPart||1)-1;
  const mIdx=options.melody?((options.melodyPart||1)-1):-1;
  const base={
   from:options.from,to:options.to,timeline,den:options.den,voicing:options.voicing,
   mode:options.mode,learn:options.learn,harmonyOctave:options.harmonyOctave,
   bassOctave:options.bassOctave,melodyOctave:options.melodyOctave
  };
  const samePart=bIdx===hIdx;
  const role=options.bass!==false&&samePart?'both':'harmony';
  const harmony=applyTimelineToPart(parts[hIdx],timeline,{...base,role,bassOct:options.bassOctave});
  let updated=parts.map((p,i)=>i===hIdx?harmony:p);
  if(options.bass!==false&&!samePart){
   const bass=applyTimelineToPart(parts[bIdx],timeline,{...base,role:'bass'});
   updated=updated.map((p,i)=>i===bIdx?bass:p);
  }
  if(options.melody&&mIdx>=0&&mIdx!==hIdx){
   const melody=applyTimelineToPart(parts[mIdx],timeline,{...base,role:'melody'});
   updated=updated.map((p,i)=>i===mIdx?melody:p);
  }
  const [first,...rest]=updated;
  const next={...first};
  if(rest.length)next.ensembleParts=rest;
  const errors=C.validateScore(next);
  if(errors.length)throw new Error(errors[0]);
  const labels=[];
  if(options.bass!==false)labels.push('伴奏とベース');
  else labels.push('伴奏');
  if(options.melody)labels.push('メロディ');
  return {document:next,summary:`コードタイムラインから${labels.join('・')}を入力しました（${timeline.length}コード）`,focusPart:hIdx};
 }

 function presetTimeline(id,fifths,mode){
  const len={komuro:4,canon:8,'IV-V-iii-vi':4,'I-V-vi-IV':4,'vi-IV-I-V':4,'ii-V-I':3}[id]||4;
  const romans=Pop.progressionForTemplate(id,len);
  return romans.map(roman=>({roman,symbol:Pop.romanToSymbol(roman,fifths,mode)}));
 }

 function saveDraft(timeline){try{localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,timeline}));}catch{}}
 function loadDraft(){
  try{
   const raw=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
   if(raw?.version===1&&Array.isArray(raw.timeline))return raw.timeline;
  }catch{}
  return [];
 }

 return {
  DRAFT_KEY,timelineTicks,ensureMeasures,applyTimelineToPart,applyTimelineDocument,presetTimeline,saveDraft,loadDraft
 };
});