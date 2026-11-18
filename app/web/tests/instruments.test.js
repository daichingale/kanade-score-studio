const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core');
const I=require('../src/instruments');
const S=require('../src/samples');

const part=(key,instrument)=>({...C.createScore(),instrument,instrumentKey:key});

test('instrument templates fit the score and resolve to valid and unique instrument profiles',()=>{
 const keys=new Set(I.catalog.map(item=>item.key)),sounds=new Set(I.catalog.map(item=>item.sound));
 assert.equal(keys.size,I.catalog.length);
 assert.equal(sounds.size,I.catalog.length);
 for(const item of I.catalog){
  assert.ok(C.CLEFS[item.clef],item.key);
  assert.ok(C.TRANSPOSITIONS[item.transposition],item.key);
  assert.ok(item.staffLines>=1&&item.staffLines<=5,item.key);
  if(item.fallback)assert.ok(S.presets[item.fallback],item.key);
 }
 for(const template of I.templates){
  assert.ok(template.keys.length<=32,template.id);
  assert.ok(template.keys.every(key=>keys.has(key)),template.id);
 }
});

test('successive additions number both new and existing parts and keep existing notes and sound',()=>{
 const original=C.createScore(), second=part('piano','Piano');
 const pair=I.numberParts([original,second],[1]);
 const trio=I.numberParts([...pair,part('piano','ピアノ')],[2]);
 assert.deepEqual(trio.map(p=>p.instrument),['ピアノ 1','Piano 2','ピアノ 3']);
 assert.equal(trio[0].sound,'ピアノ');
 assert.equal(trio[0].measures,original.measures);
});

test('appended presets renumber collisions while preserving assigned numbers and custom names',()=>{
 const solo={...part('trombone','Solo'),customInstrumentName:true};
 const one=part('trombone','Trombone 1'), three=part('trombone','トロンボーン 3');
 const next=I.numberParts([three,solo,one,part('trombone','Trombone 1'),part('trombone','Trombone 2')],[3,4]);
 assert.deepEqual(next.map(p=>p.instrument),['トロンボーン 3','Solo','Trombone 1','Trombone 4','Trombone 2']);
 const reused=I.numberParts([three,solo,part('trombone','Trombone')],[2]);
 assert.deepEqual(reused.map(p=>p.instrument),['トロンボーン 3','Solo','Trombone 1']);
});

test('audio source labels distinguish packaged, substitute and install-only profiles',async()=>{
 assert.equal(S.status('ピアノ').kind,'builtIn');
 assert.deepEqual(S.status('ソプラノサクソフォン'),{kind:'fallback',label:'代用音源あり',substitute:'アルトサックス'});
 assert.equal(S.status('ウォーターフォン').kind,'missing');
 assert.equal(S.canInstall('ウォーターフォン'),true);
 assert.equal(await new S.Bank().prepare(null,'ウォーターフォン',[60]),null);
});
