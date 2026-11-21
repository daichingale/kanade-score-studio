const test=require('node:test');
const assert=require('node:assert/strict');
const Spark=require('../src/inspiration-spark.js');
const C=require('../src/core.js');
const B=require('../src/editing.js');

test('seeded roll is deterministic',()=>{
 const a=Spark.rollSpark(12345);
 const b=Spark.rollSpark(12345);
 assert.equal(a.mood,b.mood);
 assert.equal(a.tempo,b.tempo);
 assert.equal(a.progression.template,b.progression.template);
 assert.equal(a.motif.notes.length,b.motif.notes.length);
});

test('locks preserve fields on reroll',()=>{
 const first=Spark.rollSpark(7);
 const second=Spark.rollSpark(99,first,{tempo:true,progression:true,mood:false,key:false,rhythm:false,motif:false});
 assert.equal(second.tempo,first.tempo);
 assert.equal(second.progression.template,first.progression.template);
 assert.notEqual(second.key,undefined);
});

test('apply spark writes motif and chord symbols',()=>{
 const spark=Spark.rollSpark(42);
 const {document}=Spark.applySparkDocument(C.createScore(),spark,{from:1,part:1});
 const dirs=document.measures.flatMap(m=>m.directions||[]).filter(d=>d.key==='chordSymbol');
 assert.ok(dirs.length>=spark.bars);
 const notes=document.measures.flatMap(m=>m.events).filter(e=>e.type==='note');
 assert.ok(notes.length>=spark.motif.notes.length);
 assert.equal(document.tempo,spark.tempo);
});

test('variation retrograde preserves note count',()=>{
 const score=C.createScore();
 const note=C.makeNote({step:'C',octave:4,alter:0},4,0);
 const placed=C.placeEventsAt(score,0,0,[note],{}).score;
 const note2=C.makeNote({step:'D',octave:4,alter:0},4,0);
 const withTwo=C.placeEventsAt(placed,0,C.WHOLE/4,[note2],{}).score;
 const frag=Spark.fragmentFromRange(withTwo,0,C.WHOLE/2);
 const cards=Spark.variationDescriptors(frag);
 const retro=cards.find(c=>c.id==='retrograde');
 assert.ok(retro);
 assert.equal(retro.fragment.length,frag.length);
});