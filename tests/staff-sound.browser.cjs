const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});try{
 const p=await b.newPage({viewport:{width:1560,height:1080},acceptDownloads:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:5173');await p.waitForFunction(()=>window.__kanadeDev&&window.KanadeSamples);
 const results=await p.evaluate(async()=>{
  const output=[];
  for(const name of Object.keys(window.KanadeSamples.presets)){
   const engine=new window.KanadeAudio.Engine(),ctx=new OfflineAudioContext(1,72000,48000);engine.context=ctx;
   await engine.prepareSamples(name,[60,61]);
   let rate;const original=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const source=original(),start=source.start.bind(source);source.start=(...args)=>{rate=source.playbackRate.value;return start(...args);};return source;};
   engine.sample(name,61,.01,1,.12);const d=(await ctx.startRendering()).getChannelData(0);let energy=0,peak=0,tail=0;
   for(let i=0;i<d.length;i++){if(!Number.isFinite(d[i]))throw Error('Invalid sample output');energy+=d[i]*d[i];peak=Math.max(peak,Math.abs(d[i]));if(i>62000)tail=Math.max(tail,Math.abs(d[i]));}
   output.push({name,rms:Math.sqrt(energy/d.length),peak,tail,rate});
  }return output;
 });
 assert.equal(results.length,13);for(const r of results){assert.ok(r.rms>.0002,JSON.stringify(r));assert.ok(r.peak<1);assert.ok(r.tail<.001);assert.ok(Math.abs(r.rate-2**(1/12))<.0001);}
 assert.ok(new Set(results.map(r=>r.rms.toFixed(7))).size>=12);
 console.log('PASS: 13 timbres use local decoded samples, audible/distinct waveforms, semitone resampling, sustained note duration and release');
 await p.evaluate(()=>{const C=window.KanadeCore,t=window.__kanadeDev.capture();Object.assign(t,{score:C.createScore(),selected:null,selectionRange:null,rangeAnchor:null,caret:{mi:0,index:0},activeMeasure:0,undo:[],redo:[]});window.__kanadeDev.restore(t);window.sampleCalls=[];const old=window.KanadeAudio.Engine.prototype.sample;window.KanadeAudio.Engine.prototype.sample=function(name,midi,...args){window.sampleCalls.push({name,midi});return old.call(this,name,midi,...args);};});
 await p.keyboard.press('c');await p.waitForFunction(()=>window.sampleCalls.length);
 const before=await p.evaluate(()=>window.__kanadeDev.capture().score);
 await p.locator('[data-panel="soundSettings"]').click();
 for(const sound of ['フルート','トランペット','マーチング・シンバル','クラリネット']){await p.locator('#instrument').selectOption(sound);const s=await p.evaluate(()=>window.__kanadeDev.capture().score);assert.deepEqual(s.measures,before.measures);assert.equal(s.clef,before.clef);assert.equal(s.instrument,before.instrument);assert.equal(s.sound,sound);}
 assert.equal(await p.locator('#marchingInstruments').count(),0);assert.equal(await p.locator('#percussionPanel').count(),0);
 await p.locator('[data-panel="scoreSettings"]').click();await p.locator('#transposition').selectOption('bb');await p.locator('[data-panel="soundSettings"]').click();await p.locator('#soundPreview').click();await p.waitForFunction(()=>window.sampleCalls.some(c=>c.name==='クラリネット'&&c.midi===58));
 const count=await p.evaluate(()=>window.sampleCalls.length);await p.locator('#playBtn').click();await p.waitForFunction(n=>window.sampleCalls.length>n,count);assert.equal(await p.evaluate(()=>window.sampleCalls.at(-1).midi),58);await p.locator('#stopBtn').click();
 await p.locator('[data-panel="scoreSettings"]').click();await p.locator('#clefSelect').selectOption('alto');assert.equal(await p.locator('.music-glyph-alto').count(),1);const top=await p.evaluate(()=>window.KanadeRenderer.measureGeometry(window.__kanadeDev.capture().score,0).top);assert.equal(Number(await p.locator('.music-glyph-alto').getAttribute('data-origin-y')),top+24);
 await p.locator('#clefSelect').selectOption('tenor');assert.equal(Number(await p.locator('.music-glyph-tenor').getAttribute('data-origin-y')),top+12);
 await p.locator('#clefSelect').selectOption('percussion');await p.locator('#staffLines').selectOption('1');await p.locator('#notehead').selectOption('cross');assert.equal(await p.locator('.staff-line').count(),1);assert.equal(Number(await p.locator('#scoreHost .notehead').first().getAttribute('data-origin-y')),top+24);assert.equal(await p.locator('.music-glyph-percussion').count(),1);
 for(const n of ['2','3','4','5','1']){await p.locator('#staffLines').selectOption(n);assert.equal(await p.locator('.staff-line').count(),Number(n));}
 await p.locator('#staffLines').blur();await p.keyboard.press('Escape');await p.keyboard.press('l');assert.equal((await p.evaluate(()=>window.__kanadeDev.capture())).score.measures[0].events[0].stemDirection,'down');await p.keyboard.press('Shift+l');assert.equal((await p.evaluate(()=>window.__kanadeDev.capture())).score.measures[0].events[0].stemDirection,undefined);
 await p.locator('[data-panel="soundSettings"]').click();await p.locator('#instrument').selectOption('マーチング・シンバル');await p.locator('#soundMap').evaluate(el=>el.open=true);await p.locator('[data-drum-step="F"]').click();assert.equal(Number(await p.locator('#scoreHost .notehead').last().getAttribute('data-origin-y')),top+24);
 await p.locator('[data-panel="scoreSettings"]').click();await p.locator('#partName').fill('Cymbals');await p.locator('#partName').blur();const saved=await p.evaluate(()=>window.__kanadeDev.capture().score);
 await p.reload();await p.waitForFunction(()=>window.__kanadeDev);assert.deepEqual(await p.evaluate(()=>window.__kanadeDev.capture().score),saved);assert.equal(await p.locator('#staffLines').inputValue(),'1');assert.equal(await p.locator('#instrument').inputValue(),'マーチング・シンバル');
 await p.locator('[data-panel="soundSettings"]').click();await p.locator('#soundMap').evaluate(el=>el.open=true);if(process.argv[4])await p.screenshot({path:process.argv[4],fullPage:true});
 await p.keyboard.press('Control+z');assert.deepEqual(await p.evaluate(()=>window.__kanadeDev.capture().score),saved); // Normal reload restores score, not history.
 assert.deepEqual(errors,[]);console.log('PASS: independent sound switch, B-flat audition/playback, clef anchors, 1–5 staff lines, neutral/X notes, save/reload, no runtime errors');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
