(function(root){
  'use strict';
  const C=root.KanadeCore,A=root.KanadeArrangement,$=id=>document.getElementById(id);
  const pageSize=24,palette=['#2d77ab','#24816f','#7456a2','#975d31','#ad5568','#466798'];
  function node(tag,cls,text){
    const element=document.createElement(tag);
    if(cls)element.className=cls;
    if(text!==undefined)element.textContent=text;
    return element;
  }
  function button(label,action){
    const result=node('button',null,label);result.type='button';result.onclick=action;return result;
  }
  function showNotes(parent,bar,cap){
    const marks=[];
    for(const [voice,events] of [bar.events,bar.voice2||[]].entries()){
      let tick=0;
      for(const event of events){
        const len=C.eventTicks(event);
        if(event.type==='note'&&marks.length<32)for(const pitch of event.pitches.slice(0,4)){
          const line=node('span','arr-note'),midi=C.pitchMidi(pitch);
          line.style.left=tick/cap*100+'%';line.style.width=Math.min(len,cap-tick)/cap*100+'%';
          line.style.top=(9+(1-Math.max(0,Math.min(1,(midi-36)/54)))*69+voice*7)+'%';
          marks.push(line);
        }
        tick+=len;
      }
    }
    parent.replaceChildren(...marks);
  }
  function setup(api){
    const context=$('arrContext');
    const panel=$('arrangement'),grid=$('arrGrid'),scroller=$('arrScroll'),status=$('arrStatus'),dialog=$('arrDialog');
    let view='timeline',project=null,current=null,track=0,page=0,multi=false,selected=[],pending=null,dragging=null;
    let playing=false,dialogAction=null,lastDocument=null,lastView=null,lastName=null;
    let session={active:[],queued:[],stopping:[]};
    const entryButton=$('arrangementOpen');
    let selectedCell=null,clipEdit=null,slotClipboard=null,slotDrag=null;
    let measureClipboard=null,contextGap=null,gridDocument=null,gridPage=null,gridLanguage=null;
    const roll=root.KanadePianoRollUI.setup({
      parts:()=>clipEdit?[clipPart()]:A.parts(doc()),id:()=>clipEdit?JSON.stringify([doc().id,clipEdit.sceneId,clipEdit.partId]):doc().id,
      name:api.name,apply:(index,part,label,mi)=>clipEdit?editScenePart(part):api.rollApply(index,part,label,mi),
      audition:(index,midi)=>api.rollAudition(index,midi,clipEdit?clipPart():null),clipboard:api.noteClipboard,say
    });

    function say(value,error=false){status.textContent=value;status.toggleAttribute('data-error',error);}
    function safe(fn){try{fn();}catch(error){say(error.message,true);}}
    const doc=()=>api.document();
    function snapshot(document=doc(),sourceIds=null){
      const ids=new Map(document.measures.map((bar,i)=>[bar.id,i]));
      const active=ids.get(current)??0;
      const order=(sourceIds||(multi?selected:[document.measures[active].id])).flatMap(id=>ids.has(id)?[ids.get(id)]:[]);
      const sorted=[...order].sort((a,b)=>a-b);
      const contiguous=!!sorted.length&&sorted.at(-1)-sorted[0]+1===sorted.length;
      return {document,active,order,first:sorted[0],last:sorted.at(-1),contiguous};
    }
    const rangeName=order=>order.map(index=>index+1).join(' → ');
    function choose(index,part=track,focusTarget){
      const document=doc(),id=document.measures[index]?.id;if(!id)return;
      current=id;track=part;
      if(multi&&!pending)selected=selected.includes(id)?selected.filter(item=>item!==id):[...selected,id];
      render();
      (focusTarget||grid.querySelector('.arr-bar button[data-bar="'+index+'"]'))?.focus({preventScroll:true});
    }
    function useOrdered(){
      if(!snapshot().order.length)return;
      arm({type:'order'});
    }
    function arm(item){
      const {document,order}=snapshot();
      pending=['saved','clipboard','mix','link'].includes(item.type)?item:{...item,sourceIds:order.map(index=>document.measures[index].id)};
      view='timeline';$('arrCopies').value='1';
      render();
      say(item.type==='move'?'移動先の小節のすき間を選んでください':'挿入先の小節のすき間を選んでください');
    }
    function copied(document=doc()){return measureClipboard?.project===document.id?measureClipboard.clip:null;}
    function copyMeasures(order=snapshot().order,{quiet=false}={}){
      const document=doc();
      if(!order.length)return null;
      const clip=A.capture(document,order,'コピーした小節',{transient:true});
      measureClipboard={project:document.id,clip};
      if(!quiet){api.measureCopied();render();say(order.length+' 小節をコピーしました');}
      return clip;
    }
    function pasteAt(gap){if(!copied()){say('先に小節をコピーしてください',true);return;}place(gap,{type:'clipboard'},1);}
    function duplicateAfter(){
      const state=snapshot();
      if(state.order.length){copyMeasures();pasteAt(state.last+1);}
    }
    function closeContext(restore=false){
      if(!context.matches(':popover-open'))return;
      context.hidePopover();
      if(restore)scroller.focus({preventScroll:true});
    }
    function showContext(event){
      if(view!=='timeline')return;
      const bar=event.target.closest('[data-bar],[data-gap],[data-lane-bar]');
      if(!bar)return;
      event.preventDefault();closeContext();
      if(bar.dataset.gap!==undefined)contextGap=Number(bar.dataset.gap);
      else{
        const mi=Number(bar.dataset.bar??bar.dataset.laneBar);
        if(!snapshot().order.includes(mi)){
          if(multi){selected=[];multi=false;}
          choose(mi,Number(bar.dataset.laneTrack??track));
        }
        contextGap=mi;
      }
      $('arrContextCopy').disabled=!snapshot().order.length;
      $('arrContextPaste').disabled=!copied();
      $('arrContextDuplicate').disabled=!snapshot().order.length;
      context.showPopover();
      context.style.left=Math.max(4,Math.min(event.clientX,innerWidth-context.offsetWidth-5))+'px';
      context.style.top=Math.max(4,Math.min(event.clientY,innerHeight-context.offsetHeight-5))+'px';
      context.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
    }
    function bank(document){return document.clipBank||[];}
    function nameDialog(title,value,action){
      dialogAction=action;$('arrDialogHeading').textContent=title;$('arrDialogError').textContent='';
      $('arrVoltaFields').hidden=true;$('arrMeterFields').hidden=true;$('arrSceneFields').hidden=true;$('arrNameLabel').hidden=false;
      $('arrName').value=value;dialog.showModal();$('arrName').select();
    }
    function saveClip(fromSession=false){
      const state=snapshot();if(!fromSession&&!state.order.length)return;
      const initialFirst=state.contiguous?state.first:state.active,initialLast=state.contiguous?state.last:state.active;
      nameDialog('シーンを保存','シーン '+(bank(state.document).length+1),()=>{
        const now=snapshot(),from=$('arrSceneFrom').valueAsNumber-1,to=$('arrSceneTo').valueAsNumber-1;
        if(fromSession&&(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>=now.document.measures.length))
          throw Error('開始小節と終了小節を確認してください');
        if(fromSession&&to-from+1>C.CLIP_MEASURES)throw Error('1シーンは'+C.CLIP_MEASURES+'小節までです');
        const order=fromSession?Array.from({length:to-from+1},(_,i)=>from+i):now.order;
        const clip=A.capture(now.document,order,$('arrName').value);
        if(!A.sessionTracks(now.document,clip).some(Boolean))throw Error('音符がある小節を選んでください');
        if(bank(now.document).length>=C.CLIP_COUNT)throw Error('保存できるシーンは'+C.CLIP_COUNT+'個までです');
        api.apply({...now.document,clipBank:[...bank(now.document),clip]},'シーンを保存',now.active);
        view='session';render();say(clip.name+' を保存しました');
        requestAnimationFrame(()=>$('arrClips').querySelector('[data-scene="'+clip.id+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'}));
      });
      if(fromSession){
        for(const [id,index] of [['arrSceneFrom',initialFirst],['arrSceneTo',initialLast]]){
          const input=$(id);input.max=String(state.document.measures.length);input.value=String(index+1);
        }
        $('arrSceneFields').hidden=false;
      }
    }
    function changeClip(id,action){
      const document=doc(),active=snapshot(document).active,clip=bank(document).find(item=>item.id===id);
      if(!clip)return;
      if(action==='rename')nameDialog('シーン名を変更',clip.name,()=>{
        const name=$('arrName').value.trim();if(!name)throw Error('ブロック名を入力してください');
        const latest=doc();
        api.apply({...latest,clipBank:bank(latest).map(item=>item.id===id?{...item,name}:item)},'シーン名を変更',snapshot(latest).active);
        say('名前を変更しました');
      });
      if(action==='delete'){
        const activeTracks=session.active.filter(item=>item.clipId===id).map(item=>item.track);
        const queuedTracks=session.queued.filter(item=>item.clipId===id).map(item=>item.track);
        if(activeTracks.length||queuedTracks.length)launch(new Map([...activeTracks,...queuedTracks].map(track=>[track,null])));
        api.apply({...document,clipBank:bank(document).filter(item=>item.id!==id)},'シーンを削除',active);
        say('シーンを削除しました。元に戻せます');
      }
    }
    function moveScene(id,direction){
      const document=doc(),clips=bank(document).slice(),index=clips.findIndex(clip=>clip.id===id);
      if(index<0||!clips[index+direction])return;
      [clips[index],clips[index+direction]]=[clips[index+direction],clips[index]];
      applyBank(document,clips,'シーンの順番を変更');
      [...$('arrClips').querySelectorAll('[data-scene]')].find(row=>row.dataset.scene===id)
        ?.querySelector('[data-scene-move="'+direction+'"]')?.focus();
    }
    function pickMeter(state,clip,gap,item,copies){
      const first=clip.parts[0].measures[0].time,target=C.timeAt(state.document,gap);
      const format=time=>time.num+'/'+time.den;
      $('arrDialogHeading').textContent='拍子が異なる小節を貼り付け';
      $('arrDialogError').textContent='';
      $('arrNameLabel').hidden=$('arrSceneFields').hidden=$('arrVoltaFields').hidden=true;
      $('arrMeterFields').hidden=false;
      $('arrMeterSummary').textContent=C.sameTime(first,target)?
        '範囲の途中で拍子が異なります。':'先頭の拍子 '+format(first)+' → '+format(target);
      const scope=$('arrMeterFields');
      scope.querySelector('[value=original]').checked=true;
      const anchor=state.document.measures[gap]?.id,prev=state.document.measures[gap-1]?.id;
      dialogAction=()=>{
        const latest=doc(),at=anchor?latest.measures.findIndex(bar=>bar.id===anchor):latest.measures.length;
        if(latest.id!==state.document.id||at<0||latest.measures[at-1]?.id!==prev)
          throw Error('貼り付け先の小節が変わりました。もう一度選んでください');
        finishPlacement(at,item,copies,scope.querySelector('input:checked').value);
      };
      dialog.showModal();scope.querySelector('[value=original]').focus();
    }
    function place(gap,item=pending,copiesOverride){
      safe(()=>finishPlacement(gap,item,copiesOverride));
    }
    function finishPlacement(gap,item,copiesOverride,meterChoice){
      if(!item&&copied())return pasteAt(gap);
      if(!item){say('「選択順で挿入」か「移動」を先に選んでください');return;}
      const state=snapshot(doc(),item.sourceIds);
      if(item.sourceIds&&state.order.length!==item.sourceIds.length)throw Error('元の小節が変わりました。いったん取り消して選び直してください');
      let next,at=gap,count,label;
      if(item.type==='move'){
        if(!state.contiguous)throw Error('移動するには連続した小節を選んでください');
        const result=A.move(state.document,state.first,state.last,gap);
        if(result.document===state.document){say('別の挿入位置を選んでください');return;}
        next=result.document;at=result.index;count=state.order.length;label='小節を移動';
      }else if(item.type==='link'){
        const scene=bank(state.document).find(clip=>clip.id===item.id);
        if(!scene)throw Error('リンク元のシーンが見つかりません');
        next=A.linkScene(state.document,scene,gap,copiesOverride??Number($('arrCopies').value),item.partId);
        count=next.measures.length-state.document.measures.length;label='シーンをリンク配置';
      }else{
        const saved=item.type==='saved'&&bank(state.document).find(clip=>clip.id===item.id);
        const clip=item.type==='mix'?item.clip:item.type==='clipboard'?copied(state.document):item.type==='saved'?(saved&&A.sceneForTimeline(state.document,saved)):
          A.capture(state.document,state.order,'選択した小節');
        if(!clip)throw Error('そのブロックは削除されました');
        const copies=copiesOverride??Number($('arrCopies').value);
        if(!meterChoice&&A.differentMeters(state.document,clip,gap,copies)){pickMeter(state,clip,gap,item,copies);return;}
        const fitted=meterChoice==='fit'?A.fitMeters(state.document,clip,gap,copies):clip;
        next=A.insert(state.document,fitted,gap,meterChoice==='fit'?1:copies);
        count=next.measures.length-state.document.measures.length;
        label=item.type==='clipboard'||item.type==='drag-copy'?'小節を貼り付け':item.type==='mix'?'組み合わせを挿入':'シーンを挿入';
      }
      api.apply(next,label,at);
      pending=null;current=next.measures[at].id;
      multi=count>1;selected=next.measures.slice(at,at+count).map(bar=>bar.id);page=Math.floor(at/pageSize);
      render();reveal(at);
      say((at+1)+'小節目から '+count+' 小節を'+(item.type==='move'?'移動':item.type==='link'?'リンク配置':'挿入')+'しました');
    }
    function setRepeat(alternate=false){
      const state=snapshot();
      if(!state.contiguous){say('連続した小節を選んでください',true);return;}
      if(!alternate){
        safe(()=>{api.apply(A.markRepeat(state.document,state.first,state.last),'リピート記号を追加',state.active);say('リピート記号を追加しました');});
        return;
      }
      if(state.first===0||state.last+1>=state.document.measures.length){
        say('1番かっこにする小節を選んでください。前に繰り返す小節、後ろに2番かっこの小節が必要です',true);return;
      }
      const firstId=state.document.measures[state.first].id,lastId=state.document.measures[state.last].id;
      dialogAction=()=>{
        const latest=doc(),first=latest.measures.findIndex(bar=>bar.id===firstId),last=latest.measures.findIndex(bar=>bar.id===lastId);
        if(first!==state.first||last!==state.last)throw Error('小節順が変わりました。選び直してください');
        const from=$('arrRepeatFrom').valueAsNumber-1,secondCount=$('arrSecondCount').valueAsNumber;
        api.apply(A.markRepeat(latest,first,last,{alternate:true,from,secondCount}),'1・2番かっこを追加',state.active);
        say('1・2番かっこを追加しました');
      };
      $('arrDialogHeading').textContent='1・2番かっこ';$('arrDialogError').textContent='';
      $('arrNameLabel').hidden=true;$('arrMeterFields').hidden=true;$('arrSceneFields').hidden=true;$('arrVoltaFields').hidden=false;
      $('arrRepeatFrom').max=String(state.first);$('arrRepeatFrom').value=String(state.first);
      $('arrSecondCount').max=String(state.document.measures.length-state.last-1);$('arrSecondCount').value='1';
      dialog.showModal();$('arrRepeatFrom').select();
    }
    function endDrag(){
      dragging=null;panel.removeAttribute('data-dragging');
      grid.querySelector('[data-over]')?.removeAttribute('data-over');
    }
    function dragSource(element,item){
      element.classList.add('arr-grab');
      let pointer=null,ignoreClick=false;
      element.onpointerdown=event=>{
        if(event.button!==0||event.pointerType==='touch')return;
        const source=typeof item==='function'?item():item;
        if(!source)return;
        ignoreClick=false;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,source};
        element.setPointerCapture(event.pointerId);
      };
      const targetAt=event=>{
        const cell=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-gap],[data-bar],[data-lane-bar]');
        if(!cell||!grid.contains(cell))return null;
        const target=cell.dataset.gap!==undefined?cell.querySelector('button'):cell;
        return {target,gap:Number(cell.dataset.gap??cell.dataset.bar??cell.dataset.laneBar)};
      };
      element.onpointermove=event=>{
        if(pointer?.id!==event.pointerId)return;
        if(!dragging){
          if(Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<8)return;
          dragging=pointer.source;panel.setAttribute('data-dragging','');
          if(!pending)$('arrCopies').value='1';
        }
        const current=targetAt(event)?.target;
        const previous=grid.querySelector('[data-over]');
        if(previous!==current){previous?.removeAttribute('data-over');current?.setAttribute('data-over','');}
      };
      element.onpointerup=event=>{
        if(pointer?.id!==event.pointerId)return;
        pointer=null;
        if(!dragging)return;
        const gap=targetAt(event)?.gap,active=dragging;
        ignoreClick=true;endDrag();
        if(gap!==undefined)place(Number(gap),active);
      };
      element.onpointercancel=element.onlostpointercapture=()=>{pointer=null;if(dragging)endDrag();};
      element.addEventListener('click',event=>{
        if(!ignoreClick)return;
        ignoreClick=false;event.preventDefault();event.stopImmediatePropagation();
      },true);
    }
    function dragBar(index){
      const state=snapshot(),order=state.order.includes(index)?state.order:[index];
      return {type:'drag-copy',sourceIds:order.map(at=>state.document.measures[at].id)};
    }
    function paintGridSelection({active,order}){
      const chosen=new Map(order.map((index,i)=>[index,i+1]));
      for(const button of grid.querySelectorAll('[data-bar]')){
        const index=Number(button.dataset.bar),pick=chosen.get(index),cell=button.parentElement;
        cell.toggleAttribute('data-selected',!!pick);
        cell.toggleAttribute('data-active',index===active);
        button.setAttribute('aria-pressed',String(!!pick));

        const number=button.querySelector('.arr-order'),caption=button.querySelector('[data-bar-caption]');
        number.hidden=!multi||!pick;caption.hidden=!number.hidden;
        if(number.hidden)button.removeAttribute('aria-description');
        else{
          number.textContent=pick;
          button.setAttribute('aria-description',pick+'番目に選択');
        }
      }
      for(const button of grid.querySelectorAll('[data-lane-bar]'))
        button.parentElement.toggleAttribute('data-selected',chosen.has(Number(button.dataset.laneBar)));
    }
    function renderGrid(state){
      const {document}=state,language=api.name('ピアノ');
      // Keep cells attached between clicks so the browser can recognize a double-click.
      if(gridDocument===document&&gridPage===page&&gridLanguage===language){
        paintGridSelection(state);return;
      }
      gridDocument=document;gridPage=page;gridLanguage=language;
      const tracks=A.parts(document);
      const first=page*pageSize,end=Math.min(document.measures.length,first+pageSize);
      grid.style.setProperty('--visible-bars',String(end-first+1));
      const nodes=[];
      const indexes=Array.from({length:end-first},(_,i)=>first+i);
      nodes.push(node('div','arr-track-title','小節'));
      for(const index of indexes){
        const bar=document.measures[index],meter=C.timeAt(document,index);
        const cell=node('div','arr-bar'),chooseBar=button(String(index+1),()=>choose(index));
        chooseBar.dataset.bar=String(index);chooseBar.setAttribute('aria-label',(index+1)+'小節');
        const caption=bar.volta||bar.repeatStart||bar.repeatEnd?
          node('span','arr-repeat-mark',bar.volta?bar.volta+'.':bar.repeatStart?'𝄆':'𝄇'):
          node('small',null,meter.num+'/'+meter.den);
        caption.dataset.barCaption='';
        chooseBar.append(node('span','arr-order'),caption);
        const linked=(document.sceneLinks||[]).find(link=>link.bars.includes(bar.id));
        if(linked){
          const name=bank(document).find(clip=>clip.id===linked.sceneId)?.name;
          chooseBar.append(node('span','arr-link-mark','↗'));
          chooseBar.title='シーンにリンク · '+(name||'');cell.dataset.linked='';
        }else chooseBar.title='ドラッグして小節をコピー';
        dragSource(chooseBar,()=>dragBar(index));
        cell.append(chooseBar);nodes.push(cell);
      }
      nodes.push(node('div','arr-bar'));
      nodes.push(node('div','arr-track-title','小節間'));
      for(const gap of [...indexes,end]){
        const cell=node('div','arr-gap-slot'),target=button('＋',()=>place(gap));
        target.title=gap===document.measures.length?'曲末に配置':(gap+1)+'小節の前に配置';
        target.setAttribute('aria-label',target.title);
        cell.dataset.gap=String(gap);
        cell.append(target);nodes.push(cell);
      }
      for(const [partIndex,part] of tracks.entries()){
        const trackName=api.name(part.instrument);
        const label=button(trackName,()=>openScore(partIndex,snapshot().active));
        label.className='arr-track-title';label.title=trackName;nodes.push(label);
        for(const index of indexes){
          const bar=part.measures[index],cell=node('div','arr-lane'),mini=node('span','arr-phrase');
          const box=button('',event=>{if(event.detail<2)choose(index,partIndex,box);});
          box.setAttribute('aria-label',trackName+' '+(index+1)+'小節');
          box.title='ドラッグで小節をコピー · ダブルクリックでピアノロール';
          dragSource(box,()=>dragBar(index));
          box.ondblclick=event=>{
            event.preventDefault();
            current=doc().measures[index].id;track=partIndex;
            const hasNotes=events=>events?.some(note=>note.type==='note');
            const voice=!hasNotes(bar.events)&&hasNotes(bar.voice2)?2:1;
            setView('roll',{part:partIndex,measure:index,voice});
            $('rollScroll').focus({preventScroll:true});
          };
          box.dataset.laneBar=String(index);box.dataset.laneTrack=String(partIndex);
          cell.style.setProperty('--track-note',palette[partIndex%palette.length]);
          cell.style.setProperty('--track-fill',palette[partIndex%palette.length]+'28');
          showNotes(mini,bar,C.barTicks(part,index));box.append(mini);cell.append(box);nodes.push(cell);
        }
        nodes.push(node('div','arr-lane'));
      }
      grid.replaceChildren(...nodes);paintGridSelection(state);
    }
    function clipTarget(selection=selectedCell){
      const document=doc(),scene=bank(document).find(item=>item.id===selection?.sceneId),parts=A.parts(document);
      const index=parts.findIndex(part=>part.id===selection?.partId);
      if(!scene||index<0)return null;
      return {document,scene,track:parts[index],index,part:A.sceneParts(document,scene)[index]};
    }
    function applyBank(document,clips,label){
      api.apply(A.updateScenes(document,clips),label,snapshot(document).active);
    }
    function editScenePart(next){
      const target=clipTarget(clipEdit);
      if(!target)throw Error('シーンまたはパートが変更されました');
      const {document,scene,index}=target;
      applyBank(document,bank(document).map(item=>item===scene?A.sceneSlot(document,item,index,next):item),'クリップを編集');
    }
    function clipPart(){return clipTarget(clipEdit)?.part||clipEdit.blank;}
    function chooseCell(sceneId,partId){
      selectedCell={sceneId,partId};paintCells();
    }
    function openClip(selection=selectedCell){
      const target=clipTarget(selection);
      if(!target)return;
      const {document,scene,track,part}=target;
      clipEdit={sceneId:scene.id,partId:track.id,blank:part||A.blankClip(track,C.timeAt(document,snapshot(document).active))};
      view='roll';$('arrRoll').hidden=false;
      roll.show({part:0,measure:0,voice:1,draw:!part});
      render();$('rollScroll').focus({preventScroll:true});say('');
    }
    function emptyScene(clips){
      if(clips.length>=C.CLIP_COUNT)throw Error('シーンは'+C.CLIP_COUNT+'行まで追加できます');
      let n=clips.length+1;
      while(clips.some(scene=>scene.name==='シーン '+n))n++;
      return {id:C.uid(),name:'シーン '+n,parts:[]};
    }
    function addScene(){
      const document=doc(),clips=bank(document),scene=emptyScene(clips);
      selectedCell={sceneId:scene.id,partId:A.parts(document)[track]?.id||A.parts(document)[0].id};
      applyBank(document,[...clips,scene],'空のシーンを追加');
      render();focusCell();
    }
    function focusCell(){
      [...$('arrClips').querySelectorAll('.session-slot')].find(button=>
        button.dataset.sessionClip===selectedCell?.sceneId&&button.dataset.sessionTrack===selectedCell?.partId)?.focus();
    }
    function editCell(key){
      const target=clipTarget();
      if(!target){say('先にシーンのセルを選んでください');return;}
      const {document,scene,track:destination,index,part}=target,clips=bank(document);
      if(key==='c'||key==='x'){
        if(!part){say('クリップがあるセルを選んでください');return;}
        if(key==='x'){
          applyBank(document,clips.map(item=>item===scene?A.sceneSlot(document,item,index,null):item),'クリップを切り取り');
          stopRemoved(scene.id,destination.id);
        }
        slotClipboard=part;
        render();say(key==='x'?'クリップを切り取りました':'クリップをコピーしました');focusCell();
        return;
      }
      const source=key==='v'?slotClipboard:part;
      if(!source){say(key==='v'?'先にクリップをコピーしてください':'クリップがあるセルを選んでください');return;}
      let dest=scene,next=clips;
      if(key==='d'){
        dest=clips.slice(clips.indexOf(scene)+1).find(item=>!A.sceneParts(document,item)[index]);
        if(!dest){dest=emptyScene(clips);next=[...clips,dest];}
      }else if(part)throw Error('貼り付け先にクリップがあります。空いているセルを選んでください');
      const pasted=A.copyScenePart(source,destination);
      applyBank(document,next.map(item=>item===dest?A.sceneSlot(document,item,index,pasted):item),key==='d'?'クリップを複製':'クリップを貼り付け');
      selectedCell={sceneId:dest.id,partId:destination.id};
      render();say(key==='d'?'クリップを下に複製しました':'クリップを貼り付けました');focusCell();
    }
    function stopRemoved(sceneId,partId){
      if([...session.active,...session.queued].some(item=>item.clipId===sceneId&&item.track===partId))
        launch(new Map([[partId,null]]));
    }
    function moveCell(from,to){
      if(from.sceneId===to.sceneId&&from.partId===to.partId)return;
      const source=clipTarget(from),dest=clipTarget(to);
      if(!source?.part||!dest)return;
      if(dest.part)throw Error('移動先にクリップがあります。空いているセルを選んでください');
      const {document}=dest,pasted=A.copyScenePart(source.part,dest.track);
      const clips=bank(document).map(scene=>{
        let next=scene;
        if(scene===source.scene)next=A.sceneSlot(document,next,source.index,null);
        if(scene===dest.scene)next=A.sceneSlot(document,next,dest.index,pasted);
        return next;
      });
      applyBank(document,clips,'クリップを移動');stopRemoved(from.sceneId,from.partId);
      selectedCell=to;render();say('クリップを移動しました');focusCell();
    }
    function paintCells(){
      const target=clipTarget();
      $('arrClipTools').hidden=!target;
      if(target){
        $('arrClipSelection').textContent=target.scene.name+' · '+api.name(target.track.instrument);
        for(const id of ['arrCopyClip','arrCutClip','arrDuplicateClip'])$(id).disabled=!target.part;
        $('arrPasteClip').disabled=!slotClipboard||!!target.part;
        $('arrLinkClip').disabled=!A.hasNotes(target.part);
      }
      for(const cell of $('arrClips').querySelectorAll('.session-slot')){
        const selected=cell.dataset.sessionClip===selectedCell?.sceneId&&cell.dataset.sessionTrack===selectedCell?.partId;
        cell.setAttribute('aria-pressed',String(selected));
      }
    }
    function renderBank(document){
      const clips=bank(document),shelf=$('arrShelf'),playable=clips.filter(clip=>clip.parts.some(A.hasNotes));shelf.hidden=!playable.length;
      shelf.replaceChildren(...playable.map(clip=>{
        const chip=button(clip.name,()=>arm({type:'saved',id:clip.id}));
        chip.title=clip.name+'を配置。PCでは小節間へドラッグできます';
        dragSource(chip,{type:'saved',id:clip.id});return chip;
      }));
      const table=$('arrClips'),parts=A.parts(document),head=node('thead'),body=node('tbody');
      $('arrSessionScroll').hidden=!clips.length;
      if(!clips.length){
        $('arrSessionEmpty').hidden=false;table.replaceChildren();paintCells();return;
      }
      $('arrSessionEmpty').hidden=true;
      const labels=node('tr'),title=node('th','session-scenes','シーン');
      title.scope='col';labels.append(title);
      for(const [index,part] of parts.entries()){
        const name=api.name(part.instrument),header=node('th','session-track'),label=node('span',null,name);
        header.scope='col';header.style.setProperty('--session-color',palette[index%palette.length]);label.title=name;
        const stop=button('■',()=>launch(new Map([[part.id,null]])));
        stop.dataset.sessionStop=part.id;stop.setAttribute('aria-label',name+'を停止');
        header.append(label,stop);labels.append(header);
      }
      head.append(labels);
      for(const [sceneIndex,clip] of clips.entries()){
        const stored=A.sceneParts(document,clip),sources=stored.map(part=>A.hasNotes(part)?part:null),row=node('tr');
        row.dataset.scene=clip.id;
        const left=node('th','session-scenes'),name=node('strong',null,clip.name),actions=node('div','session-scene-actions');
        left.scope='row';
        const launchAll=button('▶ 一斉再生',()=>launch(new Map(parts.map((part,index)=>[part.id,choice(clip,sources[index])]))));
        launchAll.setAttribute('aria-label',clip.name+'を一斉再生');
        launchAll.disabled=!sources.some(Boolean);
        const placeButton=button('配置',()=>arm({type:'saved',id:clip.id}));
        placeButton.setAttribute('aria-label',clip.name+'をタイムラインに配置');
        placeButton.disabled=!sources.some(Boolean);
        const edit=button('名前',()=>changeClip(clip.id,'rename')),remove=button('削除',()=>safe(()=>changeClip(clip.id,'delete')));
        edit.setAttribute('aria-label',clip.name+'の名前を変更');remove.setAttribute('aria-label',clip.name+'を削除');
        const link=button('リンク配置',()=>arm({type:'link',id:clip.id}));
        link.setAttribute('aria-label',clip.name+'をリンク配置');
        link.disabled=!sources.some(Boolean);
        actions.append(launchAll,placeButton,link,edit,remove);
        for(const [direction,caption] of [[-1,'上'],[1,'下']]){
          const move=button(direction<0?'↑':'↓',()=>safe(()=>moveScene(clip.id,direction)));
          move.dataset.sceneMove=direction;move.setAttribute('aria-label',clip.name+'を'+caption+'へ移動');
          move.disabled=!clips[sceneIndex+direction];actions.append(move);
        }
        const bars=Math.max(0,...stored.map(part=>part?.measures.length||0));
        left.append(name,node('span','session-duration',bars?bars+'小節':'空のシーン'),actions);row.append(left);
        for(const [index,part] of parts.entries()){
          const cell=node('td','session-cell'),source=stored[index],partName=api.name(part.instrument);
          const pick={sceneId:clip.id,partId:part.id},label=clip.name+' · '+partName;
          const body=button('',()=>chooseCell(pick.sceneId,pick.partId));
          body.className='session-slot';body.dataset.sessionTrack=part.id;body.dataset.sessionClip=clip.id;
          body.dataset.sessionLabel=label;body.setAttribute('aria-label',label+(source?' · クリップ':' · 空のセル'));
          body.style.setProperty('--session-color',palette[index%palette.length]);
          body.onfocus=()=>chooseCell(pick.sceneId,pick.partId);
          body.ondblclick=()=>openClip(pick);
          body.onkeydown=event=>{
            if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey){
              event.preventDefault();chooseCell(pick.sceneId,pick.partId);openClip(pick);
            }
          };
          const text=node('span','session-slot-text',source?source.measures.length+'小節':'＋');
          const preview=node('span','arr-clip-preview');preview.setAttribute('aria-hidden','true');
          if(source)for(const [mi,bar] of source.measures.entries()){
            const measure=node('span');showNotes(measure,bar,C.barTicks(source,mi));preview.append(measure);
          }
          body.append(text);if(source)body.append(preview);
          body.draggable=!!source;
          body.ondragstart=event=>{slotDrag=pick;event.dataTransfer.setData('text/plain',label);event.dataTransfer.effectAllowed='move';};
          body.ondragend=()=>{slotDrag=null;};
          cell.ondragover=event=>{if(slotDrag&&!source){event.preventDefault();event.dataTransfer.dropEffect='move';}};
          cell.ondrop=event=>{if(slotDrag){event.preventDefault();const from=slotDrag;slotDrag=null;safe(()=>moveCell(from,pick));}};
          const wrap=node('div','session-cell-controls');
          const launchButton=button('▶',()=>launch(new Map([[part.id,choice(clip,sources[index])]])));
          launchButton.className='session-launch';launchButton.dataset.sessionLaunch=clip.id;launchButton.dataset.track=part.id;
          launchButton.dataset.label=label;launchButton.disabled=!sources[index];launchButton.setAttribute('aria-label',label+'を再生');
          wrap.append(body,launchButton);cell.append(wrap);row.append(cell);
        }
        body.append(row);
      }
      table.replaceChildren(head,body);paintCells();
    }
    function choice(clip,part){return part?{id:clip.id,part,loop:$('arrLoop').checked}:null;}
    function launch(changes){
      const document=doc(),tempo=document.tempo,time=C.timeAt(document,snapshot(document).active);
      const grid=$('arrQuantize').value==='beat'?60/tempo*4/time.den:0;
      if(!session.active.length&&!session.queued.length&&![...changes.values()].some(Boolean))return;
      api.sessionLaunch(changes,{tempo,grid,trackIds:A.parts(document).map(part=>part.id),onState:state=>{
        session=state;
        if(!panel.hidden)renderTransport();
      }}).catch(error=>say(error.message,true));
    }
    function renderTransport(){
      const stop=playing||session.queued.length||session.stopping.length,play=$('arrPlay');
      play.textContent=view==='session'?'■ 全停止':stop?'■ 停止':'▶ 再生';
      play.disabled=view==='session'&&!stop;
      const active=new Map(session.active.map(item=>[item.track,item.clipId]));
      const queued=new Map(session.queued.map(item=>[item.track,item.clipId]));
      const stopping=new Set(session.stopping);
      for(const button of $('arrClips').querySelectorAll('[data-session-launch]')){
        const {track,sessionLaunch:clip,label}=button.dataset;
        const state=queued.get(track)===clip?'queued':active.get(track)===clip?'active':'idle';
        if(button.dataset.state===state)continue;
        button.dataset.state=state;
        button.parentElement.dataset.state=state;
        button.textContent=state==='queued'?'◷':'▶';
        button.setAttribute('aria-label',label+(state==='queued'?' · 待機':state==='active'?' · 再生中':'を再生'));
      }
      for(const button of $('arrClips').querySelectorAll('[data-session-stop]')){
        const track=button.dataset.sessionStop;
        button.disabled=!active.has(track)&&!queued.has(track)&&!stopping.has(track);
        button.toggleAttribute('data-stopping',stopping.has(track));
      }
      $('arrPlaceMix').disabled=!active.size;
      $('arrUndo').disabled=!api.canUndo();
    }
    function render(){
      if(panel.hidden)return;
      const {document}=snapshot();
      if(project!==document.id){project=document.id;selectedCell=null;slotClipboard=null;clipEdit=null;selected=[];multi=false;pending=null;current=document.measures[0].id;page=0;}
      const corrected=snapshot(document);
      page=Math.min(page,Math.floor((document.measures.length-1)/pageSize));
      const timeline=view==='timeline';
      $('arrTimeline').hidden=!timeline;$('arrSession').hidden=view!=='session';$('arrRoll').hidden=view!=='roll';
      for(const tab of panel.querySelectorAll('[data-arr-view]'))tab.setAttribute('aria-pressed',String(tab.dataset.arrView===view));
      $('arrMulti').setAttribute('aria-pressed',String(multi));
      $('arrClear').hidden=!!pending||!multi||!corrected.order.length;
      $('arrMulti').disabled=!!pending;
      $('arrSelection').textContent=multi?(!corrected.order.length?'小節を順にタップ':corrected.order.length+' 小節選択'):(corrected.active+1)+'小節目';
      $('arrPage').textContent=(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,document.measures.length)+' / '+document.measures.length;
      $('arrPrevious').disabled=page===0;$('arrNext').disabled=(page+1)*pageSize>=document.measures.length;
      $('arrPlacement').hidden=!pending;$('arrActions').hidden=!!pending;
      $('arrCopiesLabel').hidden=pending?.type==='move';
      const source=pending?.sourceIds?snapshot(document,pending.sourceIds):corrected;
      const linked=(document.sceneLinks||[]).find(link=>link.bars.includes(document.measures[corrected.active].id));
      $('arrUnlink').hidden=!linked;
      $('arrPending').textContent=pending?.type==='link'?'リンク配置 · '+(bank(document).find(clip=>clip.id===pending.id)?.name||'シーン'):pending?.type==='mix'?pending.clip.name:pending?.type==='clipboard'?'コピーした '+(copied(document)?.parts[0].measures.length||0)+' 小節':pending?.type==='saved'?(bank(document).find(clip=>clip.id===pending.id)?.name||'シーン'):
        pending?.type==='move'?(source.order.length?source.first+1+'–'+(source.last+1)+'小節を移動':'移動元の小節を選び直してください'):'挿入順 '+rangeName(source.order);
      $('arrCopy').disabled=!corrected.order.length;$('arrPaste').hidden=!copied(document);
      $('arrUse').disabled=!corrected.order.length;$('arrSaveClip').disabled=!corrected.order.length;
      for(const id of ['arrMove','arrRepeat','arrVolta','arrLoopEdit'])$(id).disabled=!corrected.contiguous;
      $('arrClearRepeat').hidden=!corrected.contiguous||!A.repeatSections(document).some(group=>group.first<=corrected.last&&group.finish>=corrected.first);
      if(timeline)renderGrid(corrected);
      if(view==='roll'&&clipEdit&&!clipTarget(clipEdit)){clipEdit=null;view='session';render();return;}
      $('rollClipLabel').hidden=!clipEdit;
      if(clipEdit){const target=clipTarget(clipEdit);$('rollClipLabel').textContent=target.scene.name+' · '+api.name(target.track.instrument);}
      if(view==='roll')roll.refresh();
      const language=api.name('ピアノ');
      if(lastDocument!==document||lastView!==view||lastName!==language){renderBank(document);lastDocument=document;lastView=view;lastName=language;}
      renderTransport();
    }
    function reveal(index){
      const cell=grid.querySelector('[data-bar="'+index+'"]');if(!cell)return;
      scroller.scrollLeft=Math.max(0,cell.offsetLeft-(scroller.clientWidth-90)/2);
    }
    function turnPage(delta){page+=delta;render();scroller.scrollLeft=0;}
    function setView(next,position){
      if(view===next)return;
      if(view==='roll'&&!clipEdit){
        const position=roll.bounds();track=position.part;current=doc().measures[position.measure]?.id;
        page=Math.floor(position.measure/pageSize);
      }
      const active=snapshot().active;
      clipEdit=null;closeContext();view=next;$('arrRoll').hidden=next!=='roll';
      if(next==='roll')roll.show(position||{part:track,measure:active});
      render();if(next==='timeline')reveal(active);say('');
    }
    function openScore(part,index){
      const destination=view==='roll'&&!clipEdit&&part===undefined?roll.bounds():{part:part??track,measure:index??snapshot().active};
      clipEdit=null;closeContext();endDrag();panel.hidden=true;entryButton.textContent='タイムライン';entryButton.setAttribute('aria-expanded','false');
      panel.closest('.shell').classList.remove('arr-open');api.leave();api.openScore(destination.part,destination.measure,destination.tick,destination.voice);
    }
    function open(next='timeline'){
      const at=api.enter();if(!at)return;
      const document=doc();if(project!==document.id){selected=[];multi=false;pending=null;}
      if(project!==document.id){selectedCell=null;slotClipboard=null;}
      clipEdit=null;project=document.id;current=document.measures[at.measure]?.id||document.measures[0].id;
      track=at.part;page=Math.floor(at.measure/pageSize);view=next;
      panel.hidden=false;entryButton.textContent='楽譜編集';entryButton.setAttribute('aria-expanded','true');
      panel.closest('.shell').classList.add('arr-open');
      $('arrRoll').hidden=next!=='roll';
      if(next==='roll')roll.show(at);
      render();if(next==='timeline')reveal(at.measure);
      panel.querySelector('[data-arr-view="'+view+'"]').focus({preventScroll:true});say('');
    }
    entryButton.onclick=()=>panel.hidden?open():openScore();
    $('overviewArrangement').onclick=()=>open();
    $('menuPianoRoll').onclick=()=>open('roll');
    for(const tab of panel.querySelectorAll('[data-arr-view]'))tab.onclick=()=>setView(tab.dataset.arrView);
    $('arrMulti').onclick=()=>{
      multi=!multi;selected=[];render();
      if(multi)say('タップした順に番号が付きます。もう一度タップすると選択を外せます。');else say('');
    };
    $('arrClear').onclick=()=>{selected=[];render();};
    $('arrLoopEdit').onclick=()=>{
      const state=snapshot();
      if(!state.contiguous)return;
      openScore(track,state.first);api.loop(state.first,state.last);
    };
    $('arrCopy').onclick=()=>safe(()=>{if(copyMeasures())arm({type:'clipboard'});});
    $('arrPaste').onclick=()=>pasteAt(snapshot().active);
    $('arrContextCopy').onclick=()=>{closeContext(true);safe(()=>copyMeasures());};
    $('arrContextPaste').onclick=()=>{closeContext(true);pasteAt(contextGap);};
    $('arrContextDuplicate').onclick=()=>{closeContext(true);safe(duplicateAfter);};
    scroller.addEventListener('contextmenu',showContext);
    scroller.addEventListener('scroll',()=>closeContext(),{passive:true});
    document.addEventListener('pointerdown',event=>{if(!context.contains(event.target))closeContext();});
    $('arrUse').onclick=useOrdered;$('arrSaveClip').onclick=()=>saveClip();
    $('arrMove').onclick=()=>arm({type:'move'});
    $('arrRepeat').onclick=()=>setRepeat();$('arrVolta').onclick=()=>setRepeat(true);
    $('arrClearRepeat').onclick=()=>safe(()=>{
      const state=snapshot();
      api.apply(A.clearRepeat(state.document,state.first,state.last),'反復記号を解除',state.active);say('反復記号を解除しました');
    });
    $('arrClips').addEventListener('keydown',event=>{
      const start=event.target.closest('.session-slot');
      const moves={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};
      if(!start||!Object.hasOwn(moves,event.key)||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      event.preventDefault();
      const table=$('arrClips'),cell=start.closest('td'),[dy,dx]=moves[event.key];
      let row=cell.parentElement.rowIndex+dy,col=cell.cellIndex+dx;
      while(row>0&&row<table.rows.length&&col>0&&col<table.rows[row].cells.length){
        const target=table.rows[row].cells[col].querySelector('.session-slot');
        if(target){target.focus();return;}
        row+=dy;col+=dx;
      }
    });
    $('arrNewClip').onclick=()=>safe(addScene);
    $('arrCaptureScene').onclick=()=>saveClip(true);
    $('arrEditClip').onclick=()=>openClip();
    $('arrLinkClip').onclick=()=>{
      const target=clipTarget();if(A.hasNotes(target?.part))arm({type:'link',id:target.scene.id,partId:target.track.id});
    };
    $('arrUnlink').onclick=()=>safe(()=>{
      const state=snapshot(),link=(state.document.sceneLinks||[]).find(item=>item.bars.includes(state.document.measures[state.active].id));
      if(link){api.apply(A.unlink(state.document,link.id),'シーンのリンクを解除',state.active);say('リンクを解除しました');}
    });
    for(const [id,key] of [['arrCopyClip','c'],['arrCutClip','x'],['arrPasteClip','v'],['arrDuplicateClip','d']])
      $(id).onclick=()=>safe(()=>editCell(key));
    $('arrPlaceMix').onclick=()=>safe(()=>arm({type:'mix',clip:A.sessionMix(doc(),session.active)}));
    $('arrCancel').onclick=()=>{pending=null;render();say('');};
    $('arrAfter').onclick=()=>place(snapshot().active+1);
    $('arrEnd').onclick=()=>place(doc().measures.length);
    $('arrPrevious').onclick=()=>turnPage(-1);$('arrNext').onclick=()=>turnPage(1);
    $('arrUndo').onclick=()=>api.undo();
    $('arrPlay').onclick=()=>{
      if(playing||session.queued.length||session.stopping.length){api.stop();return;}
      const state=snapshot();
      if(view==='session')return;
      if(view==='roll'){
        if(clipEdit){
          const target=clipTarget(clipEdit);
          if(A.hasNotes(target?.part))launch(new Map([[target.track.id,choice(target.scene,target.part)]]));
          else say('クリップに音符を入力してください');
        }else api.rollPlay(roll.bounds());
        return;
      }
      api.play(A.playback(A.sliceParts(A.parts(state.document),state.active,state.document.measures.length-1)),false)
        .catch(error=>say(error.message,true));
    };
    $('arrDialogClose').onclick=()=>dialog.close();
    $('arrForm').onsubmit=event=>{
      event.preventDefault();
      try{dialogAction();dialog.close();}catch(error){$('arrDialogError').textContent=error.message;}
    };
    function keydown(event){
      if(panel.hidden||event.defaultPrevented||event.target.matches('input,select,textarea,[contenteditable=true]')||
        event.target.closest('dialog[open]'))return;
      if(event.key==='Escape'){
        event.preventDefault();
        if(context.matches(':popover-open'))closeContext(true);
        else if(pending)$('arrCancel').click();
        else openScore();
        return;
      }
      if(!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey)return;
      const key=event.key.toLowerCase(),advanced=['c','v','d'];
      if(key==='z'){event.preventDefault();api.undo();return;}
      if(view!=='timeline'||!advanced.includes(key))return;
      event.preventDefault();
      safe(()=>{
        if(key==='c')copyMeasures();
        if(key==='d')duplicateAfter();
        if(key==='v'){
          const gap=event.target.closest('[data-gap]')?.dataset.gap;
          pasteAt(gap===undefined?snapshot().active:Number(gap));
        }
      });
    }
    function clipboardEvent(event){
      if(panel.hidden||event.defaultPrevented||inTextOrDialog(event))return;
      if(view!=='timeline'){
        const command={copy:'c',cut:'x',paste:'v'}[event.type];
        event.preventDefault();
        if(command!=='v')event.clipboardData?.setData('text/plain','Kanade');
        if(view==='roll')roll.editClipboard(command);
        else safe(()=>editCell(command));
        return;
      }
      if(event.type==='cut')return;
      if(event.type==='copy'){
        const order=snapshot().order;if(!order.length)return;
        event.preventDefault();
        safe(()=>{
          if(copyMeasures(order))event.clipboardData?.setData('text/plain','Kanade · '+order.length+' 小節');
        });
        return;
      }
      if(!copied())return;
      event.preventDefault();
      const gap=event.target.closest('[data-gap]')?.dataset.gap;
      pasteAt(gap===undefined?snapshot().active:Number(gap));
    }
    function inTextOrDialog(event){
      return event.target.matches?.('input,textarea,select')||event.target.isContentEditable||
        event.target.closest?.('dialog[open]')||document.querySelector('dialog:modal');
    }
    for(const operation of ['copy','cut','paste'])document.addEventListener(operation,clipboardEvent);
    document.addEventListener('keydown',event=>{
      if(panel.hidden||event.defaultPrevented||event.isComposing||inTextOrDialog(event))return;
      if(view==='roll'){roll.shortcut(event);return;}
      if(view!=='session'||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey))return;
      const key=event.key.toLowerCase();
      if(!['c','x','v','d'].includes(key))return;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)safe(()=>editCell(key));
    },true);
    document.addEventListener('keydown',keydown);
    function presence(){
      if(panel.hidden||view==='session'||clipEdit)return null;
      const state=snapshot(),position=view==='roll'?roll.bounds():{part:track,measure:state.active};
      const part=A.parts(state.document)[position.part];
      return part?.measures[position.measure]?{partId:part.id,measureId:part.measures[position.measure].id,index:0,view}:null;
    }
    return {open,refresh:render,copyMeasures,readClipboard:copied,pasteAt,presence,
      progress:roll.progress,playing(value){playing=value;if(!panel.hidden)renderTransport();}};
  }
  root.KanadeArrangementUI={setup};
})(globalThis);
