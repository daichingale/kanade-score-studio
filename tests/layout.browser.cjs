// node tests/layout.browser.cjs <playwright-core path> <Chromium executable> [screenshot]
const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
(async()=>{const b=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
const p=await b.newPage({viewport:{width:1500,height:1000},acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>window.__kanadeDev&&window.KanadeNotation);
const snap=()=>p.evaluate(()=>window.__kanadeDev.capture());
await p.evaluate(()=>{
 const C=window.KanadeCore,score=C.createScore();score.time={num:6,den:8};score.title='6/8 連桁・差分描画';score.measures[0].events=Array.from({length:6},(_,i)=>C.makeNote({step:C.STEPS[i],octave:4,alter:0},8));
 const s=window.__kanadeDev.capture();Object.assign(s,{score,selected:score.measures[0].events[0].id,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[]});window.__kanadeDev.restore(s);
 window.originalSVG=document.querySelector('#scoreHost svg');window.originalNote=document.querySelector('#scoreHost .score-note');
});
assert.equal(await p.locator('#scoreHost .note-beam').count(),2);assert.equal(await p.locator('#scoreHost .note-flag').count(),0);
await p.keyboard.press('ArrowRight');assert.ok(await p.evaluate(()=>window.originalSVG===document.querySelector('#scoreHost svg')&&window.originalNote===document.querySelector('#scoreHost .score-note')));
assert.equal(await p.locator('#scoreHost .score-note[data-selected="1"]').count(),1);
assert.equal(await p.locator('#scoreHost .score-note[data-selected="1"]').getAttribute('data-note-id'),(await snap()).selected);
await p.keyboard.press('/');assert.ok((await snap()).score.measures[0].events[1].beamBreak);assert.ok(await p.locator('#scoreHost .note-flag').count()>0);
await p.keyboard.press('Shift+/');assert.equal((await snap()).score.measures[0].events[1].beamBreak,undefined);assert.equal(await p.locator('#scoreHost .note-flag').count(),0);
if(process.argv[4])await p.screenshot({path:process.argv[4],fullPage:true});
console.log('PASS: 6/8 beams, manual break/reset, selected-note color, stable score and note DOM on navigation');
const before=await snap();await p.keyboard.press('Control+k');await p.locator('#commandSearch').fill('fukan');await p.keyboard.press('ArrowDown');await p.keyboard.press('Escape');assert.deepEqual((await snap()).caret,before.caret);
await p.keyboard.press('Control+k');await p.locator('#commandSearch').fill('保存');const save=p.waitForEvent('download');await p.keyboard.press('Enter');const downloaded=await save;
assert.equal(JSON.parse(await fs.readFile(await downloaded.path(),'utf8')).score,undefined);
assert.deepEqual(JSON.parse(await fs.readFile(await downloaded.path(),'utf8')).measures,before.score.measures);
await p.keyboard.press('Control+k');await p.locator('#commandSearch').fill('musicxml');const xml=p.waitForEvent('download');await p.keyboard.press('Enter');const xmlfile=await xml;
assert.match(await fs.readFile(await xmlfile.path(),'utf8'),/<beam number="1">continue<\/beam>/);
await p.evaluate(()=>{const t=window.__kanadeDev.capture();Object.assign(t,{score:window.KanadeCore.createScore(),selected:null,activeMeasure:0,caret:{mi:0,index:0},undo:[],redo:[],lastEnteredId:null});window.__kanadeDev.restore(t);});
await p.keyboard.press('Control+k');await p.locator('#commandSearch').fill('kyufu');await p.keyboard.press('Enter');assert.equal((await snap()).score.measures[0].events[0].type,'rest');
await p.keyboard.press('Control+z');assert.equal((await snap()).score.measures[0].events.length,0);
// Retained versions must not be altered when a new edit is made after undo.
await p.keyboard.press('c');await p.keyboard.press('d');const two=await snap();await p.keyboard.press('Control+z');await p.keyboard.press('e');await p.keyboard.press('Control+z');await p.keyboard.press('Control+y');assert.equal((await snap()).score.measures[0].events[1].pitches[0].step,'E');
assert.equal(two.score.measures[0].events[1].pitches[0].step,'D');
assert.deepEqual(errors,[]);console.log('PASS: Japanese/English/romanized command search, Escape, rest/save/XML commands, history branching, no runtime errors');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
