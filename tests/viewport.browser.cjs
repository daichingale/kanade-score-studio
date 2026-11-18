const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
 const p=await b.newPage({viewport:{width:1366,height:900},hasTouch:true,acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>window.__kanadeDev&&window.KanadeViewport);
 const cdp=await p.context().newCDPSession(p),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints}),snap=()=>p.evaluate(()=>window.__kanadeDev.capture());
 await p.evaluate(()=>{const t=window.__kanadeDev.capture(),C=window.KanadeCore;let score=C.createScore();for(let i=1;i<15;i++)score=C.addMeasure(score);Object.assign(t,{score,selected:null,selectionRange:null,rangeAnchor:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[],view:{mode:'fit',scale:1,hand:false},scrollTop:0,scrollLeft:0});window.__kanadeDev.restore(t);});
 const baseline=await snap(),point=await p.evaluate(()=>{const score=window.__kanadeDev.capture().score,g=window.KanadeRenderer.measureGeometry(score,0),svg=document.querySelector('#scoreHost svg'),pt=svg.createSVGPoint();pt.x=g.notesStart;pt.y=g.top+48;const q=pt.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};});
 // A real single-finger tap inserts exactly one note, including native compatibility clicks.
 await send('touchStart',[{...point,id:1}]);await send('touchEnd',[]);await p.waitForFunction(()=>window.__kanadeDev.capture().score.measures[0].events.length===1);await p.waitForTimeout(450);assert.equal((await snap()).undo.length,1);
 const tapped=await snap(),r=await p.locator('#scoreScroll').boundingBox(),mid={x:r.x+r.width/2,y:r.y+Math.min(300,r.height/2)};
 const doc=()=>p.evaluate(mid=>{const r=document.querySelector('.paper').getBoundingClientRect();return {x:(mid.x-r.left)/r.width,y:(mid.y-r.top)/r.width};},mid);
 const anchorBefore=await doc(),scaleBefore=(await snap()).view.scale;
 await send('touchStart',[{x:mid.x-70,y:mid.y,id:1},{x:mid.x+70,y:mid.y,id:2}]);
 await send('touchMove',[{x:mid.x-140,y:mid.y,id:1},{x:mid.x+140,y:mid.y,id:2}]);await p.waitForFunction(s=>window.KanadeViewport.capture().scale>s*1.9,scaleBefore);await send('touchEnd',[]);
 const anchorAfter=await doc();assert.ok(Math.abs(anchorAfter.x-anchorBefore.x)<.003);assert.ok(Math.abs(anchorAfter.y-anchorBefore.y)<.003);assert.deepEqual((await snap()).score,tapped.score);assert.equal((await snap()).undo.length,tapped.undo.length);assert.equal(await p.evaluate(()=>window.visualViewport.scale),1);
 // One finger dragging and two fingers translating scroll without selecting or adding notes.
 const pan=async(two)=>{const points=[{x:mid.x,y:mid.y,id:1},...(two?[{x:mid.x+90,y:mid.y,id:2}]:[])];const before=(await snap()).scrollTop;await send('touchStart',points);await send('touchMove',points.map(q=>({...q,y:q.y-90})));await send('touchEnd',[]);assert.ok((await snap()).scrollTop>before+50);};
 await pan(false);await pan(true);assert.deepEqual((await snap()).score,tapped.score);assert.equal((await snap()).selected,tapped.selected);
 const expanded=(await snap()).view.scale;await send('touchStart',[{x:mid.x-140,y:mid.y,id:1},{x:mid.x+140,y:mid.y,id:2}]);await send('touchMove',[{x:mid.x-70,y:mid.y,id:1},{x:mid.x+70,y:mid.y,id:2}]);await send('touchEnd',[{x:mid.x-70,y:mid.y,id:1}]);await send('touchEnd',[]);assert.ok((await snap()).view.scale<expanded*.6);assert.deepEqual((await snap()).score,tapped.score);
 console.log('PASS: native touch tap inserts once, pinch anchors zoom, one/two-finger panning changes no notes, browser page stays at 100%');
 await p.evaluate(()=>document.querySelector('#kanade-ghost-layer').innerHTML='<g class="entry-ghost"></g>');
 await p.locator('#zoomLevel').click();assert.equal(await p.locator('#kanade-ghost-layer .entry-ghost').count(),0);assert.equal((await snap()).view.scale,1);await p.locator('#zoomIn').click();assert.ok((await snap()).view.scale>1);await p.keyboard.press('Control+0');assert.equal((await snap()).view.scale,1);
 await p.locator('#scoreScroll').hover();const beforeWheel=(await snap()).view.scale;await p.mouse.wheel(0,100);await p.keyboard.down('Control');await p.mouse.wheel(0,-150);await p.keyboard.up('Control');assert.ok((await snap()).view.scale>beforeWheel);
 // Explicit viewport controls preserve the musical model and its Undo stack.
 await p.keyboard.press('h');assert.equal((await snap()).view.hand,true);const beforeDrag=(await snap()).scrollTop;
 await p.mouse.move(mid.x,mid.y);await p.mouse.down();await p.mouse.move(mid.x,mid.y-100,{steps:4});await p.mouse.up();assert.ok((await snap()).scrollTop>beforeDrag+60);await p.keyboard.press('Escape');assert.equal((await snap()).view.hand,false);assert.deepEqual((await snap()).score,tapped.score);
 await p.evaluate(()=>window.KanadeViewport.action('actual'));await p.keyboard.press('Control+-');assert.ok((await snap()).view.scale<1);await p.keyboard.press('Control++');
 await p.locator('[data-view-action="fit"]').last().click();assert.equal((await snap()).view.mode,'fit');await p.setViewportSize({width:1120,height:800});await p.waitForFunction(()=>window.KanadeViewport.capture().scale<1);assert.equal((await snap()).view.mode,'fit');
 await p.evaluate(()=>window.KanadeViewport.action('actual'));await p.locator('#zoomIn').click();const saved=(await snap()).view;await p.reload();await p.waitForFunction(()=>window.__kanadeDev);assert.equal((await snap()).view.scale,saved.scale);
 // Tap at a known rhythmic onset at 200%, and cancel a second touch without editing.
 await p.evaluate(()=>{window.KanadeViewport.restore({mode:'manual',scale:2,hand:false});const h=document.querySelector('#scoreScroll');h.scrollTop=0;h.scrollLeft=0;});
 const zoomPoint=await p.evaluate(()=>{const g=window.KanadeRenderer.measureGeometry(window.__kanadeDev.capture().score,0),svg=document.querySelector('#scoreHost svg'),pt=svg.createSVGPoint();pt.x=g.notesStart+g.usable/4;pt.y=g.top+48;const q=pt.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};});
 await send('touchStart',[{...zoomPoint,id:1}]);await send('touchEnd',[]);let edited=await snap();assert.equal(edited.score.measures[0].events[1].type,'note');assert.equal(edited.score.measures[0].events[1].pitches[0].step,'E');assert.equal(edited.score.measures[0].events[1].pitches[0].octave,4);
 await send('touchStart',[{...zoomPoint,id:1}]);await send('touchCancel',[]);assert.deepEqual((await snap()).score,edited.score);assert.equal((await snap()).undo.length,edited.undo.length);
 await p.evaluate(()=>{for(let i=0;i<30;i++)window.KanadeViewport.action('in');});assert.equal((await snap()).view.scale,3);await p.evaluate(()=>{for(let i=0;i<40;i++)window.KanadeViewport.action('out');});assert.equal((await snap()).view.scale,.25);
 await p.emulateMedia({media:'print'});assert.equal(await p.locator('.zoom-controls').isVisible(),false);const printWidth=await p.locator('.paper').evaluate(el=>el.getBoundingClientRect().width);assert.ok(printWidth<1500);await p.emulateMedia({media:'screen'});
 assert.deepEqual(errors,[]);console.log('PASS: zoom buttons/shortcuts, Ctrl+wheel, hand dragging, fit on resize, view-only persistence and unscaled print');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
