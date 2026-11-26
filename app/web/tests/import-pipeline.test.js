const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/symbols');
require('../src/musicxml-import');
require('../src/musicxml-container');
require('../src/arrangement');
require('../src/playback');
require('../src/performance');
require('../src/samples');
require('../src/instruments');
require('../src/midi-export');
require('../src/midi-import');
require('../src/import-pipeline');

const P=global.KanadeImportPipeline;

test('import pipeline detects file kinds',()=>{
  assert.equal(P.kindFromName('a.musicxml'),P.kinds.musicxml);
  assert.equal(P.kindFromName('b.mxl'),P.kinds.mxl);
  assert.equal(P.kindFromName('c.mid'),P.kinds.midi);
  assert.equal(P.kindFromName('d.kanade.json'),P.kinds.kanade);
  assert.equal(P.kindFromName('scan.png'),P.kinds.image);
  assert.equal(P.kindFromName('scan.pdf'),P.kinds.pdf);
});

test('import pipeline parses Kanade JSON payloads',async()=>{
  const score=C.createScore();
  const file={name:'demo.kanade.json',async text(){return JSON.stringify(score);}};
  const parsed=await P.readFile(file);
  assert.equal(parsed.kind,P.kinds.kanade);
  assert.equal(parsed.score.title,score.title);
});