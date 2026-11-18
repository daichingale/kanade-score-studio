(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeEditing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function check(score){const errors=C.validateScore(score);if(errors.length)throw new Error(errors[0]);return score;}
  function slot(score,caret){
    const span=C.eventSpans(score,caret.mi)[caret.index];
    if(!span)throw new Error('選択位置が不正です');
    const base=C.measureOffsets(score)[caret.mi];
    return {...span,mi:caret.mi,start:base+span.start,end:base+span.end};
  }
  function entries(score,start,end,implicit=true){
    const offsets=C.measureOffsets(score),out=[];
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>offsets.at(-1))throw new Error('選択範囲が不正です');
    for(let mi=C.locateTick(offsets,start).mi;mi<=C.locateTick(offsets,end-1).mi;mi++)
      for(const span of C.eventSpans(score,mi,implicit)){
        const from=offsets[mi]+span.start,to=offsets[mi]+span.end;
        if(from<end&&to>start)out.push({...span,mi,start:from,end:to});
      }
    return out;
  }
  function transform(score,ids,fn){
    const pending=new Set(ids);if(!pending.size)return score;
    const next={...score,measures:score.measures.slice()};
    score.measures.forEach((m,mi)=>{
      let events=null;
      m.events.forEach((event,index)=>{
        if(!pending.has(event.id))return;
        pending.delete(event.id);const edited=fn(C.copy(event));
        if(!edited||edited.id!==event.id)throw new Error('イベントIDの変更はできません');
        if(!events)events=m.events.slice();events[index]=edited;
      });
      if(events)next.measures[mi]={...m,events};
    });
    if(pending.size)throw new Error('選択した音符が見つかりません');
    return check(next);
  }
  function transpose(score,ids,amount,chromatic=false){
    return transform(score,ids,event=>{
      if(event.type!=='note')return event;
      event.pitches=C.normalizeChord(event.pitches.map(p=>{
        if(!chromatic){const n=C.diatonicNumber(p)+amount;return {...p,step:C.STEPS[((n%7)+7)%7],octave:Math.floor(n/7)-1};}
        if(![-1,1].includes(amount))throw new Error('半音の移動量が不正です');
        if(Math.abs(p.alter+amount)<=2)return {...p,alter:p.alter+amount};
        const midi=C.pitchMidi(p)+amount,pc=((midi%12)+12)%12;
        const step=(amount>0?['C','C','D','D','E','F','F','G','G','A','A','B']:['C','D','D','E','E','F','G','G','A','A','B','B'])[pc];
        return {...p,step,octave:Math.floor(midi/12)-1,alter:pc-(C.pitchMidi({step,octave:0,alter:0})-12)};
      }));return event;
    });
  }
  function clearRange(score,start,end){
    const spans=entries(score,start,end,false);
    const notes=spans.filter(s=>s.event.type==='note');
    if(notes.some(s=>s.start<start||s.end>end))throw new Error('音符全体を選択してください');
    const offsets=C.measureOffsets(score);
    const fullBars=new Set(spans.filter(span=>start<=offsets[span.mi]&&end>=offsets[span.mi+1]).map(span=>span.mi));
    const next=transform(score,notes.filter(span=>!fullBars.has(span.mi)).map(span=>span.event.id),
      event=>({...C.restFor(event),id:event.id}));
    if(!fullBars.size)return next;
    return check({...next,measures:next.measures.map((bar,mi)=>fullBars.has(mi)?{...bar,events:[]}:bar)});
  }
  function freshEvent(event){
    const next=C.copy(event);next.id=C.uid();
    next.pitches=next.pitches.map(p=>({...p,id:C.uid()}));
    delete next.noteBackup;
    if(event.type==='rest'&&event.noteBackup?.type==='note'){
      next.noteBackup=C.copy(event.noteBackup);next.noteBackup.id=next.id;
      next.noteBackup.pitches=next.noteBackup.pitches.map(p=>({...p,id:C.uid()}));delete next.noteBackup.noteBackup;
    }
    return next;
  }
  function copyRange(score,start,end){
    const events=[];
    for(const s of entries(score,start,end)){
      if(s.start<start||s.end>end)throw new Error('コピーする音符・休符全体を選択してください');
      events.push({offset:s.start-start,event:C.copy(s.event)});
    }
    const first=events[0]?.event,last=events.at(-1)?.event;
    if(first?.tuplet?.index>0||last?.tuplet&&C.tupletEnd(last)!==last.tuplet.actual)
      throw new Error('コピーする連符全体を選択してください');
    return {schema:'kanade.clip.v1',duration:end-start,events,
      source:{transposition:score.transposition||'concert',unpitched:score.clef==='percussion'}};
  }
  function pastePitch(pitch,from,to,key){
    const midi=C.pitchMidi(pitch)+from.chromatic+12*from.octave-to.chromatic-12*to.octave;
    const diatonic=C.diatonicNumber(pitch)+from.diatonic+7*from.octave-to.diatonic-7*to.octave;
    const spelling=n=>{
      const step=C.STEPS[((n%7)+7)%7],octave=Math.floor(n/7)-1;
      return {...pitch,step,octave,alter:midi-C.pitchMidi({step,octave,alter:0})};
    };
    const valid=p=>p.octave>=0&&p.octave<=8&&Math.abs(p.alter)<=2;
    const preferred=spelling(diatonic);
    if(valid(preferred))return preferred;
    const options=[-2,-1,1,2].map(delta=>spelling(diatonic+delta)).filter(valid);
    options.sort((a,b)=>Math.abs(a.alter-C.keyAlter(a.step,key))-Math.abs(b.alter-C.keyAlter(b.step,key)));
    if(!options.length)throw Error('貼り付ける音が記譜できる音域を超えています');
    return options[0];
  }
  function convertClipboardEvent(event,source,score){
    const next=freshEvent(event);
    if(!source)return next;
    const from=C.TRANSPOSITIONS[source.transposition],to=C.transposition(score);
    const unpitched=score.clef==='percussion';
    if(!from||typeof source.unpitched!=='boolean')throw Error('コピー元の移調設定が不正です');
    if(source.unpitched!==unpitched&&(next.pitches.length||next.noteBackup))
      throw Error('音程のある譜表と無音程打楽器の間では音符を貼り付けられません');
    if(unpitched||from===to)return next;
    for(const item of [next,next.noteBackup].filter(Boolean))
      item.pitches=C.normalizeChord(item.pitches.map(pitch=>pastePitch(pitch,from,to,score.key)));
    return next;
  }
  function restSpans(start,length){
    let cursor=start;return C.fillRests(length).map(r=>{const span={start:cursor,event:C.makeRest(r.den,r.dots)};cursor+=C.durationTicks(r.den,r.dots);return span;});
  }
  function pasteRange(score,fragment,at,{protectNotes=false,splitNotes=false}={}){
    if(fragment?.schema!=='kanade.clip.v1'||!Number.isInteger(fragment.duration)||fragment.duration<=0||!Array.isArray(fragment.events)||fragment.events.length>20000||!Number.isInteger(at)||at<0)throw new Error('貼り付けデータが不正です');
    const end=at+fragment.duration;
    let next=score;
    const offsets=C.measureOffsets(next);
    while(offsets.at(-1)<end){
      next=C.addMeasure(next);
      offsets.push(offsets.at(-1)+C.barTicks(next,next.measures.length-1));
    }
    let cursor=0;
    const placed=new Map();let firstId=null;
    for(const item of fragment.events){
      const length=C.eventTicks(item.event);
      if(item.offset!==cursor||!['note','rest'].includes(item.event.type))throw new Error('貼り付けデータの拍位置が不正です');
      cursor+=length;if(cursor>fragment.duration)throw new Error('貼り付けデータの長さが不正です');
      let from=at+item.offset,remaining=length;
      const target=C.locateTick(offsets,from).mi;
      if((item.event.tuplet||item.event.type==='note'&&!splitNotes)&&from+length>offsets[target+1])throw new Error('音符が小節線を越えます。小節の先頭など、音価が収まる位置へ貼り付けてください');
      const converted=convertClipboardEvent(item.event,fragment.source,score);
      while(remaining){
        const mi=C.locateTick(offsets,from).mi,size=Math.min(remaining,offsets[mi+1]-from);
        let pieces;
        if(size===length)pieces=[{start:from,event:converted}];
        else if(item.event.type==='rest')pieces=restSpans(from,size);
        else{
          let tick=from;
          pieces=C.exactDurations(size).map(({den,dots})=>{
            const onset=tick,first=onset===at+item.offset;
            const event={...(first?converted:freshEvent(converted)),den,dots,
              tieStop:!first||!!converted.tieStop,
              tieStart:onset+C.durationTicks(den,dots)<at+item.offset+length||!!converted.tieStart};
            if(!first){delete event.articulations;delete event.lyric;delete event.beamBreak;}
            tick+=C.durationTicks(den,dots);
            return {start:onset,event};
          });
        }
        if(!placed.has(mi))placed.set(mi,[]);
        placed.get(mi).push(...pieces);if(!firstId)firstId=pieces[0].event.id;
        from+=size;remaining-=size;
      }
    }
    if(cursor!==fragment.duration)throw new Error('貼り付けデータの長さが不正です');
    next={...next,measures:next.measures.slice()};
    for(let mi=C.locateTick(offsets,at).mi;mi<=C.locateTick(offsets,end-1).mi;mi++){
      const spans=[...(placed.get(mi)||[])];
      for(const s of C.eventSpans(next,mi,false)){
        const from=offsets[mi]+s.start,to=offsets[mi]+s.end;
        if(to<=at||from>=end){spans.push({start:from,event:s.event});continue;}
        if(protectNotes&&(s.event.type==='note'||s.event.tuplet))throw Error('貼り付け先に音符や連符があります。空いている位置を選んでください');
        if((s.event.type==='note'||s.event.tuplet)&&(from<at||to>end))throw new Error('貼り付け先の音符の途中で範囲が切れます。音符全体に収まる位置を選んでください');
        if(from<at)spans.push(...restSpans(from,at-from));
        if(to>end)spans.push(...restSpans(end,to-end));
      }
      spans.sort((a,b)=>a.start-b.start);let tick=offsets[mi];const events=[];
      for(const s of spans){
        if(s.start<tick)throw new Error('貼り付けの音符が重なっています');
        if(s.start>tick)events.push(...restSpans(tick,s.start-tick).map(s=>s.event));
        events.push(s.event);tick=s.start+C.eventTicks(s.event);
      }
      next.measures[mi]={...next.measures[mi],events};
    }
    return {score:check(next),firstId,start:at,end};
  }
  function insertMeasures(score,index,count=1){
    if(!Number.isInteger(index)||index<0||index>score.measures.length||!Number.isInteger(count)||count<1||score.measures.length+count>500)throw new Error('挿入する小節数・位置が不正です');
    if(index===score.measures.length){
      let next=score;
      for(let i=0;i<count;i++)next=C.addMeasure(next);
      return check(next);
    }
    const time=C.timeAt(score,index);
    const measures=Array.from({length:count},()=>({id:C.uid(),events:[],...(!C.sameTime(time,score.time)?{time}:{})}));
    return check({...score,measures:[...score.measures.slice(0,index),...measures,...score.measures.slice(index)]});
  }
  function duplicateMeasures(score,first,last){
    if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first||last>=score.measures.length||score.measures.length+last-first+1>500)throw new Error('複製する小節数・位置が不正です');
    const copies=score.measures.slice(first,last+1).map(C.cloneMeasure);
    return check({...score,measures:[...score.measures.slice(0,last+1),...copies,...score.measures.slice(last+1)]});
  }
  function removeMeasures(score,first,last){
    if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first||last>=score.measures.length)throw new Error('削除する小節の位置が不正です');
    const measures=[...score.measures.slice(0,first),...score.measures.slice(last+1)];
    return check({...score,measures:measures.length?measures:[{id:C.uid(),events:[]}]});
  }
  return {slot,entries,transform,transpose,clearRange,copyRange,pasteRange,convertClipboardEvent,insertMeasures,duplicateMeasures,removeMeasures};
});
