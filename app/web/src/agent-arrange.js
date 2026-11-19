/* Deterministic instrumentation and voicing helpers for the local assistant. */
(function(root,factory){
 const C=root.KanadeCore||(typeof require==='function'?require('./core.js'):null);
 const I=root.KanadeInstruments||(typeof require==='function'?require('./instruments.js'):null);
 const api=factory(C,I);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeArrange=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,I){
 'use strict';
 const LEVELS={
  beginner:{ja:'初級',grid:'whole'},
  intermediate:{ja:'中級',grid:'half'},
  advanced:{ja:'上級',grid:'quarter'}
 };
 // Written MIDI ranges. Percussion is checked by role, not by these limits.
 const RANGES={
  piccolo:{beginner:[74,93],intermediate:[74,96],advanced:[72,98]},
  flute:{beginner:[60,84],intermediate:[60,89],advanced:[59,96]},
  oboe:{beginner:[62,84],intermediate:[60,88],advanced:[58,93]},
  englishHorn:{beginner:[64,84],intermediate:[60,88],advanced:[58,91]},
  bassoon:{beginner:[36,58],intermediate:[34,62],advanced:[34,67]},
  clarinet:{beginner:[52,79],intermediate:[52,84],advanced:[52,91]},
  ebClarinet:{beginner:[60,84],intermediate:[55,88],advanced:[52,93]},
  bassClarinet:{beginner:[52,77],intermediate:[50,81],advanced:[48,84]},
  alto:{beginner:[60,81],intermediate:[58,86],advanced:[58,89]},
  tenor:{beginner:[60,81],intermediate:[58,84],advanced:[58,88]},
  baritone:{beginner:[60,77],intermediate:[58,81],advanced:[56,84]},
  sopranoSax:{beginner:[60,81],intermediate:[58,86],advanced:[56,89]},
  trumpet:{beginner:[60,79],intermediate:[58,84],advanced:[54,88]},
  horn:{beginner:[60,79],intermediate:[55,84],advanced:[53,86]},
  mellophone:{beginner:[60,79],intermediate:[58,84],advanced:[55,88]},
  trombone:{beginner:[46,65],intermediate:[40,70],advanced:[40,74]},
  euphonium:{beginner:[46,65],intermediate:[43,70],advanced:[40,74]},
  baritoneHorn:{beginner:[46,65],intermediate:[43,70],advanced:[40,74]},
  tuba:{beginner:[34,53],intermediate:[31,58],advanced:[28,62]},
  contrabass:{beginner:[36,55],intermediate:[32,60],advanced:[28,64]},
  glockenspiel:{beginner:[72,93],intermediate:[72,96],advanced:[72,98]},
  xylophone:{beginner:[72,93],intermediate:[67,96],advanced:[65,98]},
  marimba:{beginner:[60,81],intermediate:[55,86],advanced:[48,89]},
  vibraphone:{beginner:[60,81],intermediate:[55,86],advanced:[53,88]},
  mallets:{beginner:[60,81],intermediate:[55,86],advanced:[48,89]},
  piano:{beginner:[48,84],intermediate:[36,96],advanced:[21,108]}
 };
 const MELODY=new Set(['piccolo','flute','oboe','clarinet','ebClarinet','sopranoSax','trumpet','glockenspiel','xylophone']);
 const COUNTER=new Set(['alto','altoFlute','horn','mellophone','englishHorn','vibraphone']);
 const BASS=new Set(['tuba','contrabass','bassoon','bassSax','electricBass']);
 const CONCERT=[
  ['flute','木管','旋律',1,4,2],['oboe','木管','旋律',8,1,1],['bassoon','木管','バス',9,1,1],
  ['clarinet','木管','旋律',2,8,5],['bassClarinet','木管','バス',12,1,1],
  ['alto','木管','対旋律',4,3,2],['tenor','木管','和声',6,2,1],['baritone','木管','バス',13,1,1],
  ['trumpet','金管','旋律',3,4,4],['horn','金管','対旋律',5,4,2],
  ['trombone','金管','和声',7,3,2],['euphonium','金管','和声',10,2,1],['tuba','金管','バス',11,2,2],
  ['timpani','打楽器','リズム',14,1,1],['snare','打楽器','リズム',15,1,1],
  ['orchestralBassDrum','打楽器','リズム',16,1,1],['suspendedCymbal','打楽器','リズム',17,1,1],
  ['mallets','打楽器','旋律',18,1,1]
 ].map(([key,section,role,priority,max,weight])=>({key,section,role,priority,max,weight,min:priority<=11||['snare','orchestralBassDrum','suspendedCymbal'].includes(key)?1:0}));
 const MARCHING=[
  ['piccolo','木管','旋律',8,2,1],['flute','木管','旋律',2,4,2],['clarinet','木管','旋律',1,8,4],
  ['alto','木管','対旋律',3,4,2],['tenor','木管','和声',6,2,1],
  ['trumpet','金管','旋律',2,6,4],['mellophone','金管','対旋律',4,4,2],
  ['trombone','金管','和声',7,3,1],['baritoneHorn','金管','和声',5,3,2],['tuba','金管','バス',9,3,2],
  ['snare','打楽器','リズム',10,2,1],['tenors','打楽器','リズム',11,1,1],
  ['basses','打楽器','リズム',12,1,1],['cymbals','打楽器','リズム',13,1,1],
  ['glockenspiel','打楽器','旋律',14,1,1]
 ].map(([key,section,role,priority,max,weight])=>({key,section,role,priority,max,weight,min:['piccolo','trombone'].includes(key)?0:1}));

 function fail(message){throw new Error(message);}
 function levelOf(value){
  const text=String(value||'中級').trim();
  if(/初|beginner|easy/i.test(text))return 'beginner';
  if(/上|advanced/i.test(text))return 'advanced';
  return 'intermediate';
 }
 function levelLabel(level){return LEVELS[level].ja;}
 function itemOf(value){
  const text=String(value||'').replace(/なし|抜き|除く|無し/g,'').trim();
  if(!text)return null;
  if(I.byKey.get(text))return I.byKey.get(text);
  const exact=I.catalog.find(item=>item.name===text||item.english.toLowerCase()===text.toLowerCase()||item.key===text);
  if(exact)return exact;
  const matched=I.match(text);
  return matched?matched[1]:null;
 }
 function missingKeys(value){
  const source=Array.isArray(value)?value.join(','):String(value||'');
  const keys=new Set();
  for(const piece of source.split(/[、,，・/\s]+/)){
   const item=itemOf(piece);
   if(item)keys.add(item.key);
  }
  return keys;
 }
 function styleOf(value){
  const text=String(value||'');
  return {marching:/march|マーチ/i.test(text),small:/small|小編成|少人数/.test(text),bright:/bright|明る/.test(text)};
 }
 function poolFor(style,level){
  const source=style.marching?MARCHING:CONCERT;
  return source.map(item=>({...item,min:item.min})).filter(item=>{
   if(style.marching)return true;
   if(level==='beginner'&&item.key==='piccolo')return false;
   return true;
  }).map(item=>{
   if(style.bright&&['flute','trumpet','mallets','glockenspiel'].includes(item.key))return {...item,weight:item.weight+2,min:Math.max(item.min,item.key==='mallets'?1:item.min)};
   if(style.small&&['oboe','bassoon','bassClarinet','baritone','timpani'].includes(item.key))return {...item,min:0};
   return item;
  });
 }
 function allocate(items,target){
  const rows=items.map(item=>({...item}));
  let guard=0;
  while(rows.reduce((sum,item)=>sum+item.min,0)>target&&guard++<40){
   const optional=[...rows].reverse().find(item=>item.min>0&&!['flute','clarinet','trumpet','tuba','snare'].includes(item.key));
   if(optional)optional.min--;
   else {const fattest=rows.filter(item=>item.min>1).sort((a,b)=>b.min-a.min)[0];if(!fattest)break;fattest.min--;}
  }
  const counts=new Map();
  const chosen=[];
  for(const item of rows)for(let i=0;i<item.min&&chosen.length<target;i++){chosen.push(item.key);counts.set(item.key,(counts.get(item.key)||0)+1);}
  let left=target-chosen.length,spins=0;
  while(left>0&&spins++<80){
   const room=rows.filter(item=>(counts.get(item.key)||0)<item.max);
   if(!room.length)break;
   const weight=room.reduce((sum,item)=>sum+item.weight,0);
   let best=room[0],score=-Infinity;
   for(const item of room){
    const deficit=item.weight/weight-((counts.get(item.key)||0)/Math.max(1,chosen.length));
    if(deficit>score){score=deficit;best=item;}
   }
   chosen.push(best.key);counts.set(best.key,(counts.get(best.key)||0)+1);left--;
  }
  return chosen;
 }
 function grouped(keys){
  const lines=new Map();
  for(const key of keys){
   const item=I.byKey.get(key);
   const section=item?.group||'その他';
   if(!lines.has(section))lines.set(section,[]);
   lines.get(section).push(item?.name||key);
  }
  return [...lines].map(([section,names])=>{
   const counts=new Map();
   for(const name of names)counts.set(name,(counts.get(name)||0)+1);
   return `${section}: ${[...counts].map(([name,count])=>count>1?`${name}×${count}`:name).join('、')}`;
  }).join('\n');
 }
 function plan(options={}){
  const level=levelOf(options.level);
  const style=styleOf(`${options.style||''} ${options.mood||''}`);
  const missing=missingKeys(options.missing);
  if(style.marching){missing.add('oboe');missing.add('bassoon');missing.add('horn');}
  const requested=Number(options.headcount??options.people);
  const target=Number.isInteger(requested)?Math.max(4,Math.min(32,requested)):style.small?13:style.marching?18:20;
  const pool=poolFor(style,level).filter(item=>!missing.has(item.key)&&I.byKey.get(item.key)).sort((a,b)=>a.priority-b.priority);
  if(pool.length<2)fail('指定された条件では編成を組めません');
  const keys=allocate(pool,target);
  const omitted=[...missing].map(key=>I.byKey.get(key)?.name||key);
  const reasons=[
   `${LEVELS[level].ja}向けです。音域とリズムはこの難易度に合わせます。`,
   style.marching?'マーチングなのでメロフォン、マーチング・バリトン、バッテリーを使います。':style.small?'小編成の学校吹奏楽を基準にしています。':'学校吹奏楽の標準的な並びを基準にしています。',
   style.bright?'明るい響きになるよう高音楽器を多めにしています。':'',
   omitted.length?`${omitted.join('、')}は入れません。`:'',
   `合計${keys.length}人です。`
  ].filter(Boolean);
  const summary=['提案する編成',grouped(keys),'理由:',...reasons.map(line=>`・${line}`)].join('\n');
  return {keys,level,style:style.marching?'marching':style.small?'small':'concert',summary,reasons};
 }

 function offsetOf(transposition,clef){
  if(clef==='percussion')return 0;
  const spec=C.TRANSPOSITIONS[transposition||'concert']||C.TRANSPOSITIONS.concert;
  return spec.chromatic+spec.octave*12;
 }
 function rangeFor(key,level){
  const table=RANGES[key];
  if(!table)return null;
  const [low,high]=table[level]||table.intermediate;
  return {low,high};
 }
 function fitOctave(midi,low,high){
  let best=midi,penalty=Infinity;
  for(let shift=-3;shift<=3;shift++){
   const candidate=midi+shift*12;
   const outside=candidate<low?low-candidate:candidate>high?candidate-high:0;
   const score=outside*10+Math.abs(shift);
   if(score<penalty){penalty=score;best=candidate;}
  }
  return {midi:best,ok:best>=low&&best<=high,shifted:best!==midi};
 }
 function spell(midi,preferSharps){
  const pc=((midi%12)+12)%12,octave=Math.floor(midi/12)-1;
  if(octave<0||octave>8)fail('音域の外に出ます');
  const sharp=['C','C','D','D','E','F','F','G','G','A','A','B'];
  const flat=['C','D','D','E','E','F','G','G','A','A','B','B'];
  const sharpAlter=[0,1,0,1,0,0,1,0,1,0,1,0];
  const flatAlter=[0,-1,0,-1,0,0,-1,0,-1,0,-1,0];
  return {step:(preferSharps?sharp:flat)[pc],alter:(preferSharps?sharpAlter:flatAlter)[pc],octave};
 }
 function midiOf(pitch){return C.pitchMidi(pitch);}
 function tonic(fifths){return ((fifths*7)%12+12)%12;}
 function scaleOf(fifths){return [0,2,4,5,7,9,11].map(step=>(tonic(fifths)+step)%12);}
 function thirdBelow(midi,fifths){
  const scale=scaleOf(fifths);
  let snapped=midi,guard=0;
  while(!scale.includes(((snapped%12)+12)%12)&&guard++<12)snapped--;
  const degree=scale.indexOf(((snapped%12)+12)%12);
  const target=scale[(degree+5)%7];
  let result=snapped-1;
  while(((result%12)+12)%12!==target)result--;
  return result+(midi-snapped);
 }
 function writtenFromConcert(part,concertMidi,level){
  const info=concertRange(part,level);
  if(!info)return concertMidi;
  return fitOctave(concertMidi-info.offset,info.written.low,info.written.high).midi;
 }
 function parseChord(symbol){
  const match=String(symbol||'').trim().match(/^([A-Ga-g])([#b♭♯]?)(m|min|maj)?(7)?$/);
  if(!match)fail(`和音「${symbol}」を解釈できません。C、Dm、G7 のように書いてください`);
  const roots={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  let root=roots[match[1].toUpperCase()];
  if(match[2]==='#'||match[2]==='♯')root+=1;
  if(match[2]==='b'||match[2]==='♭')root-=1;
  root=((root%12)+12)%12;
  const minor=match[3]==='m'||match[3]==='min';
  const tones=[root,(root+(minor?3:4))%12,(root+7)%12];
  if(match[4]==='7')tones.push((root+(match[3]==='maj'?11:10))%12);
  return tones;
 }
 function pitchInRange(pc,low,high,bias){
  const found=[];
  for(let midi=low;midi<=high;midi++)if(((midi%12)+12)%12===pc)found.push(midi);
  if(!found.length)return null;
  if(bias==='low')return found[0];
  if(bias==='high')return found[found.length-1];
  const mid=(low+high)/2;
  return found.sort((a,b)=>Math.abs(a-mid)-Math.abs(b-mid)||a-b)[0];
 }
 function roleFor(part){
  const key=part.instrumentKey||I.profile(part)?.key||'';
  if(part.clef==='percussion')return 'rhythm';
  if(BASS.has(key))return 'bass';
  if(MELODY.has(key))return 'melody';
  if(COUNTER.has(key))return 'counter';
  if(['marimba','mallets','vibraphone'].includes(key))return 'harmony';
  return 'harmony';
 }
 function concertRange(part,level){
  const key=part.instrumentKey||I.profile(part)?.key;
  const written=rangeFor(key,level);
  if(!written||part.clef==='percussion')return null;
  const offset=offsetOf(part.transposition,part.clef);
  return {low:written.low+offset,high:written.high+offset,written,offset};
 }
 function noteEvents(midi,ticks,preferSharps){
  return C.exactDurations(ticks).map(({den,dots})=>C.makeNote(spell(midi,preferSharps),den,dots));
 }
 function sliceTicks(total,count){
  if(total%count!==0)fail('この拍子ではそのリズムに分割できません');
  return Array(count).fill(total/count);
 }
 function rhythmSlices(level,total,kind){
  if(kind==='melody')return null;
  if(level==='beginner')return [total];
  if(level==='advanced'){
   const eighth=C.WHOLE/8;
   if(total%eighth===0&&total/eighth<=8)return sliceTicks(total,total/eighth);
  }
  const half=C.WHOLE/2;
  if(total%half===0)return sliceTicks(total,total/half);
  const quarter=C.WHOLE/4;
  if(total%quarter===0)return sliceTicks(total,total/quarter);
  return [total];
 }
 function formatRange(key,level){
  const range=rangeFor(key,level);
  if(!range)return '音程なし';
  const low=spell(range.low,true),high=spell(range.high,true);
  const name=pitch=>`${pitch.step}${pitch.alter>0?'♯':pitch.alter<0?'♭':''}${pitch.octave}`;
  return `記譜 ${name(low)}–${name(high)}`;
 }
 function describeRanges(parts,level){
  return parts.map((part,index)=>`${index+1}. ${part.instrument}: ${part.clef==='percussion'?'打楽器（音程のチェックなし）':formatRange(part.instrumentKey||I.profile(part)?.key,level)}`).join('\n');
 }
 function checkPart(part,level){
  if(part.clef==='percussion')return [];
  const range=rangeFor(part.instrumentKey||I.profile(part)?.key,level);
  if(!range)return [];
  const problems=[];
  part.measures.forEach((bar,mi)=>{
   for(const event of bar.events||[])if(event.type==='note')for(const pitch of event.pitches){
    const midi=midiOf(pitch);
    if(midi<range.low||midi>range.high)problems.push({measure:mi+1,midi,low:range.low,high:range.high,name:`${pitch.step}${pitch.alter===1?'♯':pitch.alter===-1?'♭':''}${pitch.octave}`});
   }
  });
  return problems;
 }
 function reportProblems(parts,level){
  const lines=[];
  parts.forEach((part,index)=>{
   for(const problem of checkPart(part,level))lines.push(`${index+1}番${part.instrument} ${problem.measure}小節の${problem.name}は${levelLabel(level)}の音域外です`);
  });
  return lines.length?`音域チェック（${levelLabel(level)}）:\n${lines.join('\n')}`:`音域チェック（${levelLabel(level)}）: 問題はありません。`;
 }
 function fixPart(part,level){
  if(part.clef==='percussion')return {part,moved:0};
  const range=rangeFor(part.instrumentKey||I.profile(part)?.key,level);
  if(!range)return {part,moved:0};
  let moved=0;
  const measures=part.measures.map(bar=>({...bar,events:bar.events.map(event=>{
   if(event.type!=='note')return event;
   const pitches=event.pitches.map(pitch=>{
    const fitted=fitOctave(midiOf(pitch),range.low,range.high);
    if(!fitted.shifted)return pitch;
    moved++;
    return {...pitch,...spell(fitted.midi,(part.key||0)>=0)};
   });
   return {...event,pitches:C.normalizeChord(pitches)};
  })}));
  return {part:{...part,measures},moved};
 }
 function chordAt(chords,fifths,index){
  if(Array.isArray(chords)&&chords[index])return parseChord(chords[index]);
  const root=tonic(fifths);
  return [root,(root+4)%12,(root+7)%12];
 }
 function writtenMidiFor(part,concertMidi,level,bias){
  const info=concertRange(part,level);
  if(!info)return concertMidi;
  const pc=((concertMidi%12)+12)%12;
  const chosen=pitchInRange(pc,info.low,info.high,bias)||concertMidi;
  const written=chosen-info.offset;
  return fitOctave(written,info.written.low,info.written.high).midi;
 }
 function eventsFromMelody(source,level){
  const slices=[];
  for(const event of source){
   const ticks=C.eventTicks(event);
   if(level==='beginner'&&ticks<C.WHOLE/4&&event.type==='note')continue;
   slices.push(event);
  }
  return slices.length?slices:source;
 }
 function arrangeMelody(doc,options={}){
  const level=levelOf(options.level);
  const parts=C.scoreParts(doc).map(part=>({...part,measures:part.measures.map(bar=>({...bar,events:bar.events.slice()}))}));
  const melodyIndex=options.melody===undefined||options.melody===null||options.melody===''?parts.findIndex(part=>part.measures.some(bar=>bar.events.some(event=>event.type==='note'))):Number(options.melody)-1;
  if(melodyIndex<0||melodyIndex>=parts.length)fail('旋律にするパートが見つかりません');
  const from=(options.from||1)-1,to=(options.to||parts[0].measures.length)-1;
  if(from<0||to>=parts[0].measures.length||to<from)fail('小節範囲が不正です');
  const concertFifths=(parts[melodyIndex].key||0)-((I.fifths[parts[melodyIndex].transposition]||0));
  let melodyVoices=0;
  const roles=parts.map((part,index)=>{
   if(index===melodyIndex)return 'source';
   const role=roleFor(part);
   if(role==='melody')return melodyVoices++<2?'double':'harmony';
   return role;
  });
  for(let mi=from;mi<=to;mi++){
   const barTicks=C.barTicks(parts[melodyIndex],mi);
   const melody=eventsFromMelody(parts[melodyIndex].measures[mi].events,level);
   const tones=chordAt(options.chords,concertFifths,mi-from);
   parts.forEach((part,index)=>{
    const role=roles[index];
    if(role==='source')return;
    const prefer=(part.key||0)>=0;
    let events=[];
    if((role==='double'||role==='counter')&&melody.some(event=>event.type==='note')){
     events=melody.map(event=>{
      if(event.type!=='note')return C.makeRest(event.den,event.dots);
      const concert=midiOf(event.pitches[0])+offsetOf(parts[melodyIndex].transposition,parts[melodyIndex].clef);
      const target=role==='counter'?thirdBelow(concert,concertFifths):concert;
      return C.makeNote(spell(writtenFromConcert(part,target,level),prefer),event.den,event.dots);
     });
    }else if(role==='rhythm'){
     const cymbal=part.instrumentKey==='cymbals'||part.instrumentKey==='suspendedCymbal';
     const midi=midiOf({step:cymbal?'E':'C',alter:0,octave:4});
     const slices=level==='beginner'?[barTicks]:rhythmSlices(level,barTicks,'rhythm');
     events=slices.map(ticks=>noteEvents(midi,ticks,true)).flat();
    }else{
     const bias=role==='bass'?'low':'mid';
     const pc=role==='bass'?tones[0]:tones[index%tones.length];
     const slices=rhythmSlices(level,barTicks,role);
     const concert=pitchInRange(pc,24,96,bias);
     const written=writtenMidiFor(part,concert,level,bias);
     events=slices.map(ticks=>noteEvents(written,ticks,prefer)).flat();
    }
    const used=events.reduce((sum,event)=>sum+C.eventTicks(event),0);
    if(used<barTicks)events.push(...C.fillRests(barTicks-used).map(rest=>C.makeRest(rest.den,rest.dots)));
    if(events.reduce((sum,event)=>sum+C.eventTicks(event),0)===barTicks)part.measures[mi]={...part.measures[mi],events};
   });
  }
  const report=reportProblems(parts,level);
  return {parts,summary:`${parts[melodyIndex].instrument}の旋律を${levelLabel(level)}の音域で分配しました。\n${report}`,level};
 }
 function doublePart(doc,options={}){
  const level=levelOf(options.level);
  const parts=C.scoreParts(doc);
  const from=Number(options.from)-1,to=Number(options.to)-1;
  if(!(from>=0&&to>=0&&from<parts.length&&to<parts.length)||from===to)fail('コピー元とコピー先のパートを指定してください');
  const start=(options.start||options.fromMeasure||1)-1,end=(options.end||options.toMeasure||parts[0].measures.length)-1;
  const interval=options.interval||'unison';
  const next=parts.map(part=>({...part,measures:part.measures.map(bar=>({...bar,events:bar.events.slice()}))}));
  for(let mi=start;mi<=end;mi++){
   const events=next[from].measures[mi].events.map(event=>{
    if(event.type!=='note')return C.makeRest(event.den,event.dots);
    let concert=midiOf(event.pitches[0])+offsetOf(next[from].transposition,next[from].clef);
    if(interval==='octave')concert+=12;
    if(interval==='downoctave'||interval==='octave-down')concert-=12;
    if(interval==='third')concert=thirdBelow(concert,(next[from].key||0)-(I.fifths[next[from].transposition]||0));
    const written=writtenFromConcert(next[to],concert,level);
    return C.makeNote(spell(written,(next[to].key||0)>=0),event.den,event.dots);
   });
   if(events.reduce((sum,event)=>sum+C.eventTicks(event),0)===C.barTicks(next[to],mi))next[to].measures[mi]={...next[to].measures[mi],events};
  }
  return {parts:next,summary:`${next[from].instrument}を${next[to].instrument}へ${interval==='octave'?'1オクターブ上で':interval==='third'?'3度下で':'ユニゾンで'}重ねました。\n${reportProblems([next[to]],level)}`,focus:to};
 }
 function voiceChords(doc,options={}){
  const level=levelOf(options.level);
  if(!Array.isArray(options.chords)||!options.chords.length)fail('chords に C、F、G のような和音を小節ごと並べてください');
  const parts=C.scoreParts(doc).map(part=>({...part,measures:part.measures.map(bar=>({...bar,events:bar.events.slice()}))}));
  const targets=parts.map((part,index)=>({part,index,role:roleFor(part)})).filter(item=>item.role==='bass'||item.role==='harmony'||item.role==='counter');
  const from=(options.from||1)-1;
  options.chords.forEach((symbol,offset)=>{
   const mi=from+offset;
   if(mi<0||mi>=parts[0].measures.length)return;
   const tones=parseChord(symbol);
   const ticks=C.barTicks(parts[0],mi);
   const slices=rhythmSlices(level,ticks,'harmony');
   for(const target of targets){
    const pc=target.role==='bass'?tones[0]:tones[target.index%tones.length];
    const written=writtenMidiFor(target.part,pitchInRange(pc,24,96,target.role==='bass'?'low':'mid'),level,target.role==='bass'?'low':'mid');
    const events=slices.map(size=>noteEvents(written,size,(target.part.key||0)>=0)).flat();
    if(events.reduce((sum,event)=>sum+C.eventTicks(event),0)===ticks)parts[target.index].measures[mi]={...parts[target.index].measures[mi],events};
   }
  });
  return {parts,summary:`和音を${levelLabel(level)}のリズムで配置しました。\n${reportProblems(parts,level)}`};
 }

 return {levelOf,levelLabel,rangeFor,fitOctave,plan,checkPart,reportProblems,fixPart,arrangeMelody,doublePart,voiceChords,describeRanges,parseChord,offsetOf,spell,formatRange};
});
