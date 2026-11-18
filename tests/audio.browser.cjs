// node tests/audio.browser.cjs <playwright-core path> <Chromium executable>
const {chromium}=require(process.argv[2]||'playwright-core'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.argv[3]?{executablePath:process.argv[3]}:{})});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const Native=window.AudioContext;
  window.audioStats={contexts:0,tones:[],rms:0};
  window.AudioContext=class extends Native{
   constructor(...args){super(...args);window.audioStats.contexts++;this.tap=this.createAnalyser();this.tap.fftSize=256;this.tap.connect(this.destination);window.testAudio=this;}
   createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc),stop=osc.stop.bind(osc);let record;
    osc.start=t=>{record={frequency:osc.frequency.value,start:t};window.audioStats.tones.push(record);return start(t);};
    osc.stop=t=>{if(record)record.end=t;return stop(t);};return osc;}
   createGain(){const gain=super.createGain(),connect=gain.connect.bind(gain);gain.connect=(dest,...args)=>connect(dest===this.destination?this.tap:dest,...args);return gain;}
  };
 });
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__kanadeDev&&window.KanadeAudio);
 const snap=()=>page.evaluate(()=>window.__kanadeDev.capture());
 await page.evaluate(()=>{const original=window.KanadeAudio.Engine.prototype.sample;window.KanadeAudio.Engine.prototype.sample=function(instrument,midi,start,duration,level){window.audioStats.tones.push({frequency:440*2**((midi-69)/12),start,end:start+duration});return original.call(this,instrument,midi,start,duration,level);};});
 await page.keyboard.press('c');await page.waitForFunction(()=>window.audioStats.tones.length>0);
 await page.waitForFunction(()=>{const a=window.testAudio.tap,d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return d.some(x=>Math.abs(x)>.001);});
 await page.keyboard.press('v');
 const c=await snap();await page.keyboard.press('Shift+ArrowUp');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,5);
 await page.waitForFunction(()=>window.audioStats.tones.some(t=>Math.abs(t.frequency-523.251)<.1));
 await page.keyboard.press('Shift+ArrowDown');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,4);
 await page.keyboard.press('Control+z');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,5);
 await page.keyboard.press('Control+y');assert.equal((await snap()).score.measures[0].events[0].pitches[0].octave,4);
 await page.evaluate(()=>{const t=window.__kanadeDev.capture(),C=window.KanadeCore;t.score.measures[0].events[0].pitches=C.normalizeChord([...t.score.measures[0].events[0].pitches,C.normalPitch({step:'E',octave:4,alter:-1})]);window.__kanadeDev.restore(t);});
 await page.keyboard.press('Shift+ArrowUp');assert.deepEqual((await snap()).score.measures[0].events[0].pitches.map(p=>[p.octave,p.alter]),[[5,0],[5,-1]]);
 console.log('PASS: audible input waveform, octave +/-12 semitones, chord/accidental preservation, Undo/Redo');
 await page.locator('#playBtn').click();await page.waitForFunction(()=>document.querySelector('#playBtn').getAttribute('aria-pressed')==='true');
 await page.waitForFunction(()=>{const a=window.testAudio.tap,d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return d.some(x=>Math.abs(x)>.001);});
 await page.locator('#stopBtn').click();assert.equal(await page.locator('#playBtn').getAttribute('aria-pressed'),'false');
 await page.waitForFunction(()=>{const a=window.testAudio.tap,d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);return d.every(x=>Math.abs(x)<.001);});
 await page.keyboard.press('n');
 // Mouse placement at a new beat also auditions, while rests do not.
 const point=await page.evaluate(()=>{const svg=document.querySelector('#scoreHost svg'),pt=svg.createSVGPoint(),g=window.KanadeRenderer.measureGeometry(window.__kanadeDev.capture().score,0);pt.x=g.notesStart+g.usable/2;pt.y=g.top+48;const q=pt.matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};});
 const before=await page.evaluate(()=>window.audioStats.tones.length);await page.mouse.click(point.x,point.y);await page.waitForFunction(n=>window.audioStats.tones.length>n,before);
 const after=await page.evaluate(()=>window.audioStats.tones.length);await page.keyboard.press(',');assert.equal(await page.evaluate(()=>window.audioStats.tones.length),after);
 // Long notes keep their full duration; very short notes use a valid envelope.
 await page.evaluate(()=>{const C=window.KanadeCore,s=C.createScore();s.tempo=20;s.measures[0].events=[C.makeNote({step:'C',octave:4,alter:0},1)];window.testEngine=new window.KanadeAudio.Engine();window.testEngine.play(s);});
 await page.waitForFunction(()=>window.audioStats.tones.some(t=>t.end-t.start>11.9));
 await page.evaluate(()=>window.testEngine.stop());
 await page.evaluate(()=>{const C=window.KanadeCore,s=C.createScore();s.tempo=300;s.measures[0].events=[C.makeNote({step:'C',octave:4,alter:0},64)];window.testEngine.play(s);});
 await page.waitForFunction(()=>window.testEngine.playing===false);
 assert.deepEqual(errors,[]);console.log('PASS: playback waveform, immediate stop, mouse audition, silent rests, long/64th-note playback, no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
