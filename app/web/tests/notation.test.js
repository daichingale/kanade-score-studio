const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),N=require('../src/notation.js'),R=require('../src/renderer.js'),Ex=require('../src/musicxml.js');
function scoreFor(time,durations){
 const score=C.createScore();score.time=time;
 score.measures[0].events=durations.map((den,i)=>den<0?C.makeRest(-den):C.makeNote({step:C.STEPS[i%7],octave:4,alter:0},den));
 assert.deepEqual(C.validateScore(score),[]);return score;
}
test('simple and compound meter use different beam groups without changing musical time',()=>{
 const simple=scoreFor({num:4,den:4},Array(8).fill(8)),compound=scoreFor({num:6,den:8},Array(6).fill(8));
 const before=JSON.stringify(compound);
 assert.deepEqual(N.beamGroups(simple,0).map(g=>g.length),[2,2,2,2]);
 assert.deepEqual(N.beamGroups(compound,0).map(g=>g.length),[3,3]);
 assert.equal(JSON.stringify(compound),before);
 const svg=R.render(compound,null);
 assert.equal((svg.match(/class="note-beam"/g)||[]).length,2);
 assert.equal((svg.match(/class="music-glyph note-flag"/g)||[]).length,0);
 const xml=Ex.musicXML(compound);
 assert.equal((xml.match(/<beam number="1">begin<\/beam>/g)||[]).length,2);
 assert.equal((xml.match(/<beam number="1">continue<\/beam>/g)||[]).length,2);
 assert.equal((xml.match(/<beam number="1">end<\/beam>/g)||[]).length,2);
});
test('rests, manual breaks and incompatible stems separate groups',()=>{
 const rests=scoreFor({num:4,den:4},[8,-8,8,8]);
 assert.deepEqual(N.beamGroups(rests,0).map(g=>g.map(s=>s.index)),[[2,3]]);
 const manual=scoreFor({num:6,den:8},Array(6).fill(8));
 manual.measures[0].events[2].beamBreak=true;
 assert.deepEqual(N.beamGroups(manual,0).map(g=>g.map(s=>s.index)),[[0,1],[3,4,5]]);
 const stems=scoreFor({num:4,den:4},[8,8]);stems.measures[0].events[0].stemDirection='up';stems.measures[0].events[1].stemDirection='down';
 assert.equal(N.beamGroups(stems,0).length,0);
 assert.equal((R.render(stems,null).match(/class="music-glyph note-flag"/g)||[]).length,2);
});
test('mixed subdivisions have partial beams with matching MusicXML hooks',()=>{
 const score=scoreFor({num:4,den:4},[16,16,8]);
 const groups=N.beamGroups(score,0);assert.deepEqual(groups.map(g=>g.length),[3]);
 assert.equal((R.render(score,null).match(/class="note-beam"/g)||[]).length,2);
 const hook=scoreFor({num:4,den:4},[8,16,16]);
 const e=hook.measures[0].events;assert.deepEqual(N.beamMarks(hook,0).get(e[1].id).map(m=>m.value),['continue','begin']);
 const dotted=scoreFor({num:4,den:4},[8,16]);dotted.measures[0].events[0].dots=1;
 assert.match(Ex.musicXML(dotted),/<beam number="2">backward hook<\/beam>/);
 assert.match(R.render(dotted,null),/data-beam-level="2"/);
});
test('SVG defines each reusable glyph once and resolves every use, including palette SVGs',()=>{
 const score=scoreFor({num:4,den:4},Array(16).fill(16));
 for(const svg of [R.render(score,null),...C.DENOMS.map(R.toolGlyph)]){
   const definitions=[...svg.matchAll(/<path id="([^"]+)"/g)].map(m=>m[1]);
   assert.equal(new Set(definitions).size,definitions.length);
   for(const [,reference]of svg.matchAll(/<use href="#([^"]+)"/g))assert.ok(definitions.includes(reference),reference);
 }
});
