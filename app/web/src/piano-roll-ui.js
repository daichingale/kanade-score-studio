(function(root){
  'use strict';
  const C=root.KanadeCore,P=root.KanadePerformance,M=root.KanadePianoRoll,$=id=>document.getElementById(id);
  const low=12,high=119,row=21,pageSize=4,black=new Set([1,3,6,8,10]);
  const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const name=midi=>names[midi%12]+(Math.floor(midi/12)-1);
  const clamp=(value,start,end)=>Math.max(start,Math.min(end,value));
  function element(tag,cls,label){
    const result=document.createElement(tag);
    if(cls)result.className=cls;
    if(label!==undefined)result.textContent=label;
    return result;
  }
  function setup(api){
    const panel=$('arrRoll'),scroller=$('rollScroll'),field=$('rollField'),notes=$('rollNotes'),ruler=$('rollRuler'),keys=$('rollKeys');
    let track=0,voice=1,page=0,selection=null,cursor=null,draw=false,cache=null,shown=null,geometry=null,drag=null;
    let project=null,center=true,playbackTick=null;
    const gridTicks=()=>C.durationTicks(Number($('rollGridSize').value));
    const timeScale=()=>matchMedia('(max-width:760px)').matches?38/C.TPQ:58/C.TPQ;
    const selectedGroup=()=>cache?.groups.find(group=>group.id===selection?.id);
    const where=(offsets,at)=>C.locateTick(offsets,Math.min(at,offsets.at(-1)-1));

    function bounds(){
      const point=cursor&&cache?where(cache.offsets,cursor.tick):{mi:page*pageSize,tick:0};
      return {part:track,measure:point.mi,tick:point.tick,voice};
    }
    function safe(fn){
      try{fn();}catch(error){api.say(error.message,true);paintNotes();}
    }
    function button(label,action){
      const result=element('button',null,label);result.type='button';result.onclick=action;return result;
    }
    function paintKeys(){
      const stripes=[],rows=[];
      for(let midi=high;midi>=low;midi--){
        const pitch=midi,key=button(name(midi),()=>api.audition(track,pitch)),stripe=element('div','roll-stripe');
        key.className='roll-key';key.dataset.midi=String(midi);
        if(black.has(midi%12)){stripe.dataset.black='';key.dataset.black='';}
        if(midi%12===0){stripe.dataset.octave='';key.dataset.octave='';}
        stripes.push(stripe);rows.push(key);
      }
      keys.replaceChildren(...rows);$('rollStripes').replaceChildren(...stripes);
    }
    function read(){
      const tracks=api.parts();
      track=clamp(track,0,tracks.length-1);
      const part=tracks[track];
      if(!cache||cache.part.id!==part.id||cache.part.measures!==part.measures||cache.part.key!==part.key||cache.voice!==voice)
        cache=M.read(part,voice);
      return {tracks,part};
    }
    function centerOnNotes(){
      if(!center)return;
      center=false;
      const values=visibleGroups().flatMap(group=>group.pitches.map(C.pitchMidi));
      const midi=values.length?Math.round((Math.min(...values)+Math.max(...values))/2):60;
      scroller.scrollTop=Math.max(0,(high-midi)*row-scroller.clientHeight*.49);
    }
    function prepareGeometry(){
      const {offsets}=cache;
      const first=page*pageSize,end=Math.min(offsets.length-1,first+pageSize),scale=timeScale();
      const start=offsets[first],stop=offsets[end];
      geometry={first,end,start,stop,scale,width:Math.max(1,(stop-start)*scale)};
      panel.style.setProperty('--roll-width',geometry.width+'px');
      panel.style.setProperty('--roll-row',row+'px');
    }
    const x=tick=>(tick-geometry.start)*geometry.scale;
    const visibleGroups=()=>cache.groups.filter(group=>group.start<geometry.stop&&group.end>geometry.start);
    function paintGrid(){
      const {first,end}=geometry,{offsets,part}=cache;
      const headers=[],lines=[];
      for(let mi=first;mi<end;mi++){
        const start=offsets[mi],cap=offsets[mi+1]-start,time=C.timeAt(part,mi),beat=C.WHOLE/time.den;
        const header=button(String(mi+1),()=>{
          cursor={tick:start,midi:cursor?.midi??60};selection=null;refreshSelection();scroller.focus({preventScroll:true});
        });
        header.className='roll-bar';header.setAttribute('aria-label',(mi+1)+'小節目');
        header.style.setProperty('--bar-x',x(start)+'px');header.style.width=(cap*geometry.scale)+'px';
        header.append(element('small',null,time.num+'/'+time.den));headers.push(header);
        for(let tick=0;tick<cap;tick+=gridTicks()){
          const line=element('i','roll-beat');line.style.left=x(start+tick)+'px';
          if(tick===0)line.dataset.bar='';else if(tick%beat===0)line.dataset.beat='';
          lines.push(line);
        }
        for(let tick=beat;tick<cap;tick+=beat)if(tick%gridTicks()){
          const line=element('i','roll-beat');line.style.left=x(start+tick)+'px';line.dataset.beat='';lines.push(line);
        }
      }
      ruler.replaceChildren(...headers);$('rollBeats').replaceChildren(...lines);
      $('rollPage').textContent=(first+1)+'–'+end+' / '+(offsets.length-1);
      $('rollPrevious').disabled=first===0;$('rollNext').disabled=end>=offsets.length-1;
    }
    function refreshSelection(){
      const group=selectedGroup(),mi=cursor?where(cache.offsets,cursor.tick).mi:geometry.first;
      const point=cursor?name(cursor.midi)+' · '+(mi+1)+'小節目':(geometry.first+1)+'小節目';
      const chord=group&&group.pitches.length>1?' · 和音 '+group.pitches.length+'音':'';
      $('rollSelection').textContent=point+chord+(group?.tuplet?' · 連符':'');
      for(const button of panel.querySelectorAll('[data-roll-op]'))button.disabled=!group||
        (group.tuplet&&['left','right','shorter','longer'].includes(button.dataset.rollOp));
      for(const node of notes.querySelectorAll('[data-roll-note]')){
        const active=node.dataset.rollNote===selection?.id&&Number(node.dataset.midi)===selection?.midi;
        node.setAttribute('aria-pressed',String(active));
      }
      const line=$('rollPlayhead');
      if(cursor&&cursor.tick>=geometry.start&&cursor.tick<geometry.stop)field.style.setProperty('--roll-cursor',x(cursor.tick)+'px');
      else field.style.removeProperty('--roll-cursor');
      if(!Number.isFinite(playbackTick))line.hidden=true;
    }
    function paintNotes(){
      if(!geometry)return;
      const items=[];
      for(const group of visibleGroups())for(const pitch of group.pitches){
        const midi=C.pitchMidi(pitch);
        if(midi<low||midi>high)continue;
        const start=Math.max(group.start,geometry.start),end=Math.min(group.end,geometry.stop);
        const item=element('button','roll-note'),label=element('span','roll-note-name',name(midi));
        item.type='button';item.dataset.rollNote=group.id;item.dataset.midi=String(midi);
        item.setAttribute('aria-label',name(midi)+' · '+(where(cache.offsets,start).mi+1)+'小節目の音符');
        item.title=item.getAttribute('aria-label');
        const width=(end-start)*geometry.scale;
        item.style.left=x(start)+'px';item.style.top=((high-midi)*row+3)+'px';item.style.width=Math.max(5,width-1)+'px';
        if(group.tuplet)item.dataset.tuplet='';
        item.append(label);
        if(!group.tuplet&&group.end<=geometry.stop)item.append(element('span','roll-resize'));
        item.onclick=event=>{
          if(event.detail===0){setSelection(group.id,midi);refreshSelection();}
        };
        items.push(item);
      }
      notes.replaceChildren(...items);refreshSelection();
    }
    function setSelection(id,midi){
      selection={id,midi};
      const group=selectedGroup();
      if(group)cursor={tick:group.start,midi};
    }
    function show({part=track,measure=page*pageSize,tick=0,midi=60,voice:chosenVoice,draw:initialDraw}={}){
      const id=api.id();
      if(id!==project){project=id;track=part;voice=chosenVoice??1;draw=false;selection=null;cursor=null;cache=null;shown=null;playbackTick=null;}
      if(initialDraw!==undefined)draw=initialDraw;
      if(track!==part){track=part;selection=null;cursor=null;}
      if(chosenVoice&&voice!==chosenVoice){voice=chosenVoice;selection=null;cursor=null;}
      const previous=page;
      page=Math.floor(measure/pageSize);
      read();
      if(cache.offsets[measure]!==undefined){
        const absolute=cache.offsets[measure]+tick;
        if(cursor?.tick!==absolute)selection=null;
        cursor={tick:absolute,midi};
      }
      if(previous!==page||!shown){center=true;scroller.scrollLeft=0;}
      refresh(true);
      if(geometry&&cursor){
        const keyboardWidth=keys.offsetWidth;
        scroller.scrollLeft=Math.max(0,x(cursor.tick)-(scroller.clientWidth-keyboardWidth)*.16);
      }
    }
    function refresh(force=false){
      if(panel.hidden)return;
      const {tracks,part}=read();
      page=clamp(page,0,Math.floor((part.measures.length-1)/pageSize));
      const signature=JSON.stringify(tracks.map(item=>[item.id,item.instrument]));
      const selector=$('rollPart');
      if(selector.dataset.signature!==signature){
        selector.dataset.signature=signature;
        selector.replaceChildren(...tracks.map((item,i)=>new Option(api.name(item.instrument),String(i))));
      }
      selector.value=String(track);$('rollVoice').value=String(voice);
      $('rollDraw').setAttribute('aria-pressed',String(draw));field.toggleAttribute('data-draw',draw);
      $('rollDraw').textContent=draw?'入力中':'音符入力';
      selector.disabled=tracks.length===1;
      if(!selectedGroup())selection=null;
      if(cursor?.tick>=cache.offsets.at(-1))cursor=null;
      const key=[cache,page,gridTicks(),timeScale()];
      if(!force&&shown&&key.every((value,index)=>value===shown[index]))return;
      if(drag)return;
      shown=key;prepareGeometry();paintGrid();paintNotes();centerOnNotes();
    }
    function commit(part,id,midi,start,label){
      if(part!==cache.part){
        const mi=where(C.measureOffsets(part),start).mi;
        api.apply(track,part,label,mi);
      }
      read();
      selection=id?{id,midi}:null;
      cursor={tick:start,midi};
      const mi=where(cache.offsets,start).mi,nextPage=Math.floor(mi/pageSize);
      if(nextPage!==page){page=nextPage;scroller.scrollLeft=0;}
      refresh(true);scroller.focus({preventScroll:true});api.say(label);
    }
    function atPointer(event){
      const rect=field.getBoundingClientRect();
      const tick=clamp(geometry.start+(event.clientX-rect.left)/geometry.scale,geometry.start,geometry.stop-1);
      const mi=where(cache.offsets,tick).mi,from=cache.offsets[mi],step=gridTicks();
      return {tick:from+Math.floor((tick-from)/step)*step,midi:clamp(high-Math.floor((event.clientY-rect.top)/row),low,high)};
    }
    function insert(point){
      safe(()=>{
        const length=Math.min(gridTicks(),cache.offsets.at(-1)-point.tick);
        const next=M.insert(cache,point.tick,point.midi,length);
        commit(next.part,next.id,point.midi,point.tick,'音符を入力');
        api.audition(track,point.midi);
      });
    }
    function operation(key,step=1){
      const group=selectedGroup(),midi=selection?.midi;if(!group)return;
      safe(()=>{
        if(key==='delete'){
          const next=M.remove(cache,group,midi);commit(next,null,midi,group.start,'音を削除');return;
        }
        const pitch=clamp(midi+(key==='up'?step:key==='down'?-step:0),low,high);
        const start=group.start+(key==='left'?-gridTicks():key==='right'?gridTicks():0);
        const duration=group.end-group.start+(key==='shorter'?-gridTicks():key==='longer'?gridTicks():0);
        const next=M.changeTime(cache,group,start,Math.max(Math.min(gridTicks(),group.end-group.start),duration),midi,pitch);
        commit(next.part,next.id,pitch,start,pitch!==midi?'音高を変更':start!==group.start?'開始位置を変更':'音の長さを変更');
        if(pitch!==midi)api.audition(track,pitch);
      });
    }
    field.onclick=event=>{
      if(event.target.closest('[data-roll-note]'))return;
      const point=atPointer(event);
      if(draw){insert(point);return;}
      cursor=point;selection=null;refreshSelection();scroller.focus({preventScroll:true});
    };
    field.ondblclick=event=>{if(!draw&&!event.target.closest('[data-roll-note]'))insert(atPointer(event));};
    notes.onpointerdown=event=>{
      const item=event.target.closest('[data-roll-note]');
      if(!item||event.button!==0)return;
      const group=cache.groups.find(group=>group.id===item.dataset.rollNote);if(!group)return;
      event.preventDefault();
      const midi=Number(item.dataset.midi);
      setSelection(group.id,midi);refreshSelection();scroller.focus({preventScroll:true});
      drag={item,group,midi,pointer:event.pointerId,x:event.clientX,y:event.clientY,
        part:cache.part.measures,resize:!!event.target.closest('.roll-resize'),time:0,semitones:0,moved:false};
      item.setPointerCapture(event.pointerId);
    };
    notes.onpointermove=event=>{
      if(drag?.pointer!==event.pointerId)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved&&Math.hypot(dx,dy)<5)return;
      drag.moved=true;
      drag.time=drag.group.tuplet?0:Math.round(dx/geometry.scale/gridTicks())*gridTicks();
      drag.semitones=drag.resize?0:clamp(Math.round(-dy/row),low-drag.midi,high-drag.midi);
      drag.item.classList.add('roll-dragging');
      if(drag.resize)drag.item.style.width=Math.max(5,(drag.group.end-drag.group.start+drag.time)*geometry.scale)+'px';
      else drag.item.style.transform=`translate(${drag.time*geometry.scale}px,${-drag.semitones*row}px)`;
    };
    notes.onpointerup=event=>{
      if(drag?.pointer!==event.pointerId)return;
      const current=drag;drag=null;
      if(!current.moved){api.audition(track,current.midi);return;}
      safe(()=>{
        read();
        if(cache.part.measures!==current.part)throw Error('譜面が変更されました。音符を選び直してください');
        const {group,midi,resize,time,semitones}=current,start=group.start+(resize?0:time);
        const length=Math.max(Math.min(gridTicks(),group.end-group.start),group.end-group.start+(resize?time:0));
        const pitch=midi+semitones,next=M.changeTime(cache,group,start,length,midi,pitch);
        commit(next.part,next.id,pitch,start,resize?'音の長さを変更':'音符を移動');
        api.audition(track,pitch);
      });
    };
    notes.onpointercancel=notes.onlostpointercapture=()=>{
      if(!drag)return;drag=null;refresh(true);
    };
    $('rollPart').onchange=()=>{track=Number($('rollPart').value);selection=null;cursor=null;center=true;refresh(true);};
    $('rollVoice').onchange=()=>{voice=Number($('rollVoice').value);selection=null;cursor=null;center=true;refresh(true);};
    $('rollGridSize').onchange=()=>refresh(true);
    $('rollDraw').onclick=()=>{draw=!draw;refresh();};
    function turn(delta){page+=delta;selection=null;cursor=null;scroller.scrollLeft=0;center=true;refresh(true);}
    $('rollPrevious').onclick=()=>turn(-1);$('rollNext').onclick=()=>turn(1);
    for(const button of panel.querySelectorAll('[data-roll-op]'))button.onclick=()=>operation(button.dataset.rollOp);
    function editClipboard(key){
      if(drag)return;
      read();
      const group=selectedGroup(),midi=selection?.midi;
      if(key==='v'){
        const fragment=api.clipboard();
        if(!fragment){api.say('先に音符をコピーしてください');return;}
        safe(()=>{
          const next=M.pasteNotes(cache,fragment,cursor?.tick??geometry.start);
          commit(next.part,next.id,next.midi??cursor?.midi??60,next.start,'音符を貼り付けました');
        });
        return;
      }
      if(!group){api.say('先に音符を選んでください');return;}
      safe(()=>{
        if(key==='d'){
          const next=M.duplicate(cache,group,midi);
          commit(next.part,next.id,next.midi,next.start,'音符を複製しました');return;
        }
        const fragment=M.copyNote(cache,group,midi);
        if(key==='x')commit(M.remove(cache,group,midi),null,midi,group.start,'音符を切り取りました');
        api.clipboard(fragment);
        if(key==='c')api.say('音符をコピーしました');
      });
    }
    for(const button of panel.querySelectorAll('[data-roll-clipboard]'))
      button.onclick=()=>editClipboard(button.dataset.rollClipboard);
    function shortcut(event){
      if(panel.hidden||event.defaultPrevented||event.shiftKey||event.altKey||!(event.ctrlKey||event.metaKey))return false;
      const key=event.key.toLowerCase();
      if(!['c','x','v','d'].includes(key))return false;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)editClipboard(key);
      return true;
    }
    panel.onkeydown=event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||event.target.matches('select,input,textarea'))return;
      const actions={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Delete:'delete',Backspace:'delete'};
      if(!actions[event.key]||!selection)return;
      event.preventDefault();operation(actions[event.key],event.shiftKey?12:1);
    };
    window.addEventListener('resize',()=>refresh());
    paintKeys();
    return {show,refresh,bounds,shortcut,editClipboard,
      progress(position){
        const line=$('rollPlayhead');
        if(panel.hidden||!geometry||!position||position.measure<geometry.first||position.measure>=geometry.end){
          line.hidden=true;playbackTick=null;return;
        }
        playbackTick=cache.offsets[position.measure]+position.tick;line.hidden=false;line.style.left=x(playbackTick)+'px';
      }
    };
  }
  root.KanadePianoRollUI={setup};
})(globalThis);
