const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core');
require('../src/playback');
const {SessionPlayer,boundary}=require('../src/session-player');

test('session launches share a clock with a practical scheduling lead',()=>{
 assert.equal(boundary(0,null,.5),.025);
 assert.equal(boundary(.1,0,.5),.5);
 assert.equal(boundary(.498,0,.5),1);
 assert.equal(boundary(.1,0,0),.125);
});

test('launching another clip changes one track and leaves the other loop running',async()=>{
 const states=[],hits=[],buses=[];
 const createGain=()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}});
 const ctx={currentTime:0,createGain:()=>{const bus=createGain();buses.push(bus);return bus;}};
 const engine={context:ctx,playing:false,channels:new Map(),ready:async()=>ctx,
   loadPlan:async()=>{},onPlaybackChange(){},channel:createGain,eventLevel:()=>1,
   strike(pitch,when,duration,level,instrument,offset,track){hits.push({track,step:pitch.step,when});},stop(){}};
 const onState=state=>states.push(state),player=new SessionPlayer(engine,{onState});
 const clip=(id,track,step)=>{const part=C.createScore();part.id=track;
   part.measures[0].events=[C.makeNote({step,octave:4,alter:0},4)];
   return {id,part,loop:true};
 };
 const options={tempo:120,grid:.5,trackIds:['a','b']};
 function at(time){clearTimeout(player.timer);ctx.currentTime=time;player.tick();}
 try{
   await player.launch(new Map([['a',clip('A','a','C')],['b',clip('B','b','G')]]),options);
   assert.deepEqual(hits.map(({track,when})=>[track,when]),[['a',.025],['b',.025]]);
   at(.1);
   assert.deepEqual(states.at(-1).active.map(item=>item.clipId),['A','B']);
   await player.launch(new Map([['a',clip('C','a','E')]]),options);
   assert.deepEqual(states.at(-1).queued.map(item=>item.clipId),['C']);
   at(.47);at(.55);
   assert.deepEqual(states.at(-1).active.map(item=>item.clipId),['C','B']);
   assert.ok(hits.some(hit=>hit.track==='a'&&hit.step==='E'));
   assert.equal(buses.length,3);
 }finally{player.dispose();}
});
