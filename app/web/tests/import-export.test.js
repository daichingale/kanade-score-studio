const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/symbols');
require('../src/arrangement');
require('../src/playback');
require('../src/musicxml');
require('../src/midi-export');
require('../src/omr-recognize');
require('../src/import-export');

const O=global.KanadeOMR;
const X=global.KanadeImportExport;

function syntheticNotes(){
  return [
    {den:4,dots:0,pitch:{step:'C',octave:4,alter:0}},
    {den:4,dots:0,pitch:{step:'D',octave:4,alter:0}},
    {den:4,dots:0,pitch:{step:'E',octave:4,alter:0}}
  ];
}

test('OMR reviewed score exports to MIDI and MusicXML',async()=>{
  const score=O.scoreFromNotes(syntheticNotes(),{title:'Export Probe',tempo:110});
  const midi=X.packageScore(score,'midi');
  const xml=X.packageScore(score,'musicxml');
  const midiBytes=Buffer.from(await midi.blob.arrayBuffer());
  assert.equal(midiBytes.toString('ascii',0,4),'MThd');
  assert.match(String(xml.blob),/<score-partwise/);
  assert.match(midi.filename,/Export Probe\.mid$/);
  assert.match(xml.filename,/Export Probe\.musicxml$/);
});

test('import export rejects invalid score',()=>{
  const broken=C.createScore();
  broken.measures[0].events.push({id:'x',type:'note',den:99,dots:0,pitches:[C.normalPitch({step:'C',octave:4,alter:0})]});
  assert.throws(()=>X.packageScore(broken,'midi'),/音価|使用できない|不正/);
});