const test=require('node:test'),assert=require('node:assert/strict');
require('../src/core');
require('../src/omr-align');

const A=global.KanadeOmrAlign;

test('ground truth self-align yields F1=1',()=>{
  const truth=[{mi:0,tick:0,pitch:{step:'C',octave:4,alter:0},den:4,dots:0},{mi:0,tick:480,rest:true,den:4,dots:0}];
  const m=A.align(truth,truth,{barTicks:1920});
  assert.equal(m.f1,1);
  assert.equal(m.pitchAcc,1);
  assert.equal(m.durationAcc,1);
});

test('align F1 counts pitch+duration matches with tick tolerance',()=>{
  const truth=[{mi:0,tick:0,pitch:{step:'E',octave:4,alter:0},den:4,dots:0},{mi:0,tick:480,pitch:{step:'F',octave:4,alter:0},den:4,dots:0}];
  const rec=[{mi:0,tick:40,pitch:{step:'E',octave:4,alter:0},den:4,dots:0},{mi:0,tick:520,pitch:{step:'F',octave:4,alter:0},den:4,dots:0}];
  const m=A.align(truth,rec,{barTicks:1920,tickTol:120});
  assert.equal(m.tp,2);
  assert.ok(m.f1>0.9);
});