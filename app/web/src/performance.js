(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadePerformance=api;
})(globalThis,function(C){
  'use strict';
  const natural=[0,2,4,5,7,9,11];
  const third=[2,4],minor=[2,3],fifth=[4,7],seventh=[6,10],majorSeventh=[6,11],ninth=[8,14];
  const major=[[0,0],third,fifth],minorTriad=[[0,0],minor,fifth];
  const forms={
    '':major,m:minorTriad,'7':[...major,seventh],maj7:[...major,majorSeventh],m7:[...minorTriad,seventh],
    sus2:[[0,0],[1,2],fifth],sus4:[[0,0],[3,5],fifth],dim:[[0,0],minor,[4,6]],
    aug:[[0,0],third,[4,8]],m7b5:[[0,0],minor,[4,6],seventh],dim7:[[0,0],minor,[4,6],[6,9]],
    '6':[...major,[5,9]],m6:[...minorTriad,[5,9]],add9:[...major,ninth],
    '9':[...major,seventh,ninth],m9:[...minorTriad,seventh,ninth],maj9:[...major,majorSeventh,ninth],
    '5':[[0,0],fifth],'7sus4':[[0,0],[3,5],fifth,seventh],
  };
  const aliases={maj:'',min:'m','-':'m',M:'',M7:'maj7',M9:'maj9','Δ':'maj7','Δ7':'maj7','+':'aug','°':'dim','°7':'dim7','ø':'m7b5','ø7':'m7b5',sus:'sus4','-7':'m7','-9':'m9'};
  const mod=(value,n)=>(value%n+n)%n;
  function fromMidi(midi,key=0){
    if(!Number.isInteger(midi)||midi<12||midi>119)throw Error('記譜できる音域は C0〜B8 です');
    return C.STEPS.flatMap((step,index)=>{
      const octave=Math.floor((midi-natural[index]+1)/12)-1;
      const alter=midi-((octave+1)*12+natural[index]);
      return octave>=0&&octave<=8&&Math.abs(alter)<=1?[{step,alter,octave}]:[];
    }).sort((a,b)=>spellingCost(a,key)-spellingCost(b,key))[0];
  }
  function spellingCost(pitch,key){
    return 2*Math.abs(pitch.alter-C.keyAlter(pitch.step,key))+Math.abs(pitch.alter)+(pitch.alter*(key<0?-1:1)<0?.1:0);
  }
  function chordPitches(symbol,octave){
    const text=symbol.normalize('NFKC').trim().replace(/♭/g,'b').replace(/♯/g,'#').replace(/\s/g,'');
    const match=/^([A-Ga-g])([#b]?)([^/]*)(?:\/([A-Ga-g])([#b]?))?$/.exec(text);
    const suffix=match?.[3],quality=Object.hasOwn(aliases,suffix)?aliases[suffix]:suffix;
    if(!match||!Object.hasOwn(forms,quality))throw Error('コード名を確認してください（例 Cmaj7、B♭m7、D/F♯）');
    const rootIndex=C.STEPS.indexOf(match[1].toUpperCase()),alteration=sign=>sign==='#'?1:sign==='b'?-1:0;
    const rootMidi=(octave+1)*12+natural[rootIndex]+alteration(match[2]);
    const pitches=forms[quality].map(([step,semitones])=>{
      const degree=rootIndex+step,index=degree%7,noteOctave=octave+Math.floor(degree/7);
      return {step:C.STEPS[index],octave:noteOctave,alter:rootMidi+semitones-((noteOctave+1)*12+natural[index])};
    });
    if(match[4]){
      const step=match[4].toUpperCase(),alter=alteration(match[5]),pc=natural[C.STEPS.indexOf(step)]+alter;
      if(mod(pc,12)!==mod(rootMidi,12)){
        const bassOctave=Math.floor((rootMidi-1-pc)/12)-1;
        const existing=pitches.findIndex(pitch=>mod(C.pitchMidi(pitch),12)===mod(pc,12));
        if(existing>=0)pitches.splice(existing,1);
        pitches.unshift({step,alter,octave:bassOctave});
      }
    }
    return C.normalizeChord(pitches);
  }
  function midiNote(data){
    if(!data||data.length<3)return null;
    const type=data[0]&0xf0;
    if(type!==0x80&&type!==0x90||data[1]>127)return null;
    return {channel:data[0]&15,pitch:data[1],down:type===0x90&&data[2]>0};
  }
  function quantize(notes,{beatMs,grid,elapsed}){
    const gridMs=beatMs*grid/C.TPQ,groups=new Map();
    for(const note of notes){
      const start=Math.max(0,Math.round(note.on/gridMs))*grid;
      if(!groups.has(start))groups.set(start,{start,end:start+grid,midis:new Set()});
      const group=groups.get(start);
      group.midis.add(note.pitch);
      group.end=Math.max(group.end,Math.round((note.off??elapsed)/gridMs)*grid);
    }
    const ordered=[...groups.values()].sort((a,b)=>a.start-b.start);
    return ordered.map(({start,end,midis},index)=>({start,end:Math.min(end,ordered[index+1]?.start??Infinity),midis:[...midis]}));
  }
  function writeTake(score,start,groups,{overwrite=false,limitMeasure=null,offset=0}={}){
    let next=score,result=null;
    for(const group of groups){
      let position=start+group.start,remaining=group.end-group.start,first=true;
      const pitches=C.normalizeChord(group.midis.map(midi=>fromMidi(midi-offset,score.key)));
      while(remaining>0){
        let offsets=C.measureOffsets(next);
        while(position>=offsets.at(-1)){
          if(limitMeasure!==null)throw Error('第2声部の演奏は選択中の小節内に収めてください');
          next=C.addMeasure(next);offsets=C.measureOffsets(next);
        }
        const {mi,tick}=C.locateTick(offsets,position);
        if(limitMeasure!==null&&mi!==limitMeasure)throw Error('第2声部の演奏は選択中の小節内に収めてください');
        const length=Math.min(remaining,offsets[mi+1]-position);
        const events=C.exactDurations(length).map(({den,dots})=>{
          const event=C.makeNote(pitches[0],den,dots);
          event.pitches=pitches.map(({id,...pitch})=>C.normalPitch(pitch));
          remaining-=C.eventTicks(event);
          if(!first)event.tieStop=true;
          if(remaining)event.tieStart=true;
          first=false;
          return event;
        });
        result=C.placeEventsAt(next,mi,tick,events,{overwrite});
        next=result.score;position+=length;
      }
    }
    return result;
  }
  return {chordPitches,midiNote,fromMidi,quantize,writeTake};
});
