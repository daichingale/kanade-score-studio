const test=require('node:test'),assert=require('node:assert/strict'),P=require('../src/percussion.js'),C=require('../src/core.js');
test('marching presets map every visible pad to a distinct voice and fall back predictably',()=>{
 assert.equal(P.presets.length,4);
 for(const p of P.presets){assert.equal(P.preset(p.name),p);p.pads.forEach(([step,label],index)=>assert.deepEqual(P.voice(p.name,{step,octave:4,alter:0}),{kind:p.kind,index,label}));assert.equal(P.voice(p.name,{step:'B',octave:5,alter:1}).index,0);}
 assert.equal(P.voice('ピアノ',{step:'C'}),null);
});
test('marching instrument survives score serialization and immutable settings undo',()=>{
 const before=C.createScore();for(const p of P.presets){const next=C.withSettings(before,{instrument:p.name});assert.deepEqual(C.validateScore(JSON.parse(JSON.stringify(next))),[]);assert.equal(next.instrument,p.name);assert.equal(before.instrument,'ピアノ');assert.equal(next.measures[0],before.measures[0]);}
});
