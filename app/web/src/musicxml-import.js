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
    const names=new Map(children(one(doc,'part-list'),'score-part').map(node=>[attr(node,'id'),node]));
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
    const [first,...ensembleParts]=parts;
    const score=ensembleParts.length?{...first,ensembleParts}:first;
    for(const part of parts){
      const validation=C.validateScore(part,true);
      if(validation.length)throw Error(part.instrument+' · '+validation[0]);
    }
    const errors=C.validateScore(score);
    if(errors.length)throw Error(errors[0]);
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
    const defaultClefs=staves===2&&(!catalog||catalog.key==='piano')?['treble','bass']:[];
    const tracks=Array.from({length:staves},(_,i)=>({
      ...C.createScore(),...base,instrument:staves>1?name+' '+(i+1):name,sound,clef:defaultClefs[i]||catalog?.clef||'treble',
      ...(catalog?{instrumentKey:catalog.key}:{}),
      ...(staves===1&&catalog&&value(info,'part-abbreviation')?{shortName:value(info,'part-abbreviation').slice(0,120)}:{}),
      measures:Array.from({length:count},()=>({id:C.uid(),events:[]}))
    }));
    const open=tracks.map(()=>new Map());
    const kits=root.KanadePercussion;
    if(staves>1)warn('大譜表は編集できる独立した譜表に分けました');
    if(bars.length!==count)warn('小節数の少ないパートは末尾に空小節を補いました');
    for(let mi=0;mi<count;mi++){
      const bar=bars[mi],voices=tracks.map(()=>new Map());
      let cursor=0;
      const tick=quarters=>Math.round(quarters*C.TPQ);
      try{
        for(const item of children(bar)){
          switch(item.localName){
            case 'attributes': {
              divisions=number(item,'divisions',divisions);
              if(!(divisions>0))throw Error('音価の単位が不正です');
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
                else if(next!==key)warn('途中の調号変更は先頭の調号で表示します。各音の音高は保持しました');
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
                const index=Number(attr(clef,'number')||1)-1,track=tracks[index],sign=value(clef,'sign'),line=number(clef,'line');
                const match=Object.keys(C.CLEFS).find(id=>C.CLEFS[id].sign===sign&&(id==='percussion'||C.CLEFS[id].line===line));
                if(!track||!match){warn('未対応の音部記号は既定の音部記号に置き換えました');continue;}
                if(mi===0&&cursor===0)track.clef=match;
                else if(track.clef!==match)warn('途中の音部記号変更は先頭の音部記号で表示します');
              }
              for(const detail of children(item,'staff-details')){
                const track=tracks[Number(attr(detail,'number')||1)-1],lines=number(detail,'staff-lines');
                if(track&&mi===0&&lines>=1&&lines<=5)track.staffLines=lines;
              }
              if(item.querySelector('multiple-rest'))warn('複数小節休符は個別の小節として表示します');
              break;
            }
            case 'backup':
            case 'forward':
              cursor+=(item.localName==='backup'?-1:1)*number(item,'duration')/divisions;
              if(!Number.isFinite(cursor)||cursor<-.000001)throw Error('音符の位置が不正です');
              break;
            case 'note': {
              if(one(item,'grace')){warn('装飾音符を省略しました');break;}
              const staff=number(item,'staff',1)-1,id=value(item,'voice')||'1',chord=!!one(item,'chord');
              const length=number(item,'duration')/divisions;
              if(!(length>0))throw Error('長さのない音符があります');
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
                if(!last?.pitch||!pitch||Math.abs(end-last.end)>1)throw Error('異なる音価が混在する和音には対応していません');
                last.chord.push(pitch);
                const tie=children(item,'tie').map(node=>attr(node,'type')).sort().join(',');
                if(tie!==last.ties.slice().sort().join(','))warn('和音の一部だけのタイは先頭音のタイに揃えました');
                break;
              }
              const modifications=one(item,'time-modification'),notations=one(item,'notations');
              const ties=[...new Set([...children(item,'tie'),...children(notations,'tied')].map(node=>attr(node,'type')))];
              entries.push({at:start,end,pitch,chord:[],rest:!!rest,whole:attr(rest,'measure')==='yes',
                den:denom[value(item,'type')],dots:children(item,'dot').length,modifications,notations,ties,
                lyric:value(one(item,'lyric'),'text').slice(0,100),stem:value(item,'stem'),head:value(item,'notehead')});
              break;
            }
            case 'direction': {
              const staff=number(item,'staff',1)-1;
              if(!tracks[staff])throw Error('記号の譜表番号が不正です');
              const at=tick(cursor+number(item,'offset')/divisions);
              for(const data of children(item,'direction-type').flatMap(node=>children(node))){
                const number=attr(data,'number')||'1';
                if(data.localName==='wedge'){
                  const type=attr(data,'type');
                  if(type==='stop')closeRange(tracks[staff],open[staff],'wedge'+number,mi,at,warn);
                  else if(['crescendo','diminuendo'].includes(type))open[staff].set('wedge'+number,{mi,tick:at,key:type});
                  continue;
                }
                if(data.localName==='metronome')continue;
                const words=data.textContent.trim();
                const mark=markList.find(entry=>entry.xml===data.localName||data.localName==='dynamics'&&entry.style==='dynamic'&&entry.label===children(data)[0]?.localName||
                  ['words','rehearsal'].includes(data.localName)&&entry.label===words&&!C.isRangeDirection(entry.key));
                if(mark)direction(tracks[staff],mi,{tick:at,key:mark.key},warn);
                else if(words)direction(tracks[staff],mi,{tick:at,key:'custom',text:words.slice(0,100)},warn);
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
                direction(tracks[number(item,'staff',1)-1]||tracks[0],mi,{tick:tick(cursor+number(item,'offset')/divisions),key:'chordSymbol',text},warn);
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
        if(attr(bar,'implicit')==='yes'&&tick(cursor)<capacity)warn('弱起・短縮小節は拍子に合わせて末尾に休符を補いました');
        for(const [i,track] of tracks.entries()){
          const map=voices[i],target=track.measures[mi];
          if(map.size>2)throw Error('1譜表に3声部以上ある小節には対応していません');
          const ids=[...map.keys()].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
          if(ids.length===1&&ids[0]==='2')ids.unshift('1');
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
      }catch(error){throw Error(name+' · '+(mi+1)+'小節目 · '+error.message);}
    }
    for(const [i,track] of tracks.entries()){
      if(open[i].size)warn('終点が見つからないスラーや強弱記号を省略しました');
      track.key=track.clef==='percussion'?0:key;
      track.transposition=shift||'concert';
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
      if(note.at<position||note.end>capacity)throw Error('音符の重なり、または拍子を超える音符があります');
      if(note.at>position)events.push(...filled(note.at-position));
      const length=note.end-note.at,mod=note.modifications;
      let {den,dots}=note;
      const ties=note.ties,unique=new Map();
      if(note.pitch)for(const p of [note.pitch,...note.chord])unique.set(C.pitchMidi(p),p);
      const pitches=C.normalizeChord([...unique.values()]);
      if(pitches.length>12)throw Error('13音以上の和音には対応していません');
      const make=(den,dots)=>pitches.length?
        {...C.makeNote(pitches[0],den,dots),pitches:pitches.map(p=>({...p,id:C.uid()}))}:C.makeRest(den,dots);
      let built;
      if(mod){
        const actual=number(mod,'actual-notes'),normal=number(mod,'normal-notes');
        if(!den||dots>2||!C.validTupletRatio(actual,normal))throw Error('未対応の比率の連符があります');
        const unit=denom[value(mod,'normal-type')]||group?.unit||den;
        if(!group)group={actual,normal,unit,index:0};
        if(group.actual!==actual||group.normal!==normal||group.unit!==unit)throw Error('連符の途中で音価の比率が変わっています');
        const event={...make(den,dots),tuplet:{...group}};
        if(Math.abs(C.eventTicks(event)-length)>1)throw Error('連符の長さが対応する音価と一致しません');
        group.index=C.tupletEnd(event);
        if(group.index===actual)group=null;
        built=[event];
      }else{
        if(group)throw Error('連符が途中で途切れています');
        const matching=den&&dots<=2&&C.durationTicks(den,dots)===length;
        const values=matching?[{den,dots}]:C.exactDurations(length);
        if(!matching&&den&&!note.whole)warn('一部の音価を、同じ長さの音符・タイに置き換えました');
        built=values.map(({den,dots})=>make(den,dots));
      }
      if(!built.length)throw Error('この音価を表せません');
      if(pitches.length){
        built.forEach((event,i)=>{
          if(i>0||ties.includes('stop')||ties.includes('continue'))event.tieStop=true;
          if(i<built.length-1||ties.includes('start')||ties.includes('continue'))event.tieStart=true;
          if(['up','down'].includes(note.stem))event.stemDirection=note.stem;
        });
        if(note.lyric)built[0].lyric=note.lyric;
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
    if(group)throw Error('連符が小節線をまたいでいます');
    return events;
  }
  root.KanadeMusicXMLImport={parse,xml};
})(globalThis);
