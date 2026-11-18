const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const C=require(process.argv[2]?path.resolve(process.argv[2]):'../app/web/src/core.js');
let score=C.createScore();score.measures=[];
for(let i=0;i<500;i++)score.measures.push({id:C.uid(),events:Array.from({length:4},()=>C.makeNote({step:'C',octave:4,alter:0},4))});
const id=score.measures[250].events[0].id,versions=[score],times=[];
for(let i=0;i<30;i++){const start=performance.now();score=C.changeEvent(score,id,e=>{e.stemDirection=i%2?'up':'down';return e;});times.push(performance.now()-start);versions.push(score);}
const measures=new Set(),events=new Set();for(const s of versions)for(const m of s.measures){measures.add(m);for(const e of m.events)events.add(e);}
times.sort((a,b)=>a-b);const result={bars:500,notes:2000,edits:30,modelEditMedianMs:+times[15].toFixed(3),retainedMeasureObjects:measures.size,retainedEventObjects:events.size};
console.log(JSON.stringify(result,null,2));if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
