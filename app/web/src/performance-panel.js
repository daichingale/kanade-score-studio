(function(root){
  'use strict';
  const C=root.KanadeCore,P=root.KanadePerformance,$=id=>document.getElementById(id);
  const keys=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const heights=[0,2,4,5,7,9,11],blackKeys={1:1,3:2,6:4,8:5,10:6};
  const chordRoots=['C','C♯','D♭','D','E♭','E','F','F♯','G♭','G','A♭','A','B♭','B'];
  const qualities=[['','メジャー'],['m','マイナー'],['7','7'],['maj7','maj7'],['m7','m7'],['sus4','sus4'],['sus2','sus2'],['dim','dim'],['aug','aug'],['m7b5','m7♭5'],['dim7','dim7'],['6','6'],['m6','m6'],['add9','add9'],['9','9'],['m9','m9'],['maj9','maj9'],['7sus4','7sus4']];
  const pitchLabel=p=>p.step+({'-2':'𝄫','-1':'♭',0:'',1:'♯',2:'𝄪'}[p.alter])+p.octave;
  function setup(api){
    const panel=$('performancePanel'),status=$('performanceStatus'),piano=$('performancePiano');
    const device=$('performanceDevice'),connect=$('performanceMidi'),start=$('performanceStart');
    let mode='step',keyboardOctave=4,access=null,port=null,step=null,stepTimer=null,take=null,starting=false;

    function say(message,error=false){
      status.textContent=message;status.toggleAttribute('data-error',error);
    }
    function targetLabel(){
      const target=api.target();
      return (target.mi+1)+'小節目 · '+(target.voice===null?'第1声部':'第2声部');
    }
    function safe(fn){
      try{fn();}catch(error){say(error.message,true);}
    }
    function resetStep(){
      clearTimeout(stepTimer);step=null;
    }
    function flushStep(){
      if(!step)return;
      const pending=step;resetStep();
      safe(()=>{
        if(!api.matches(pending.target,true))throw Error('入力先が変わりました。もう一度弾いてください');
        api.insert(pending.midis.map(midi=>P.fromMidi(midi-pending.target.offset,pending.target.score.key)),'鍵盤で入力');
        say('入力しました · '+targetLabel());
      });
    }
    function routeNote(note,id,at){
      if(panel.hidden||mode==='chord')return;
      if(take){
        if(at<take.origin)return;
        const relative=at-take.origin;
        if(!note.down){
          const previous=take.held.get(id);
          if(previous)previous.off=relative;
          take.held.delete(id);return;
        }
        if(take.notes.length>=256)return;
        const previous=take.held.get(id);
        if(previous)previous.off=relative;
        const entered={pitch:note.pitch,on:relative};
        take.held.set(id,entered);take.notes.push(entered);
        api.monitor(note.pitch);
      }else if(mode==='step'&&note.down){
        if(!step){step={target:api.target(),midis:[]};stepTimer=setTimeout(flushStep,65);}
        if(!step.midis.includes(note.pitch)&&step.midis.length<12)step.midis.push(note.pitch);
      }
    }
    function listen(){
      if(port)port.onmidimessage=null;
      port=access.inputs.get(device.value)||null;
      if(port)port.onmidimessage=event=>{
        const note=P.midiNote(event.data);
        if(note)routeNote(note,'m'+note.channel+':'+note.pitch,event.timeStamp);
      };
    }
    function devices(){
      const current=device.value,inputs=[...access.inputs.values()].filter(input=>input.state!=='disconnected');
      device.replaceChildren(...inputs.map(input=>new Option(input.name||'MIDI入力機器',input.id)));
      if(inputs.some(input=>input.id===current))device.value=current;
      $('performanceDeviceLabel').hidden=!inputs.length;
      connect.textContent=inputs.length?'接続済み':'機器を再確認';
      listen();
      if(!take&&!panel.hidden&&mode!=='chord')say(inputs.length?'MIDI接続済み · '+targetLabel():'MIDI入力機器が見つかりません。機器を接続するか、画面鍵盤を使えます。');
    }
    connect.onclick=async()=>{
      if(!navigator.requestMIDIAccess){say('このブラウザではMIDI機器に接続できません。画面鍵盤は使えます。',true);return;}
      connect.disabled=true;
      try{
        access=access||await navigator.requestMIDIAccess({sysex:false});
        access.onstatechange=devices;devices();
        api.ready().catch(()=>{});
      }catch(_){say('MIDI接続を許可できませんでした。ブラウザのサイト設定を確認してください。',true);}
      finally{connect.disabled=false;}
    };
    device.onchange=()=>{resetStep();listen();};
    function paintKeyboard(){
      const makeKey=(semitone,black)=>{
        const button=document.createElement('button'),label=keys[semitone]+keyboardOctave;
        button.type='button';button.dataset.midi=String((keyboardOctave+1)*12+semitone);
        button.textContent=label;button.setAttribute('aria-label',label);
        if(black){button.dataset.black='';button.style.setProperty('--key-left',String(black/7*100)+'%');}
        return button;
      };
      piano.replaceChildren(...heights.map(note=>makeKey(note)),...Object.entries(blackKeys).map(([note,at])=>makeKey(Number(note),at)));
      $('performanceKeyboardRange').textContent='C'+keyboardOctave+'〜B'+keyboardOctave;
      $('performanceOctaveDown').disabled=keyboardOctave===0;
      $('performanceOctaveUp').disabled=keyboardOctave===8;
    }
    function pianoNote(button,id,down,at){
      button.toggleAttribute('data-playing',down);
      routeNote({pitch:Number(button.dataset.midi),down},id,at);
    }
    piano.onpointerdown=event=>{
      const button=event.target.closest('[data-midi]');
      if(!button||event.button!==0)return;
      event.preventDefault();button.setPointerCapture(event.pointerId);
      pianoNote(button,'p'+event.pointerId,true,event.timeStamp);
    };
    piano.onpointerup=piano.onpointercancel=piano.onlostpointercapture=event=>{
      const button=event.target.closest('[data-midi]');
      if(button?.hasAttribute('data-playing'))pianoNote(button,'p'+event.pointerId,false,event.timeStamp);
    };
    piano.onkeydown=event=>{
      const button=event.target.closest('[data-midi]');
      if(!button||![' ','Enter'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      if(!event.repeat)pianoNote(button,'k'+button.dataset.midi,true,event.timeStamp);
    };
    piano.onkeyup=event=>{
      const button=event.target.closest('[data-midi]');
      if(button&&[' ','Enter'].includes(event.key))pianoNote(button,'k'+button.dataset.midi,false,event.timeStamp);
    };
    $('performanceOctaveDown').onclick=()=>{keyboardOctave--;paintKeyboard();};
    $('performanceOctaveUp').onclick=()=>{keyboardOctave++;paintKeyboard();};

    function scheduleClick(ctx,time,accent){
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();
      oscillator.frequency.value=accent?1500:1050;
      gain.gain.setValueAtTime(.13,time);
      gain.gain.exponentialRampToValueAtTime(.0001,time+.035);
      oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(time);oscillator.stop(time+.04);
    }
    function updateTake(){
      const current=take,now=performance.now();
      const elapsed=now-current.origin;
      if(elapsed>=60000||current.notes.length>=256){finishTake(true);return;}
      const missed=Math.max(0,Math.floor((now-current.pulseTime)/current.beatMs));
      current.pulse+=missed;current.pulseTime+=missed*current.beatMs;
      while(current.pulseTime<=now+100){
        if(current.ctx)scheduleClick(current.ctx,current.ctx.currentTime+Math.max(.005,(current.pulseTime-now)/1000),current.pulse%4===0);
        current.pulse++;current.pulseTime+=current.beatMs;
      }
      const message=elapsed<0?'カウント '+Math.ceil(-elapsed/current.beatMs):
        '● 録音中 · '+(1+Math.floor(elapsed/current.beatMs))+'拍 · '+current.notes.length+'音';
      if(status.textContent!==message)say(message);
    }
    function takeControls(){
      const recording=!!take;
      for(const element of panel.querySelectorAll('[data-performance-mode],#performanceMidi,#performanceDevice,#performanceGrid,#performanceClick'))element.disabled=recording;
      $('performanceCancel').hidden=!recording;
      start.textContent=recording?'停止して入力':'録音開始';
    }
    async function beginTake(){
      if(starting)return;
      resetStep();
      try{
        api.check();
        const target=api.target(),beatMs=60000/target.score.tempo;
        const grid=C.durationTicks(Number($('performanceGrid').value)),wantClick=$('performanceClick').checked;
        starting=true;
        let ctx=null;
        try{ctx=await api.ready();}catch(error){if(wantClick)throw error;}
        if(panel.hidden||mode!=='record')return;
        if(!api.matches(target,true))throw Error('入力先が変わりました。もう一度録音を開始してください');
        const first=performance.now()+85;
        take={target,beatMs,grid,origin:first+4*beatMs,pulse:0,pulseTime:first,
          ctx:wantClick?ctx:null,notes:[],held:new Map()};
        take.timer=setInterval(updateTake,32);
        takeControls();updateTake();
      }catch(error){say(error.message,true);}
      finally{starting=false;}
    }
    function finishTake(keep){
      const finished=take;
      clearInterval(finished.timer);take=null;takeControls();
      if(!keep){say('録音を破棄しました');return;}
      if(!finished.notes.length){say('録音した音がありません');return;}
      safe(()=>{
        if(!api.matches(finished.target,false))throw Error('録音中に入力先の楽譜が変わりました。もう一度録音してください');
        const groups=P.quantize(finished.notes,{beatMs:finished.beatMs,grid:finished.grid,elapsed:performance.now()-finished.origin});
        api.record(finished.target,groups);
        say(groups.length+'か所に入力しました · まとめて元に戻せます');
      });
    }
    start.onclick=()=>take?finishTake(true):beginTake();
    $('performanceCancel').onclick=()=>finishTake(false);
    function refreshChord(){
      try{
        const pitches=P.chordPitches($('performanceSymbol').value,Number($('performanceChordOctave').value));
        $('performanceChordNotes').textContent=pitches.map(pitchLabel).join(' · ');
        $('performanceInsertChord').disabled=false;$('performanceWriteSymbol').disabled=false;
        return pitches;
      }catch(_){
        $('performanceChordNotes').textContent='コード名の例  Cmaj7、B♭m7、D/F♯';
        $('performanceInsertChord').disabled=true;$('performanceWriteSymbol').disabled=true;
        return null;
      }
    }
    $('performanceRoot').replaceChildren(...chordRoots.map(root=>new Option(root)));
    $('performanceQuality').replaceChildren(...qualities.map(([quality,label])=>new Option(label,quality)));
    $('performanceChordOctave').replaceChildren(...[2,3,4,5,6].map(n=>new Option(String(n))));
    $('performanceChordOctave').value='4';
    $('performanceRoot').onchange=$('performanceQuality').onchange=()=>{
      $('performanceSymbol').value=$('performanceRoot').value+$('performanceQuality').value;
      refreshChord();
    };
    $('performanceSymbol').oninput=$('performanceChordOctave').onchange=refreshChord;
    $('performanceChord').onsubmit=event=>{
      event.preventDefault();
      const pitches=refreshChord();if(!pitches)return;
      safe(()=>{api.insert(pitches,$('performanceSymbol').value+' を入力');say('和音を入力しました · '+targetLabel());});
    };
    $('performanceWriteSymbol').onclick=()=>safe(()=>{
      if(!refreshChord())return;
      api.symbol($('performanceSymbol').value.trim());
      say('コード名を記譜しました · '+targetLabel());
    });
    function setMode(next){
      if(take)return;
      resetStep();mode=next;
      for(const button of panel.querySelectorAll('[data-performance-mode]'))button.setAttribute('aria-pressed',String(button.dataset.performanceMode===mode));
      $('performanceKeys').hidden=mode==='chord';$('performanceChord').hidden=mode!=='chord';
      $('performanceRecordTools').hidden=mode!=='record';
      $('performanceHint').textContent=mode==='record'?'4拍のカウント後に演奏し、「停止して入力」を押します。現在のテンポで音の長さと位置をそろえます。':
        '現在の音価で1つずつ入力します。同時に弾いた音は和音になります。';
      if(mode==='chord')refreshChord();
      say(targetLabel());
    }
    function open(next=mode){
      panel.hidden=false;$('performanceOpen').setAttribute('aria-expanded','true');
      if(!take)setMode(next);
      panel.querySelector('[data-performance-mode][aria-pressed=true]').focus({preventScroll:true});
    }
    function close(){
      if(take){say('「停止して入力」または「破棄」を押してください');return;}
      resetStep();panel.hidden=true;$('performanceOpen').setAttribute('aria-expanded','false');api.focus();
    }
    $('performanceOpen').onclick=()=>panel.hidden?open():close();
    $('performanceClose').onclick=close;
    panel.onclick=event=>{
      const choice=event.target.closest('[data-performance-mode]');
      if(choice)setMode(choice.dataset.performanceMode);
    };
    panel.onkeydown=event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      event.stopPropagation();
    };
    paintKeyboard();
    return {open,isRecording:()=>!!take,hide:()=>{if(!panel.hidden)close();}};
  }
  root.KanadePerformancePanel={setup};
})(globalThis);
