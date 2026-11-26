const test=require('node:test');
const assert=require('node:assert/strict');
const Judge=require('../src/inspiration-spark-ai-judge.js');
const Spark=require('../src/inspiration-spark.js');
const C=require('../src/core.js');

test('encode and build compact judge prompt',()=>{
 const ctx=Spark.harmonyContext(C.createScore(),0);
 const card={id:'p1',label:'test',style:'歌',fragment:[
  {offset:0,event:C.makeNote({step:'C',octave:4,alter:0},4,0)},
  {offset:C.WHOLE/4,event:C.makeNote({step:'D',octave:4,alter:0},4,0)}
 ]};
 const encoded=Judge.encodePhraseForJudge(card,ctx);
 assert.equal(encoded.id,'p1');
 assert.ok(encoded.bars[0].c);
 assert.ok(encoded.bars[0].n[0].includes('C4'));
 const prompt=Judge.buildJudgePrompt([card],ctx);
 assert.ok(prompt.includes('"phrases"'));
});

test('parseJudgeResponse validates JSON',()=>{
 const rows=Judge.parseJudgeResponse('text [{"id":"p1","musicality":8,"singable":true,"reason":"自然な問答"}] end');
 assert.equal(rows.length,1);
 assert.equal(rows[0].musicality,8);
 assert.throws(()=>Judge.parseJudgeResponse('no json'));
});

test('combineRank and drop low AI scores',()=>{
 assert.equal(Judge.combineRank(78,8),158);
 const cards=[{id:'a',label:'A',quality:80,fragment:[]},{id:'b',label:'B',quality:80,fragment:[]}];
 const out=Judge.applyJudgments(cards,[
  {id:'a',musicality:8,singable:true,reason:'自然な問答'},
  {id:'b',musicality:3,singable:false,reason:'跳躍多い'}
 ]);
 assert.equal(out.length,1);
 assert.equal(out[0].id,'a');
});

test('judgePhrases falls back when fetch fails',async()=>{
 const ctx=Spark.harmonyContext(C.createScore(),0);
 const cards=[{id:'x',quality:80,label:'x',fragment:[]}];
 const result=await Judge.judgePhrases(cards,ctx,{
  enabled:true,
  postChat:async()=>({ok:false,status:503,json:async()=>({})})
 });
 assert.equal(result.aiActive,false);
 assert.equal(result.cards[0].finalRank,80);
});

test('judgePhrases ranks with mock fetch',async()=>{
 const ctx=Spark.harmonyContext(C.createScore(),0);
 const card={id:'p1',label:'t',quality:78,fragment:[{offset:0,event:C.makeNote({step:'E',octave:4,alter:0},4,0)}]};
 const result=await Judge.judgePhrases([card],ctx,{
  enabled:true,
  model:'qwen2.5:3b',
  postChat:async()=>({ok:true,json:async()=>({message:{content:'[{"id":"p1","musicality":9,"singable":true,"reason":"歌いやすい"}]'}})})
 });
 assert.equal(result.aiActive,true);
 assert.equal(result.cards[0].aiReason,'歌いやすい');
 assert.ok(result.cards[0].finalRank>78);
});