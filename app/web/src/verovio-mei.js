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
  const ARTIC={
    accent:'acc',staccato:'stacc',tenuto:'ten',marcato:'marc',staccatissimo:'stacciss','detached-legato':'tenstacc',
    spiccato:'spicc','breath-mark':'breath',caesura:'caesura',fermata:'fermata','short-fermata':'fermata','long-fermata':'fermata',
    trill:'trill',turn:'turn','inverted-turn':'invturn',mordent:'mordent','inverted-mordent':'upmordent'
  };
  function durationAttrs(event){
    const dots=event.dots?` dots="${event.dots}"`:'';
    const tie=tieValue(event);
    const stem=event.stemDirection?` stem.dir="${event.stemDirection}"`:'';
    return `dur="${event.den}"${dots}${tie?` tie="${tie}"`:''}${stem}`;
  }
  function articXml(event){
    return (event.articulations||[]).map(name=>{
      const artic=ARTIC[name];
      if(artic)return `<artic artic="${artic}"/>`;
      const label=C.Symbols.notes[name]?.label;
      return label?`<dir place="above">${esc(label)}</dir>`:'';
    }).join('');
  }
  function verse(event){
    if(!event.lyric)return '';
    return `<verse n="1"><syl>${esc(event.lyric)}</syl></verse>`;
  }
  function pitchNote(pitch,fifths){
    return `<note pname="${String(pitch.step).toLowerCase()}" oct="${pitch.octave}"${accid(pitch.step,pitch.alter,fifths)}/>`;
  }
  function graceXml(event,fifths){
    return (event.graces||[]).map(pitch=>`<note grace="unacc" dur="8" stem.dir="up" pname="${String(pitch.step).toLowerCase()}" oct="${pitch.octave}"${accid(pitch.step,pitch.alter,fifths)}/>`).join('');
  }
  function eventXml(event,fifths,mi,index,tick,entries,staff){
    if(event.space)return `<space ${durationAttrs(event)}/>`;
    const id=xmlId(event.id);
    entries.push({xmlId:id,id:String(event.id),type:event.type,index,measure:mi,tick,staff});
    if(event.type==='rest')return `<rest xml:id="${esc(id)}" ${durationAttrs(event)}/>`;
    const lyric=verse(event),marks=articXml(event);
    const grace=graceXml(event,fifths);
    if((event.pitches||[]).length>1){
      const notes=[...event.pitches].sort((a,b)=>C.diatonicNumber(a)-C.diatonicNumber(b)).map(pitch=>pitchNote(pitch,fifths)).join('');
      return `${grace}<chord xml:id="${esc(id)}" ${durationAttrs(event)}>${notes}${marks}${lyric}</chord>`;
    }
    const pitch=event.pitches[0];
    return `${grace}<note xml:id="${esc(id)}" ${durationAttrs(event)} pname="${String(pitch.step).toLowerCase()}" oct="${pitch.octave}"${accid(pitch.step,pitch.alter,fifths)}>${marks}${lyric}</note>`;
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
  function layerOf(events,fifths,mi,entries,staff,layer=1){
    let tick=0,cursor=0;
    const body=groups(events||[]).map(group=>{
      const notes=group.events.map(event=>{
        const xml=eventXml(event,fifths,mi,cursor,tick,entries,staff);
        tick+=C.eventTicks(event);cursor++;
        return xml;
      }).join('');
      if(!group.tuplet)return notes;
      return `<tuplet num="${group.tuplet.actual}" numbase="${group.tuplet.normal}">${notes}</tuplet>`;
    }).join('');
    return `<layer n="${layer}">${body}</layer>`;
  }
  function clefChangeXml(name){
    const clef=CLEF[name]||CLEF.treble;
    return clef.line?`<clef shape="${clef.shape}" line="${clef.line}"/>`:`<clef shape="${clef.shape}"/>`;
  }
  function staffMusic(part,mi,fifths,entries,staffNumber,staffIndex){
    const bar=part.measures[mi]||{events:[]};
    const events=staffIndex===2?bar.staff2||[]:bar.events||[];
    const voice=staffIndex===2?bar.staff2Voice:bar.voice2;
    const clefName=C.clefAt(part,mi,staffIndex);
    const previous=mi?C.clefAt(part,mi-1,staffIndex):clefName;
    const change=mi&&clefName!==previous?clefChangeXml(clefName):'';
    const second=voice?.length?layerOf(voice,fifths,mi,entries,staffNumber,2):'';
    return `<staff n="${staffNumber}">${change}${layerOf(events,fifths,mi,entries,staffNumber,1)}${second}</staff>`;
  }
  function staffDef(part,number,staffIndex=1,label){
    const clefName=C.clefAt(part,0,staffIndex);
    const clef=CLEF[clefName]||CLEF.treble;
    const time=C.timeAt(part,0);
    const lines=C.staffLinesOf(part,staffIndex);
    const clefAttr=clef.line?`clef.shape="${clef.shape}" clef.line="${clef.line}"`:`clef.shape="${clef.shape}"`;
    const name=label===undefined?(staffIndex===1?(part.instrument||''):''):label;
    return `<staffDef n="${number}" lines="${lines}" ${clefAttr} key.sig="${keySig(C.keyAt(part,0))}" meter.count="${time.num}" meter.unit="${time.den}"${name?` label="${esc(name)}"`:''}/>`;
  }
  function expandParts(parts){
    const slots=[];
    parts.filter(Boolean).forEach((part,partIndex)=>{
      const count=C.staffCount(part);
      for(let staff=1;staff<=count;staff++){
        slots.push({part,partIndex,staff,n:slots.length+1});
      }
    });
    return slots;
  }
  function staffGrpXml(parts){
    const slots=expandParts(parts);
    const groups=parts[0]?.staffGroups||[];
    const byPartStart=new Map(groups.map(group=>[group.start,group]));
    const chunks=[];
    let index=0;
    while(index<slots.length){
      const slot=slots[index];
      const part=slot.part;
      if(slot.staff===1&&C.isGrandStaff(part)){
        const upper=staffDef(part,slot.n,1,part.instrument||'');
        const lowerSlot=slots[index+1];
        const lower=staffDef(part,lowerSlot.n,2,'');
        chunks.push(`<staffGrp symbol="brace" bar.thru="true">${upper}${lower}</staffGrp>`);
        index+=2;
        continue;
      }
      const group=slot.staff===1?byPartStart.get(slot.partIndex):null;
      if(group){
        const members=[];
        while(index<slots.length&&slots[index].partIndex<=group.end){
          const current=slots[index];
          if(current.staff===1&&C.isGrandStaff(current.part)){
            members.push(`<staffGrp symbol="brace" bar.thru="true">${staffDef(current.part,current.n,1,current.part.instrument||'')}${staffDef(current.part,slots[index+1].n,2,'')}</staffGrp>`);
            index+=2;
          }else{
            members.push(staffDef(current.part,current.n,current.staff,current.staff===1?current.part.instrument||'':''));
            index++;
          }
        }
        chunks.push(`<staffGrp symbol="${group.symbol==='brace'?'brace':'bracket'}">${members.join('')}</staffGrp>`);
        continue;
      }
      chunks.push(staffDef(part,slot.n,slot.staff,slot.staff===1?part.instrument||'':''));
      index++;
    }
    return chunks.join('');
  }
  function noteAt(entries,mi,tick,staff){
    return entries.find(entry=>entry.measure===mi&&entry.tick===tick&&entry.type==='note'&&(staff===undefined||entry.staff===staff));
  }
  function directionXml(part,mi,entries,staffNumber){
    const out=[];
    const placeOf=preset=>preset.placement==='below'?'below':'above';
    for(const mark of part.measures[mi]?.directions||[]){
      const preset=C.Symbols.byKey[mark.key];
      if(!preset||C.isRangeDirection(mark.key))continue;
      const place=placeOf(preset);
      if(preset.style==='dynamic'){out.push(`<dir place="${place}" staff="${staffNumber}"><dynam>${esc(preset.label)}</dynam></dir>`);continue;}
      if(mark.key==='segno'||mark.key==='coda'){out.push(`<dir place="above" staff="${staffNumber}" type="${mark.key}">${esc(preset.label)}</dir>`);continue;}
      const text=mark.text||preset.label;
      const tag=preset.group==='速度'?'tempo':preset.group==='進行・リハーサル'&&/^[A-J]$/.test(text)?'reh':'dir';
      out.push(`<${tag} place="${place}" staff="${staffNumber}">${esc(text)}</${tag}>`);
    }
    if(!part.sharedStaff)for(const cue of C.divisiCues(part,1).filter(cue=>cue.mi===mi)){
      if((part.measures[mi].directions||[]).some(mark=>mark.text===cue.text))continue;
      out.push(`<dir place="above" staff="${staffNumber}">${cue.text}</dir>`);
    }
    if(C.isGrandStaff(part))for(const cue of C.divisiCues(part,2).filter(cue=>cue.mi===mi)){
      out.push(`<dir place="above" staff="${staffNumber+1}">${cue.text}</dir>`);
    }
    for(const segment of C.directionSegments(part,mi)){
      const {mark,startTick,endTick,first,last,from}=segment;
      if(!first)continue;
      const end=C.directionEnd(part,from,mark);
      const startNote=noteAt(entries,mi,startTick,staffNumber);
      const endNote=end&&noteAt(entries,end.mi,end.tick,staffNumber);
      if(!startNote||!endNote)continue;
      if(mark.key==='slur')out.push(`<slur startid="#${startNote.xmlId}" endid="#${endNote.xmlId}" place="above"/>`);
      else out.push(`<hairpin form="${mark.key==='crescendo'?'cres':'dim'}" startid="#${startNote.xmlId}" endid="#${endNote.xmlId}" place="below"/>`);
    }
    if(Number.isInteger(part.measures[mi]?.tempo))out.push(`<tempo place="above" staff="${staffNumber}" midi.bpm="${part.measures[mi].tempo}">♩ = ${part.measures[mi].tempo}</tempo>`);
    return out.join('');
  }
  function remapGroups(groups,rows){
    return (groups||[]).flatMap(group=>{
      const members=rows.map((row,index)=>({index,row})).filter(({row})=>{
        const end=row.secondary??row.source;
        return end>=group.start&&row.source<=group.end;
      });
      if(members.length<2)return [];
      return [{...group,start:members[0].index,end:members.at(-1).index}];
    });
  }
  function meiForParts(parts,staffGroups,partUnions){
    const list=parts.filter(Boolean);
    const unions=partUnions||parts.partUnions||[];
    const rows=unions.length?C.displayParts(list,unions):list.map((part,source)=>({part,source,secondary:null}));
    const shown=rows.map(row=>row.part);
    const entries=[];
    const slots=expandParts(shown);
    const groups=remapGroups(staffGroups||parts.staffGroups||list[0]?.staffGroups||[],rows);
    const count=Math.max(...shown.map(part=>part.measures.length));
    const measureMap=[];
    const built=[];
    const pickup=!!shown[0]?.measures[0]?.pickup;
    const bodies=[];
    for(let mi=0;mi<count;mi++){
      bodies.push(slots.map(slot=>{
        const part=slot.part;
        if(!part.measures[mi])return `<staff n="${slot.n}"><layer n="1"/></staff>`;
        return staffMusic(part,mi,C.keyAt(part,mi),entries,slot.n,slot.staff);
      }).join(''));
      measureMap.push(mi);
    }
    for(let mi=0;mi<count;mi++){
      const head=shown[0];
      const time=C.timeAt(head,Math.min(mi,head.measures.length-1));
      const previous=mi?C.timeAt(head,Math.min(mi-1,head.measures.length-1)):time;
      const meter=mi&&(time.num!==previous.num||time.den!==previous.den)?` meter.count="${time.num}" meter.unit="${time.den}"`:'';
      const key=C.keyAt(head,mi),previousKey=mi?C.keyAt(head,mi-1):key;
      const keyAttr=mi&&key!==previousKey?` key.sig="${keySig(key)}"`:'';
      const bar=head.measures[mi]||{};
      const edges=`${bar.repeatStart?' left="rptstart"':''}${bar.repeatEnd?' right="rptend"':''}`;
      const dirs=slots.filter(slot=>slot.staff===1).map(slot=>slot.part.measures[mi]?directionXml(slot.part,mi,entries,slot.n):'').join('');
      const number=pickup?mi:mi+1;
      built.push({mi,volta:bar.volta||0,xml:`<measure n="${number}"${meter}${keyAttr}${edges}>${dirs}${bodies[mi]}</measure>`});
    }
    let section='';let open=0;
    for(const item of built){
      if(item.volta!==open){
        if(open)section+='</ending>';
        if(item.volta)section+=`<ending n="${item.volta}" label="${item.volta}.">`;
        open=item.volta;
      }
      section+=item.xml;
    }
    if(open)section+='</ending>';
    const title=esc(shown[0].title||'楽譜');
    const withGroups=shown.map((part,index)=>index?part:{...part,staffGroups:groups});
    const mei=`<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>${title}</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp>${staffGrpXml(withGroups)}</staffGrp></scoreDef>
    <section>${section}</section>
  </score></mdiv></body></music>
</mei>`;
    return {mei,entries,measureMap,slots,rows};
  }
  function meiForPart(part){return meiForParts([part],part.staffGroups||[]);}
  function decorateSvg(svg,entries,measureMap){
    const byId=new Map(entries.map(entry=>[entry.xmlId,entry]));
    const tagged=String(svg).replace(/<g\b([^>]*?)>/g,(tag,attrs)=>{
      const found=attrs.match(/\b(?:xml:)?id="([^"]+)"/)||attrs.match(/\b(?:xml:)?id='([^']+)'/);
      if(!found||attrs.includes('data-event-id'))return tag;
      const meta=byId.get(found[1]);
      if(!meta)return tag;
      return `<g${attrs} data-event-id="${esc(meta.id)}" data-event-type="${meta.type}" data-event-index="${meta.index}" data-measure="${meta.measure}" data-event-tick="${meta.tick}" data-staff="${meta.staff||1}" data-implicit="0">`;
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
  return {xmlId,eventIdFromXmlId,keySig,meiForPart,meiForParts,decorateSvg,pitchFromStaff,yForPitch,tickFromBox,tickFromEngraving,xForTick,expandParts,staffGrpXml};
});
