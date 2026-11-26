const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/performance');
require('../src/omr-image');
require('../src/omr-staff');
require('../src/omr-glyphs');
require('../src/omr-priors');
require('../src/omr-classic');
require('../src/omr-fixture-render');
require('../src/omr-recognize');

const O=global.KanadeOMR,F=global.KanadeOmrFixture;

function buildScore(){
  const score={...C.createScore(),tempo:100};
  score.measures[0].events.push(
    C.makeNote({step:'E',octave:4,alter:0},4),
    C.makeNote({step:'F',octave:4,alter:0},4),
    C.makeNote({step:'G',octave:4,alter:0},4),
    C.makeNote({step:'A',octave:4,alter:0},4)
  );
  if(!score.measures[1])score.measures.push({id:C.uid(),events:[]});
  score.measures[1].events.push(C.makeNote({step:'B',octave:4,alter:0},4));
  return score;
}

test('OMR v2 reads synthetic engraved bitmap',()=>{
  const truth=buildScore();
  const image=F.renderScoreBitmap(truth,{width:720,height:220,measuresOnImage:2});
  const result=O.recognizeRGBA(image,{time:truth.time});
  assert.ok(result.notes.length>=3);
  const score=O.scoreFromNotes(result.notes,{title:'Synth',time:truth.time});
  assert.equal(C.validateScore(score).length,0);
});

test('OMR binarize sauvola finds ink on synthetic fixture',()=>{
  const image=F.renderScoreBitmap(buildScore());
  const gray=global.KanadeOmrImage.bitmapFromRGBA(image);
  const binary=global.KanadeOmrImage.sauvola(gray,{window:21});
  let ink=0;
  for(const v of binary.data)if(v)ink++;
  assert.ok(ink>80);
});