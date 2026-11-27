/* Pure score tools for the local assistant. They return a new document and never touch the editor. */
(function(root,factory){
 const C=root.KanadeCore||(typeof require==='function'?require('./core.js'):null);
 const B=root.KanadeEditing||(typeof require==='function'?require('./editing.js'):null);
 const I=root.KanadeInstruments||(typeof require==='function'?require('./instruments.js'):null);
 const Ex=root.KanadeExport||(typeof require==='function'?require('./musicxml.js'):null);
 const Arrange=root.KanadeArrange||(typeof require==='function'?require('./agent-arrange.js'):null);
 const Pop=root.KanadePopProgression||(typeof require==='function'?require('./pop-progression.js'):null);
 const Ensemble=root.KanadeAgentEnsemble||(typeof require==='function'?require('./agent-ensemble.js'):null);
 const api=factory(C,B,I,Ex,Arrange,Ensemble,Pop,root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeAgentTools=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,B,I,Ex,Arrange,Ensemble,Pop,root){
 'use strict';
 const DENOMS=new Set([1,2,4,8,16,32,64]);
 const KEY_NAMES={
  c:0,am:0,'ハ':0,'ハ長調':0,g:1,em:1,'ト':1,'ト長調':1,d:2,bm:2,'ニ':2,'ニ長調':2,
  a:3,'f#m':3,'イ':3,'イ長調':3,e:4,'c#m':4,'ホ':4,'ホ長調':4,b:5,'g#m':5,'ロ':5,'ロ長調':5,
  'f#':6,'嬰ヘ':6,'嬰ヘ長調':6,'c#':7,'嬰ハ':7,f:-1,dm:-1,'ヘ':-1,'ヘ長調':-1,
  bb:-2,gm:-2,'b♭':-2,'変ロ':-2,'変ロ長調':-2,eb:-3,cm:-3,'e♭':-3,'変ホ':-3,'変ホ長調':-3,
  ab:-4,fm:-4,'a♭':-4,'変イ':-4,'変イ長調':-4,db:-5,'d♭':-5,'変ニ':-5,gb:-6,'g♭':-6,'変ト':-6,cb:-7,'c♭':-7,'変ハ':-7
 };
 const STEP_NAMES={
  getScoreSummary:'楽譜の概要を確認',readMeasures:'小節を読む',listEnsembleTemplates:'編成テンプレートを確認',
  setMetadata:'曲名または作曲者を変更',setTempo:'テンポを変更',setKey:'調号を変更',setTimeSignature:'拍子を変更',
  addParts:'パートを追加',applyEnsembleTemplate:'編成テンプレートを適用',proposeEnsembleOptions:'編成案を提示',applyEnsembleOption:'編成案を適用',
  reorderParts:'パート順を変更',changePartInstrument:'楽器を変更',removePartRedistribute:'パート削除と譜面移行',removePart:'パートを削除',
  insertNotes:'音符を入力',writePhrase:'フレーズを短いテキストで入力',insertRests:'休符を入力',transpose:'移調',addMeasures:'小節を追加',
  removeMeasures:'小節を削除',undoAiChange:'直前のAI編集を取り消し',exportMusicXML:'MusicXMLを書き出し',
  proposeInstrumentation:'編成を提案',arrangeMelody:'旋律を編成に分配',doublePart:'パートを重ねる',
  voiceChords:'和音を配置',checkRanges:'音域を確認',fixRanges:'音域に収める',getInstrumentRanges:'音域表を確認',
  applyPopProgression:'ポップ進行を伴奏として入力',
  inspireSpark:'作曲のひらめきを生成（必要なら楽譜に反映）',
  setGrandStaff:'大譜表のオン／オフ',groupParts:'隣接パートを括弧でまとめる'
 };

 function fail(message){throw new Error(message);}
 function sparkApi(){
  return (root&&root.KanadeInspirationSpark)||(typeof require==='function'?require('./inspiration-spark.js'):null);
 }
 function popApi(){
  return (root&&root.KanadePopProgression)||Pop||(typeof require==='function'?require('./pop-progression.js'):null);
 }
 function builtInSparkPhrase(args={}){
  const bars=Math.max(1,Math.min(8,Number.isInteger(args.bars)?args.bars:Number.isInteger(args.measures)?args.measures:4));
  const mood=String(args.mood||'').toLowerCase();
  const ballad=/ballad|切ない|sad|melancholy|穏やか|calm|gentle/.test(mood);
  const motifs=ballad
   ?['E4 q G4 q A4 h','A4 q G4 q E4 h','D4 q F4 q A4 h','E4 q D4 q C4 h']
   :['G4 q G4 q C5 h','G4 q A4 q G4 h','E4 q G4 q C5 h','D4 q E4 q G4 h'];
  const lines=[];
  for(let i=0;i<bars;i++)lines.push(motifs[i%motifs.length]);
  return lines.join(' | ');
 }
 function resolveSparkMood(Spark,value){
  const text=String(value||'').trim();
  if(!text)return '';
  if(Spark.MOODS.includes(text))return text;
  const lower=text.toLowerCase();
  const map={
   ballad:'切ない',sad:'切ない',melancholy:'切ない',bright:'明るい',happy:'明るい',cheerful:'明るい',
   heroic:'勇ましい',march:'勇ましい',mystery:'ミステリアス',mysterious:'ミステリアス',
   calm:'穏やか',gentle:'穏やか',light:'軽快',lively:'軽快',grand:'荘厳',urgent:'切迫',tense:'切迫'
  };
  if(map[lower])return map[lower];
  return Spark.MOODS.find(mood=>text.includes(mood))||'';
 }
 function planInspireSpark(doc,args){
  const Spark=sparkApi();
  const index=resolvePart(doc,args.part??1);
  const from=integer(args.measure??args.from??1,'開始小節',1,500)-1;
  const apply=args.apply===undefined?true:flag(args.apply);
  const part=partsOf(doc)[index];
  if(!Spark){
   const bars=Math.max(1,Math.min(8,Number.isInteger(args.bars)?args.bars:Number.isInteger(args.measures)?args.measures:4));
   const end=from+bars-1;
   const conflict=[];
   for(let mi=from;mi<=end&&mi<part.measures.length;mi++){
    if((part.measures[mi].events||[]).some(event=>event.type==='note'))conflict.push(mi);
   }
   return {Spark:null,fallback:true,bars,index,from,end,conflict,name:part.instrument,apply,args};
  }
  const seed=Number.isInteger(args.seed)?args.seed:Number.isInteger(Number(args.seed))?Number(args.seed):((Math.random()*0xffffffff)>>>0);
  const mood=resolveSparkMood(Spark,args.mood);
  const bars=Number.isInteger(args.bars)?args.bars:Number.isInteger(args.measures)?args.measures:undefined;
  const spark=Spark.rollSpark(seed,mood?{mood}:null,mood?{mood:true}:Spark.emptyLocks(),bars?{bars}: {});
  const end=from+spark.bars-1;
  const conflict=[];
  for(let mi=from;mi<=end&&mi<part.measures.length;mi++){
   if((part.measures[mi].events||[]).some(event=>event.type==='note'))conflict.push(mi);
  }
  return {Spark,spark,fallback:false,index,from,end,conflict,name:part.instrument,apply};
 }
 function integer(value,label,min,max){
  const number=typeof value==='string'&&/^-?\d+$/.test(value.trim())?Number(value.trim()):value;
  if(!Number.isInteger(number)||number<min||number>max)fail(`${label}は${min}から${max}の整数で指定してください`);
  return number;
 }
 function flag(value){return value===true||value==='true'||value===1||value==='1';}
 function partsOf(doc){return C.scoreParts(doc);}
 function assemble(doc,parts){
  const [first,...rest]=parts;
  const next={...first,title:first.title,composer:first.composer,tempo:first.tempo,time:first.time};
  if(first.meterTail)next.meterTail=first.meterTail;else delete next.meterTail;
  if(rest.length)next.ensembleParts=rest.map(part=>({...part,title:first.title,composer:first.composer,tempo:first.tempo,time:first.time,meterTail:first.meterTail}));
  if(doc.publication)next.publication=doc.publication;
  if(doc.clipBank)next.clipBank=doc.clipBank;
  if(doc.sceneLinks)next.sceneLinks=doc.sceneLinks;
  if(doc.staffGroups)next.staffGroups=doc.staffGroups;
  if(doc.bassPart)next.bassPart=doc.bassPart;
  const errors=C.validateScore(next);
  if(errors.length)fail(errors[0]);
  return next;
 }
 function concertOf(doc){
  const pitched=partsOf(doc).find(part=>part.clef!=='percussion');
  if(!pitched)return 0;
  return (pitched.key||0)-(I.fifths[pitched.transposition]||0);
 }
 function writtenKey(item,concert){
  if(item.clef==='percussion')return 0;
  const key=concert+(I.fifths[item.transposition]||0);
  if(key<-7||key>7)fail(`${item.name}では、この調の記譜用調号が範囲外です`);
  return key;
 }
 function resolvePart(doc,part){
  const parts=partsOf(doc);
  if(part===undefined||part===null||part==='')return 0;
  if(typeof part==='number'||typeof part==='string'&&/^\d+$/.test(part.trim())){
   const number=integer(part,'パート番号',1,parts.length);
   return number-1;
  }
  const query=String(part).trim();
  const hits=parts.flatMap((item,index)=>{
   const name=item.instrument||'';
   const key=item.instrumentKey||I.profile(item)?.key||'';
   return name===query||name.includes(query)||key===query?[index]:[];
  });
  if(hits.length===1)return hits[0];
  if(!hits.length){
   if(parts.length===1)return 0;
   fail(`「${query}」というパートが見つかりません`);
  }
  fail(`「${query}」に複数のパートが一致します。番号で指定してください`);
 }
 function hasNotes(doc){
  return partsOf(doc).some(part=>part.measures.some(bar=>[...(bar.events||[]),...(bar.voice2||[]),...(bar.staff2||[])].some(event=>event.type==='note')));
 }
 function emptyMeasures(source){
  return source.measures.map(bar=>({id:C.uid(),events:[],...(bar.time?{time:{...bar.time}}:{})}));
 }
 function partFromItem(doc,item,concert,{reuse=null}={}){
  const {staves,...seed}=C.createScore();
  return C.applyInstrumentStaves({...seed,id:reuse?doc.id:C.uid(),instrument:item.name,instrumentKey:item.key,clef:item.clef,
   staffLines:item.staffLines,sound:item.sound,transposition:item.transposition,key:writtenKey(item,concert),
   title:doc.title,composer:doc.composer,time:doc.time,tempo:doc.tempo,...(doc.meterTail?{meterTail:doc.meterTail}:{}),
   measures:reuse?reuse:emptyMeasures(doc)},item.key);
 }
 function resolveStaff(part,args,pitches){
  if(!C.isGrandStaff(part))return 1;
  if(args.staff!==undefined&&args.staff!==null&&args.staff!==''){
   return integer(args.staff,'譜表',1,2);
  }
  const midis=(pitches||[]).map(pitch=>C.pitchMidi(pitch)).filter(Number.isFinite);
  if(!midis.length)return 1;
  const avg=midis.reduce((sum,value)=>sum+value,0)/midis.length;
  return avg>=60?1:2;
 }
 function editStaffPart(doc,index,staff,fn){
  const part=partsOf(doc)[index];
  if(staff===1||!C.isGrandStaff(part))return editPart(doc,index,fn);
  const view=C.staffScore(part,staff);
  const edited=fn(view);
  return editPart(doc,index,()=>C.mergeStaff(part,staff,edited));
 }
 function instrumentItem(value){
  if(I.byKey.get(value))return I.byKey.get(value);
  const text=String(value||'').trim();
  const exact=I.catalog.find(item=>item.name===text||item.english.toLowerCase()===text.toLowerCase()||item.key===text);
  if(exact)return exact;
  const matched=I.match(text);
  if(matched)return matched[1];
  fail(`楽器「${text}」はカタログにありません。clarinet や trumpet のようなキーで指定してください`);
 }
 function templateBy(id){
  const query=String(id||'').trim();
  const found=I.templates.find(item=>item.id===query||item.name===query);
  if(!found)fail(`編成「${query}」はありません。wind、smallWind、windSymphony、marching などを指定してください`);
  return found;
 }
 function editPart(doc,index,editor){
  const parts=partsOf(doc);
  const edited=editor(parts[index]);
  if(parts.length===1)return assemble(doc,[edited]);
  const replaced=C.replaceScorePart(assemble(doc,parts),index,edited);
  return replaced.ensembleParts?.length?replaced:assemble(doc,[(({ensembleParts,...solo})=>solo)(replaced)]);
 }
 function ensureMeasureCount(doc,count){
  const needed=integer(count,'小節数',1,500);
  const parts=partsOf(doc).map(part=>{
   let next=part;
   while(next.measures.length<needed){
    if(next.measures.length>=500)fail('小節数の上限です');
    next=C.addMeasure(next);
   }
   return next;
  });
  return assemble(doc,parts);
 }
 function planWritePhrase(doc,args){
  const index=resolvePart(doc,args.part);
  const part=partsOf(doc)[index];
  const name=part.instrument;
  const segments=parsePhraseSegments(args.phrase);
  const pitches=segments.flat().filter(note=>note.type!=='rest').map(note=>({step:note.step,alter:note.alter||0,octave:note.octave}));
  const staff=resolveStaff(part,args,pitches);
  const view=C.staffScore(part,staff);
  const start=integer(args.measure??1,'小節',1,500)-1;
  const end=start+segments.length-1;
  const needed=end+1;
  const conflict=[];
  for(let mi=start;mi<=end;mi++){
   if(mi>=view.measures.length)continue;
   if((view.measures[mi].events||[]).some(event=>event.type==='note'))conflict.push(mi);
  }
  return {index,name,segments,start,end,needed,conflict,beat:args.beat,overwrite:flag(args.overwrite),staff};
 }
 function measureRange(part,from,to){
  const start=integer(from??1,'開始小節',1,part.measures.length)-1;
  const end=integer(to??part.measures.length,'終了小節',start+1,part.measures.length)-1;
  return [start,end];
 }
 function beatTick(part,measureIndex,beat){
  const time=C.timeAt(part,measureIndex),beatTicks=C.WHOLE/time.den;
  const value=beat===undefined?1:Number(beat);
  if(!Number.isFinite(value)||value<1)fail('拍は1以上で指定してください');
  const tick=Math.round((value-1)*beatTicks);
  if(tick<0||tick>=C.barTicks(part,measureIndex))fail('拍が小節の長さを超えています');
  return tick;
 }
 function coerceDen(value){
  if(typeof value==='string'){
   const letter=value.trim().toLowerCase();
   const map={w:1,h:2,q:4,e:8,s:16,t:32};
   if(map[letter]!=null)return map[letter];
  }
  return value;
 }
 function normalizePitchFields(spec){
  if(!spec||typeof spec!=='object')return spec;
  const next={...spec};
  let step=String(next.step??'').trim();
  let alter=next.alter;
  const split=step.match(/^([A-Ga-g])\s*([#b♯♭+-])$/);
  if(split){
   step=split[1];
   const mark=split[2];
   alter=(mark==='#'||mark==='♯'||mark==='+')?1:(mark==='b'||mark==='♭'||mark==='-')?-1:0;
  }
  next.step=step;
  if(alter!==undefined&&alter!==null&&alter!=='')next.alter=alter;
  else if(next.alter===undefined)next.alter=0;
  if(next.tie===null||next.tie===undefined||next.tie===''||next.tie===false)delete next.tie;
  return next;
 }
 function makeEvent(spec,tieStart){
  if(!spec||typeof spec!=='object')fail('音符の指定が不正です');
  const normalized=normalizePitchFields(spec);
  const den=integer(coerceDen(normalized.den??4),'音価',1,64);
  if(!DENOMS.has(den))fail('音価は1、2、4、8、16、32、64のいずれかです');
  const dots=integer(normalized.dots??0,'付点',0,2);
  if(normalized.type==='rest'||normalized.rest===true)return C.makeRest(den,dots);
  const step=String(normalized.step||'').toUpperCase();
  if(!/^[A-G]$/.test(step))fail(`音名「${spec.step}」が不正です`);
  const alter=integer(normalized.alter??0,'臨時記号',-2,2);
  const octave=integer(normalized.octave??4,'オクターブ',0,8);
  const note=C.makeNote({step,alter,octave},den,dots);
  if(tieStart||flag(normalized.tie))note.tieStart=true;
  return note;
 }
 const PHRASE_DEN={w:1,h:2,q:4,e:8,s:16,t:32,W:1,H:2,Q:4,E:8,S:16,T:32};
 function parsePhraseDuration(code,fallback){
  if(code===undefined||code===null||code==='')return integer(fallback??4,'音価',1,64);
  const letter=String(code).trim();
  if(/^\d+$/.test(letter))return integer(letter,'音価',1,64);
  const den=PHRASE_DEN[letter]??PHRASE_DEN[letter.toLowerCase()];
  if(!den)fail(`音価「${letter}」は w h q e s t か 1〜64 で指定してください`);
  return den;
 }
 function phraseAlter(acc){
  if(!acc)return 0;
  if(acc==='#'||acc==='+'||acc==='♯')return 1;
  if(acc==='-'||acc==='b'||acc==='♭')return -1;
  return 0;
 }
 function parsePhraseSegments(phrase){
  const text=String(phrase||'').trim();
  if(!text)fail('phrase を指定してください');
  const segments=text.split('|').map(part=>part.trim()).filter(Boolean);
  if(!segments.length)fail('phrase を指定してください');
  const hint='C5 q、Bb4 h、G4q、r4 のように書いてください。小節区切りは | です。';
  return segments.map((segment,segIndex)=>{
   const tokens=segment.match(/[^\s,;]+/g)||[];
   if(!tokens.length)fail(`小節 ${segIndex+1} が空です。${hint}`);
   const notes=[];
   for(let index=0;index<tokens.length;){
    const token=tokens[index];
    const rest=token.match(/^(r|rest)([whqest]|\d+)?$/i);
    if(rest){
     notes.push({type:'rest',den:parsePhraseDuration(rest[2],4),dots:0});
     index++;
     continue;
    }
    const compact=token.match(/^([A-Ga-g])([#b♯♭+-]?)(\d+)([whqest])(\d)?$/i);
    if(compact){
     notes.push({step:compact[1].toUpperCase(),alter:phraseAlter(compact[2]),octave:integer(compact[3],'オクターブ',0,8),den:parsePhraseDuration(compact[4],4),dots:compact[5]?integer(compact[5],'付点',0,2):0});
     index++;
     continue;
    }
    const pitch=token.match(/^([A-Ga-g])([#b♯♭+-]?)(\d+)$/i);
    if(pitch){
     let den=4,dots=0;
     const next=tokens[index+1];
     if(next&&/^[whqest]\d?$/i.test(next)){den=parsePhraseDuration(next,4);dots=/\d$/.test(next)?integer(next.slice(-1),'付点',0,2):0;index+=2;}
     else if(next&&/^\d+$/.test(next)){den=integer(next,'音価',1,64);index+=2;}
     else index++;
     notes.push({step:pitch[1].toUpperCase(),alter:phraseAlter(pitch[2]),octave:integer(pitch[3],'オクターブ',0,8),den,dots});
     continue;
    }
    fail(`「${token}」が読めません。${hint}`);
   }
   return notes;
  });
 }
 function parseSequence(list,kind){
  if(!Array.isArray(list)||!list.length||list.length>64)fail(`${kind}は1〜64個で指定してください`);
  const events=list.map((spec,index)=>{
   const event=makeEvent(kind==='休符'?{...spec,type:'rest'}:spec,false);
   if(kind==='音符'&&event.type!=='note')fail(`${index+1}個目が音符ではありません`);
   return event;
  });
  for(let index=0;index<events.length-1;index++){
   if(events[index].tieStart&&events[index+1].type==='note')events[index+1].tieStop=true;
  }
  return events;
 }
 function placeSequence(part,measureIndex,tick,events,overwrite){
  let next=part,abs=C.measureOffsets(part)[measureIndex]+tick;
  for(const event of events){
   let offsets=C.measureOffsets(next);
   while(abs>=offsets.at(-1)){
    if(next.measures.length>=500)fail('小節数の上限です');
    next=C.addMeasure(next);offsets=C.measureOffsets(next);
   }
   const loc=C.locateTick(offsets,abs);
   const placed=C.placeAcrossBars(next,loc.mi,loc.tick,event,{overwrite});
   next=placed.score;
   abs+=C.durationTicks(event.den,event.dots);
  }
  return next;
 }
 function affectedHasNotes(part,measureIndex,tick,events){
  const length=events.reduce((total,event)=>total+C.durationTicks(event.den,event.dots),0);
  const start=C.measureOffsets(part)[measureIndex]+tick,end=start+length,offsets=C.measureOffsets(part);
  for(let mi=0;mi<part.measures.length;mi++){
   if(offsets[mi+1]<=start||offsets[mi]>=end)continue;
   for(const span of C.eventSpans(part,mi,false)){
    const absStart=offsets[mi]+span.start,absEnd=offsets[mi]+span.end;
    if(absEnd>start&&absStart<end&&span.event.type==='note')return true;
   }
  }
  return false;
 }
 function spell(midi,preferSharps){
  const pc=((midi%12)+12)%12,octave=Math.floor(midi/12)-1;
  const sharp=['C','C','D','D','E','F','F','G','G','A','A','B'];
  const flat=['C','D','D','E','E','F','G','G','A','A','B','B'];
  const sharpAlter=[0,1,0,1,0,0,1,0,1,0,1,0];
  const flatAlter=[0,-1,0,-1,0,0,-1,0,-1,0,-1,0];
  if(octave<0||octave>8)fail('移調すると音域（オクターブ0〜8）の外に出ます');
  return {step:(preferSharps?sharp:flat)[pc],alter:(preferSharps?sharpAlter:flatAlter)[pc],octave};
 }
 function formatEvents(part,mi){
  const events=part.measures[mi].events;
  if(!events.length)return '（空）';
  return events.map(event=>C.eventLabel(event).replace(/\s+/g,' ')).join(' | ');
 }
 function summaryText(doc){
  const parts=partsOf(doc);
  return [`曲名: ${doc.title||'なし'}`,`テンポ: ♩=${doc.tempo}`,`小節数: ${parts[0].measures.length}`,`パート数: ${parts.length}`,
   ...parts.map((part,index)=>`${index+1}. ${part.instrument} / 調号 ${part.key} / 移調 ${part.transposition||'concert'}`)].join('\n');
 }

 const operations={
  getScoreSummary:{
   description:'開いている楽譜の曲名、テンポ、拍子、パート一覧を返す。編集前に使う。',
   parameters:{type:'object',properties:{}},
   run(doc){return {summary:summaryText(doc)};}
  },
  readMeasures:{
   description:'指定パートの小節範囲を読む。partは番号か楽器名。fromとtoは1始まり。最大16小節。',
   parameters:{type:'object',properties:{part:{type:'string'},from:{type:'integer'},to:{type:'integer'}}},
   run(doc,args){
    const index=resolvePart(doc,args.part);
    const part=partsOf(doc)[index];
    const [from,to]=measureRange(part,args.from??1,args.to??Math.min(part.measures.length,(args.from??1)+3));
    if(to-from+1>16)fail('一度に読めるのは16小節までです');
    const lines=[`${index+1}. ${part.instrument} の${from+1}〜${to+1}小節（記譜音）:`];
    for(let mi=from;mi<=to;mi++)lines.push(`${mi+1}: ${formatEvents(part,mi)}`);
    return {summary:lines.join('\n')};
   }
  },
  listEnsembleTemplates:{
   description:'使える編成テンプレートのidと名前を返す。',
   parameters:{type:'object',properties:{}},
   run(){return {summary:I.templates.map(item=>`${item.id}: ${item.name}（${item.keys.length}）`).join('\n')};}
  },
  setMetadata:{
   description:'曲名または作曲者を変える。不要な項目は省略する。',
   parameters:{type:'object',properties:{title:{type:'string'},composer:{type:'string'}}},
   run(doc,args){
    const patch={};
    if(args.title!==undefined){
     if(typeof args.title!=='string'||!args.title.trim()||args.title.trim().length>200)fail('曲名は1〜200文字です');
     patch.title=args.title.trim();
    }
    if(args.composer!==undefined){
     if(typeof args.composer!=='string'||args.composer.length>200)fail('作曲者は200文字までです');
     patch.composer=args.composer.trim();
    }
    if(!Object.keys(patch).length)fail('曲名または作曲者を指定してください');
    const next=editPart(doc,0,part=>C.withSettings(part,patch));
    const bits=[];
    if(patch.title)bits.push(`曲名を「${patch.title}」に変更`);
    if(patch.composer!==undefined)bits.push(`作曲者を「${patch.composer||'なし'}」に変更`);
    return {document:next,summary:bits.join('、')+'しました'};
   }
  },
  setTempo:{
   description:'テンポ（四分音符のBPM）を20〜300で設定する。',
   parameters:{type:'object',properties:{tempo:{type:'integer'}},required:['tempo']},
   run(doc,args){
    const tempo=integer(args.tempo,'テンポ',20,300);
    return {document:editPart(doc,0,part=>C.withSettings(part,{tempo})),summary:`テンポを♩=${tempo}にしました`};
   }
  },
  setKey:{
   description:'コンサート調の五度圏を設定する。0がハ長調、2がニ長調、-3が変ホ長調。移調楽器の記譜調号も合わせる。',
   parameters:{type:'object',properties:{fifths:{type:'integer'},name:{type:'string'}}},
   run(doc,args){
    let fifths;
    if(args.name!==undefined){
     const key=KEY_NAMES[String(args.name).trim().toLowerCase().replace(/\s+/g,'')];
     if(key===undefined)fail('調の名前を解釈できません。fifths（ハ長調は0、変ホ長調は-3）で指定してください');
     fifths=key;
    }else fifths=integer(args.fifths,'調号',-7,7);
    const parts=partsOf(doc).map(part=>{
     const item=I.byKey.get(part.instrumentKey)||I.profile(part)||{clef:part.clef,transposition:part.transposition,name:part.instrument};
     const key=part.clef==='percussion'?0:writtenKey(item,fifths);
     return key===part.key?part:{...part,key};
    });
    return {document:assemble(doc,parts),summary:`調をコンサートの五度圏 ${fifths} にしました。移調楽器は記譜用の調号です`};
   }
  },
  setTimeSignature:{
   description:'拍子を変える。measureは1始まり。numは1〜12、denは2、4、8、16。countを省略すると最後まで。',
   parameters:{type:'object',properties:{measure:{type:'integer'},num:{type:'integer'},den:{type:'integer'},count:{type:'integer'}},required:['num','den']},
   run(doc,args){
    const num=integer(args.num,'拍子の分子',1,12),den=integer(args.den,'拍子の分母',2,16);
    if(![2,4,8,16].includes(den))fail('拍子の分母は2、4、8、16です');
    const parts=partsOf(doc);
    const start=integer(args.measure??1,'小節',1,parts[0].measures.length)-1;
    const count=args.count===undefined?null:integer(args.count,'小節数',1,parts[0].measures.length-start);
    const updated=parts.map((part,index)=>{
     try{return C.setMeter(part,start,[{num,den}],count);}
     catch(error){fail(`${index+1}番パート: ${error.message}`);}
    });
    const whole=start===0&&count===null;
    const first=updated[0];
    const synced=updated.map(part=>({...part,time:whole?{num,den}:first.time,meterTail:first.meterTail}));
    return {document:assemble(doc,synced),summary:`${start+1}小節目から拍子を${num}/${den}にしました`};
   }
  },
  addParts:{
   description:'楽器を末尾に追加する。keysはclarinet、trumpetのようなカタログキーの配列。',
   parameters:{type:'object',properties:{keys:{type:'array',items:{type:'string'}}},required:['keys']},
   run(doc,args){
    if(!Array.isArray(args.keys)||!args.keys.length||args.keys.length>32)fail('追加する楽器を1〜32個指定してください');
    const existing=partsOf(doc);
    if(existing.length+args.keys.length>32)fail('編成は32パートまでです');
    const concert=concertOf(doc);
    const added=args.keys.map(key=>partFromItem(doc,instrumentItem(key),concert));
    const numbered=I.numberParts([...existing,...added],added.map((_,index)=>existing.length+index));
    const focus=existing.length;
    return {document:assemble(doc,numbered),focusPart:focus,summary:`${added.map(part=>part.instrument).join('、')}を追加しました`};
   }
  },
  applyEnsembleTemplate:{
   description:'編成テンプレートを使う。idはwind、smallWind、windSymphony、marching、brassBandなど。空の楽譜では入れ替える。音符がある楽譜を入れ替えるときはreplaceをtrueにする。',
   ensembleChange:true,
   parameters:{type:'object',properties:{id:{type:'string'},replace:{type:'boolean'}},required:['id']},
   confirm(doc,args){
    const template=templateBy(args.id);
    if(flag(args.replace)&&hasNotes(doc))return `${template.name}（${template.keys.length}パート）に入れ替えます。いまの音符は残しません。`;
    return null;
   },
   run(doc,args){
    const template=templateBy(args.id);
    const replace=flag(args.replace)||(partsOf(doc).length===1&&!hasNotes(doc));
    if(!replace&&partsOf(doc).length+template.keys.length>32)fail('追加すると32パートを超えます');
    const concert=concertOf(doc);
    if(replace){
     const created=template.keys.map((key,index)=>partFromItem(doc,I.byKey.get(key),concert,{reuse:index===0?emptyMeasures(doc):null}));
     const numbered=I.numberParts(created,created.map((_,index)=>index));
     return {document:assemble(doc,numbered),focusPart:0,summary:`${template.name}（${template.keys.length}パート）に入れ替えました`};
    }
    const existing=partsOf(doc);
    const added=template.keys.map(key=>partFromItem(doc,I.byKey.get(key),concert));
    const numbered=I.numberParts([...existing,...added],added.map((_,index)=>existing.length+index));
    return {document:assemble(doc,numbered),focusPart:existing.length,summary:`${template.name}の${added.length}パートを追加しました`};
   }
  },
  removePart:{
   description:'パートを1つ削除する。最後の1パートは消せない。実行前に確認が必要。',
   parameters:{type:'object',properties:{part:{type:'string'}},required:['part']},
   confirm(doc,args){
    const index=resolvePart(doc,args.part);
    return `${index+1}番「${partsOf(doc)[index].instrument}」を削除します。`;
   },
   run(doc,args){
    const index=resolvePart(doc,args.part),parts=partsOf(doc);
    if(parts.length<2)fail('最後のパートは削除できません');
    const name=parts[index].instrument;
    const nextParts=parts.filter((_,item)=>item!==index);
    return {document:assemble(doc,nextParts),focusPart:Math.max(0,index-1),summary:`${name}を削除しました`};
   }
  },
  writePhrase:{
   description:'記譜音の旋律を短いテキストで書く。phrase は "G4 q G4 q C5 h | G4 q G4 q G4 h" のように音高＋音価。音価は w h q e s t（全二分四分八分十六分三十二分）または数字。休符は r4。小節区切りは |。大譜表では staff に 1（上段）か 2（下段）。省略時は音高で自動選択（C4未満は下段）。既存の音符を置き換える・書き直すときは overwrite を true。',
   parameters:{type:'object',properties:{part:{type:'string'},measure:{type:'integer'},beat:{type:'number'},phrase:{type:'string'},overwrite:{type:'boolean'},staff:{type:'integer'}},required:['phrase']},
   confirm(doc,args){
    const plan=planWritePhrase(doc,args);
    if(!plan.conflict.length)return null;
    return `${plan.name}の${plan.start+1}〜${plan.end+1}小節目の音符を置き換えます。`;
   },
   run(doc,args){
    const plan=planWritePhrase(doc,args);
    const overwrite=plan.overwrite||plan.conflict.length>0;
    let current=ensureMeasureCount(doc,plan.needed);
    let focus=plan.index,count=0;
    for(let bar=0;bar<plan.segments.length;bar++){
     const measure=plan.start+bar;
     const notes=plan.segments[bar].map(note=>note.type==='rest'?{type:'rest',den:note.den,dots:note.dots||0}:{step:note.step,alter:note.alter,octave:note.octave,den:note.den,dots:note.dots||0});
     const placed=operations.insertNotes.run(current,{part:args.part??plan.name,measure:measure+1,beat:bar===0?plan.beat:1,notes,overwrite,staff:plan.staff});
     current=placed.document;
     focus=placed.focusPart??focus;
     count+=notes.length;
     current=ensureMeasureCount(current,Math.max(plan.needed,partsOf(current)[0].measures.length));
    }
    const verb=overwrite&&plan.conflict.length?'置き換え':'入力';
    const staffLabel=plan.staff===2?'（下段）':'';
    return {document:current,focusPart:focus,summary:`${plan.name}${staffLabel}の${plan.start+1}〜${plan.end+1}小節を${verb}しました（${plan.segments.length}小節・${count}音）`};
   }
  },
  insertNotes:{
   description:'記譜音の音符を拍位置から順に置く。notesの各要素はstep、octave、den、必要ならalter、dots、tie。大譜表では staff に 1 または 2。省略時は音高で自動選択。overwriteがtrueなら重なった音符を置き換える。',
   parameters:{type:'object',properties:{part:{type:'string'},measure:{type:'integer'},beat:{type:'number'},overwrite:{type:'boolean'},staff:{type:'integer'},notes:{type:'array'}},required:['measure','notes']},
   confirm(doc,args){
    if(!flag(args.overwrite))return null;
    const index=resolvePart(doc,args.part),part=partsOf(doc)[index];
    const events=parseSequence(args.notes,'音符');
    const staff=resolveStaff(part,args,events.filter(event=>event.type==='note').flatMap(event=>event.pitches||[]));
    const view=C.staffScore(part,staff);
    const measure=integer(args.measure,'小節',1,view.measures.length)-1;
    if(!affectedHasNotes(view,measure,beatTick(view,measure,args.beat),events))return null;
    return `${index+1}番${part.instrument}の${measure+1}小節目付近にある音符を置き換えます。`;
   },
   run(doc,args){
    const index=resolvePart(doc,args.part),part=partsOf(doc)[index];
    const measure=integer(args.measure,'小節',1,500)-1;
    if(measure>=part.measures.length)fail(`${part.measures.length}小節までしかありません`);
    const events=parseSequence(args.notes,'音符');
    const staff=resolveStaff(part,args,events.filter(event=>event.type==='note').flatMap(event=>event.pitches||[]));
    const view=C.staffScore(part,staff);
    const edited=placeSequence(view,measure,beatTick(view,measure,args.beat),events,flag(args.overwrite));
    return {document:editStaffPart(doc,index,staff,()=>edited),focusPart:index,
     summary:`${part.instrument}${staff===2?'（下段）':''}の${measure+1}小節から${events.length}音を入力しました`};
   }
  },
  setGrandStaff:{
   description:'パートを大譜表（ト音＋ヘ音）にする、または1段に戻す。on が true なら大譜表。ピアノ・ハープ・マリンバ・チェレスタ・オルガン向け。',
   parameters:{type:'object',properties:{part:{type:'string'},on:{type:'boolean'}},required:['on']},
   run(doc,args){
    const index=resolvePart(doc,args.part),part=partsOf(doc)[index];
    const enabled=flag(args.on);
    const edited=C.setGrandStaff(part,enabled);
    return {document:editPart(doc,index,()=>edited),focusPart:index,
     summary:`${part.instrument}を${enabled?'大譜表にしました':'1段に戻しました'}`};
   }
  },
  groupParts:{
   description:'隣接するパートを括弧（bracket）または中括弧（brace）でまとめる。parts はパート番号の配列、または start と end（1始まり）。symbol は bracket か brace。',
   parameters:{type:'object',properties:{parts:{type:'array'},start:{type:'integer'},end:{type:'integer'},symbol:{type:'string'}}},
   run(doc,args){
    const symbol=String(args.symbol||'bracket')==='brace'?'brace':'bracket';
    let start,end;
    if(Array.isArray(args.parts)&&args.parts.length){
     const indexes=args.parts.map(value=>resolvePart(doc,value)).sort((a,b)=>a-b);
     start=indexes[0];end=indexes.at(-1);
     if(indexes.some((value,i)=>i&&value!==indexes[i-1]+1))fail('まとめるパートは連続している必要があります');
    }else{
     start=integer(args.start??1,'開始パート',1,partsOf(doc).length)-1;
     end=integer(args.end??start+2,'終了パート',start+1,partsOf(doc).length)-1;
    }
    if(end<=start)fail('2つ以上のパートを指定してください');
    const next=C.groupParts(doc,start,end,symbol);
    return {document:next,focusPart:start,summary:`${start+1}〜${end+1}番パートを${symbol==='brace'?'中括弧':'括弧'}でまとめました`};
   }
  },
  insertRests:{
   description:'休符を拍位置から順に置く。restsの各要素はdenとdots。',
   parameters:{type:'object',properties:{part:{type:'string'},measure:{type:'integer'},beat:{type:'number'},rests:{type:'array'}},required:['measure','rests']},
   run(doc,args){
    const index=resolvePart(doc,args.part),part=partsOf(doc)[index];
    const measure=integer(args.measure,'小節',1,part.measures.length)-1;
    const events=parseSequence(args.rests,'休符');
    const edited=placeSequence(part,measure,beatTick(part,measure,args.beat),events,false);
    return {document:editPart(doc,index,()=>edited),focusPart:index,summary:`${part.instrument}の${measure+1}小節から休符を${events.length}個置きました`};
   }
  },
  transpose:{
   description:'パートの小節範囲を移調する。全音上げはsemitones:2、半音上げはsemitones:1。音名で1段上げるときはsteps:1。記譜音を動かす。',
   parameters:{type:'object',properties:{part:{type:'string'},from:{type:'integer'},to:{type:'integer'},semitones:{type:'integer'},steps:{type:'integer'}}},
   run(doc,args){
    const index=resolvePart(doc,args.part),part=partsOf(doc)[index];
    const [from,to]=measureRange(part,args.from??1,args.to??part.measures.length);
    const layers=[1,...(C.isGrandStaff(part)?[2]:[])];
    let edited=part,count=0,label;
    if(args.semitones!==undefined){
     const amount=integer(args.semitones,'半音',-24,24);
     if(amount===0)fail('半音数に0は使えません');
     label=`${amount>0?'+':''}${amount}半音`;
     for(const staff of layers){
      const view=C.staffScore(edited,staff);
      const ids=view.measures.slice(from,to+1).flatMap(bar=>bar.events.filter(event=>event.type==='note').map(event=>event.id));
      if(!ids.length)continue;
      count+=ids.length;
      const next=B.transform(view,ids,event=>{
       if(event.type!=='note')return event;
       event.pitches=C.normalizeChord(event.pitches.map(pitch=>({...pitch,...spell(C.pitchMidi(pitch)+amount,amount>0)})));
       return event;
      });
      edited=C.mergeStaff(edited,staff,next);
     }
    }else{
     const amount=integer(args.steps,'音程',-14,14);
     if(amount===0)fail('音程に0は使えません');
     label=`音名で${amount>0?'+':''}${amount}段`;
     for(const staff of layers){
      const view=C.staffScore(edited,staff);
      const ids=view.measures.slice(from,to+1).flatMap(bar=>bar.events.filter(event=>event.type==='note').map(event=>event.id));
      if(!ids.length)continue;
      count+=ids.length;
      edited=C.mergeStaff(edited,staff,B.transpose(view,ids,amount,false));
     }
    }
    if(!count)fail('移調する音符がありません');
    return {document:editPart(doc,index,()=>edited),focusPart:index,summary:`${part.instrument}の${from+1}〜${to+1}小節を${label}移調しました`};
   }
  },
  addMeasures:{
   description:'空の小節を挿入する。atは挿入位置（1始まり、末尾の次も可）、countは個数。全パートに同じ小節数を足す。',
   parameters:{type:'object',properties:{at:{type:'integer'},count:{type:'integer'}},required:['at']},
   run(doc,args){
    const parts=partsOf(doc);
    const at=integer(args.at,'挿入位置',1,parts[0].measures.length+1)-1;
    const count=integer(args.count??1,'小節数',1,32);
    const updated=parts.map(part=>B.insertMeasures(part,at,count));
    return {document:assemble(doc,updated),summary:`${at+1}小節目の位置に空の小節を${count}個追加しました`};
   }
  },
  removeMeasures:{
   description:'小節を削除する。fromとtoは1始まりで両端を含む。実行前に確認が必要。',
   parameters:{type:'object',properties:{from:{type:'integer'},to:{type:'integer'}},required:['from','to']},
   confirm(doc,args){
    const part=partsOf(doc)[0];
    const [from,to]=measureRange(part,args.from,args.to);
    return `${from+1}〜${to+1}小節をすべてのパートから削除します。`;
   },
   run(doc,args){
    const part=partsOf(doc)[0];
    const [from,to]=measureRange(part,args.from,args.to);
    const edited=B.removeMeasures(part,from,to);
    return {document:editPart(doc,0,()=>edited),summary:`${from+1}〜${to+1}小節を削除しました`};
   }
  },
  undoAiChange:{
   description:'直前のAIによる編集を1段階だけ元に戻す。',
   parameters:{type:'object',properties:{}},
   undo:true
  },
  proposeEnsembleOptions:{
   description:'2〜3個の編成案（テンプレートや人数ベース）を理由付きで提示するだけ。楽譜は変えない。ユーザーがチャットで案を選んだあと applyEnsembleOption を呼ぶ。',
   parameters:{type:'object',properties:{headcount:{type:'integer'},missing:{type:'array',items:{type:'string'}},style:{type:'string'},level:{type:'string'}}},
   run(doc,args){
    if(!Ensemble)fail('編成ヘルパーが読み込まれていません');
    const built=Ensemble.buildOptions(doc,args||{});
    return {summary:built.summary,proposal:{options:built.options.map(option=>({id:option.id,title:option.title,reason:option.reason}))}};
   }
  },
  applyEnsembleOption:{
   description:'proposeEnsembleOptions で出した optionId の編成を適用する。preserveMusic が true（既定）なら既存パートの旋律を近い楽器へ移す。',
   parameters:{type:'object',properties:{optionId:{type:'string'},preserveMusic:{type:'boolean'},level:{type:'string'}},required:['optionId']},
   ensembleChange:true,
   confirm(doc,args){
    if(!Ensemble)fail('編成ヘルパーが読み込まれていません');
    const option=Ensemble.optionById(args.optionId);
    return `「${option.title}」を適用します（${option.partCount||option.keys?.length||'?'}パート）。\n変更前後はチャット下部の切替ボタンで比較できます。`;
   },
   run(doc,args){
    if(!Ensemble)fail('編成ヘルパーが読み込まれていません');
    const option=Ensemble.optionById(args.optionId);
    return Ensemble.applyOption(doc,option,{preserveMusic:flag(args.preserveMusic??true),level:args.level||'中級'});
   }
  },
  reorderParts:{
   description:'パートの並び順を入れ替える。order は1始まりのパート番号の配列（全パートを並べる）。',
   parameters:{type:'object',properties:{order:{type:'array',items:{type:'integer'}}},required:['order']},
   ensembleChange:true,
   run(doc,args){if(!Ensemble)fail('編成ヘルパーが読み込まれていません');return Ensemble.reorderParts(doc,args.order);}
  },
  changePartInstrument:{
   description:'パートの楽器を変更し、移調・音域を合わせて記譜を整える。part は番号または名前。instrument は trumpet や clarinet などのキー。',
   parameters:{type:'object',properties:{part:{type:'string'},instrument:{type:'string'}},required:['part','instrument']},
   ensembleChange:true,
   run(doc,args){
    if(!Ensemble)fail('編成ヘルパーが読み込まれていません');
    return Ensemble.changePartInstrument(doc,resolvePart(doc,args.part)+1,args.instrument);
   }
  },
  removePartRedistribute:{
   description:'パートを削除し、音符は音域の近い別パートへ移す。part は番号または名前。level は初級、中級、上級。',
   parameters:{type:'object',properties:{part:{type:'string'},level:{type:'string'}},required:['part']},
   ensembleChange:true,
   confirm(doc,args){
    const index=resolvePart(doc,args.part);
    return `${index+1}番「${partsOf(doc)[index].instrument}」を削除し、メロディは別パートへ移します。`;
   },
   run(doc,args){
    if(!Ensemble)fail('編成ヘルパーが読み込まれていません');
    return Ensemble.removePartRedistribute(doc,resolvePart(doc,args.part)+1,args.level||'中級');
   }
  },
  proposeInstrumentation:{
   description:'人数や足りない楽器から編成を提案し、確認後に入れ替える。headcountは人数。missingは抜く楽器。styleはconcert、small、marching、bright。levelは初級、中級、上級。確認前は楽譜は変えない。編成案を比較したいときは proposeEnsembleOptions を優先。',
   parameters:{type:'object',properties:{headcount:{type:'integer'},missing:{type:'array',items:{type:'string'}},style:{type:'string'},level:{type:'string'}}},
   confirm(doc,args){
    const planned=Arrange.plan(args||{});
    const replacing=partsOf(doc).length>1||hasNotes(doc);
    return `${planned.summary}\n${replacing?'実行すると、いまのパートと音符をこの編成に入れ替えます。':'実行すると、空の楽譜をこの編成にします。'}`;
   },
   run(doc,args){
    const planned=Arrange.plan(args||{});
    const concert=concertOf(doc);
    const created=planned.keys.map((key,index)=>partFromItem(doc,I.byKey.get(key),concert,{reuse:index===0?emptyMeasures(doc):null}));
    const numbered=I.numberParts(created,created.map((_,index)=>index));
    return {document:assemble(doc,numbered),focusPart:0,summary:`${planned.summary}\nこの編成に入れ替えました。`};
   }
  },
  arrangeMelody:{
   description:'既存の旋律を編成へ分配する。melodyはパート番号。fromとtoは小節。chordsは小節ごとのC、F、G。levelは初級、中級、上級。移調と音域はツールが処理する。',
   parameters:{type:'object',properties:{melody:{type:'string'},from:{type:'integer'},to:{type:'integer'},level:{type:'string'},chords:{type:'array',items:{type:'string'}}}},
   confirm(doc,args){
    const parts=partsOf(doc);
    const melody=args.melody===undefined||args.melody===null||args.melody===''?parts.findIndex(part=>part.measures.some(bar=>bar.events.some(event=>event.type==='note'))):resolvePart(doc,args.melody);
    const from=(args.from||1)-1,to=(args.to||parts[0].measures.length)-1;
    const busy=parts.some((part,index)=>index!==melody&&part.measures.slice(Math.max(0,from),Math.max(0,to)+1).some(bar=>bar.events.some(event=>event.type==='note')));
    return busy?'指定範囲にある他パートの音符を、旋律の分配で置き換えます。':null;
   },
   run(doc,args){
    const melody=args.melody===undefined||args.melody===null||args.melody===''?undefined:resolvePart(doc,args.melody)+1;
    const arranged=Arrange.arrangeMelody(doc,{...args,melody});
    return {document:assemble(doc,arranged.parts),summary:arranged.summary};
   }
  },
  doublePart:{
   description:'パートを別のパートへユニゾン、octave、thirdで重ねる。移調楽器は記譜音に直す。fromとtoはパート番号。',
   parameters:{type:'object',properties:{from:{type:'integer'},to:{type:'integer'},start:{type:'integer'},end:{type:'integer'},interval:{type:'string'},level:{type:'string'}},required:['from','to']},
   confirm(doc,args){
    const target=partsOf(doc)[resolvePart(doc,args.to)];
    const start=(args.start||1)-1,end=(args.end||target.measures.length)-1;
    return target.measures.slice(start,end+1).some(bar=>bar.events.some(event=>event.type==='note'))?`${target.instrument}の音符を重ね書きで置き換えます。`:null;
   },
   run(doc,args){
    const doubled=Arrange.doublePart(doc,{...args,from:resolvePart(doc,args.from)+1,to:resolvePart(doc,args.to)+1});
    return {document:assemble(doc,doubled.parts),focusPart:doubled.focus,summary:doubled.summary};
   }
  },
  voiceChords:{
   description:'和音記号を低音と内声へ配置する。chordsはC、Dm、G7のように小節ごと。levelでリズムが変わる。',
   parameters:{type:'object',properties:{chords:{type:'array',items:{type:'string'}},from:{type:'integer'},level:{type:'string'}},required:['chords']},
   confirm(doc,args){
    const from=(args.from||1)-1,to=from+(args.chords||[]).length-1;
    const busy=partsOf(doc).some(part=>part.clef!=='percussion'&&part.measures.slice(Math.max(0,from),to+1).some(bar=>bar.events.some(event=>event.type==='note')));
    return busy?'和音を置く範囲の既存の音符を置き換えます。':null;
   },
   run(doc,args){
    const voiced=Arrange.voiceChords(doc,args);
    return {document:assemble(doc,voiced.parts),summary:voiced.summary};
   }
  },
  checkRanges:{
   description:'全パートの音符が難易度の実用音域に入るか確認する。編集しない。levelは初級、中級、上級。',
   parameters:{type:'object',properties:{level:{type:'string'}}},
   run(doc,args){return {summary:Arrange.reportProblems(partsOf(doc),Arrange.levelOf(args.level))};}
  },
  fixRanges:{
   description:'音域外の音符をオクターブ単位で実用音域へ移す。音名の種類は変えない。',
   parameters:{type:'object',properties:{level:{type:'string'}}},
   confirm(doc,args){
    const level=Arrange.levelOf(args.level);
    const count=partsOf(doc).reduce((sum,part)=>sum+Arrange.checkPart(part,level).length,0);
    return count?`音域外の${count}音をオクターブ移動します。`:null;
   },
   run(doc,args){
    const level=Arrange.levelOf(args.level);
    const fixed=partsOf(doc).map(part=>Arrange.fixPart(part,level));
    const moved=fixed.reduce((sum,item)=>sum+item.moved,0);
    return {document:assemble(doc,fixed.map(item=>item.part)),summary:moved?`${moved}音を音域内へ移しました。\n${Arrange.reportProblems(fixed.map(item=>item.part),level)}`:`移動が必要な音はありません。\n${Arrange.reportProblems(partsOf(doc),level)}`};
   }
  },
  getInstrumentRanges:{
   description:'開いているパートの実用音域を返す。levelは初級、中級、上級。',
   parameters:{type:'object',properties:{level:{type:'string'}}},
   run(doc,args){return {summary:Arrange.describeRanges(partsOf(doc),Arrange.levelOf(args.level))};}
  },
  inspireSpark:{
   description:'ひらめき作曲。mood（明るい/切ない/ballad 等）、part、measure（開始小節）、bars（小節数）、seed。大譜表では staff に 1 または 2。既定で楽譜に書き込む（apply:false で提案のみ）。既存音符がある範囲は確認後に置き換える。',
   parameters:{type:'object',properties:{
    seed:{type:'integer'},mood:{type:'string'},apply:{type:'boolean'},measure:{type:'integer'},from:{type:'integer'},
    bars:{type:'integer'},measures:{type:'integer'},part:{type:'string'},overwrite:{type:'boolean'},staff:{type:'integer'}
   }},
   confirm(doc,args){
    const plan=planInspireSpark(doc,args);
    if(!plan.apply||!plan.conflict.length)return null;
    return `${plan.name}の${plan.from+1}〜${plan.end+1}小節目の音符をひらめきで置き換えます。`;
   },
   run(doc,args){
    const plan=planInspireSpark(doc,args);
    if(plan.fallback||!plan.Spark){
     if(!plan.apply)return {summary:`ひらめきモジュール未読込のため、内蔵フレーズ（${plan.bars}小節）で代用できます。`};
     const phrase=builtInSparkPhrase({...args,bars:plan.bars,mood:args.mood||'ballad'});
     const out=operations.writePhrase.run(doc,{
      part:args.part??plan.index+1,measure:plan.from+1,phrase,overwrite:args.overwrite!==false||plan.conflict.length>0
     });
     return {document:out.document,focusPart:out.focusPart??plan.index,summary:`内蔵フレーズでバラード風の${plan.bars}小節を書きました。\n${out.summary}`};
    }
    const {Spark,spark}=plan;
    const lines=[
     `ムード: ${spark.mood}`,
     `調: ${spark.key} / ${spark.mode}`,
     `テンポ: ${spark.tempo}`,
     `拍子: ${spark.time.num}/${spark.time.den}`,
     `進行: ${spark.progression.timeline.map(t=>t.symbol).join(' - ')}`,
     `ヒント: ${spark.scene} / ${spark.constraints.join(' · ')}`
    ];
    if(!plan.apply)return {summary:lines.join('\n'),spark};
    let current=ensureMeasureCount(doc,plan.end+1);
    const out=Spark.applySparkDocument(current,spark,{from:plan.from+1,part:plan.index+1});
    current=ensureMeasureCount(out.document,Math.max(plan.end+1,...partsOf(out.document).map(part=>part.measures.length)));
    Spark.pushHistory(spark);
    return {document:current,focusPart:out.focusPart??plan.index,summary:`${lines[0]}\n${plan.name}の${plan.from+1}〜${plan.end+1}小節にひらめきを書きました。`,spark};
   }
  },
  applyPopProgression:{
   description:'学習済みポップ進行モデルから和音・コード記号を入力する。partは1始まり。progressionは I-V-vi-IV、IV-V-iii-vi、vi-IV-I-V、canon、komuro、auto など。gridは bar か half。voicingは block、root5、arpeggio。',
   parameters:{type:'object',properties:{
    part:{type:'integer'},from:{type:'integer'},to:{type:'integer'},progression:{type:'string'},den:{type:'integer'},
    grid:{type:'string'},voicing:{type:'string'},octave:{type:'integer'},learn:{type:'boolean'}
   },required:['from','to']},
   confirm(doc,args){
    const part=partsOf(doc)[resolvePart(doc,args.part??1)];
    const from=(args.from||1)-1,to=(args.to||part.measures.length)-1;
    const busy=part.measures.slice(from,to+1).some(bar=>bar.events.some(event=>event.type==='note'));
    return busy?`${from+1}〜${to+1}小節の既存音符を伴奏で置き換えます。`:null;
   },
   run(doc,args){
    const PopRuntime=popApi();
    if(!PopRuntime?.applyDocument)fail('ポップ進行機能が読み込まれていません');
    const index=resolvePart(doc,args.part??1);
    const mode=((partsOf(doc)[index].key||0)<0)?'minor':'major';
    const out=PopRuntime.applyDocument(doc,{...args,part:index+1,mode,progression:args.progression||args.template||'auto'});
    return {document:out.document,focusPart:out.focusPart,summary:out.summary};
   }
  },
  exportMusicXML:{
   description:'MusicXMLを書き出してダウンロードする。全文は返さない。',
   parameters:{type:'object',properties:{}},
   run(doc){
    const xml=Ex.musicXMLScore(partsOf(doc),doc.staffGroups||[]);
    const filename=`${String(doc.title||'kanade').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)||'kanade'}.musicxml`;
    return {summary:`MusicXMLを書き出しました（${xml.length}文字）。ダウンロードを開始します。`,xml,filename};
   }
  }
 };

 function list(){
  return Object.entries(operations).map(([name,op])=>({
   name,description:op.description,parameters:op.parameters,
   destructive:typeof op.confirm==='function'
  }));
 }
 function confirmText(doc,name,args){
  const op=operations[name];
  if(!op)fail('未登録のツールです');
  return op.confirm?op.confirm(C.copy(doc),args||{}):null;
 }
 function run(doc,name,args){
  const op=operations[name];
  if(!op||op.undo)fail('未登録のツールです');
  return op.run(C.copy(doc),args||{});
 }
 function stepLabel(name){return STEP_NAMES[name]||name;}

 return {list,run,confirmText,stepLabel,operations};
});
