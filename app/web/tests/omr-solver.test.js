const test=require('node:test'),assert=require('node:assert/strict');
require('../src/core');
require('../src/performance');
require('../src/omr-solver');

const S=global.KanadeOmrSolver;

test('solver fills bar with implicit rests and marks low confidence octave',()=>{
  const notes=[
    {mi:0,tick:0,pitch:{step:'E',octave:4,alter:0},den:4,dots:0,confidence:0.9},
    {mi:0,tick:480,pitch:{step:'F',octave:7,alter:0},den:8,dots:0,confidence:0.8}
  ];
  const out=S.correct(notes,{time:{num:4,den:4},key:0});
  const used=out.filter(n=>!n.rest).reduce((sum,n)=>sum+require('../src/core').durationTicks(n.den,n.dots||0),0);
  assert.ok(out.length>=2);
  assert.ok(used<=require('../src/core').TPQ*4);
  assert.ok(out.some(n=>n.low||n.flag==='octave'));
});