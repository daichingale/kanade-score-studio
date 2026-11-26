const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core');
const Agent=require('../src/agent');

test('system prompt tells a wind-band model how to call the score tools',()=>{
 const prompt=Agent.systemPrompt();
 assert.match(prompt,/吹奏楽/);
 assert.match(prompt,/記譜音/);
 assert.match(prompt,/insertNotes/);
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
