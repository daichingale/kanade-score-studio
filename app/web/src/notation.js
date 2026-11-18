(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeNotation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  function beamLevel(event){return event.type==='note'&&event.den>=8?Math.log2(event.den/4):0;}
  function beatTicks(time){return C.WHOLE/time.den*(time.den===8&&time.num>=6&&time.num%3===0?3:1);}
  function beamGroups(score,mi){
    const beat=beatTicks(C.timeAt(score,mi)),groups=[];let group=[],bucket=-1,direction=null,tupletStart=-1;
    function flush(){if(group.length>1)groups.push(group);group=[];direction=null;}
    for(const span of C.eventSpans(score,mi,false)){
      if(span.event.tuplet?.index===0)tupletStart=span.index;
      const nextBucket=span.event.tuplet?'tuplet-'+tupletStart:Math.floor(span.start/beat);
      const eligible=beamLevel(span.event)>0&&(span.event.tuplet||span.end<=(nextBucket+1)*beat);
      if(!eligible){flush();bucket=-1;continue;}
      const forced=span.event.stemDirection;
      if(nextBucket!==bucket||span.event.beamBreak||(direction&&forced&&direction!==forced))flush();
      bucket=nextBucket;group.push(span);if(forced)direction=forced;
    }
    flush();return groups;
  }
  function beamMarks(score,mi){
    const result=new Map();
    for(const group of beamGroups(score,mi)){
      group.forEach((span,index)=>{
        const marks=[];
        for(let number=1;number<=beamLevel(span.event);number++){
          const previous=index>0&&beamLevel(group[index-1].event)>=number;
          const next=index+1<group.length&&beamLevel(group[index+1].event)>=number;
          marks.push({number,value:previous?(next?'continue':'end'):(next?'begin':index===group.length-1?'backward hook':'forward hook')});
        }
        result.set(span.event.id,marks);
      });
    }
    return result;
  }
  return {beamLevel,beatTicks,beamGroups,beamMarks};
});
