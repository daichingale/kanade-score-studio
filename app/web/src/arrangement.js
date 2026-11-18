(function(root,factory){
  const api=factory(root.KanadeCore||(typeof require==='function'?require('./core.js'):null),
    root.KanadeEditing||(typeof require==='function'?require('./editing.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeArrangement=api;
})(globalThis,function(C,B){
  'use strict';
  function parts(document){
    if(!document.bassPart)return C.scoreParts(document);
    const bass=document.bassPart;
    return [...C.scoreParts(document),{...bass,title:document.title,composer:document.composer,time:document.time,
      tempo:document.tempo,key:document.key,measures:document.measures.map((_,index)=>({
        ...(bass.measures[index]||{id:bass.id+':'+index,events:[]}),time:C.timeAt(document,index)
      }))}];
  }
  function assemble(document,tracks){
    const [first,...additional]=tracks,next={...first};
    if(document.ensembleParts)next.ensembleParts=additional;
    if(document.bassPart)next.bassPart=additional[0];
    if(document.publication)next.publication=document.publication;
    if(document.clipBank)next.clipBank=document.clipBank;
    if(document.sceneLinks)next.sceneLinks=document.sceneLinks;
    const errors=C.validateScore(next);if(errors.length)throw Error(errors[0]);
    return next;
  }
  function boundary(events,before,after){
    if(!events?.length)return events;
    const joinsBefore=!before&&events[0].tieStop,joinsAfter=!after&&events.at(-1).tieStart;
    if(!joinsBefore&&!joinsAfter)return events;
    return events.map((event,index)=>{
      const removeStop=!before&&index===0&&event.tieStop;
      const removeStart=!after&&index===events.length-1&&event.tieStart;
      if(!removeStart&&!removeStop)return event;
      const fresh={...event};
      if(removeStop)delete fresh.tieStop;
      if(removeStart)delete fresh.tieStart;
      return fresh;
    });
  }
  function repeatSections(part){
    const sections=[];let begin=null;
    for(const [index,bar] of part.measures.entries()){
      if(bar.repeatStart)begin=index;
      if(!bar.repeatEnd||begin===null)continue;
      let firstEnding=null,finish=index;
      if(bar.volta===1&&part.measures[index+1]?.volta===2){
        firstEnding=index;
        while(firstEnding>begin&&part.measures[firstEnding-1].volta===1)firstEnding--;
        while(part.measures[finish+1]?.volta===2)finish++;
      }
      sections.push({first:begin,last:index,firstEnding,finish});begin=null;
    }
    return sections;
  }
  function rearrangePart(part,layout,explicit=false){
    const positions=new Map(layout.map((item,i)=>[item.bar.id,i]));
    return {...part,measures:layout.map(({bar,source,index,meter,repeat},i)=>{
      const adjacent=(other,delta)=>other?.source===source&&other.index===index+delta;
      const before=adjacent(layout[i-1],-1),after=adjacent(layout[i+1],1);
      const directions=bar.directions?.filter(mark=>mark.endMeasure===undefined||
        (positions.get(mark.endMeasure)??-1)>i);
      const events=boundary(bar.events,before,after),voice2=boundary(bar.voice2,before,after);
      const time=bar.time||(explicit||!C.sameTime(meter,part.time)?meter:undefined);
      const marked=bar.repeatStart||bar.repeatEnd||bar.volta;
      const keepRepeat=!marked||repeat&&repeat.every((id,index)=>positions.get(id)===positions.get(repeat[0])+index);
      if(keepRepeat&&events===bar.events&&voice2===bar.voice2&&time===bar.time&&directions?.length===bar.directions?.length)return bar;
      const next={...bar,events};
      if(!keepRepeat){delete next.repeatStart;delete next.repeatEnd;delete next.volta;}
      if(time)next.time=time;
      if(voice2)next.voice2=voice2;
      if(directions?.length)next.directions=directions;
      else delete next.directions;
      return next;
    })};
  }
  function layoutOf(part,source=0){
    const repetitions=new Map();
    for(const {first,finish} of repeatSections(part)){
      const ids=part.measures.slice(first,finish+1).map(bar=>bar.id);
      for(const id of ids)repetitions.set(id,ids);
    }
    return part.measures.map((bar,index)=>({bar,meter:C.timeAt(part,index),index,source,repeat:repetitions.get(bar.id)}));
  }
  function sliceParts(tracks,first,last){
    return tracks.map(track=>{
      const {meterTail,publication,clipBank,ensembleParts,bassPart,...part}=track;
      return rearrangePart(part,layoutOf(track).slice(first,last+1),true);
    });
  }
  function capture(document,order,name,{transient=false}={}){
    if(!order.length||order.some(index=>!Number.isInteger(index)||index<0||index>=document.measures.length)||
      new Set(order).size!==order.length)throw Error('切り出す小節を選んでください');
    if(!transient&&order.length>C.CLIP_MEASURES)throw Error('1ブロックは'+C.CLIP_MEASURES+'小節までです');
    const title=name.trim();
    if(!title||title.length>50)throw Error('ブロック名を50文字以内で入力してください');
    const tracks=parts(document).map(track=>{
      const layout=layoutOf(track);
      return rearrangePart(track,order.map(index=>layout[index]),true);
    });
    return {id:C.uid(),name:title,parts:tracks};
  }
  function markRepeat(document,first,last,{alternate=false,secondCount=1,from=Math.max(0,first-1)}={}){
    const start=alternate?from:first;
    const stop=alternate?last+secondCount:last;
    if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||first>last||last>=document.measures.length)
      throw Error('連続する小節を選んでください');
    if(alternate&&(!Number.isInteger(start)||start<0||start>=first))
      throw Error('繰り返し開始は1番かっこより前の小節を指定してください');
    if(alternate&&(!Number.isInteger(secondCount)||secondCount<1||stop>=document.measures.length))
      throw Error('2番かっこに使う後続の小節数を確認してください');
    const tracks=parts(document).map(part=>{
      if(repeatSections(part).some(section=>section.first<=stop&&section.finish>=start))
        throw Error('既存のリピートを先に解除してください');
      return {...part,measures:part.measures.map((bar,index)=>{
        if(index<start||index>stop)return bar;
        return {...bar,...(index===start?{repeatStart:true}:{}),...(index===last?{repeatEnd:true}:{}),
          ...(alternate&&index>=first?{volta:index<=last?1:2}:{})};
      })};
    });
    return assemble(document,tracks);
  }
  function repeatMarks(bar){
    return {...(bar.repeatStart?{repeatStart:true}:{}),...(bar.repeatEnd?{repeatEnd:true}:{}),...(bar.volta?{volta:bar.volta}:{})};
  }
  function repairRepeats(document){
    return assemble(document,parts(document).map(part=>rearrangePart(part,layoutOf(part))));
  }
  function clearRepeat(document,first,last){
    return assemble(document,parts(document).map(part=>{
      const affected=new Set();
      for(const run of repeatSections(part))if(run.first<=last&&run.finish>=first)
        for(let index=run.first;index<=run.finish;index++)affected.add(index);
      return {...part,measures:part.measures.map((bar,index)=>{
        if(!affected.has(index))return bar;
        const {repeatStart,repeatEnd,volta,...rest}=bar;return rest;
      })};
    }));
  }
  function move(document,first,last,gap){
    const length=document.measures.length;
    if(!Number.isInteger(gap)||gap<0||gap>length||!Number.isInteger(first)||!Number.isInteger(last)||first<0||last>=length||last<first)throw Error('移動先を確認してください');
    if(gap>=first&&gap<=last+1)return {document,index:first};
    const count=last-first+1,index=gap>last?gap-count:gap;
    const tracks=parts(document).map(part=>{
      const layout=layoutOf(part),block=layout.splice(first,count);
      layout.splice(index,0,...block);
      return rearrangePart(part,layout);
    });
    return {document:assemble(document,tracks),index};
  }
  function alignedSources(tracks,clip,requireAll=true){
    const remaining=new Set(clip.parts);
    const result=tracks.map(part=>{
      const ids=new Set(part.measures.map(bar=>bar.id));
      const source=[...remaining].find(track=>track.measures.some(bar=>ids.has(bar.id)));
      if(source)remaining.delete(source);
      return source;
    });
    tracks.forEach((part,index)=>{
      if(result[index])return;
      const source=[...remaining].find(track=>track.id===part.id&&track.instrument===part.instrument);
      if(source){remaining.delete(source);result[index]=source;}
    });
    if(requireAll&&remaining.size)throw Error('ブロックを作ったときのパートが見つかりません');
    return result;
  }
  function cloneBlock(measures){
    const copies=measures.map(C.cloneMeasure);
    const ids=new Map(measures.map((bar,i)=>[bar.id,copies[i].id]));
    for(const bar of copies)if(bar.directions)bar.directions=bar.directions.map(mark=>
      mark.endMeasure?{...mark,endMeasure:ids.get(mark.endMeasure)}:mark);
    return copies;
  }
  function playbackRanges(part){
    const ranges=[];let start=0;
    function append(first,last){if(last>=first)ranges.push([first,last]);}
    for(const section of repeatSections(part)){
      append(start,section.last);
      append(section.first,(section.firstEnding??section.last+1)-1);
      start=section.last+1;
    }
    append(start,part.measures.length-1);
    return ranges;
  }
  function playbackOrder(part){
    return playbackRanges(part).flatMap(([first,last])=>Array.from({length:last-first+1},(_,i)=>first+i));
  }
  function playback(tracks,reference=tracks[0]){
    if(!repeatSections(reference).length)return tracks;
    const ranges=playbackRanges(reference);
    return tracks.map(track=>({...track,measures:ranges.flatMap(([first,last])=>
      cloneBlock(sliceParts([track],first,last)[0].measures))}));
  }
  function sceneParts(document,clip){
    const roster=parts(document),sources=alignedSources(roster,clip,false);
    return sources.map((source,index)=>source?{...source,id:roster[index].id,instrument:roster[index].instrument}:null);
  }
  const hasNotes=part=>!!part?.measures.some(bar=>[...bar.events,...(bar.voice2||[])].some(event=>event.type==='note'));
  function sessionTracks(document,clip){
    return sceneParts(document,clip).map(source=>hasNotes(source)?source:null);
  }
  function blankClip(track,time){
    const {meterTail,publication,clipBank,ensembleParts,bassPart,...part}=track;
    return {...part,time,measures:[{id:C.uid(),time,events:[]}]};
  }
  function sceneSlot(document,clip,index,next){
    const roster=parts(document),existing=alignedSources(roster,clip,false)[index];
    let clips=clip.parts.filter(part=>part!==existing);
    if(next){
      if(next.measures.length>C.CLIP_MEASURES)throw Error('1クリップは'+C.CLIP_MEASURES+'小節までです');
      const {meterTail,publication,clipBank,ensembleParts,bassPart,...plain}=next;
      const track=roster[index];
      clips=[...clips,{...plain,id:track.id,instrument:track.instrument,measures:next.measures.map((bar,i)=>({...bar,time:C.timeAt(next,i)}))}];
    }
    return {...clip,parts:clips};
  }
  function copyScenePart(source,destination){
    const from={transposition:source.transposition||'concert',unpitched:source.clef==='percussion'};
    const {meterTail,publication,clipBank,ensembleParts,bassPart,...track}=destination;
    const convert=event=>B.convertClipboardEvent(event,from,destination);
    const bars=cloneBlock(source.measures).map((bar,mi)=>({...bar,time:C.timeAt(source,mi),events:bar.events.map(convert),
      ...(bar.voice2?{voice2:bar.voice2.map(convert)}:{})}));
    return {...track,time:source.time,measures:bars};
  }
  function sceneForTimeline(document,clip){
    const stored=sceneParts(document,clip).filter(Boolean);
    if(!stored.length)throw Error('配置するクリップがありません');
    const reference=stored[0];
    if(stored.every(part=>part.measures.length===reference.measures.length&&part.measures.every((_,i)=>C.sameTime(C.timeAt(part,i),C.timeAt(reference,i)))))return {...clip,parts:stored.map(part=>({...part,measures:part.measures.map((bar,i)=>({...bar,time:C.timeAt(part,i)}))}))};
    return sessionMix(document,stored.map(part=>({part,loop:false})));
  }
  function sessionMix(document,active){
    if(!active.length)throw Error('先にクリップを再生してください');
    const reference=active.reduce((longest,slot)=>slot.part.measures.length>longest.measures.length?slot.part:longest,active[0].part);
    const meters=reference.measures.map((_,index)=>C.timeAt(reference,index));
    const roster=parts(document),byId=new Map(active.map(slot=>[slot.part.id,slot]));
    const clips=roster.map(track=>{
      const slot=byId.get(track.id);
      let measures=[];
      if(slot){
        const {part,loop}=slot,length=part.measures.length;
        const copies=loop?Math.ceil(meters.length/length):1;
        for(let i=0;i<copies;i++){
          const block=sliceParts([part],0,Math.min(length,meters.length-i*length)-1)[0];
          measures.push(...cloneBlock(block.measures));
        }
      }
      if(measures.some((bar,i)=>!C.sameTime(bar.time,meters[i])))
        throw Error('拍子の区切りが異なるクリップは一緒に配置できません。シーンごとに配置してください');
      const normalized=meters.map((time,i)=>{
        const {repeatStart,repeatEnd,volta,...bar}=measures[i]||{id:C.uid(),events:[]};
        return {...bar,time};
      });
      const {meterTail,publication,clipBank,ensembleParts,bassPart,...base}=slot?.part||track;
      // Insertion matches the active roster by ID and name, even after every source bar has been cloned.
      return {...base,id:track.id,instrument:track.instrument,measures:normalized};
    });
    return {id:C.uid(),name:'再生中の組み合わせ',parts:clips};
  }
  function insert(document,clip,gap,copies=1){
    const meters=clip.parts[0].measures.map(bar=>bar.time),count=meters.length;
    if(!Number.isInteger(copies)||copies<1||copies>8||!Number.isInteger(gap)||gap<0||gap>document.measures.length||
      document.measures.length+count*copies>500)throw Error('挿入先または小節数を確認してください');
    const tracks=parts(document),sources=alignedSources(tracks,clip);
    return assemble(document,tracks.map((track,index)=>{
      const source=sources[index],layout=layoutOf(track),added=[];
      for(let copy=0;copy<copies;copy++){
        const measures=source?cloneBlock(source.measures):meters.map((time,mi)=>({id:C.uid(),events:[],time,...repeatMarks(clip.parts[0].measures[mi])}));
        added.push(...layoutOf({...track,measures},copy+1));
      }
      layout.splice(gap,0,...added);
      return rearrangePart(track,layout);
    }));
  }
  function targetMeter(document,gap,index){
    // Use the meters at the destination, then continue the score's meter pattern.
    return C.timeAt(document,gap+index);
  }
  function differentMeters(document,clip,gap,copies){
    const bars=clip.parts[0].measures;
    return Array.from({length:bars.length*copies},(_,i)=>i)
      .some(i=>!C.sameTime(bars[i%bars.length].time,targetMeter(document,gap,i)));
  }
  function fitMeters(document,clip,gap,copies){
    const source=clip.parts[0],length=C.measureOffsets(source).at(-1);
    const meters=[],offsets=[0];
    while(offsets.at(-1)<length*copies){
      if(document.measures.length+meters.length>=500)throw Error('小節数の上限です');
      const time=targetMeter(document,gap,meters.length);
      meters.push(time);offsets.push(offsets.at(-1)+C.measureTicks(time));
    }
    const fitted=clip.parts.map(part=>{
      const grid=C.measureOffsets(part);
      const empty={...part,time:meters[0],measures:meters.map(time=>({id:C.uid(),time,events:[]}))};
      const pitches=(voice)=>{
        const staff=C.voiceScore(part,voice);
        if(!staff.measures.some(bar=>bar.events.length))return empty.measures;
        const fragment=B.copyRange(staff,0,length);
        try{
          return Array.from({length:copies},(_,i)=>i).reduce((next,i)=>
            B.pasteRange(next,fragment,i*length,{splitNotes:true,protectNotes:true}).score,empty).measures;
        }catch(error){throw Error(error.message+'。「元の拍子を使う」で貼り付けられます');}
      };
      const upper=pitches(1),lower=pitches(2);
      const measures=upper.map((bar,i)=>({...bar,...(lower[i].events.length?{voice2:lower[i].events}:{})}));
      for(let copy=0;copy<copies;copy++)for(const [i,bar] of part.measures.entries()){
        const offset=copy*length+grid[i];
        const begin=C.locateTick(offsets,offset),stop=copy*length+grid[i+1];
        if(bar.repeatStart||bar.repeatEnd||bar.volta){
          if(begin.tick||stop!==offsets[begin.mi+1])throw Error('反復記号が小節線と合わなくなります。「元の拍子を使う」を選んでください');
          Object.assign(measures[begin.mi],repeatMarks(bar));
        }
        for(const mark of bar.directions||[]){
          const at=C.locateTick(offsets,offset+mark.tick),next={...mark,tick:at.tick};
          if(C.isRangeDirection(mark.key)){
            const end=C.directionEnd(part,i,mark);
            if(!end)continue;
            const absolute=copy*length+grid[end.mi]+end.tick;
            const target=absolute===offsets.at(-1)?{mi:measures.length-1,tick:C.measureTicks(meters.at(-1))}:C.locateTick(offsets,absolute);
            next.end=target.tick;delete next.endMeasure;
            if(target.mi!==at.mi)next.endMeasure=measures[target.mi].id;
          }
          const list=measures[at.mi].directions||=[];
          if(!list.some(item=>item.key===next.key&&item.tick===next.tick&&item.text===next.text))list.push(next);
        }
      }
      return {...empty,measures};
    });
    return {...clip,parts:fitted};
  }
  function linkedClip(document,scene,partId){
    if(!partId)return sceneForTimeline(document,scene);
    const track=sceneParts(document,scene).find(part=>part?.id===partId);
    if(!track)throw Error('リンク元のクリップが見つかりません');
    return {...scene,parts:[{...track,measures:track.measures.map((bar,i)=>({...bar,time:C.timeAt(track,i)}))}]};
  }
  function linkScene(document,scene,gap,copies,partId){
    const clip=linkedClip(document,scene,partId),length=clip.parts[0].measures.length;
    const next=insert(document,clip,gap,copies);
    const links=Array.from({length:copies},(_,i)=>({id:C.uid(),sceneId:scene.id,partId,
      bars:next.measures.slice(gap+i*length,gap+(i+1)*length).map(bar=>bar.id)}));
    return {...next,sceneLinks:[...(next.sceneLinks||[]),...links]};
  }
  function linkPosition(document,link){
    const index=document.measures.findIndex(bar=>bar.id===link.bars[0]);
    return index>=0&&link.bars.every((id,i)=>document.measures[index+i]?.id===id)?index:-1;
  }
  function unlink(document,id){
    return {...document,sceneLinks:(document.sceneLinks||[]).filter(link=>link.id!==id)};
  }
  function reconcileLinks(before,next){
    if(!next.sceneLinks?.length)return next;
    const oldLinks=new Map((before.sceneLinks||[]).map(link=>[link.id,link]));
    const roster=parts(next),oldRoster=parts(before);
    const scenes=new Map((next.clipBank||[]).map(scene=>[scene.id,scene]));
    const links=next.sceneLinks.filter(link=>{
      const start=linkPosition(next,link);
      if(start<0||!scenes.has(link.sceneId)||link.partId&&!roster.some(part=>part.id===link.partId))return false;
      const old=oldLinks.get(link.id);
      if(!old)return true;
      const first=linkPosition(before,old);
      return first>=0&&roster.every(part=>{
        const previous=oldRoster.find(item=>item.id===part.id);
        return !previous||link.bars.every((_,i)=>JSON.stringify(previous.measures[first+i])===JSON.stringify(part.measures[start+i]));
      });
    });
    return links.length===next.sceneLinks.length?next:{...next,sceneLinks:links};
  }
  function updateScenes(document,clips){
    const before=new Map((document.clipBank||[]).map(clip=>[clip.id,clip]));
    const changed=new Map(clips.filter(clip=>before.get(clip.id)?.parts!==clip.parts).map(clip=>[clip.id,clip]));
    let next={...document,clipBank:clips};
    const placements=(document.sceneLinks||[]).slice().reverse();
    for(const link of placements){
      const scene=changed.get(link.sceneId),at=linkPosition(next,link);
      if(!scene||at<0)continue;
      if(link.partId){
        const track=sceneParts(next,scene).find(part=>part?.id===link.partId);
        if(!track){next=unlink(next,link.id);continue;}
        const previous=sceneParts(document,before.get(scene.id)).find(part=>part?.id===link.partId);
        if(previous?.measures===track.measures)continue;
      }
      if(!scene.parts.length){next=unlink(next,link.id);continue;}
      const clip=linkedClip(next,scene,link.partId),length=clip.parts[0].measures.length;
      if(next.measures.length-link.bars.length+length>500)throw Error('リンク先の更新で小節数の上限を超えます');
      const tracks=parts(next),sources=alignedSources(tracks,clip);
      const meters=clip.parts[0].measures.map(bar=>bar.time);
      const replacements=tracks.map((track,i)=>{
        const layout=layoutOf(track),source=sources[i];
        const fresh=source?cloneBlock(source.measures):meters.map((time,j)=>({id:C.uid(),time,events:[],...repeatMarks(clip.parts[0].measures[j])}));
        const ids=new Map(fresh.map((bar,j)=>[bar.id,layout[at+j]&&j<link.bars.length?layout[at+j].bar.id:bar.id]));
        const bars=fresh.map(bar=>({...bar,id:ids.get(bar.id),...(bar.directions?{directions:bar.directions.map(mark=>
          mark.endMeasure?{...mark,endMeasure:ids.get(mark.endMeasure)}:mark)}:{})}));
        layout.splice(at,link.bars.length,...layoutOf({...track,measures:bars},1));
        return rearrangePart(track,layout);
      });
      next=assemble(next,replacements);
      next.sceneLinks=next.sceneLinks.map(item=>item===link?{...link,id:C.uid(),bars:next.measures.slice(at,at+length).map(bar=>bar.id)}:item);
    }
    return next;
  }
  return {parts,sliceParts,capture,move,insert,markRepeat,clearRepeat,repeatMarks,repairRepeats,repeatSections,playbackOrder,playback,sessionTracks,sessionMix,sceneParts,sceneForTimeline,hasNotes,blankClip,sceneSlot,copyScenePart,differentMeters,fitMeters,linkScene,linkPosition,unlink,reconcileLinks,updateScenes};
});
