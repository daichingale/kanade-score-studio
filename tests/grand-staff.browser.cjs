// node tests/grand-staff.browser.cjs <playwright-core path> <Chromium executable>
const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  try{
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:5173');
    await page.waitForFunction(()=>window.__kanadeDev);
    await page.evaluate(()=>{
      const C=window.KanadeCore;
      const score=C.createScore();
      const t=window.__kanadeDev.capture();
      Object.assign(t,{score,selected:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[],den:4,dots:0,alter:'auto',previewStep:'C',octave:4,lastEnteredId:null,activeStaff:1});
      window.__kanadeDev.restore(t);
    });
    const first=await page.evaluate(()=>{
      const score=window.__kanadeDev.capture().score;
      return {grand:window.KanadeCore.isGrandStaff(score),staves:score.staves?.map(entry=>entry.clef)};
    });
    assert.equal(first.grand,true);
    assert.deepEqual(first.staves,['treble','bass']);
    await page.keyboard.press('\\');
    let snap=await page.evaluate(()=>window.__kanadeDev.capture());
    assert.equal(snap.activeStaff,2);
    await page.keyboard.press('c');
    snap=await page.evaluate(()=>window.__kanadeDev.capture());
    assert.ok(snap.score.measures[0].staff2?.some(event=>event.type==='note'),'下段に入力できる');
    await page.keyboard.press('\\');
    snap=await page.evaluate(()=>window.__kanadeDev.capture());
    assert.equal(snap.activeStaff,1);
    await page.keyboard.press('e');
    snap=await page.evaluate(()=>window.__kanadeDev.capture());
    assert.ok(snap.score.measures[0].events.some(event=>event.type==='note'),'上段に入力できる');
    await page.evaluate(()=>{
      const C=window.KanadeCore;
      const score=C.setGrandStaff(window.__kanadeDev.capture().score,false);
      const t=window.__kanadeDev.capture();
      Object.assign(t,{score,selected:null,caret:{mi:0,index:0},activeMeasure:0,activeStaff:1});
      window.__kanadeDev.restore(t);
    });
    const merged=await page.evaluate(()=>window.KanadeCore.isGrandStaff(window.__kanadeDev.capture().score));
    assert.equal(merged,false);
    assert.deepEqual(errors,[]);
    console.log('PASS: grand staff default, staff switch with \\, upper/lower entry, merge to one staff');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
