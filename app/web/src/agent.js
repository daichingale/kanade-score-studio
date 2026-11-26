/* Local wind-band assistant: prompts, the Ollama tool loop, and the score command API. */
(function(root, factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeAgent=api;
 root.kanadeAgent=api.api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const STORAGE_KEY='kanade.agent.chat.v1';
 const DEFAULT_MODEL='qwen2.5:7b';
 const INSTALL_COMMAND='ollama pull qwen2.5:7b';
 const PREFERRED_MODELS=[DEFAULT_MODEL,'qwen3:8b','qwen2.5:14b','qwen3:14b','qwen2.5:3b','qwen3:4b','qwen2.5:32b','qwen3:32b'];
 const HISTORY_LIMIT=40;
 const MESSAGE_LIMIT=8000;
 const MAJOR=['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];
 const MINOR=['A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯','G♯','D♯','A♯'];
 const MAJOR_JA=['変ハ長調','変ト長調','変ニ長調','変イ長調','変ホ長調','変ロ長調','ヘ長調','ハ長調','ト長調','ニ長調','イ長調','ホ長調','ロ長調','嬰ヘ長調','嬰ハ長調'];
 const MINOR_JA=['変イ短調','変ホ短調','変ロ短調','ヘ短調','ハ短調','ト短調','ニ短調','イ短調','ホ短調','ロ短調','嬰ヘ短調','嬰ハ短調','嬰ト短調','嬰ニ短調','嬰イ短調'];
 const CLEF_LABELS={treble:'ト音',bass:'ヘ音',alto:'アルト',tenor:'テナー',percussion:'打楽器'};
 const TRANSPOSITION_LABELS={
  concert:'実音（C）',bb:'B♭管（長2度下）',bbHigh:'B♭管（短7度上）',bbBass:'B♭管（長9度下）',bbContra:'B♭管（長16度下）',
  eb:'E♭管（長6度下）',ebHigh:'E♭管（短3度上）',ebBass:'E♭管（長13度下）',ebContra:'E♭管（長20度下）',
  f:'F管（完全5度下）',a:'A管（短3度下）',g:'G管（完全4度下）',
  octaveUp:'記譜より1オクターブ上',octaveDown:'記譜より1オクターブ下',twoOctavesUp:'記譜より2オクターブ上',twoOctavesDown:'記譜より2オクターブ下'
 };
 const tools=new Map();

 function systemPrompt(){
  return [
   'あなたは吹奏楽とマーチングバンドの専門家です。Kanadeの中で相談に答え、必要ならツールで楽譜を編集します。返答は日本語で、結論を先に短く書きます。',
   '音符は記譜音です。B♭クラリネットとB♭トランペットは実音より長2度高く、E♭アルトサックスは長6度高く、Fホルンは完全5度高く書きます。ユーザーが実音を言ったときは、その楽器の記譜音に直してから入力します。',
   'パート番号と小節番号は1から数えます。引数は指定された項目だけを使い、余分な文章をJSONに混ぜません。',
   '編集の前に getScoreSummary を呼びます。音符の中身が必要なときだけ readMeasures を使います。',
   '曲名は setMetadata、テンポは setTempo、コンサート調は setKey（ハ長調は fifths 0、変ホ長調は -3、変ロ長調は -2）、拍子は setTimeSignature です。',
   '「吹奏楽編成にして」は applyEnsembleTemplate です。空の楽譜なら id に wind または smallWind を渡します。音符がある楽譜を入れ替えるときだけ replace を true にします。楽器を足すだけなら addParts に keys を渡します。',
   '音符は insertNotes、休符は insertRests です。4小節のファンファーレなら measure 1、beat 1 から、四分音符は den 4 の配列を一度に渡します。既存の音符を置き換えるときだけ overwrite を true にします。',
   '「全音上げて」は transpose の semitones を 2、「半音上げて」は 1 です。音名で一段上げるときは steps を 1 にします。これは記譜音を動かす操作で、楽器の移調設定自体は変えません。',
   '小節を足すのは addMeasures、消すのは removeMeasures、パートを消すのは removePart です。削除はユーザーの確認を待ちます。',
   '直前の自分の編集を1段階戻すのは undoAiChange です。まとめて戻すボタンはユーザーが押します。MusicXMLは exportMusicXML です。',
   'ポップやJ-POPの王道進行で伴奏を入れるときは applyPopProgression を使う。progression に auto、IV-V-iii-vi、vi-IV-I-V、canon、komuro など。grid は bar か half、voicing は block・root5・arpeggio。',
   '作曲の着想を提案するときは inspireSpark を使う。seed で再現、mood で雰囲気を指定。ユーザーが採用したいときだけ apply を true。',
   '人数や足りない楽器から編成を考えるときは proposeInstrumentation を使う。headcountは人数、missingは抜く楽器、styleはconcert、small、marching、bright、levelは初級、中級、上級。確認が出るまで楽譜は変えない。',
   '旋律を編成に広げるときは arrangeMelody を使う。音程や移調の計算はせず、doublePart、voiceChords、fixRanges、getInstrumentRanges、checkRanges に任せる。書き終えたら checkRanges の結果を日本語で伝える。',
   'ツールは必要な回数だけ使い、同じ失敗を繰り返しません。コンクール規定や著作権は記憶だけで断定しません。音域は指定された難易度の実用音域に合わせます。'
  ].join('\n');
 }

 function text(value,max=80){
  if(typeof value!=='string')return '';
  return value.replace(/\s+/g,' ').trim().slice(0,max);
 }
 function keyLabel(fifths){
  if(!Number.isInteger(fifths)||fifths<-7||fifths>7)return '不明';
  const index=fifths+7;
  const accidentals=fifths===0?'調号なし':fifths>0?`シャープ${fifths}個`:`フラット${-fifths}個`;
  return `${MAJOR_JA[index]}（${MAJOR[index]}）/ ${MINOR_JA[index]}（${MINOR[index]}）・${accidentals}`;
 }
 function partsOf(doc){
  const {ensembleParts,...first}=doc;
  const parts=[first];
  if(Array.isArray(ensembleParts))parts.push(...ensembleParts.filter(part=>part&&typeof part==='object'));
  return parts;
 }
 function timeLabel(part){
  const time=part?.time;
  const base=time&&Number.isInteger(time.num)&&Number.isInteger(time.den)?`${time.num}/${time.den}`:'不明';
  const changes=Array.isArray(part?.measures)?part.measures.filter(measure=>measure&&measure.time).length:0;
  return changes?`${base}（小節ごとの拍子変更 ${changes}）`:base;
 }
 function partLine(part,index){
  const name=text(part.instrument)||text(part.printName)||'無名';
  const clef=CLEF_LABELS[part.clef]||text(part.clef)||'ト音';
  const transposition=TRANSPOSITION_LABELS[part.transposition||'concert']||text(part.transposition)||'実音（C）';
  const bars=Array.isArray(part.measures)?part.measures.length:0;
  return `${index+1}. ${name} / ${clef} / ${transposition} / 調号 ${keyLabel(part.key)} / ${bars}小節`;
 }
 function summarizeScore(doc,position){
  if(!doc||typeof doc!=='object'||doc.schema!=='kanade.web.v1')return 'いま開いている楽譜の概要は取得できません。';
  const parts=partsOf(doc).slice(0,32);
  const first=parts[0]||{};
  const lines=[
   'いま開いている楽譜（読み取り専用）:',
   `曲名: ${text(doc.title,200)||'なし'}`,
   `作曲者: ${text(doc.composer,120)||'なし'}`,
   `テンポ: ${Number.isFinite(Number(doc.tempo))?`♩=${doc.tempo}`:'不明'}`,
   `拍子: ${timeLabel(first)}`,
   `パート数: ${parts.length}`
  ];
  if(position&&typeof position.measureId==='string'){
   for(const part of parts){
    const measures=Array.isArray(part.measures)?part.measures:[];
    const index=measures.findIndex(measure=>measure&&measure.id===position.measureId);
    if(index>=0){lines.push(`編集位置: ${text(part.instrument)||'パート'} の ${index+1} 小節目`);break;}
   }
  }
  lines.push('パート:');
  parts.forEach((part,index)=>lines.push(partLine(part,index)));
  return lines.join('\n');
 }

 function trimHistory(history){
  const clean=[];
  for(const item of history||[]){
   if(!item||(item.role!=='user'&&item.role!=='assistant')||typeof item.content!=='string')continue;
   const content=item.content.slice(0,MESSAGE_LIMIT);
   if(!content.trim())continue;
   clean.push({role:item.role,content});
  }
  return clean.slice(-HISTORY_LIMIT);
 }
 function buildMessages({history,summary}={}){
  const messages=[{role:'system',content:systemPrompt()}];
  if(typeof summary==='string'&&summary.trim())messages.push({role:'system',content:summary.trim()});
  for(const item of trimHistory(history))messages.push({role:item.role,content:item.content});
  return messages;
 }
 function turnMessages({history,summary}={}){
  const messages=[{role:'system',content:systemPrompt()}];
  if(typeof summary==='string'&&summary.trim())messages.push({role:'system',content:summary.trim()});
  for(const item of history||[]){
   if(!item)continue;
   if(item.role==='tool'&&typeof item.tool_name==='string'&&typeof item.content==='string')
    messages.push({role:'tool',tool_name:item.tool_name,content:item.content});
   else if(item.role==='assistant'&&Array.isArray(item.tool_calls))
    messages.push({role:'assistant',content:typeof item.content==='string'?item.content:'',tool_calls:item.tool_calls});
   else if((item.role==='user'||item.role==='assistant')&&typeof item.content==='string'&&item.content)
    messages.push({role:item.role,content:item.content});
  }
  return messages;
 }
 function registerTool(tool){
  if(!tool||typeof tool.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(tool.name))throw new Error('ツール名が不正です');
  if(typeof tool.description!=='string'||typeof tool.handler!=='function')throw new Error('ツールの定義が不足しています');
  if(tools.has(tool.name))throw new Error('同じ名前のツールがあります');
  tools.set(tool.name,{
   name:tool.name,description:tool.description,
   parameters:tool.parameters&&typeof tool.parameters==='object'&&!Array.isArray(tool.parameters)?tool.parameters:{type:'object',properties:{}},
   destructive:!!tool.destructive,handler:tool.handler
  });
 }
 function unregisterTool(name){tools.delete(name);}
 function listTools(){
  return [...tools.values()].map(({handler,...meta})=>({...meta,parameters:JSON.parse(JSON.stringify(meta.parameters))}));
 }
 function toolSchemas(){
  return listTools().map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}}));
 }
 function buildChatPayload({model,history,summary,includeTools=false}={}){
  const payload={model,stream:true,messages:turnMessages({history,summary})};
  if(includeTools){
   const schemas=toolSchemas();
   if(schemas.length)payload.tools=schemas;
  }
  return payload;
 }
 async function callTool(name,args,{confirmed=false}={}){
  const tool=tools.get(name);
  if(!tool)throw new Error('未登録のツールです');
  if(tool.destructive&&!confirmed){
   const error=new Error('この操作は実行前の確認が必要です');
   error.confirmation={name:tool.name,description:tool.description,args};
   throw error;
  }
  return tool.handler(args);
 }
 function modelNames(tags){
  const models=tags&&Array.isArray(tags.models)?tags.models:[];
  const names=[];
  for(const model of models){
   const name=typeof model==='string'?model:model&&typeof model.name==='string'?model.name:'';
   if(name&&!names.includes(name))names.push(name);
  }
  return names;
 }
 function pickModel(available,saved){
  const names=(available||[]).filter(name=>typeof name==='string'&&name);
  if(saved&&names.includes(saved))return saved;
  for(const preferred of PREFERRED_MODELS)if(names.includes(preferred))return preferred;
  return names.find(name=>/qwen/i.test(name))||names[0]||'';
 }
 const OLLAMA_ORIGIN='http://127.0.0.1:11434';
 let ollamaTransport=null;
 function acceptProxyResponse(response){
  return response.ok||response.status===401||response.status===403||response.status===503;
 }
 function resetOllamaTransport(){ollamaTransport=null;}
 function appPath(path){
  return root.KanadePath?.resolve(path)||path;
 }
 function pagesOrigin(){
  try{return typeof location==='object'&&location.origin?location.origin:'';}catch{return '';}
 }
 function isHttpsStaticHost(){
  try{return typeof location==='object'&&location.protocol==='https:'&&!root.__KANADE_DEV__;}catch{return false;}
 }
 function pagesOllamaHint(){
  const origin=pagesOrigin();
  const allow=origin?`OLLAMA_ORIGINS="${origin}" `:'OLLAMA_ORIGINS="（このサイトのURL）" ';
  return `GitHub Pages など静的ホストからは、同じPCの Ollama にブラウザが直接つながります。別ターミナルで次のように起動してください。\n\n${allow}ollama serve\n${INSTALL_COMMAND}\n\nその後「再接続」を押します。ローカル開発（npm run dev）のときは開発サーバーのプロキシ経由のままです。Ollama を起動しない場合は相談パネルだけ使えませんが、楽譜編集は続けられます。`;
 }
 function connectionMessage(kind,{direct=false,cors=false}={}){
   const pages=isHttpsStaticHost();
  if(kind==='empty')return `Ollama は起動していますが、使えるモデルがありません。ターミナルで次を実行してから「再接続」を押してください。\n\n${INSTALL_COMMAND}${pages?'\n\n'+pagesOllamaHint():''}`;
  if(kind==='missing')return `選んだモデルが Ollama にありません。ターミナルで次を実行してから「再接続」を押してください。\n\n${INSTALL_COMMAND}\n\nメモリが少ない場合は ollama pull qwen2.5:3b も使えます。`;
  if(cors&&pages)return `${pagesOllamaHint()}\n\nブラウザが Ollama への接続を拒否した場合は、OLLAMA_ORIGINS にこのページの URL（${pagesOrigin()}）が入っているか確認してください。`;
  const intro=direct&&pages?'ローカルの Ollama（127.0.0.1:11434）に接続できません。':'Ollama に接続できません。別のターミナルで Ollama を起動してください。';
  return `${intro}\n\nollama serve\n${INSTALL_COMMAND}\n\n起動後に「再接続」を押してください。譜面の編集はこのまま続けられます。${pages&&!direct?'\n\n'+pagesOllamaHint():''}`;
 }
 async function fetchTags(init){
  const proxy=appPath('/__agent/tags');
  if(root.__KANADE_DEV__){
   const response=await fetch(proxy,{...init,cache:'no-store'});
   ollamaTransport='proxy';
   return {response,mode:'proxy'};
  }
  try{
   const response=await fetch(proxy,{...init,cache:'no-store'});
   if(acceptProxyResponse(response)){ollamaTransport='proxy';return {response,mode:'proxy'};}
  }catch{/* static host: no dev proxy */}
  try{
   const response=await fetch(`${OLLAMA_ORIGIN}/api/tags`,{...init,cache:'no-store',mode:'cors'});
   ollamaTransport='direct';
   return {response,mode:'direct'};
  }catch(error){
   const failure=new Error(error.message||'fetch failed');
   failure.cors=true;
   throw failure;
  }
 }
 async function postChat(payload,init){
  const proxy=appPath('/__agent/chat');
  const body=JSON.stringify(payload);
  const headers={'Content-Type':'application/json',...(init?.headers||{})};
  const viaProxy=()=>fetch(proxy,{...init,method:'POST',headers,body,cache:'no-store'});
  const viaDirect=()=>fetch(`${OLLAMA_ORIGIN}/api/chat`,{...init,method:'POST',headers,body,cache:'no-store',mode:'cors'});
  if(root.__KANADE_DEV__)return viaProxy();
  if(ollamaTransport==='direct')return viaDirect();
  if(ollamaTransport==='proxy'){
   try{
    const response=await viaProxy();
    if(acceptProxyResponse(response))return response;
   }catch{/* proxy gone */}
   ollamaTransport='direct';
   return viaDirect();
  }
  try{
   const response=await viaProxy();
   if(acceptProxyResponse(response)){ollamaTransport='proxy';return response;}
  }catch{/* static host */}
  ollamaTransport='direct';
  return viaDirect();
 }
 function readNdjson(buffer,{flush=false}={}){
  let source=String(buffer??'');
  if(flush&&source.trim()&&!source.endsWith('\n'))source+='\n';
  const lines=source.split('\n');
  const rest=lines.pop()??'';
  const events=[];
  for(const line of lines){
   const trimmed=line.trim();
   if(!trimmed)continue;
   try{events.push(JSON.parse(trimmed));}
   catch{events.push({error:'応答の形式を読み取れませんでした'});}
  }
  return {events,rest};
 }
 function textFromEvent(event){
  if(!event||typeof event!=='object')return {content:''};
  if(typeof event.error==='string'&&event.error.trim())return {error:event.error.trim()};
  const content=event.message&&typeof event.message.content==='string'?event.message.content:'';
  return {content,done:event.done===true};
 }
 function emptyStream(){return {content:'',calls:[],error:''};}
 function mergeCall(calls,call){
  const fn=call?.function||{};
  let slot=call?.id?calls.find(item=>item.id===call.id):null;
  if(!slot&&Number.isInteger(call?.index))slot=calls[call.index];
  if(!slot){slot={id:call?.id||'',name:'',arguments:''};calls.push(slot);}
  if(typeof fn.name==='string'&&fn.name)slot.name=fn.name;
  if(fn.arguments&&typeof fn.arguments==='object')slot.arguments=JSON.stringify(fn.arguments);
  else if(typeof fn.arguments==='string'){
   slot.arguments=fn.arguments.startsWith('{')&&slot.arguments.startsWith('{')?fn.arguments:slot.arguments+fn.arguments;
  }
 }
 function absorbEvent(state,event){
  if(!event||typeof event!=='object')return state;
  if(typeof event.error==='string'&&event.error.trim())state.error=event.error.trim();
  const message=event.message;
  if(message&&typeof message.content==='string')state.content+=message.content;
  const calls=message&&(message.tool_calls||message.toolCalls);
  if(Array.isArray(calls))for(const call of calls)mergeCall(state.calls,call);
  return state;
 }
 function finishStream(state){
  if(state.error)return {error:state.error,content:state.content,toolCalls:[]};
  const toolCalls=[];
  for(const call of state.calls){
   if(!call.name)continue;
   let args={};
   if(call.arguments){
    try{args=JSON.parse(call.arguments);}
    catch{return {error:`ツール ${call.name} の引数を読めません`,content:state.content,toolCalls:[]};}
   }
   if(!args||typeof args!=='object'||Array.isArray(args))args={};
   toolCalls.push({name:call.name,arguments:args});
  }
  return {content:state.content,toolCalls};
 }
 async function runTurn({messages,chat,execute,confirm,maxSteps=6,signal,onText,onStep}){
  const working=messages.map(message=>({role:message.role,content:message.content}));
  let steps=0,writes=0;
  while(steps<=maxSteps){
   if(signal?.aborted){const error=new Error('中断しました');error.name='AbortError';throw error;}
   const stream=emptyStream();
   const response=await chat(working,{signal,onText,absorb:event=>absorbEvent(stream,event)});
   const finished=response?.toolCalls?response:finishStream(stream);
   if(finished.error)return {error:finished.error,content:finished.content||'',messages:working,writes};
   if(finished.toolCalls?.length){
    steps++;
    if(steps>maxSteps){
     const content=`${finished.content?finished.content+'\n':''}ツールの連続実行が上限に達したので、ここまでで回答します。`;
     return {content,messages:working,writes,limited:true};
    }
    working.push({role:'assistant',content:finished.content||'',tool_calls:finished.toolCalls.map(call=>({function:{name:call.name,arguments:call.arguments}}))});
    for(const call of finished.toolCalls){
     onStep?.({name:call.name,phase:'start'});
     let result;
     try{result=await execute(call);}
     catch(error){
      if(error?.confirmation){
       onStep?.({name:call.name,phase:'confirm',text:error.confirmation.summary});
       const accepted=confirm?await confirm(error.confirmation):false;
       if(!accepted)result={ok:false,error:'ユーザーが実行をやめました'};
       else try{result=await execute(call,{confirmed:true});}
       catch(failure){result={ok:false,error:failure instanceof Error?failure.message:String(failure)};}
      }else result={ok:false,error:error instanceof Error?error.message:String(error)};
     }
     if(result?.wrote)writes+=result.wrote;
     onStep?.({name:call.name,phase:'done',ok:result?.ok!==false,text:result?.summary||result?.error||'完了'});
     working.push({role:'tool',tool_name:call.name,content:JSON.stringify({ok:result?.ok!==false,summary:result?.summary||'',error:result?.error||''}).slice(0,4000)});
    }
    continue;
   }
   return {content:finished.content||'',messages:working,writes};
  }
  return {content:'ツールの連続実行が上限に達したので、ここまでで回答します。',messages:working,writes,limited:true};
 }
 let host=null;
 function dispatch(name,args,{confirmed=false}={}){
  const Tools=root.KanadeAgentTools;
  if(!Tools)throw new Error('楽譜ツールが読み込まれていません');
  if(!host)throw new Error('楽譜への接続がありません');
  const op=Tools.operations[name];
  if(!op)throw new Error('未登録のツールです');
  if(op.undo){host.undoAi(1);return {ok:true,summary:'直前のAI編集を1段階戻しました',wrote:-1};}
  const doc=host.getDocument();
  if(!confirmed){
   const summary=Tools.confirmText(doc,name,args||{});
   if(summary){const error=new Error('確認が必要です');error.confirmation={name,summary,args};throw error;}
  }
  const outcome=Tools.run(doc,name,args||{});
  if(outcome.document)host.apply(outcome.document,`AI: ${outcome.summary}`,outcome.focusPart);
  if(outcome.xml)host.download(outcome.xml,outcome.filename);
  return {ok:true,summary:outcome.summary,wrote:outcome.document?1:0};
 }
 function attach(next){
  host=next||null;
  const Tools=root.KanadeAgentTools;
  if(!Tools)return api;
  for(const tool of listTools())unregisterTool(tool.name);
  for(const spec of Tools.list()){
   registerTool({name:spec.name,description:spec.description,parameters:spec.parameters,destructive:spec.destructive,
    handler:(args,options)=>dispatch(spec.name,args,options)});
  }
  return api;
 }
 const api={
  attach,dispatch,list:()=>root.KanadeAgentTools?root.KanadeAgentTools.list():[],
  call:(name,args,options)=>dispatch(name,args,options),
  undo(count){if(!host?.undoAi)throw new Error('取り消せる編集がありません');host.undoAi(count);}
 };

 return {STORAGE_KEY,DEFAULT_MODEL,INSTALL_COMMAND,PREFERRED_MODELS,systemPrompt,keyLabel,summarizeScore,trimHistory,buildMessages,buildChatPayload,registerTool,unregisterTool,listTools,toolSchemas,callTool,modelNames,pickModel,connectionMessage,pagesOllamaHint,acceptProxyResponse,resetOllamaTransport,fetchTags,postChat,readNdjson,textFromEvent,emptyStream,absorbEvent,finishStream,runTurn,attach,api};
});
