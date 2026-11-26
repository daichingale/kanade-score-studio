(function(root){
  'use strict';
  const ClickTrack=class{
    constructor(getCtx){
      this.getCtx=getCtx;
      this.cancelled=false;
      this.nodes=new Set();
    }
    stop(){
      this.cancelled=true;
      for(const {osc,gain} of this.nodes){
        try{osc.stop();}catch(_){}
        gain.disconnect();osc.disconnect();
      }
      this.nodes.clear();
    }
    click(ctx,time,accent){
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=accent?1240:940;
      gain.gain.setValueAtTime(accent?.18:.11,time);
      gain.gain.exponentialRampToValueAtTime(.0001,time+.05);
      osc.connect(gain);gain.connect(ctx.destination);
      const voice={osc,gain};this.nodes.add(voice);
      osc.onended=()=>{this.nodes.delete(voice);osc.disconnect();gain.disconnect();};
      osc.start(time);osc.stop(time+.055);
    }
    async countIn(beats,tempo,onBeat){
      this.cancelled=false;
      const ctx=await this.getCtx();
      const beatSec=60/tempo,origin=ctx.currentTime+.02;
      for(let beat=0;beat<beats;beat++){
        if(this.cancelled)return false;
        const at=origin+beat*beatSec;
        this.click(ctx,at,!beat);
        onBeat?.(beat+1,beats,at);
        await new Promise(resolve=>{
          const wait=Math.max(0,(at+beatSec-ctx.currentTime)*1000);
          setTimeout(resolve,wait);
        });
      }
      return !this.cancelled;
    }
    scheduleDuringPlay(ctx,startAt,beatMs,durationSec,accentEvery=4){
      this.stop();this.cancelled=false;
      let beat=0,at=startAt;
      while(at<startAt+durationSec+.02&&!this.cancelled){
        this.click(ctx,at,beat%accentEvery===0);
        beat++;at+=beatMs;
      }
    }
  };
  root.KanadeMetronome={ClickTrack};
})(typeof globalThis!=='undefined'?globalThis:this);