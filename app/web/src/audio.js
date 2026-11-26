/* Local Web Audio synth: shared context, short input feedback and scheduled playback. */
(function(root){
  'use strict';
  class Engine {
    constructor(onPlaybackChange=()=>{}) {
      this.context=null;this.voices=new Set();this.playing=false;
      this.sampleBank=new root.KanadeSamples.Bank();this.preparedSamples=new Map();this.auditionRequest=0;this.noiseBuffer=null;this.timer=null;this.generation=0;this.onPlaybackChange=onPlaybackChange;
      this.mix={master:100,room:8,tracks:{},solo:[]};this.channels=new Map();this.master=null;this.room=null;this.mastering=null;this.masterReady=null;this.session=null;
    }
    async ready() {
      const Audio=root.AudioContext||root.webkitAudioContext;
      if(!Audio)throw new Error('このブラウザは音声再生に対応していません');
      if(!this.context||this.context.state==='closed'){this.context=new Audio();this.master=null;this.masterReady=null;this.channels.clear();}
      if(this.context.state!=='running')await this.context.resume();
      if(this.context.state!=='running')throw new Error('音声を開始できません。もう一度再生を押してください');
      if(!this.master)this.initGraph();
      await this.masterReady;
      return this.context;
    }
    initGraph(offline=false){
      const ctx=this.context,glue=ctx.createDynamicsCompressor();
      this.master=ctx.createGain();this.master.gain.value=this.mix.master/100;
      glue.threshold.value=-13;glue.knee.value=14;glue.ratio.value=5;
      glue.attack.value=.006;glue.release.value=.17;
      this.master.connect(glue);
      this.mastering=new root.KanadeMastering.Mastering(ctx,glue);
      this.mastering.update(this.mix.mastering,false);
      if(offline)this.mastering.gain.connect(ctx.destination);
      else this.masterReady=this.mastering.connect();
      const reverb=ctx.createConvolver(),samples=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*.72),ctx.sampleRate);
      for(let channel=0;channel<2;channel++){
        const data=samples.getChannelData(channel),predelay=Math.ceil(ctx.sampleRate*(channel?.023:.017));
        for(let i=predelay;i<data.length;i++){
          const shape=Math.pow(1-(i-predelay)/(data.length-predelay),3.8);
          data[i]=(Math.random()*2-1)*shape;
        }
      }
      reverb.buffer=samples;this.room=ctx.createGain();this.room.gain.value=this.mix.room/100;
      this.master.connect(reverb);reverb.connect(this.room);this.room.connect(glue);
    }
    masterLevels(){return this.mastering?.levels()||{peak:0,reduction:0};}
    channel(part){
      if(!part)return this.master;
      if(!this.channels.has(part)){
        const ctx=this.context,gain=ctx.createGain(),pan=ctx.createStereoPanner?.();
        if(pan){gain.connect(pan);pan.connect(this.master);}else gain.connect(this.master);
        this.channels.set(part,{gain,pan});this.updateChannel(part,false);
      }
      return this.channels.get(part).gain;
    }
    updateChannel(part,smooth=true){
      const channel=this.channels.get(part),config=Object.hasOwn(this.mix.tracks,part)?this.mix.tracks[part]:null;
      const solo=this.mix.solo.some(id=>!this.session||this.session.trackIds.has(id));
      const level=config?.mute||(solo&&!(config?.solo))?0:(config?.level??100)/100;
      const set=(param,value)=>{
        if(!param)return;
        if(smooth)param.setTargetAtTime(value,this.context.currentTime,.022);else param.value=value;
      };
      set(channel.gain.gain,level);set(channel.pan?.pan,(config?.pan??0)/100);
    }
    setMix(mix){
      this.mix={...mix,solo:Object.keys(mix.tracks).filter(id=>mix.tracks[id].solo)};
      if(this.master)this.master.gain.setTargetAtTime(this.mix.master/100,this.context.currentTime,.024);
      if(this.room)this.room.gain.setTargetAtTime(this.mix.room/100,this.context.currentTime,.035);
      this.mastering?.update(mix.mastering);
      for(const part of this.channels.keys())this.updateChannel(part);
    }
    express(ctx,output,start,curve){
      if(!curve)return output;
      const gain=ctx.createGain();
      gain.gain.setValueAtTime(curve[0].level,start);
      for(const point of curve.slice(1))gain.gain.linearRampToValueAtTime(point.level,start+point.time);
      gain.connect(output);return gain;
    }
    tone(pitch,start,duration,level,offset=0,output=this.master,curve) {
      const ctx=this.context,osc=ctx.createOscillator(),gain=ctx.createGain();
      const end=start+duration,attack=Math.min(.012,duration/4),release=Math.min(.08,duration/3);
      osc.type='triangle';osc.frequency.value=440*2**((root.KanadeCore.pitchMidi(pitch)+offset-69)/12);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.linearRampToValueAtTime(level,start+attack);
      gain.gain.setValueAtTime(level,end-release);
      gain.gain.exponentialRampToValueAtTime(.0001,end);
      const expression=this.express(ctx,output,start,curve);
      osc.connect(gain);gain.connect(expression);
      const voice={osc,gain};this.voices.add(voice);
      osc.onended=()=>{osc.disconnect();gain.disconnect();if(expression!==output)expression.disconnect();this.voices.delete(voice);};
      osc.start(start);osc.stop(end+.005);
    }
    drum(preset,start,level,output,track) {
      const ctx=this.context;
      // A scheduled closed hi-hat damps open hats; choke damps preceding cymbals.
      if(preset.kind==='cymbal'&&(preset.index===0||preset.index===3)){
        for(const voice of this.voices)if(voice.kind==='cymbal'&&voice.track===track&&voice.start<start&&(preset.index===3||voice.index===1)){
          voice.gain.gain.cancelScheduledValues(start);voice.gain.gain.setTargetAtTime(.0001,start,.006);try{voice.osc.stop(start+.04);}catch(_){}
        }
      }
      // Reuse the same noise buffer for every hit; nodes are released after decay.
      const noise=(duration,frequency,bandwidth,volume)=>{
        if(!this.noiseBuffer||this.noiseBuffer.sampleRate!==ctx.sampleRate){
          this.noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*2),ctx.sampleRate);
          const data=this.noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        }
        const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
        source.buffer=this.noiseBuffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=bandwidth;
        gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.002);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        source.connect(filter);filter.connect(gain);gain.connect(output);
        const voice={osc:source,gain,kind:preset.kind,index:preset.index,start,track};this.voices.add(voice);
        source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.voices.delete(voice);};
        source.start(start);source.stop(start+duration+.005);
      };
      const body=(frequency,duration,volume,type='sine',bend=.65)=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;
        osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(frequency*bend,start+Math.min(.06,duration));
        gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(volume,start+.001);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        osc.connect(gain);gain.connect(output);const voice={osc,gain,kind:preset.kind,index:preset.index,start,track};this.voices.add(voice);
        osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(voice);};osc.start(start);osc.stop(start+duration+.005);
      };
      const i=preset.index;
      if(preset.kind==='timpani'){
        const f=preset.frequency;
        body(f,.66,level*1.8,'sine',.972);body(f*1.52,.29,level*.44,'sine',.995);
        body(f*2.14,.13,level*.22,'sine',.985);noise(.033,1650,1.1,level*.38);
      }else if(preset.kind==='snare'){
        if(i===2){body(1800,.045,level*.65,'triangle',.92);noise(.035,3500,1,level*.3);}
        else {body(i===1?650:390,.13,level*.8,'triangle',.72);noise(i===1?.15:.22,2600,.65,level*1.8);if(i===1)body(1850,.065,level*.5,'sine',.9);}
      }else if(preset.kind==='tenor'){
        const f=[145,185,235,300,430][i];body(f*1.35,.28,level,'sine',.72);body(f*2.12,.13,level*.25,'triangle',.86);noise(.035,2400,1,level*.4);
      }else if(preset.kind==='bass'){
        const f=[55,68,82,100,125][i];body(f*1.6,.48,level*1.6);body(f*2.1,.2,level*.18,'sine',.8);noise(.045,1200,.8,level*.5);
      }else{
        const duration=[.07,.55,1.2,.055][i];noise(duration,i<2?8500:6500,i<2?.7:.45,level*(i===3?.65:1.3));
        for(const f of [2190,3070,4310,5870])body(f,duration*.8,level*(i<2?.045:.09),'triangle',.998);
      }
    }
    async prepareSamples(instrument,midis,version=this.generation) {
      const samples=await this.sampleBank.prepare(this.context,instrument,midis);
      if(version!==this.generation||!samples)return;
      for(const sample of samples.values())this.preparedSamples.set(`${instrument}:${sample.midi}`,sample);
      if(!this.playing&&!this.sessionPlayer)this.trimSamples();
    }
    invalidateSamples(instrument){
      this.sampleBank.invalidate(instrument);
      for(const key of this.preparedSamples.keys())if(key.startsWith(instrument+':'))this.preparedSamples.delete(key);
    }
    trimSamples() {
      while(this.preparedSamples.size>64){
        this.preparedSamples.delete(this.preparedSamples.keys().next().value);
      }
    }
    sample(instrument,midi,start,duration,level,output,curve) {
      const ctx=this.context,candidates=[...this.preparedSamples.entries()].filter(([key])=>key.startsWith(instrument+':')).map(([,entry])=>entry);
      const entry=candidates.length?candidates.reduce((a,b)=>Math.abs(b.midi-midi)<Math.abs(a.midi-midi)?b:a):null;
      if(!entry)return false;
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=entry.buffer;
      source.playbackRate.value=entry.unpitched?1:2**((midi-entry.midi)/12);
      if(entry.sustain&&entry.buffer.duration>.4){
        source.loop=true;source.loopStart=Math.min(.35,entry.buffer.duration*.2);source.loopEnd=Math.min(1.15,entry.buffer.duration*.6);
        const data=entry.buffer.getChannelData(0),sr=entry.buffer.sampleRate;
        const zero=t=>{const at=Math.floor(t*sr);for(let i=at;i<Math.min(data.length-1,at+sr*.02);i++)if(data[i]<=0&&data[i+1]>0)return i/sr;return t;};
        source.loopStart=zero(source.loopStart);source.loopEnd=zero(source.loopEnd);
      }
      const release=Math.min(.08,duration/3),end=start+duration;
      gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(level*2.5,start+Math.min(.006,duration/4));gain.gain.setValueAtTime(level*2.5,end-release);gain.gain.exponentialRampToValueAtTime(.0001,end);
      const expression=this.express(ctx,output,start,curve);
      source.connect(gain);gain.connect(expression);const voice={osc:source,gain};this.voices.add(voice);
      source.onended=()=>{source.disconnect();gain.disconnect();if(expression!==output)expression.disconnect();this.voices.delete(voice);};source.start(start);source.stop(end+.005);
      return true;
    }
    strike(pitch,start,duration,level,instrument,offset=0,track=null,curve=null,output=this.channel(track)) {
      const midi=root.KanadeCore.pitchMidi(pitch)+offset;
      const samples=root.KanadeSamples;
      if(this.sample(instrument,midi,start,duration,level,output,curve))return;
      const source=samples.fallback(instrument)||instrument;
      if(source==='ティンパニ'){
        this.drum({kind:'timpani',frequency:440*2**((midi-69)/12)},start,level*(curve?.[0].level??1),output,track);return;
      }
      const drum=root.KanadePercussion?.voice(source,pitch);
      if(drum)this.drum(drum,start,level*(curve?.[0].level??1),output,track);
      else if(['synth','builtIn','fallback'].includes(samples.status(instrument).kind))
        this.tone(pitch,start,duration,level,offset,output,curve);
    }
    async audition(pitches,instrument,offset=0) {
      if(!pitches?.length)return;
      const request=++this.auditionRequest,version=this.generation,ctx=await this.ready();
      await this.prepareSamples(instrument,pitches.map(p=>root.KanadeCore.pitchMidi(p)+offset),version).catch(()=>{});
      if(version!==this.generation||request!==this.auditionRequest)return;
      for(const pitch of pitches)this.strike(pitch,ctx.currentTime+.008,.24,.12/Math.sqrt(pitches.length),instrument,offset);
    }
    stop() {
      this.generation++;clearTimeout(this.timer);this.timer=null;
      this.sessionPlayer?.dispose();this.sessionPlayer=null;
      for(const {osc,gain} of this.voices) {
        gain.disconnect();try{osc.stop();}catch(_){}
      }
      this.voices.clear();this.playing=false;this.session=null;this.trimSamples();
      for(const {gain,pan} of this.channels.values()){gain.disconnect();pan?.disconnect();}
      this.channels.clear();this.onPlaybackChange(false);
    }
    loadPlan(plan,version){
      return Promise.all([...plan.samples].filter(([,midis])=>midis.size).map(([instrument,midis])=>
        this.prepareSamples(instrument,[...midis],version).catch(()=>{})));
    }
    eventLevel(event,plan){return .14*event.emphasis/Math.sqrt(event.pitches.length*Math.max(1,plan.soundingTracks));}
    async renderAudio(parts,mix,stage){
      const Audio=root.OfflineAudioContext||root.webkitOfflineAudioContext;
      if(!Audio)throw Error('このブラウザでは音声を書き出せません');
      const P=root.KanadePlayback,plan=P.region(P.compile(parts));
      if(!plan.events.length)throw Error('書き出す音符がありません');
      if(plan.duration>480)throw Error('音声を一度に書き出せる長さは8分までです');
      const rate=44100,origin=.025;
      this.context=new Audio(2,Math.ceil((plan.duration+origin+.8)*rate),rate);
      this.setMix(mix);
      this.initGraph(true);
      this.session={trackIds:plan.trackIds};
      this.playing=true;
      stage('音源を準備中…');
      await this.loadPlan(plan,this.generation);
      stage('再生音をレンダリング中…');
      for(const event of plan.events){
        const level=this.eventLevel(event,plan);
        for(const pitch of event.pitches)this.strike(pitch,origin+event.time,event.duration,level,event.instrument,event.offset,event.part,event.curve);
      }
      const rendered=await this.context.startRendering();
      const settings=root.KanadeMastering.settings(mix.mastering);
      if(settings.limiter){
        const left=rendered.getChannelData(0),right=rendered.getChannelData(1);
        const limiter=new root.KanadePeakLimiter(rendered.sampleRate);
        limiter.process(left,right,left,right,[root.KanadeMastering.linear(settings.ceiling)],[1]);
      }
      return rendered;
    }
    launchClips(changes,options){
      if(!this.sessionPlayer)this.sessionPlayer=new root.KanadeSessionPlayer(this,options);
      return this.sessionPlayer.launch(changes,options);
    }
    updateLoop(parts,options){
      const session=this.session;
      if(!session?.options.loop)return false;
      const P=root.KanadePlayback,plan=P.region(P.compile(parts),options);
      if(!(plan.duration>0))return false;
      session.pending=plan;
      this.loadPlan(plan,session.version);
      return true;
    }
    async play(scoreOrParts,options={}) {
      this.stop();const version=this.generation;
      this.playing=true;this.onPlaybackChange(true);
      const P=root.KanadePlayback;
      try{
        const ctx=await this.ready();if(version!==this.generation)return;
        const parts=Array.isArray(scoreOrParts)?scoreOrParts:[scoreOrParts];
        const plan=P.region(P.compile(parts),options);
        if(!(plan.duration>0)||!plan.events.length&&!options.allowEmpty){this.stop();return;}
        const session={version,options,pending:null,trackIds:new Set(parts.map(part=>part.id))};
        this.session=session;
        await this.loadPlan(plan,version);
        if(version!==this.generation)return;
        const startAt=Math.max(0,Math.min(plan.duration-.001,((options.resumeAt??plan.start)-plan.start)*plan.secondsPerTick));
        const cycles=[{plan,origin:ctx.currentTime+.035,index:0,skip:startAt,pass:1}];
        cycles[0].origin-=startAt;
        const scheduleClick=(time,accent)=>{
          const osc=ctx.createOscillator(),gain=ctx.createGain();
          osc.frequency.value=accent?1240:940;
          gain.gain.setValueAtTime(accent?.09:.06,time);
          gain.gain.exponentialRampToValueAtTime(.0001,time+.045);
          osc.connect(gain);gain.connect(this.master||ctx.destination);
          const voice={osc,gain};this.voices.add(voice);
          osc.onended=()=>{this.voices.delete(voice);osc.disconnect();gain.disconnect();};
          osc.start(time);osc.stop(time+.05);
        };
        const schedule=()=>{
          if(version!==this.generation)return;
          const now=ctx.currentTime,horizon=now+.105;
          if(options.metronome?.enabled){
            if(!session.metro)session.metro={next:now,beat:0,sec:60/options.metronome.tempo};
            const metro=session.metro;
            while(metro.next<=horizon){
              scheduleClick(metro.next,metro.beat%4===0);
              metro.beat++;metro.next+=metro.sec;
            }
          }
          while(cycles.length>1&&cycles[1].origin<=now)cycles.shift();
          let cycle=cycles.at(-1);
          if(cycle.origin+cycle.plan.duration<now&&options.loop){
            const missed=Math.floor((now-cycle.origin)/cycle.plan.duration);
            cycle={...cycle,origin:cycle.origin+missed*cycle.plan.duration,index:0,skip:0,pass:cycle.pass+missed};
            cycles.splice(0,cycles.length,cycle);
          }
          for(;;){
            const {plan,origin,skip}=cycle;
            while(cycle.index<plan.events.length&&origin+plan.events[cycle.index].time<horizon){
              const event=plan.events[cycle.index++];
              const elapsed=Math.max(0,skip-event.time,now-origin-event.time);
              const duration=event.duration-elapsed;
              if(duration<=.002)continue;
              const start=Math.max(now+.003,origin+event.time);
              const curve=elapsed?trimCurve(event.curve,elapsed):event.curve;
              const level=this.eventLevel(event,plan);
              for(const pitch of event.pitches)this.strike(pitch,start,duration,level,event.instrument,event.offset,event.part,curve);
            }
            if(!options.loop||origin+plan.duration>horizon)break;
            const next=session.pending||plan;session.pending=null;
            if(next!==plan){
              session.trackIds=next.trackIds;
              for(const id of this.channels.keys())this.updateChannel(id);
            }
            cycle={plan:next,origin:origin+plan.duration,index:0,skip:0,pass:cycle.pass+1};cycles.push(cycle);
          }
          const audible=cycles.findLast(item=>item.origin<=now)||cycles[0];
          options.onProgress?.({...P.position(audible.plan,now-audible.origin),pass:audible.pass});
          if(!options.loop&&now>=cycle.origin+cycle.plan.duration+.035){this.stop();return;}
          this.timer=setTimeout(schedule,25);
        };
        schedule();
      }catch(error){if(version===this.generation)this.stop();throw error;}
    }
  }
  function trimCurve(curve,elapsed){
    const index=curve.findIndex(point=>point.time>elapsed);
    if(index<1)return curve;
    const before=curve[index-1],after=curve[index];
    const from=before.level+(after.level-before.level)*(elapsed-before.time)/(after.time-before.time);
    return [{time:0,level:from},...curve.slice(index).map(point=>({...point,time:point.time-elapsed}))];
  }
  root.KanadeAudio={Engine,localSounds:{'ティンパニ':'内蔵ティンパニ音源 · 記譜音高で再生'}};
})(typeof globalThis!=='undefined'?globalThis:this);
