const test=require('node:test');
const assert=require('node:assert/strict');
const Pop=require('../src/pop-progression.js');

test('transposes roman numerals to chord symbols',()=>{
 assert.equal(Pop.romanToSymbol('I',0,'major'),'C');
 assert.equal(Pop.romanToSymbol('vi',0,'major'),'Am');
 assert.equal(Pop.romanToSymbol('IV',2,'major'),'G');
 assert.equal(Pop.romanToSymbol('V',-3,'major'),'B♭');
});

test('ranks next chords from the seeded model',()=>{
 const ranked=Pop.rankNext(['IV','V'],0,'major',3);
 assert.ok(ranked.length>=2);
 assert.equal(ranked[0].roman,'iii');
 assert.ok(ranked.some(item=>item.symbol==='Em'));
});

test('learning update counts transitions from chord symbols',()=>{
 const C=require('../src/core.js');
 const before=Pop.loadStore();
 const part=C.createScore();
 part.measures[0].directions=[{key:'chordSymbol',tick:0,text:'C'},{key:'chordSymbol',tick:C.WHOLE/4,text:'Am'}];
 const result=Pop.learnFromPart(part,{enabled:true,mode:'major'});
 assert.ok(result.added>=1);
 const store=Pop.loadStore();
 assert.ok(Object.keys(store.bigrams||{}).length>=Object.keys(before.bigrams||{}).length);
});

test('apply writes chords across measures',()=>{
 const C=require('../src/core.js');
 let part=C.createScore();
 part=C.addMeasure(part);
 const {part:edited}=Pop.applyToPart(part,{from:1,to:2,template:'I-V-vi-IV',voicing:'block',grid:'bar',den:4,octave:4});
 const notes=edited.measures[0].events.filter(e=>e.type==='note');
 assert.ok(notes.length>0);
 assert.ok(edited.measures[0].directions?.some(d=>d.text==='C'));
});