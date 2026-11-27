const test=require('node:test'),assert=require('node:assert/strict');
const {DOMParser}=require('linkedom');
global.DOMParser=DOMParser;
require('../src/symbols');
const C=require('../src/core');
const Mei=require('../src/verovio-mei');
const Ex=require('../src/musicxml');
require('../src/instruments');
require('../src/percussion');
require('../src/samples');
require('../src/musicxml-import');
const Playback=require('../src/playback');
const Import=global.KanadeMusicXMLImport;

function soloFlute(){
  const {staves,...seed}=C.createScore();
  return C.applyInstrumentStaves({...seed,instrument:'フルート',instrumentKey:'flute',clef:'treble',sound:'フルート'},'flute');
}

test('createScore defaults piano to a grand staff and old single-staff parts stay valid',()=>{
  const piano=C.createScore();
  assert.equal(C.isGrandStaff(piano),true);
  assert.deepEqual(C.partStaves(piano).map(entry=>entry.clef),['treble','bass']);
  assert.equal(C.validateScore(piano).length,0);
  const legacy={schema:'kanade.web.v1',id:'legacy',title:'旧',composer:'',instrument:'フルート',clef:'treble',
    time:{num:4,den:4},key:0,tempo:100,measures:[{id:'m1',events:[]}]};
  assert.equal(C.isGrandStaff(legacy),false);
  assert.equal(C.validateScore(legacy).length,0);
  assert.equal(C.migrateDocument(legacy),legacy);
});

test('setGrandStaff splits and merges by middle C and is undoable via immutable scores',()=>{
  let score=soloFlute();
  score=C.insertEvent(score,0,0,C.makeNote({step:'E',octave:4,alter:0})).score;
  score=C.insertEvent(score,0,1,C.makeNote({step:'C',octave:3,alter:0})).score;
  const before=score;
  const grand=C.setGrandStaff(score,true);
  assert.notEqual(grand,before);
  assert.equal(C.isGrandStaff(grand),true);
  assert.equal(grand.measures[0].events[0].pitches[0].octave,4);
  assert.equal(grand.measures[0].staff2[0].pitches[0].octave,3);
  assert.equal(before.measures[0].staff2,undefined);
  const back=C.setGrandStaff(grand,false);
  assert.equal(C.isGrandStaff(back),false);
  assert.equal(back.measures[0].events.filter(event=>event.type==='note').length,2);
  assert.equal(C.validateScore(grand).length,0);
  assert.equal(C.validateScore(back).length,0);
});

test('MEI emits brace, bar.thru, and both staves for a grand staff part',()=>{
  let score=C.createScore();
  score=C.mergeStaff(score,1,C.insertEvent(C.staffScore(score,1),0,0,C.makeNote({step:'G',octave:4,alter:0})).score);
  score=C.mergeStaff(score,2,C.insertEvent(C.staffScore(score,2),0,0,C.makeNote({step:'C',octave:3,alter:0})).score);
  const built=Mei.meiForPart(score);
  assert.match(built.mei,/symbol="brace"/);
  assert.match(built.mei,/bar\.thru="true"/);
  assert.match(built.mei,/<staff n="1">/);
  assert.match(built.mei,/<staff n="2">/);
  assert.match(built.mei,/clef\.shape="G"/);
  assert.match(built.mei,/clef\.shape="F"/);
  assert.equal(built.slots.length,2);
  assert.ok(built.entries.some(entry=>entry.staff===1));
  assert.ok(built.entries.some(entry=>entry.staff===2));
});

test('MusicXML round-trips a grand staff with staves=2 and staff tags',()=>{
  let score=C.createScore();
  score=C.mergeStaff(score,1,C.insertEvent(C.staffScore(score,1),0,0,C.makeNote({step:'C',octave:5,alter:0})).score);
  score=C.mergeStaff(score,2,C.insertEvent(C.staffScore(score,2),0,0,C.makeNote({step:'C',octave:3,alter:0})).score);
  const xml=Ex.musicXML(score);
  assert.match(xml,/<staves>2<\/staves>/);
  assert.match(xml,/<clef number="1">/);
  assert.match(xml,/<clef number="2">/);
  assert.match(xml,/<staff>1<\/staff>/);
  assert.match(xml,/<staff>2<\/staff>/);
  const imported=Import.parse(xml);
  assert.equal(C.isGrandStaff(imported.score),true);
  assert.equal(imported.score.ensembleParts,undefined);
  assert.ok(imported.score.measures[0].events.some(event=>event.type==='note'));
  assert.ok(imported.score.measures[0].staff2.some(event=>event.type==='note'));
});

test('staff groups store bracket metadata and appear in MEI and MusicXML',()=>{
  const flute=soloFlute(),oboe={...soloFlute(),id:C.uid(),instrument:'オーボエ',instrumentKey:'oboe',sound:'オーボエ'};
  const doc={...flute,ensembleParts:[oboe]};
  const grouped=C.groupParts(doc,0,1,'bracket');
  assert.equal(grouped.staffGroups.length,1);
  assert.equal(grouped.staffGroups[0].symbol,'bracket');
  const mei=Mei.meiForParts(C.scoreParts(grouped),grouped.staffGroups).mei;
  assert.match(mei,/symbol="bracket"/);
  const xml=Ex.musicXMLScore(C.scoreParts(grouped),grouped.staffGroups);
  assert.match(xml,/<part-group type="start"/);
  assert.match(xml,/<group-symbol>bracket<\/group-symbol>/);
  assert.match(xml,/<part-group type="stop"/);
  const cleared=C.ungroupParts(grouped,0,1);
  assert.equal(cleared.staffGroups,undefined);
});

test('playback includes both staves of a grand staff on the same instrument',()=>{
  let score=C.createScore();
  score=C.mergeStaff(score,1,C.insertEvent(C.staffScore(score,1),0,0,C.makeNote({step:'C',octave:5,alter:0})).score);
  score=C.mergeStaff(score,2,C.insertEvent(C.staffScore(score,2),0,0,C.makeNote({step:'C',octave:3,alter:0})).score);
  const compiled=Playback.compile([score]);
  assert.equal(compiled.events.length,2);
  assert.ok(compiled.events.every(event=>event.instrument===C.soundName(score)));
});

test('measure add keeps both staves aligned through replaceScorePart',()=>{
  let doc=C.createScore();
  const flute={...soloFlute(),id:C.uid(),title:doc.title,composer:doc.composer,tempo:doc.tempo,time:doc.time};
  doc={...doc,ensembleParts:[flute]};
  doc=C.mergeStaff(doc,2,C.insertEvent(C.staffScore(doc,2),0,0,C.makeNote({step:'G',octave:2,alter:0})).score);
  const next=C.addMeasure(doc);
  const replaced=C.replaceScorePart(doc,0,next);
  assert.equal(replaced.measures.length,2);
  assert.equal(replaced.ensembleParts[0].measures.length,2);
  assert.ok(replaced.measures[0].staff2?.length);
  assert.equal(replaced.measures[1].staff2,undefined);
});
