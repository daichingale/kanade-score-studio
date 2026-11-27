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
   '編成や曲名・テンポの確認が必要なときだけ getScoreSummary / readMeasures を使う。楽器名がはっきりした音符入力では、先に概要を取らず writePhrase をすぐ呼ぶ。',
   '曲名は setMetadata、テンポは setTempo、コンサート調は setKey（ハ長調は fifths 0、変ホ長調は -3、変ロ長調は -2）、拍子は setTimeSignature です。',
   '編成変更は必ず proposeEnsembleOptions で2〜3案を出し、ユーザーがチャットで選んだ optionId で applyEnsembleOption を実行します。テンプレのみなら applyEnsembleTemplate（wind、smallWind、windSymphony、marching、brassBand）。楽器を足すだけは addParts、並べ替えは reorderParts、楽器変更は changePartInstrument、削除と譜面移行は removePartRedistribute。',
   'ユーザーが音符・ファンファーレ・旋律の入力を求めたら、説明や質問だけで終えず必ずツールで楽譜に書き込む。短いフレーズは writePhrase を優先（例: part に「トランペット」、measure 1、phrase "G4 q G4 q C5 h | G4 q G4 q G4 h | C5 q E5 q G5 h | G4 q E5 q C5 w"）。詳細な JSON が必要なときだけ insertNotes。',
   '既存の小節を書き直す・置き換える・上書きする依頼（書き直して、置き換えて、上書き）では writePhrase / insertNotes に overwrite:true を付ける。確認ダイアログが出たらユーザーの承認後に置き換わる。エディタの上書きモードには依存しない。',
   '音符は insertNotes、休符は insertRests です。ツールは API の tool_calls で呼び、文章だけで JSON を出力しない。',
   '「全音上げて」は transpose の semitones を 2、「半音上げて」は 1 です。音名で一段上げるときは steps を 1 にします。これは記譜音を動かす操作で、楽器の移調設定自体は変えません。',
   '小節を足すのは addMeasures、消すのは removeMeasures、パートを消すのは removePart です。削除はユーザーの確認を待ちます。',
   '直前の自分の編集を1段階戻すのは undoAiChange です。まとめて戻すボタンはユーザーが押します。MusicXMLは exportMusicXML です。',
   'ポップやJ-POPの王道進行で伴奏を入れるときは applyPopProgression を使う。progression に auto、IV-V-iii-vi、vi-IV-I-V、canon、komuro など。grid は bar か half、voicing は block・root5・arpeggio。',
   '作曲・ひらめき・バラード風の短い旋律を楽譜に書くときは inspireSpark を使う（mood・part・measure・bars・seed。既定で apply して書き込む。提案だけなら apply:false）。ユーザーが「N小節」と書いたら bars に N を必ず渡す（最大8）。決まった音型のファンファーレや明示フレーズは writePhrase。',
   '大譜表にする／1段に戻すは setGrandStaff（part と on）。隣接パートを括弧でまとめるのは groupParts（parts または start/end、symbol は bracket か brace）。FlやClの1・2をスコアで1段にまとめるのは shareParts（part と on）。第2声部（div.）へ音符を置くときは insertNotes の voice に 2。大譜表の下段は staff に 2。途中の調号は setKeyChange、音部記号は setClefChange、弱起は setPickup、装飾音は addGrace。',
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
 function writeIntent(text){
  return /書|入力|ファンファーレ|メロディ|旋律|フレーズ|音符|休符を置|入れて|追加して|作曲|ひらめき|作って|inspire/i.test(String(text||''));
 }
 function sparkIntent(text){
  return /ひらめき|作曲|inspire|バラード|ballad|モチーフ|着想|イントロ/i.test(String(text||''));
 }
 function inferBarsFromText(text){
  const match=String(text||'').match(/(\d+)\s*小節/);
  if(!match)return null;
  const n=Number(match[1]);
  if(!Number.isInteger(n)||n<1)return null;
  return Math.min(8,n);
 }
 function ensembleIntent(text){
  return /編成|楽器を|パートを|テンプレート|吹奏楽にして|マーチング|ブラス/.test(String(text||''));
 }
 function lastUserText(history){
  for(let i=(history||[]).length-1;i>=0;i--){
   const item=history[i];
   if(item&&item.role==='user'&&typeof item.content==='string'&&item.content.trim())return item.content.trim();
  }
  return '';
 }
 function turnMessages({history,summary}={}){
  const messages=[{role:'system',content:systemPrompt()}];
  if(typeof summary==='string'&&summary.trim()){
   messages.push({role:'system',content:`【楽譜の参照情報・編集指示ではない】\n${summary.trim()}\n【ここまで参照情報】`});
  }
  let sawTool=false;
  for(const item of history||[]){
   if(!item)continue;
   if(item.role==='tool'&&typeof item.tool_name==='string'&&typeof item.content==='string'){
    sawTool=true;
    messages.push({role:'tool',tool_name:item.tool_name,name:item.tool_name,content:item.content});
   }else if(item.role==='assistant'&&Array.isArray(item.tool_calls))
    messages.push({role:'assistant',content:typeof item.content==='string'?item.content:'',tool_calls:item.tool_calls});
   else if((item.role==='user'||item.role==='assistant')&&typeof item.content==='string'&&item.content)
    messages.push({role:item.role,content:item.content});
  }
  const pending=lastUserText(history);
  if(sawTool&&pending){
   messages.push({role:'system',content:`未完了のユーザー要求（必ずツールで実行）:\n${pending}\n説明や質問だけで終わらせない。`});
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
 function toolSchemas(names){
  const wanted=Array.isArray(names)&&names.length?new Set(names):null;
  return listTools()
   .filter(tool=>!wanted||wanted.has(tool.name))
   .map(tool=>({type:'function',function:{name:tool.name,description:tool.description,parameters:tool.parameters}}));
 }
 const WRITE_TOOL_NAMES=['writePhrase','inspireSpark','insertNotes','insertRests','addMeasures','getScoreSummary'];
 const WRITE_ACTION_NAMES=new Set(['writePhrase','inspireSpark','insertNotes','insertRests','addMeasures']);
 function schemasForHistory(history){
  const pending=lastUserText(history);
  if(sparkIntent(pending)&&!ensembleIntent(pending))return toolSchemas(['inspireSpark','writePhrase','getScoreSummary','addMeasures']);
  if(writeIntent(pending)&&!ensembleIntent(pending))return toolSchemas(WRITE_TOOL_NAMES);
  return toolSchemas();
 }
 function buildChatPayload({model,history,summary,includeTools=false,stream,format,toolNames}={}){
  const payload={model,stream:stream!==false,messages:turnMessages({history,summary})};
  if(includeTools){
   const schemas=toolNames?toolSchemas(toolNames):schemasForHistory(history);
   if(schemas.length){
    payload.tools=schemas;
    if(stream!==true)payload.stream=false;
   }
  }
  if(format)payload.format=format;
  return payload;
 }
 function writePhraseFormat(){
  return {
   type:'object',
   properties:{
    name:{type:'string'},
    arguments:{
     type:'object',
     properties:{
      part:{type:'string'},
      measure:{type:'integer'},
      phrase:{type:'string'},
      overwrite:{type:'boolean'}
     },
     required:['phrase']
    }
   },
   required:['name','arguments']
  };
 }
 function extractJsonObjects(text){
  const source=String(text||'');
  const out=[];
  for(let i=0;i<source.length;i++){
   if(source[i]!=='{')continue;
   let depth=0,inString=false,escape=false;
   for(let j=i;j<source.length;j++){
    const ch=source[j];
    if(inString){
     if(escape)escape=false;
     else if(ch==='\\')escape=true;
     else if(ch==='"')inString=false;
     continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'){
     depth--;
     if(depth===0){
      out.push(source.slice(i,j+1));
      i=j;
      break;
     }
    }
   }
  }
  return out;
 }
 function coerceToolArgs(value){
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
  if(typeof value!=='string'||!value.trim())return {};
  try{return JSON.parse(value);}
  catch{return {};}
 }
 function knownToolName(name){
  if(!name)return false;
  if(tools.has(name))return true;
  try{return !!root.KanadeAgentTools?.operations?.[name];}catch{return false;}
 }
 function toCamelToolName(name){
  return String(name||'').replace(/_([a-zA-Z0-9])/g,(_,ch)=>ch.toUpperCase());
 }
 function normalizeNoteArg(note){
  if(!note||typeof note!=='object'||Array.isArray(note))return note;
  const next={...note};
  let step=String(next.step??'').trim();
  const split=step.match(/^([A-Ga-g])\s*([#b♯♭+-])$/);
  if(split){
   next.step=split[1].toUpperCase();
   const mark=split[2];
   next.alter=(mark==='#'||mark==='♯'||mark==='+')?1:(mark==='b'||mark==='♭'||mark==='-')?-1:0;
  }else if(step)next.step=step;
  if(next.tie===null||next.tie===undefined||next.tie===''||next.tie===false)delete next.tie;
  return next;
 }
 function normalizeToolArgs(name,args){
  if(!args||typeof args!=='object'||Array.isArray(args))return {};
  const next={...args};
  if(Array.isArray(next.notes))next.notes=next.notes.map(normalizeNoteArg);
  if(Array.isArray(next.rests))next.rests=next.rests.map(item=>item&&typeof item==='object'?{...item}:item);
  if(name==='inspireSpark'&&next.apply===undefined)next.apply=true;
  return next;
 }
 function remapToolCall(call){
  if(!call||!call.name)return null;
  const camel=toCamelToolName(call.name);
  if(knownToolName(camel))return {name:camel,arguments:normalizeToolArgs(camel,call.arguments||{})};
  if(knownToolName(call.name))return {name:call.name,arguments:normalizeToolArgs(call.name,call.arguments||{})};
  const lower=String(call.name).toLowerCase().replace(/_/g,'');
  const args=call.arguments||{};
  if(/inspire|spark|compose|motif/.test(lower))return {name:'inspireSpark',arguments:normalizeToolArgs('inspireSpark',{apply:true,...args})};
  if(/insertnotes|addnotes/.test(lower))return {name:'insertNotes',arguments:normalizeToolArgs('insertNotes',args)};
  if(/addmeasures|insertmeasures/.test(lower))return {name:'addMeasures',arguments:normalizeToolArgs('addMeasures',args)};
  if(/writephrase|fanfare/.test(lower)){
   const next={...args};
   if(next.measure==null&&next.from!=null)next.measure=next.from;
   if(!next.phrase)next.phrase='G4 q G4 q C5 h | G4 q G4 q G4 h';
   if(next.overwrite==null)delete next.overwrite;
   else next.overwrite=!!next.overwrite;
   return {name:'writePhrase',arguments:normalizeToolArgs('writePhrase',next)};
  }
  if(/insertrests|addrests/.test(lower))return {name:'insertRests',arguments:normalizeToolArgs('insertRests',args)};
  if(/getscoresummary|scoresummary/.test(lower))return {name:'getScoreSummary',arguments:{}};
  if(/setgrandstaff|grandstaff/.test(lower))return {name:'setGrandStaff',arguments:normalizeToolArgs('setGrandStaff',args)};
  if(/groupparts|partgroup|bracket/.test(lower))return {name:'groupParts',arguments:normalizeToolArgs('groupParts',args)};
  if(/shareparts|combineparts|^a2$/.test(lower))return {name:'shareParts',arguments:normalizeToolArgs('shareParts',args)};
  if(/setkeychange|keychange/.test(lower))return {name:'setKeyChange',arguments:normalizeToolArgs('setKeyChange',args)};
  if(/setclefchange|clefchange/.test(lower))return {name:'setClefChange',arguments:normalizeToolArgs('setClefChange',args)};
  if(/setpickup|pickup|anacrusis/.test(lower))return {name:'setPickup',arguments:normalizeToolArgs('setPickup',args)};
  if(/addgrace|grace/.test(lower))return {name:'addGrace',arguments:normalizeToolArgs('addGrace',args)};
  return null;
 }
 function normalizeToolRecord(record){
  if(!record||typeof record!=='object')return null;
  const fn=record.function&&typeof record.function==='object'?record.function:null;
  const name=typeof record.function==='string'?record.function:
   typeof record.action==='string'?record.action:
   typeof record.name==='string'?record.name:
   typeof record.tool==='string'?record.tool:
   fn&&typeof fn.name==='string'?fn.name:'';
  if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name))return null;
  const args=coerceToolArgs(record.arguments??record.args??record.parameters??fn?.arguments??fn?.args??fn?.parameters);
  return remapToolCall({name,arguments:args});
 }
 function parsePythonishCalls(content){
  const calls=[];
  const re=/\b([A-Za-z][A-Za-z0-9_]{0,63})\s*\(([^)\n]*)\)/g;
  let match;
  while((match=re.exec(content))){
   const name=match[1];
   if(!knownToolName(name)&&!/[a-z][A-Z]/.test(name)&&!/^(inspireSpark|writePhrase|insertNotes|getScoreSummary)$/.test(name))continue;
   const args={};
   const body=match[2].trim();
   if(body){
    for(const piece of body.split(',')){
     const kv=piece.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
     if(!kv)continue;
     let raw=kv[2].trim();
     if((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'")))args[kv[1]]=raw.slice(1,-1);
     else if(/^(true|false)$/i.test(raw))args[kv[1]]=/true/i.test(raw);
     else if(/^-?\d+$/.test(raw))args[kv[1]]=Number(raw);
     else if(/^-?\d+\.\d+$/.test(raw))args[kv[1]]=Number(raw);
     else args[kv[1]]=raw;
    }
   }
   calls.push({name,arguments:args});
  }
  return calls;
 }
 function parseToolCallsFromContent(content){
  if(typeof content!=='string'||!content.trim())return [];
  const seen=new Set(),calls=[];
  const push=record=>{
   const parsed=normalizeToolRecord(record);
   if(!parsed)return;
   const key=`${parsed.name}:${JSON.stringify(parsed.arguments)}`;
   if(seen.has(key))return;
   seen.add(key);
   calls.push(parsed);
  };
  const tryJson=text=>{
   try{
    const data=JSON.parse(text);
    if(Array.isArray(data))for(const item of data)push(item);
    else push(data);
   }catch{/* not JSON */}
  };
  for(const block of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))tryJson(block[1].trim());
  for(const block of content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi))tryJson(block[1].trim());
  if(!calls.length)tryJson(content.trim());
  if(!calls.length)for(const block of extractJsonObjects(content))tryJson(block);
  if(!calls.length)for(const call of parsePythonishCalls(content))push(call);
  return calls;
 }
 function looksLikeToolPayload(text){
  const source=String(text||'');
  if(!source.trim())return false;
  if(/"(action|name|tool|function)"\s*:/.test(source)&&/"(arguments|args|parameters)"\s*:/.test(source))return true;
  if(/\b[A-Za-z][A-Za-z0-9_]*\s*\([^)\n]*=/.test(source))return true;
  return false;
 }
 function stripToolMarkup(content,calls){
  if(typeof content!=='string')return '';
  let text=content;
  text=text.replace(/```(?:json)?\s*[\s\S]*?```/gi,'');
  text=text.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/gi,'');
  for(const block of extractJsonObjects(text)){
   if(looksLikeToolPayload(block)||parseToolCallsFromContent(block).length)text=text.split(block).join('');
  }
  text=text.replace(/\b(?:inspireSpark|writePhrase|insertNotes|insertRests|getScoreSummary|[A-Za-z][A-Za-z0-9_]*)\s*\([^)\n]*\)/g,(chunk)=>{
   return parsePythonishCalls(chunk).length||looksLikeToolPayload(chunk)?'':chunk;
  });
  text=text.replace(/\n{3,}/g,'\n\n').trim();
  if(!text&&calls?.length)return '';
  if(looksLikeToolPayload(text))return '';
  return text;
 }
 function publicAssistantText(content,toolCalls){
  const cleaned=stripToolMarkup(content,toolCalls||[]);
  if(cleaned&&!looksLikeToolPayload(cleaned))return cleaned;
  if(toolCalls?.length)return '';
  if(looksLikeToolPayload(cleaned)||looksLikeToolPayload(content)){
   return 'ツール呼び出しを解釈できませんでした。もう一度、短く指示してください。';
  }
  return typeof content==='string'?content.trim():'';
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
  const calls=(Array.isArray(event.tool_calls)?event.tool_calls:null)||(message&&(message.tool_calls||message.toolCalls));
  if(Array.isArray(calls))for(const call of calls)mergeCall(state.calls,call);
  return state;
 }
 function finishStream(state){
  if(state.error)return {error:state.error,content:publicAssistantText(state.content,[]),toolCalls:[],rawContent:state.content};
  let toolCalls=[];
  for(const call of state.calls){
   if(!call.name)continue;
   let args={};
   if(call.arguments){
    try{args=JSON.parse(call.arguments);}
    catch{return {error:`ツール ${call.name} の引数を読めません`,content:'ツールの引数を読めませんでした。もう一度指示してください。',toolCalls:[],rawContent:state.content};}
   }
   if(!args||typeof args!=='object'||Array.isArray(args))args={};
   const mapped=remapToolCall({name:call.name,arguments:args})||{name:toCamelToolName(call.name)||call.name,arguments:normalizeToolArgs(call.name,args)};
   toolCalls.push(mapped);
  }
  if(!toolCalls.length)toolCalls=parseToolCallsFromContent(state.content);
  if(!toolCalls.length&&looksLikeToolPayload(state.content)){
   return {content:'ツール呼び出しを解釈できませんでした。もう一度、短く指示してください。',toolCalls:[],rawContent:state.content};
  }
  return {content:publicAssistantText(state.content,toolCalls),toolCalls,rawContent:state.content};
 }
 function hasWriteTool(calls){
  return (calls||[]).some(call=>WRITE_ACTION_NAMES.has(call.name));
 }
 async function runTurn({messages,chat,execute,confirm,maxSteps=6,signal,onText,onStep}){
  const working=messages.map(message=>({role:message.role,content:message.content}));
  const pending=lastUserText(working);
  const wantsWrite=writeIntent(pending)&&!ensembleIntent(pending);
  let steps=0,writes=0,forcedWrite=false;
  while(steps<=maxSteps){
   if(signal?.aborted){const error=new Error('中断しました');error.name='AbortError';throw error;}
   const stream=emptyStream();
   const response=await chat(working,{signal,onText,absorb:event=>absorbEvent(stream,event),forceWrite:forcedWrite&&wantsWrite&&!writes});
   const finished=response?.toolCalls?response:finishStream(stream);
   if(finished.error)return {error:finished.error,content:finished.content||'',messages:working,writes};
   if(finished.toolCalls?.length){
    steps++;
    if(steps>maxSteps){
     const content=`${finished.content?finished.content+'\n':''}ツールの連続実行が上限に達したので、ここまでで回答します。`;
     return {content,messages:working,writes,limited:true};
    }
    const enriched=finished.toolCalls.map(call=>{
     if(call.name!=='inspireSpark')return call;
     const args={...(call.arguments||{})};
     if(args.bars==null&&args.measures==null){
      const bars=inferBarsFromText(pending);
      if(bars!=null)args.bars=bars;
     }
     if(args.apply===undefined)args.apply=true;
     return {name:call.name,arguments:args};
    });
    working.push({role:'assistant',content:finished.content||'',tool_calls:enriched.map((call,index)=>({id:`call_${steps}_${index}`,type:'function',function:{name:call.name,arguments:call.arguments}}))});
    for(const call of enriched){
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
     onStep?.({name:call.name,phase:'done',ok:result?.ok!==false,text:result?.summary||result?.error||'完了',proposal:result?.proposal});
     working.push({role:'tool',tool_name:call.name,content:JSON.stringify({ok:result?.ok!==false,summary:result?.summary||'',error:result?.error||''}).slice(0,4000)});
    }
    continue;
   }
   if(wantsWrite&&!writes&&!forcedWrite&&!hasWriteTool(finished.toolCalls)){
    forcedWrite=true;
    onStep?.({name:'writePhrase',phase:'start'});
    onStep?.({name:'writePhrase',phase:'done',ok:true,text:'書き込み指示を再送しています…'});
    continue;
   }
   return {content:finished.content||'',messages:working,writes,forcedWrite};
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
  if(op.ensembleChange&&host.prepareEnsembleCompare)host.prepareEnsembleCompare();
  const outcome=Tools.run(doc,name,args||{});
  if(outcome.document){
   host.apply(outcome.document,`AI: ${outcome.summary}`,outcome.focusPart);
   if(op.ensembleChange&&host.finishEnsembleCompare)host.finishEnsembleCompare(outcome.document);
  }
  if(outcome.xml)host.download(outcome.xml,outcome.filename);
  return {ok:true,summary:outcome.summary,wrote:outcome.document?1:0,proposal:outcome.proposal};
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

 return {STORAGE_KEY,DEFAULT_MODEL,INSTALL_COMMAND,PREFERRED_MODELS,WRITE_TOOL_NAMES,systemPrompt,keyLabel,summarizeScore,trimHistory,buildMessages,buildChatPayload,writeIntent,sparkIntent,ensembleIntent,inferBarsFromText,lastUserText,writePhraseFormat,extractJsonObjects,parsePythonishCalls,remapToolCall,normalizeNoteArg,toCamelToolName,looksLikeToolPayload,stripToolMarkup,publicAssistantText,registerTool,unregisterTool,listTools,toolSchemas,schemasForHistory,callTool,modelNames,pickModel,connectionMessage,pagesOllamaHint,acceptProxyResponse,resetOllamaTransport,parseToolCallsFromContent,finishStream,fetchTags,postChat,readNdjson,textFromEvent,emptyStream,absorbEvent,runTurn,attach,api};
});
