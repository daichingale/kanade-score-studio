const test=require('node:test');
const assert=require('node:assert/strict');
const Pop=require('../src/pop-progression.js');
const Composer=require('../src/chord-composer.js');
const C=require('../src/core.js');

test('chord pad lists diatonic and borrowed chords',()=>{
 const pad=Pop.buildChordPad(0,'major');
 assert.ok(pad.length>=10);
 assert.ok(pad.some(c=>c.roman==='I'&&c.symbol==='C'));
 assert.ok(pad.some(c=>c.roman==='bVII'));
});

test('preset fills timeline symbols for key',()=>{
 const timeline=Composer.presetTimeline('komuro',0,'major');
 assert.equal(timeline.length,4);
 assert.ok(timeline.every(item=>item.symbol&&item.roman));
});

test('timeline apply writes harmony and bass',()=>{
 let part=C.createScore();
 part=C.addMeasure(part);
 const timeline=[
  {roman:'I',symbol:'C'},
  {roman:'V',symbol:'G'},
  {roman:'vi',symbol:'Am'},
  {roman:'IV',symbol:'F'}
 ];
 const doc={...part};
 const {document}=Composer.applyTimelineDocument(doc,{
  timeline,from:1,den:4,voicing:'block',harmonyPart:1,bassPart:1,bass:true,melody:false
 });
 const notes=document.measures.flatMap(m=>m.events).filter(e=>e.type==='note');
 assert.ok(notes.length>=4);
 assert.ok(document.measures[0].directions?.some(d=>d.text==='C'));
});