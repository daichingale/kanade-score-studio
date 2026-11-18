const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),M=require('../src/piano-roll.js'),A=require('../src/arrangement.js');

test('the piano roll edits either score voice and builds or changes individual chord tones',()=>{
  const initial=C.addMeasure(C.createScore()),data=M.read(initial,1);
  const inserted=M.insert(data,C.TPQ,60,C.TPQ).part;
  const chord=M.insert(M.read(inserted,1),C.TPQ,64,C.TPQ).part;
  const roll=M.read(chord,1),group=roll.groups[0];
  assert.deepEqual(group.pitches.map(C.pitchMidi),[60,64]);
  const changed=M.changePitch(roll,group,64,65);
  assert.deepEqual(M.read(changed,1).groups[0].pitches.map(C.pitchMidi),[60,65]);
  const lower=M.insert(M.read(changed,2),C.TPQ,55,C.TPQ*2).part;
  assert.deepEqual(M.read(lower,2).groups[0].pitches.map(C.pitchMidi),[55]);
  assert.equal(lower.measures[0].events,changed.measures[0].events);
  assert.deepEqual(C.validateScore(lower),[]);
});
test('dragging across the barline produces standard ties and overlapping entries are atomic',()=>{
  const initial=C.addMeasure(C.createScore());
  const original=M.insert(M.read(initial,1),C.TPQ,60,C.TPQ*2).part;
  const model=M.read(original,1),note=model.groups[0];
  const move=M.changeTime(model,note,C.TPQ*3,C.TPQ*2,60,62);
  const chain=M.read(move.part,1).groups[0];
  assert.equal(chain.start,C.TPQ*3);assert.equal(chain.end,C.TPQ*5);
  assert.equal(chain.events.length,2);
  assert.deepEqual(chain.events.map(event=>C.pitchMidi(event.pitches[0])),[62,62]);
  assert.equal(chain.events[0].tieStart,true);assert.equal(chain.events[1].tieStop,true);
  const next=M.insert(M.read(move.part,1),C.TPQ*6,66,C.TPQ).part;
  const moved=M.read(next,1);
  assert.throws(()=>M.changeTime(moved,moved.groups[0],C.TPQ*5+C.TPQ/2,C.TPQ*2,62,62),/重なる/);
  assert.equal(M.read(next,1).groups[1].start,C.TPQ*6);
});
test('transient measure copy supports longer selections with no saved clip, preserving all parts',()=>{
  let score=C.createScore();for(let i=0;i<35;i++)score=C.addMeasure(score);
  const secondary={...structuredClone(score),id:C.uid(),instrument:'トロンボーン',
    measures:score.measures.map(bar=>({...bar,id:C.uid()}))};
  const document={...score,ensembleParts:[secondary]};
  const indexes=Array.from({length:33},(_,index)=>32-index);
  assert.throws(()=>A.capture(document,indexes,'fragment'),/32/);
  const clip=A.capture(document,indexes,'copy',{transient:true});
  const arranged=A.insert(document,clip,0);
  assert.equal(arranged.measures.length,69);
  assert.equal(arranged.ensembleParts[0].measures.length,69);
  assert.equal(arranged.clipBank,undefined);
});

test('duplicate copies only the selected chord tone to the next free position across the last bar',()=>{
 const score=C.createScore(),a=M.insert(M.read(score,2),3*C.TPQ,60,C.TPQ).part;
 const b=M.insert(M.read(a,2),3*C.TPQ,64,C.TPQ).part,data=M.read(b,2);
 const duplicate=M.duplicate(data,data.groups[0],64);
 const after=M.read(duplicate.part,2);
 assert.equal(duplicate.start,4*C.TPQ);
 assert.deepEqual(after.groups.map(group=>group.pitches.map(C.pitchMidi)),[[60,64],[64]]);
 assert.equal(duplicate.part.measures.length,2);
 assert.deepEqual(duplicate.part.measures[1].events,[]);
 assert.notEqual(after.groups[0].pitches[1].id,after.groups[1].pitches[0].id);
 assert.deepEqual(C.validateScore(duplicate.part),[]);
});

test('paste preserves concert pitch, splits notes across bars and protects existing notes',()=>{
 const source=M.insert(M.read(C.createScore(),1),0,60,2*C.TPQ).part;
 const data=M.read(source,1),fragment=M.copyNote(data,data.groups[0],60);
 const target=M.read({...C.createScore(),transposition:'bb'},1);
 const paste=M.pasteNotes(target,fragment,3*C.TPQ);
 const [group]=M.read(paste.part,1).groups;
 assert.equal(paste.midi,62);assert.equal(group.end,5*C.TPQ);assert.equal(group.events.length,2);
 assert.throws(()=>M.pasteNotes(data,fragment,0),/空いている/);
});

test('copying a single tuplet note keeps its beat position within the tuplet',()=>{
 const score=C.createScore(),note=step=>C.makeNote({step,octave:4,alter:0},8);
 const triplet=C.placeTuplet(score,0,0,8,3,['C','D','E'].map(note)).score;
 const data=M.read(triplet,1),fragment=M.copyNote(data,data.groups[1],62);
 const result=M.pasteNotes(data,fragment,C.TPQ);
 assert.equal(result.start,C.TPQ+C.TPQ/3);
 assert.deepEqual(result.part.measures[0].events.slice(3).map(event=>event.type),['rest','note','rest']);
});
