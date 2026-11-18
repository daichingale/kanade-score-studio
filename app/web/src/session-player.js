/* One transport clock, with an independent playback loop per track. */
(function(root){
  'use strict';
  const P=()=>root.KanadePlayback;
  function boundary(now,origin,interval){
    const earliest=now+.025;
    return interval&&origin!==null?origin+Math.max(0,Math.ceil((earliest-origin)/interval))*interval:earliest;
  }

  class SessionPlayer {
    constructor(engine,options){
      this.engine=engine;
      this.notify=options.onState;
      this.origin=null;
      this.slots=new Map();
      this.versions=new Map();
      this.loading=new Map();
      this.retired=[];
      this.timer=null;
      this.signature='';
      this.disposed=false;
    }

    async launch(changes,{tempo,grid,trackIds}){
      const engine=this.engine,versions=new Map();
      for(const [track,clip] of changes){
        const version=(this.versions.get(track)||0)+1;
        versions.set(track,version);this.versions.set(track,version);
        this.loading.set(track,clip);
        const slot=this.slots.get(track);
        if(slot)slot.pending=null;
      }
      this.emit();
      try{
        const ctx=await engine.ready();
        if(this.disposed)return;
        const prepared=await Promise.all([...changes].map(async ([track,clip])=>{
          if(!clip)return [track,null];
          const part={...clip.part,tempo},plan=P().region(P().compile([part]));
          await engine.loadPlan(plan,engine.generation);
          return [track,{...clip,part,plan}];
        }));
        if(this.disposed)return;
        const current=prepared.filter(([track])=>this.versions.get(track)===versions.get(track));
        if(!current.length)return;
        const at=boundary(ctx.currentTime,this.origin,grid);
        if(this.origin===null&&current.some(([,clip])=>clip))this.origin=at;
        engine.session={trackIds:new Set(trackIds)};
        for(const id of engine.channels.keys())engine.updateChannel(id);
        for(const [track,clip] of current){
          this.loading.delete(track);
          const slot=this.slots.get(track)||{current:null,pending:null};
          if(clip||slot.current){
            slot.pending={at,clip};this.slots.set(track,slot);
          }
        }
        if(this.slots.size){
          if(!engine.playing){engine.playing=true;engine.onPlaybackChange(true);}
          if(this.timer===null)this.tick();
        }else this.emit();
      }catch(error){
        if(this.disposed)return;
        for(const [track,version] of versions)if(this.versions.get(track)===version)this.loading.delete(track);
        this.emit();
        if(!this.slots.size&&!this.loading.size)engine.stop();
        throw error;
      }
    }

    play(slot,horizon,now,trackCount){
      const {engine}=this,{plan,bus,loop}=slot;
      while(slot.cycle<horizon){
        if(loop&&slot.cycle+plan.duration<now){
          slot.cycle+=Math.floor((now-slot.cycle)/plan.duration)*plan.duration;
          slot.index=0;
        }
        while(slot.index<plan.events.length){
          const event=plan.events[slot.index],at=slot.cycle+event.time;
          if(at>=horizon)break;
          slot.index++;
          if(at<now-.025)continue;
          const start=Math.max(now+.003,at),level=engine.eventLevel(event,{soundingTracks:trackCount});
          for(const pitch of event.pitches)engine.strike(pitch,start,event.duration,level,event.instrument,event.offset,event.part,event.curve,bus);
        }
        if(!loop||slot.cycle+plan.duration>=horizon)break;
        slot.cycle+=plan.duration;slot.index=0;
      }
    }

    tick(){
      if(this.disposed)return;
      const {engine}=this,ctx=engine.context,now=ctx.currentTime,horizon=now+.075;
      const count=Math.max(1,[...this.slots.values()].filter(slot=>slot.current||slot.pending?.clip).length);
      for(const [track,slot] of this.slots){
        if(slot.pending?.at<=horizon){
          const {at,clip}=slot.pending,when=Math.max(at,now+.003);
          if(slot.current){
            this.play(slot.current,when,now,count);
            const {bus}=slot.current;
            bus.gain.setValueAtTime(1,when);
            bus.gain.linearRampToValueAtTime(0,when+.008);
            this.retired.push({bus,until:when+.02});
          }
          if(clip){
            const bus=ctx.createGain();bus.connect(engine.channel(track));
            slot.current={...clip,bus,origin:when,cycle:when,index:0};
          }else slot.current=null;
          slot.pending=null;
        }
        if(slot.current){
          this.play(slot.current,Math.min(horizon,slot.pending?.at??Infinity),now,count);
          if(!slot.current.loop&&slot.current.origin+slot.current.plan.duration<=now){
            this.retired.push({bus:slot.current.bus,until:now+.75});
            slot.current=null;
          }
        }
        if(!slot.current&&!slot.pending)this.slots.delete(track);
      }
      this.retired=this.retired.filter(({bus,until})=>{
        if(until>now)return true;
        bus.disconnect();return false;
      });
      this.emit();
      if(this.slots.size||this.loading.size||this.retired.length)this.timer=setTimeout(()=>this.tick(),22);
      else engine.stop();
    }

    emit(){
      const now=this.engine.context?.currentTime??0,active=[],queued=[],stopping=[];
      for(const [track,{current,pending}] of this.slots){
        if(current)(current.origin>now?queued:active).push({track,clipId:current.id,part:current.part,loop:current.loop});
        if(pending?.clip)queued.push({track,clipId:pending.clip.id});
        else if(pending)stopping.push(track);
      }
      for(const [track,clip] of this.loading){
        if(clip)queued.push({track,clipId:clip.id});
        else stopping.push(track);
      }
      const key=JSON.stringify([active.map(item=>[item.track,item.clipId,item.loop]),queued,stopping]);
      if(key===this.signature)return;
      this.signature=key;this.notify({active,queued,stopping});
    }

    dispose(){
      this.disposed=true;clearTimeout(this.timer);
      for(const slot of this.slots.values())slot.current?.bus.disconnect();
      for(const slot of this.retired)slot.bus.disconnect();
      this.slots.clear();this.loading.clear();this.retired=[];
      this.notify({active:[],queued:[],stopping:[]});
    }
  }
  root.KanadeSessionPlayer=SessionPlayer;
  if(typeof module==='object'&&module.exports)module.exports={SessionPlayer,boundary};
})(globalThis);
