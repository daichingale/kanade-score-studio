const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const R=require('../src/renderer.js');
function pitch(step='E',octave=4){return {step,alter:0,octave};}

test('click-placement fills the time BEFORE a note, without shifting its original beat',()=>{
  let score=C.createScore();
  const later=C.makeNote(pitch('G'),4);
  score=C.placeEventAt(score,0,1920,later).score;
  assert.equal(C.eventSpans(score,0,false).find(s=>s.event.id===later.id).start,1920);
  const first=C.makeNote(pitch('E'),4);
  score=C.placeEventAt(score,0,0,first).score;
  const spans=C.eventSpans(score,0,false);
  assert.equal(spans.find(s=>s.event.id===first.id).start,0);
  assert.equal(spans.find(s=>s.event.id===later.id).start,1920);
  assert.equal(spans.find(s=>s.event.id===later.id).end,2880);
  assert.equal(C.validateScore(score).length,0);
});
test('replacing part of a rest maintains total measure positions',()=>{
  let score=C.createScore(); const r=C.makeRest(2);
  score=C.insertEvent(score,0,0,r).score;
  const n=C.makeNote(pitch('C'),8);
  score=C.placeEventAt(score,0,480,n).score;
  assert.deepEqual(C.eventSpans(score,0,false).map(s=>s.start),[0,480,960]);
  assert.equal(C.usedTicks(score.measures[0]),1920);
  assert.equal(C.validateScore(score).length,0);
});
test('placing on top of an existing note is prohibited without moving original',()=>{
  let score=C.createScore(); const n=C.makeNote(pitch(),2);
  score=C.placeEventAt(score,0,0,n).score;
  const baseline=JSON.stringify(score);
  assert.equal(C.canPlaceAt(score,0,960,4),false);
  assert.throws(()=>C.placeEventAt(score,0,960,C.makeNote(pitch('G'),4)),/重なる/);
  assert.equal(JSON.stringify(score),baseline);
});
test('doubly dotted 64th permits exact implicit rest fill',()=>{
  let score=C.createScore();score=C.placeEventAt(score,0,0,C.makeNote(pitch(),64,2)).score;
  assert.equal(C.eventsWithRests(score.measures[0],score.time).reduce((a,e)=>a+C.durationTicks(e.den,e.dots),0),3840);
  assert.equal(C.validateScore(score).length,0);
});
test('duration name and ghost reflect actual selected value',()=>{
  const score=C.createScore();
  assert.equal(R.durationName(4,0),'4分音符');
  assert.equal(R.durationName(16,1),'付点16分音符');
  const g=R.measureGeometry(score,0);
  const hit=R.hitTest(score,g.notesStart+(480/g.cap)*g.usable,g.top+48,8,0);
  assert.ok(hit);assert.equal(hit.mi,0);assert.equal(hit.step,'E');
  assert.equal(hit.octave,4);assert.equal(hit.tick,480);
  const ghost=R.ghostMarkup(score,hit,16,1);
  assert.match(ghost,/付点16分音符/);assert.match(ghost,/opacity="0.46"/);
  assert.match(R.toolGlyph(8),/<svg/);
});
test('changing selected duration does not move following notes',()=>{
  let score=C.createScore(),a=C.makeNote(pitch('C'),4),b=C.makeNote(pitch('G'),4);
  score=C.placeEventAt(score,0,0,a).score;
  score=C.placeEventAt(score,0,1920,b).score;
  score=C.changeDuration(score,a.id,8);
  assert.equal(C.eventSpans(score,0,false).find(s=>s.event.id===b.id).start,1920);
  score=C.changeDuration(score,a.id,2);
  assert.equal(C.eventSpans(score,0,false).find(s=>s.event.id===b.id).start,1920);
  assert.throws(()=>C.changeDuration(score,a.id,1),/重なる/);
});
