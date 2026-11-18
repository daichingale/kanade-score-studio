(function(root,factory) {
  const api = factory(root.KanadeCore || (typeof require === 'function' ? require('./core.js') : null),root.KanadeNotation||(typeof require==='function'?require('./notation.js'):null),root.KanadePercussion||(typeof require==='function'?require('./percussion.js'):null),root.KanadeSamples||(typeof require==='function'?require('./samples.js'):null));
  if(typeof module==='object' && module.exports) module.exports=api;
  root.KanadeExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,N,P,S){
  'use strict';
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const types={1:'whole',2:'half',4:'quarter',8:'eighth',16:'16th',32:'32nd',64:'64th'};
  const keyNames=['C','G','D','A','E','B','F#','C#'];
  const flatNames={ '-1':'F', '-2':'Bb','-3':'Eb','-4':'Ab','-5':'Db','-6':'Gb','-7':'Cb' };
  const directionXML=(type,tick,placement)=>`      <direction placement="${placement}"><direction-type>${type}</direction-type>${tick?`<offset>${tick}</offset>`:''}</direction>`;
  function gcd(a,b){
    while(b)[a,b]=[b,a%b];
    return a;
  }
  function durationGrid(events,secondary){
    let scale=1n;
    for(const event of [...events,...secondary])if(event.tuplet){
      const actual=BigInt(event.tuplet.actual);
      const nominal=BigInt(C.durationTicks(event.den,event.dots)*event.tuplet.normal);
      const denominator=actual/gcd(actual,nominal);
      scale=scale/gcd(scale,denominator)*denominator;
    }
    const duration=event=>{
      const ticks=BigInt(C.durationTicks(event.den,event.dots))*scale;
      return event.tuplet?ticks*BigInt(event.tuplet.normal)/BigInt(event.tuplet.actual):ticks;
    };
    let tick=0,exact=0n;
    const onsets=new Map([[0,0n]]);
    for(const event of events){
      tick+=C.eventTicks(event);exact+=duration(event);onsets.set(tick,exact);
    }
    return {divisions:BigInt(C.TPQ)*scale,duration,offset:tick=>onsets.get(tick)??BigInt(tick)*scale};
  }
  function directionsXML(score,mi,offset){
    const measure=score.measures[mi];
    const entries=[];
    for(const mark of measure.directions||[]){
      const preset=C.Symbols.byKey[mark.key],placement=preset.placement;
      if(C.isRangeDirection(mark.key))continue;
      const value=preset.style==='dynamic'?`<dynamics><${preset.label}/></dynamics>`:
        preset.xml?`<${preset.xml}/>`:`<words>${esc(mark.text||preset.label)}</words>`;
      entries.push([mark.tick,directionXML(value,offset(mark.tick),placement)]);
    }
    for(const segment of C.directionSegments(score,mi)){
      const {mark,startTick,endTick,first,last}=segment;
      if(mark.key==='slur')continue;
      const number=mark.key==='crescendo'?1:2;
      if(first)entries.push([startTick,directionXML(`<wedge type="${mark.key}" number="${number}"/>`,offset(startTick),'below')]);
      if(last)entries.push([endTick,directionXML(`<wedge type="stop" number="${number}"/>`,offset(endTick),'below')]);
    }
    return entries.sort((a,b)=>a[0]-b[0]).map(([,xml])=>xml);
  }
  function notationXML(marks,ties=[],event,slurs=[]){
    const groups={articulations:[],ornaments:[],technical:[]},fermatas=[];
    for(const key of marks){
      const {kind,xml,glyph,label}=C.Symbols.notes[key];
      if(kind==='fermata'){fermatas.push(`<fermata>${xml}</fermata>`);continue;}
      const [element,value]=xml.split(':');
      const markup=element==='tremolo'?`<tremolo type="single">${value}</tremolo>`:
        element==='fingering'?`<fingering>${glyph}</fingering>`:
        element==='other-technical'?`<other-technical>${esc(label)}</other-technical>`:`<${element} />`;
      groups[kind].push(markup);
    }
    const tuplet=event?.tuplet;
    const start=tuplet?.index===0?'<tuplet type="start" bracket="yes" />':'';
    const end=tuplet&&C.tupletEnd(event)===tuplet.actual?'<tuplet type="stop" />':'';
    const bracket=start+end;
    return '<notations>'+ties.map(type=>`<tied type="${type}" />`).join('')+slurs.join('')+bracket+fermatas.join('')+Object.entries(groups).filter(([,items])=>items.length).map(([kind,items])=>`<${kind}>${items.join('')}</${kind}>`).join('')+'</notations>';
  }
  const unpitchedGM={
    'コンサート・バスドラム':35,'キックドラム':36,'ピッコロスネア':38,'フィールドドラム':38,
    'サイドドラム':37,'フロアタム':41,'ハイハット':42,'ライドシンバル':51,
    'サスペンデッドシンバル':49,'タンバリン':54,'カウベル':56,'トライアングル':81,
    'ウッドブロック':76,'クラベス':75,'カバサ':69,'マラカス':70,'ギロ':73,
    'ヴィブラスラップ':58,'コンガ':64,'ボンゴ':60,'ティンバレス':65,'アゴゴベル':67,
  };
  const gm={snare:[38,40,37],tenor:[41,43,45,47,50],bass:[35,36,41,43,45],cymbal:[42,46,49,49]};
  function midiProgram(sound){return (S.presets[sound]||S.presets[S.fallback(sound)])?.program||1;}
  function percussionMidi(sound,pitch){
    const kit=P.preset(sound);
    return kit?gm[kit.kind][P.voice(sound,pitch).index]:unpitchedGM[sound]??38;
  }
  function musicXML(score) {
    const errors=C.validateScore(score); if(errors.length) throw new Error(errors[0]);
    const sound=C.soundName(score),kit=P.preset(sound),neutral=score.clef==='percussion',clef=C.CLEFS[score.clef],t=C.transposition(score);
    const pads=kit?.pads||[['C',score.instrument]];
    const instruments=kit||neutral?pads.map(([,label],i)=>`<score-instrument id="I${i+1}"><instrument-name>${esc(label)}</instrument-name></score-instrument>`).join(''):`<score-instrument id="I1"><instrument-name>${esc(score.instrument)}</instrument-name></score-instrument>`;
    const midi=kit||neutral?pads.map((_,i)=>`<midi-instrument id="I${i+1}"><midi-channel>10</midi-channel><midi-unpitched>${(kit?gm[kit.kind][i]:unpitchedGM[sound]??38)+1}</midi-unpitched></midi-instrument>`).join(''):`<midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>${midiProgram(sound)}</midi-program></midi-instrument>`;
    const out=['<?xml version="1.0" encoding="utf-8"?>','<!DOCTYPE score-partwise  PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">','<score-partwise version="4.0">',`  <work><work-title>${esc(score.title)}</work-title></work>`,`  <movement-title>${esc(score.title)}</movement-title>`,`  <identification><creator type="composer">${esc(score.composer)}</creator></identification>`,'  <defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults>',`  <part-list><score-part id="P1"><part-name>${esc(score.instrument)}</part-name><part-abbreviation>${esc(score.instrument.slice(0,6))}</part-abbreviation>${instruments}${midi}</score-part></part-list>`, '  <part id="P1">'];
    const slurs=new Map(),activeSlurs=[];
    const attachSlur=(mi,tick,type,number)=>{
      const key=mi+':'+tick;
      if(!slurs.has(key))slurs.set(key,[]);
      slurs.get(key).push(`<slur type="${type}" number="${number}" />`);
    };
    for(const [mi,measure] of score.measures.entries()){
      for(const mark of [...(measure.directions||[])].filter(mark=>mark.key==='slur').sort((a,b)=>a.tick-b.tick)){
        const end=C.directionEnd(score,mi,mark);
        if(!end||!C.eventSpans(score,mi,false).some(span=>span.start===mark.tick&&span.event.type==='note')||
          !C.eventSpans(score,end.mi,false).some(span=>span.start===end.tick&&span.event.type==='note'))continue;
        let index=activeSlurs.findIndex(item=>item.mi<mi||item.mi===mi&&item.tick<=mark.tick);
        if(index<0)index=activeSlurs.length;
        activeSlurs[index]=end;
        attachSlur(mi,mark.tick,'start',index+1);attachSlur(end.mi,end.tick,'stop',index+1);
      }
    }
    const lower=score.measures.some(bar=>bar.voice2?.length)?C.voiceScore(score,2):null;
    let previousDivisions=null;
    for(const [i,measure] of score.measures.entries()) {
      const time=C.timeAt(score,i),events=C.eventsWithRests(measure,time);
      const secondary=measure.voice2?.length?C.eventsWithRests(lower.measures[i],time):[];
      const grid=durationGrid(events,secondary);
      const divisions=grid.divisions!==previousDivisions?`<divisions>${grid.divisions}</divisions>`:'';
      previousDivisions=grid.divisions;
      const meter=`<time><beats>${time.num}</beats><beat-type>${time.den}</beat-type></time>`;
      out.push(`    <measure implicit="no" number="${i+1}">`);
      if(i===0) out.push(`      <attributes>${divisions}<key><fifths>${neutral?0:score.key}</fifths></key>${meter}<clef><sign>${clef.sign}</sign>${clef.line?`<line>${clef.line}</line>`:''}</clef><staff-details><staff-lines>${score.staffLines||5}</staff-lines></staff-details>${!neutral&&(t.chromatic||t.octave)?`<transpose><diatonic>${t.diatonic}</diatonic><chromatic>${t.chromatic}</chromatic>${t.octave?`<octave-change>${t.octave}</octave-change>`:''}</transpose>`:''}</attributes>`,`      <direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}" /></direction>`);
      else{
        const timeChange=C.sameTime(time,C.timeAt(score,i-1))?'':meter;
        if(divisions||timeChange)out.push(`      <attributes>${divisions}${timeChange}</attributes>`);
      }
      const ending=C.endingEdges(score,i);
      if(measure.repeatStart||ending.start)out.push(`      <barline location="left">${measure.repeatStart?'<bar-style>heavy-light</bar-style>':''}${ending.start?`<ending number="${measure.volta}" type="start"/>`:''}${measure.repeatStart?'<repeat direction="forward"/>':''}</barline>`);
      out.push(...directionsXML(score,i,grid.offset));
      const tracks=secondary.length?[[1,events,score],[2,secondary,lower]]:[[1,events,score]];
      for(const [voice,notes,track] of tracks){
        if(voice===2)out.push(`      <backup><duration>${BigInt(C.barTicks(score,i))*grid.divisions/BigInt(C.TPQ)}</duration></backup>`);
        const beams=N.beamMarks(track,i);
        let tick=0;
        for(const [index,e] of notes.entries()) {
          const flags=C.tieFlags(track,i,index),ties=[...(flags.stop?['stop']:[]),...(flags.start?['start']:[])];
          const duration=grid.duration(e);
          const pitchXml=e.type==='rest'?[null]:e.pitches;
          for(const [j,p] of pitchXml.entries()) {
            out.push('      <note>');
            if(j>0) out.push('        <chord />');
            if(!p) out.push('        <rest />');
            else if(neutral)out.push(`        <unpitched><display-step>${score.staffLines===1?'E':p.step}</display-step><display-octave>${score.staffLines===1?4:p.octave}</display-octave></unpitched>`);
            else out.push(`        <pitch><step>${p.step}</step>${p.alter?`<alter>${p.alter}</alter>`:''}<octave>${p.octave}</octave></pitch>`);
            out.push(`        <duration>${duration}</duration>`);
            if(p)for(const type of ties)out.push(`        <tie type="${type}" />`);
            if(p)out.push(`        <instrument id="I${kit?P.voice(sound,p).index+1:1}" />`);
            if(secondary.length)out.push(`        <voice>${voice}</voice>`);
            out.push(`        <type>${types[e.den]}</type>`);
            for(let k=0;k<e.dots;k++) out.push('        <dot />');
            if(e.tuplet){
              const normalType=C.tupletUnit(e)!==e.den||e.dots?`<normal-type>${types[C.tupletUnit(e)]}</normal-type>`:'';
              out.push(`        <time-modification><actual-notes>${e.tuplet.actual}</actual-notes><normal-notes>${e.tuplet.normal}</normal-notes>${normalType}</time-modification>`);
            }
            const stem=e.stemDirection||(secondary.length?(voice===1?'up':'down'):null);
            if(p&&e.den!==1&&stem)out.push(`        <stem>${stem}</stem>`);
            if(p&&score.notehead==='cross')out.push('        <notehead>x</notehead>');
            if(j===0)for(const beam of beams.get(e.id)||[])out.push(`        <beam number="${beam.number}">${beam.value}</beam>`);
            const bracket=j===0&&e.tuplet&&(e.tuplet.index===0||C.tupletEnd(e)===e.tuplet.actual)?e:null;
            const slur=voice===1&&j===0&&p?slurs.get(i+':'+tick)||[]:[];
            if(bracket||slur.length||p&&(ties.length||j===0&&e.articulations?.length))
              out.push('        '+notationXML(j===0?e.articulations||[]:[],ties,bracket,slur));
            if(e.lyric && j===0) out.push(`        <lyric number="1"><syllabic>single</syllabic><text>${esc(e.lyric)}</text></lyric>`);
            out.push('      </note>');
          }
          tick+=C.eventTicks(e);
        }
      }
      if(measure.repeatEnd||ending.stop)out.push(`      <barline location="right">${measure.repeatEnd?'<bar-style>light-heavy</bar-style>':''}${ending.stop?`<ending number="${measure.volta}" type="stop"/>`:''}${measure.repeatEnd?'<repeat direction="backward"/>':''}</barline>`);
      out.push('    </measure>');
    }
    out.push('  </part>','</score-partwise>'); return out.join('\n')+'\n';
  }
  function musicXMLScore(parts){
    if(parts.length===1)return musicXML(parts[0]);
    const documents=parts.map((part,index)=>musicXML(part).replace(/"P1"/g,`"P${index+1}"`)
      .replace(/id="I(\d+)"/g,(_,instrument)=>`id="P${index+1}-I${instrument}"`));
    const header=documents[0].split('  <part-list>')[0];
    const entries=documents.map(xml=>xml.match(/<score-part id=[\s\S]*?<\/score-part>/)[0]).join('\n    ');
    const voices=documents.map(xml=>xml.match(/  <part id=[\s\S]*?<\/part>/)[0]).join('\n');
    return `${header}  <part-list>\n    ${entries}\n  </part-list>\n${voices}\n</score-partwise>\n`;
  }
  function ksl(score) {
    const errors=C.validateScore(score); if(errors.length) throw new Error(errors[0]);
    if(score.measures.some(m=>m.repeatStart||m.repeatEnd||m.volta))throw new Error('反復記号を含む楽譜は MusicXML で書き出してください');
    if(score.measures.some(m=>m.voice2?.length))throw new Error('第2声部を含む楽譜は MusicXML で書き出してください');
    if(score.measures.some(m=>m.events.some(e=>e.tuplet)))throw new Error('連符を含む楽譜は MusicXML で書き出してください');
    const key=score.key<0?flatNames[score.key]+' major':keyNames[score.key]+' major';
    const pitch=p=>p.step.toLowerCase()+ (p.alter>0?'#'.repeat(p.alter):p.alter<0?'b'.repeat(-p.alter):'') +(p.octave>3?"'".repeat(p.octave-3):','.repeat(3-p.octave));
    const token=e=> (e.type==='rest'?'r':e.pitches.length===1?pitch(e.pitches[0]):'<'+e.pitches.map(pitch).join(' ')+'>') + e.den + '.'.repeat(e.dots);
    const lines=['kanade 1',`flow "${String(score.title).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`,'','global {',`  | \\time ${C.timeAt(score,0).num}/${C.timeAt(score,0).den} \\key ${key.toLowerCase()} \\tempo 4=${score.tempo}`];
    for(let i=1;i<score.measures.length;i++){
      const time=C.timeAt(score,i);
      lines.push(C.sameTime(time,C.timeAt(score,i-1))?'  |':`  | \\time ${time.num}/${time.den}`);
    }
    lines.push('}','',`part score staff 1 voice 1 {`);
    for(const [mi,m] of score.measures.entries()) {
      const a=m.events.map(token);
      for(const r of C.fillRests(C.barTicks(score,mi)-C.usedTicks(m))) a.push('s'+r.den+'.'.repeat(r.dots));
      lines.push('  | '+a.join(' '));
    }
    lines.push('}','');return lines.join('\n');
  }
  return {musicXML,musicXMLScore,ksl,esc,midiProgram,percussionMidi};
});
