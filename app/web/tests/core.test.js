const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const E=require('../src/musicxml.js');

test('duration ticks use exact integers even for double-dots',()=>{
 assert.equal(C.durationTicks(4,0),960); assert.equal(C.durationTicks(4,1),1440);
 assert.equal(C.durationTicks(16,2),420); assert.equal(C.measureTicks({num:6,den:8}),2880);
});
test('notes insert into next measure when exactly full',()=>{
 let score=C.createScore();
 for(let i=0;i<4;i++) score=C.insertEvent(score,0,i,C.makeNote({step:'C',alter:0,octave:4})).score;
 const last=C.insertEvent(score,0,4,C.makeRest(4));
 assert.equal(last.score.measures.length,2); assert.equal(last.measureIndex,1); assert.equal(C.validateScore(last.score).length,0);
});
test('overflow does not mutate original score',()=>{
 const score=C.createScore(); const first=C.insertEvent(score,0,0,C.makeNote({step:'C',alter:0,octave:4},1));
 assert.throws(()=>C.insertEvent(first.score,0,0,C.makeRest(4)),/収まりません/);
 assert.equal(score.measures[0].events.length,0);
});
test('reject ID collisions and malformed imports',()=>{
 const score=C.createScore(); const n=C.makeNote({step:'C',alter:0,octave:4});
 score.measures[0].events=[n,{...n}]; assert.ok(C.validateScore(score).length>0);
});
test('chord pitches sorted, preserve ids, reject duplicates',()=>{
 let score=C.createScore(); const n=C.makeNote({step:'G',alter:0,octave:4});
 score=C.insertEvent(score,0,0,n).score;
 score=C.addChordPitch(score,n.id,{step:'C',alter:0,octave:4});
 assert.deepEqual(score.measures[0].events[0].pitches.map(p=>p.step),['C','G']);
 assert.throws(()=>C.addChordPitch(score,n.id,{step:'G',alter:0,octave:4}),/同じ音/);
});
test('MusicXML exports correct 3/4 time, chord and explicit filler rests',()=>{
 let score=C.createScore(); score=C.withSettings(score,{time:{num:3,den:4},key:-2});
 const n=C.makeNote({step:'B',alter:-1,octave:3},4,1); score=C.insertEvent(score,0,0,n).score;
 score=C.addChordPitch(score,n.id,{step:'D',alter:0,octave:4});
 const xml=E.musicXML(score);
 assert.match(xml,/<beats>3<\/beats>/); assert.match(xml,/<fifths>-2<\/fifths>/);
 assert.match(xml,/<duration>1440<\/duration>/); assert.match(xml,/<chord \/>/);
 assert.match(xml,/<rest \/>/);
});
test('KSL uses C4= c\' spelling and fills bars',()=>{
 const score=C.createScore(); score.measures[0].events=[C.makeNote({step:'C',alter:0,octave:4})];
 const s=E.ksl(score); assert.match(s,/c'4/); assert.match(s,/s2 s4/);
});
test('prevent invalid time change that creates overfull measure',()=>{
 let score=C.createScore();
 score=C.insertEvent(score,0,0,C.makeNote({step:'C',alter:0,octave:4},1)).score;
 assert.throws(()=>C.withSettings(score,{time:{num:3,den:4}}),/拍子を超え/);
});
test('reject invalid instrument and duplicate unisons in imported data',()=>{
 const score=C.createScore();score.instrument={};assert.match(C.validateScore(score).join('|'),/楽器名/);
 score.instrument='ピアノ';
 const n=C.makeNote({step:'C',alter:0,octave:4});n.pitches.push({...n.pitches[0],id:C.uid()});
 score.measures[0].events=[n]; assert.match(C.validateScore(score).join('|'),/重複した音/);
});
test('deleting middle note preserves timing by replacing it with a rest',()=>{
 let s=C.createScore();const a=C.makeNote({step:'C',alter:0,octave:4});const b=C.makeNote({step:'D',alter:0,octave:4});
 s=C.insertEvent(s,0,0,a).score;s=C.insertEvent(s,0,1,b).score;
 const removed=C.deleteEvent(s,a.id);
 assert.equal(removed.measures[0].events[0].type,'rest');
 assert.equal(removed.measures[0].events[1].id,b.id);
 assert.equal(C.usedTicks(removed.measures[0]),1920);
});
test('overwriting a rest with a shorter note leaves a compensating rest',()=>{
 let s=C.createScore();const r=C.makeRest(2);s=C.insertEvent(s,0,0,r).score;
 const n=C.makeNote({step:'C',alter:0,octave:4},4);
 const result=C.insertEvent(s,0,0,n);
 assert.equal(result.score.measures[0].events.length,2);
 assert.deepEqual(result.score.measures[0].events.map(e=>e.den),[4,4]);
 assert.equal(C.usedTicks(result.score.measures[0]),1920);
});

test('dotted half notes overflow atomically as a quarter tied to a half',()=>{
 const note=C.makeNote({step:'C',octave:4,alter:0},2,1);
 const first=C.placeAcrossBars(C.createScore(),0,0,note).score;
 const second=C.placeAcrossBars(first,0,2880,note).score;
 assert.deepEqual(second.measures.map(m=>m.events.map(e=>[e.den,e.dots])),[[[2,1],[4,0]],[[2,0]]]);
 assert.deepEqual(C.tieFlags(second,0,1),{start:true,stop:false});
 assert.deepEqual(C.tieFlags(second,1,0),{start:false,stop:true});
 assert.equal(first.measures.length,1);
 const occupied=C.placeAcrossBars(C.addMeasure(first),1,0,C.makeNote({step:"D",octave:4,alter:0},2,1)).score;
 assert.throws(()=>C.placeAcrossBars(occupied,0,2880,note),/重なる/);
 assert.equal(occupied.measures[0].events.length,1);
 const svg=require('../src/renderer.js').render(second,null);
 assert.equal((svg.match(/class="note-tie"/g)||[]).length,2);
 const xml=require('../src/musicxml.js').musicXML(second);
 assert.match(xml,/<tie type="start" \/>/);
 assert.match(xml,/<tied type="stop" \/>/);
});

test('pointer snapping follows written dotted onsets and dotted subdivisions',()=>{
 const base=C.createScore();
 const score=C.placeAcrossBars(base,0,0,C.makeRest(4,1)).score;
 assert.equal(C.snapInputTick(score,0,1470,4,0),1440);
 assert.equal(C.snapInputTick(base,0,485,4,1),480);
});

test('overwrite input replaces covered events only when enabled',()=>{
 const quarter=step=>C.makeNote({step,octave:4,alter:0},4);
 const original=[quarter('C'),quarter('D'),C.makeRest(4),quarter('F')];
 const score=original.reduce((s,event,index)=>C.placeEventAt(s,0,index*960,event).score,C.createScore());
 const whole=C.makeNote({step:'G',octave:4,alter:0},1);
 assert.equal(C.canPlaceAt(score,0,0,1),false);
 assert.equal(C.canPlaceAt(score,0,0,1,0,{overwrite:true}),true);
 assert.throws(()=>C.placeAcrossBars(score,0,0,whole),/重なる/);
 const result=C.placeAcrossBars(score,0,0,whole,{overwrite:true});
 assert.deepEqual(result.score.measures[0].events,[whole]);
 assert.deepEqual(score.measures[0].events,original);
});

test('overwrite preserves the pitches and beat positions outside the input interval',()=>{
 const whole={...C.makeNote({step:'C',octave:4,alter:0},1),lyric:'la'};
 const score=C.placeEventAt(C.createScore(),0,0,whole).score;
 const next=C.placeAcrossBars(score,0,960,C.makeRest(4),{overwrite:true}).score;
 assert.deepEqual(C.eventSpans(next,0,false).map(({event,start,end})=>[event.type,event.pitches[0]?.step,start,end]),[
   ['note','C',0,960],['rest',undefined,960,1920],['note','C',1920,3840]
 ]);
 assert.equal(next.measures[0].events[0].lyric,'la');
 assert.equal(next.measures[0].events[2].lyric,undefined);
});

test('overwriting across a bar keeps the new tie and the uncovered remainder',()=>{
 const make=(step,den,dots)=>C.makeNote({step,octave:4,alter:0},den,dots);
 const start=C.placeEventAt(C.createScore(),0,0,make('C',1)).score;
 const score=C.placeEventAt(C.addMeasure(start),1,0,make('D',1)).score;
 const next=C.placeAcrossBars(score,0,2880,make('E',2,1),{overwrite:true}).score;
 assert.deepEqual(next.measures.map(m=>m.events.map(e=>[e.pitches[0].step,e.den,e.dots])),[
   [['C',2,1],['E',4,0]],[['E',2,0],['D',2,0]]
 ]);
 assert.deepEqual(C.tieFlags(next,0,1),{start:true,stop:false});
 assert.deepEqual(C.tieFlags(next,1,0),{start:false,stop:true});
});

test('tuplets preserve exact duration, engraving and MusicXML across supported ratios',()=>{
 const R=require('../src/renderer.js');
 const B=require('../src/editing.js');
 for(const [count,normal] of Object.entries(C.TUPLETS)){
   const actual=Number(count);
   const input=Array.from({length:actual},(_,i)=>i===0?C.makeRest(8):C.makeNote({step:'C',octave:4,alter:0},8));
   const {score}=C.placeTuplet(C.createScore(),0,0,8,actual,input);
   const length=C.durationTicks(8)*normal;
   assert.equal(C.usedTicks(score.measures[0]),length);
   assert.equal(C.eventSpans(score,0)[actual].start,length);
   assert.match(R.render(score,null),new RegExp('data-tuplet="'+actual+'"'));
   assert.match(R.engrave([score])[0],new RegExp('data-tuplet="'+actual+'"'));
   const xml=E.musicXML(score);
   assert.match(xml,new RegExp('<actual-notes>'+actual+'</actual-notes><normal-notes>'+normal+'</normal-notes>'));
   assert.match(xml,/<tuplet type="start" bracket="yes" \/>/);
   assert.match(xml,/<tuplet type="stop" \/>/);
   const pasted=B.pasteRange(C.createScore(),B.copyRange(score,0,length),0).score;
   assert.equal(C.usedTicks(pasted.measures[0]),length);
   assert.throws(()=>B.copyRange(score,C.eventTicks(score.measures[0].events[0]),length),/連符全体/);
   assert.throws(()=>C.placeTuplet(score,0,3800,8,actual,input),/小節/);
 }
});

test('tuplet rests and note deletion preserve rhythmic slots',()=>{
 const pitch={step:'G',octave:4,alter:0},note=C.makeNote(pitch,8);
 const {score}=C.placeTuplet(C.createScore(),0,0,8,3,[C.makeRest(8),note,C.makeRest(8)]);
 const toggled=C.toggleNoteRest(score,note.id,pitch);
 assert.equal(toggled.measures[0].events[1].type,'rest');
 assert.equal(C.eventSpans(toggled,0)[1].start,320);
 assert.equal(C.toggleNoteRest(toggled,note.id,pitch).measures[0].events[1].pitches[0].step,'G');
 assert.equal(C.usedTicks(C.deleteEvent(score,note.id).measures[0]),960);
 assert.throws(()=>C.placeAcrossBars(score,0,0,C.makeNote(pitch,16),{overwrite:true}),/連符全体/);
 const replaced=C.placeAcrossBars(score,0,0,C.makeNote(pitch,4),{overwrite:true}).score;
 assert.equal(replaced.measures[0].events.length,1);
});

test('manual ties toggle across barlines and reject different pitches',()=>{
 const make=step=>C.makeNote({step,octave:4,alter:0},1);
 const first=C.placeAcrossBars(C.createScore(),0,0,make('C')).score;
 const score=C.placeAcrossBars(first,0,3840,make('C')).score;
 const tied=C.toggleTie(score,0,0);
 assert.deepEqual(C.tieFlags(tied,0,0),{start:true,stop:false});
 assert.deepEqual(C.tieFlags(tied,1,0),{start:false,stop:true});
 assert.deepEqual(C.tieFlags(C.toggleTie(tied,0,0),0,0),{start:false,stop:false});
 const different=C.placeAcrossBars(first,0,3840,make('D')).score;
 assert.throws(()=>C.toggleTie(different,0,0),/同じ高さ/);
});

test('hover ghost and insertion use the same octave-shifted pitch',()=>{
 const R=require('../src/renderer.js'),score=C.createScore(),g=R.measureGeometry(score,0);
 const y=R.diatonicY({step:'C',octave:4},g.top,score.clef);
 const hit=R.hitTest(score,g.notesStart,y,4,0,null,R.PAGE,{octaveShift:1});
 assert.equal(hit.octave,5);
 assert.equal(hit.step,'C');
 assert.equal(hit.y,R.diatonicY({step:'C',octave:5},g.top,score.clef));
});

test('mixed quarter and eighth triplets retain time, grouping and round-trip behavior',()=>{
 const B=require('../src/editing.js'),R=require('../src/renderer.js');
 const pitch={step:'C',alter:0,octave:4};
 const note=C.makeNote(pitch,4),rest=C.makeRest(8),after=C.makeNote(pitch,4);
 const base=C.placeEventAt(C.createScore(),0,960,after).score;
 const score=C.placeTuplet(base,0,0,8,3,[note,rest]).score;
 const spans=C.eventSpans(score,0,false);
 assert.deepEqual(spans.map(s=>[s.start,s.end]),[[0,640],[640,960],[960,1920]]);
 assert.deepEqual(C.tupletGroupAt(spans,1).map(s=>s.event.tuplet.index),[0,2]);
 assert.deepEqual(C.validateScore(JSON.parse(JSON.stringify(score))),[]);
 assert.match(R.render(score,null),/data-tuplet="3"/);
 const xml=E.musicXML(score);
 assert.match(xml,/<duration>640<\/duration>[\s\S]*?<type>quarter<\/type>[\s\S]*?<normal-type>eighth<\/normal-type>/);
 assert.match(xml,/<tuplet type="stop" \/>/);
 const pasted=B.pasteRange(C.createScore(),B.copyRange(score,0,960),0).score;
 assert.equal(C.usedTicks(pasted.measures[0]),960);
 assert.throws(()=>B.copyRange(score,0,640),/連符全体/);
});

test('enlarging a note overwrites adjacent triplet entries but keeps the last onset',()=>{
 const pitch={step:'C',alter:0,octave:4};
 const notes=[C.makeNote(pitch,8),C.makeRest(8),C.makeNote({...pitch,step:'G'},8)];
 const original=C.placeTuplet(C.createScore(),0,0,8,3,notes).score;
 const legacy=C.copy(original);
 for(const event of legacy.measures[0].events)delete event.tuplet.unit;
 assert.deepEqual(C.validateScore(legacy),[]);
 const events=C.replaceTupletEntry(legacy.measures[0].events,0,{...notes[0],den:4},8,3);
 const next=C.placeTuplet(legacy,0,0,8,3,events,{overwrite:true}).score;
 assert.deepEqual(next.measures[0].events.map(e=>[e.id,e.den,e.tuplet.index]),[[notes[0].id,4,0],[notes[2].id,8,2]]);
 assert.equal(C.eventSpans(next,0,false)[1].start,640);
 assert.equal(legacy.measures[0].events.length,3);
 assert.throws(()=>C.replaceTupletEntry(legacy.measures[0].events,2,C.makeRest(4),8,3),/残りの枠/);
});

test('direct duration change absorbs the following triplet rest without moving the last note',()=>{
 const pitch={step:'B',alter:0,octave:4};
 const first=C.makeNote(pitch,8),last=C.makeNote({...pitch,step:'G'},8);
 const after=C.makeNote({...pitch,step:'F'},4);
 const base=C.placeEventAt(C.createScore(),0,2880,after).score;
 const score=C.placeTuplet(base,0,1920,8,3,[first,C.makeRest(8),last]).score;
 const result=C.changeDuration(score,first.id,4,0,{overwriteTuplet:true});
 const spans=C.eventSpans(result,0,false);
 assert.deepEqual(spans.slice(-3).map(({event,start,end})=>[event.id,event.den,start,end]),
   [[first.id,4,1920,2560],[last.id,8,2560,2880],[after.id,4,2880,3840]]);
 assert.equal(spans.at(-3).event.pitches[0].step,'B');
 assert.equal(spans.at(-3).event.tuplet.actual,3);
 const shortened=C.changeDuration(result,first.id,8,0,{overwriteTuplet:true});
 assert.deepEqual(C.eventSpans(shortened,0,false).slice(-4).map(({event,start})=>[event.type,event.den,start]),
   [['note',8,1920],['rest',8,2240],['note',8,2560],['note',4,2880]]);
 assert.throws(()=>C.changeDuration(score,last.id,4,0,{overwriteTuplet:true}),/残りの枠/);
 assert.deepEqual(C.validateScore(result),[]);
});

test('changing the end of a hairpin keeps the start and exports a stop at the selected onset',()=>{
 const score=C.createScore(),R=require('../src/renderer.js');
 const initial=C.setDirectionRange(score,0,'crescendo',0,0,2880);
 const shorter=C.setDirectionRange(initial,0,'crescendo',0,0,960);
 assert.deepEqual(shorter.measures[0].directions,[{key:'crescendo',tick:0,end:960}]);
 assert.equal(initial.measures[0].directions[0].end,2880);
 assert.match(R.render(shorter,null),/data-direction-edit="crescendo"/);
 assert.match(E.musicXML(shorter),/<wedge type="stop" number="1"\/><\/direction-type><offset>960<\/offset>/);
});

test('slur and hairpin endpoints stay with the destination measure across an insertion',()=>{
 const R=require('../src/renderer.js'),B=require('../src/editing.js');
 const note=step=>C.makeNote({step,alter:0,octave:4});
 const first=C.placeEventAt(C.createScore(),0,0,note('C')).score;
 const two=C.placeEventAt(C.addMeasure(first),1,0,note('D')).score;
 const slur=C.setDirectionRange(two,0,'slur',0,1,0);
 const both=C.setDirectionRange(slur,0,'diminuendo',0,1,0);
 const score=B.insertMeasures(both,1);
 assert.deepEqual(C.directionEnd(score,0,score.measures[0].directions[0]),{mi:2,tick:0});
 assert.deepEqual(C.directionSegments(score,1).map(mark=>[mark.first,mark.last]),[[false,false],[false,false]]);
 assert.match(R.engrave([score])[0],/data-direction="slur"/);
 assert.doesNotMatch(R.engrave([score])[0],/data-direction-edit/);
 const xml=E.musicXML(score);
 assert.match(xml,/<slur type="start" number="1" \/>/);
 assert.match(xml,/<slur type="stop" number="1" \/>/);
 assert.match(xml,/<wedge type="stop" number="2"\/>/);
 assert.equal(C.directionEnd(B.removeMeasures(score,2,2),0,score.measures[0].directions[0]),null);
});

test('temporary meter changes restore the surrounding pattern and future bars keep its phase',()=>{
 const common={num:4,den:4},triple={num:3,den:4},seven={num:7,den:8};
 const base=C.setMeter(C.addMeasure(C.createScore()),1,[common,triple]);
 const temporary=C.setMeter(base,1,[seven],3);
 assert.deepEqual(temporary.measures.map((_,mi)=>C.timeAt(temporary,mi)),[common,seven,seven,seven]);
 const more=C.addMeasure(C.addMeasure(temporary));
 assert.deepEqual(more.measures.slice(4).map((_,mi)=>C.timeAt(more,mi+4)),[triple,common]);
 const local=C.setMeter(more,2,[triple],1);
 assert.deepEqual(C.measureOffsets(local),[0,3840,7200,10080,13440,16320,20160]);
 assert.deepEqual(C.validateScore(JSON.parse(JSON.stringify(local))),[]);
 assert.equal(C.timeAt(base,1).num,4);
});

test('mixed meter drives overflow ties, selection, paste and engraving',()=>{
 const B=require('../src/editing.js'),R=require('../src/renderer.js');
 const common={num:4,den:4},triple={num:3,den:4};
 const pattern=C.setMeter(C.createScore(),0,[triple,common]);
 const note=C.makeNote({step:'C',octave:4,alter:0},1);
 const score=C.placeAcrossBars(pattern,0,0,note).score;
 assert.deepEqual(score.measures.map(bar=>C.usedTicks(bar)),[2880,960]);
 assert.deepEqual(C.tieFlags(score,1,0),{start:false,stop:true});
 assert.equal(B.slot(score,{mi:1,index:0}).start,2880);
 const fragment=B.copyRange(score,0,3840);
 const pasted=B.pasteRange(pattern,fragment,0).score;
 assert.deepEqual(C.measureOffsets(pasted),[0,2880,6720]);
 assert.match(R.render(pasted,null),/data-meter="3\/4"[\s\S]+data-meter="4\/4"/);
 assert.match(R.engrave([pasted])[0],/data-meter="3\/4"[\s\S]+data-meter="4\/4"/);
 assert.match(E.musicXML(pasted),/<measure implicit="no" number="2">\s*<attributes><time><beats>4<\/beats>/);
 assert.throws(()=>C.setMeter(score,0,[{num:2,den:4}],1),/1小節目の音符・休符/);
});

test('an ensemble shares each meter and refuses to shorten a bar past another part’s notes',()=>{
 const first=C.createScore(),second=C.createScore();
 const note=C.makeNote({step:'C',octave:4,alter:0},1);
 const filled=C.placeEventAt(second,0,0,note).score;
 const document={...first,ensembleParts:[filled]};
 const change=C.setMeter(first,0,[{num:3,den:4}],1);
 assert.ok(C.validateScore(C.replaceScorePart(document,0,change)).length);
 const safe=C.setMeter(first,0,[{num:5,den:4},{num:3,den:4}]);
 const ensemble=C.replaceScorePart(document,0,safe);
 assert.deepEqual(C.validateScore(ensemble),[]);
 assert.equal(C.timeAt(ensemble.ensembleParts[0],0).num,5);
});

test('custom 19:4 tuplets keep the measure grid and export exact durations',()=>{
 const B=require('../src/editing.js'),R=require('../src/renderer.js');
 const pitch={step:'G',octave:4,alter:0};
 const notes=Array.from({length:19},()=>C.makeNote(pitch,8));
 const base=C.placeEventAt(C.addMeasure(C.createScore()),0,1920,C.makeNote(pitch,4)).score;
 const score=C.placeTuplet(base,0,0,8,19,notes,{normal:4}).score;
 const spans=C.eventSpans(score,0,false);
 assert.equal(spans[19].start,1920);
 assert.ok(spans.slice(0,19).every((span,index)=>span.start===Math.round(1920*index/19)));
 assert.ok(spans.slice(0,19).every(span=>C.exactEventTicks(span.event)===1920/19));
 const mixed=C.changeDuration(score,notes[0].id,4,0,{overwriteTuplet:true});
 assert.equal(C.usedTicks(mixed.measures[0]),2880);
 assert.equal(mixed.measures[0].events[0].tuplet.normal,4);
 assert.deepEqual(C.validateScore(JSON.parse(JSON.stringify(mixed))),[]);
 const pasted=B.pasteRange(C.createScore(),B.copyRange(score,0,1920),0).score;
 assert.equal(C.usedTicks(pasted.measures[0]),1920);
 assert.match(R.engrave([score])[0],/data-tuplet="19"/);
 const xml=E.musicXML(score);
 const [first,second]=xml.split('</measure>');
 assert.match(first,/<divisions>18240<\/divisions>/);
 assert.equal([...first.matchAll(/<duration>1920<\/duration>/g)].length,19);
 assert.match(first,/<actual-notes>19<\/actual-notes><normal-notes>4<\/normal-notes>/);
 assert.match(second,/<divisions>960<\/divisions>/);
});

test('two voices keep independent timelines through duplication, export, and collaboration',()=>{
 const S=require('../src/sync.js');
 const base=C.createScore(),bar=base.measures[0];
 const first=C.makeNote({step:'C',alter:0,octave:5},2);
 const second=['E','D','C','G'].map(step=>C.makeNote({step,alter:0,octave:4},8));
 const upper={...base,measures:[{...bar,events:[first]}]};
 const lower={...base,measures:[{...bar,voice2:second}]};
 const lowerPatch=S.diff(base,lower);
 const combined=S.merge(upper,lowerPatch);
 assert.deepEqual(combined.conflicts,[]);
 assert.deepEqual(combined.score.measures[0].voice2,second);
 assert.deepEqual(S.merge(combined.score,S.inverse(lowerPatch)).score,upper);
 assert.deepEqual(C.validateScore(combined.score),[]);
 assert.throws(()=>C.setMeter(combined.score,0,[{num:1,den:4}],1),/収まりません/);
 const duplicate=C.cloneMeasure(combined.score.measures[0]);
 const copied={...combined.score,measures:[combined.score.measures[0],duplicate]};
 assert.deepEqual(C.validateScore(copied),[]);
 assert.notEqual(duplicate.voice2[0].id,second[0].id);
 const xml=E.musicXML(combined.score);
 assert.match(xml,/<voice>1<\/voice>\s*<type>half<\/type>\s*<stem>up<\/stem>/);
 assert.match(xml,/<backup><duration>3840<\/duration><\/backup>/);
 assert.equal((xml.match(/<voice>2<\/voice>\s*<type>eighth<\/type>\s*<stem>down<\/stem>/g)||[]).length,4);
 const svg=require('../src/renderer.js').render(combined.score,null);
 assert.match(svg,/data-secondary-voice="2"/);
 for(const event of [first,...second])assert.ok(svg.includes(event.id));
});
