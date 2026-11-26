const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/symbols');
require('../src/arrangement');
require('../src/playback');
require('../src/performance');
require('../src/samples');
require('../src/instruments');
require('../src/percussion');
require('../src/musicxml');
require('../src/midi-export');
require('../src/midi-import');

test('MIDI import reads exported single-part notes',async()=>{
  let score={...C.createScore(),title:'Roundtrip',tempo:120};
  score.measures[0].events.push(C.makeNote({step:'C',octave:4,alter:0},4));
  score.measures[0].events.push(C.makeRest(4));
  score.measures[0].events.push(C.makeNote({step:'E',octave:4,alter:0},8));
  const file=await global.KanadeMIDIExport.encode([score]);
  const bytes=Buffer.from(await file.arrayBuffer());
  const {score:imported,warnings}=global.KanadeMIDIImport.parse(bytes);
  assert.ok(imported.measures[0].events.length>=2);
  assert.match(imported.title,/Roundtrip|読み込んだ/);
  assert.ok(warnings.length);
  assert.equal(C.validateScore(imported).length,0);
});

test('MIDI import rejects non-MIDI bytes',()=>{
  assert.throws(()=>global.KanadeMIDIImport.parse(Uint8Array.of(0,1,2,3)),/MIDI/);
});