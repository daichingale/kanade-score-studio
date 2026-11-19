/* Link-authorized rooms; keep pending edits and conditional per-measure Undo. */
(function(root){
 'use strict';
 const C=root.KanadeCore,S=root.KanadeSync,A=root.KanadeSession,$=id=>document.getElementById(id);
 const CLOUD='https://kanade-score-studio.versionthree.chatgpt.site',server=(root.__KANADE_COLLAB_SERVER__||CLOUD).replace(/\/$/,'');
 let room=null,revision=-1,queue=[],busy=false,polling=false,timer=null,conflict=false,connected=false,history=[],future=[],backup=null,installedPrompt=null,shared=null,selectedPart='melody',projected=null,previewed=null;
 let confirmedName='',entering=false,lastPresence='',lastPresenceAt=0,presenceRequest=null;
 const clientId=C.uid(),nameInput=$('collabName'),inviteInput=$('collabInvite');
 const names={melody:'メロディー',bass:'ベース'};
 const cacheKey=id=>'kanade.collab.pending.'+id,ownerKey=id=>'kanade.collab.owner.'+id;
 function message(text){$('collabStatus').textContent=text;}
 function persist(){if(room)try{sessionStorage.setItem(cacheKey(room.id),JSON.stringify({queue,score:shared,history,future,part:selectedPart}));}catch(_){message('未送信の変更があります。「自分の編集を保存」でファイルに保存してください');}}
 function displayName(){return nameInput.value.trim();}
 function nameIsValid(){const name=displayName();return !!name&&name.length<=40;}
 function entryButtons(){
  const disabled=entering||!nameIsValid();
  $('collabCreate').disabled=disabled;
  $('collabJoin').disabled=disabled||!inviteInput.value.trim();
  nameInput.disabled=entering;
 }
 function rememberName(name){
  try{localStorage.setItem('kanade.collab.name',name);}catch(_){}
 }
 function tools(){
  entryButtons();
  $('collabCreate').hidden=!!room;$('collabJoin').hidden=!!room;$('collabInvite').readOnly=!!room;$('collabLeave').hidden=!room;$('collabCopy').hidden=!room;
  $('collabRotate').hidden=!room?.owner;$('collabEnd').hidden=!room?.owner;$('collabConflict').hidden=!conflict;
  $('collabBadge').hidden=!room;$('collabBadge').textContent=room?(conflict?'同期を確認':connected?'共同編集':'再接続中'):'';
  for(const id of ['newBtn','demoBtn','openBtn','importFile'])$(id).disabled=!!room;
  $('collabSaveLocal').hidden=!room;$('collabPartBar').hidden=!shared?.bassPart;$('collabPreview').hidden=!shared?.bassPart;
  $('collabBadge').title=$('collabStatus').textContent;
  for(const id of ['titleInput','composerInput','timeSelect','keySelect','tempoInput']){
   $(id).disabled=!!room&&selectedPart==='bass'||id==='keySelect'&&A.getClef()==='percussion';
  }
  $('undoBtn').disabled=room?!root.KanadeCollab.canUndo():!A.canUndo();
  $('redoBtn').disabled=room?!root.KanadeCollab.canRedo():!A.canRedo();
  $('overviewUndo').disabled=$('undoBtn').disabled;
  for(const button of $('collabPartBar').querySelectorAll('[data-part]'))button.setAttribute('aria-pressed',String(button.dataset.part===selectedPart));

 }
 async function request(path,options={}){
  const headers={...(options.body?{'Content-Type':'application/json'}:{}),...(room?{Authorization:'Bearer '+room.key}:{}),...options.headers};
  const res=await fetch(server+'/api/rooms'+path,{...options,headers,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await res.json();if(!res.ok){const error=Error(data.error||'通信できませんでした');error.status=res.status;error.data=data;throw error;}return data;
 }
 function editingField(){const e=document.activeElement;return e?.matches('input,textarea,select,[contenteditable="true"]')&&!e.closest('#collabPanel');}
 function renderParts(switching=false){
  const other=selectedPart==='melody'?'bass':'melody';
  const preview=shared.bassPart?S.part(shared,other):null;
  const previewKey=preview&&JSON.stringify(preview);
  if(preview&&previewKey!==previewed){
   previewed=previewKey;
   $('collabPreviewTitle').textContent=names[other]+' · 共有プレビュー';
   const host=$('collabPreviewScore');
   host.innerHTML=root.KanadeRenderer.render(preview,null).replace(/([#"])kanade-(score-|caret-layer|ghost-layer)/g,'$1kanade-peer-$2');
   const svg=host.firstElementChild;
   svg.setAttribute('inert','');
   const [, , width,height]=svg.getAttribute('viewBox').split(' ').map(Number);
   svg.setAttribute('viewBox',`0 145 ${width} ${height-210}`);

  }
  if(editingField()&&!switching){A.refreshOverview();return;}
  const next=S.part(shared,selectedPart),key=JSON.stringify(next);
  if(key!==projected||switching){
   projected=key;A.applyRemote(next,{keepSelection:!switching});
  }else A.refreshOverview();
 }
 function applyShared(data){
  if(!data.score||data.revision<revision)return;
  let next=data.score;
  for(const op of queue){
   const merged=S.mergeRoom(next,op.patch,op.part);
   if(merged.conflicts.length)return;
   next=merged.score;
  }
  revision=data.revision;shared=next;renderParts();
 }
 function saveLocal(){const blob=new Blob([JSON.stringify(shared||A.get(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(A.get().title||'kanade')+'-共同編集.kanade.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function invite(){return `${server}/index.html#room=${encodeURIComponent(room.id)}&key=${encodeURIComponent(room.key)}`;}
 function showInvite(){
  const link=room?invite():'';
  $('collabInvite').value=link;
  const host=$('collabQrCode');
  host.replaceChildren();
  $('collabQr').hidden=true;
  if(!link)return;
  const code=root.qrcode(0,'M');
  code.addData(link,'Byte');
  code.make();
  host.innerHTML=code.createSvgTag({cellSize:4,margin:16,scalable:true,alt:'共同編集の招待QRコード'});
  $('collabQr').hidden=false;
 }
 function setFragment(){historyAPI.replaceState(null,'','#room='+encodeURIComponent(room.id)+'&key='+encodeURIComponent(room.key));}
 const historyAPI=root.history;
 function peers(list){
  const host=$('collabPeers'),others=list.filter(peer=>peer.clientId!==clientId);
  const views={overview:'総譜',roll:'ピアノロール',timeline:'タイムライン'};
  const labels=others.map(peer=>{
   const location=S.peerPosition(shared,peer);
   const details=[views[peer.view]];
   if(location)details.push(A.instrumentName(location.part.instrument),location.measure>=0?(location.measure+1)+'小節目':null);
   return [peer.name,...details.filter(Boolean)].join(' · ');
  });
  const signature=JSON.stringify(labels);
  if(host.dataset.signature!==signature){
   host.dataset.signature=signature;
   host.replaceChildren(...labels.map(label=>{
    const line=document.createElement('div');line.textContent=label;return line;
   }));
  }
  $('collabCount').textContent=`${others.length+1}人で編集中`;
  $('collabLiveCount').textContent=`${others.length+1}人`;
 }
 function heartbeat(){
  if(!room||presenceRequest)return;
  const currentRoom=room,{partId,measureId,index,view}=A.position();
  const payload={clientId,name:confirmedName,partId,measureId,index,view};
  const signature=JSON.stringify([confirmedName,partId,measureId,view]),now=Date.now();
  if(signature===lastPresence&&now-lastPresenceAt<8000)return;
  const pending=request('/'+currentRoom.id+'/presence',{method:'POST',body:JSON.stringify(payload)});
  presenceRequest=pending;
  pending.then(()=>{
   if(room===currentRoom){lastPresence=signature;lastPresenceAt=Date.now();}
  },()=>{}).finally(()=>{if(presenceRequest===pending)presenceRequest=null;});
 }
 function showConflict(error){conflict=true;connected=false;persist();message(error.message+'。自分の編集を保存してから、共有版を読み直せます。');tools();}
 async function pump(){
  if(!room||busy||conflict||!queue.length)return;busy=true;
  try{
   while(room&&queue.length&&!conflict){
    const op=queue[0],currentRoom=room;const data=await request('/'+currentRoom.id+'/operations',{method:'POST',body:JSON.stringify({id:op.id,patch:op.patch,part:op.part})});if(room!==currentRoom||queue[0]!==op)return;
    queue.shift();if(op.kind==='edit'){history.push({patch:op.patch,part:op.part||'melody'});if(history.length>100)history.shift();future=[];}else if(op.kind==='undo'){future.push(op.original);}else if(op.kind==='redo'){history.push(op.original);}
    applyShared(data);connected=true;persist();message(queue.length?'変更を送信中…':'同期済み');tools();
   }
  }catch(error){if(!room)return;if(error.status===409||error.status===400)showConflict(error);else if(error.status===401){showConflict(error);}else{connected=false;message('接続を待っています。変更はこの画面に保持しています');persist();tools();}}
  finally{busy=false;}
 }
 async function poll(){
  if(!room||polling)return;polling=true;
  const currentRoom=room;
  try{
   heartbeat();
   const data=await request('/'+currentRoom.id+'?revision='+revision);
   if(room!==currentRoom)return;
   connected=true;
   if(!busy&&!queue.length&&!conflict)applyShared(data);
   peers(data.peers||[]);
   if(!conflict)message(queue.length?'変更を送信中…':'クラウドに保存済み');tools();await pump();
  }catch(error){
   if(room!==currentRoom)return;
   connected=false;if(error.status===401)showConflict(error);else{message('再接続中です。変更はこの画面に保持しています');tools();}
  }finally{
   polling=false;clearTimeout(timer);if(room)timer=setTimeout(poll,document.hidden?4000:350);
  }
 }
 function enter(data,name,recover=false){
  room={id:data.id,key:data.key,owner:localStorage.getItem(ownerKey(data.id))||null};revision=data.revision;queue=[];history=[];future=[];conflict=false;connected=true;confirmedName=name;lastPresence='';lastPresenceAt=0;presenceRequest=null;
  nameInput.value=name;rememberName(name);
  if(!backup){const stored=sessionStorage.getItem('kanade.collab.backup');backup=stored?JSON.parse(stored):A.get();sessionStorage.setItem('kanade.collab.backup',JSON.stringify(backup));}
  let cached;try{cached=JSON.parse(sessionStorage.getItem(cacheKey(room.id)));}catch(_){}
  shared=data.score;
  if(recover&&cached?.queue?.length){queue=cached.queue;shared=cached.score;history=(cached.history||[]).filter(op=>op.patch);future=(cached.future||[]).filter(op=>op.patch);}
  selectedPart=shared.bassPart&&cached?.part==='bass'?'bass':'melody';
  renderParts(true);persist();peers([]);
  setFragment();showInvite();tools();clearTimeout(timer);poll();
 }
 async function join(link,name){
  const url=new URL(link,location.href);if(url.origin!==new URL(server).origin)throw Error('Kanadeの招待リンクを貼り付けてください');
  const params=new URLSearchParams(url.hash.slice(1)),id=params.get('room'),key=params.get('key');if(!/^[a-zA-Z0-9-]{1,80}$/.test(id||'')||!/^[A-Za-z0-9_-]{43}$/.test(key||''))throw Error('招待リンクを確認してください');
  const data=await request('/'+id+'?revision=-1',{headers:{Authorization:'Bearer '+key}});enter({...data,id,key},name,true);
  const panel=$('collabPanel');
  if(panel.matches(':modal')){panel.close();$('scoreHost').focus({preventScroll:true});}
 }
 function leave(){
  persist();clearTimeout(timer);room=null;shared=null;previewed=null;projected=null;queue=[];history=[];future=[];conflict=false;connected=false;revision=-1;historyAPI.replaceState(null,'',location.pathname+location.search);
  if(backup){A.applyRemote(backup);backup=null;sessionStorage.removeItem('kanade.collab.backup');}
  confirmedName='';presenceRequest=null;message('共同編集から退出しました');showInvite();
  $('collabPeers').replaceChildren();delete $('collabPeers').dataset.signature;$('collabCount').textContent='';tools();
 }
 function local(before,after){
  if(!room)return;const patch=S.diff(before,after);if(S.empty(patch))return;
  shared=S.replacePart(shared,selectedPart,after);projected=JSON.stringify(after);
  queue.push({id:C.uid(),patch,part:selectedPart,kind:'edit'});renderParts();persist();tools();pump();
 }
 function undo(redo=false){
  if(!room||queue.length||busy||conflict)return;
  const stack=redo?future:history,original=stack.pop();if(!original)return;
  const {part}=original,patch=redo?original.patch:S.inverse(original.patch);
  let merged;
  try{merged=S.mergeRoom(shared,patch,part);}catch(error){stack.push(original);message(error.message);return;}
  if(merged.conflicts.length){stack.push(original);message('この小節は他の人が変更したため、元に戻せません');tools();return;}
  shared=merged.score;renderParts();queue.push({id:C.uid(),patch,part,original,kind:redo?'redo':'undo'});persist();tools();pump();
 }
 async function run(fn){try{await fn();}catch(error){message(error.message);}}
 async function enterWithName(action){
  if(room||entering)return;
  if(!nameIsValid()){message('表示名を1〜40文字で入力してください');nameInput.focus();return;}
  entering=true;entryButtons();
  try{await action(displayName());}
  catch(error){message(error.message);}
  finally{entering=false;entryButtons();}
 }
 function selectPart(part){
  if(!shared?.bassPart||!['melody','bass'].includes(part))return false;
  if(part!==selectedPart){selectedPart=part;renderParts(true);persist();tools();heartbeat();}
  return true;
 }
 root.KanadeCollab={selectPart,get active(){return !!room;},get activePart(){return selectedPart;},get blocked(){return conflict;},get sharedScore(){return shared;},get pendingCount(){return queue.length;},undo:()=>undo(),redo:()=>undo(true),canUndo:()=>!!history.length&&!queue.length&&!conflict,canRedo:()=>!!future.length&&!queue.length&&!conflict};
 A.subscribe(local);
 $('collabPartBar').onclick=e=>{
  const part=e.target.closest('[data-part]')?.dataset.part;
  if(part)selectPart(part);
 };
 $('collabCreate').onclick=()=>enterWithName(async name=>{
  message('ルームを作っています…');
  const data=await request('',{method:'POST',body:JSON.stringify({score:A.get(),name})});
  localStorage.setItem(ownerKey(data.id),data.owner);enter(data,name);
 });
 $('collabJoin').onclick=()=>enterWithName(async name=>{
  message('ルームに参加しています…');await join(inviteInput.value.trim(),name);
 });
 $('collabCopy').onclick=()=>run(async()=>{const text=invite();$('collabInvite').value=text;try{await navigator.clipboard.writeText(text);message('招待リンクをコピーしました');}catch(_){$('collabInvite').select();message('招待リンクを選択しました。コピーして友だちに送ってください');}});
 $('collabLeave').onclick=leave;$('collabSaveLocal').onclick=saveLocal;
 $('collabResolve').onclick=()=>run(async()=>{const data=await request('/'+room.id+'?revision=-1');sessionStorage.setItem(cacheKey(room.id)+'.conflict',JSON.stringify({score:A.get(),queue}));queue=[];history=[];future=[];conflict=false;applyShared(data);persist();tools();poll();});
 $('collabRotate').onclick=()=>run(async()=>{const data=await request('/'+room.id+'/invite',{method:'POST',headers:{'X-Kanade-Owner':room.owner}});room.key=data.key;setFragment();showInvite();message('新しい招待リンクに更新しました。以前のリンクは使えません');});
 $('collabEnd').onclick=()=>run(async()=>{await request('/'+room.id,{method:'DELETE',headers:{'X-Kanade-Owner':room.owner}});leave();message('ルームを終了しました');});
 try{nameInput.value=localStorage.getItem('kanade.collab.name')||'';}catch(_){}
 nameInput.oninput=inviteInput.oninput=entryButtons;
 nameInput.onchange=()=>{
  if(!room)return;
  if(!nameIsValid()){nameInput.value=confirmedName;message('表示名を空欄にはできません');return;}
  confirmedName=displayName();nameInput.value=confirmedName;rememberName(confirmedName);heartbeat();
 };
 nameInput.onkeydown=event=>{
  if(event.key==='Enter'&&!event.isComposing&&!room&&inviteInput.value.trim()){
   event.preventDefault();event.stopPropagation();
   if(!$('collabJoin').disabled)$('collabJoin').click();
  }
 };
 document.addEventListener('focusout',()=>setTimeout(()=>{if(room&&!conflict&&!editingField())renderParts();},0));
 root.addEventListener('online',()=>{if(room)poll();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&room)poll();});
 root.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installedPrompt=e;$('installApp').hidden=false;});
 $('installApp').onclick=async()=>{if(installedPrompt){await installedPrompt.prompt();installedPrompt=null;$('installApp').hidden=true;}};
 if('serviceWorker' in navigator&&!root.__KANADE_DEV__&&location.protocol==='https:'){
  const sw=root.KanadePath?.resolve('/sw.js')||'/sw.js';
  navigator.serviceWorker.register(sw).catch(()=>{});
 }
 const params=new URLSearchParams(location.hash.slice(1));
 if(params.has('room')){
  inviteInput.value=server+'/index.html'+location.hash;
  message('招待されたルームに入るには、表示名を確認して「名前を確認して参加」を押してください。');
  const panel=$('collabPanel');panel.showModal();nameInput.focus();
 }
 tools();
})(window);
