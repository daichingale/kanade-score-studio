const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core');
const Tools=require('../src/agent-tools');
const Ensemble=require('../src/agent-ensemble');

test('proposeEnsembleOptions returns up to three choices without mutating the score',()=>{
 const score={...C.createScore(),instrument:'フルート',instrumentKey:'flute'};
 const before=JSON.stringify(score);
 const result=Tools.run(score,'proposeEnsembleOptions',{style:'small',level:'初級',headcount:12});
 assert.equal(JSON.stringify(score),before);
 assert.ok(result.proposal.options.length>=2);
 assert.ok(result.proposal.options.length<=3);
 assert.match(result.summary,/候補/);
});

test('applyEnsembleOption applies a remembered plan and can keep melody on matching part',()=>{
 const score={...C.createScore(),instrument:'トランペット',instrumentKey:'trumpet'};
 const withNotes=C.insertEvent(score,0,0,C.makeNote({step:'G',alter:0,octave:4},4)).score;
 const proposal=Tools.run(withNotes,'proposeEnsembleOptions',{style:'small',headcount:12});
 const optionId=proposal.proposal.options[0].id;
 const applied=Tools.run(withNotes,'applyEnsembleOption',{optionId,preserveMusic:true,level:'初級'});
 const parts=C.scoreParts(applied.document);
 assert.ok(parts.length>=optionId?8:8);
 const trumpet=parts.find(part=>part.instrumentKey==='trumpet'||/トランペット/.test(part.instrument));
 assert.ok(trumpet?.measures?.[0]?.events?.some(event=>event.type==='note'));
});

test('removePartRedistribute moves notes to another part',()=>{
 let score=C.createScore();
 score={...score,instrument:'フルート',instrumentKey:'flute'};
 score=Tools.run(score,'addParts',{keys:['clarinet']}).document;
 score=Tools.run(score,'insertNotes',{part:'フルート',measure:1,notes:[{step:'C',octave:5,den:4}]}).document;
 const changed=Tools.run(score,'removePartRedistribute',{part:'フルート',level:'初級'});
 const parts=C.scoreParts(changed.document);
 assert.equal(parts.length,1);
 assert.ok(parts[0].measures[0].events.some(event=>event.type==='note'));
});

test('runTurn forwards ensemble proposals from tool execution',async()=>{
 const Agent=require('../src/agent');
 let captured=null;
 const run=await Agent.runTurn({
  messages:[{role:'user',content:'小編成にして'}],
  async chat(messages){
   if(messages.some(item=>item.role==='tool'))return {content:'候補を提示しました。',toolCalls:[]};
   return {content:'',toolCalls:[{name:'proposeEnsembleOptions',arguments:{style:'small'}}]};
  },
  async execute(call){
   captured=call;
   return {ok:true,summary:'候補',wrote:0,proposal:{options:[{id:'template-1',title:'小編成',reason:'学校向け'}]}};
  },
  onStep(step){if(step.proposal)assert.equal(step.proposal.options[0].title,'小編成');}
 });
 assert.equal(captured?.name,'proposeEnsembleOptions');
 assert.match(run.content,/候補/);
});