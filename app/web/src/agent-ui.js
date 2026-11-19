/* Chat panel for the local Ollama assistant. Score edits go through kanadeAgent. */
(function(root){
 'use strict';
 const Agent=root.KanadeAgent;
 const $=id=>document.getElementById(id);
 const panel=$('agentPanel');
 if(!Agent||!panel)return;
 const shell=document.querySelector('.shell');
 const toggle=$('agentToggle');
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
  for(const button of [toggle,menu]){
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
   const response=await fetch('/__agent/tags',{cache:'no-store'});
   if(!response.ok){fillModels([]);setStatus(Agent.connectionMessage('unavailable'));return;}
   const names=Agent.modelNames(await response.json());
   fillModels(names);
   setStatus(names.length?connectedStatus():Agent.connectionMessage('empty'));
  }catch{fillModels([]);setStatus(Agent.connectionMessage('unavailable'));}
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
 function undoTurn(message){
  try{
   root.kanadeAgent.undo(message.undoCount);
   message.undoCount=0;
   setStatus('AIの変更を取り消しました。');
   render();
  }catch(error){setStatus(error.message);}
 }
 async function streamChat(working,{signal,onText,absorb}){
  const payload=Agent.buildChatPayload({model:select.value,history:working,summary:readSummary(),includeTools:true});
  const response=await fetch('/__agent/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal,cache:'no-store'});
  if(!response.ok){
   const failure=await response.json().catch(()=>({}));
   const error=new Error(failure.error||'chat failed');
   error.status=response.status;error.body=failure;throw error;
  }
  const reader=response.body.getReader(),decoder=new TextDecoder();
  const state=Agent.emptyStream();
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
  return Agent.finishStream(state);
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
    onText:value=>{if(id!==turn)return;draft=value;render();},
    onStep:step=>{
     if(id!==turn)return;
     const label=root.KanadeAgentTools?.stepLabel(step.name)||step.name;
     if(step.phase==='start')liveSteps.push(`${label}しています…`);
     else if(step.phase==='done')liveSteps[liveSteps.length-1]=step.text;
     draft='';render();
    },
    chat:streamChat
   });
   if(id!==turn)return;
   if(result.error){
    setStatus(/not found|model/i.test(result.error)?Agent.connectionMessage('missing'):result.error);
   }
   const content=[...liveSteps,result.content].filter(Boolean).join('\n');
   if(content.trim()){
    messages=Agent.trimHistory([...messages,{role:'assistant',content}]);
    if(result.writes>0)messages.at(-1).undoCount=result.writes;
    save();
   }
   draft='';liveSteps=[];render();
   if(!result.error)setStatus(connectedStatus());
  }catch(error){
   if(id!==turn)return;
   if(error.name==='AbortError'){
    const content=[...liveSteps,draft].filter(Boolean).join('\n');
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

 load();render();setStatus('パネルを開くと Ollama への接続を確認します。');
 toggle?.addEventListener('click',togglePanel);
 menu?.addEventListener('click',togglePanel);
 closeBtn.addEventListener('click',close);
 reconnect.addEventListener('click',()=>{if(!busy)refreshModels();});
 clearBtn.addEventListener('click',clearHistory);
 stopBtn.addEventListener('click',stop);
 select.addEventListener('change',()=>{model=select.value;save();});
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
 root.KanadeAgentUI={toggle:togglePanel,open,close,isOpen:()=>!panel.hidden};
})(window);
