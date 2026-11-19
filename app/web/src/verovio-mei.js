(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeMei=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const CLEF={
    treble:{shape:'G',line:'2'},
    bass:{shape:'F',line:'4'},
    alto:{shape:'C',line:'3'},
    tenor:{shape:'C',line:'4'},
    percussion:{shape:'perc'}
  };
  const ACCID={1:'s',2:'x','-1':'f','-2':'ff',0:'n'};
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function xmlId(id){
    const body=String(id??'').replace(/[^A-Za-z0-9_.:-]/g,'');
    return 'evt-'+(body||'x');
  }
  function eventIdFromXmlId(id){
    const text=String(id||'');
    return text.startsWith('evt-')?text.slice(4):null;
  }
  function keySig(fifths){
    const value=Number(fifths)||0;
    if(!value)return '0';
    return value>0?value+'s':(-value)+'f';
  }
  function accid(step,alter,fifths){
    if(alter===C.keyAlter(step,fifths||0))return '';
    const name=ACCID[alter];
    return name?` accid="${name}"`:'';
  }
  function tieValue(event){
    if(event.tieStart&&event.tieStop)return 'm';
    if(event.tieStart)return 'i';
    if(event.tieStop)return 't';
    return '';
  }
  function durationAttrs(event){
    const dots=event.dots?` dots="${event.dots}"`:'';
    const tie=tieValue(event);
    return `dur="${event.den}"${dots}${tie?` tie="${tie}"`:''}`;
  }
  function verse(event){
    if(!event.lyric)return '';
    return `<verse n="1"><syl>${esc(event.lyric)}</syl></verse>`;
  }
  function pitchNote(pitch,fifths){
    return `<note pname="${String(pitch.step).toLowerCase()}" oct="${pitch.octave}"${accid(pitch.step,pitch.alter,fifths)}/>`;
  }
  function eventXml(event,fifths,mi,index,tick,entries){
    const id=xmlId(event.id);
    entries.push({xmlId:id,id:String(event.id),type:event.type,index,measure:mi,tick});
    if(event.type==='rest')return `<rest xml:id="${esc(id)}" ${durationAttrs(event)}/>`;
    const lyric=verse(event);
    if((event.pitches||[]).length>1){
      const notes=[...event.pitches].sort((a,b)=>C.diatonicNumber(a)-C.diatonicNumber(b)).map(pitch=>pitchNote(pitch,fifths)).join('');
      return `<chord xml:id="${esc(id)}" ${durationAttrs(event)}>${notes}${lyric}</chord>`;
    }
    const pitch=event.pitches[0];
    return `<note xml:id="${esc(id)}" ${durationAttrs(event)} pname="${String(pitch.step).toLowerCase()}" oct="${pitch.octave}"${accid(pitch.step,pitch.alter,fifths)}>${lyric}</note>`;
  }
  function groups(events){
    const out=[];
    for(let index=0;index<events.length;){
      const event=events[index];
      if(!event.tuplet){out.push({events:[event],start:index});index++;continue;}
      const grouped=[event];
      let next=index+1;
      while(next<events.length){
        const candidate=events[next];
        if(!candidate.tuplet||candidate.tuplet.actual!==event.tuplet.actual||candidate.tuplet.normal!==event.tuplet.normal)break;
        if((candidate.tuplet.index??0)<=(events[next-1].tuplet.index??0))break;
        grouped.push(candidate);next++;
      }
      out.push({events:grouped,tuplet:event.tuplet,start:index});
      index=next;
    }
    return out;
  }
  function layerOf(events,fifths,mi,entries){
    let tick=0,cursor=0;
    const body=groups(events||[]).map(group=>{
      const notes=group.events.map(event=>{
        const xml=eventXml(event,fifths,mi,cursor,tick,entries);
        tick+=C.eventTicks(event);cursor++;
        return xml;
      }).join('');
      if(!group.tuplet)return notes;
      return `<tuplet num="${group.tuplet.actual}" numbase="${group.tuplet.normal}">${notes}</tuplet>`;
    }).join('');
    return `<layer n="1">${body}</layer>`;
  }
  function staffDef(part,number){
    const clef=CLEF[part.clef]||CLEF.treble;
    const time=part.time||{num:4,den:4};
    const lines=part.staffLines??(part.clef==='percussion'?1:5);
    const clefAttr=clef.line?`clef.shape="${clef.shape}" clef.line="${clef.line}"`:`clef.shape="${clef.shape}"`;
    return `<staffDef n="${number}" lines="${lines}" ${clefAttr} key.sig="${keySig(part.key||0)}" meter.count="${time.num}" meter.unit="${time.den}" label="${esc(part.instrument||'')}"/>`;
  }
  function meiForParts(parts){
    const list=parts.filter(Boolean);
    const entries=[];
    const count=Math.max(...list.map(part=>part.measures.length));
    const measureMap=[];
    const measures=[];
    for(let mi=0;mi<count;mi++){
      const staves=list.map((part,index)=>{
        const measure=part.measures[mi];
        return `<staff n="${index+1}">${measure?layerOf(measure.events,part.key||0,mi,entries):'<layer n="1"/>'}</staff>`;
      }).join('');
      const time=C.timeAt(list[0],Math.min(mi,list[0].measures.length-1));
      const previous=mi?C.timeAt(list[0],Math.min(mi-1,list[0].measures.length-1)):time;
      const meter=mi&&(time.num!==previous.num||time.den!==previous.den)?` meter.count="${time.num}" meter.unit="${time.den}"`:'';
      const bar=list[0].measures[mi]||{};
      const edges=`${bar.repeatStart?' left="rptstart"':''}${bar.repeatEnd?' right="rptend"':''}`;
      measures.push(`<measure n="${mi+1}"${meter}${edges}>${staves}</measure>`);
      measureMap.push(mi);
    }
    const title=esc(list[0].title||'楽譜');
    const mei=`<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>${title}</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp>${list.map((part,index)=>staffDef(part,index+1)).join('')}</staffGrp></scoreDef>
    <section>${measures.join('')}</section>
  </score></mdiv></body></music>
</mei>`;
    return {mei,entries,measureMap};
  }
  function meiForPart(part){return meiForParts([part]);}
  function decorateSvg(svg,entries,measureMap){
    const byId=new Map(entries.map(entry=>[entry.xmlId,entry]));
    const tagged=String(svg).replace(/<g\b([^>]*?)>/g,(tag,attrs)=>{
      const found=attrs.match(/\b(?:xml:)?id="([^"]+)"/)||attrs.match(/\b(?:xml:)?id='([^']+)'/);
      if(!found||attrs.includes('data-event-id'))return tag;
      const meta=byId.get(found[1]);
      if(!meta)return tag;
      return `<g${attrs} data-event-id="${esc(meta.id)}" data-event-type="${meta.type}" data-event-index="${meta.index}" data-measure="${meta.measure}" data-event-tick="${meta.tick}" data-implicit="0">`;
    });
    if(!measureMap)return tagged;
    let seen=0;
    return tagged.replace(/<g\b[^>]*\bclass="measure"[^>]*>/g,tag=>{
      const mi=measureMap[seen++];
      if(mi===undefined||tag.includes('data-measure='))return tag;
      return tag.replace(/>$/,` data-measure="${mi}">`);
    });
  }
  function pitchFromStaff(y,box,clefName){
    const clef=C.CLEFS[clefName]||C.CLEFS.treble;
    const space=box.space||180;
    const lines=box.lines||5;
    if(clefName==='percussion'&&lines===1)return {step:'C',octave:4,n:clef.bottom};
    let n=clef.bottom+Math.round(((box.bottom??y)-y)/(space/2));
    n=Math.max(7,Math.min(69,n));
    return {step:C.STEPS[((n%7)+7)%7],octave:Math.max(0,Math.min(8,Math.floor(n/7)-1)),n};
  }
  function yForPitch(pitch,box,clefName){
    const clef=C.CLEFS[clefName]||C.CLEFS.treble;
    const half=(box.space||180)/2;
    return (box.bottom??0)-(C.diatonicNumber(pitch)-clef.bottom)*half;
  }
  function sortedPoints(points){
    return [...(points||[])].filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.tick)).sort((a,b)=>a.x-b.x);
  }
  function tickFromEngraving(x,box,points,timing){
    const space=box.space||180,cap=timing.cap,sorted=sortedPoints(points);
    let raw;
    if(!sorted.length)return tickFromBox(x,box,timing);
    else{
      const first=sorted[0],last=sorted[sorted.length-1];
      if(x<=first.x){
        if(!first.tick)raw=0;
        else{
          const origin=timing.notesStart??first.x-space*1.4;
          raw=first.tick*Math.max(0,Math.min(1,(x-origin)/Math.max(1,first.x-origin)));
        }
      }else if(x>=last.x){
        const end=box.x1-space*0.35;
        raw=last.tick+(cap-last.tick)*Math.max(0,Math.min(1,(x-last.x)/Math.max(1,end-last.x)));
      }else{
        let index=0;
        while(index<sorted.length-1&&x>sorted[index+1].x)index++;
        const left=sorted[index],right=sorted[index+1];
        raw=left.tick+(right.tick-left.tick)*((x-left.x)/Math.max(1,right.x-left.x));
      }
    }
    const tick=timing.score?C.snapInputTick(timing.score,timing.mi,Math.max(0,Math.min(cap-1,raw)),timing.den,timing.dots):Math.max(0,Math.min(cap-1,Math.round(raw)));
    const valid=timing.score?C.canPlaceAt(timing.score,timing.mi,tick,timing.den,timing.dots,{overwrite:!!timing.overwrite}):true;
    return {tick,valid,x:xForTick(tick,box,sorted,timing)};
  }
  function xForTick(tick,box,points,timing){
    const space=box.space||180,cap=timing.cap,sorted=sortedPoints(points);
    if(!sorted.length){
      const placed=tickFromBox(box.x0,box,timing);
      return placed.notesStart+(tick/cap)*placed.usable;
    }
    const first=sorted[0],last=sorted[sorted.length-1];
    if(tick<=first.tick)return first.x;
    if(tick>=last.tick){
      const end=box.x1-space*0.35;
      return last.x+(end-last.x)*((tick-last.tick)/Math.max(1,cap-last.tick));
    }
    let index=0;
    while(index<sorted.length-1&&tick>sorted[index+1].tick)index++;
    const left=sorted[index],right=sorted[index+1];
    return left.x+(right.x-left.x)*((tick-left.tick)/Math.max(1,right.tick-left.tick));
  }
  function tickFromBox(x,box,timing){
    const space=box.space||180;
    const cap=timing.cap;
    const systemStart=timing.systemStart??box.x0;
    const atSystemStart=Math.abs(box.x0-systemStart)<1;
    const notesStart=timing.notesStart??box.x0+(atSystemStart?space*4.2:space*0.8);
    const usable=Math.max(space,box.x1-notesStart-space*0.5);
    const raw=((x-notesStart)/usable)*cap;
    const tick=timing.score?C.snapInputTick(timing.score,timing.mi,Math.max(0,Math.min(cap-1,raw)),timing.den,timing.dots):Math.max(0,Math.min(cap-1,Math.round(raw)));
    const valid=timing.score?C.canPlaceAt(timing.score,timing.mi,tick,timing.den,timing.dots,{overwrite:!!timing.overwrite}):true;
    return {tick,notesStart,usable,valid,x:notesStart+(tick/cap)*usable};
  }
  return {xmlId,eventIdFromXmlId,keySig,meiForPart,meiForParts,decorateSvg,pitchFromStaff,yForPitch,tickFromBox,tickFromEngraving,xForTick};
});
