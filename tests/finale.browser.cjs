// node tests/finale.browser.cjs <playwright-core path> <Chromium executable>
const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__kanadeDev);
 const snap=()=>page.evaluate(()=>window.__kanadeDev.capture());
 async function reset(bars=1){await page.evaluate(bars=>{const C=window.KanadeCore;let score=C.createScore();for(let i=1;i<bars;i++)score=C.addMeasure(score);const t=window.__kanadeDev.capture();Object.assign(t,{score,selected:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[],den:4,dots:0,alter:'auto',previewStep:'C',octave:4,lastEnteredId:null});window.__kanadeDev.restore(t);},bars);}
 await reset(3);await page.keyboard.press('Control+ArrowRight');assert.deepEqual((await snap()).caret,{mi:1,index:0});
 await page.keyboard.press('Control+ArrowLeft');assert.equal((await snap()).caret.mi,0);await page.keyboard.press('Control+End');assert.equal((await snap()).caret.mi,2);await page.keyboard.press('Control+Home');assert.equal((await snap()).caret.mi,0);
 await reset();await page.keyboard.press('0');await page.keyboard.press('0');await page.keyboard.press('d');
 let t=await snap();assert.deepEqual(t.score.measures[0].events.map(e=>e.type),['rest','rest','note']);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('c');t=await snap();assert.deepEqual(t.score.measures[0].events.map(e=>e.type),['rest','note','note']);
 await reset();await page.keyboard.press('Shift+Enter');await page.keyboard.press('Alt+Enter');assert.equal((await snap()).score.measures[0].events.length,2);
 console.log('PASS: measure/score navigation, consecutive rests, overwrite explicitly selected rest, alternative rest shortcuts');
 await reset();await page.keyboard.press('c');await page.keyboard.press('Shift+e');assert.equal((await snap()).score.measures[0].events[0].pitches.length,2);assert.equal((await snap()).score.measures[0].events.length,1);
 await page.keyboard.press('Shift+e');assert.equal((await snap()).score.measures[0].events[0].pitches.length,2);
 const chord=(await snap()).score.measures[0].events[0];await page.keyboard.press('r');assert.equal((await snap()).score.measures[0].events[0].type,'rest');
 await page.keyboard.press('Control+z');assert.deepEqual((await snap()).score.measures[0].events[0],chord);await page.keyboard.press('Control+y');await page.keyboard.press('r');assert.deepEqual((await snap()).score.measures[0].events[0],chord);
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');await page.keyboard.press('Control+Enter');assert.equal((await snap()).score.measures[0].events[0].pitches.length,3);
 console.log('PASS: Shift+A–G chord additions, duplicate no-op, R round trip, Undo/Redo, Ctrl+Enter from caret');
 await reset();await page.keyboard.press('c');await page.keyboard.press('+');assert.equal((await snap()).score.measures[0].events[0].pitches[0].alter,1);
 await page.keyboard.press('-');assert.equal((await snap()).score.measures[0].events[0].pitches[0].alter,0);
 await page.keyboard.press('NumpadAdd');assert.equal((await snap()).score.measures[0].events[0].pitches[0].alter,1);await page.keyboard.press('NumpadSubtract');assert.equal((await snap()).score.measures[0].events[0].pitches[0].alter,0);
 const stemBefore=await page.locator('#scoreHost .note-stem').getAttribute('d');await page.keyboard.press('l');assert.equal((await snap()).score.measures[0].events[0].stemDirection,'down');assert.notEqual(await page.locator('#scoreHost .note-stem').getAttribute('d'),stemBefore);
 await page.keyboard.press('Shift+l');assert.equal((await snap()).score.measures[0].events[0].stemDirection,undefined);assert.equal(await page.locator('#scoreHost .note-stem').getAttribute('d'),stemBefore);
 await page.keyboard.press('.');assert.equal((await snap()).score.measures[0].events[0].dots,1);await page.keyboard.press('Control+z');assert.equal((await snap()).score.measures[0].events[0].dots,0);
 await page.keyboard.press('9');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,5);
 await page.keyboard.press('8');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,4);
 await page.keyboard.press('Shift+ArrowUp');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,4);
 await page.keyboard.press('d');assert.equal((await snap()).score.measures[0].events[1].pitches[0].octave,5);
 await page.keyboard.press('Shift+ArrowDown');await page.keyboard.press('e');
 assert.equal((await snap()).score.measures[0].events[2].pitches[0].octave,4);
 await page.keyboard.press('Control+a');await page.keyboard.press('8');
 assert.deepEqual((await snap()).score.measures[0].events.map(e=>e.pitches[0].octave),[3,4,3]);
 console.log('PASS: chromatic movement (including numpad), stem flip/reset, dotted duration, existing octave shortcut');
 const prior=await snap();await page.locator('#titleInput').fill('R + - 0 L');await page.keyboard.press('Control+ArrowLeft');assert.deepEqual((await snap()).score.measures,prior.score.measures);
 assert.deepEqual(errors,[]);console.log('PASS: text fields retain normal keyboard behavior; no runtime errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
