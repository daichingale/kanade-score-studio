const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
 const p=await b.newPage({viewport:{width:1500,height:1050}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>window.__kanadeDev&&window.KanadePercussion);
 const results=await p.evaluate(async()=>{
  const out=[];
  for(const preset of window.KanadePercussion.presets){
   for(let index=0;index<preset.pads.length;index++){
    const engine=new window.KanadeAudio.Engine(),ctx=new OfflineAudioContext(1,96000,48000);engine.context=ctx;engine.drum({kind:preset.kind,index},.01,.12);
    const noise=engine.noiseBuffer;engine.drum({kind:preset.kind,index},.02,.04);if(engine.noiseBuffer!==noise)throw Error('Noise buffer was not reused');
    const rendered=await ctx.startRendering(),d=rendered.getChannelData(0);let energy=0,peak=0,tail=0;
    for(let i=0;i<d.length;i++){if(!Number.isFinite(d[i]))throw Error('Invalid audio');energy+=d[i]*d[i];peak=Math.max(peak,Math.abs(d[i]));if(i>90000)tail=Math.max(tail,Math.abs(d[i]));}
    out.push({kind:preset.kind,index,rms:Math.sqrt(energy/d.length),peak,tail});
   }
  }return out;
 });
 assert.equal(results.length,17);for(const r of results){assert.ok(r.rms>.001,JSON.stringify(r));assert.ok(r.peak<1);assert.ok(r.tail<.0001);}
 const damping=await p.evaluate(async()=>{
  const measure=async(index,closing)=>{const engine=new window.KanadeAudio.Engine();engine.context=new OfflineAudioContext(1,48000,48000);engine.drum({kind:'cymbal',index},.01,.12);if(closing!==null)engine.drum({kind:'cymbal',index:closing},.12,.12);const d=(await engine.context.startRendering()).getChannelData(0);return d.slice(18000,24000).reduce((sum,n)=>sum+n*n,0);};
  return {open:await measure(1,null),closed:await measure(1,0),crash:await measure(2,null),choke:await measure(2,3)};
 });assert.ok(damping.closed<damping.open*.01);assert.ok(damping.choke<damping.crash*.01);
 console.log('PASS: closed hi-hat damps open hat, choke damps crash tails');
 console.log('PASS: all 17 marching voices render audible finite waveforms, decay to silence, reuse noise buffers, stay below clipping');
 await p.evaluate(()=>{const t=window.__kanadeDev.capture();Object.assign(t,{score:window.KanadeCore.createScore(),selected:null,selectionRange:null,rangeAnchor:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[]});window.__kanadeDev.restore(t);window.drumCalls=[];const old=window.KanadeAudio.Engine.prototype.drum;window.KanadeAudio.Engine.prototype.drum=function(preset,...args){window.drumCalls.push(preset);return old.call(this,preset,...args);};});
 const names=['マーチング・スネア','マーチング・テナー','マーチング・バスドラム','マーチング・シンバル'];
 for(const [i,name]of names.entries()){
  await p.locator('[data-panel="soundSettings"]').click();await p.locator('#instrument').selectOption(name);await p.locator('#soundMap').evaluate(el=>el.open=true);assert.equal(await p.locator('#instrument').inputValue(),name);await p.locator('#percussionPads button').last().click();
  await p.waitForFunction(kind=>window.drumCalls.some(c=>c.kind===kind),['snare','tenor','bass','cymbal'][i]);
  assert.ok(await p.locator('#soundMap').isVisible());await p.keyboard.press('Escape');
 }
 const captured=await p.evaluate(()=>window.__kanadeDev.capture());assert.equal(captured.score.measures[0].events.length,4);
 assert.equal(captured.score.sound,names[3]);await p.keyboard.press('Control+z');assert.equal((await p.evaluate(()=>window.__kanadeDev.capture())).score.measures[0].events.length,3);await p.keyboard.press('Control+y');
 const before=await p.evaluate(()=>window.drumCalls.length);await p.locator('#playBtn').click();await p.waitForFunction(n=>window.drumCalls.length>n,before);await p.locator('#stopBtn').click();
 assert.equal(await p.locator('#playBtn').getAttribute('aria-pressed'),'false');
 await p.reload();await p.waitForFunction(()=>window.__kanadeDev);assert.equal(await p.locator('#instrument').inputValue(),names[3]);await p.locator('[data-panel="soundSettings"]').click();assert.ok(await p.locator('#soundMap').isVisible());
 await p.locator('#instrument').selectOption('マーチング・シンバル');
 for(const id of ['commandBtn','openBtn','saveBtn','copySelection','cutSelection','pasteSelection','removeMeasure'])assert.equal(await p.locator(`#${id} svg.ui-icon`).count(),1);
 if(process.argv[4])await p.screenshot({path:process.argv[4],fullPage:true});
 await p.locator('#instrument').selectOption('ピアノ');assert.equal(await p.locator('#soundMap').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS: visible drum pads/icons, input audition, playback/stop, Undo/Redo, autosave/reload, piano switch, no runtime errors');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
