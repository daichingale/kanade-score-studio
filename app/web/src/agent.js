/* Phase 1 consult-only assistant. Score tools can register here later; none ship yet. */
(function(root, factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.KanadeAgent=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
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
   'あなたは吹奏楽とマーチングバンドの指導・編曲に詳しい相談相手です。Kanadeという楽譜エディタの中で、ユーザーの質問に日本語で答えます。',
   '答える範囲は、編成とオーケストレーション、楽器の一般的な音域と移調、記譜の習慣、リハーサルと基礎練習、アンサンブルの合わせ方、マーチングのドリル・カウント・ステップ・セットの初歩です。',
   '結論を先に書き、そのあと理由と具体例を短く添えてください。必要なときだけ箇条書きにします。',
   '音域は「一般的な吹奏楽の記譜音域」として示し、学年、楽器、楽譜の習慣で変わることを添えてください。',
   'コンクール規定、著作権、人数制限、課題曲の指定は記憶だけで断定しないでください。確認が必要だと書いてください。',
   '開いている楽譜の概要が別のシステムメッセージで渡されることがあります。曲名・パート・小節数・テンポ・調だけの読み取り専用の要約です。要約に無い旋律や和音を、見たように話さないでください。',
   'この段階では楽譜を編集できません。音符の入力や削除を頼まれたら、Kanade上の操作を言葉で案内してください。',
   '医療診断はしないでください。身体の使い方で痛みがある場合は、指導者と医療機関に相談するよう添えてください。',
   'Kanadeの約束: 音符は記譜音です。実音との差はパートの transposition（concert、bb、eb、f など）で表します。編成の例は wind（吹奏楽）、smallWind（小編成吹奏楽）、windSymphony、marching です。'
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
  const payload={model,stream:true,messages:buildMessages({history,summary})};
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
 function connectionMessage(kind){
  if(kind==='empty')return `Ollama は起動していますが、使えるモデルがありません。ターミナルで次を実行してから「再接続」を押してください。\n\n${INSTALL_COMMAND}`;
  if(kind==='missing')return `選んだモデルが Ollama にありません。ターミナルで次を実行してから「再接続」を押してください。\n\n${INSTALL_COMMAND}\n\nメモリが少ない場合は ollama pull qwen2.5:3b も使えます。`;
  return `Ollama に接続できません。別のターミナルで Ollama を起動してください。\n\nollama serve\n${INSTALL_COMMAND}\n\n起動後に「再接続」を押してください。譜面の編集はこのまま続けられます。`;
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

 return {STORAGE_KEY,DEFAULT_MODEL,INSTALL_COMMAND,PREFERRED_MODELS,systemPrompt,keyLabel,summarizeScore,trimHistory,buildMessages,buildChatPayload,registerTool,unregisterTool,listTools,toolSchemas,callTool,modelNames,pickModel,connectionMessage,readNdjson,textFromEvent};
});
