const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/performance');
require('../src/omr-image');
require('../src/omr-staff');
require('../src/omr-glyphs');
require('../src/omr-priors');
require('../src/omr-classic');
require('../src/omr-fixture-render');
require('../src/omr-eval');
require('../src/omr-recognize');

const Eval=global.KanadeOmrEval;
const F=global.KanadeOmrFixture;
const Classic=global.KanadeOmrClassic;
const O=global.KanadeOMR;

function buildMelody(){
  const score={...C.createScore(),time:{num:4,den:4}};
  const notes=['E','F','G','A','B','C','D','E'].map((step,i)=>
    C.makeNote({step,octave:i>=5?5:4,alter:0},4));
  score.measures[0].events=notes.slice(0,5);
  score.measures.push({id:C.uid(),events:notes.slice(5)});
  return score;
}

function evaluate(name,recognize,score,opts={}){
  const truth=F.groundTruth(score);
  const image=F.renderScoreBitmap(score,{width:880,height:240,measuresOnImage:score.measures.length,...opts});
  const result=recognize(image,{time:score.time});
  const metrics=Eval.compareTruth(truth,result.notes);
  return {name,...metrics};
}

test('OMR evaluation: v1 vs v2 on synthetic scale melody',()=>{
  const score=buildMelody();
  const v1=evaluate('v1',(img,ctx)=>Classic.recognizeLegacy(img),score,{noise:0.008});
  const v2=evaluate('v2',(img,ctx)=>O.recognizeRGBA(img,ctx),score,{noise:0.008});
  assert.ok(v2.pitchHits>=v1.pitchHits,`pitchHits v2=${v2.pitchHits} v1=${v1.pitchHits}`);
  assert.ok(v2.pitch>=v1.pitch-0.05,`pitch ratio v2=${v2.pitch} v1=${v1.pitch}`);
  assert.ok(v2.recognized<=v1.recognized+6,`v2 noise v2=${v2.recognized} v1=${v1.recognized}`);
  global.__kanadeOmrEvalReport={v1,v2,fixture:'synthetic-2bar-scale-noise'};
});

test('OMR v2 reports gracefully on rotated synthetic fixture',()=>{
  const score=buildMelody();
  const image=F.renderScoreBitmap(score,{width:880,height:240,rotationDeg:1});
  try{
    const result=O.recognizeRGBA(image,{time:score.time});
    assert.ok(result.notes.length>=2);
  }catch(error){
    assert.match(error.message,/五線|音符/);
  }
});