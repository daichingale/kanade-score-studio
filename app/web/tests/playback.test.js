const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),P=require('../src/playback.js'),A=require('../src/arrangement.js');
const note=(step,den=4,marks)=>({...C.makeNote({step,octave:4,alter:0},den),...(marks?{articulations:marks}:{})});
test('both voices share dynamics and a crescendo changes the level during a tied note',()=>{
  const score=C.createScore(),first=note('C',1),second=note('C',2);
  score.measures=[
    {id:C.uid(),events:[{...first,tieStart:true}],voice2:[note('E',1)],
      directions:[{key:'p',tick:0},{key:'crescendo',tick:480,end:960}]},
    {id:C.uid(),events:[{...second,tieStop:true}]}
  ];
  const plan=P.region(P.compile([score]),{rate:.5,from:0,to:4800});
  assert.equal(plan.events.length,2);
  assert.equal(plan.soundingTracks,1);
  assert.ok(plan.events.every(event=>event.part===score.id));
  const [held,secondary]=plan.events;
  assert.ok(held.duration>secondary.duration);
  assert.equal(held.curve[0].level,.58);
  assert.ok(held.curve.at(-1).level>.8);
  assert.ok(secondary.curve.at(-1).level>.8);
});
test('a loop clips time without changing pitch and progress maps performed measures to the score',()=>{
  const score=C.createScore();
  for(let mi=0;mi<3;mi++)score.measures[mi]={id:C.uid(),events:[note(['C','D','E'][mi],1)]};
  const marked=A.markRepeat(score,0,1),tracks=A.playback([marked]),measureMap=A.playbackOrder(marked);
  assert.deepEqual(measureMap,[0,1,0,1,2]);
  const plan=P.region(P.compile(tracks),{from:3840*2+960,to:3840*3,rate:.5,measureMap,revision:3});
  assert.equal(plan.events.length,1);
  assert.equal(plan.events[0].time,0);
  assert.equal(plan.events[0].pitches[0].step,'C');
  const pos=P.position(plan,0);
  assert.deepEqual({bar:pos.measure,tick:pos.tick,revision:pos.revision},{bar:0,tick:960,revision:3});
});
test('a dynamic at the next onset leaves the previous note level in place, and staccatissimo shortens the note',()=>{
  const score=C.createScore(),bar=score.measures[0];
  bar.events=[note('C'),note('D',4,['staccatissimo'])];
  bar.directions=[{key:'f',tick:0},{key:'p',tick:960},{key:'sfz',tick:960}];
  const plan=P.region(P.compile([score]));
  assert.equal(plan.events[0].curve.at(-1).level,1.22);
  assert.equal(plan.events[1].curve[0].level,.58);
  assert.ok(plan.events[1].emphasis>1.5);
  assert.ok(plan.events[1].duration<plan.events[0].duration/2);
});
