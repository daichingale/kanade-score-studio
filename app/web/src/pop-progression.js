/* Offline pop/J-pop chord-progression model (n-gram) with optional localStorage learning. */
(function(root,factory){
 const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null),
   root.KanadePerformance||(typeof require==='function'?require('./performance.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadePopProgression=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,P){
 'use strict';
 const STORAGE_KEY='kanade.pop.progression.v1';
 const STEP_NAMES=['I','II','III','IV','V','VI','VII'];
 const MAJOR_DEG=[0,2,4,5,7,9,11];
 const MINOR_DEG=[0,2,3,5,7,8,10];
 const ROOTS=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
 const TEMPLATES={
  auto:'自動',
  'I-V-vi-IV':['I','V','vi','IV'],
  'IV-V-iii-vi':['IV','V','iii','vi'],
  'vi-IV-I-V':['vi','IV','I','V'],
  'ii-V-I':['ii','V','I'],
  canon:['I','V','vi','iii','IV','I','IV','V'],
  komuro:['vi','IV','I','V'],
  'I-vi-IV-V':['I','vi','IV','V'],
  'I-IV-V-IV':['I','IV','V','IV']
 };
 const TEMPLATE_KEYS=Object.keys(TEMPLATES).filter(key=>key!=='auto');

 function loadStore(){
  try{
   const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
   if(raw&&raw.version===1&&raw.bigrams&&typeof raw.bigrams==='object')return raw;
  }catch{}
  return {version:1,bigrams:{},trigrams:{},learned:false};
 }
 function saveStore(store){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));}catch{}
 }
 function tonicPc(fifths){return ((fifths*7)%12+12)%12;}
 function parseRoman(token){
  const text=String(token||'').trim();
  if(!text)return null;
  const m=/^(vii°|vii|VII|III|II|IV|VI|I|V|iii|vi|ii|iv|i|v)([°+7mMaj]*)?$/i.exec(text);
  if(!m)return null;
  const body=m[1];
  const idx=STEP_NAMES.findIndex(name=>name.toLowerCase()===body.toLowerCase()||name===body);
  const degree=idx>=0?idx:STEP_NAMES.findIndex(name=>name.toLowerCase()===body.toLowerCase().replace('°',''));
  const lower=body===body.toLowerCase()&&body!=='vii°';
  let quality='';
  if(body.includes('°')||/dim/i.test(m[2]||''))quality='dim';
  else if(lower)quality='m';
  else if(/7/.test(m[2]||''))quality='7';
  else quality='';
  return {roman:text,degree:degree>=0?degree:0,quality};
 }
 function specialRomanToSymbol(roman,fifths,mode='major'){
  if(roman==='bVII'){
   const pc=(tonicPc(fifths)+10)%12;
   const {step,alter}=P.fromMidi(60+pc,fifths);
   return step+(alter===1?'♯':alter===-1?'♭':'');
  }
  if(roman==='iv'&&mode==='major'){
   const pc=(tonicPc(fifths)+MAJOR_DEG[3])%12;
   const {step,alter}=P.fromMidi(60+pc,fifths);
   return step+(alter===1?'♯':alter===-1?'♭':'')+'m';
  }
  if(roman==='V/vi'){
   const viPc=(tonicPc(fifths)+(mode==='minor'?MINOR_DEG[5]:MAJOR_DEG[5]))%12;
   const dom=(viPc+7)%12;
   const {step,alter}=P.fromMidi(60+dom,fifths);
   return step+(alter===1?'♯':alter===-1?'♭':'');
  }
  return null;
 }
 function buildChordPad(fifths,mode='major'){
  const diatonic=[['I',''],['ii','m'],['iii','m'],['IV',''],['V',''],['vi','m'],['vii°','dim']];
  const pad=diatonic.map(([roman])=>({
   roman,symbol:romanToSymbol(roman,fifths,mode),label:roman,borrowed:false
  }));
  for(const roman of ['bVII','iv','V/vi']){
   const symbol=specialRomanToSymbol(roman,fifths,mode);
   if(symbol)pad.push({roman,symbol,label:roman.replace('V/vi','V/Ⅵ'),borrowed:true});
  }
  return pad;
 }
 function romanToSymbol(roman,fifths,mode='major'){
  const special=specialRomanToSymbol(roman,fifths,mode);
  if(special)return special;
  const parsed=parseRoman(roman);
  if(!parsed)return 'C';
  const scale=mode==='minor'?MINOR_DEG:MAJOR_DEG;
  const pc=(tonicPc(fifths)+scale[parsed.degree])%12;
  const {step,alter}=P.fromMidi(60+pc,fifths);
  const root=step+(alter===1?'♯':alter===-1?'♭':'');
  if(parsed.quality==='m')return root+'m';
  if(parsed.quality==='dim')return root+'dim';
  if(parsed.quality==='7')return root+'7';
  return root;
 }
 function symbolToRoman(symbol,fifths,mode='major'){
  try{
   const rootPc=C.pitchMidi(P.chordPitches(symbol,4)[0])%12;
   const tonic=tonicPc(fifths);
   const scale=mode==='minor'?MINOR_DEG:MAJOR_DEG;
   const minor=/m(?!aj)/i.test(symbol)&&!/dim|sus|aug|°|add/i.test(symbol);
   for(let d=0;d<7;d++)if((tonic+scale[d])%12===rootPc){
     const name=STEP_NAMES[d];
     return minor?name.toLowerCase():name;
   }
  }catch{}
  return null;
 }
 function seedCounts(){
  const bigrams={},trigrams={};
  for(const key of TEMPLATE_KEYS){
   const seq=TEMPLATES[key];
   for(let i=0;i<seq.length-1;i++){
    const a=seq[i],b=seq[i+1];
    bigrams[a]=bigrams[a]||{};bigrams[a][b]=(bigrams[a][b]||0)+2;
    if(i<seq.length-2){
     const t=`${seq[i]}|${seq[i+1]}`;
     trigrams[t]=trigrams[t]||{};trigrams[t][seq[i+2]]=(trigrams[t][seq[i+2]]||0)+1;
    }
   }
  }
  return {bigrams,trigrams};
 }
 function mergedStore(){
  const store=loadStore();
  const seed=seedCounts();
  const bigrams={...seed.bigrams},trigrams={...seed.trigrams};
  for(const [a,next] of Object.entries(store.bigrams||{})){
   bigrams[a]=bigrams[a]||{};
   for(const [b,c] of Object.entries(next))bigrams[a][b]=(bigrams[a][b]||0)+c;
  }
  for(const [t,next] of Object.entries(store.trigrams||{})){
   trigrams[t]=trigrams[t]||{};
   for(const [b,c] of Object.entries(next))trigrams[t][b]=(trigrams[t][b]||0)+c;
  }
  return {bigrams,trigrams,learned:!!store.learned};
 }
 function rankNext(prev,fifths,mode='major',limit=3){
  const {bigrams,trigrams}=mergedStore();
  const last=prev?.filter(Boolean).slice(-2);
  let candidates=[];
  if(last.length>=2){
   const key=`${last[0]}|${last[1]}`;
   candidates=Object.entries(trigrams[key]||{}).map(([roman,count])=>({roman,count,symbol:romanToSymbol(roman,fifths,mode)}));
  }
  if(!candidates.length&&last.length){
   candidates=Object.entries(bigrams[last.at(-1)]||{}).map(([roman,count])=>({roman,count,symbol:romanToSymbol(roman,fifths,mode)}));
  }
  if(!candidates.length){
   candidates=TEMPLATES['IV-V-iii-vi'].map(roman=>({roman,count:1,symbol:romanToSymbol(roman,fifths,mode)}));
  }
   candidates.sort((a,b)=>b.count-a.count);
   const seen=new Set();
   return candidates.filter(item=>{if(seen.has(item.symbol))return false;seen.add(item.symbol);return true;}).slice(0,limit);
 }
 function sampleProgression(length,seedRomans,fifths){
  const {bigrams}=mergedStore();
  const out=[];
  if(seedRomans?.length)out.push(...seedRomans);
  while(out.length<length){
   const prev=out.at(-1);
   const next=Object.entries(bigrams[prev]||bigrams.I||{V:1,IV:1}).sort((a,b)=>b[1]-a[1])[0];
   out.push(next?next[0]:'I');
  }
  return out.slice(0,length);
 }
 function progressionForTemplate(id,length){
  if(!id||id==='auto')return sampleProgression(length,['I']);
  const seq=TEMPLATES[id];
  if(!seq)return sampleProgression(length,['I']);
  const out=[];
  while(out.length<length)out.push(...seq);
  return out.slice(0,length);
 }
 function learnFromPart(part,{enabled,mode='major'}={}){
  if(!enabled)return {added:0};
  const store=loadStore();
  const fifths=part.key||0;
  const romans=[];
  for(const bar of part.measures||[]){
   for(const mark of bar.directions||[]){
    if(mark.key!=='chordSymbol'||!mark.text)continue;
    const roman=symbolToRoman(mark.text,fifths,mode);
    if(roman)romans.push(roman);
   }
  }
  let added=0;
  store.bigrams=store.bigrams||{};
  store.trigrams=store.trigrams||{};
  for(let i=0;i<romans.length-1;i++){
   store.bigrams[romans[i]]=store.bigrams[romans[i]]||{};
   store.bigrams[romans[i]][romans[i+1]]=(store.bigrams[romans[i]][romans[i+1]]||0)+1;
   added++;
   if(i<romans.length-2){
    const key=`${romans[i]}|${romans[i+1]}`;
    store.trigrams[key]=store.trigrams[key]||{};
    store.trigrams[key][romans[i+2]]=(store.trigrams[key][romans[i+2]]||0)+1;
   }
  }
  if(added)store.learned=true;
  saveStore(store);
  return {added,romans};
 }
 function voicingPitches(symbol,style,octave){
  const full=P.chordPitches(symbol,octave);
  if(style==='root5')return [full[0],full[Math.min(2,full.length-1)]];
   if(style==='arpeggio')return full;
   return full;
 }
 function writeSlot(part,mi,slotTick,slotTicks,symbol,voicing,octave,den){
  const pitches=voicingPitches(symbol,voicing,octave);
  let next=part,tick=slotTick,idx=0,used=0;
  if(voicing==='arpeggio'){
   const unit=Math.max(C.durationTicks(den,0),C.WHOLE/64);
   while(used<slotTicks){
    const chunk=Math.min(unit,slotTicks-used);
    for(const {den:d,dots} of C.exactDurations(chunk)){
     const note=C.makeNote(pitches[idx%pitches.length],d,dots);
     note.pitches=C.normalizeChord([pitches[idx%pitches.length]]);
     next=C.placeEventsAt(next,mi,tick,[note],{overwrite:true}).score;
     const len=C.eventTicks(note);
     tick+=len; used+=len; idx++;
    }
   }
  }else{
   for(const {den:d,dots} of C.exactDurations(slotTicks)){
    const note=C.makeNote(pitches[0],d,dots);
    note.pitches=C.normalizeChord(pitches);
    next=C.placeEventsAt(next,mi,tick,[note],{overwrite:true}).score;
    tick+=C.eventTicks(note);
   }
  }
  const bar=next.measures[mi];
  const dirs=[...(bar.directions||[]).filter(m=>!(m.key==='chordSymbol'&&m.tick===slotTick))];
  dirs.push({key:'chordSymbol',tick:slotTick,text:symbol});
  next.measures[mi]={...bar,directions:dirs.sort((a,b)=>a.tick-b.tick)};
  return next;
 }
 function applyToPart(part,options){
  const from=(options.from||1)-1,to=(options.to||part.measures.length)-1;
  const mode=options.mode||((part.key||0)<0?'minor':'major');
  const fifths=part.key||0;
  const template=options.progression||options.template||'auto';
  const voicing=options.voicing||'block';
  const octave=Number(options.octave)||4;
  const den=Number(options.den)||4;
  const grid=options.grid==='half'?'half':'bar';
  const slotsPerBar=grid==='half'?2:1;
  const romans=progressionForTemplate(template,(to-from+1)*slotsPerBar);
  let next={...part,measures:part.measures.map(bar=>({...bar,events:[...bar.events],directions:[...(bar.directions||[])]}))};
  let ri=0;
  for(let mi=from;mi<=to;mi++){
   next={...next,measures:next.measures.map((bar,index)=>index===mi?{...bar,events:[]}:bar)};
   const barTicks=C.barTicks(next,mi);
   const slotTicks=barTicks/slotsPerBar;
   for(let s=0;s<slotsPerBar;s++){
    const roman=romans[ri++]||romans.at(-1)||'I';
    const symbol=romanToSymbol(roman,fifths,mode);
    const tick=Math.round(s*slotTicks);
    next=writeSlot(next,mi,tick,slotTicks,symbol,voicing,octave,den);
   }
  }
  if(options.learn)learnFromPart(next,{enabled:true,mode});
  return {part:next,summary:`${from+1}〜${to+1}小節にポップ進行（${TEMPLATES[template]||'自動'}）を${voicing}で入力しました。`,romans};
 }
 function applyDocument(doc,options){
  const parts=C.scoreParts(doc);
  const index=(options.part??1)-1;
  if(index<0||index>=parts.length)throw new Error('パート番号が不正です');
  const {part,summary}=applyToPart(parts[index],options);
  const all=parts.map((p,i)=>i===index?part:p);
  const [first,...rest]=all;
  const next={...first};
  if(rest.length)next.ensembleParts=rest;
  const errors=C.validateScore(next);
  if(errors.length)throw new Error(errors[0]);
  return {document:next,summary,focusPart:index};
 }

 return {
  STORAGE_KEY,TEMPLATES,TEMPLATE_KEYS,loadStore,saveStore,parseRoman,specialRomanToSymbol,buildChordPad,
  romanToSymbol,symbolToRoman,rankNext,progressionForTemplate,sampleProgression,learnFromPart,applyToPart,
  applyDocument,voicingPitches,writeSlot
 };
});