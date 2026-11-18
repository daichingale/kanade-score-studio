/* Kanade Web MVP - dependency-free, deterministic, single-staff score model.
   This is a temporary UI adapter, NOT the Rust kanade-model serialization format. */
(function (root, factory) {
  const lib = factory(root.KanadeSymbols || (typeof require==='function'?require('./symbols.js'):null));
  if (typeof module === 'object' && module.exports) module.exports = lib;
  root.KanadeCore = lib;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Symbols) {
  'use strict';
  const CLIP_MEASURES=32, CLIP_COUNT=24;
  const TPQ = 960;
  const WHOLE = 3840;
  const DENOMS = [1, 2, 4, 8, 16, 32, 64];
  const TUPLETS=Object.freeze({2:3,3:2,4:3,5:4,6:4});
  const MAX_TUPLET_COUNT=32;
  function validTupletRatio(actual,normal){
    return Number.isInteger(actual)&&Number.isInteger(normal)&&
      (Object.hasOwn(TUPLETS,actual)?normal===TUPLETS[actual]:
        actual>=7&&actual<=MAX_TUPLET_COUNT&&normal>=1&&normal<=MAX_TUPLET_COUNT);
  }
  const STEPS = ['C','D','E','F','G','A','B'];
  const SHARP_ORDER = ['F','C','G','D','A','E','B'];
  const FLAT_ORDER = ['B','E','A','D','G','C','F'];
  const NOTES = {C:0, D:2, E:4, F:5, G:7, A:9, B:11};
  let seq = 0;
  function uid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'k-' + Date.now().toString(36) + '-' + (++seq).toString(36);
  }
  const copy = value => JSON.parse(JSON.stringify(value));
  function durationTicks(den, dots = 0) {
    if (!DENOMS.includes(den) || !Number.isInteger(dots) || dots < 0 || dots > 2) throw new Error('使用できない音価です');
    const unit = WHOLE / den;
    return unit * (dots === 0 ? 1 : dots === 1 ? 1.5 : 1.75);
  }
  function tupletUnit(event) {
    return event.tuplet.unit??event.den;
  }
  function tupletEnd(event) {
    return event.tuplet.index+durationTicks(event.den,event.dots)/durationTicks(tupletUnit(event));
  }
  function eventTicks(event) {
    const base=durationTicks(event.den,event.dots),group=event.tuplet;
    if(group===undefined)return base;
    if(!group||!validTupletRatio(group.actual,group.normal)||!Number.isFinite(group.index)||group.index<0||
      !DENOMS.includes(tupletUnit(event))||tupletEnd(event)>group.actual)
      throw new Error('連符の音価が不正です');
    const nominalStart=group.index*durationTicks(tupletUnit(event));
    if(!Number.isInteger(nominalStart))throw new Error('連符の位置が不正です');
    // Round boundaries rather than individual durations so complete groups retain their length.
    const start=Math.round(nominalStart*group.normal/group.actual);
    const end=Math.round((nominalStart+base)*group.normal/group.actual);
    if(end<=start)throw new Error('この音価は連符に使用できません');
    return end-start;
  }
  function exactEventTicks(event){
    const base=durationTicks(event.den,event.dots);
    return event.tuplet?base*event.tuplet.normal/event.tuplet.actual:base;
  }

  function restFor(event) {
    const rest=makeRest(event.den,event.dots);
    if(event.tuplet)rest.tuplet={...event.tuplet};
    return rest;
  }
  function measureTicks(time) {
    if (!time || !Number.isInteger(time.num) || time.num < 1 || time.num > 15 || ![2,4,8,16].includes(time.den)) throw new Error('拍子が正しくありません');
    return WHOLE * time.num / time.den;
  }
  const sameTime=(a,b)=>a.num===b.num&&a.den===b.den;
  function timeAt(score,mi){
    if(mi<score.measures.length)return score.measures[mi]?.time===undefined?score.time:score.measures[mi].time;
    const tail=score.meterTail;
    return tail?tail.sequence[(tail.next+mi-score.measures.length)%tail.sequence.length]:
      score.measures.at(-1)?.time??score.time;
  }
  function endingEdges(score,index){
    const bar=score.measures[index];
    if(!bar?.volta)return {start:false,stop:false};
    const before=score.measures[index-1],after=score.measures[index+1];
    return {start:before?.volta!==bar.volta||before.repeatEnd===true,
      stop:after?.volta!==bar.volta||bar.repeatEnd===true};
  }
  const barTicks=(score,mi)=>measureTicks(timeAt(score,mi));
  function measureOffsets(score){
    const offsets=[0];
    for(let mi=0;mi<score.measures.length;mi++)offsets.push(offsets.at(-1)+barTicks(score,mi));
    return offsets;
  }
  function locateTick(offsets,tick){
    let low=0,high=offsets.length-1;
    while(low<high){
      const mid=Math.ceil((low+high)/2);
      if(offsets[mid]<=tick)low=mid;else high=mid-1;
    }
    return {mi:low,tick:tick-offsets[low]};
  }
  function setMeter(score,start,sequence,count=null){
    if(!Number.isInteger(start)||start<0||!Array.isArray(sequence)||!sequence.length||sequence.length>16||!score.measures[start]||
      count!==null&&(!Number.isInteger(count)||count<1||start+count>500))
      throw Error('拍子または小節数を確認してください');
    sequence=sequence.map(time=>{measureTicks(time);return {num:time.num,den:time.den};});
    const limit=count===null?score.measures.length:start+count;
    const previous=score.meterTail||{sequence:[timeAt(score,score.measures.length)],next:0};
    const length=Math.max(score.measures.length,limit);
    const measures=Array.from({length},(_,mi)=>{
      const old=score.measures[mi]||{id:uid(),events:[]};
      if(mi<start||mi>=limit)return old;
      const time=sequence[(mi-start)%sequence.length],cap=measureTicks(time);
      if(usedTicks(old)>cap||usedTicks({events:old.voice2||[]})>cap)throw Error(`${mi+1}小節目の音符・休符が ${time.num}/${time.den} に収まりません`);
      return {...old,time};
    });
    const meterTail=count===null?{sequence,next:(length-start)%sequence.length}:
      {...previous,next:(previous.next+length-score.measures.length)%previous.sequence.length};
    const next={...score,measures,meterTail};
    const errors=validateScore(next);if(errors.length)throw Error(errors[0]);
    return next;
  }
  const CLEFS={
    treble:{label:'ト音記号',sign:'G',line:2,bottom:37,glyph:0xe050,origin:36},
    bass:{label:'ヘ音記号',sign:'F',line:4,bottom:25,glyph:0xe062,origin:12},
    alto:{label:'ハ音記号・アルト',sign:'C',line:3,bottom:31,glyph:0xe05c,origin:24},
    tenor:{label:'ハ音記号・テナー',sign:'C',line:4,bottom:29,glyph:0xe05c,origin:12},
    percussion:{label:'ニュートラル記号',sign:'percussion',line:null,bottom:37,glyph:0xe069,origin:24},
  };
  const TRANSPOSITIONS={
    concert:{label:'C管・実音',chromatic:0,diatonic:0,octave:0},
    bbHigh:{label:'B♭管（短7度上）',chromatic:-2,diatonic:-1,octave:1},
    ebHigh:{label:'E♭管（短3度上）',chromatic:3,diatonic:2,octave:0},
    g:{label:'G管（完全4度下）',chromatic:-5,diatonic:-3,octave:0},
    bbContra:{label:'B♭管（長16度下）',chromatic:-2,diatonic:-1,octave:-2},
    ebContra:{label:'E♭管（長20度下）',chromatic:-9,diatonic:-5,octave:-2},
    twoOctavesDown:{label:'記譜より2オクターブ下',chromatic:0,diatonic:0,octave:-2},
    twoOctavesUp:{label:'記譜より2オクターブ上',chromatic:0,diatonic:0,octave:2},
    bb:{label:'B♭管（長2度下）',chromatic:-2,diatonic:-1,octave:0},
    a:{label:'A管（短3度下）',chromatic:-3,diatonic:-2,octave:0},
    f:{label:'F管（完全5度下）',chromatic:-7,diatonic:-4,octave:0},
    eb:{label:'E♭管（長6度下）',chromatic:-9,diatonic:-5,octave:0},
    bbBass:{label:'B♭管（長9度下）',chromatic:-2,diatonic:-1,octave:-1},
    ebBass:{label:'E♭管（長13度下）',chromatic:-9,diatonic:-5,octave:-1},
    octaveDown:{label:'記譜より1オクターブ下',chromatic:0,diatonic:0,octave:-1},
    octaveUp:{label:'記譜より1オクターブ上',chromatic:0,diatonic:0,octave:1},
  };
  const transposition=score=>TRANSPOSITIONS[score.transposition||'concert'];
  const soundingOffset=score=>{if(score.clef==='percussion')return 0;const t=transposition(score);return t.chromatic+t.octave*12;};
  const soundName=score=>score.sound||score.instrument;
  function staffBounds(score,top=0){const lines=score.staffLines||5;return {lines,first:top+24-(lines-1)*6,last:top+24+(lines-1)*6};}
  function createScore() {
    return { schema: 'kanade.web.v1', id: uid(), title: '新しい楽譜', composer: '',
      instrument: 'ピアノ', clef: 'treble', time: {num:4, den:4}, key: 0, tempo: 100,
      measures: [{id:uid(), events:[]} ] };
  }
  function scoreParts(documentScore) {
    const {ensembleParts,bassPart,publication,clipBank,sceneLinks,...first}=documentScore;
    return [first,...(ensembleParts||[])];
  }
  function replaceScorePart(documentScore,index,next,{duplicateFrom=null}={}) {
    const parts=scoreParts(documentScore),previous=parts[index];
    const oldIndexes=new Map(previous.measures.map((measure,i)=>[measure.id,i]));
    const firstNew=duplicateFrom===null?-1:next.measures.findIndex(bar=>!oldIndexes.has(bar.id));
    const shared={title:next.title,composer:next.composer,time:next.time,tempo:next.tempo};
    if(next.meterTail)shared.meterTail=next.meterTail;
    const updated=parts.map((part,i)=>{
      if(i===index)return next;
      const measures=next.measures.map((measure,mi)=>{
        const oldIndex=oldIndexes.get(measure.id);
        if(oldIndex!==undefined)return part.measures[oldIndex];
        if(duplicateFrom!==null){
          const source=part.measures[duplicateFrom+mi-firstNew];
          if(source)return cloneMeasure(source);
        }
        return {id:uid(),events:[]};
      });
      const timed=measures.map((bar,mi)=>{
        const time=next.measures[mi].time;
        if(bar.time===time||bar.time&&time&&sameTime(bar.time,time))return bar;
        if(time)return {...bar,time};
        const {time:unused,...rest}=bar;return rest;
      });
      return {...part,...shared,measures:timed};
    });
    const [first,...ensembleParts]=updated;
    return {...first,ensembleParts,...(documentScore.publication?{publication:documentScore.publication}:{}),
      ...(documentScore.clipBank?{clipBank:documentScore.clipBank}:{}),...(documentScore.sceneLinks?{sceneLinks:documentScore.sceneLinks}:{})};
  }
  function makeNote(pitch, den = 4, dots = 0) {
    return { id: uid(), type:'note', den, dots, pitches:[normalPitch(pitch)] };
  }
  function makeRest(den = 4, dots = 0) {
    return {id:uid(), type:'rest', den, dots, pitches:[]};
  }
  function normalPitch(p) {
    if (!p || !STEPS.includes(p.step) || !Number.isInteger(p.octave) || p.octave < 0 || p.octave > 8 || !Number.isInteger(p.alter) || p.alter < -2 || p.alter > 2) throw new Error('音高が正しくありません');
    return { id:p.id || uid(), step:p.step, alter:p.alter, octave:p.octave };
  }
  function pitchMidi(p) { return (p.octave+1)*12 + NOTES[p.step] + p.alter; }
  function diatonicNumber(p) { return (p.octave+1)*7 + STEPS.indexOf(p.step); }
  function normalizeChord(pitches) {
    return pitches.map(normalPitch).sort((a,b) => pitchMidi(a)-pitchMidi(b) || diatonicNumber(a)-diatonicNumber(b));
  }
  function usedTicks(measure) { return measure.events.reduce((n,e)=>n+eventTicks(e),0); }
  const ARTICULATIONS=Object.freeze(Object.keys(Symbols.notes));
  function validateScore(score,nested=false) {
    const errors=[];
    if (!score || score.schema!=='kanade.web.v1') return ['このアプリで作成した形式ではありません'];
    if (typeof score.id!=='string' || !score.id) errors.push('プロジェクトIDがありません');
    if(score.sceneLinks!==undefined){
      const links=score.sceneLinks;
      if(nested||!Array.isArray(links)||links.length>500||!links.every(link=>link&&
        ['id','sceneId'].every(key=>typeof link[key]==='string'&&link[key].length>0&&link[key].length<=200)&&
        (link.partId===undefined||typeof link.partId==='string'&&link.partId.length<=200)&&
        Array.isArray(link.bars)&&link.bars.length>0&&link.bars.length<=500&&
        link.bars.every(id=>typeof id==='string'&&id.length>0&&id.length<=200)))
        errors.push('シーンリンクの形式が不正です');
    }
    if(score.clipBank!==undefined){
      const bank=score.clipBank,seen=new Set();
      if(nested||!Array.isArray(bank)||bank.length>CLIP_COUNT||!bank.every(clip=>{
        if(!clip||typeof clip.id!=='string'||!clip.id||seen.has(clip.id)||
          typeof clip.name!=='string'||!clip.name.trim()||clip.name.length>50||
          !Array.isArray(clip.parts)||clip.parts.length>32)return false;
        seen.add(clip.id);
        return clip.parts.every(part=>part&&!part.bassPart&&Array.isArray(part.measures)&&
          part.measures.length<=CLIP_MEASURES&&!validateScore(part,true).length);
      }))errors.push('セッションのブロックが不正です');
    }
    if(score.publication!==undefined){
      const edition=score.publication;
      const limits={subtitle:200,series:120,composerAlt:200,comment:6000,instrumentation:4000,credit:200,copyright:240,footerText:280};
      if(nested||!edition||typeof edition!=='object'||Array.isArray(edition)||
        Object.entries(limits).some(([key,max])=>edition[key]!==undefined&&(typeof edition[key]!=='string'||edition[key].length>max))||
        ['cover','notes'].some(key=>edition[key]!==undefined&&!['auto','show','hide'].includes(edition[key]))||
        (edition.footerStyle!==undefined&&!['auto','none','page','pageTotal','copyright','combined','custom'].includes(edition.footerStyle))||
        (edition.footerAlign!==undefined&&!['auto','left','center','right'].includes(edition.footerAlign))||
        (edition.footerScope!==undefined&&!['auto','all'].includes(edition.footerScope))||
        (edition.pageStart!==undefined&&(!Number.isInteger(edition.pageStart)||edition.pageStart<1||edition.pageStart>9999))||
        (edition.width!==undefined&&(!Number.isInteger(edition.width)||edition.width<70||edition.width>100))||
        (edition.names!==undefined&&!['auto','full','short','hide'].includes(edition.names))||
        (edition.align!==undefined&&!['center','left'].includes(edition.align))||
        (edition.paper!==undefined&&!['auto','a4','a3'].includes(edition.paper)))errors.push('出版レイアウトの設定が不正です');
    }
    if(['printName','shortName'].some(key=>score[key]!==undefined&&(typeof score[key]!=='string'||score[key].length>120)))errors.push('譜表に表示する楽器名が不正です');
    if (typeof score.title!=='string' || score.title.length>200 || typeof score.composer!=='string' || score.composer.length>200) errors.push('タイトルまたは作曲者が不正です');
    if (typeof score.instrument!=='string' || score.instrument.length>120) errors.push('楽器名が不正です');
    if(score.instrumentKey!==undefined&&(typeof score.instrumentKey!=='string'||!(/^[a-z][a-z0-9]{0,63}$/i).test(score.instrumentKey)))errors.push('楽器の種類が不正です');
    if(score.customInstrumentName!==undefined&&typeof score.customInstrumentName!=='boolean')errors.push('パート名の形式が不正です');
    if (!Object.hasOwn(CLEFS,score.clef)) errors.push('音部記号が不正です');
    if(score.sound!==undefined&&(typeof score.sound!=='string'||score.sound.length>120))errors.push('再生音源が不正です');
    if(score.staffLines!==undefined&&(!Number.isInteger(score.staffLines)||score.staffLines<1||score.staffLines>5))errors.push('譜線数が不正です');
    if(score.transposition!==undefined&&!Object.hasOwn(TRANSPOSITIONS,score.transposition))errors.push('移調設定が不正です');
    if(score.notehead!==undefined&&!['normal','cross'].includes(score.notehead))errors.push('符頭が不正です');
    if (!Number.isInteger(score.key) || score.key < -7 || score.key > 7) errors.push('調号が不正です');
    if (!Number.isInteger(score.tempo) || score.tempo < 20 || score.tempo > 300) errors.push('テンポが不正です');
    try{
      measureTicks(score.time);
      if(score.meterTail!==undefined){
        const {sequence,next}=score.meterTail;
        if(!Array.isArray(sequence)||!sequence.length||sequence.length>16||!Number.isInteger(next)||next<0||next>=sequence.length)throw Error('拍子パターンが不正です');
        sequence.forEach(measureTicks);
      }
    }catch(e){errors.push(e.message);}
    if (!Array.isArray(score.measures) || !score.measures.length || score.measures.length > 500) return [...errors,'小節数が不正です'];
    const ids=new Set([score.id]); let count=0;
    for (const [i,m] of score.measures.entries()) {
      if (!m || !Array.isArray(m.events) || m.events.length > 200) {errors.push(`${i+1}小節目のイベントが不正です`); continue;}
      if (typeof m.id!=='string' || !m.id || ids.has(m.id)) errors.push(`${i+1}小節目のIDが重複しています`);
      ids.add(m.id);
      let capacity=0;
      try{capacity=barTicks(score,i);}catch(e){errors.push(`${i+1}小節目の拍子が不正です`);}
      if((m.repeatStart!==undefined&&m.repeatStart!==true)||(m.repeatEnd!==undefined&&m.repeatEnd!==true)||
        (m.volta!==undefined&&m.volta!==1&&m.volta!==2))errors.push(`${i+1}小節目のリピートが不正です`);
      if(m.directions!==undefined){
        const keys=new Set();
        const valid=Array.isArray(m.directions)&&m.directions.length<=120&&m.directions.every(mark=>{
          const preset=mark&&Object.hasOwn(Symbols.byKey,mark.key)&&Symbols.byKey[mark.key];
          if(!preset||!Number.isInteger(mark.tick)||mark.tick<0||mark.tick>=capacity)return false;
          const ranged=isRangeDirection(mark.key);
          const destination=mark.endMeasure===undefined?i:score.measures.findIndex(bar=>bar?.id===mark.endMeasure);
          let endCap=capacity;
          if(ranged&&destination>=0)try{endCap=barTicks(score,destination);}catch(e){return false;}
          if(ranged&&(!Number.isInteger(mark.end)||mark.end<0||(destination>=0&&mark.end>endCap)||
            (mark.endMeasure===undefined&&mark.end<=mark.tick)))return false;
          if(mark.endMeasure!==undefined&&(!ranged||typeof mark.endMeasure!=='string'||!mark.endMeasure))return false;
          if(!ranged&&mark.end!==undefined)return false;
          const textMark=['custom','chordSymbol'].includes(mark.key);
          if(textMark?(typeof mark.text!=='string'||!mark.text.trim()||mark.text.length>100):mark.text!==undefined)return false;
          const id=JSON.stringify([mark.key,mark.tick,textMark?mark.text:null]);
          if(keys.has(id))return false;
          keys.add(id);return true;
        });
        if(!valid)errors.push(`${i+1}小節目の指示記号が不正です`);
      }
      if(m.voice2!==undefined&&(!Array.isArray(m.voice2)||m.voice2.length>200)){
        errors.push(`${i+1}小節目の第2声部が不正です`);continue;
      }
      for(const events of m.voice2?[m.events,m.voice2]:[m.events]){
        let total=0,group=null,slot=0;
        for (const e of events) {
          count++;
          if (!e || typeof e.id!=='string' || !e.id || ids.has(e.id)) {errors.push(`${i+1}小節目のイベントIDが重複しています`); continue;}
          ids.add(e.id);
          try { total+=eventTicks(e); } catch(err) {errors.push(`${i+1}小節目: ${err.message}`); continue;}
          if(e.tuplet||group){
            if(!group)group=e;
            const mark=e.tuplet;
            if(!mark||mark.index!==slot||mark.actual!==group.tuplet.actual||mark.normal!==group.tuplet.normal||tupletUnit(e)!==tupletUnit(group)){
              errors.push(`${i+1}小節目の連符が途中で切れています`);group=null;slot=0;
            }else{
              slot=tupletEnd(e);
              if(slot===mark.actual){group=null;slot=0;}
            }
          }
          if (!['rest','note'].includes(e.type) || !Array.isArray(e.pitches) || (e.type==='rest' && e.pitches.length !== 0) || (e.type==='note' && (e.pitches.length<1 || e.pitches.length>12))) errors.push(`${i+1}小節目の音符/休符が不正です`);
          else if (e.type==='note') {
            if(e.articulations!==undefined&&(!Array.isArray(e.articulations)||e.articulations.length>ARTICULATIONS.length||new Set(e.articulations).size!==e.articulations.length||e.articulations.some(mark=>!ARTICULATIONS.includes(mark))))errors.push(`${i+1}小節目の奏法記号が不正です`);
            if(['tieStart','tieStop'].some(key=>e[key]!==undefined&&typeof e[key]!=='boolean'))errors.push(`${i+1}小節目のタイが不正です`);
            if(e.stemDirection!==undefined&&!['up','down'].includes(e.stemDirection))errors.push(`${i+1}小節目の符幹の向きが不正です`);
            if(e.beamBreak!==undefined&&typeof e.beamBreak!=='boolean')errors.push(`${i+1}小節目の連桁設定が不正です`);
            if (e.lyric !== undefined && (typeof e.lyric !== 'string' || e.lyric.length > 100)) errors.push(`${i+1}小節目の歌詞が不正です`);
            const semis=[];
            for (const p of e.pitches) {
              try {normalPitch(p);} catch(err) {errors.push(`${i+1}小節目: ${err.message}`);}
              if (typeof p.id!=='string' || !p.id || ids.has(p.id)) errors.push(`${i+1}小節目の音高IDが重複しています`);
              ids.add(p.id); semis.push(pitchMidi(p));
            }
            if (semis.some((x,j)=>j>0 && x<semis[j-1])) errors.push(`${i+1}小節目の和音が昇順ではありません`);
            if (new Set(semis).size!==semis.length) errors.push(`${i+1}小節目の和音に重複した音があります`);
          }
        }
        if(group)errors.push(`${i+1}小節目の連符が途中で切れています`);
        if (total>capacity) errors.push(`${i+1}小節目が拍子を超えています`);
      }
    }
    if(score.ensembleParts!==undefined){
      const parts=score.ensembleParts;
      if(nested||score.bassPart||!Array.isArray(parts)||parts.length>31)errors.push('編成の形式が不正です');
      else for(const part of parts){
        if(!part||part.bassPart||typeof part.id!=='string'||ids.has(part.id)||part.measures?.length!==score.measures.length||
          ['title','composer','tempo','time','meterTail'].some(key=>JSON.stringify(part[key])!==JSON.stringify(score[key]))||
          validateScore(part,true).length||part.measures.some((_,mi)=>!sameTime(timeAt(part,mi),timeAt(score,mi)))){errors.push('パートの設定または小節構成を確認してください');break;}
        ids.add(part.id);
      }
    }
    if (count > 20000) errors.push('音符数が上限を超えています');
    return errors;
  }
  // Model versions are immutable: copy only the edited measure and event.
  function cloneMeasure(bar){
    const fresh=event=>{
      const result=copy(event);result.id=uid();result.pitches.forEach(pitch=>{pitch.id=uid();});
      if(result.noteBackup){result.noteBackup.id=result.id;result.noteBackup.pitches.forEach(pitch=>{pitch.id=uid();});}
      return result;
    };
    return {...bar,id:uid(),events:bar.events.map(fresh),...(bar.voice2?{voice2:bar.voice2.map(fresh)}:{})};
  }
  function voiceScore(score,voice){
    const measures=score.measures.map(({voice2,...bar})=>({...bar,events:voice===2?voice2||[]:bar.events}));
    return {...score,measures};
  }
  function editMeasure(score,index) {
    const next={...score,measures:score.measures.slice()};
    next.measures[index]={...score.measures[index],events:score.measures[index].events.slice()};
    return next;
  }
  function isRangeDirection(key){
    return ['wedge','slur'].includes(Symbols.byKey[key]?.style);
  }
  function directionEnd(score,mi,mark){
    const endMi=mark.endMeasure===undefined?mi:score.measures.findIndex(bar=>bar.id===mark.endMeasure);
    if(endMi<mi||endMi===mi&&mark.end<=mark.tick)return null;
    return {mi:endMi,tick:mark.end};
  }
  function directionSegments(score,mi){
    const cap=barTicks(score,mi),offsets=measureOffsets(score),segments=[];
    for(let from=0;from<=mi;from++)for(const mark of score.measures[from].directions||[]){
      if(!isRangeDirection(mark.key))continue;
      const end=directionEnd(score,from,mark);
      if(!end||end.mi<mi)continue;
      const startTick=from===mi?mark.tick:0,endTick=end.mi===mi?end.tick:cap;

      const start=offsets[from]+mark.tick,total=offsets[end.mi]+end.tick-start;
      const progress=t=>(offsets[mi]+t-start)/total;
      segments.push({mark,from,startTick,endTick,first:from===mi,last:end.mi===mi,
        startProgress:progress(startTick),endProgress:progress(endTick)});
    }
    return segments;
  }
  function setDirectionRange(score,mi,key,tick,endMi,end){
    if(!isRangeDirection(key)||!score.measures[endMi]||endMi<mi||endMi===mi&&end<=tick)
      throw Error('開始位置より後ろの音符を選んでください');
    const mark={key,tick,end,...(endMi!==mi?{endMeasure:score.measures[endMi].id}:{})};
    return changeDirections(score,mi,marks=>[...marks.filter(item=>item.key!==key||item.tick!==tick),mark]);
  }
  function changeDirections(score,mi,transform) {
    const next=editMeasure(score,mi),bar=next.measures[mi];
    const directions=transform((bar.directions||[]).slice());
    if(directions.length)bar.directions=directions;else delete bar.directions;
    const errors=validateScore(next);if(errors.length)throw Error(errors[0]);
    return next;
  }
  function insertEvent(score, measureIndex, eventIndex, event) {
    let next={...score,measures:score.measures.slice()};
    let target=next.measures[measureIndex];
    if (!target || !Number.isInteger(eventIndex) || eventIndex<0 || eventIndex>target.events.length) throw new Error('挿入位置が不正です');
    const capacity=barTicks(next,measureIndex);
    const need=eventTicks(event);
    if (usedTicks(target)===capacity && eventIndex===target.events.length) {
      if (measureIndex===next.measures.length-1) next=addMeasure(next);
      target=next.measures[measureIndex+1]; measureIndex++; eventIndex=0;
    }
    target={...target,events:target.events.slice()};next.measures[measureIndex]=target;
    // When a visible rest is selected, write INTO its time slot rather than
    // shifting all following notes forward in musical time.
    const existing=target.events[eventIndex];
    if(existing && existing.type==='rest') {
      if(existing.tuplet)throw new Error('連符内の休符は R で音符に切り替えられます');
      const available=eventTicks(existing);
      if(need>available) throw new Error('選択した休符より音価が長くなっています');
      const remainder=available-need;
      const replacement=[copy(event), ...fillRests(remainder).map(r=>makeRest(r.den,r.dots))];
      target.events.splice(eventIndex,1,...replacement);
    } else {
      if (usedTicks(target)+need>barTicks(next,measureIndex)) throw new Error('この小節には収まりません。音価を短くするか、別の小節に入力してください。');
      target.events.splice(eventIndex,0,copy(event));
    }
    const errors=validateScore(next); if (errors.length) throw new Error(errors[0]);
    return {score:next, measureIndex, eventId:event.id};
  }
  function deleteEvent(score, id, {closeGap=false}={}) {
    for (const [mi,m] of score.measures.entries()) {
      const i=m.events.findIndex(e=>e.id===id);
      if (i>=0) {
        const next=editMeasure(score,mi),events=next.measures[mi].events,previous=events[i];
        if(previous.tuplet||previous.type==='note'&&!closeGap)events.splice(i,1,restFor(previous));
        else events.splice(i,1);
        return next;
      }
    }
    throw new Error('指定した音符がありません');
  }
  function changeEvent(score,id,fn) {
    for(const [mi,m]of score.measures.entries()){
      const i=m.events.findIndex(e=>e.id===id);
      if(i>=0){
        const result=fn(copy(m.events[i]));
        if(!result||result.id!==id)throw new Error('イベントIDの変更はできません');
        const next=editMeasure(score,mi);next.measures[mi].events[i]=result;
        const errors=validateScore(next);if(errors.length)throw new Error(errors[0]);
        return next;
      }
    }
    throw new Error('指定した音符がありません');
  }
  function changeDuration(score,id,den,dots=0,{overwriteTuplet=false}={}) {
    durationTicks(den,dots);
    for(let mi=0;mi<score.measures.length;mi++) {
      const spans=eventSpans(score,mi,false);
      const found=spans.find(s=>s.event.id===id);
      if(!found) continue;
      if(found.event.den===den&&found.event.dots===dots)return score;
      const modified=copy(found.event);modified.den=den;modified.dots=dots;
      if(found.event.tuplet){
        if(!overwriteTuplet)throw new Error('連符の音価を変更するには音符・休符を1つ選んでください');
        const group=tupletGroupAt(spans,found.index),first=group[0];
        const unit=tupletUnit(found.event),{actual,normal}=found.event.tuplet;
        const events=replaceTupletEntry(group.map(span=>span.event),found.index-first.index,modified,unit,actual,normal);
        return placeTuplet(score,mi,first.start,unit,actual,events,{overwrite:true,normal}).score;
      }
      const next=editMeasure(score,mi);
      // Replacing the original entry with an equal-length rest allows us to
      // preserve the beat position of EVERY following event during resize.
      next.measures[mi].events[found.index]=makeRest(found.event.den,found.event.dots);
      return placeEventAt(next,mi,found.start,modified).score;
    }
    throw new Error('指定した音符・休符がありません');
  }
  function addChordPitch(score,id,pitch) {
    return changeEvent(score,id,event=>{
      if (event.type!=='note') throw new Error('休符には和音を追加できません');
      const p=normalPitch(pitch);
      if (event.pitches.some(n=>pitchMidi(n)===pitchMidi(p))) throw new Error('同じ音の和音は追加できません');
      event.pitches=normalizeChord([...event.pitches,p]); return event;
    });
  }
  function flipNoteRest(event,pitch) {
    if(event.type==='note')return {...restFor(event),id:event.id,noteBackup:copy(event)};
    const backup=event.noteBackup;
    const restored=backup&&backup.type==='note'?copy(backup):makeNote(pitch,event.den,event.dots);
    return {...restored,id:event.id,den:event.den,dots:event.dots,...(event.tuplet?{tuplet:event.tuplet}:{})};
  }
  function toggleNoteRest(score,id,pitch) {
    return changeEvent(score,id,event=>flipNoteRest(event,pitch));
  }
  function changeSemitone(score,id,delta) {
    if(![-1,1].includes(delta))throw new Error('半音の移動量が不正です');
    const sharp=['C','C','D','D','E','F','F','G','G','A','A','B'];
    const flat=['C','D','D','E','E','F','G','G','A','A','B','B'];
    return changeEvent(score,id,event=>{
      if(event.type!=='note')return event;
      event.pitches=normalizeChord(event.pitches.map(p=>{
        if(Math.abs(p.alter+delta)<=2)return {...p,alter:p.alter+delta};
        const midi=pitchMidi(p)+delta,pc=((midi%12)+12)%12;
        const step=(delta>0?sharp:flat)[pc],octave=Math.floor(midi/12)-1;
        return {...p,step,octave,alter:pc-NOTES[step]};
      }));return event;
    });
  }
  function withSettings(score,patch) {
    const next={...score,...copy(patch)};
    const errors=validateScore(next); if (errors.length) throw new Error(errors[0]);
    return next;
  }
  function addMeasure(score) {
    const next={...score,measures:score.measures.slice()};
    if (next.measures.length>=500) throw new Error('小節数の上限です');
    const time=timeAt(score,score.measures.length);
    next.measures.push({id:uid(),events:[],...(score.meterTail||!sameTime(time,score.time)?{time}:{})});
    if(score.meterTail){
      const {sequence,next:index}=score.meterTail;
      next.meterTail={sequence,next:(index+1)%sequence.length};
    }
    return next;
  }
  function removeMeasure(score,index) {
    if (score.measures.length===1) throw new Error('最後の小節は削除できません');
    const next={...score,measures:score.measures.slice()};next.measures.splice(index,1);return next;
  }
  function keyAlter(step,fifths) {return fifths>0 && SHARP_ORDER.slice(0,fifths).includes(step)?1:fifths<0 && FLAT_ORDER.slice(0,-fifths).includes(step)?-1:0;}
  function fillRests(remaining) {
    if (!Number.isInteger(remaining) || remaining<0) throw new Error('残りの長さが不正です');
    const out=[];
    for (const den of DENOMS) {
      const size=durationTicks(den);
      while (remaining>=size) {out.push({type:'rest',den,dots:0,pitches:[],id:'implicit-'+out.length});remaining-=size;}
    }
    if (remaining!==0) {
      // 64分音符の複付点などでは、残りが60 tickの倍数にならない。
      // 元の貪欲分割を捨て、付点休符も候補にして残量を厳密に分割する。
      const target=out.reduce((n,e)=>n+durationTicks(e.den,e.dots),0)+remaining;
      if (target%15!==0) throw new Error('暗黙休符を正確に割り当てられません');
      const choices=DENOMS.flatMap(den=>[0,1,2].map(dots=>({den,dots,ticks:durationTicks(den,dots)})))
        .sort((a,b)=>b.ticks-a.ticks || a.dots-b.dots);
      const best=new Array(target+1).fill(null);best[0]={cost:0,list:[]};
      for(let t=15;t<=target;t+=15) for(const item of choices) {
        if(t<item.ticks || !best[t-item.ticks]) continue;
        const prev=best[t-item.ticks], cost=prev.cost+1+item.dots*2;
        if(!best[t] || cost<best[t].cost) best[t]={cost,list:[...prev.list,item]};
      }
      if(!best[target]) throw new Error('暗黙休符を正確に割り当てられません');
      return best[target].list.map((r,i)=>({type:'rest',den:r.den,dots:r.dots,pitches:[],id:'implicit-'+i}));
    }
    return out;
  }
  function eventsWithRests(measure,time) {
    const rem=measureTicks(time)-usedTicks(measure);
    return [...measure.events,...fillRests(rem)];
  }
  function eventSpans(score,mi,includeImplicit=true) {
    if(!score.measures[mi]) throw new Error('小節がありません');
    const events=includeImplicit?eventsWithRests(score.measures[mi],timeAt(score,mi)):score.measures[mi].events;
    let tick=0;
    return events.map((event,index)=>{
      const start=tick;tick+=eventTicks(event);
      return {event,index,start,end:tick,implicit:index>=score.measures[mi].events.length};
    });
  }
  function canPlaceAt(score,mi,tick,den,dots=0,{overwrite=false}={}) {
    let length;
    try{length=durationTicks(den,dots);}catch(_){return false;}
    return canPlaceSpan(score,mi,tick,length,overwrite);
  }
  function canPlaceSpan(score,mi,tick,length,overwrite) {
    if(!score.measures[mi]||!Number.isInteger(tick)||tick<0||tick+length>barTicks(score,mi))return false;
    return overwrite||!eventSpans(score,mi,false).some(s=>s.event.type==='note'&&s.start<tick+length&&tick<s.end);
  }
  function exactDurations(ticks) {
    for(const den of DENOMS)for(const dots of [0,1,2]){
      if(durationTicks(den,dots)===ticks)return [{den,dots}];
    }
    return fillRests(ticks);
  }
  function eventFragment(event,length,keepOnset,keepEnd) {
    if(event.tuplet)throw new Error('連符全体を含む範囲を指定してください');
    if(event.type==='rest')return fillRests(length).map(e=>makeRest(e.den,e.dots));
    const durations=exactDurations(length);
    return durations.map(({den,dots},index)=>{
      const startsAtOnset=keepOnset&&index===0;
      const part={...event,den,dots,id:startsAtOnset?event.id:uid(),
        pitches:startsAtOnset?event.pitches:event.pitches.map(pitch=>({...pitch,id:uid()})),
        tieStop:index>0||(startsAtOnset&&!!event.tieStop),
        tieStart:index<durations.length-1||(keepEnd&&!!event.tieStart)};
      if(!startsAtOnset){
        delete part.articulations;delete part.lyric;delete part.beamBreak;
      }
      return part;
    });
  }
  function placeEventAt(score,mi,tick,event,options) {
    return placeEventsAt(score,mi,tick,[event],options);
  }
  // Replace an interval without shifting any events outside it.
  function placeEventsAt(score,mi,tick,events,{overwrite=false}={}) {
    const length=events.reduce((total,event)=>total+eventTicks(event),0);
    if(!canPlaceSpan(score,mi,tick,length,overwrite))
      throw new Error('この位置は他の音符と重なるか、小節の長さを超えています');
    const end=tick+length,before=[],after=[];
    let used=0;
    for(const {event,start,end:stop} of eventSpans(score,mi,false)){
      used=stop;
      if(stop<=tick)before.push(event);
      else if(start>=end)after.push(event);
      else {
        if(start<tick)before.push(...eventFragment(event,tick-start,true,false));
        if(stop>end)after.push(...eventFragment(event,stop-end,false,true));
      }
    }
    if(used<tick)before.push(...fillRests(tick-used).map(e=>makeRest(e.den,e.dots)));
    const next=editMeasure(score,mi);
    next.measures[mi].events=[...before,...events.map(copy),...after];
    const errors=validateScore(next);if(errors.length)throw new Error(errors[0]);
    return {score:next,measureIndex:mi,eventId:events.at(-1).id};
  }
  function placeAcrossBars(score,mi,tick,event,options){
    const cap=barTicks(score,mi);
    let remaining=durationTicks(event.den,event.dots),next=score,result,first=true;
    if(!score.measures[mi]||!Number.isInteger(tick)||tick<0||tick>cap)throw Error('入力位置が不正です');
    if(remaining<=cap-tick)return placeEventAt(score,mi,tick,event,options);
    for(let bar=mi,at=tick;remaining>0;bar++,at=0){
      const length=Math.min(remaining,barTicks(next,bar)-at);
      if(!length)continue;
      if(bar>=next.measures.length)next=addMeasure(next);
      const segments=exactDurations(length).map(({den,dots})=>{
        const size=durationTicks(den,dots),segment={...event,id:uid(),den,dots,
          pitches:event.pitches.map(pitch=>normalPitch({...pitch,id:undefined}))};
        if(event.type==='note'){
          segment.tieStop=!first;segment.tieStart=remaining>size;
        }
        remaining-=size;first=false;
        return segment;
      });
      result=placeEventsAt(next,bar,at,segments,options);
      next=result.score;
    }
    return result;
  }
  function placeTuplet(score,mi,tick,unit,actual,events,{normal=TUPLETS[actual],overwrite=false}={}) {
    if(!validTupletRatio(actual,normal)||!events.length)
      throw new Error('連符の入力数を確認してください');
    const unitTicks=durationTicks(unit);
    let position=0;
    const written=events.map(event=>{
      const item={...event,tuplet:{actual,normal,unit,index:position/unitTicks}};
      position+=durationTicks(event.den,event.dots);
      return item;
    });
    if(position!==unitTicks*actual)throw new Error('連符の長さが設定と一致しません');
    return placeEventsAt(score,mi,tick,written,{overwrite});
  }
  function tupletGroupAt(spans,index) {
    if(!spans[index]?.event.tuplet)return [];
    let first=index,last=index;
    while(spans[first].event.tuplet.index!==0)first--;
    while(tupletEnd(spans[last].event)!==spans[last].event.tuplet.actual)last++;
    return spans.slice(first,last+1);
  }
  function replaceTupletEntry(events,index,event,unit,actual,normal=TUPLETS[actual]) {
    const unitTicks=durationTicks(unit),limit=unitTicks*actual;
    const start=events.slice(0,index).reduce((sum,item)=>sum+durationTicks(item.den,item.dots),0);
    const end=start+durationTicks(event.den,event.dots);
    if(end>limit)throw new Error('残りの枠に収まる音価を選んでください');
    eventTicks({...event,tuplet:{actual,normal,unit,index:start/unitTicks}});
    const next=[...events.slice(0,index),event];
    let position=start;
    for(let i=index;i<events.length;i++){
      const original=events[i],stop=position+durationTicks(original.den,original.dots);
      if(position>=end){next.push(...events.slice(i));break;}
      if(stop>end){
        if(i===index)next.push(...exactDurations(stop-end).map(r=>makeRest(r.den,r.dots)));
        else{
          const {tuplet,...plain}=original;
          next.push(...eventFragment(plain,stop-end,false,true));
        }
      }
      position=stop;
    }
    return next;
  }
  function samePitches(a,b){
    return a?.type==='note'&&b?.type==='note'&&a.pitches.length===b.pitches.length&&a.pitches.every((pitch,i)=>{
      const target=b.pitches[i];
      return pitch.step===target.step&&pitch.alter===target.alter&&pitch.octave===target.octave;
    });
  }
  function nextWrittenEvent(score,mi,index){
    const bar=score.measures[mi];
    const next=bar.events[index+1];
    if(next)return {event:next,mi,index:index+1};
    const first=score.measures[mi+1]?.events[0];
    return first&&usedTicks(bar)===barTicks(score,mi)?{event:first,mi:mi+1,index:0}:null;
  }
  function toggleTie(score,mi,index){
    const event=score.measures[mi]?.events[index],next=nextWrittenEvent(score,mi,index);
    if(!samePitches(event,next?.event))throw new Error('タイは隣り合う同じ高さの音符を選んでください');
    const enabled=!(event.tieStart&&next.event.tieStop);
    const changed=changeEvent(score,event.id,e=>({...e,tieStart:enabled}));
    return changeEvent(changed,next.event.id,e=>({...e,tieStop:enabled}));
  }
  function tieFlags(score,mi,index){
    const bar=score.measures[mi],event=bar?.events[index];
    if(event?.type!=='note'||!event.tieStart&&!event.tieStop)return {start:false,stop:false};
    const previous=score.measures[mi-1];
    const before=index>0?bar.events[index-1]:previous&&usedTicks(previous)===barTicks(score,mi-1)?previous.events.at(-1):null;
    const after=nextWrittenEvent(score,mi,index)?.event;
    return {start:!!(event.tieStart&&after?.tieStop&&samePitches(event,after)),stop:!!(event.tieStop&&before?.tieStart&&samePitches(event,before))};
  }
  function snapInputTick(score,mi,raw,den,dots){
    const cap=barTicks(score,mi),grid=WHOLE/den/2**dots;
    const span=eventSpans(score,mi).find(s=>raw>=s.start&&raw<s.end);
    if(span?.event.tuplet)return span.start;
    const origin=span?.start??0;
    const limit=Math.min(span?.end??cap,cap);
    const last=limit===cap?Math.floor((cap-1-origin)/grid):Math.floor((limit-origin)/grid);
    const steps=Math.max(0,Math.min(last,Math.round((raw-origin)/grid)));
    return origin+steps*grid;
  }
  function eventLabel(e) {
    const sym= e.dots?'.'.repeat(e.dots):'';
    return e.type==='rest' ? `休符 1/${e.den}${sym}` : e.pitches.map(p=>p.step+({1:'♯',2:'𝄪','-1':'♭','-2':'𝄫'}[p.alter]||'')+p.octave).join(' + ')+`  1/${e.den}${sym}`;
  }
  return {CLIP_COUNT,CLIP_MEASURES,scoreParts,replaceScorePart,cloneMeasure,voiceScore,Symbols,changeDirections,isRangeDirection,directionEnd,directionSegments,setDirectionRange,ARTICULATIONS,CLEFS,TRANSPOSITIONS,transposition,soundingOffset,soundName,staffBounds,TPQ,WHOLE,DENOMS,TUPLETS,MAX_TUPLET_COUNT,validTupletRatio,STEPS,SHARP_ORDER,FLAT_ORDER,copy,uid,createScore,makeNote,makeRest,normalPitch,pitchMidi,diatonicNumber,normalizeChord,durationTicks,eventTicks,exactEventTicks,tupletUnit,tupletEnd,restFor,measureTicks,sameTime,timeAt,endingEdges,barTicks,measureOffsets,locateTick,setMeter,usedTicks,validateScore,insertEvent,deleteEvent,changeEvent,changeDuration,addChordPitch,flipNoteRest,toggleNoteRest,changeSemitone,withSettings,addMeasure,removeMeasure,keyAlter,fillRests,eventsWithRests,eventSpans,canPlaceAt,exactDurations,placeEventAt,placeEventsAt,placeAcrossBars,placeTuplet,tupletGroupAt,replaceTupletEntry,samePitches,nextWrittenEvent,toggleTie,tieFlags,snapInputTick,eventLabel};
});
