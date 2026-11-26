/* Standard MIDI File import — client-side only. */
(function(root){
  'use strict';
  const C=root.KanadeCore,P=root.KanadePerformance;
  const MAX_BYTES=12*1024*1024;
  const ascii=(bytes,start,len)=>String.fromCharCode(...bytes.subarray(start,start+len));

  function vlq(bytes,offset){
    let value=0,i=offset;
    for(;i<bytes.length;i++){
      const b=bytes[i];
      value=(value<<7)|(b&127);
      if(!(b&128))return {value,offset:i+1};
    }
    throw Error('MIDIの可変長が不正です');
  }
  function u16(bytes,offset){return bytes[offset]<<8|bytes[offset+1];}
  function u32(bytes,offset){
    return (bytes[offset]<<24)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3];
  }

  function parseTracks(bytes){
    if(bytes.length<14||ascii(bytes,0,4)!=='MThd')throw Error('MIDIファイルではありません');
    const division=u16(bytes,12);
    if(!(division>0&&division<0x8000))throw Error('SMPTE形式のMIDIには対応していません');
    const trackCount=u16(bytes,10);
    let offset=14;
    const tracks=[];
    for(let t=0;t<trackCount;t++){
      if(ascii(bytes,offset,4)!=='MTrk')throw Error('トラックの形式が不正です');
      const size=u32(bytes,offset+4);
      offset+=8;
      tracks.push(bytes.subarray(offset,offset+size));
      offset+=size;
    }
    return {division,tracks};
  }

  function parseTrack(track,meta){
    let tick=0,offset=0,running=0,endTick=0;
    const notes=[],programs=new Map(),names=new Map();
    while(offset<track.length){
      const {value:delta,offset:next}=vlq(track,offset);
      offset=next;
      tick+=delta;
      endTick=Math.max(endTick,tick);
      let status=track[offset];
      if(status<128){
        if(!running)throw Error('実行ステータスがありません');
        status=running;
      }else if((status&0x80)===0x80&&(status&0xf0)!==0xf0)running=status;
      const type=status&0xf0,channel=status&0x0f;
      if(status===0xff||type===0xff){
        const metaType=track[++offset];
        const {value:length,offset:dataStart}=vlq(track,++offset);
        offset=dataStart;
        const data=track.subarray(offset,offset+length);
        offset+=length;
        if(metaType===0x51&&data.length===3)meta.tempo=(data[0]<<16)|(data[1]<<8)|data[2];
        else if(metaType===0x58&&data.length>=4)meta.time={num:data[0],den:1<<data[1]};
        else if(metaType===0x03)names.set(channel,new TextDecoder().decode(data).slice(0,110));
        continue;
      }
      if(type===0xc0){programs.set(channel,track[offset+1]);offset+=2;continue;}
      if(type===0x80||type===0x90){
        const pitch=track[offset+1],velocity=track[offset+2];
        offset+=3;
        notes.push({tick,channel,pitch,down:type===0x90&&velocity>0});
        continue;
      }
      if(type===0xa0||type===0xb0||type===0xe0){offset+=3;continue;}
      if(type===0xd0){offset+=2;continue;}
      if(type===0xf0){
        const {value:length,offset:dataStart}=vlq(track,offset+1);
        offset=dataStart+length;
        continue;
      }
      offset+=1;
    }
    return {notes,programs,names,endTick};
  }

  function pairNotes(events,endTick){
    const active=new Map(),out=[];
    for(const event of events){
      const key=event.channel+':'+event.pitch;
      if(event.down){
        const list=active.get(key)||[];
        list.push(event.tick);
        active.set(key,list);
      }else{
        const list=active.get(key);
        if(list?.length)out.push({channel:event.channel,pitch:event.pitch,on:list.pop(),off:event.tick});
      }
    }
    for(const [key,starts] of active){
      const [channel,pitch]=key.split(':').map((v,i)=>i?Number(v):v);
      for(const on of starts)out.push({channel:Number(channel),pitch:Number(pitch),on,off:endTick||on+C.TPQ});
    }
    return out.sort((a,b)=>a.on-b.on||a.pitch-b.pitch);
  }

  function toKanadeTick(tick,division){return Math.round(tick*C.TPQ/division);}

  function quantizeTicks(notes,grid){
    const groups=new Map();
    for(const note of notes){
      const start=Math.max(0,Math.round(note.on/grid))*grid;
      if(!groups.has(start))groups.set(start,{start,end:start+grid,midis:new Set()});
      const group=groups.get(start);
      group.midis.add(note.pitch);
      group.end=Math.max(group.end,Math.max(start+grid,Math.round(note.off/grid)*grid));
    }
    return [...groups.values()].sort((a,b)=>a.start-b.start);
  }

  function nearestDen(length){
    let best={den:4,dots:0,ticks:C.durationTicks(4,0)},err=Infinity;
    for(const den of C.DENOMS)for(const dots of [0,1]){
      const ticks=C.durationTicks(den,dots);
      const e=Math.abs(ticks-length);
      if(e<err){err=e;best={den,dots,ticks};}
    }
    return best;
  }

  function soundFor(program,channel,name){
    if(channel===9)return {sound:'マーチング',clef:'percussion',instrument:name||'打楽器'};
    const samples=root.KanadeSamples?.presets||{};
    const hit=Object.entries(samples).find(([,preset])=>preset.program===program+1);
    return hit?{sound:hit[0],clef:'treble',instrument:name||hit[0]}:{sound:'ピアノ',clef:'treble',instrument:name||'パート'};
  }

  function advanceRests(score,cursor,gap){
    let next=score,left=gap;
    while(left>0){
      const offsets=C.measureOffsets(next);
      if(cursor>=offsets.at(-1))next=C.addMeasure(next);
      const {mi,tick}=C.locateTick(C.measureOffsets(next),cursor);
      const room=C.barTicks(next,mi)-tick;
      const chunk=Math.min(left,room);
      const {den,dots}=nearestDen(chunk);
      next=C.placeEventAt(next,mi,tick,C.makeRest(den,dots)).score;
      cursor+=chunk;
      left-=chunk;
    }
    return {score:next,cursor};
  }

  function buildPart(notes,meta,division,channel,program,name,title){
    const grid=Math.max(60,Math.round(C.TPQ/8));
    const kanade=notes.map(note=>({...note,on:toKanadeTick(note.on,division),off:toKanadeTick(note.off,division)}));
    const groups=quantizeTicks(kanade,grid);
    const tone=soundFor(program,channel,name);
    const tempo=Math.round(60000000/(meta.tempo||500000));
    const time=meta.time||{num:4,den:4};
    let score={...C.createScore(),title:title.slice(0,200),instrument:tone.instrument,sound:tone.sound,clef:tone.clef,
      tempo:Math.min(300,Math.max(20,tempo)),time,key:0,measures:[{id:C.uid(),events:[]}]};
    let cursor=0;
    for(const group of groups){
      if(group.start>cursor)({score,cursor}=advanceRests(score,cursor,group.start-cursor));
      const length=Math.max(grid,group.end-group.start);
      const {den,dots}=nearestDen(length);
      const pitches=channel===9
        ?[C.normalPitch({step:'C',octave:5,alter:0})]
        :C.normalizeChord([...group.midis].map(midi=>P.fromMidi(midi,score.key)));
      const event=C.makeNote(pitches[0],den,dots);
      if(pitches.length>1)event.pitches=pitches;
      const offsets=C.measureOffsets(score);
      if(group.start>=offsets.at(-1))score=C.addMeasure(score);
      const {mi,tick}=C.locateTick(C.measureOffsets(score),group.start);
      score=C.placeEventAt(score,mi,tick,event).score;
      cursor=group.start+length;
    }
    const errors=C.validateScore(score);
    if(errors.length)throw Error(errors[0]);
    return score;
  }

  function parse(buffer){
    const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
    if(bytes.length>MAX_BYTES)throw Error('MIDIの上限は'+(MAX_BYTES/1024/1024)+' MBです');
    const meta={tempo:500000,time:{num:4,den:4}};
    const {division,tracks}=parseTracks(bytes);
    const warnings=new Set(),warn=message=>warnings.add(message);
    const parts=[];
    let title='読み込んだMIDI';
    for(let ti=0;ti<tracks.length;ti++){
      const {notes,programs,names,endTick}=parseTrack(tracks[ti],meta);
      if(ti===0&&names.get(0))title=names.get(0);
      const channel=notes.find(note=>note.down)?.channel??0;
      const paired=pairNotes(notes,endTick);
      if(!paired.length)continue;
      const program=programs.get(channel)??0;
      const name=names.get(channel)||`トラック ${ti+1}`;
      try{
        parts.push(buildPart(paired,meta,division,channel,program,name,title));
      }catch(error){warn(name+' · '+error.message);}
    }
    if(!parts.length)throw Error('読み込める音符がありません');
    if(parts.length>32)throw Error('32トラックを超えるMIDIには対応していません');
    const [first,...ensembleParts]=parts;
    const score=ensembleParts.length?{...first,title:title.slice(0,200),ensembleParts}:first;
    if(parts.length>1)warn('各トラックを別パートとして取り込みました');
    warn('音価と休符は近似されます。細部は取り込み後に調整してください');
    const errors=C.validateScore(score);
    if(errors.length)throw Error(errors[0]);
    return {score,warnings:[...warnings]};
  }

  root.KanadeMIDIImport={parse,MAX_BYTES};
})(globalThis);