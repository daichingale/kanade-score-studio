(function(root){
  'use strict';
  const C=root.KanadeCore,A=root.KanadeArrangement,M=root.KanadeMastering,$=id=>document.getElementById(id);
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  const defaultTrack={level:100,pan:0,mute:false,solo:false};
  function setup(api){
    const {sound}=api,dialog=$('mixDialog'),host=$('mixTracks');
    let project=null,mix=null,trackSignature='',request=null,last=null,paused=false,launching=false,latestDoc=null,refreshFrame=0,revision=0,controlSignature='';
    const mastering=$('mixMastering'),masterFields={gain:'mixDrive',low:'mixLow',high:'mixHigh',ceiling:'mixCeiling'};
    let meterTimer=0;
    const db=value=>value<0?'−'+Math.abs(value):value>0?'+'+value:'0';
    const config=id=>Object.hasOwn(mix.tracks,id)?mix.tracks[id]:defaultTrack;
    function number(value,fallback,minimum,maximum){
      return Number.isFinite(value)?clamp(value,minimum,maximum):fallback;
    }
    function loadMix(){
      let saved;
      try{saved=JSON.parse(localStorage.getItem('kanade.mix.'+project));}catch(_){}
      const tracks=Object.fromEntries(Object.entries(saved?.tracks||{}).slice(0,96).map(([id,track])=>[id,{
        level:number(track?.level,100,0,150),pan:number(track?.pan,0,-100,100),mute:track?.mute===true,solo:track?.solo===true
      }]));
      return {master:number(saved?.master,100,0,150),room:number(saved?.room,8,0,35),mastering:M.settings(saved?.mastering),tracks};
    }
    function syncMix(persist=false){
      const tracks=Object.fromEntries(api.parts().filter(part=>Object.hasOwn(mix.tracks,part.id)).map(part=>[part.id,mix.tracks[part.id]]));
      sound.setMix({...mix,tracks});
      $('mixMaster').value=String(mix.master);$('mixMasterValue').textContent=mix.master+'%';
      $('mixRoom').value=String(mix.room);$('mixRoomValue').textContent=mix.room+'%';
      for(const [key,id] of Object.entries(masterFields)){
        $(id).value=String(mix.mastering[key]);
        const unit=key==='ceiling'?'dBFS':'dB';
        $(id+'Value').textContent=db(mix.mastering[key])+' '+unit;
      }
      $('mixLimiter').checked=mix.mastering.limiter;
      $('mixCeiling').disabled=!mix.mastering.limiter;
      if(persist)try{localStorage.setItem('kanade.mix.'+project,JSON.stringify(mix));}catch(_){}
      if(dialog.open)refreshRows();
    }
    function meter(){
      const {peak,reduction}=sound.masterLevels();
      const level=peak>.00001?20*Math.log10(peak):-Infinity;
      $('mixPeak').value=Math.max(-60,Math.min(0,level));
      $('mixPeak').toggleAttribute('data-over',level>=0);
      $('mixPeakValue').textContent=(Number.isFinite(level)?db(Number(level.toFixed(1))):'−∞')+' dBFS';
      $('mixReduction').textContent=!mix.mastering.limiter?'オフ':reduction===null?'ピーク保護':`抑制 ${reduction.toFixed(1)} dB`;
    }
    function watchMeter(){
      clearInterval(meterTimer);meterTimer=0;
      if(dialog.open&&mastering.open){meter();meterTimer=setInterval(meter,65);}
    }
    function node(tag,text){
      const result=document.createElement(tag);
      if(text!==undefined)result.textContent=text;
      return result;
    }
    function change(id,update){
      mix.tracks={...mix.tracks,[id]:{...config(id),...update}};
      syncMix(true);
    }
    function slider(name,id,key,minimum,maximum){
      const label=node('label'),input=node('input'),out=node('output');
      label.className='mix-slider'+(key==='pan'?' pan':'');
      input.type='range';input.min=String(minimum);input.max=String(maximum);
      input.dataset.mixKey=key;input.setAttribute('aria-label',name);
      input.oninput=()=>change(id,{[key]:Number(input.value)});
      label.append(input,out);return label;
    }
    function toggleButton(name,id,key,label){
      const button=node('button',label);
      button.type='button';button.dataset.mixKey=key;button.setAttribute('aria-label',name);
      button.onclick=()=>change(id,{[key]:!config(id)[key]});
      return button;
    }
    function renderTracks(){
      const parts=api.parts(),signature=JSON.stringify(parts.map(part=>[part.id,part.instrument,part.sound]));
      if(signature===trackSignature)return;
      trackSignature=signature;
      syncMix();
      host.replaceChildren(...parts.map(part=>{
        const id=part.id,name=part.instrument,row=node('div'),label=node('b',name),buttons=node('div');
        row.className='mix-track';row.dataset.mixTrack=id;label.title=name;buttons.className='mix-buttons';
        buttons.append(toggleButton(name+'をソロ',id,'solo','ソロ'),toggleButton(name+'をミュート',id,'mute','ミュート'));
        row.append(label,slider(name+'の音量',id,'level',0,150),slider(name+'の左右',id,'pan',-100,100),buttons);
        return row;
      }));
    }
    function refreshRows(){
      const solo=[...host.children].some(row=>config(row.dataset.mixTrack).solo);
      for(const row of host.children){
        const value=config(row.dataset.mixTrack);
        row.toggleAttribute('data-quiet',value.mute||(solo&&!value.solo));
        for(const key of ['level','pan']){
          const slider=row.querySelector('[data-mix-key="'+key+'"]');
          slider.value=String(value[key]);
          slider.nextElementSibling.textContent=key==='level'?value.level+'%':value.pan<0?'L'+(-value.pan):value.pan>0?'R'+value.pan:'中央';
        }
        for(const key of ['solo','mute'])row.querySelector('[data-mix-key="'+key+'"]').setAttribute('aria-pressed',String(value[key]));
      }
    }
    function refresh(){
      const id=api.document().id;
      if(project!==id){project=id;mix=loadMix();trackSignature='';latestDoc=null;syncMix();}
      if(dialog.open){renderTracks();refreshRows();}
      renderControls();
    }
    function open(){
      refresh();
      if(!dialog.open)dialog.show();
      renderTracks();refreshRows();
      watchMeter();
      $('mixClose').focus({preventScroll:true});
    }
    function bounds(measures){
      const reference=api.parts()[0],offsets=C.measureOffsets(reference),at=api.cursor();
      const selected=measures?{start:offsets[measures[0]],end:offsets[measures[1]+1]}:api.selection();
      const start=clamp(selected?.start??offsets[at.mi],0,offsets.at(-1));
      const end=clamp(selected?.end??offsets[at.mi+1],start,offsets.at(-1));
      const left=C.locateTick(offsets,start),right=C.locateTick(offsets,Math.max(start,end-.001));
      return {startId:reference.measures[left.mi]?.id,endId:reference.measures[right.mi]?.id,
        startTick:left.tick,endTick:end-offsets[right.mi]};
    }
    function performance(req){
      const originals=api.parts(),reference=originals[0],rate=Number($('mixRate').value);
      const tracks=req.scope==='part'?originals.filter(part=>part.id===req.part):originals;
      if(!tracks.length)throw Error('再生するパートが見つかりません');
      if(req.loop){
        const left=reference.measures.findIndex(bar=>bar.id===req.bounds.startId);
        const right=reference.measures.findIndex(bar=>bar.id===req.bounds.endId);
        if(left<0||right<left)throw Error('ループ範囲の小節が変更されました。範囲を選び直してください');
        const offsets=C.measureOffsets(reference);
        const from=offsets[left]+Math.min(req.bounds.startTick,C.barTicks(reference,left));
        const to=offsets[right]+Math.min(req.bounds.endTick,C.barTicks(reference,right));
        if(to<=from)throw Error('ループ範囲の長さがなくなりました。範囲を選び直してください');
        return {tracks,options:{from,to,rate,loop:true,allowEmpty:true},left,right};
      }
      const measureMap=A.playbackOrder(reference),index=Math.max(0,measureMap.indexOf(req.from.mi)),expanded=A.playback(tracks,reference);
      const offsets=C.measureOffsets(expanded[0]),from=offsets[index]+Math.min(req.from.tick,C.barTicks(expanded[0],index)-1);
      return {tracks:expanded,options:{from,rate,measureMap,allowEmpty:true}};
    }
    function renderControls(){
      const active=!!request,playing=active&&sound.playing&&!paused,loop=!!request?.loop;
      const position=last?(last.measure+1)+'小節 · '+(1+Math.floor(last.tick/api.beatLength(last.measure)))+'拍':'先頭';
      const waiting=loop&&last&&last.revision!==revision?' · 更新待ち':'';
      const message=loop?position+' · 周回 '+(last?.pass||1)+waiting:position;
      const key=JSON.stringify([playing,paused,active,sound.playing,loop,message]);
      if(controlSignature===key)return;
      controlSignature=key;
      for(const button of document.querySelectorAll('[data-transport-action="toggle"]'))
        button.textContent=playing?'❚❚ 一時停止':paused?'▶ 再開':'▶ 再生';
      for(const button of document.querySelectorAll('[data-transport-action="loop"],[data-mobile-action="loop"]')){
        button.setAttribute('aria-pressed',String(loop));
        button.textContent=loop?'ループ解除':'範囲ループ';
      }
      for(const button of document.querySelectorAll('[data-transport-action="stop"]'))button.disabled=!active&&!sound.playing;
      for(const out of document.querySelectorAll('[data-transport-position]'))if(out.textContent!==message)out.textContent=message;
      api.state({playing,paused,active});
    }
    function progress(position){
      last=position;
      api.progress(position,{follow:$('mixFollow').checked&&!request?.loop,loop:!!request?.loop});
      renderControls();
    }
    function launch(next,resumeAt){
      try{
        api.beforePlay();
        const prepared=performance(next);
        request=next;paused=false;latestDoc=api.document();launching=true;revision=0;
        sound.play(prepared.tracks,{...prepared.options,resumeAt,onProgress:progress}).catch(error=>{
          if(request===next){request=null;last=null;paused=false;api.clearProgress();renderControls();}
          api.error(error.message);
        });
        launching=false;
        renderControls();
      }catch(error){api.error(error.message);}
    }
    function clear(){
      request=null;paused=false;last=null;latestDoc=null;cancelAnimationFrame(refreshFrame);refreshFrame=0;
      api.clearProgress();renderControls();
    }
    function stop(){clear();sound.stop();}
    function playing(value){
      if(!value&&!launching&&!paused&&request)clear();
      else if(!launching)renderControls();
    }
    function newRequest({from=false,loop=false,measures}={}){
      const scope=$('mixScope').value;
      return {scope,part:api.partId(),from:from?api.cursor():{mi:0,tick:0},loop,bounds:loop?bounds(measures):null};
    }
    function toggle(fromCursor){
      if(sound.playing&&request){paused=true;sound.stop();renderControls();return;}
      if(paused&&request){launch(request,last?.absolute);return;}
      last=null;launch(newRequest({from:fromCursor}));
    }
    function toggleLoop(){
      if(request?.loop){stop();return;}
      last=null;launch(newRequest({loop:true}));
    }
    function edit(){
      if(!request?.loop||paused||!sound.playing||refreshFrame)return;
      refreshFrame=requestAnimationFrame(()=>{
        refreshFrame=0;if(!request?.loop||paused||!sound.playing)return;
        const current=api.document();if(current===latestDoc)return;
        try{
          const next=performance(request);
          if(sound.updateLoop(next.tracks,{...next.options,revision:revision+1})){latestDoc=current;revision++;renderControls();}
        }catch(error){stop();api.error(error.message);}
      });
    }
    for(const button of document.querySelectorAll('[data-transport-action]')){
      button.addEventListener('click',()=>{
        const {transportAction:action}=button.dataset;
        if(action==='mix'){open();return;}
        if(action==='stop'){stop();return;}
        if(action==='from'){last=null;launch(newRequest({from:true}));return;}
        if(action==='loop'){toggleLoop();return;}
        if(action==='toggle')toggle(button.closest('.overview-transport')!==null);
      });
    }
    $('mixClose').onclick=()=>dialog.close();
    dialog.addEventListener('close',watchMeter);
    mastering.addEventListener('toggle',watchMeter);
    for(const [key,id] of Object.entries(masterFields)){
      $(id).oninput=()=>{mix.mastering[key]=Number($(id).value);syncMix(true);};
    }
    $('mixLimiter').onchange=()=>{mix.mastering.limiter=$('mixLimiter').checked;syncMix(true);};
    $('mixMasteringReset').onclick=()=>{mix.mastering=M.settings();syncMix(true);};
    $('mixMaster').oninput=()=>{mix.master=Number($('mixMaster').value);syncMix(true);};
    $('mixRoom').oninput=()=>{mix.room=Number($('mixRoom').value);syncMix(true);};
    $('mixReset').onclick=()=>{mix={master:100,room:8,tracks:{},mastering:M.settings()};syncMix(true);};
    $('mixRate').onchange=()=>{if(request&&!paused)launch(request,last?.absolute);};
    $('mixScope').onchange=()=>{
      if(request&&sound.playing)launch({...request,scope:$('mixScope').value,part:api.partId()},last?.absolute);
    };
    $('mixAudioSource').onclick=()=>{dialog.close();api.openSource();};
    dialog.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();dialog.close();}
      event.stopPropagation();
    };
    refresh();
    return {toggle,toggleLoop,open,stop,playing,edit,refresh,exportMix:()=>C.copy(sound.mix),isLoop:()=>!!request?.loop,
      loopMeasures:(first,lastMeasure)=>{last=null;launch(newRequest({loop:true,measures:[first,lastMeasure]}));},
      playAt:(mi,tick,part)=>{last=null;launch({...newRequest(),from:{mi,tick},part});}
    };
  }
  root.KanadeTransport={setup};
})(globalThis);
