const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../src/core');
const Mei=require('../src/verovio-mei');
const toolkitPath=path.join(__dirname,'../vendor/verovio/verovio-toolkit-wasm.js');

function sample(){
  const score=C.createScore();
  score.measures[0].events.push(
    C.makeNote({step:'C',octave:5,alter:0},4),
    C.makeNote({step:'E',octave:5,alter:0},4),
    C.makeRest(4),
    {...C.makeNote({step:'C',octave:4,alter:0},4),pitches:[
      {step:'C',octave:4,alter:0},{step:'E',octave:4,alter:0},{step:'G',octave:4,alter:0}
    ]}
  );
  return score;
}

test('MEI keeps a stable xml:id for notes, rests, and chords',()=>{
  const score=sample();
  const built=Mei.meiForPart(score);
  assert.equal(built.entries.length,4);
  for(const entry of built.entries){
    assert.equal(entry.xmlId,Mei.xmlId(entry.id));
    assert.match(built.mei,new RegExp(`xml:id="${entry.xmlId}"`));
    assert.equal(Mei.eventIdFromXmlId(entry.xmlId),entry.id);
  }
  assert.match(built.mei,/clef\.shape="G"/);
  assert.match(built.mei,/<chord /);
  assert.match(built.mei,/<rest /);
  assert.equal(Mei.keySig(2),'2s');
  assert.equal(Mei.keySig(-3),'3f');
  assert.equal(Mei.xmlId('123e4567-e89b-12d3-a456-426614174000'),'evt-123e4567-e89b-12d3-a456-426614174000');
});

test('SVG decoration maps Verovio ids back onto Kanade events',()=>{
  const score=sample();
  const built=Mei.meiForPart(score);
  const svg=built.entries.map(entry=>`<g id="${entry.xmlId}" class="${entry.type==='rest'?'rest':'note'}"></g>`).join('')+
    '<g id="bar" class="measure"></g>';
  const decorated=Mei.decorateSvg(svg,built.entries,built.measureMap);
  for(const entry of built.entries){
    assert.match(decorated,new RegExp(`data-event-id="${entry.id}"`));
    assert.match(decorated,new RegExp(`data-event-index="${entry.index}"`));
    assert.match(decorated,new RegExp(`data-measure="${entry.measure}"`));
    assert.match(decorated,new RegExp(`data-event-tick="${entry.tick}"`));
    assert.match(decorated,/data-implicit="0"/);
  }
  assert.match(decorated,/class="measure"[^>]*data-measure="0"/);
});

test('staff geometry maps a click to the written pitch and beat',()=>{
  const score=C.createScore();
  const box={x0:1000,x1:5000,top:540,bottom:1260,space:180,lines:5};
  assert.deepEqual(Mei.pitchFromStaff(810,box,'treble'),{step:'C',octave:5,n:42});
  assert.deepEqual(Mei.pitchFromStaff(1260,box,'treble'),{step:'E',octave:4,n:37});
  assert.equal(Mei.yForPitch({step:'C',octave:5,alter:0},box,'treble'),810);
  const cap=C.barTicks(score,0);
  const start=Mei.tickFromBox(1000+180*4.2,box,{cap,den:4,dots:0,score,mi:0,systemStart:1000});
  assert.equal(start.tick,0);
  assert.equal(start.valid,true);
  const later=Mei.tickFromBox(box.x1-180,box,{cap,den:4,dots:0,score,mi:0,systemStart:1000});
  assert.ok(later.tick>start.tick);
  const points=[{x:1332,tick:0},{x:2022,tick:960},{x:2712,tick:1920},{x:3402,tick:2880}];
  const timing={cap,den:4,dots:0,score,mi:0};
  for(const point of points)assert.equal(Mei.tickFromEngraving(point.x,box,points,timing).tick,point.tick);
  assert.equal(Mei.xForTick(1920,box,points,timing),2712);
});

test('Verovio keeps the MEI id and engraves with Bravura',async()=>{
  const verovio=require(toolkitPath);
  await new Promise(resolve=>{
    if(verovio.module.calledRun)resolve();
    else verovio.module.onRuntimeInitialized=resolve;
  });
  const score=sample();
  score.measures[0].events=[C.makeNote({step:'C',octave:5,alter:0})];
  const built=Mei.meiForPart(score);
  const toolkit=new verovio.toolkit();
  toolkit.setOptions({font:'Bravura',scale:40,pageWidth:1400,pageHeight:800,adjustPageHeight:true,svgViewBox:true,xmlIdChecksum:false,header:'none',footer:'none'});
  assert.ok(toolkit.loadData(built.mei));
  const svg=Mei.decorateSvg(toolkit.renderToSVG(1),built.entries,built.measureMap);
  assert.match(svg,/data-event-id="[^"]+"/);
  assert.match(svg,new RegExp(built.entries[0].xmlId));
  assert.match(svg,/Engraved by Verovio/);
  assert.match(svg,/class="note"/);
});

test('the vendored toolkit is the unmodified LGPL build',()=>{
  const dir=path.join(__dirname,'../vendor/verovio');
  const source=fs.readFileSync(path.join(dir,'verovio-toolkit-wasm.js'),'utf8');
  assert.match(source,/function \(global, factory\)/);
  assert.match(source,/global\.verovio = factory/);
  assert.match(fs.readFileSync(path.join(dir,'LICENSE'),'utf8'),/GNU LESSER GENERAL PUBLIC LICENSE/);
  assert.match(fs.readFileSync(path.join(dir,'NOTICE.txt'),'utf8'),/改変せず/);
  const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
  assert.match(sw,/verovio-toolkit-wasm\.js/);
  assert.match(sw,/\/__agent\//);
});
