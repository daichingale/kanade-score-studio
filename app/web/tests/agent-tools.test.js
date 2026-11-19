const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core');
const Tools=require('../src/agent-tools');

function freeze(score){return JSON.stringify(score);}
function notes(part){return part.measures.flatMap(bar=>bar.events).filter(event=>event.type==='note');}

test('score tools do not use the collaboration remote path',()=>{
 const home=path.join(__dirname,'../src');
 for(const file of ['agent-tools.js','agent.js']){
  assert.equal(fs.readFileSync(path.join(home,file),'utf8').includes('applyRemote'),false);
 }
 const app=fs.readFileSync(path.join(home,'app.js'),'utf8');
 const attach=app.slice(app.indexOf('KanadeAgent.attach'));
 assert.equal(attach.includes('applyRemote'),false);
 assert.match(attach,/commit\(/);
});

test('metadata, tempo, key and meter edit a copy and keep the original',()=>{
 const score=C.createScore();
 const before=freeze(score);
 const titled=Tools.run(score,'setMetadata',{title:'テスト行進曲',composer:'山田'});
 assert.equal(score.title,'新しい楽譜');
 assert.equal(freeze(score),before);
 assert.equal(titled.document.title,'テスト行進曲');
 assert.equal(titled.document.composer,'山田');
 const tempo=Tools.run(titled.document,'setTempo',{tempo:132});
 assert.equal(tempo.document.tempo,132);
 const key=Tools.run(tempo.document,'setKey',{name:'変ホ'});
 assert.equal(key.document.key,-3);
 const meter=Tools.run(key.document,'setTimeSignature',{num:3,den:4});
 assert.deepEqual(meter.document.time,{num:3,den:4});
 assert.throws(()=>Tools.run(score,'setTempo',{tempo:10}),/テンポ/);
 assert.throws(()=>Tools.run(score,'setMetadata',{}),/曲名または作曲者/);
});

test('templates replace a blank piano and adding a trumpet keeps written keys',()=>{
 const blank=C.createScore();
 const wind=Tools.run(blank,'applyEnsembleTemplate',{id:'smallWind'});
 assert.equal(wind.document.instrument.includes('フルート'),true);
 assert.equal(wind.document.ensembleParts.length>5,true);
 assert.equal(C.scoreParts(wind.document).some(part=>part.instrument.includes('クラリネット')&&part.key===2),true);
 assert.equal(C.scoreParts(wind.document).every(part=>part.measures.length===blank.measures.length),true);
 const added=Tools.run(blank,'addParts',{keys:['trumpet']});
 const trumpet=C.scoreParts(added.document)[1];
 assert.match(trumpet.instrument,/トランペット/);
 assert.equal(trumpet.transposition,'bb');
 assert.equal(trumpet.key,2);
 assert.equal(blank.ensembleParts,undefined);
 assert.match(Tools.run(blank,'listEnsembleTemplates',{}).summary,/smallWind: 小編成吹奏楽/);
});

test('notes, rests, ties and transposition round-trip without mutating the source',()=>{
 const score=C.createScore();
 const before=freeze(score);
 const written=Tools.run(score,'insertNotes',{measure:1,beat:1,notes:[
  {step:'C',octave:4,den:4,tie:true},{step:'C',octave:4,den:4},{step:'E',octave:4,den:2}
 ]});
 assert.equal(freeze(score),before);
 const events=written.document.measures[0].events;
 assert.equal(events[0].tieStart,true);
 assert.equal(events[1].tieStop,true);
 assert.equal(events[0].pitches[0].step,'C');
 assert.equal(events[2].den,2);
 const read=Tools.run(written.document,'readMeasures',{from:1,to:1});
 assert.match(read.summary,/C4/);
 const raised=Tools.run(written.document,'transpose',{from:1,to:1,semitones:2});
 assert.deepEqual(notes(C.scoreParts(raised.document)[0]).map(event=>event.pitches[0].step),['D','D','F']);
 const spelled=notes(C.scoreParts(raised.document)[0])[2].pitches[0];
 assert.equal(spelled.step,'F');
 assert.equal(spelled.alter,1);
 const rested=Tools.run(C.createScore(),'insertRests',{measure:1,beat:1,rests:[{den:2,dots:1}]});
 assert.equal(rested.document.measures[0].events[0].type,'rest');
 assert.equal(rested.document.measures[0].events[0].dots,1);
 assert.throws(()=>Tools.run(score,'insertNotes',{measure:1,notes:[{step:'H',octave:4,den:4}]}),/音/);
});

test('measure edits and part removal describe the change and can require confirmation',()=>{
 const score=Tools.run(C.createScore(),'addMeasures',{at:2,count:2}).document;
 assert.equal(score.measures.length,3);
 const removal=Tools.confirmText(score,'removeMeasures',{from:2,to:3});
 assert.match(removal,/2〜3小節/);
 const removed=Tools.run(score,'removeMeasures',{from:2,to:3}).document;
 assert.equal(removed.measures.length,1);
 const duo=Tools.run(score,'addParts',{keys:['flute']}).document;
 assert.match(Tools.confirmText(duo,'removePart',{part:'フルート'}),/削除します/);
 const solo=Tools.run(duo,'removePart',{part:2}).document;
 assert.equal(C.scoreParts(solo).length,1);
 assert.throws(()=>Tools.run(solo,'removePart',{part:1}),/最後のパート/);
 const busy=Tools.run(score,'insertNotes',{measure:1,notes:[{step:'C',octave:5,den:4}]}).document;
 assert.match(Tools.confirmText(busy,'insertNotes',{measure:1,overwrite:true,notes:[{step:'D',octave:5,den:4}]}),/置き換えます/);
 assert.equal(Tools.confirmText(busy,'insertNotes',{measure:1,notes:[{step:'D',octave:5,den:4}]}),null);
});

test('MusicXML export names the title and does not replace the document',()=>{
 const score=Tools.run(C.createScore(),'setMetadata',{title:'ファンファーレ'}).document;
 const exported=Tools.run(score,'exportMusicXML',{});
 assert.equal(exported.document,undefined);
 assert.match(exported.filename,/ファンファーレ\.musicxml/);
 assert.match(exported.xml,/ファンファーレ/);
 assert.match(exported.summary,/文字/);
});

test('a real template with existing notes asks before replacing',()=>{
 const score=Tools.run(C.createScore(),'insertNotes',{measure:1,notes:[{step:'G',octave:4,den:4}]}).document;
 assert.match(Tools.confirmText(score,'applyEnsembleTemplate',{id:'wind',replace:true}),/音符は残しません/);
 assert.equal(Tools.confirmText(C.createScore(),'applyEnsembleTemplate',{id:'wind',replace:true}),null);
});
