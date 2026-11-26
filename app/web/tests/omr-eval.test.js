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
require('../src/omr-ml-masks');
require('../src/musicxml-import');
require('../src/omr-router');

const Eval=global.KanadeOmrEval;
const F=global.KanadeOmrFixture;
const Classic=global.KanadeOmrClassic;
const O=global.KanadeOMR;
const Masks=global.KanadeOmrMlMasks;

function buildMelody(){
  const score={...C.createScore(),time:{num:4,den:4}};
  const notes=['E','F','G','A','B','C','D','E'].map((step,i)=>
    C.makeNote({step,octave:i>=5?5:4,alter:0},4));
  score.measures[0].events=notes.slice(0,4);
  score.measures.push({id:C.uid(),events:notes.slice(4)});
  return score;
}

function metrics(truth,notes){
  return {...Eval.compareTruth(truth,notes),recognized:notes.length,sample:truth.length};
}

test('OMR evaluation matrix: v1 / v2 / ml-masks / pc-upper-bound',()=>{
  const cases=[
    {name:'scale',score:buildMelody(),opts:{noise:0.01}},
    {name:'durations',score:F.buildDurationMix(),opts:{noise:0.008}},
    {name:'accidentals',score:F.buildAccidentalMelody(),opts:{noise:0.01,blur:1}},
    {name:'two-measure',score:F.buildTwoStaffMelody(),opts:{noise:0.01}}
  ];
  const report={};
  const barTicks=C.TPQ*4;
  for(const item of cases){
    const truth=F.groundTruth(item.score);
    let image=F.renderScoreBitmap(item.score,{width:880,height:260,measuresOnImage:item.score.measures.length,...item.opts});
    if(item.opts.blur)image=F.blurBitmap(image,item.opts.blur);
    let v1Notes=[];
    try{v1Notes=Classic.recognizeLegacy(image).notes;}catch{v1Notes=[];}
    const v1=metrics(truth,v1Notes);
    let v2Notes=[];
    try{v2Notes=O.recognizeRGBA(image,{time:item.score.time}).notes;}catch{v2Notes=[];}
    const v2=metrics(truth,v2Notes);
    const ml=metrics(truth,Masks.recognizeFromSyntheticMl(image,truth).notes);
    const pcNotes=truth.map(note=>({tick:note.mi*barTicks+note.tick,pitch:note.pitch,den:note.den,dots:note.dots||0}));
    const pc=metrics(truth,pcNotes);
    report[item.name]={v1,v2,ml,pc};
    assert.ok(v2.pitchHits>=v1.pitchHits-1,`${item.name} pitchHits`);
    assert.ok(ml.pitch>=v2.pitch-0.2,`${item.name} ml pitch`);
    assert.equal(pc.pitch,1,`${item.name} pc`);
  }
  global.__kanadeOmrEvalReport=report;
});

test('OMR v2 reads synthetic engraved bitmap',()=>{
  const score=buildMelody();
  const image=F.renderScoreBitmap(score,{width:720,height:220,measuresOnImage:2});
  const result=O.recognizeRGBA(image,{time:score.time});
  assert.ok(result.notes.length>=3);
  const scoreOut=O.scoreFromNotes(result.notes,{title:'Synth',time:score.time});
  assert.equal(C.validateScore(scoreOut).length,0);
});