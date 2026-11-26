(function(root,factory){
  const api=factory(root.KanadeCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeFastEntry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const STORAGE='kanade.fastEntry.v1';
  const defaults={autoAdvance:true,autoFillRest:false,autoFillDen:4};
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE)||'{}');
      return {...defaults,
        autoAdvance:saved.autoAdvance!==false,
        autoFillRest:saved.autoFillRest===true,
        autoFillDen:C.DENOMS.includes(saved.autoFillDen)?saved.autoFillDen:4
      };
    }catch(_){return {...defaults};}
  }
  function save(settings){
    try{localStorage.setItem(STORAGE,JSON.stringify(settings));}catch(_){}
  }
  function maybeFillBar(score,mi,afterTick,den){
    const cap=C.barTicks(score,mi),remaining=cap-afterTick;
    if(remaining<=0||remaining>=cap)return score;
    const ticks=C.durationTicks(den,0);
    if(remaining%ticks!==0)return score;
    const rest=C.makeRest(den,0);
    return C.placeAcrossBars(score,mi,afterTick,rest,{overwrite:false}).score;
  }
  function repeatPreviousBar(score,mi){
    if(mi<=0)throw Error('1小節目は複製できません');
    if(!score.measures[mi-1]?.events.length)throw Error('前の小節に音符がありません');
    const cloned=C.cloneMeasure(score.measures[mi-1]);
    const measures=score.measures.slice();
    measures[mi]={...measures[mi],events:cloned.events,...(cloned.voice2?{voice2:cloned.voice2}:{})};
    const next={...score,measures};
    return {score:next,mi,tick:C.measureOffsets(next)[mi]};
  }
  return {load,save,maybeFillBar,repeatPreviousBar,defaults};
});