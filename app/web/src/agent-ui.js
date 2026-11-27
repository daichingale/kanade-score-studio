/* Chat panel for the local Ollama assistant. Score edits go through kanadeAgent. */
(function(root){
 'use strict';
 const Agent=root.KanadeAgent;
 const $=id=>document.getElementById(id);
 const panel=$('agentPanel');
 if(!Agent||!panel)return;
 const shell=document.querySelector('.shell');
 const toggle=$('agentToggle');
 const mobile=$('agentMobile');
 const menu=$('agentMenu');
 const closeBtn=$('agentClose');
 const status=$('agentStatus');
 const select=$('agentModel');
 const reconnect=$('agentReconnect');
 const log=$('agentLog');
 const form=$('agentForm');
 const input=$('agentInput');
 const clearBtn=$('agentClear');
 const stopBtn=$('agentStop');
 const sendBtn=$('agentSend');
 let messages=[];
 let model='';
 let draft='';
 let liveSteps=[];
 let pendingConfirm=null;
 let pendingEnsembleChoices=null;
 let ensembleCompare=null;
 let debugOn=false;
 let lastDebug=null;
 let busy=false;
 let turn=0;
 let abort=null;

 function load(){
  try{
   const raw=JSON.parse(localStorage.getItem(Agent.STORAGE_KEY)||'null');
   model=raw&&typeof raw.model==='string'?raw.model:'';
   messages=Agent.trimHistory(raw&&raw.messages);
  }catch{model='';messages=[];}
 }
 function save(){
  try{localStorage.setItem(Agent.STORAGE_KEY,JSON.stringify({version:1,model,messages:messages.map(message=>({role:message.role,content:message.content}))}));}
  catch{/* The conversation remains on screen when storage is full. */}
 }
 function setStatus(text){status.textContent=text;}
 function setOpen(next){
  panel.hidden=!next;
  shell?.classList.toggle('agent-open',next);
  for(const button of [toggle,mobile,menu]){
   button?.setAttribute('aria-expanded',String(next));
   button?.setAttribute('aria-pressed',String(next));
  }
  if(next){render();refreshModels();input.focus();}
  else toggle?.focus({preventScroll:true});
 }
 function open(){if(panel.hidden)setOpen(true);else input.focus();}
 function close(){if(!panel.hidden)setOpen(false);}
 function togglePanel(){setOpen(panel.hidden);}
 function bubble(message){
  const item=document.createElement('div');
  item.className=`agent-msg ${message.role}${message.pending?' pending':''}`;
  item.textContent=message.content;
  return item;
 }
 function render(){
  log.replaceChildren();
  if(!messages.length&&!draft&&!liveSteps.length){
   const empty=document.createElement('p');
   empty.className='agent-empty';
   empty.textContent='吹奏楽とマーチングの編成、音域、移調、リハーサル、ドリルを相談できます。\n例:「小編成の吹奏楽にして」「トランペットに4小節のファンファーレを書いて」「クラリネットを全音上げて」\nAIの編集は元に戻せます。Ctrl+J で開閉、Enter で送信、Shift+Enter で改行です。';
   log.append(empty);
   return;
  }
  messages.forEach((message,index)=>{
   log.append(bubble(message));
   if(message.undoCount>0&&index===messages.length-1){
    const button=document.createElement('button');
    button.type='button';button.className='agent-undo';button.textContent='AIの変更を取り消す';
    button.addEventListener('click',()=>undoTurn(message));
    log.append(button);
   }
  });
  for(const step of liveSteps){
   const line=document.createElement('p');line.className='agent-step';line.textContent=step;log.append(line);
  }
  if(draft)log.append(bubble({role:'assistant',content:draft,pending:true}));
  if(pendingConfirm)log.append(pendingConfirm);
  if(pendingEnsembleChoices?.options?.length){
   const card=document.createElement('div');
   card.className='agent-confirm agent-ensemble-pick';
   const title=document.createElement('p');
   title.textContent='編成案を選んで適用してください。';
   card.append(title);
   for(const option of pendingEnsembleChoices.options){
    const button=document.createElement('button');
    button.type='button';
    button.textContent=`${option.title}`;
    button.title=option.reason||'';
    button.addEventListener('click',()=>applyEnsembleChoice(option.id));
    card.append(button);
   }
   const hint=document.createElement('p');
   hint.className='agent-ensemble-reason';
   hint.textContent=pendingEnsembleChoices.options.map((option,index)=>`${index+1}. ${option.reason||''}`).join('\n');
   card.append(hint);
   log.append(card);
  }
  if(ensembleCompare?.before&&ensembleCompare?.after){
   const card=document.createElement('div');
   card.className='agent-compare';
   const text=document.createElement('p');
   text.textContent='編成変更の比較: 切り替えて聴き比べできます（Undoも利用可）。';
   const actions=document.createElement('div');
   const before=document.createElement('button');
   before.type='button';
   before.textContent='変更前に戻す';
   before.setAttribute('aria-pressed',String(ensembleCompare.view==='before'));
   const after=document.createElement('button');
   after.type='button';
   after.textContent='変更後に戻す';
   after.setAttribute('aria-pressed',String(ensembleCompare.view!=='before'));
   before.addEventListener('click',()=>swapEnsembleView('before'));
   after.addEventListener('click',()=>swapEnsembleView('after'));
   actions.append(before,after);
   card.append(text,actions);
   log.append(card);
  }
  if(debugOn&&lastDebug){
   const card=document.createElement('pre');
   card.className='agent-debug';
   card.textContent=lastDebug;
   log.append(card);
  }
  log.scrollTop=log.scrollHeight;
 }
 function fillModels(names){
  select.replaceChildren();
  if(!names.length){
   const option=document.createElement('option');
   option.value='';option.textContent='モデルがありません';
   select.add(option);select.disabled=true;sendBtn.disabled=true;
   return;
  }
  select.disabled=false;
  model=Agent.pickModel(names,model);
  for(const name of names){
   const option=document.createElement('option');
   option.value=name;option.textContent=name;option.selected=name===model;
   select.add(option);
  }
  sendBtn.disabled=busy;
  save();
 }
 async function refreshModels(){
  setStatus('Ollama のモデル一覧を確認しています。');
  try{
   const {response,mode}=await Agent.fetchTags({});
   if(!response.ok){fillModels([]);setStatus(Agent.connectionMessage('unavailable',{direct:mode==='direct'}));return;}
   const names=Agent.modelNames(await response.json());
   fillModels(names);
   const via=mode==='direct'?'（このPCの Ollama に直接接続）':'';
   setStatus(names.length?`${connectedStatus()}${via}`:Agent.connectionMessage('empty'));
  }catch(error){
   fillModels([]);
   setStatus(Agent.connectionMessage('unavailable',{direct:true,cors:!!error.cors}));
  }
 }
 function connectedStatus(){
  return 'ローカルの Ollama に接続しています。AIの編集は元に戻せます。';
 }
 function confirmAction(info){
  return new Promise(resolve=>{
   const card=document.createElement('div');card.className='agent-confirm';
   const text=document.createElement('p');text.textContent=info.summary;
   const actions=document.createElement('div');
   const yes=document.createElement('button');yes.type='button';yes.textContent='実行';
   const no=document.createElement('button');no.type='button';no.textContent='やめる';
   const finish=value=>{pendingConfirm=null;resolve(value);render();};
   yes.addEventListener('click',()=>finish(true));
   no.addEventListener('click',()=>finish(false));
   actions.append(yes,no);card.append(text,actions);pendingConfirm=card;render();
  });
 }
 function setEnsembleCompare(state){
  ensembleCompare=state?.before&&state?.after?{before:true,after:true,view:state.view||'after'}:null;
  render();
 }
 async function applyEnsembleChoice(optionId){
  if(busy||!optionId)return;
  setBusy(true);
  try{
   const result=await root.kanadeAgent.call('applyEnsembleOption',{optionId,preserveMusic:true},{confirmed:true});
   pendingEnsembleChoices=null;
   setStatus(result.summary||'編成を適用しました。');
   const item={role:'assistant',content:result.summary||'編成を適用しました。'};
   if(result.wrote>0)item.undoCount=result.wrote;
   messages=Agent.trimHistory([...messages,item]);
   save();render();
  }catch(error){setStatus(error.message||String(error));}
  finally{setBusy(false);}
 }
 function swapEnsembleView(side){
  try{
   root.kanadeAgent.swapEnsembleCompare(side);
   if(ensembleCompare)ensembleCompare.view=side;
   setStatus(side==='before'?'変更前の編成を表示しています。':'変更後の編成を表示しています。');
   render();
  }catch(error){setStatus(error.message);}
 }
 function undoTurn(message){
  try{
   root.kanadeAgent.undo(message.undoCount);
   message.undoCount=0;
   setStatus('AIの変更を取り消しました。');
   render();
  }catch(error){setStatus(error.message);}
 }
 async function streamChat(working,{signal,onText,absorb,forceWrite=false}){
  const summary=readSummary();
  let payload;
  if(forceWrite){
   const pending=Agent.lastUserText(working);
   payload=Agent.buildChatPayload({
    model:select.value,
    history:[...working,{role:'user',content:`次の要求を writePhrase だけで実行してください。説明不要。JSONのみ。\n要求: ${pending}\n例: {"name":"writePhrase","arguments":{"part":"トランペット","measure":1,"phrase":"G4 q G4 q C5 h | G4 q G4 q G4 h | C5 q E5 q G5 h | G4 q E5 q C5 w"}}`}],
    summary,
    includeTools:false,
    stream:false,
    format:Agent.writePhraseFormat()
   });
  }else{
   payload=Agent.buildChatPayload({model:select.value,history:working,summary,includeTools:true});
  }
  const response=await Agent.postChat(payload,{signal});
  if(!response.ok){
   const failure=await response.json().catch(()=>({}));
   const error=new Error(failure.error||'chat failed');
   error.status=response.status;error.body=failure;throw error;
  }
  const state=Agent.emptyStream();
  let finished;
  if(payload.stream===false){
   const body=await response.json();
   if(typeof body?.error==='string'&&body.error.trim())state.error=body.error.trim();
   const contentText=typeof body?.message?.content==='string'?body.message.content:
    body?.message?.content!=null?JSON.stringify(body.message.content):
    (forceWrite?JSON.stringify(body):'');
   if(forceWrite){
    const fromFormat=Agent.parseToolCallsFromContent(contentText);
    if(fromFormat.length)finished={content:'',toolCalls:fromFormat};
   }
   if(!finished){
    Agent.absorbEvent(state,body?.message?body:{message:{role:'assistant',content:contentText,tool_calls:body?.message?.tool_calls}});
    if(state.content)onText?.(state.content);
    finished=Agent.finishStream(state);
   }
  }else{
   const reader=response.body?.getReader?.();
   if(!reader){
    const body=await response.json();
    Agent.absorbEvent(state,body?.message?body:{message:body});
    if(state.content)onText?.(state.content);
    finished=Agent.finishStream(state);
   }else{
    const decoder=new TextDecoder();
    let buffer='';
    while(true){
     const chunk=await reader.read();
     if(chunk.done)break;
     buffer+=decoder.decode(chunk.value,{stream:true});
     const parsed=Agent.readNdjson(buffer);
     buffer=parsed.rest;
     for(const event of parsed.events){absorb?.(event);Agent.absorbEvent(state,event);if(state.content)onText?.(state.content);}
    }
    buffer+=decoder.decode();
    for(const event of Agent.readNdjson(buffer,{flush:true}).events){absorb?.(event);Agent.absorbEvent(state,event);}
    finished=Agent.finishStream(state);
   }
  }
  lastDebug=[
   `toolsSent=${payload.tools?payload.tools.length:0}`,
   `stream=${payload.stream}`,
   `forceWrite=${!!forceWrite}`,
   `format=${payload.format?'yes':'no'}`,
   `toolCalls=${(finished.toolCalls||[]).map(call=>call.name).join(',')||'(none)'}`,
   `content=${(finished.content||'').slice(0,180)}`,
   `raw=${String(finished.rawContent||'').slice(0,240)}`
  ].join('\n');
  if(debugOn)render();
  return finished;
 }
 function readSummary(){
  try{
   const doc=root.KanadeSession?.get?.();
   const position=root.KanadeSession?.position?.();
   return Agent.summarizeScore(doc,position||undefined);
  }catch{return Agent.summarizeScore(null);}
 }
 function setBusy(value){
  busy=value;
  stopBtn.hidden=!value;
  sendBtn.disabled=value||select.disabled;
 }
 async function send(text){
  const chosen=select.value;
  if(!chosen||busy||!text.trim())return;
  const id=++turn;
  for(const message of messages)message.undoCount=0;
  messages=Agent.trimHistory([...messages,{role:'user',content:text.trim()}]);
  model=chosen;draft='';liveSteps=[];save();render();
  setBusy(true);
  abort=new AbortController();
  try{
   const result=await Agent.runTurn({
    messages,signal:abort.signal,confirm:confirmAction,
    execute:(call,options)=>root.kanadeAgent.call(call.name,call.arguments,options),
    onText:value=>{
     if(id!==turn)return;
     const cleaned=Agent.publicAssistantText(value,Agent.parseToolCallsFromContent(value));
     draft=cleaned;
     if(debugOn&&value&&value!==cleaned)lastDebug=`rawDraft=${value.slice(0,240)}\n${lastDebug||''}`;
     render();
    },
    onStep:step=>{
     if(id!==turn)return;
     const label=root.KanadeAgentTools?.stepLabel(step.name)||step.name;
     if(step.phase==='start')liveSteps.push(`${label}しています…`);
     else if(step.phase==='done'){
      const short=step.name==='getScoreSummary'?'楽譜の概要を確認しました。':
       step.name==='writePhrase'&&/再送/.test(step.text||'')?step.text:
       (step.text||'完了');
      const visible=Agent.publicAssistantText(short,[])||`${label}しました。`;
      liveSteps[liveSteps.length-1]=visible.length>160?`${label}しました。`:visible;
      if(step.proposal?.options?.length)pendingEnsembleChoices=step.proposal;
     }
     draft='';render();
    },
    chat:streamChat
   });
   if(id!==turn)return;
   if(result.error){
    const friendly=/not found|model/i.test(result.error)?Agent.connectionMessage('missing'):
     Agent.looksLikeToolPayload(result.error)?'ツールの実行に失敗しました。別の言い方で試してください。':result.error;
    setStatus(friendly);
   }
   const reply=Agent.publicAssistantText(result.content||'',[]);
   const content=[...liveSteps,reply].filter(Boolean).join('\n')||
    (result.writes>0?'楽譜を更新しました。':'');
   if(content.trim()){
    messages=Agent.trimHistory([...messages,{role:'assistant',content}]);
    if(result.writes>0)messages.at(-1).undoCount=result.writes;
    save();
   }else if(result.error&&!Agent.looksLikeToolPayload(result.error)){
    messages=Agent.trimHistory([...messages,{role:'assistant',content:String(result.error)}]);
    save();
   }
   if(debugOn&&result.rawContent)lastDebug=`rawContent=${String(result.rawContent).slice(0,300)}\n${lastDebug||''}`;
   draft='';liveSteps=[];render();
   if(!result.error)setStatus(connectedStatus());
  }catch(error){
   if(id!==turn)return;
   if(error.name==='AbortError'){
    const content=[...liveSteps,Agent.publicAssistantText(draft,[])].filter(Boolean).join('\n');
    if(content.trim()){messages=Agent.trimHistory([...messages,{role:'assistant',content}]);save();}
    draft='';liveSteps=[];pendingConfirm=null;render();setStatus('応答を停止しました。');
    return;
   }
   const missing=error.status===404||/not found/i.test(String(error.body?.error||error.message||''));
   draft='';liveSteps=[];render();
   setStatus(Agent.connectionMessage(missing?'missing':'unavailable'));
  }finally{
   if(id===turn){setBusy(false);abort=null;}
  }
 }
 function stop(){abort?.abort();}
 function clearHistory(){
  if(!messages.length&&!draft)return;
  if(!window.confirm('この画面の相談履歴を消去しますか？楽譜は残ります。'))return;
  turn++;abort?.abort();abort=null;
  messages=[];draft='';liveSteps=[];pendingConfirm=null;model=select.value||model;
  setBusy(false);save();render();
 }

 const debugToggle=$('agentDebug');
 const updateBtn=$('agentUpdate');
 load();render();setStatus('パネルを開くと Ollama への接続を確認します。');
 for(const button of [toggle,mobile,menu])button?.addEventListener('click',togglePanel);
 closeBtn.addEventListener('click',close);
 reconnect.addEventListener('click',()=>{if(!busy)refreshModels();});
 clearBtn.addEventListener('click',clearHistory);
 stopBtn.addEventListener('click',stop);
 select.addEventListener('change',()=>{model=select.value;save();});
 debugToggle?.addEventListener('change',()=>{debugOn=!!debugToggle.checked;render();});
 updateBtn?.addEventListener('click',async()=>{
  try{
   const reg=await navigator.serviceWorker?.getRegistration?.();
   await reg?.update?.();
   const workers=[reg?.waiting,reg?.installing].filter(Boolean);
   for(const worker of workers)worker.postMessage?.({type:'SKIP_WAITING'});
   location.reload();
  }catch{location.reload();}
 });
 if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateBtn)updateBtn.hidden=false;});
  navigator.serviceWorker.ready.then(reg=>{
   reg.addEventListener('updatefound',()=>{
    const worker=reg.installing;
    worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller&&updateBtn)updateBtn.hidden=false;});
   });
  }).catch(()=>{});
 }
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const text=input.value;
  if(!text.trim()||busy)return;
  input.value='';
  send(text);
 });
 input.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){
   event.preventDefault();form.requestSubmit();
  }
 });
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();close();}
 });
 root.KanadeAgentUI={toggle:togglePanel,open,close,isOpen:()=>!panel.hidden,setEnsembleCompare};
})(window);
