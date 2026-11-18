// node tests/performance.browser.cjs <playwright-core path> <Chromium executable> [result.json]
const {chromium}=require(process.argv[2]||'playwright-core');const fs=require('node:fs');
(async()=>{const b=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
const p=await b.newPage({viewport:{width:1500,height:900}});await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>window.__kanadeDev);
const result=await p.evaluate(()=>{
 const C=window.KanadeCore;const score=C.createScore();score.measures=[];
 for(let mi=0;mi<120;mi++){const events=[];for(let i=0;i<8;i++)events.push(C.makeNote({step:C.STEPS[i%7],octave:4,alter:0},8));score.measures.push({id:C.uid(),events});}
 const s=window.__kanadeDev.capture();Object.assign(s,{score,selected:null,activeMeasure:0,caret:{mi:0,index:0},undo:[],redo:[]});window.__kanadeDev.restore(s);
 const times=[],host=document.getElementById('scoreHost');let replacements=0;const svg=host.querySelector('svg');
 for(let i=0;i<40;i++){const start=performance.now();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));times.push(performance.now()-start);if(host.querySelector('svg')!==svg)replacements++;}
 times.sort((a,b)=>a-b);
 const editing=[],untouched=host.querySelector('[data-render-measure="0"]'),editedSVG=host.querySelector('svg');
 for(let i=0;i<20;i++){const start=performance.now();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'l',bubbles:true}));editing.push(performance.now()-start);}
 editing.sort((a,b)=>a-b);
 const preserved=host.querySelector('[data-render-measure="0"]')===untouched&&host.querySelector('svg')===editedSVG;
 return {bars:120,notes:960,navigationMedianMs:+times[20].toFixed(3),svgBytes:new TextEncoder().encode(host.innerHTML).length,domNodes:host.querySelectorAll('*').length,fullSvgReplacements:replacements,editingMedianMs:+editing[10].toFixed(3),unchangedMeasurePreserved:preserved};
});console.log(JSON.stringify(result,null,2));if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(result,null,2)+'\n');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
