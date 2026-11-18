(function(root){
  'use strict';
  const C=root.KanadeCore,A=root.KanadeArrangement,P=root.KanadePlayback,X=root.KanadeExport;
  const bytes=(value,size)=>Array.from({length:size},(_,i)=>(value>>>(8*(size-i-1)))&255);
  const ascii=value=>[...value].map(char=>char.charCodeAt(0));
  function vlq(value){
    const result=[value&127];
    for(value>>>=7;value;value>>>=7)result.unshift((value&127)|128);
    return result;
  }
  function metadata(type,data){return [255,type,...vlq(data.length),...data];}
  function chunk(type,data){return [Uint8Array.from([...ascii(type),...bytes(data.length,4)]),Uint8Array.from(data)];}
  function track(messages,total){
    messages.sort((a,b)=>a.tick-b.tick||a.order-b.order);
    const stream=[];
    let time=0;
    for(const {tick,data} of messages){stream.push(...vlq(tick-time),...data);time=tick;}
    stream.push(...vlq(Math.max(0,total-time)),255,47,0);
    return chunk('MTrk',stream);
  }
  function encode(parts){
    const expanded=A.playback(parts),reference=expanded[0],compiled=P.compile(expanded),total=compiled.offsets.at(-1);
    const tempo=metadata(81,bytes(Math.round(60000000/reference.tempo),3));
    const meta=[{tick:0,order:0,data:tempo}];
    for(const [mi,tick] of compiled.offsets.slice(0,-1).entries()){
      const meter=C.timeAt(reference,mi);
      if(mi===0||!C.sameTime(C.timeAt(reference,mi-1),meter))
        meta.push({tick,order:0,data:metadata(88,[meter.num,Math.log2(meter.den),24,8])});
    }
    const out=[],channels=[0,1,2,3,4,5,6,7,8,10,11,12,13,14,15],label=new TextEncoder();
    let pitched=0,drumPort=0;
    const eventsByPart=new Map(expanded.map(part=>[part.id,[]]));
    for(const event of compiled.events)eventsByPart.get(event.part).push(event);
    for(const part of expanded){
      const instrument=C.soundName(part),drums=part.clef==='percussion'||!!root.KanadePercussion.preset(instrument);
      const program=X.midiProgram(instrument)-1,events=eventsByPart.get(part.id),messages=[];
      if(!events.length)continue;
      const port=drums?drumPort++:Math.floor(pitched/channels.length);
      const channel=drums?9:channels[pitched++%channels.length];
      messages.push({tick:0,order:0,data:metadata(3,label.encode(part.instrument))});
      if(port)messages.push({tick:0,order:0,data:metadata(33,[port])});
      if(!drums)messages.push({tick:0,order:0,data:[192|channel,program]});
      const previousByPitch=new Map();
      for(const event of events){
        const start=Math.round(event.start),end=Math.max(start+1,Math.round(event.end));
        const velocity=Math.round(Math.min(127,Math.max(1,75*event.emphasis)));
        const pitches=new Set(event.pitches.map(pitch=>Math.min(127,Math.max(0,drums?
          X.percussionMidi(instrument,pitch):C.pitchMidi(pitch)+event.offset))));
        for(const midi of pitches){
          const previous=previousByPitch.get(midi);
          if(previous&&previous.tick>start)previous.tick=start;
          const off={tick:end,order:1,data:[128|channel,midi,0]};
          messages.push({tick:start,order:2,data:[144|channel,midi,velocity]},off);
          previousByPitch.set(midi,off);
        }
      }
      out.push(...track(messages,total));
    }
    if(!out.length)throw Error('書き出す音符がありません');
    const header=chunk('MThd',[0,1,...bytes(1+out.length/2,2),...bytes(C.TPQ,2)]);
    return new Blob([...header,...track(meta,total),...out],{type:'audio/midi'});
  }
  root.KanadeMIDIExport={encode};
})(globalThis);
