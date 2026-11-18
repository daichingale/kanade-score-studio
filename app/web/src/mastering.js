(function(root){
  'use strict';
  const defaults={gain:0,low:0,high:0,limiter:true,ceiling:-1};
  const bounds={gain:[-18,24],low:[-12,12],high:[-12,12],ceiling:[-12,-.1]};
  const linear=db=>10**(db/20);
  function settings(value){
    const result={...defaults,limiter:value?.limiter!==false};
    for(const [key,[min,max]] of Object.entries(bounds)){
      const field=value?.[key];
      if(Number.isFinite(field))result[key]=Math.min(max,Math.max(min,field));
    }
    return result;
  }

  class Mastering {
    constructor(context,input){
      this.context=context;
      this.input=input;
      this.low=context.createBiquadFilter();this.low.type='lowshelf';this.low.frequency.value=160;
      this.high=context.createBiquadFilter();this.high.type='highshelf';this.high.frequency.value=3800;
      this.gain=context.createGain();
      input.connect(this.low);this.low.connect(this.high);this.high.connect(this.gain);
      this.meter={peak:0,reduction:0};
      this.config=defaults;
    }

    async connect(){
      const ctx=this.context;
      try{
        if(!ctx.audioWorklet||!root.AudioWorkletNode)throw Error();
        // Keep the URL relative to the app, including when served from a local folder.
        await ctx.audioWorklet.addModule('src/limiter-worklet.js');
        const limiter=new root.AudioWorkletNode(ctx,'kanade-peak-limiter',{
          outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',
          parameterData:{ceiling:linear(this.config.ceiling),enabled:Number(this.config.limiter)}
        });
        limiter.port.onmessage=event=>{this.meter=event.data;};
        limiter.onprocessorerror=()=>{
          limiter.port.close();limiter.disconnect();
          this.gain.disconnect(limiter);
          this.worklet=null;
          this.connectFallback();
        };
        this.worklet=limiter;
        this.gain.connect(limiter);limiter.connect(ctx.destination);
      }catch(_){
        this.connectFallback();
      }
    }

    connectFallback(){
      const ctx=this.context, ceiling=linear(this.config.ceiling);
      // Older contexts still get peak protection at the chosen ceiling.
      const pre=ctx.createGain(),post=ctx.createGain(),dry=ctx.createGain();
      const clip=ctx.createWaveShaper(),output=ctx.createGain();
      clip.curve=new Float32Array([-1,1]);
      pre.gain.value=1/ceiling;post.gain.value=this.config.limiter?ceiling:0;
      dry.gain.value=this.config.limiter?0:1;
      this.gain.connect(pre);pre.connect(clip);clip.connect(post);post.connect(output);
      this.gain.connect(dry);dry.connect(output);output.connect(ctx.destination);
      const split=ctx.createChannelSplitter(2);
      output.connect(split);
      const channels=[0,1].map(index=>{
        const analyser=ctx.createAnalyser();
        analyser.fftSize=2048;split.connect(analyser,index);
        return analyser;
      });
      this.fallback={pre,post,dry,channels,buffer:new Float32Array(channels[0].fftSize)};
    }

    update(value,smooth=true){
      const previous=this.config;
      this.config=settings(value);
      const {gain,low,high,ceiling,limiter}=this.config,ctx=this.context,limit=linear(ceiling);
      const set=(param,amount)=>{
        if(smooth)param.setTargetAtTime(amount,ctx.currentTime,.015);
        else param.value=amount;
      };
      set(this.gain.gain,linear(gain));set(this.low.gain,low);set(this.high.gain,high);
      if(this.worklet){
        set(this.worklet.parameters.get('ceiling'),limit);
        if(previous.limiter!==limiter){
          const enabled=this.worklet.parameters.get('enabled'),now=ctx.currentTime;
          if(enabled.cancelAndHoldAtTime){
            enabled.cancelAndHoldAtTime(now);
            enabled.linearRampToValueAtTime(Number(limiter),now+.008);
          }else enabled.setValueAtTime(Number(limiter),now);
        }
      }
      if(this.fallback){
        // Set paired values together so the signal below the ceiling keeps unity gain.
        const {pre,post,dry}=this.fallback;
        pre.gain.setValueAtTime(1/limit,ctx.currentTime);
        post.gain.setValueAtTime(limiter?limit:0,ctx.currentTime);
        dry.gain.setValueAtTime(limiter?0:1,ctx.currentTime);
      }
    }

    levels(){
      if(!this.fallback)return this.meter;
      const {channels,buffer}=this.fallback;
      let peak=0;
      for(const channel of channels){
        channel.getFloatTimeDomainData(buffer);
        for(const sample of buffer)peak=Math.max(peak,Math.abs(sample));
      }
      return {peak,reduction:null};
    }
  }
  const api={Mastering,settings,defaults,linear};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.KanadeMastering=api;
})(globalThis);
