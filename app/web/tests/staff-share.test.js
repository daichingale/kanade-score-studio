const test=require('node:test'),assert=require('node:assert/strict');
require('../src/symbols');
const C=require('../src/core');
const Mei=require('../src/verovio-mei');
const Ex=require('../src/musicxml');
require('../src/instruments');
require('../src/percussion');
require('../src/samples');
require('../src/notation');
const R=require('../src/renderer');
const Playback=require('../src/playback');
const Tools=require('../src/agent-tools');

function flute(name){
  const {staves,...seed}=C.createScore();
  return C.applyInstrumentStaves({...seed,instrument:name,instrumentKey:'flute',clef:'treble',sound:'フルート'},'flute');
}
function note(step,octave,den=4){return C.makeNote({step,octave,alter:0},den);}

test('a2 keeps the parts separate and collapses the score view',()=>{
  let upper=flute('フルート 1');
  let lower=flute('フルート 2');
  upper=C.insertEvent(upper,0,0,note('C',5)).score;
  lower=C.insertEvent(lower,0,0,note('C',5)).score;
  const before={...upper,ensembleParts:[lower]};
  const shared=C.shareParts(before,0);
  assert.notEqual(shared,before);
  assert.equal(shared.partUnions.length,1);
  assert.equal(C.scoreParts(shared)[0].measures[0].events[0].pitches[0].step,'C');
  assert.equal(C.scoreParts(shared)[1].measures[0].events[0].pitches[0].step,'C');
  const plan=C.planSharedStaff(upper.measures[0].events,lower.measures[0].events,C.barTicks(upper,0));
  assert.equal(plan.labels[0].text,'a2');
  assert.equal(plan.voice2,undefined);
  const splitLower=C.insertEvent(flute('フルート 2'),0,0,note('E',5)).score;
  const split=C.planSharedStaff(upper.measures[0].events,splitLower.measures[0].events,C.barTicks(upper,0));
  assert.equal(split.events[0].stemDirection,'up');
  assert.equal(split.voice2[0].stemDirection,'down');
  const solo=C.planSharedStaff(upper.measures[0].events,[],C.barTicks(upper,0));
  assert.equal(solo.labels[0].text,'1.');
  const onlyLower=C.planSharedStaff([],splitLower.measures[0].events,C.barTicks(upper,0));
  assert.equal(onlyLower.labels[0].text,'2.');
  const mei=Mei.meiForParts(C.scoreParts(shared),[],shared.partUnions).mei;
  assert.equal((mei.match(/<staffDef /g)||[]).length,1);
  assert.match(mei,/>a2</);
  const xml=Ex.musicXMLScore(C.scoreParts(shared),[]);
  assert.equal((xml.match(/<score-part /g)||[]).length,2);
  const cleared=C.unshareParts(shared,0);
  assert.equal(cleared.partUnions,undefined);
  const svg=R.engrave(C.scoreParts({...upper,ensembleParts:[splitLower]}),{partUnions:[{id:'u',start:0,end:1}],interactive:true}).join('');
  assert.equal((svg.match(/<g data-engraved-part="/g)||[]).length,1);
});

test('divisi text and a second voice on the lower grand staff round-trip',()=>{
  let score=C.createScore();
  const upper=C.insertEvent(C.staffScore(score,1),0,0,note('G',4)).score;
  score=C.mergeStaff(score,1,upper);
  let lower=C.insertEvent(C.staffScore(score,2),0,0,note('C',3)).score;
  const second=C.makeNote({step:'E',octave:3,alter:0});
  lower=C.mergeVoice(lower,2,C.insertEvent(C.voiceScore(lower,2),0,0,second).score);
  score=C.mergeStaff(score,2,lower);
  assert.ok(score.measures[0].staff2Voice.some(event=>event.type==='note'));
  assert.equal(C.validateScore(score).length,0);
  assert.deepEqual(C.divisiCues(score,2).map(cue=>cue.text),['div.']);
  const mei=Mei.meiForPart(score).mei;
  assert.match(mei,/<layer n="2">/);
  assert.match(mei,/>div\.</);
  const xml=Ex.musicXML(score);
  assert.match(xml,/<voice>4<\/voice>/);
  assert.match(xml,/<staff>2<\/staff>/);
  const played=Playback.compile([score]);
  assert.ok(played.events.length>=2);
  const viaTool=Tools.run({...flute('フルート 1'),ensembleParts:[flute('フルート 2')]},'shareParts',{on:true}).document;
  assert.equal(viaTool.partUnions[0].start,0);
});

test('grace notes, mid-score key and clef, pickup, and concert display',()=>{
  let score=flute('クラリネット');
  score={...score,transposition:'bb'};
  score=C.insertEvent(score,0,0,note('C',5)).score;
  const id=score.measures[0].events[0].id;
  score=C.changeEvent(score,id,event=>{
    event.graces=[C.normalPitch({step:'D',octave:5,alter:0})];
    event.articulations=['staccato'];
    return event;
  });
  score=C.addMeasure(score);
  score=C.setKeyChange(score,1,2);
  score=C.setClefChange(score,1,'alto',1);
  score=C.setPickup(C.setKeyChange(score,0,score.key),1);
  assert.equal(score.measures[0].pickup,true);
  assert.equal(C.keyAt(score,1),2);
  assert.equal(C.clefAt(score,1), 'alto');
  const mei=Mei.meiForPart(score).mei;
  assert.match(mei,/grace="unacc"/);
  assert.match(mei,/artic="stacc"/);
  assert.match(mei,/key\.sig="2s"/);
  assert.match(mei,/<clef shape="C" line="3"\/>/);
  const xml=Ex.musicXML(score);
  assert.match(xml,/<grace slash="yes"\/>/);
  assert.match(xml,/implicit="yes"/);
  assert.match(xml,/<fifths>2<\/fifths>/);
  const concert=C.soundingScore(score);
  assert.equal(concert.measures[0].events[0].pitches[0].step,'B');
  assert.equal(concert.key,-2);
  const broken=C.setBreak(score,1,'system');
  assert.equal(broken.measures[1].breakBefore,'system');
  const tempo=C.setTempoAt(score,1,72);
  assert.equal(C.tempoAt(tempo,1),72);
});
