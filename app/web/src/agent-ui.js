/* Chat panel for the local Ollama assistant. It never writes the score. */
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
  try{localStorage.setItem(Agent.STORAGE_KEY,JSON.stringify({version:1,model,messages}));}
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
  if(!messages.length&&!draft){
   const empty=document.createElement('p');
   empty.className='agent-empty';
   empty.textContent='吹奏楽とマーチングの編成、音域、移調、リハーサル、ドリルについて相談できます。\n開いている楽譜の曲名・パート・小節数・テンポ・調を読み取りますが、楽譜は変更しません。\nCtrl+J でこのパネルを開閉します。Enter で送信、Shift+Enter で改行です。';
   log.append(empty);
   return;
  }
  for(const message of messages)log.append(bubble(message));
  if(draft)log.append(bubble({role:'assistant',content:draft,pending:true}));
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
  return 'ローカルの Ollama に接続しています。この相談は楽譜を変更しません。';
 }
 function readSummary(){
  try{
   const doc=root.KanadeSession?.get?.();
   const position=root.KanadeSession?.position?.();
   return Agent.summarizeScore(doc,position||undefined);
  }catch{return Agent.summarizeScore(null);}
 }
 function applyEvents(text,events){
  let failed=false;
  for(const event of events){
   const piece=Agent.textFromEvent(event);
   if(piece.error){
    failed=true;
    setStatus(/not found|model/i.test(piece.error)?Agent.connectionMessage('missing'):piece.error==='応答の形式を読み取れませんでした'?piece.error:Agent.connectionMessage('unavailable'));
    continue;
   }
   if(piece.content){text+=piece.content;draft=text;render();}
  }
  return {text,failed};
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
  messages=Agent.trimHistory([...messages,{role:'user',content:text.trim()}]);
  model=chosen;draft='';save();render();
  setBusy(true);
  abort=new AbortController();
  let assistant='';
  let failed=false;
  try{
   const payload=Agent.buildChatPayload({model:chosen,history:messages,summary:readSummary()});
   const response=await fetch('/__agent/chat',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:abort.signal,cache:'no-store'
   });
   if(id!==turn)return;
   if(!response.ok){
    const failure=await response.json().catch(()=>({}));
    const missing=response.status===404||/not found/i.test(String(failure.error||''));
    setStatus(Agent.connectionMessage(missing?'missing':'unavailable'));
    return;
   }
   const reader=response.body.getReader();
   const decoder=new TextDecoder();
   let buffer='';
   while(true){
    const chunk=await reader.read();
    if(id!==turn){abort.abort();return;}
    if(chunk.done)break;
    buffer+=decoder.decode(chunk.value,{stream:true});
    const parsed=Agent.readNdjson(buffer);
    buffer=parsed.rest;
    const step=applyEvents(assistant,parsed.events);
    assistant=step.text;failed=failed||step.failed;
   }
   buffer+=decoder.decode();
   const tail=Agent.readNdjson(buffer,{flush:true});
   const done=applyEvents(assistant,tail.events);
   assistant=done.text;failed=failed||done.failed;
   if(assistant.trim()){
    messages=Agent.trimHistory([...messages,{role:'assistant',content:assistant}]);
    save();
   }
   draft='';render();
   if(id===turn&&!failed)setStatus(connectedStatus());
  }catch(error){
   if(id!==turn)return;
   if(error.name==='AbortError'){
    if(assistant.trim()){messages=Agent.trimHistory([...messages,{role:'assistant',content:assistant}]);save();}
    draft='';render();setStatus('応答を停止しました。');
    return;
   }
   draft='';render();setStatus(Agent.connectionMessage('unavailable'));
  }finally{
   if(id===turn){setBusy(false);abort=null;}
  }
 }
 function stop(){abort?.abort();}
 function clearHistory(){
  if(!messages.length&&!draft)return;
  if(!window.confirm('この画面の相談履歴を消去しますか？楽譜は残ります。'))return;
  turn++;abort?.abort();abort=null;
  messages=[];draft='';model=select.value||model;
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
