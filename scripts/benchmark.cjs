const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks');
const C=require('../app/web/src/core.js'),R=require('../app/web/src/renderer.js');
const cases=[];
for(const [bars,den] of [[120,8],[500,4]]){
 const score=C.createScore();score.measures=[];
 for(let mi=0;mi<bars;mi++){const events=[];for(let i=0;i<den;i++)events.push(C.makeNote({step:C.STEPS[i%7],octave:4,alter:0},den));score.measures.push({id:C.uid(),events});}
 for(let i=0;i<4;i++)R.render(score,null);
 const times=[];let svg;
 for(let i=0;i<20;i++){const start=performance.now();svg=R.render(score,null);times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);cases.push({bars,notes:bars*den,renderMedianMs:+times[10].toFixed(3),svgBytes:Buffer.byteLength(svg)});
}
const result={node:process.version,cases};console.log(JSON.stringify(result,null,2));if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
