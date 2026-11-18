const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js');
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;}
function fixture(){
 let score=C.createScore();score=C.insertEvent(score,0,0,C.makeNote({step:'C',octave:4,alter:0},4)).score;
 score=C.addMeasure(score);score=C.insertEvent(score,1,0,C.makeNote({step:'G',octave:4,alter:0},4)).score;
 return freeze(score);
}
test('editing a version never mutates retained or frozen previous versions',()=>{
 const score=fixture(),original=JSON.stringify(score),id=score.measures[0].events[0].id;
 const changed=C.changeEvent(score,id,e=>{e.pitches[0].octave=5;return e;});
 assert.equal(changed.measures[1],score.measures[1]);assert.notEqual(changed.measures[0],score.measures[0]);
 const later=C.changeEvent(freeze(changed),id,e=>{e.pitches[0].octave=6;return e;});
 assert.equal(score.measures[0].events[0].pitches[0].octave,4);
 assert.equal(changed.measures[0].events[0].pitches[0].octave,5);
 assert.equal(later.measures[0].events[0].pitches[0].octave,6);
 assert.equal(JSON.stringify(score),original);
});
test('insert, place, delete, duration, settings and measure operations preserve old snapshots',()=>{
 const score=fixture(),original=JSON.stringify(score),id=score.measures[0].events[0].id;
 const note=()=>C.makeNote({step:'D',octave:4,alter:0},4);
 const versions=[C.insertEvent(score,0,1,note()).score,C.placeEventAt(score,0,960,note()).score,C.deleteEvent(score,id),C.changeDuration(score,id,8),C.withSettings(score,{title:'changed'}),C.addMeasure(score),C.removeMeasure(score,0)];
 for(const next of versions){assert.deepEqual(C.validateScore(next),[]);assert.equal(JSON.stringify(score),original);}
 assert.equal(versions[0].measures[1],score.measures[1]);assert.equal(versions[1].measures[1],score.measures[1]);
 const full=C.createScore();full.measures[0].events=[C.makeNote({step:'C',octave:4,alter:0},1)];freeze(full);
 const added=C.insertEvent(full,0,1,note()).score;assert.equal(added.measures.length,2);assert.equal(full.measures.length,1);
});
