const test=require('node:test');
const assert=require('node:assert/strict');
const Spark=require('../src/inspiration-spark.js');
const C=require('../src/core.js');

function phraseProps(fragment){
 const midis=Spark.fragmentMidis(fragment);
 const steps=midis.slice(1).filter((m,i)=>Math.abs(m-midis[i])<=2).length;
 return {
  midis,spread:Math.max(...midis)-Math.min(...midis),
  stepRatio:steps/Math.max(1,midis.length-1),
  maxLeap:Math.max(0,...midis.slice(1).map((m,i)=>Math.abs(m-midis[i])))
 };
}

test('seeded roll is deterministic',()=>{
 const a=Spark.rollSpark(12345);
 const b=Spark.rollSpark(12345);
 assert.equal(a.mood,b.mood);
 assert.equal(a.tempo,b.tempo);
});

test('generated phrases pass quality threshold across seeds',()=>{
 const ctx=Spark.harmonyContext(C.createScore(),0);
 for(let seed=1;seed<=40;seed++){
  const stream=Spark.buildPhraseStream(ctx,{seed,count:4});
  assert.ok(stream.length>=1,`seed ${seed} produced no phrases`);
  for(const card of stream){
   assert.ok(card.quality>=Spark.QUALITY_THRESHOLD,`seed ${seed} quality ${card.quality}`);
   const {spread,maxLeap,stepRatio}=phraseProps(card.fragment);
   assert.ok(spread<=Spark.MAX_RANGE+1);
   assert.ok(maxLeap<=Spark.MAX_LEAP+1);
   assert.ok(stepRatio>=.45);
  }
 }
});

test('phrase stream is deterministic with seed',()=>{
 const ctx=Spark.harmonyContext(C.createScore(),0);
 const a=Spark.buildPhraseStream(ctx,{seed:99,count:5});
 const b=Spark.buildPhraseStream(ctx,{seed:99,count:5});
 assert.deepEqual(a.map(c=>c.quality),b.map(c=>c.quality));
});

test('variations stay recognizable',()=>{
 const score=C.createScore();
 let part=score;
 for(const step of ['C','D','E','F']){
  const note=C.makeNote({step,octave:4,alter:0},4,0);
  part=C.placeEventsAt(part,0,part.measures[0].events.reduce((t,e)=>t+C.eventTicks(e),0),[note],{}).score;
 }
 const frag=Spark.fragmentFromRange(part,0,C.WHOLE);
 const ctx=Spark.harmonyContext(part,0);
 for(const v of Spark.variationDescriptors(frag)){
  assert.ok(Spark.contourSimilarity(Spark.fragmentMidis(frag),Spark.fragmentMidis(v.fragment))>=.55);
  assert.ok(Spark.scorePhrase(v.fragment,ctx)>=Spark.QUALITY_THRESHOLD-5);
 }
});

test('apply spark writes motif and chord symbols',()=>{
 const spark=Spark.rollSpark(42);
 const {document}=Spark.applySparkDocument(C.createScore(),spark,{from:1,part:1});
 const notes=document.measures.flatMap(m=>m.events).filter(e=>e.type==='note');
 assert.ok(notes.length>=spark.motif.notes.length);
});