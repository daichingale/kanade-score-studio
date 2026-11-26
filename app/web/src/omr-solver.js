/* Bar-duration solver, key/accidental carry, octave clamps, tie heuristics. */
(function(root){
  'use strict';
  const C=root.KanadeCore;

  function barTicks(time){return C.TPQ*time.num*(4/time.den);}

  function solveBarDurations(notes,time){
    const ticks=barTicks(time);
    const byMeasure=new Map();
    for(const note of [...notes].sort((a,b)=>(a.mi||0)-(b.mi||0)||a.tick-b.tick)){
      const mi=note.mi??Math.floor((note.tick||0)/ticks);
      if(!byMeasure.has(mi))byMeasure.set(mi,[]);
      byMeasure.get(mi).push({...note,mi,tick:(note.tick||0)%ticks});
    }
    const out=[];
    for(const [mi,group] of byMeasure){
      let cursor=0;
      for(let i=0;i<group.length;i++){
        const note=group[i];
        let need=C.durationTicks(note.den,note.dots||0);
        const next=group[i+1];
        if(next)need=Math.min(need,Math.max(C.TPQ/16,next.tick-cursor));
        const room=ticks-cursor;
        if(need>room)need=Math.max(C.TPQ/16,room);
        out.push({...note,mi,tick:cursor,den:pickDen(need),dots:pickDots(need)});
        cursor+=C.durationTicks(out.at(-1).den,out.at(-1).dots||0);
      }
      const gap=ticks-cursor;
      if(gap>=C.TPQ/32)out.push({mi,tick:cursor,rest:true,den:pickDen(gap),dots:pickDots(gap),confidence:0.55});
    }
    return out.sort((a,b)=>a.mi-b.mi||a.tick-b.tick);
  }

  function pickDen(length){
    let best={den:4,dots:0,t:C.durationTicks(4,0)};
    for(const den of C.DENOMS)for(const dots of [0,1]){
      const t=C.durationTicks(den,dots);
      if(Math.abs(t-length)<Math.abs(best.t-length))best={den,dots,t};
    }
    return best.den;
  }
  function pickDots(length){
    for(const den of C.DENOMS)for(const dots of [0,1]){
      if(C.durationTicks(den,dots)===length) return dots;
    }
    return 0;
  }

  function applyKeySignature(notes,key=0){
    const accidentalBar=new Map();
    return notes.map(note=>{
      if(note.rest||!note.pitch)return note;
      const mi=note.mi||0;
      const explicit=(note.pitch.alter||0)!==0;
      if(explicit){
        accidentalBar.set(`${mi}:${note.pitch.step}:${note.pitch.octave}`,note.pitch.alter);
        return note;
      }
      const carried=accidentalBar.get(`${mi}:${note.pitch.step}:${note.pitch.octave}`);
      const alter=carried!=null?carried:(C.keyAlter(note.pitch.step,key)||0);
      return {...note,pitch:C.normalPitch({...note.pitch,alter})};
    });
  }

  function clampOctave(notes,{minMidi=55,maxMidi=84}={}){
    return notes.map(note=>{
      if(note.rest||!note.pitch)return note;
      const midi=C.pitchMidi(note.pitch);
      if(midi>=minMidi&&midi<=maxMidi)return {...note,confidence:Math.min(1,(note.confidence||0.8)+(midi<minMidi||midi>maxMidi?-0.2:0.05))};
      const clamped=Math.max(minMidi,Math.min(maxMidi,midi));
      const P=root.KanadePerformance;
      return {...note,pitch:P.fromMidi(clamped,0),confidence:(note.confidence||0.7)*0.65,flag:'octave'};
    });
  }

  function mergeTies(notes,time){
    const ticks=barTicks(time);
    const sorted=[...notes].sort((a,b)=>a.mi-b.mi||a.tick-b.tick);
    const out=[];
    for(const note of sorted){
      const prev=out.at(-1);
      if(prev&&!prev.rest&&!note.rest&&pitchEq(prev.pitch,note.pitch)&&
        ((prev.mi===note.mi&&prev.tick+C.durationTicks(prev.den,prev.dots||0)===note.tick)||
         (note.mi===prev.mi+1&&note.tick===0&&prev.tick+C.durationTicks(prev.den,prev.dots||0)>=ticks-C.TPQ/16))){
        prev.tie=true;
        prev.confidence=Math.min(prev.confidence||0.8,note.confidence||0.8);
        continue;
      }
      out.push({...note});
    }
    return out;
  }

  function pitchEq(a,b){return a.step===b.step&&a.octave===b.octave&&(a.alter||0)===(b.alter||0);}

  function flagLowConfidence(notes,threshold=0.72){
    return notes.map(note=>({...note,low:((note.confidence??0.85)<threshold||note.flag)}));
  }

  function correct(notes,{time,key=0,instrument='melody'}={}){
    const range=instrument==='bass'?{minMidi:40,maxMidi:72}:{minMidi:55,maxMidi:88};
    let next=solveBarDurations(notes,time);
    next=clampOctave(next,range);
    next=applyKeySignature(next,key);
    next=mergeTies(next,time);
    next=flagLowConfidence(next);
    return next;
  }

  root.KanadeOmrSolver={correct,solveBarDurations,flagLowConfidence,barTicks};
})(globalThis);