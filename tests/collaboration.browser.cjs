const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
 const a=await browser.newContext({viewport:{width:1366,height:900}}),b=await browser.newContext({viewport:{width:1366,height:900}});for(const c of [a,b])await c.addInitScript(()=>window.__KANADE_COLLAB_SERVER__='http://127.0.0.1:5174');
 const alice=await a.newPage(),bob=await b.newPage(),errors=[];for(const p of [alice,bob])p.on('pageerror',e=>errors.push(e.message));
 await alice.goto('http://127.0.0.1:5173');await alice.waitForFunction(()=>window.KanadeCollab&&window.__kanadeDev);
 await alice.evaluate(()=>{const C=window.KanadeCore,t=window.__kanadeDev.capture();let score=C.addMeasure(C.createScore());score.title='共同編集テスト';Object.assign(t,{score,selected:null,selectionRange:null,rangeAnchor:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[]});window.__kanadeDev.restore(t);});
 await alice.locator('[data-panel="collabPanel"]').first().click();await alice.locator('#collabName').fill('Alice');await alice.locator('#collabName').blur();await alice.locator('#collabCreate').click();await alice.waitForFunction(()=>window.KanadeCollab.active&&location.hash.includes('key='));const fragment=await alice.evaluate(()=>location.hash);
 await bob.goto('http://127.0.0.1:5173/'+fragment);
 await bob.locator('#collabName').waitFor({state:'visible'});
 assert.ok(await bob.locator('#collabJoin').isDisabled());
 assert.equal(await bob.evaluate(()=>window.KanadeCollab.active),false);
 await bob.locator('#collabName').fill('Bob');await bob.locator('#collabJoin').click();
 await bob.waitForFunction(()=>window.KanadeCollab?.active&&window.__kanadeDev.capture().score.title==='共同編集テスト');
 await alice.keyboard.press('Escape');
 await bob.keyboard.press('Control+ArrowRight');await Promise.all([alice.keyboard.press('c'),bob.keyboard.press('d')]);
 for(const p of [alice,bob])await p.waitForFunction(()=>window.__kanadeDev.capture().score.measures.every(m=>m.events.some(e=>e.type==='note')));
 assert.deepEqual(await alice.evaluate(()=>window.__kanadeDev.capture().score),await bob.evaluate(()=>window.__kanadeDev.capture().score));
 // Alice's Undo removes Alice's note only, preserving Bob's other measure.
 await alice.waitForFunction(()=>window.KanadeCollab.canUndo());await alice.keyboard.press('Control+z');for(const p of [alice,bob])await p.waitForFunction(()=>{const m=window.__kanadeDev.capture().score.measures;return !m[0].events.some(e=>e.type==='note')&&m[1].events.some(e=>e.type==='note');});
 await alice.waitForFunction(()=>window.KanadeCollab.canRedo());await alice.keyboard.press('Control+y');await bob.waitForFunction(()=>window.__kanadeDev.capture().score.measures[0].events.some(e=>e.type==='note'));
 // Incoming notes must not erase a title currently being typed.
 await bob.locator('#titleInput').fill('友だちと作る曲');await alice.keyboard.press('a');await alice.waitForFunction(()=>window.KanadeCollab.pendingCount===0);await bob.waitForTimeout(700);assert.equal(await bob.locator('#titleInput').inputValue(),'友だちと作る曲');await bob.locator('#titleInput').blur();await alice.waitForFunction(()=>window.__kanadeDev.capture().score.title==='友だちと作る曲');
 console.log('PASS: two isolated browsers join by invite, simultaneous different-measure edits converge, own Undo/Redo preserves the other author');
 // Offline edits survive reload in this tab and are submitted after reconnect.
 await b.setOffline(true);await bob.keyboard.press('e');const local=await bob.evaluate(()=>window.__kanadeDev.capture().score);await b.setOffline(false);await bob.reload();await bob.locator('#collabJoin').click();await bob.waitForFunction(()=>window.KanadeCollab?.active);await alice.waitForFunction(()=>window.__kanadeDev.capture().score.measures[1].events.some(e=>e.type==='note'&&e.pitches[0].step==='E'));
 assert.deepEqual(await bob.evaluate(()=>window.__kanadeDev.capture().score),local);
 // Force a same-measure race using offline queues. The losing version stays local.
 for(const p of [alice,bob]){await p.waitForFunction(()=>window.KanadeCollab.active&&window.KanadeCollab.pendingCount===0);await p.evaluate(()=>{const t=window.__kanadeDev.capture();t.caret={mi:0,index:0};t.activeMeasure=0;t.selected=t.score.measures[0].events[0].id;window.__kanadeDev.restore(t);});}
 await Promise.all([a.setOffline(true),b.setOffline(true)]);await alice.keyboard.press('ArrowUp');await bob.keyboard.press('ArrowDown');await alice.waitForFunction(()=>window.KanadeCollab.pendingCount===1);await bob.waitForFunction(()=>window.KanadeCollab.pendingCount===1);await Promise.all([a.setOffline(false),b.setOffline(false)]);
 await Promise.any([alice.waitForFunction(()=>window.KanadeCollab.blocked),bob.waitForFunction(()=>window.KanadeCollab.blocked)]);const loser=await alice.evaluate(()=>window.KanadeCollab.blocked)?alice:bob;
 await loser.locator('[data-panel="collabPanel"]').first().click();assert.ok(await loser.locator('#collabConflict').isVisible());const dl=loser.waitForEvent('download');await loser.locator('#collabSaveLocal').click();assert.ok((await dl).suggestedFilename().endsWith('.kanade.json'));await loser.locator('#collabResolve').click();await loser.waitForFunction(()=>!window.KanadeCollab.blocked);
 if(!await alice.locator('#collabPanel').isVisible())await alice.locator('[data-panel="collabPanel"]').first().click();await alice.locator('#collabRotate').click();await bob.waitForFunction(()=>window.KanadeCollab.blocked);
 assert.deepEqual(errors,[]);console.log('PASS: offline queue/reload recovery, same-measure conflict backup, safe reload of shared version, invitation revocation, no runtime errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
