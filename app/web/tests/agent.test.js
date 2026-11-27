const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core');
const Agent=require('../src/agent');

test('system prompt tells a wind-band model how to call the score tools',()=>{
 const prompt=Agent.systemPrompt();
 assert.match(prompt,/吹奏楽/);
 assert.match(prompt,/記譜音/);
 assert.match(prompt,/writePhrase/);
 assert.match(prompt,/insertNotes/);
 assert.match(prompt,/必ずツールで楽譜に書き込む/);
 assert.match(prompt,/overwrite:true/);
 assert.match(prompt,/書き直して/);
 assert.match(prompt,/proposeEnsembleOptions/);
 assert.match(prompt,/applyEnsembleTemplate/);
 assert.match(prompt,/semitones を 2/);
 assert.match(prompt,/smallWind/);
 assert.match(prompt,/断定しません/);
});

test('score summary is read-only and lists title, parts, meter, tempo and key',()=>{
 const noted=C.insertEvent(C.createScore(),0,0,C.makeNote({step:'C',alter:0,octave:5},4)).score;
 const score={...noted,title:'テスト行進曲',composer:'山田',tempo:120,key:-3,instrument:'B♭ クラリネット 1',transposition:'bb',clef:'treble'};
 score.ensembleParts=[{instrument:'フルート',clef:'treble',transposition:'concert',key:-1,measures:score.measures}];
 const before=JSON.stringify(score);
 const measures=score.measures;
 const parts=score.ensembleParts;
 const summary=Agent.summarizeScore(score,{measureId:score.measures[0].id});
 assert.equal(JSON.stringify(score),before);
 assert.equal(score.measures,measures);
 assert.equal(score.ensembleParts,parts);
 assert.match(summary,/テスト行進曲/);
 assert.match(summary,/山田/);
 assert.match(summary,/♩=120/);
 assert.match(summary,/4\/4/);
 assert.match(summary,/B♭ クラリネット 1/);
 assert.match(summary,/フルート/);
 assert.match(summary,/変ホ長調/);
 assert.match(summary,/編集位置: B♭ クラリネット 1 の 1 小節目/);
 assert.equal(summary.includes('C5'),false);
 assert.equal(summary.includes(score.measures[0].events[0].id),false);
 assert.match(Agent.summarizeScore(null),/取得できません/);
});

test('buildChatPayload disables streaming when tools are attached',()=>{
 Agent.registerTool({name:'getScoreSummary',description:'要約',handler:()=>''});
 try{
  const withTools=Agent.buildChatPayload({model:'qwen2.5:7b',history:[],includeTools:true});
  assert.equal(withTools.stream,false);
  assert.equal(withTools.tools.length,1);
  const forced=Agent.buildChatPayload({model:'qwen2.5:7b',history:[],includeTools:true,stream:true});
  assert.equal(forced.stream,true);
  assert.equal(Agent.buildChatPayload({model:'qwen2.5:7b',history:[],includeTools:false}).stream,true);
 }finally{Agent.unregisterTool('getScoreSummary');}
});

test('tool calls are read from streamed messages, JSON blocks, and tool_call tags',()=>{
 const streamed=Agent.finishStream(Agent.absorbEvent(Agent.emptyStream(),{message:{role:'assistant',tool_calls:[{function:{name:'writePhrase',arguments:JSON.stringify({phrase:'G4 q'})}}]},done:true}));
 assert.equal(streamed.toolCalls[0].name,'writePhrase');
 assert.deepEqual(streamed.toolCalls[0].arguments,{phrase:'G4 q'});
 const fenced=Agent.finishStream({content:'ファンファーレを書きます。\n```json\n{"name":"writePhrase","arguments":{"part":"trumpet","measure":1,"phrase":"G4 q G4 q"}}\n```',calls:[],error:''});
 assert.equal(fenced.toolCalls[0].name,'writePhrase');
 assert.match(fenced.content,/ファンファーレ/);
 assert.equal(fenced.content.includes('```'),false);
 const tagged=Agent.finishStream({content:'<tool_call>{"name":"insertNotes","arguments":{"measure":1,"notes":[{"step":"C","octave":5,"den":4}]}}</tool_call>',calls:[],error:''});
 assert.equal(tagged.toolCalls[0].name,'insertNotes');
 assert.deepEqual(Agent.parseToolCallsFromContent('[{"name":"getScoreSummary","arguments":{}}]')[0].name,'getScoreSummary');
 const nested=Agent.parseToolCallsFromContent('portun\n{"name":"insertNotes","arguments":{"measure":1,"notes":[{"step":"G","octave":4,"den":"w"}]}}');
 assert.equal(nested[0].name,'insertNotes');
 assert.equal(nested[0].arguments.notes[0].step,'G');
 const action=Agent.parseToolCallsFromContent('{"action":"insert_notes","args":{"measure":1,"notes":[{"step":"Eb","octave":4,"den":8,"alter":0,"dots":0,"tie":null},{"step":"F#","octave":4,"den":8,"tie":null}]}}');
 assert.equal(action[0].name,'insertNotes');
 assert.equal(action[0].arguments.notes[0].step,'E');
 assert.equal(action[0].arguments.notes[0].alter,-1);
 assert.equal(action[0].arguments.notes[1].step,'F');
 assert.equal(action[0].arguments.notes[1].alter,1);
 assert.equal('tie' in action[0].arguments.notes[0],false);
 const toolShape=Agent.parseToolCallsFromContent('{"tool":"write_phrase","parameters":{"phrase":"G4 q C5 h"}}');
 assert.equal(toolShape[0].name,'writePhrase');
 assert.equal(toolShape[0].arguments.phrase,'G4 q C5 h');
 const fnShape=Agent.parseToolCallsFromContent('{"function":"addMeasures","args":{"at":5,"count":4}}');
 assert.equal(fnShape[0].name,'addMeasures');
 assert.deepEqual(fnShape[0].arguments,{at:5,count:4});
 const fnHidden=Agent.finishStream({content:'ひらめき機能が読み込まれていません\n{"function":"addMeasures","args":{"at":5,"count":4}}',calls:[],error:''});
 assert.equal(fnHidden.content.includes('"function"'),false);
 assert.equal(fnHidden.content.includes('addMeasures'),false);
 assert.equal(fnHidden.toolCalls[0].name,'addMeasures');
 assert.equal(fnHidden.rawContent.includes('"function"'),true);
 const camelInsert=Agent.parseToolCallsFromContent('{"name":"insertNotes","arguments":{"measure":1,"notes":[{"step":"Bb","octave":4,"den":4}]}}');
 assert.equal(camelInsert[0].arguments.notes[0].step,'B');
 assert.equal(camelInsert[0].arguments.notes[0].alter,-1);
 const py=Agent.parseToolCallsFromContent('inspireSpark(mood="ballad", part=1, seed=1)');
 assert.equal(py[0].name,'inspireSpark');
 assert.equal(py[0].arguments.mood,'ballad');
 assert.equal(py[0].arguments.part,1);
 const hidden=Agent.finishStream({content:'{"action":"insert_notes","args":{"measure":1,"notes":[{"step":"C","octave":4,"den":8}]}}',calls:[],error:''});
 assert.equal(hidden.toolCalls[0].name,'insertNotes');
 assert.equal(hidden.content.includes('{'),false);
 assert.equal(hidden.content.includes('insert_notes'),false);
 assert.equal(hidden.rawContent.includes('insert_notes'),true);
 const bad=Agent.finishStream({content:'{"action":"not_a_real_tool","args":{"x":1}}',calls:[],error:''});
 assert.match(bad.content,/解釈できません|指示/);
 assert.equal(bad.content.includes('"action"'),false);
 assert.equal(bad.rawContent.includes('"action"'),true);
});

test('write requests keep the user ask last and shrink the tool list',()=>{
 const history=[{role:'user',content:'トランペットに4小節のファンファーレを書いて'}];
 Agent.registerTool({name:'writePhrase',description:'phrase',handler:()=>({})});
 Agent.registerTool({name:'insertNotes',description:'notes',handler:()=>({})});
 Agent.registerTool({name:'getScoreSummary',description:'summary',handler:()=>({})});
 Agent.registerTool({name:'proposeEnsembleOptions',description:'ensemble',handler:()=>({})});
 try{
  const payload=Agent.buildChatPayload({model:'qwen2.5:7b',history,summary:'曲名: テスト',includeTools:true});
  assert.equal(payload.stream,false);
  assert.equal(payload.messages.at(-1).role,'user');
  assert.match(payload.messages.at(-1).content,/ファンファーレ/);
  assert.match(payload.messages[1].content,/参照情報/);
  assert.deepEqual(payload.tools.map(t=>t.function.name).sort(),['getScoreSummary','insertNotes','writePhrase'].sort());
  assert.equal(payload.tools.some(t=>t.function.name==='proposeEnsembleOptions'),false);
  assert.equal(Agent.writeIntent(history[0].content),true);
 }finally{
  for(const name of ['writePhrase','insertNotes','getScoreSummary','proposeEnsembleOptions'])Agent.unregisterTool(name);
 }
});

test('runTurn force-writes when the model only chats after a write request',async()=>{
 let round=0,executed=null;
 const result=await Agent.runTurn({
  messages:[{role:'user',content:'トランペットに4小節のファンファーレを書いて'}],
  async chat(_messages,{forceWrite}){
   round++;
   if(!forceWrite)return {content:'ご質問ですか？',toolCalls:[]};
   return {content:'',toolCalls:[{name:'writePhrase',arguments:{part:'トランペット',measure:1,phrase:'G4 q C5 q'}}]};
  },
  async execute(call){executed=call;return {ok:true,summary:'書きました',wrote:1};}
 });
 assert.ok(round>=2);
 assert.equal(executed?.name,'writePhrase');
 assert.equal(result.writes,1);
 assert.equal(result.forcedWrite,true);
});

test('runTurn executes tool calls embedded only in assistant text',async()=>{
 let executed=null,round=0;
 const result=await Agent.runTurn({
  messages:[{role:'user',content:'ファンファーレを書いて'}],
  async chat(messages,{onText}){
   if(messages.some(item=>item.role==='tool'))return {content:'ファンファーレを書きました。',toolCalls:[]};
   round++;
   const finished=Agent.finishStream({content:'```json\n{"name":"writePhrase","arguments":{"measure":1,"phrase":"G4 q C5 q"}}\n```',calls:[],error:''});
   onText?.(finished.content);
   return finished;
  },
  async execute(call){executed=call;return {ok:true,summary:'書きました',wrote:1};}
 });
 assert.equal(round,1);
 assert.equal(executed?.name,'writePhrase');
 assert.match(result.content,/ファンファーレを書きました/);
 assert.equal(result.writes,1);
});

test('chat messages prepend the prompt and summary without rewriting history',()=>{
 const history=[{role:'user',content:'クラリネットの音域は？'},{role:'note',content:'無視'}];
 const payload=Agent.buildChatPayload({model:'qwen2.5:7b',history,summary:'曲名: 行進曲'});
 assert.equal(payload.stream,true);
 assert.equal(payload.model,'qwen2.5:7b');
 assert.equal(payload.messages[0].role,'system');
 assert.match(payload.messages[0].content,/吹奏楽/);
 assert.match(payload.messages[1].content,/行進曲/);
 assert.deepEqual(payload.messages.at(-1),{role:'user',content:'クラリネットの音域は？'});
 assert.equal(history.length,2);
 assert.equal(payload.tools,undefined);
});

test('proxy responses count as usable only for ok, auth errors, and ollama-unavailable',()=>{
 assert.equal(Agent.acceptProxyResponse({ok:true,status:200}),true);
 assert.equal(Agent.acceptProxyResponse({ok:false,status:401}),true);
 assert.equal(Agent.acceptProxyResponse({ok:false,status:403}),true);
 assert.equal(Agent.acceptProxyResponse({ok:false,status:503}),true);
 assert.equal(Agent.acceptProxyResponse({ok:false,status:404}),false);
 assert.equal(Agent.acceptProxyResponse({ok:false,status:405}),false);
});

test('postChat falls back from GitHub Pages proxy 405 to direct Ollama and reuses tags transport',async()=>{
 const calls=[];
 const original=globalThis.fetch;
 Agent.resetOllamaTransport();
 delete globalThis.__KANADE_DEV__;
 try{
  globalThis.fetch=async(url,init)=>{
   calls.push({url,method:init?.method||'GET'});
   if(String(url).includes('/__agent/tags'))return {ok:false,status:405};
   if(String(url).includes('/api/tags'))return {ok:true,status:200,json:async()=>({models:[{name:'qwen2.5:7b'}]})};
   if(String(url).includes('/__agent/chat'))return {ok:false,status:405};
   if(String(url).includes('/api/chat'))return {ok:true,status:200,body:null};
   throw new Error(`unexpected fetch ${url}`);
  };
  const tags=await Agent.fetchTags({});
  assert.equal(tags.mode,'direct');
  const chat=await Agent.postChat({model:'qwen2.5:7b',messages:[]},{});
  assert.equal(chat.ok,true);
  const chatUrls=calls.filter(c=>c.method==='POST').map(c=>c.url);
  assert.equal(chatUrls.length,1);
  assert.match(chatUrls[0],/127\.0\.0\.1:11434\/api\/chat/);
  assert.doesNotMatch(chatUrls.join(' '),/\/__agent\/chat/);
  await Agent.fetchTags({});
  calls.length=0;
  await Agent.postChat({model:'qwen2.5:7b',messages:[]},{});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/api\/chat/);
 }finally{
  globalThis.fetch=original;
  Agent.resetOllamaTransport();
 }
});

test('postChat uses dev proxy only when __KANADE_DEV__ is set',async()=>{
 const calls=[];
 const original=globalThis.fetch;
 Agent.resetOllamaTransport();
 globalThis.__KANADE_DEV__=true;
 try{
  globalThis.fetch=async(url,init)=>{
   calls.push({url,method:init?.method||'GET'});
   if(String(url).includes('/__agent/chat'))return {ok:true,status:200};
   throw new Error(`unexpected fetch ${url}`);
  };
  await Agent.postChat({model:'x',messages:[]},{});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/__agent\/chat/);
 }finally{
  globalThis.fetch=original;
  delete globalThis.__KANADE_DEV__;
  Agent.resetOllamaTransport();
 }
});

test('model choice prefers a saved model, then Qwen, and explains a missing Ollama',()=>{
 assert.equal(Agent.pickModel(['llama3.1:8b','qwen2.5:3b'],''),'qwen2.5:3b');
 assert.equal(Agent.pickModel(['qwen2.5:3b','qwen2.5:7b'],'qwen2.5:3b'),'qwen2.5:3b');
 assert.equal(Agent.pickModel([{name:'nope'}],''),'');
 assert.deepEqual(Agent.modelNames({models:[{name:'qwen2.5:7b'},'qwen2.5:7b',{name:'llama3:8b'}]}),['qwen2.5:7b','llama3:8b']);
 assert.match(Agent.connectionMessage('unavailable'),/ollama serve/);
 assert.match(Agent.pagesOllamaHint(),/OLLAMA_ORIGINS/);
 assert.match(Agent.connectionMessage('empty'),/ollama pull qwen2\.5:7b/);
 assert.match(Agent.connectionMessage('missing'),/ollama pull qwen2\.5:7b/);
});

test('ndjson chunks decode independently and a partial line waits',()=>{
 const first=JSON.stringify({message:{role:'assistant',content:'前半'},done:false})+'\n';
 const opened=Agent.readNdjson(first+JSON.stringify({message:{content:'後'}}));
 assert.equal(opened.events.length,1);
 assert.equal(Agent.textFromEvent(opened.events[0]).content,'前半');
 assert.match(opened.rest,/後/);
 const flushed=Agent.readNdjson(opened.rest,{flush:true});
 assert.equal(Agent.textFromEvent(flushed.events[0]).content,'後');
 const broken=Agent.readNdjson('not-json\n',{flush:true});
 assert.equal(Agent.textFromEvent(broken.events[0]).error,'応答の形式を読み取れませんでした');
});

test('inspireSpark picks up bar count from the user text when the model omits bars',async()=>{
 assert.equal(Agent.inferBarsFromText('8小節のバラードイントロ作って'),8);
 const calls=[];
 const result=await Agent.runTurn({
  messages:[{role:'user',content:'8小節のバラードイントロ作って'}],
  async chat(messages,{absorb}){
   if(messages.some(message=>message.role==='tool')){
    absorb({message:{content:'書きました。',done:true},done:true});
    return null;
   }
   absorb({message:{tool_calls:[{function:{name:'inspireSpark',arguments:JSON.stringify({mood:'ballad',apply:true})}}]},done:true});
   return null;
  },
  async execute(call){
   calls.push(call);
   assert.equal(call.arguments.bars,8);
   return {ok:true,summary:'ピアノの1〜8小節にひらめきを書きました。',wrote:1};
  }
 });
 assert.equal(result.writes,1);
 assert.equal(calls[0].name,'inspireSpark');
});

test('raw insert_notes JSON is executed and summarized without showing the payload',async()=>{
 const payload='{"action":"insert_notes","args":{"measure":1,"notes":[{"step":"Eb","octave":4,"den":8,"alter":0,"tie":null},{"step":"Ab","octave":4,"den":8,"tie":null}]}}';
 const steps=[];
 const result=await Agent.runTurn({
  messages:[{role:'user',content:'1小節目に入れて'}],
  async chat(messages,{absorb}){
   if(messages.some(message=>message.role==='tool')){
    absorb({message:{content:'完了しました。',done:true},done:true});
    return null;
   }
   absorb({message:{content:payload},done:true});
   return null;
  },
  async execute(call){
   assert.equal(call.name,'insertNotes');
   assert.equal(call.arguments.notes[0].step,'E');
   assert.equal(call.arguments.notes[0].alter,-1);
   assert.equal('tie' in call.arguments.notes[0],false);
   return {ok:true,summary:'ピアノの1小節から2音を入力しました',wrote:1};
  },
  onStep:step=>steps.push(step)
 });
 assert.equal(result.writes,1);
 assert.equal(result.content.includes('insert_notes'),false);
 assert.equal(result.content.includes('"action"'),false);
 assert.match(steps.find(step=>step.phase==='done')?.text||'',/入力しました/);
});

test('tool loop sends results back and stops for confirmation or the step limit',async()=>{
 const scripts=[
  [{message:{role:'assistant',content:'',tool_calls:[{index:0,function:{name:'setMetadata',arguments:'{"ti'}}]},done:false},
   {message:{role:'assistant',tool_calls:[{index:0,function:{arguments:'tle":"ファンファーレ"}'}}]},done:true}],
  [{message:{role:'assistant',content:'曲名をファンファーレにしました。'},done:true}]
 ];
 let round=0;
 const seen=[];
 const result=await Agent.runTurn({
  messages:[{role:'user',content:'曲名をファンファーレにして'}],
  async chat(messages,{absorb}){
   seen.push(messages.map(message=>message.role));
   const events=scripts[round++]||[{message:{role:'assistant',content:'上限です'},done:true}];
   for(const event of events)absorb(event);
   return null;
  },
  async execute(call){return {ok:true,summary:`曲名を${call.arguments.title}にしました`,wrote:1};}
 });
 assert.equal(result.content,'曲名をファンファーレにしました。');
 assert.equal(result.writes,1);
 assert.equal(seen[1].includes('tool'),true);
 const declined=await Agent.runTurn({
  messages:[{role:'user',content:'消して'}],
  async chat(messages,{absorb}){
   if(messages.some(message=>message.role==='tool'))absorb({message:{content:'削除はやめました。'},done:true});
   else absorb({message:{tool_calls:[{function:{name:'removePart',arguments:{part:1}}}]},done:true});
   return null;
  },
  async execute(){const error=new Error('確認が必要です');error.confirmation={name:'removePart',summary:'パートを削除します'};throw error;},
  async confirm(){return false;}
 });
 assert.match(declined.content,/やめました/);
 assert.equal(declined.writes,0);
 let steps=0;
 const limited=await Agent.runTurn({
  messages:[{role:'user',content:'繰り返して'}],maxSteps:2,
  async chat(messages,{absorb}){steps++;absorb({message:{tool_calls:[{function:{name:'getScoreSummary',arguments:{}}}]},done:true});return null;},
  async execute(){return {ok:true,summary:'概要',wrote:0};}
 });
 assert.equal(limited.limited,true);
 assert.equal(steps,3);
});
test('tool registry is empty until a later phase registers one, and destructive calls wait',async()=>{
 assert.equal(Agent.listTools().length,0);
 Agent.registerTool({name:'getScoreSummary',description:'楽譜の要約',handler:()=>'要約'});
 try{
  assert.equal(Agent.listTools()[0].handler,undefined);
  assert.equal(Agent.buildChatPayload({model:'qwen2.5:7b',history:[]}).tools,undefined);
  assert.equal(Agent.buildChatPayload({model:'qwen2.5:7b',history:[],includeTools:true}).tools[0].function.name,'getScoreSummary');
  assert.equal(await Agent.callTool('getScoreSummary',{}), '要約');
  Agent.unregisterTool('getScoreSummary');
  Agent.registerTool({name:'removePart',description:'パート削除',destructive:true,handler:()=>'deleted'});
  await assert.rejects(Agent.callTool('removePart',{part:1}),/確認/);
  assert.equal(await Agent.callTool('removePart',{part:1},{confirmed:true}),'deleted');
 }finally{
  Agent.unregisterTool('getScoreSummary');
  Agent.unregisterTool('removePart');
 }
 assert.equal(Agent.listTools().length,0);
});
