// Optional browser regression: node tests/workflow.browser.cjs <playwright-core path> <chromium path>
const {chromium}=require(process.argv[2]||'playwright-core');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 try{
 const context=await browser.newContext({viewport:{width:1500,height:900},acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__kanadeDev);
 const snap=()=>page.evaluate(()=>window.__kanadeDev.capture());
 await page.evaluate(()=>{
  const C=window.KanadeCore;let score=C.createScore();for(let i=1;i<30;i++)score=C.addMeasure(score);
  const t=window.__kanadeDev.capture();Object.assign(t,{score,selected:null,activeMeasure:0,caret:{mi:0,index:0},undo:[],redo:[]});window.__kanadeDev.restore(t);
 });
 for(let i=0;i<24;i++)await page.keyboard.press('ArrowRight');
 assert.equal((await snap()).caret.mi,24);
 let visible=await page.evaluate(()=>{const r=document.querySelector('[data-measure="24"][data-event-index="0"]').getBoundingClientRect(),s=document.querySelector('#scoreScroll').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom;});assert.ok(visible);
 const bottomScroll=(await snap()).scrollTop;
 for(let i=0;i<24;i++)await page.keyboard.press('ArrowLeft');assert.equal((await snap()).caret.mi,0);assert.ok((await snap()).scrollTop<bottomScroll);
 assert.ok(await page.evaluate(()=>{const r=document.querySelector('[data-measure="0"][data-event-index="0"]').getBoundingClientRect(),s=document.querySelector('#scoreScroll').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom;}));
 console.log('PASS: cursor follows keyboard navigation down and back through a long score');
 // Native Undo in a field must not undo the musical score.
 await page.keyboard.press('c');const before=await snap();
 await page.locator('#titleInput').click();await page.locator('#titleInput').press('End');await page.keyboard.type('XYZ');await page.keyboard.press('Control+z');
 assert.equal((await snap()).undo.length,before.undo.length);assert.deepEqual((await snap()).score.measures,before.score.measures);
 // Saving while a title field still has focus must include the current draft.
 await page.locator('#titleInput').fill('保存直前の曲名');
 const downloaded=page.waitForEvent('download');await page.keyboard.press('Control+s');const download=await downloaded;
 const saved=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(saved.title,'保存直前の曲名');assert.equal(download.suggestedFilename(),'保存直前の曲名.kanade.json');
 await page.evaluate(()=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'c',bubbles:true,isComposing:true})));
 assert.deepEqual((await snap()).score.measures,before.score.measures);
 console.log('PASS: field Undo, IME input and saving the uncommitted title');
 // Forced natural after a sharp earlier in the measure must show its cancellation in the ghost.
 await page.evaluate(()=>{
  const C=window.KanadeCore;let score=C.createScore();score=C.insertEvent(score,0,0,C.makeNote({step:'C',octave:4,alter:1},4)).score;
  const t=window.__kanadeDev.capture();Object.assign(t,{score,selected:null,activeMeasure:0,caret:{mi:0,index:1},alter:'0',editMode:'entry',den:4});window.__kanadeDev.restore(t);
 });
 const pt=await page.evaluate(()=>{const svg=document.querySelector('#scoreHost svg'),p=svg.createSVGPoint(),g=window.KanadeRenderer.measureGeometry(window.__kanadeDev.capture().score,0);p.x=g.notesStart+g.usable/4;p.y=g.top+60;const q=p.matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};});
 await page.mouse.move(pt.x,pt.y);await page.waitForSelector('#kanade-ghost-layer .accidental');
 const natPath=await page.locator('#kanade-ghost-layer .accidental use').getAttribute('href');
 await page.mouse.click(pt.x,pt.y);const t=await snap();assert.equal(t.score.measures[0].events[1].pitches[0].alter,0);
 const placed=await page.locator('#scoreHost .accidental use').all();assert.equal(await placed[1].getAttribute('href'),natPath);
 // A sharp selected in the toolbar also appears in the hover preview.
 await page.locator('[data-alter="1"]').click();await page.mouse.move(pt.x+100,pt.y);await page.waitForSelector('#kanade-ghost-layer .accidental');
 assert.notEqual(await page.locator('#kanade-ghost-layer .accidental use').getAttribute('href'),natPath);
 assert.deepEqual(errors,[]);console.log('PASS: accidental preview matches inserted pitch and uses preceding accidental state; no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
