/* Note-level alignment: pitch + duration + tick tolerance → precision/recall/F1. */
(function(root){
  'use strict';
  const C=root.KanadeCore;

  function eventNotes(events){
    const out=[];
    for(const ev of events){
      if(ev.rest){
        out.push({mi:ev.mi,tick:ev.tick,rest:true,den:ev.den,dots:ev.dots||0});
        continue;
      }
      const pitches=ev.pitches||(ev.pitch?[ev.pitch]:[]);
      for(const pitch of pitches)out.push({
        mi:ev.mi??0,tick:ev.tick,pitch:C.normalPitch(pitch),den:ev.den,dots:ev.dots||0,rest:false
      });
    }
    return out;
  }

  function ticks(ev,barTicks){return (ev.mi||0)*barTicks+(ev.tick||0);}

  function pitchEq(a,b){
    if(!a||!b)return false;
    return a.step===b.step&&a.octave===b.octave&&(a.alter||0)===(b.alter||0);
  }

  function noteMatch(truth,got){
    if(truth.rest&&got.rest)return truth.den===got.den&&(truth.dots||0)===(got.dots||0);
    if(truth.rest||got.rest)return false;
    return pitchEq(truth.pitch,got.pitch)&&truth.den===got.den&&(truth.dots||0)===(got.dots||0);
  }

  function align(truthEvents,recognizedEvents,{barTicks=C.TPQ*4,tickTol=240}={}){
    const truth=eventNotes(truthEvents);
    const rec=eventNotes(recognizedEvents);
    const used=new Set();
    let tp=0,pitchOnly=0,durOnly=0;
    for(const expect of truth){
      let best=-1,bestScore=Infinity;
      for(let i=0;i<rec.length;i++){
        if(used.has(i))continue;
        const got=rec[i];
        const dt=Math.abs(ticks(expect,barTicks)-ticks(got,barTicks));
        if(dt>tickTol)continue;
        const p=pitchEq(expect.pitch,got.pitch);
        const d=(expect.den===got.den&&(expect.dots||0)===(got.dots||0));
        if(expect.rest&&got.rest){
          if(d&&dt<bestScore){bestScore=dt;best=i;}
          continue;
        }
        if(expect.rest||got.rest)continue;
        const score=dt+(p?0:1200)+(d?0:600);
        if(score<bestScore){bestScore=score;best=i;}
      }
      if(best<0)continue;
      used.add(best);
      const got=rec[best];
      if(noteMatch(expect,got))tp++;
      else if(!expect.rest&&!got.rest&&pitchEq(expect.pitch,got.pitch))pitchOnly++;
      else if(!expect.rest&&!got.rest&&expect.den===got.den)durOnly++;
    }
    const fp=rec.length-tp;
    const fn=truth.length-tp;
    const precision=tp/Math.max(1,tp+fp);
    const recall=tp/Math.max(1,tp+fn);
    const f1=precision+recall?2*precision*recall/(precision+recall):0;
    const pitch=pitchOnly+tp;
    const duration=tp;
    return {
      tp,fp,fn,precision,recall,f1,
      pitchAcc:pitch/Math.max(1,truth.length),
      durationAcc:duration/Math.max(1,truth.length),
      sample:truth.length,recognized:rec.length
    };
  }

  function categorize(truthEvents,recognizedEvents,{barTicks=C.TPQ*4,tickTol=240}={}){
    const truth=eventNotes(truthEvents);
    const rec=eventNotes(recognizedEvents);
    const used=new Set();
    const cat={missed:0,duration:0,pitch:0,extra:0,rest:0,matched:0};
    for(const expect of truth){
      let best=-1,bestScore=Infinity;
      for(let i=0;i<rec.length;i++){
        if(used.has(i))continue;
        const got=rec[i];
        const dt=Math.abs(ticks(expect,barTicks)-ticks(got,barTicks));
        if(dt>tickTol)continue;
        const score=dt+(pitchEq(expect.pitch,got.pitch)?0:900)+(expect.den===got.den&&(expect.dots||0)===(got.dots||0)?0:500);
        if(score<bestScore){bestScore=score;best=i;}
      }
      if(best<0){cat.missed++;continue;}
      used.add(best);
      const got=rec[best];
      if(noteMatch(expect,got))cat.matched++;
      else if(expect.rest||got.rest)cat.rest++;
      else if(!pitchEq(expect.pitch,got.pitch))cat.pitch++;
      else cat.duration++;
    }
    cat.extra=rec.length-cat.matched-cat.pitch-cat.duration-cat.rest;
    return cat;
  }

  root.KanadeOmrAlign={align,eventNotes,noteMatch,categorize};
})(globalThis);