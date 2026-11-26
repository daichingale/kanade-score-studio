(function(root,factory){
  const api=factory(root.KanadeCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeRenderBench=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  if(!C&&typeof require==='function')C=require('./core.js');
  'use strict';
  function median(values){
    const sorted=[...values].sort((a,b)=>a-b);
    const mid=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
  }
  function buildScore(measures,notesPerMeasure){
    let score=C.createScore();
    while(score.measures.length<measures)score=C.addMeasure(score);
    for(let mi=0;mi<measures;mi++){
      let tick=0;
      const cap=C.barTicks(score,mi);
      for(let n=0;n<notesPerMeasure&&tick<cap;n++){
        const event=C.makeNote({step:C.STEPS[n%7],alter:0,octave:4},4);
        const result=C.placeAcrossBars(score,mi,tick,event,{overwrite:false});
        score=result.score;
        if(result.measureIndex!==mi)break;
        tick=C.eventSpans(score,mi).at(-1)?.end??0;
        if(tick>=cap)break;
      }
    }
    return score;
  }
  function batchLatency(iterations=24,windowMs=16){
    const marks=[];
    let pending=0,last=0,flushes=0;
    const env=typeof globalThis!=='undefined'?globalThis:this;
    const raf=env.requestAnimationFrame||(fn=>setTimeout(fn,0));
    const flush=()=>{pending=0;flushes++;last=performance.now();};
    const schedule=()=>{
      const now=performance.now();
      if(!pending){pending=raf(flush);marks.push(now-last);}
    };
    last=performance.now();
    for(let i=0;i<iterations;i++)schedule();
    return {medianMs:median(marks.filter(v=>v>=0)),flushes,iterations};
  }
  return {median,buildScore,batchLatency};
});