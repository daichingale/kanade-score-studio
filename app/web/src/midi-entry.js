(function(root){
  'use strict';
  const P=root.KanadePerformance,C=root.KanadeCore;
  function setup(api){
    let access=null,port=null,enabled=false,step=null,timer=null;
    const enabledCheck=()=>enabled&&!api.blocked?.();
    function reset(){
      clearTimeout(timer);step=null;
    }
    function flush(){
      if(!step)return;
      const pending=step;reset();
      try{
        const pitches=pending.midis.map(midi=>P.fromMidi(midi,api.score().key));
        api.insert(pitches,'MIDIで入力');
      }catch(error){api.toast?.(error.message,true);}
    }
    function route(data,at){
      if(!enabledCheck())return;
      const note=P.midiNote(data);
      if(!note?.down)return;
      if(!step){
        step={midis:[]};
        timer=setTimeout(flush,48);
      }
      if(!step.midis.includes(note.pitch)&&step.midis.length<12)step.midis.push(note.pitch);
      try{api.monitor?.(note.pitch);}catch(_){}
    }
    function listen(){
      if(port)port.onmidimessage=null;
      port=access?.inputs.get(api.deviceId?.())||[...access?.inputs?.values()||[]][0]||null;
      if(port)port.onmidimessage=event=>route(event.data,event.timeStamp);
    }
    async function connect(){
      if(!navigator.requestMIDIAccess)return false;
      if(!access){
        access=await navigator.requestMIDIAccess({sysex:false});
        access.onstatechange=listen;
      }
      listen();
      return true;
    }
    return {
      setEnabled(value){enabled=!!value;if(!enabled)reset();if(enabled)connect().catch(()=>{});},
      isEnabled:()=>enabled,
      connect,
      devices:()=>access?[...access.inputs.values()].filter(i=>i.state!=='disconnected'):[]
    };
  }
  root.KanadeMidiEntry={setup};
})(typeof globalThis!=='undefined'?globalThis:this);