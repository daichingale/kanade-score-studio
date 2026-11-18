const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),B=require('../src/editing.js');
function freeze(x){if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);Object.values(x).forEach(freeze);}return x;}
function fixture(bars=3){const score=C.createScore();score.measures=[];for(let mi=0;mi<bars;mi++)score.measures.push({id:C.uid(),events:['C','D','E','F'].map(step=>C.makeNote({step,octave:4,alter:0},4))});return score;}
test('selection crosses measures and bulk transpose is atomic and shares untouched measures',()=>{
 const score=freeze(fixture()),before=JSON.stringify(score),spans=B.entries(score,1920,5760,false);
 assert.equal(spans.length,4);
 const next=B.transpose(score,spans.map(s=>s.event.id),7);
 assert.deepEqual(next.measures.slice(0,2).flatMap(m=>m.events.map(e=>e.pitches[0].octave)),[4,4,5,5,5,5,4,4]);
 assert.equal(next.measures[2],score.measures[2]);assert.equal(JSON.stringify(score),before);
 const reversed=B.transpose(next,spans.map(s=>s.event.id),-7);assert.deepEqual(reversed,score);
});
test('invalid range transpose leaves every original pitch unchanged',()=>{
 const score=fixture(1);score.measures[0].events[1].pitches[0].octave=8;freeze(score);
 const before=JSON.stringify(score);assert.throws(()=>B.transpose(score,score.measures[0].events.map(e=>e.id),7));assert.equal(JSON.stringify(score),before);
 assert.throws(()=>B.transform(score,['missing'],e=>e),/見つかりません/);
});
test('range clear leaves measure boundaries, timing and unselected notes intact',()=>{
 const score=freeze(fixture()),before=C.eventSpans(score,0).map(s=>s.start);
 const next=B.clearRange(score,960,4800);
 assert.deepEqual(next.measures[0].events.map(e=>e.type),['note','rest','rest','rest']);
 assert.equal(next.measures[1].events[0].type,'rest');assert.equal(next.measures[1].events[1],score.measures[1].events[1]);
 assert.deepEqual(C.eventSpans(next,0).map(s=>s.start),before);assert.equal(next.measures.length,3);
});
test('copy and paste across a measure boundary replaces the target range and creates fresh IDs',()=>{
 const score=freeze(fixture()),clip=B.copyRange(score,2880,4800),result=B.pasteRange(score,clip,6720);
 assert.equal(result.score.measures[1].events[3].pitches[0].step,'F');assert.equal(result.score.measures[2].events[0].pitches[0].step,'C');
 assert.notEqual(result.firstId,clip.events[0].event.id);
 assert.equal(result.score.measures[0],score.measures[0]);assert.equal(result.score.measures[2].events[1],score.measures[2].events[1]);
 assert.deepEqual(C.validateScore(result.score),[]);assert.equal(clip.events[0].event.id,score.measures[0].events[3].id);
});
test('paste appends needed measures, splits rests at barlines and rejects partial notes',()=>{
 const empty=C.createScore(),source=C.createScore();source.measures[0].events=[C.makeRest(2)];
 const clip=B.copyRange(source,0,1920),pasted=B.pasteRange(empty,clip,2880).score;
 assert.equal(pasted.measures.length,2);assert.equal(pasted.measures[0].events.at(-1).den,4);assert.equal(pasted.measures[1].events[0].den,4);
 const full=fixture(1),before=JSON.stringify(full),short=C.createScore();short.measures[0].events=[C.makeNote({step:'G',octave:4,alter:0},8)];
 assert.throws(()=>B.pasteRange(full,B.copyRange(short,0,480),0),/途中/);assert.equal(JSON.stringify(full),before);
 source.measures[0].events=[C.makeNote({step:'G',octave:4,alter:0},2)];
 assert.throws(()=>B.pasteRange(empty,B.copyRange(source,0,1920),2880),/小節線/);
 assert.throws(()=>B.pasteRange(empty,{schema:'kanade.clip.v1',duration:3840*501,events:[]},0),/上限/);
});
test('duplicating rests with note backups also regenerates dormant pitch IDs',()=>{
 let score=fixture(1),first=score.measures[0].events[0];first.lyric='歌';first.stemDirection='down';
 score=C.toggleNoteRest(score,first.id);
 let next=B.duplicateMeasures(freeze(score),0,0);
 assert.equal(next.measures.length,2);assert.notEqual(next.measures[0].id,next.measures[1].id);
 next=C.toggleNoteRest(next,next.measures[0].events[0].id);next=C.toggleNoteRest(next,next.measures[1].events[0].id);
 assert.deepEqual(C.validateScore(next),[]);assert.equal(next.measures[1].events[0].lyric,'歌');
 assert.notEqual(next.measures[0].events[0].pitches[0].id,next.measures[1].events[0].pitches[0].id);
});
test('measure insert/delete preserves surrounding data and leaves an editable bar when deleting everything',()=>{
 const score=freeze(fixture()),next=B.insertMeasures(score,1);
 assert.equal(next.measures.length,4);assert.equal(next.measures[0],score.measures[0]);assert.equal(next.measures[2],score.measures[1]);
 assert.deepEqual(B.removeMeasures(next,1,1),score);
 const empty=B.removeMeasures(score,0,2);assert.equal(empty.measures.length,1);assert.equal(empty.measures[0].events.length,0);
 assert.throws(()=>B.insertMeasures(score,0,500));
});

test('clipboard preserves concert pitch and rhythmic values across transposing staves',()=>{
 const source={...C.createScore(),transposition:'bb'};
 const note=C.makeNote({step:'D',octave:4,alter:0},8,1);
 note.pitches.push(C.normalPitch({step:'F',octave:4,alter:1}));
 source.measures[0].events.push(note);
 const clip=B.copyRange(source,0,C.durationTicks(8,1));
 for(const [transposition,step,octave] of [['concert','C',4],['f','G',4],['eb','A',4],['bbBass','D',5],['octaveUp','C',3]]){
  const target={...C.createScore(),transposition};
  const [placed]=B.pasteRange(target,clip,0).score.measures[0].events;
  assert.equal(placed.den,8);assert.equal(placed.dots,1);
  assert.equal(placed.pitches[0].step,step);assert.equal(placed.pitches[0].octave,octave);
  assert.deepEqual(placed.pitches.map(p=>C.pitchMidi(p)+C.soundingOffset(target)),note.pitches.map(p=>C.pitchMidi(p)+C.soundingOffset(source)));
  assert.notEqual(placed.pitches[0].id,note.pitches[0].id);
 }
 assert.throws(()=>B.pasteRange({...C.createScore(),clef:'percussion'},clip,0),/無音程打楽器/);
 const legacy={...clip};delete legacy.source;
 assert.equal(B.pasteRange(C.createScore(),legacy,0).score.measures[0].events[0].pitches[0].step,'D');
});

test('deleting a written rest closes its gap; clearing a bar keeps its identity and directions',()=>{
 const score=fixture(2),rest=C.makeRest(4);
 score.measures[0].events[1]=rest;
 score.measures[0].directions=[{key:'ff',tick:0}];
 const removed=C.deleteEvent(score,rest.id);
 assert.deepEqual(C.eventSpans(removed,0,false).map(span=>span.start),[0,960,1920]);
 const cleared=B.clearRange(removed,0,C.measureTicks(score.time));
 assert.deepEqual(cleared.measures[0].events,[]);
 assert.equal(cleared.measures[0].id,score.measures[0].id);
 assert.deepEqual(cleared.measures[0].directions,score.measures[0].directions);
 assert.equal(cleared.measures[1],score.measures[1]);
});

test('closing the gap during consecutive deletion advances the next event to the same position',()=>{
 const score=fixture(1);
 const first=score.measures[0].events[0],second=score.measures[0].events[1];
 const removed=C.deleteEvent(score,first.id,{closeGap:true});
 assert.equal(removed.measures[0].events[0].id,second.id);
 assert.equal(C.eventSpans(removed,0)[0].start,0);
 assert.equal(score.measures[0].events.length,4);
});
