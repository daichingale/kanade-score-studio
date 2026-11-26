/* Music-theory priors: key inference, bar filling, pitch snap. */
(function(root){
  'use strict';
  const C=root.KanadeCore,P=root.KanadePerformance;

  function pitchFromY(y,staff,clef='treble',key=0){
    const {lines,spacing}=staff;
    const refLine=clef==='bass'?lines[1]:lines[2];
    const refMidi=clef==='bass'?50:71;
    const halfSteps=Math.round((refLine-y)/(spacing/2));
    const midi=Math.min(108,Math.max(36,refMidi+halfSteps));
    return P.fromMidi(midi,key);
  }

  function inferKey(notes){
    const acc=n=>((n.pitch?.alter||0)+10)%12;
    const flats=notes.filter(n=>acc(n)<0).length;
    const sharps=notes.filter(n=>acc(n)>0).length;
    if(sharps>flats+1)return 1;
    if(flats>sharps+1)return -1;
    return 0;
  }

  function snapNotes(notes,key){
    return notes.map(note=>{
      const pitch=C.normalPitch({...note.pitch,alter:note.accidental??note.pitch.alter??C.keyAlter(note.pitch.step,key)});
      return {...note,pitch,alter:undefined};
    });
  }

  function xToTick(x,staff,slices,beats=4){
    if(!slices?.length)return Math.round(x/staff.spacing*C.TPQ/2);
    const slice=slices.find(s=>x>=s.left&&x<=s.right)||slices[Math.min(slices.length-1,Math.floor(x/(staff.width/slices.length)))];
    const pos=(x-slice.left)/Math.max(1,slice.width);
    const measureTicks=C.TPQ*beats;
    return slice.index*measureTicks+Math.round(pos*measureTicks);
  }

  function quantizeBarDurations(notes,time={num:4,den:4}){
    const barTicks=C.TPQ*time.num*(4/time.den);
    const sorted=[...notes].sort((a,b)=>a.tick-b.tick);
    const measures=new Map();
    for(const note of sorted){
      const mi=Math.floor(note.tick/barTicks);
      if(!measures.has(mi))measures.set(mi,[]);
      measures.get(mi).push(note);
    }
    const out=[];
    for(const [mi,group] of measures){
      let used=0;
      for(let i=0;i<group.length;i++){
        const note=group[i];
        const next=group[i+1];
        let need=C.durationTicks(note.den,note.dots||0);
        if(next)need=Math.min(need,Math.max(C.TPQ/8,next.tick-note.tick));
        if(used+need>barTicks)need=Math.max(C.TPQ/8,barTicks-used);
        out.push({...note,tick:mi*barTicks+used,den:nearestDen(need).den,dots:nearestDen(need).dots});
        used+=C.durationTicks(out.at(-1).den,out.at(-1).dots||0);
      }
    }
    return out.sort((a,b)=>a.tick-b.tick);
  }

  function nearestDen(length){
    let best={den:4,dots:0,ticks:C.durationTicks(4,0)};
    for(const den of C.DENOMS)for(const dots of [0,1]){
      const ticks=C.durationTicks(den,dots);
      const err=Math.abs(ticks-length);
      if(err<Math.abs(best.ticks-length))best={den,dots,ticks};
    }
    return best;
  }

  root.KanadeOmrPriors={pitchFromY,inferKey,snapNotes,xToTick,quantizeBarDurations,nearestDen};
})(globalThis);