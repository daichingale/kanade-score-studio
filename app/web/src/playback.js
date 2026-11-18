/* Score playback planning. Times remain in score ticks until the transport sets its rate. */
(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadePlayback=api;
})(globalThis,function(C){
  'use strict';
  const steady={pppppp:.20,ppppp:.24,pppp:.29,ppp:.36,pp:.45,p:.58,mp:.75,mf:1,f:1.22,ff:1.43,fff:1.55,ffff:1.65,fffff:1.73,ffffff:1.8};
  const attacks={fp:[1.3,.58],pf:[1.1,1.22],sf:[1.4],sfp:[1.5,.58],sfpp:[1.5,.45],sfz:[1.55],sfzp:[1.55,.58],sffz:[1.75],fz:[1.42],rf:[1.35],rfz:[1.5]};
  const gates={'staccatissimo':.31,'spiccato':.39,'staccato':.48,'detached-legato':.72,'breath-mark':.8,'tenuto':.99};
  const min=(low,value,high)=>Math.max(low,Math.min(high,value));
  function through(points,tick){
    let left=0,right=points.length;
    while(left<right){
      const mid=(left+right)>>1;
      if(points[mid].tick<=tick)left=mid+1;else right=mid;
    }
    return left;
  }
  function levelAt(points,tick){
    const index=through(points,tick),from=points[Math.max(0,index-1)],to=points[index];
    return !to||tick<=from.tick?from.level:from.level+(to.level-from.level)*(tick-from.tick)/(to.tick-from.tick);
  }
  function dynamics(score,offsets){
    const directions=[],points=[{tick:0,level:1}],punch=new Map();
    for(const [mi,bar] of score.measures.entries()){
      for(const mark of bar.directions||[])directions.push({mi,mark,tick:offsets[mi]+mark.tick});
    }
    directions.sort((a,b)=>a.tick-b.tick);
    const writtenLevels=new Map(directions.filter(({mark})=>Object.hasOwn(steady,mark.key)).map(({mark,tick})=>[tick,steady[mark.key]]));
    function trim(tick){
      const level=levelAt(points,tick);
      points.length=through(points,tick);
      points.push({tick,level});
      return level;
    }
    for(const {mi,mark,tick} of directions){
      if(Object.hasOwn(steady,mark.key)){
        trim(tick);points.push({tick,level:steady[mark.key]});continue;
      }
      if(Object.hasOwn(attacks,mark.key)){
        const [accent,after]=attacks[mark.key];
        punch.set(tick,accent);
        if(after){trim(tick);points.push({tick,level:after});}
        continue;
      }
      if(mark.key==='crescendo'||mark.key==='diminuendo'){
        const end=C.directionEnd(score,mi,mark);
        const endTick=end&&offsets[end.mi]+end.tick;
        if(!(endTick>tick))continue;
        const start=trim(tick);
        const target=writtenLevels.get(endTick)??min(.20,start*(mark.key==='crescendo'?1.48:.67),1.85);
        points.push({tick:endTick,level:target});
      }
    }
    return {points,punch};
  }

  function compile(parts){
    const events=[],samples=new Map(),reference=parts[0],offsets=C.measureOffsets(reference);
    const soundingTracks=new Set();
    for(const track of parts){
      const secondsGrid=C.measureOffsets(track),instrument=C.soundName(track),offset=C.soundingOffset(track);
      const {points,punch}=dynamics(track,secondsGrid);
      if(!samples.has(instrument))samples.set(instrument,new Set());
      const midis=samples.get(instrument);
      const voices=track.measures.some(bar=>bar.voice2?.length)?[track,C.voiceScore(track,2)]:[track];
      for(const score of voices){
        let previous=null;
        for(const [mi,bar] of score.measures.entries()){
          let onset=secondsGrid[mi],writtenTick=onset;
          for(const [index,note] of bar.events.entries()){
            const ticks=C.exactEventTicks(note);
            if(note.type==='note'){
              const ties=C.tieFlags(score,mi,index),marks=note.articulations||[];
              if(ties.stop&&previous)previous.end=onset+ticks;
              else{
                const releases=marks.filter(mark=>Object.hasOwn(gates,mark)).map(mark=>gates[mark]);
                const gate=ties.start?1:Math.min(...(releases.length?releases:[.96]));
                const attack=marks.includes('marcato')?1.35:marks.includes('accent')?1.23:1;
                previous={start:onset,end:onset+ticks*gate,part:track.id,instrument,offset,pitches:note.pitches,
                  emphasis:attack*(punch.get(writtenTick)||1),points};
                events.push(previous);soundingTracks.add(track.id);
              }
              for(const pitch of note.pitches)midis.add(C.pitchMidi(pitch)+offset);
            }else previous=null;
            onset+=ticks;writtenTick+=C.eventTicks(note);
          }
        }
      }
    }
    events.sort((a,b)=>a.start-b.start);
    return {events,samples,offsets,soundingTracks:soundingTracks.size,trackIds:new Set(parts.map(part=>part.id)),tempo:reference.tempo};
  }

  function region(compiled,{from=0,to=compiled.offsets.at(-1),rate=1,measureMap,revision=0}={}){
    const total=compiled.offsets.at(-1);
    const start=min(0,from,total),end=min(start,to,total);
    const secondsPerTick=60/(compiled.tempo*min(.45,rate,1.6)*C.TPQ);
    const events=compiled.events.flatMap(event=>{
      if(event.start>=end||event.end<=start)return [];
      const a=Math.max(start,event.start),b=Math.min(end,event.end);
      const curve=[{time:0,level:levelAt(event.points,a)}];
      for(let i=through(event.points,a);i<event.points.length&&event.points[i].tick<b;i++){
        const point=event.points[i];curve.push({time:(point.tick-a)*secondsPerTick,level:point.level});
      }
      curve.push({time:(b-a)*secondsPerTick,level:levelAt(event.points,b-.000001)});
      return [{...event,time:(a-start)*secondsPerTick,duration:(b-a)*secondsPerTick,curve}];
    });
    return {...compiled,events,secondsPerTick,measureMap,revision,start,end,duration:(end-start)*secondsPerTick};
  }
  function position(plan,elapsed){
    const absolute=min(plan.start,plan.start+Math.max(elapsed,0)/plan.secondsPerTick,Math.max(plan.start,plan.end-.000001));
    const {mi,tick}=C.locateTick(plan.offsets,absolute);
    return {measure:plan.measureMap?.[mi]??mi,tick,absolute,revision:plan.revision,progress:min(0,elapsed/plan.duration,1)};
  }
  return {compile,region,position};
});
