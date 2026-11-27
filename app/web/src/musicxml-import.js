/* Convert MusicXML into Kanade's editable, two-voice staff model. */
(function(root){
  'use strict';
  const C=root.KanadeCore,I=root.KanadeInstruments;
  const children=(node,name)=>Array.from(node?.children||[]).filter(child=>!name||child.localName===name);
  const one=(node,name)=>children(node,name)[0];
  const value=(node,name)=>one(node,name)?.textContent.trim()||'';
  const attr=(node,key)=>node?.getAttribute(key)||'';
  const number=(node,name,fallback=0)=>Number(value(node,name)||fallback);
  const denom={whole:1,half:2,quarter:4,eighth:8,'16th':16,'32nd':32,'64th':64};
  const markList=Object.values(C.Symbols.byKey).filter(entry=>!['custom','chordSymbol'].includes(entry.key));
  const filled=ticks=>C.exactDurations(ticks).map(({den,dots})=>C.makeRest(den,dots));

  function eventLen(ev){
    try{return C.eventTicks(ev);}catch(_){return 0;}
  }
  function cloneEvent(ev){
    if(ev.type==='note'){
      const pitch=ev.pitches?.[0]||ev.pitch;
      const pitches=ev.pitches?.map(p=>({...p}))||[{...pitch,id:ev.pitch?.id||C.uid()}];
      return {...C.makeNote(pitch,ev.den,ev.dots),pitches,tieStart:!!ev.tieStart,tieStop:!!ev.tieStop,lyric:ev.lyric,articulations:ev.articulations,tuplet:ev.tuplet?{...ev.tuplet}:undefined,stemDirection:ev.stemDirection};
    }
    return C.makeRest(ev.den,ev.dots);
  }
  function splitEvent(ev,len){
    const segs=C.exactDurations(len);
    if(ev.type==='note'){
      const pitch=ev.pitches?.[0]||ev.pitch||{step:'C',octave:4,alter:0};
      const pitches=ev.pitches?.map(p=>({...p,id:C.uid()}))||[{...pitch,id:C.uid()}];
      return segs.map(({den,dots},i)=>({...C.makeNote(pitch,den,dots),pitches,tieStop:i>0||!!ev.tieStop,tieStart:i<segs.length-1||!!ev.tieStart}));
    }
    return segs.map(({den,dots})=>C.makeRest(den,dots));
  }
  function shrinkEventsToFit(events,capacity,warn){
    let out=events.map(cloneEvent);
    let used=out.reduce((s,ev)=>s+eventLen(ev),0);
    while(used>capacity&&out.length){
      const last=out[out.length-1];
      const lastLen=eventLen(last);
      const over=used-capacity;
      if(last.type==='rest'){
        out.pop();used-=lastLen;continue;
      }
      if(lastLen>over&&lastLen-over>=C.TPQ/32){
        out.splice(out.length-1,1,...splitEvent(last,lastLen-over));
        warn('小節末の音価を調整しました');
        used=out.reduce((s,ev)=>s+eventLen(ev),0);
        break;
      }
      out.pop();
      used-=lastLen;
      warn('小節を超える音価を切り詰めました');
    }
  return out;
  }
  function repairEventList(events,capacity,warn){
    const valid=(events||[]).filter(ev=>eventLen(ev)>0);
    if(!valid.length){
      if(capacity>0)return C.fillRests(capacity).map(r=>C.makeRest(r.den,r.dots));
      return [];
    }
    let used=valid.reduce((s,ev)=>s+eventLen(ev),0);
    if(used>capacity){
      let shrunk=shrinkEventsToFit(valid,capacity,warn);
      for(let guard=0;guard<12&&shrunk.reduce((s,ev)=>s+eventLen(ev),0)>capacity;guard++)
        shrunk=shrinkEventsToFit(shrunk,capacity,warn);
      used=shrunk.reduce((s,ev)=>s+eventLen(ev),0);
      const out=[...shrunk];
      if(used<capacity)out.push(...C.fillRests(capacity-used).map(r=>C.makeRest(r.den,r.dots)));
      return out;
    }
    const out=[...valid.map(cloneEvent)];
    if(used<capacity)out.push(...C.fillRests(capacity-used).map(r=>C.makeRest(r.den,r.dots)));
    return out;
  }
  function voiceMelodyScore(entries){
    let melodic=0,rests=0,notes=0,chords=0;
    for(const e of entries){
      const len=Math.max(0,(e.end??0)-(e.at??0));
      if(e.rest)rests+=len;
      else{
        melodic+=len;
        notes++;
        if(e.chord?.length)chords++;
      }
    }
    return melodic+chords*2-notes*0.5-rests*0.25;
  }
  function pickVoiceIds(map,capacity,warn){
    const ids=[...map.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(ids.length<=2)return ids.length===1&&ids[0]==='2'?['1','2']:ids;
    const ranked=ids.map(id=>({id,score:voiceMelodyScore(map.get(id)||[])})).sort((a,b)=>b.score-a.score);
    warn('複数声部から主メロディ声部を選択しました');
    const pick=[ranked[0].id];
    const second=ranked[1];
    if(second&&second.score>Math.max(C.TPQ/4,capacity*0.12))pick.push(second.id);
    else if(ranked.length>2)warn('伴奏声部を省略しました');
    return pick;
  }

  function repairPartMeasures(part,warn){
    for(let mi=0;mi<part.measures.length;mi++){
      const cap=C.barTicks(part,mi);
      const bar=part.measures[mi];
      bar.events=repairEventList(bar.events||[],cap,warn);
      if(bar.voice2?.length)bar.voice2=repairEventList(bar.voice2,cap,warn);
      if(bar.staff2?.length)bar.staff2=repairEventList(bar.staff2,cap,warn);
    }
  }
  function attachPartGroups(list,partIds){
    const groups=[],stack=[];
    let partIndex=-1;
    for(const node of children(list)){
      if(node.localName==='score-part'){
        partIndex=partIds.indexOf(attr(node,'id'));
        for(const open of stack)if(open.start===null)open.start=partIndex;
        continue;
      }
      if(node.localName!=='part-group')continue;
      const type=attr(node,'type'),number=attr(node,'number')||'1';
      if(type==='start')stack.push({id:C.uid(),number,symbol:value(node,'group-symbol')==='brace'?'brace':'bracket',start:null});
      else if(type==='stop'){
        const open=stack.filter(item=>item.number===number&&item.end===undefined).at(-1);
        if(open&&open.start!==null&&partIndex>=open.start){
          open.end=partIndex;
          groups.push({id:open.id,symbol:open.symbol,start:open.start,end:open.end});
        }
        const index=stack.lastIndexOf(open);
        if(index>=0)stack.splice(index,1);
      }
    }
    return groups;
  }

  function xml(source){
    // DOMParser is never used to attach imported nodes to the application.
    if(/<!ENTITY\b|<!DOCTYPE[^>]*\[/i.test(source))throw Error('外部・独自のXML実体を含むファイルには対応していません');
    const doc=new DOMParser().parseFromString(source,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw Error('XMLの形式が正しくありません');
    return doc.documentElement;
  }
  function parse(source){
    const doc=xml(source);
    if(doc.localName!=='score-partwise')throw Error('パート単位の MusicXML（score-partwise）を選んでください');
    const partList=one(doc,'part-list');
    const names=new Map(children(partList,'score-part').map(node=>[attr(node,'id'),node]));
    const input=children(doc,'part');
    if(!input.length||input.length>32)throw Error('読み込める編成は1〜32譜表です');
    const warnings=new Set(),warn=message=>warnings.add(message);
    const title=(value(doc,'movement-title')||value(one(doc,'work'),'work-title')||'読み込んだ楽譜').slice(0,200);
    const composer=(children(one(doc,'identification'),'creator').find(node=>attr(node,'type')==='composer')?.textContent.trim()||'').slice(0,200);
    const tempoNodes=Array.from(input[0].getElementsByTagName('sound')).filter(node=>node.hasAttribute('tempo'));
    const firstTempo=tempoNodes[0],firstBar=children(input[0],'measure')[0];
    const metronomes=Array.from(input[0].getElementsByTagName('metronome'));
    const opening=children(firstBar);
    const initial=element=>{
      if(!element)return false;
      const direction=element.closest('direction')||element;
      return direction.parentElement===firstBar&&number(direction,'offset')===0&&
        !opening.slice(0,opening.indexOf(direction)).some(node=>['note','backup','forward'].includes(node.localName));
    };
    const metronome=metronomes[0],unit=denom[value(metronome,'beat-unit')],dots=children(metronome,'beat-unit-dot').length;
    const writtenTempo=unit&&dots<=2?number(metronome,'per-minute')*C.durationTicks(unit,dots)/C.TPQ:0;
    const atStart=initial(firstTempo);
    const bpm=atStart?Number(attr(firstTempo,'tempo')):initial(metronome)&&writtenTempo>0?writtenTempo:100;
    const tempo=Number.isFinite(bpm)?Math.min(300,Math.max(20,Math.round(bpm))):100;
    if(tempo!==bpm||tempoNodes.length>(atStart?1:0)||metronomes.length>(initial(metronome)?1:0))
      warn('途中のテンポ変更や未対応のテンポは固定テンポに置き換えました');
    const count=Math.max(...input.map(part=>children(part,'measure').length));
    if(!count||count>500)throw Error('読み込める小節数は1〜500です');
    const reference=[],repeats=Array.from({length:count},()=>({}));
    const parts=input.flatMap((node,pi)=>readPart(node,names.get(attr(node,'id')),pi,{title,composer,tempo},count,reference,repeats,warn));
    if(parts.length>32)throw Error('複数段を分けると32譜表を超えます');
    for(const part of parts){
      part.time=reference[0];
      part.measures.forEach((bar,mi)=>Object.assign(bar,{time:reference[mi]},repeats[mi]));
    }
    const staffGroups=attachPartGroups(partList,input.map(node=>attr(node,'id')));
    const [first,...ensembleParts]=parts;
    let score=ensembleParts.length?{...first,ensembleParts}:first;
    if(staffGroups.length)score={...score,staffGroups};
    for(const part of parts){
      repairPartMeasures(part,warn);
      const validation=C.validateScore(part,true);
      if(validation.length)warn(part.instrument+' · '+validation[0]);
    }
    const errors=C.validateScore(score);
    if(errors.length)warn(errors[0]);
    return {score,warnings:[...warnings]};
  }

  function readPart(part,info,pi,base,count,reference,repeats,warn){
    const bars=children(part,'measure'),nodes=Array.from(part.getElementsByTagName('note'));
    const staves=nodes.reduce((max,note)=>Math.max(max,number(note,'staff',1)),
      Array.from(part.getElementsByTagName('staves')).reduce((max,node)=>Math.max(max,Number(node.textContent)),1));
    if(!Number.isInteger(staves)||staves>8)throw Error('この楽器の譜表構成には対応していません');
    const name=(value(info,'part-name')||'パート '+(pi+1)).slice(0,110);
    const catalog=I.match(name)?.[1];
    const program=number(one(info,'midi-instrument'),'midi-program');
    const samples=root.KanadeSamples;
    const instruments=new Map(children(info,'score-instrument').map(node=>[attr(node,'id'),value(node,'instrument-name')]));
    const sound=catalog?.sound||Object.entries(samples.presets).find(([,preset])=>preset.program===program)?.[0]||name;
    let divisions=1,time={num:4,den:4},volta=0,key=0,shift=null;
    const keepGrand=staves===2;
    const defaultClefs=staves===2?['treble','bass']:staves>1?[catalog?.clef||'treble','bass']:[];
    const staffMeta=Array.from({length:staves},(_,i)=>({clef:defaultClefs[i]||catalog?.clef||'treble',staffLines:5}));
    const blankPart=()=>{
      const {staves:ignored,...seed}=C.createScore();
      return {...seed,...base,instrument:name,sound,clef:staffMeta[0].clef,
        ...(catalog?{instrumentKey:catalog.key}:{}),
        ...(catalog&&value(info,'part-abbreviation')?{shortName:value(info,'part-abbreviation').slice(0,120)}:{}),
        measures:Array.from({length:count},()=>({id:C.uid(),events:[]}))};
    };
    const tracks=keepGrand?[blankPart()]:Array.from({length:staves},(_,i)=>{
      const {staves:ignored,...seed}=C.createScore();
      return {...seed,...base,instrument:staves>1?name+' '+(i+1):name,sound,clef:staffMeta[i].clef,
        ...(catalog?{instrumentKey:catalog.key}:{}),
        ...(staves===1&&catalog&&value(info,'part-abbreviation')?{shortName:value(info,'part-abbreviation').slice(0,120)}:{}),
        measures:Array.from({length:count},()=>({id:C.uid(),events:[]}))};
    });
    const open=Array.from({length:staves},()=>new Map());
    const kits=root.KanadePercussion;
    if(staves>2)warn('3段以上の譜表は編集できる独立した譜表に分けました');
    if(bars.length!==count)warn('小節数の少ないパートは末尾に空小節を補いました');
    let pendingGrace=[];
    for(let mi=0;mi<count;mi++){
      const bar=bars[mi],voices=Array.from({length:staves},()=>new Map());
      let cursor=0;
      const tick=quarters=>Math.round(quarters*C.TPQ);
      try{
        for(const item of children(bar)){
          switch(item.localName){
            case 'attributes': {
              divisions=number(item,'divisions',divisions);
              if(!(divisions>0)){warn('音価単位 divisions が不正のため 480 に補正しました');divisions=480;}
              const meter=one(item,'time');
              if(meter){
                const beats=children(meter,'beats'),units=children(meter,'beat-type');
                if(!beats.length||new Set(units.map(node=>node.textContent.trim())).size>1)throw Error('同じ小節に異なる分母を持つ拍子には対応していません');
                time={num:beats.flatMap(node=>node.textContent.split('+')).reduce((sum,entry)=>sum+Number(entry),0),den:Number(units[0]?.textContent)};
                C.measureTicks(time);
                if(beats.length>1||beats[0].textContent.includes('+'))warn('加算拍子は合計した拍子で表示します');
              }
              const signature=one(item,'key');
              if(signature){
                const next=number(signature,'fifths');
                if(mi===0&&cursor===0)key=next;
                else if(next!==key){key=next;tracks[0].measures[mi].key=next;}
              }
              const transpose=one(item,'transpose');
              if(transpose){
                const semitones=number(transpose,'chromatic')+12*number(transpose,'octave-change');
                if(mi===0&&cursor===0){
                  shift=Object.keys(C.TRANSPOSITIONS).find(id=>C.soundingOffset({clef:'treble',transposition:id})===semitones);
                  if(!shift){warn('一部の移調設定に対応していないため実音扱いで読み込みました');shift='concert';}
                }else if(semitones!==C.soundingOffset({clef:'treble',transposition:shift}))warn('途中の移調設定変更は先頭の設定で再生します');
              }
              for(const clef of children(item,'clef')){
                const index=Number(attr(clef,'number')||1)-1,sign=value(clef,'sign'),line=number(clef,'line');
                const match=Object.keys(C.CLEFS).find(id=>C.CLEFS[id].sign===sign&&(id==='percussion'||C.CLEFS[id].line===line));
                if(index<0||index>=staves||!match){warn('未対応の音部記号は既定の音部記号に置き換えました');continue;}
                if(mi===0&&cursor===0){
                  staffMeta[index].clef=match;
                  if(!keepGrand)tracks[index].clef=match;
                  else if(index===0)tracks[0].clef=match;
                }else if(staffMeta[index].clef!==match){
                  staffMeta[index].clef=match;
                  const target=keepGrand?tracks[0].measures[mi]:tracks[index].measures[mi];
                  if(target)target[keepGrand&&index===1?'clef2':'clef']=match;
                }
              }
              for(const detail of children(item,'staff-details')){
                const index=Number(attr(detail,'number')||1)-1,lines=number(detail,'staff-lines');
                if(index>=0&&index<staves&&mi===0&&lines>=1&&lines<=5){
                  staffMeta[index].staffLines=lines;
                  if(!keepGrand)tracks[index].staffLines=lines;
                  else if(index===0)tracks[0].staffLines=lines;
                }
              }
              if(item.querySelector('multiple-rest'))warn('複数小節休符は個別の小節として表示します');
              break;
            }
            case 'backup':
            case 'forward':
              cursor+=(item.localName==='backup'?-1:1)*number(item,'duration')/divisions;
              if(!Number.isFinite(cursor))cursor=0;
              if(cursor<0){warn('backup/forward で負の位置になったため 0 に補正しました');cursor=0;}
              break;
            case 'note': {
              if(one(item,'grace')){
                const location=one(item,'pitch');
                const pitch=location?{step:value(location,'step'),octave:number(location,'octave',4),alter:number(location,'alter')}:null;
                if(pitch?.step){pendingGrace.push(pitch);}
                else warn('音高のない装飾音符を省略しました');
                break;
              }
              const staff=number(item,'staff',1)-1,id=value(item,'voice')||'1',chord=!!one(item,'chord');
              const length=number(item,'duration')/divisions;
              if(!(length>0)){warn('長さのない音符を省略しました');break;}
              const voice=voices[staff];
              if(!voice)throw Error('音符の譜表番号が不正です');
              if(!voice.has(id))voice.set(id,[]);
              const entries=voice.get(id),last=entries.at(-1),start=chord?last?.at:tick(cursor);
              if(!chord)cursor+=length;
              const end=chord?start+tick(length):tick(cursor);
              const rest=one(item,'rest'),unpitched=one(item,'unpitched'),location=one(item,'pitch')||unpitched;
              const kit=kits.preset(sound),pad=unpitched&&kit?.pads.find(([_,label])=>label===instruments.get(attr(one(item,'instrument'),'id')));
              const pitch=rest?null:{step:pad?.[0]||value(location,unpitched?'display-step':'step')||(unpitched?'C':''),
                octave:pad?4:number(location,unpitched?'display-octave':'octave',4),alter:number(location,'alter')};
              if(chord){
                if(!last?.pitch||!pitch||Math.abs(end-last.end)>1){warn('不整合な和音要素を省略しました');break;}
                last.chord.push(pitch);
                const tie=children(item,'tie').map(node=>attr(node,'type')).sort().join(',');
                if(tie!==last.ties.slice().sort().join(','))warn('和音の一部だけのタイは先頭音のタイに揃えました');
                break;
              }
              const modifications=one(item,'time-modification'),notations=one(item,'notations');
              const ties=[...new Set([...children(item,'tie'),...children(notations,'tied')].map(node=>attr(node,'type')))];
              const graces=pendingGrace.splice(0).slice(0,4).map(grace=>({...grace,id:C.uid()}));
              entries.push({at:start,end,pitch,chord:[],rest:!!rest,whole:attr(rest,'measure')==='yes',
                den:denom[value(item,'type')],dots:children(item,'dot').length,modifications,notations,ties,
                lyric:value(one(item,'lyric'),'text').slice(0,100),stem:value(item,'stem'),head:value(item,'notehead'),
                ...(graces.length?{graces}:{})});
              break;
            }
            case 'direction': {
              const staff=number(item,'staff',1)-1;
              if(staff<0||staff>=staves)throw Error('記号の譜表番号が不正です');
              const target=keepGrand?tracks[0]:tracks[staff];
              const at=tick(cursor+number(item,'offset')/divisions);
              for(const data of children(item,'direction-type').flatMap(node=>children(node))){
                const number=attr(data,'number')||'1';
                if(data.localName==='wedge'){
                  const type=attr(data,'type');
                  if(type==='stop')closeRange(target,open[staff],'wedge'+number,mi,at,warn);
                  else if(['crescendo','diminuendo'].includes(type))open[staff].set('wedge'+number,{mi,tick:at,key:type});
                  continue;
                }
                if(data.localName==='metronome')continue;
                const words=data.textContent.trim();
                const mark=markList.find(entry=>entry.xml===data.localName||data.localName==='dynamics'&&entry.style==='dynamic'&&entry.label===children(data)[0]?.localName||
                  ['words','rehearsal'].includes(data.localName)&&entry.label===words&&!C.isRangeDirection(entry.key));
                if(mark)direction(target,mi,{tick:at,key:mark.key},warn);
                else if(words)direction(target,mi,{tick:at,key:'custom',text:words.slice(0,100)},warn);
                else warn('一部の未対応の指示記号を省略しました');
              }
              break;
            }
            case 'barline': {
              const repeat=one(item,'repeat'),ending=one(item,'ending'),type=attr(ending,'type'),end=attr(item,'location')!=='left';
              if(attr(repeat,'direction')==='forward')repeats[mi].repeatStart=true;
              if(attr(repeat,'direction')==='backward')repeats[mi].repeatEnd=true;
              if(attr(repeat,'times')&&attr(repeat,'times')!=='2')warn('繰り返し回数は2回に揃えました');
              if(type==='start'){
                const n=Number(attr(ending,'number'));
                if(n===1||n===2)volta=n;else warn('3番括弧以降など、未対応の反復括弧を省略しました');
              }
              if(volta)repeats[mi].volta=volta;
              if(end&&['stop','discontinue'].includes(type))volta=0;
              break;
            }
            case 'harmony': {
              const keyNode=one(item,'root'),kind=one(item,'kind');
              const step=value(keyNode,'root-step'),acc=number(keyNode,'root-alter');
              const kinds={major:'',minor:'m',dominant:'7','major-seventh':'maj7','minor-seventh':'m7',diminished:'dim',augmented:'aug'};
              if(step){
                const text=(step+(acc===1?'♯':acc===-1?'♭':'')+(attr(kind,'text')||kinds[kind?.textContent]||'')).slice(0,100);
                const staff=number(item,'staff',1)-1;
                direction(keepGrand?tracks[0]:(tracks[staff]||tracks[0]),mi,{tick:tick(cursor+number(item,'offset')/divisions),key:'chordSymbol',text},warn);
              }
              if(one(item,'bass')||one(item,'degree')||!step||!attr(kind,'text')&&!Object.hasOwn(kinds,kind?.textContent))warn('一部のコード記号は簡略化しました');
              break;
            }
          }
        }
        if(pi===0)reference[mi]=time;
        else if(!C.sameTime(time,reference[mi])&&bar)warn('パートごとに異なる拍子は先頭パートに揃えました');
        if(volta)repeats[mi].volta=volta;
        const capacity=C.measureTicks(reference[mi]);
        if(attr(bar,'implicit')==='yes'){
          if(mi===0)tracks[0].measures[0].pickup=true;
          if(tick(cursor)<capacity)warn('弱起の足りない拍は休符で補います');
        }
        if(keepGrand){
          const target=tracks[0].measures[mi];
          for(const [staffIndex,map] of voices.entries()){
            const ids=pickVoiceIds(map,capacity,warn);
            const built=ids.map((id,voice)=>buildVoice(map.get(id)||[],capacity,{clef:staffMeta[staffIndex].clef},open[staffIndex],mi,voice,warn));
            if(staffIndex===0){
              target.events=built[0]||[];
              if(built[1]?.length)target.voice2=built[1];
            }else{
              if(built[0]?.length)target.staff2=built[0];
              if(built[1]?.length)target.staff2Voice=built[1];
              if(!built[0]?.length&&built[1]?.length){target.staff2=built[1];delete target.staff2Voice;warn('下段の第2声部だけだったため第1声部として読みました');}
            }
          }
          if(target.directions)target.directions=target.directions.filter(mark=>{
            if(mark.tick>=0&&mark.tick<capacity)return true;
            warn('小節外にある記号を省略しました');return false;
          });
        }else for(const [i,track] of tracks.entries()){
          const map=voices[i],target=track.measures[mi];
          const ids=pickVoiceIds(map,capacity,warn);
          for(const [voice,id] of ids.entries()){
            const events=buildVoice(map.get(id)||[],capacity,track,open[i],mi,voice,warn);
            if(voice===0)target.events=events;
            else if(events.length)target.voice2=events;
          }
          if(target.directions)target.directions=target.directions.filter(mark=>{
            if(mark.tick>=0&&mark.tick<capacity)return true;
            warn('小節外にある記号を省略しました');return false;
          });
        }
      }catch(error){
        warn(name+' · '+(mi+1)+'小節目 · '+error.message);
        const cap=C.measureTicks(reference[mi]||time);
        for(const track of tracks)track.measures[mi].events=repairEventList([],cap,warn);
      }
    }
    for(const [i,bucket] of open.entries())if(bucket.size)warn('終点が見つからないスラーや強弱記号を省略しました');
    if(keepGrand){
      const track=tracks[0];
      track.staves=staffMeta.map(entry=>({clef:entry.clef,...(entry.staffLines!==5?{staffLines:entry.staffLines}:{})}));
      track.clef=staffMeta[0].clef;
      track.key=track.clef==='percussion'?0:key;
      track.transposition=shift||'concert';
      repairPartMeasures(track,warn);
      return [track];
    }
    for(const [i,track] of tracks.entries()){
      track.key=track.clef==='percussion'?0:key;
      track.transposition=shift||'concert';
      repairPartMeasures(track,warn);
    }
    return tracks;
  }

  function direction(part,mi,mark,warn){
    const bar=part.measures[mi],list=bar.directions||=[];
    if(list.some(old=>old.key===mark.key&&old.tick===mark.tick&&old.text===mark.text))return;
    if(list.length===120){warn('小節内の一部の指示記号を省略しました');return;}
    list.push(mark);
  }
  function closeRange(part,open,id,mi,tick,warn){
    const mark=open.get(id);
    if(!mark)return;
    open.delete(id);
    if(mi<mark.mi||mi===mark.mi&&tick<=mark.tick){warn('範囲が無効な記号を省略しました');return;}
    direction(part,mark.mi,{tick:mark.tick,key:mark.key,end:tick,...(mi!==mark.mi?{endMeasure:part.measures[mi].id}:{})},warn);
  }

  function buildVoice(entries,capacity,part,open,mi,voice,warn){
    const events=[];
    let position=0,group=null;
    if(entries.length===1&&entries[0].rest&&entries[0].at===0&&(entries[0].whole||entries[0].end===capacity))return events;
    for(const note of entries){
      let at=note.at,end=note.end;
      if(!Number.isFinite(at)||at<0)at=position;
      if(at<position-1){warn('音符の重なりを解消しました');at=position;}
      if(end>capacity){
        const span=end-at;
        if(span>C.TPQ/32&&note.den){
          const typeLen=C.durationTicks(note.den,Math.min(note.dots,2));
          if(typeLen>0&&typeLen<span){
            const ratio=Math.round(span/typeLen);
            if(ratio>=2&&ratio<=4)end=at+typeLen*Math.min(ratio,Math.ceil((capacity-at)/typeLen));
          }
        }
        if(end>capacity){warn('拍子を超える音符を短縮しました');end=capacity;}
      }
      if(end<=at){warn('無効な音価を省略しました');continue;}
      note.at=at;
      note.end=end;
      if(note.at>position)events.push(...filled(note.at-position));
      const length=note.end-note.at,mod=note.modifications;
      let {den,dots}=note;
      const ties=note.ties,unique=new Map();
      if(note.pitch)for(const p of [note.pitch,...note.chord])unique.set(C.pitchMidi(p),p);
      const pitches=C.normalizeChord([...unique.values()]);
      if(pitches.length>12){warn('13音以上の和音は先頭12音のみ使います');pitches.splice(12);}
      const make=(den,dots)=>pitches.length?
        {...C.makeNote(pitches[0],den,dots),pitches:pitches.map(p=>({...p,id:C.uid()}))}:C.makeRest(den,dots);
      let built;
      if(mod){
        const actual=number(mod,'actual-notes'),normal=number(mod,'normal-notes');
        if(!den||dots>2||!C.validTupletRatio(actual,normal)){warn('未対応の連符を通常音価に置き換えました');group=null;built=C.exactDurations(length).map(({den,dots})=>make(den,dots));events.push(...built);position=note.at+built.reduce((s,e)=>s+C.eventTicks(e),0);continue;}
        const unit=denom[value(mod,'normal-type')]||group?.unit||den;
        if(!group)group={actual,normal,unit,index:0};
        if(group.actual!==actual||group.normal!==normal||group.unit!==unit){warn('連符の整合をリセットしました');group={actual,normal,unit,index:0};}
        const event={...make(den,dots),tuplet:{...group}};
        if(Math.abs(C.eventTicks(event)-length)>1)warn('連符の長さを近似しました');
        group.index=C.tupletEnd(event);
        if(group.index===actual)group=null;
        built=[event];
      }else{
        if(group){warn('途切れた連符を通常音価にしました');group=null;}
        const matching=den&&dots<=2&&C.durationTicks(den,dots)===length;
        const values=matching?[{den,dots}]:C.exactDurations(length);
        if(!matching&&den&&!note.whole)warn('一部の音価を、同じ長さの音符・タイに置き換えました');
        built=values.map(({den,dots})=>make(den,dots));
      }
      if(!built.length){warn('この音価を表せないため休符を入れました');built=[C.makeRest(16,0)];}
      if(pitches.length){
        built.forEach((event,i)=>{
          if(i>0||ties.includes('stop')||ties.includes('continue'))event.tieStop=true;
          if(i<built.length-1||ties.includes('start')||ties.includes('continue'))event.tieStart=true;
          if(['up','down'].includes(note.stem))event.stemDirection=note.stem;
        });
        if(note.lyric)built[0].lyric=note.lyric;
        if(note.graces?.length)built[0].graces=note.graces.slice(0,4).map(grace=>C.normalPitch(grace));
        if(note.head==='x'&&part.clef==='percussion')part.notehead='cross';
        const articulations=[];
        for(const item of children(note.notations)){
          if(item.localName==='slur'){
            if(voice!==0){warn('第2声部のスラーを省略しました');continue;}
            const type=attr(item,'type'),id='slur'+(attr(item,'number')||'1');
            if(type==='start')open.set(id,{mi,tick:note.at,key:'slur'});
            if(type==='stop')closeRange(part,open,id,mi,note.at,warn);
            continue;
          }
          if(['tied','tuplet'].includes(item.localName))continue;
          const elements=['articulations','ornaments','technical'].includes(item.localName)?children(item):[item];
          for(const element of elements){
            const match=Object.entries(C.Symbols.notes).find(([,symbol])=>symbol.kind==='fermata'?element.localName==='fermata'&&symbol.xml===(element.textContent.trim()||'normal'):
              symbol.xml===element.localName||symbol.xml===element.localName+':'+element.textContent.trim());
            if(match)articulations.push(match[0]);else warn('一部の未対応の奏法記号を省略しました');
          }
        }
        if(articulations.length)built[0].articulations=[...new Set(articulations)];
      }
      events.push(...built);
      position=note.at+built.reduce((sum,event)=>sum+C.eventTicks(event),0);
    }
    if(group)warn('小節末で途切れた連符を打ち切りました');
    if(position<capacity)events.push(...filled(capacity-position));
    return events;
  }
  root.KanadeMusicXMLImport={parse,xml};
})(globalThis);
