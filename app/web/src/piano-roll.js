(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null),
    root.KanadePerformance||(typeof require==='function'?require('./performance.js'):null),
    root.KanadeEditing||(typeof require==='function'?require('./editing.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadePianoRoll=api;
})(globalThis,function(C,P,B){
  'use strict';
  function read(part,voice){
    const staff=C.voiceScore(part,voice),offsets=C.measureOffsets(staff),groups=[];
    for(const [mi,bar] of staff.measures.entries()){
      let start=offsets[mi];
      for(const [index,event] of bar.events.entries()){
        const end=start+C.eventTicks(event);
        if(event.type==='note'){
          const tied=C.tieFlags(staff,mi,index).stop;
          if(tied&&groups.length){const chain=groups.at(-1);chain.events.push(event);chain.end=end;}
          else groups.push({id:event.id,start,end,events:[event],pitches:event.pitches,tuplet:!!event.tuplet});
        }
        start=end;
      }
    }
    return {part,staff,offsets,groups,voice};
  }
  function restore(data,staff){
    if(staff===data.staff)return data.part;
    const measures=data.part.measures.map((bar,mi)=>{
      if(!staff.measures[mi])return bar;
      const events=staff.measures[mi].events;
      if(events===data.staff.measures[mi].events)return bar;
      if(data.voice===1)return {...bar,events};
      if(events.length)return {...bar,voice2:events};
      const {voice2,...rest}=bar;return rest;
    });
    for(const bar of staff.measures.slice(measures.length)){
      measures.push(data.voice===1?bar:{...bar,events:[],...(bar.events.length?{voice2:bar.events}:{})});
    }
    return {...data.part,measures,...(staff.meterTail?{meterTail:staff.meterTail}:{})};
  }
  function transform(data,group,fn){
    return group.events.reduce((staff,event)=>C.changeEvent(staff,event.id,fn),data.staff);
  }
  function changePitch(data,group,original,midi){
    if(original===midi)return data.part;
    const pitch=P.fromMidi(midi,data.part.key);
    if(group.pitches.some(tone=>C.pitchMidi(tone)===midi))throw Error('この音高は和音に入っています');
    const staff=transform(data,group,event=>({...event,pitches:C.normalizeChord(event.pitches.map(tone=>
      C.pitchMidi(tone)===original?{...pitch,id:tone.id}:tone))}));
    return restore(data,staff);
  }
  function addPitch(data,group,midi){
    if(group.pitches.some(pitch=>C.pitchMidi(pitch)===midi))return data.part;
    const pitch=P.fromMidi(midi,data.part.key);
    return restore(data,transform(data,group,event=>({...event,pitches:C.normalizeChord([...event.pitches,pitch])})));
  }
  function remove(data,group,midi){
    if(group.pitches.length===1)return restore(data,group.events.reduce((staff,event)=>C.deleteEvent(staff,event.id),data.staff));
    return restore(data,transform(data,group,event=>({...event,pitches:event.pitches.filter(tone=>C.pitchMidi(tone)!==midi)})));
  }
  function write(staff,start,length,event){
    const offsets=C.measureOffsets(staff);
    if(!Number.isInteger(start)||!Number.isInteger(length)||start<0||length<=0||start+length>offsets.at(-1))
      throw Error('楽譜にある小節の範囲内へ配置してください');
    const {tieStart,tieStop,tuplet,...base}=event;
    let next=staff,at=start,remaining=length;
    while(remaining){
      const {mi,tick}=C.locateTick(offsets,at),size=Math.min(remaining,offsets[mi+1]-at);
      const segments=C.exactDurations(size).map(({den,dots})=>{
        const first=remaining===length;
        const segment=first?{...base,den,dots}:C.makeNote(base.pitches[0],den,dots);
        if(!first)segment.pitches=C.normalizeChord(base.pitches.map(({id,...pitch})=>pitch));
        remaining-=C.durationTicks(den,dots);
        if(!first)segment.tieStop=true;
        if(remaining)segment.tieStart=true;
        return segment;
      });
      next=C.placeEventsAt(next,mi,tick,segments).score;
      at+=size;
    }
    return next;
  }
  function insert(data,start,midi,length){
    const group=data.groups.find(group=>group.start===start);
    if(group)return {part:addPitch(data,group,midi),id:group.id};
    const event=C.makeNote(P.fromMidi(midi,data.part.key));
    return {part:restore(data,write(data.staff,start,length,event)),id:event.id};
  }
  function changeTime(data,group,start,length,original,midi){
    if(start===group.start&&length===group.end-group.start)return {part:changePitch(data,group,original,midi),id:group.id};
    if(group.tuplet)throw Error('連符の開始位置と長さは五線譜で編集してください');
    const source=group.events[0];
    let event=source;
    if(original!==midi){
      if(group.pitches.some(pitch=>C.pitchMidi(pitch)===midi))throw Error('この音高は和音に入っています');
      const pitch=P.fromMidi(midi,data.part.key);
      event={...source,pitches:C.normalizeChord(source.pitches.map(tone=>C.pitchMidi(tone)===original?{...pitch,id:tone.id}:tone))};
    }
    const empty=group.events.reduce((staff,note)=>C.deleteEvent(staff,note.id),data.staff);
    return {part:restore(data,write(empty,start,length,event)),id:event.id};
  }
  function copyNote(data,group,midi){
    let start=group.start,end=group.end;
    if(group.tuplet){
      const {mi}=C.locateTick(data.offsets,start);
      const spans=C.eventSpans(data.staff,mi,false);
      const range=C.tupletGroupAt(spans,spans.findIndex(span=>span.event.id===group.id));
      start=data.offsets[mi]+range[0].start;end=data.offsets[mi]+range.at(-1).end;
    }
    const fragment=B.copyRange(data.staff,start,end),ids=new Set(group.events.map(event=>event.id));
    fragment.events=fragment.events.map(({offset,event})=>{
      if(ids.has(event.id))event={...event,pitches:event.pitches.filter(pitch=>C.pitchMidi(pitch)===midi)};
      else if(event.type==='note')event=C.restFor(event);
      return {offset,event};
    });
    return fragment;
  }
  function pasteNotes(data,fragment,start){
    const {score,firstId}=B.pasteRange(data.staff,fragment,start,{protectNotes:true,splitNotes:true});
    const first=fragment.events.find(item=>item.event.type==='note');
    const part=restore(data,score);
    if(!first)return {part,id:null,start};
    const at=start+first.offset;
    const group=read(part,data.voice).groups.find(entry=>entry.start===at||entry.id===firstId);
    return {part,id:group?.id||null,midi:group&&C.pitchMidi(group.pitches[0]),start:at};
  }
  function duplicate(data,group,midi){
    const fragment=copyNote(data,group,midi);
    let start=group.end;
    for(const [mi] of data.staff.measures.entries()){
      const offset=data.offsets[mi],limit=data.offsets[mi+1];
      if(limit<=start)continue;
      for(const span of C.eventSpans(data.staff,mi,false)){
        if(span.event.type==='rest'&&!span.event.tuplet)continue;
        const from=offset+span.start,to=offset+span.end;
        if(to>start&&from<start+fragment.duration)start=to;
      }
    }
    if(group.tuplet){
      const {mi,tick}=C.locateTick(data.offsets,start);
      if(mi<data.staff.measures.length&&tick+fragment.duration>C.barTicks(data.staff,mi))start=data.offsets[mi+1];
    }
    return pasteNotes(data,fragment,start);
  }
  return {read,insert,remove,changePitch,changeTime,copyNote,pasteNotes,duplicate};
});
