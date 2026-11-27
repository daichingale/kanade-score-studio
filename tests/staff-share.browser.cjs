// node tests/staff-share.browser.cjs <playwright-core path> <Chromium executable>
const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:5173');
    await page.waitForFunction(()=>window.__kanadeDev);
    await page.evaluate(()=>{
      const C=window.KanadeCore;
      const {staves,...seed}=C.createScore();
      const blank=()=>C.applyInstrumentStaves({...seed,id:C.uid(),instrument:'フルート',instrumentKey:'flute',clef:'treble',sound:'フルート'},'flute');
      let upper=blank(),lower=blank();
      upper=C.insertEvent(upper,0,0,C.makeNote({step:'C',octave:5,alter:0})).score;
      lower=C.insertEvent(lower,0,0,C.makeNote({step:'E',octave:5,alter:0})).score;
      upper={...upper,id:C.uid(),instrument:'フルート 1',ensembleParts:[{...lower,instrument:'フルート 2'}]};
      const t=window.__kanadeDev.capture();
      Object.assign(t,{score:upper,partIndex:0,selected:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[],activeStaff:1});
      window.__kanadeDev.restore(t);
    });
    await page.click('#ensembleOpen');
    await page.waitForSelector('#ensembleShare',{state:'visible'});
    await page.click('#ensembleShare');
    const shared=await page.evaluate(()=>window.__kanadeDev.capture().score.partUnions?.length||0);
    assert.equal(shared,1);
    await page.evaluate(()=>document.querySelector('#ensembleDialog').close());
    await page.click('#ensembleFull');
    await page.waitForSelector('#overviewScore svg');
    const overview=await page.evaluate(()=>{
      const host=document.querySelector('#overviewScore');
      const staves=host.querySelectorAll('[data-engraved-system] > [data-engraved-part]').length;
      return {staves,text:host.textContent};
    });
    assert.equal(overview.staves,1,'スコアでは2パートが1段になる');
    await page.click('#overviewBack');
    await page.evaluate(()=>{
      const C=window.KanadeCore;
      const t=window.__kanadeDev.capture();
      let score=C.setGrandStaff(C.scoreParts(t.score)[0],true);
      const lower=C.insertEvent(C.staffScore(score,2),0,0,C.makeNote({step:'C',octave:3,alter:0})).score;
      const voiced=C.mergeVoice(lower,2,C.insertEvent(C.voiceScore(lower,2),0,0,C.makeNote({step:'E',octave:3,alter:0})).score);
      score=C.mergeStaff(score,2,voiced);
      Object.assign(t,{score,partIndex:0,activeStaff:1,caret:{mi:0,index:0},selected:null});
      window.__kanadeDev.restore(t);
    });
    const divisi=await page.evaluate(()=>window.KanadeMei.meiForPart(window.__kanadeDev.capture().score).mei.includes('>div.<'));
    assert.equal(divisi,true);
    await page.click('#viewMenu > summary');
    await page.click('#verovioToggle');
    await page.keyboard.press('\\');
    const staves=await page.evaluate(()=>document.querySelectorAll('#scoreHost [data-staff="2"]').length);
    assert.ok(staves>0,'従来レンダラでも下段が見える');
    await page.click('#voiceToggle');
    const editing=await page.evaluate(()=>{
      const snap=window.__kanadeDev.capture();
      return {staff:snap.activeStaff,voice:document.querySelector('#voiceToggle').textContent};
    });
    assert.equal(editing.staff,2);
    assert.match(editing.voice,/下段の第2声部/);
    assert.deepEqual(errors,[]);
    console.log('PASS: a2 combines two parts on one score staff; lower-staff divisi can be edited');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
