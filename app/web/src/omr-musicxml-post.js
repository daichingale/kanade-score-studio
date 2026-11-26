/* Heuristic post-corrections after MusicXML import (OMR noise). */
(function(root){
  'use strict';
  const C=root.KanadeCore;

  function voiceEvents(bar){
    return [...(bar.events||[]),...(bar.voice2||[])];
  }

  function keySnapAccidentals(score){
    const key=Number.isFinite(score.key)?score.key:0;
    for(const bar of score.measures){
      for(const ev of voiceEvents(bar)){
        if(ev.type!=='note'||!ev.pitches)continue;
        for(const p of ev.pitches){
          const exp=C.keyAlter(p.step,key);
          if((p.alter||0)===exp&&exp!==0)p.displayAccidental=false;
        }
      }
    }
  }

  function rhythmicSnapBar(bar,mi,score,warn){
    const cap=C.barTicks(score,mi);
    for(const key of ['events','voice2']){
      const list=bar[key];
      if(!list?.length)continue;
      const used=C.usedTicks({...bar,events:list});
      const gap=cap-used;
      if(!gap)continue;
      if(gap>0&&gap<=C.TPQ*2){
        list.push(...C.fillRests(gap).map(r=>C.makeRest(r.den,r.dots)));
        warn?.('小節末に休符を補いました');
        continue;
      }
      if(gap<0&&gap>=-C.TPQ/4){
        let over=-gap;
        while(over>0&&list.length){
          const last=list[list.length-1];
          const len=C.eventTicks(last);
          if(len<=over){over-=len;list.pop();continue;}
          const segs=C.exactDurations(len-over);
          list.splice(list.length-1,1,...segs.map(({den,dots})=>
            last.type==='note'?C.makeNote(last.pitches[0],den,dots):C.makeRest(den,dots)));
          over=0;
          warn?.('小節の音価を拍子に合わせて調整しました');
        }
      }
    }
  }

  function tieLikelyFix(score,warn){
    for(let mi=0;mi<score.measures.length-1;mi++){
      const a=score.measures[mi].events?.at(-1);
      const b=score.measures[mi+1].events?.[0];
      if(!a||!b||a.type!=='note'||b.type!=='note')continue;
      if(C.samePitches(a.pitches,b.pitches)&&a.den===b.den&&!a.tieStart&&!b.tieStop){
        a.tieStart=true;b.tieStop=true;
        warn?.('同音連結を推定しました');
      }
    }
  }

  function applyPostCorrections(score,{warn}={}){
    const w=typeof warn==='function'?warn:()=>{};
    keySnapAccidentals(score);
    for(let mi=0;mi<score.measures.length;mi++)rhythmicSnapBar(score.measures[mi],mi,score,w);
    tieLikelyFix(score,w);
    return score;
  }

  root.KanadeMusicXmlPost={applyPostCorrections,keySnapAccidentals,rhythmicSnapBar};
})(globalThis);