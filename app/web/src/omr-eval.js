/* OMR accuracy metrics for tests and tuning reports. */
(function(root){
  'use strict';
  const C=root.KanadeCore;

  function pitchId(p){return `${p.step}${p.alter||0}:${p.octave}`;}

  function matchPitch(a,b){return a.step===b.step&&a.octave===b.octave&&(a.alter||0)===(b.alter||0);}

  function durationId(den,dots=0){return `${den}:${dots}`;}

  function compareTruth(truth,recognized){
    const truthNotes=truth.map(item=>({pitch:item.pitch,den:item.den,dots:item.dots||0}));
    const recNotes=recognized.map(item=>({pitch:item.pitch,den:item.den,dots:item.dots||0}));
    let pitchHits=0,durHits=0;
    const used=new Set();
    for(const expect of truthNotes){
      const idx=recNotes.findIndex((note,i)=>!used.has(i)&&matchPitch(expect.pitch,note.pitch));
      if(idx>=0){
        used.add(idx);
        pitchHits++;
        const got=recNotes[idx];
        if(got.den===expect.den&&(got.dots||0)===(expect.dots||0))durHits++;
      }
    }
    const pitch=pitchHits/Math.max(1,truthNotes.length);
    const duration=durHits/Math.max(1,truthNotes.length);
    return {pitch,duration,sample:truthNotes.length,recognized:recNotes.length,pitchHits,durHits};
  }

  function truthFromScore(score){
    return root.KanadeOmrFixture.groundTruth(score);
  }

  root.KanadeOmrEval={compareTruth,truthFromScore,pitchId,durationId};
})(globalThis);