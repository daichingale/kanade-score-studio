const test=require('node:test'),assert=require('node:assert/strict');
require('../src/core');
require('../src/omr-musicxml-post');

test('rhythmic snap fills small gap at bar end',()=>{
  const C=global.KanadeCore;
  const score=C.createScore();
  score.measures[0].events=[
    C.makeNote({step:'C',octave:4,alter:0},4),
    C.makeNote({step:'D',octave:4,alter:0},4),
    C.makeNote({step:'E',octave:4,alter:0},4)
  ];
  global.KanadeMusicXmlPost.applyPostCorrections(score);
  assert.equal(C.usedTicks(score.measures[0]),C.TPQ*4);
});

test('align categorize splits pitch vs duration errors',()=>{
  require('../src/omr-align');
  const truth=[{mi:0,tick:0,pitch:{step:'C',octave:4,alter:0},den:4,dots:0}];
  const pred=[{mi:0,tick:0,pitch:{step:'D',octave:4,alter:0},den:4,dots:0}];
  const cat=global.KanadeOmrAlign.categorize(truth,pred);
  assert.equal(cat.pitch,1);
  assert.equal(cat.duration,0);
});