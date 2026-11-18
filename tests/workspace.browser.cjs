const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
 const p=await b.newPage({viewport:{width:1366,height:900},acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>window.__kanadeDev);
 assert.equal(await p.locator('#helpPanel #kanade-dev-status').count(),1);assert.equal(await p.locator('#kanade-dev-status').isVisible(),false);
 for(const [width,height]of [[1366,900],[1280,720],[980,720]]){
  await p.setViewportSize({width,height});const box=await p.locator('#scoreScroll').boundingBox();assert.ok(box.width>=width-125);assert.ok(box.height>=height-200);
  assert.ok(await p.locator('#timeSelect').isVisible());assert.ok(await p.locator('#durations').isVisible());assert.equal(await p.locator('#instrument').isVisible(),false);assert.equal(await p.locator('#noteInspector').isVisible(),false);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),width);
  await p.locator('#playBtn').click();await p.locator('#stopBtn').click(); // Buttons must remain clickable at narrow widths.
 }
 await p.setViewportSize({width:1366,height:900});await p.locator('[data-den="8"]').click();await p.keyboard.press('c');assert.equal((await p.evaluate(()=>window.__kanadeDev.capture())).score.measures[0].events[0].den,8);
 await p.locator('[data-panel="scoreSettings"]').click();assert.ok(await p.locator('#scoreSettings').isVisible());await p.locator('#clefSelect').selectOption('alto');await p.locator('#staffLines').selectOption('3');await p.keyboard.press('Escape');assert.equal(await p.locator('#scoreSettings').isVisible(),false);
 await p.keyboard.press('d');assert.equal((await p.evaluate(()=>window.__kanadeDev.capture())).score.measures[0].events.length,2);
 const before=await p.evaluate(()=>window.__kanadeDev.capture().score.measures);
 await p.locator('[data-panel="soundSettings"]').click();await p.locator('#instrument').selectOption('フルート');await p.locator('#playBtn').click();await p.locator('#stopBtn').click();assert.equal(await p.locator('#soundSettings').isVisible(),false);assert.deepEqual(await p.evaluate(()=>window.__kanadeDev.capture().score.measures),before);
 await p.locator('#editMenu summary').click();await p.locator('#duplicateMeasures').click();assert.equal((await p.evaluate(()=>window.__kanadeDev.capture())).score.measures.length,2);assert.equal(await p.locator('#editMenu').getAttribute('open'),null);assert.equal(await p.locator('#noteInspector').isVisible(),false);
 await p.locator('.docbar [data-toggle-inspector]').click();assert.ok(await p.locator('#noteInspector').isVisible());assert.ok((await p.locator('#scoreScroll').boundingBox()).width<1100);await p.locator('#noteInspector [data-toggle-inspector]').click();assert.equal(await p.locator('#noteInspector').isVisible(),false);
 await p.locator('#viewMenu summary').click();await p.locator('[data-panel="helpPanel"]').click();assert.ok(await p.locator('#helpPanel').isVisible());await p.keyboard.press('Escape');assert.equal(await p.locator('#helpPanel').isVisible(),false);
 await p.locator('#fileMenu summary').click();await p.locator('#exportBtn').click();const dl=p.waitForEvent('download');await p.locator('[data-export="svg"]').click();assert.ok((await dl).suggestedFilename().endsWith('.svg'));
 // Printing must not include transient settings or menus.
 await p.locator('[data-panel="scoreSettings"]').click();await p.emulateMedia({media:'print'});assert.equal(await p.locator('#scoreSettings').isVisible(),false);await p.emulateMedia({media:'screen'});await p.keyboard.press('Escape');
 if(process.argv[4])await p.screenshot({path:process.argv[4],fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: score-first layout at 980/1280/1366 px, uncluttered defaults, essential input, settings/Escape, sound, edit/export menus, opt-in inspector and print');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
