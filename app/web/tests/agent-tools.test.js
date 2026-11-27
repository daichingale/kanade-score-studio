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

test('writePhrase parses compact notation and writes across measures',()=>{
 const score={...C.createScore(),instrument:'トランペット',instrumentKey:'trumpet'};
 const before=freeze(score);
 const out=Tools.run(score,'writePhrase',{part:'trumpet',measure:1,phrase:'G4 q G4 q C5 h | D5 q C5 q G4 h'});
 assert.equal(freeze(score),before);
 const part=out.document;
 assert.notEqual(freeze(part),before);
 const line=notes(part);
 assert.ok(line.length>=6);
 assert.equal(part.measures.length,2);
});

test('writePhrase returns a helpful error for unknown tokens',()=>{
 const score=C.createScore();
 assert.throws(()=>Tools.run(score,'writePhrase',{phrase:'X9 z'}),/読めません/);
});

test('insertNotes accepts accidental-in-step and ignores null ties',()=>{
 const score=C.createScore();
 const out=Tools.run(score,'insertNotes',{measure:1,notes:[
  {step:'Eb',octave:4,den:8,alter:0,dots:0,tie:null},
  {step:'F#',octave:4,den:8,tie:null},
  {step:'Bb',octave:4,den:4}
 ]});
 const pitches=notes(out.document).map(event=>event.pitches[0]);
 assert.equal(pitches[0].step,'E');
 assert.equal(pitches[0].alter,-1);
 assert.equal(pitches[1].step,'F');
 assert.equal(pitches[1].alter,1);
 assert.equal(pitches[2].step,'B');
 assert.equal(pitches[2].alter,-1);
});

test('inspireSpark writes a motif and can confirm overwrite',()=>{
 const score=C.createScore();
 const preview=Tools.run(score,'inspireSpark',{mood:'ballad',seed:7,bars:2,apply:false});
 assert.match(preview.summary,/ムード/);
 assert.equal(preview.document,undefined);
 const written=Tools.run(score,'inspireSpark',{mood:'ballad',part:1,measure:1,bars:2,seed:7,apply:true});
 assert.ok(written.document);
 assert.ok(C.scoreParts(written.document)[0].measures.some(bar=>bar.events.some(event=>event.type==='note')));
 const again=Tools.confirmText(written.document,'inspireSpark',{mood:'ballad',part:1,measure:1,bars:2,seed:8,apply:true});
 assert.match(again,/置き換えます/);
});

test('inspireSpark falls back to writePhrase when Spark global is missing',()=>{
 const held=globalThis.KanadeInspirationSpark;
 const sparkPath=require.resolve('../src/inspiration-spark.js');
 const cached=require.cache[sparkPath];
 delete require.cache[sparkPath];
 globalThis.KanadeInspirationSpark=null;
 const Module=require('module');
 const original=Module._load;
 Module._load=function(request,parent,isMain){
  if(String(request).includes('inspiration-spark'))return null;
  return original.apply(this,arguments);
 };
 try{
  const score=C.createScore();
  const out=Tools.run(score,'inspireSpark',{mood:'ballad',bars:8,measure:1,apply:true});
  assert.ok(out.document);
  assert.match(out.summary,/内蔵フレーズ|小節/);
  const part=C.scoreParts(out.document)[0];
  assert.ok(part.measures.length>=8);
  assert.equal(part.measures.slice(0,8).filter(bar=>bar.events.some(event=>event.type==='note')).length,8);
 }finally{
  Module._load=original;
  if(cached)require.cache[sparkPath]=cached;
  else delete require.cache[sparkPath];
  globalThis.KanadeInspirationSpark=held;
 }
});

test('writePhrase overwrite replaces existing notes and asks for confirmation',()=>{
 let score={...C.createScore(),instrument:'トランペット',instrumentKey:'trumpet'};
 score=Tools.run(score,'writePhrase',{part:'trumpet',measure:1,phrase:'G4 q G4 q C5 h'}).document;
 const before=notes(score).map(event=>event.pitches[0].step).join('');
 assert.match(Tools.confirmText(score,'writePhrase',{part:'trumpet',measure:1,phrase:'C5 q D5 q E5 h',overwrite:true}),/トランペットの1〜1小節目の音符を置き換えます/);
 assert.match(Tools.confirmText(score,'writePhrase',{part:'trumpet',measure:1,phrase:'C5 q D5 q E5 h'}),/置き換えます/);
 const replaced=Tools.run(score,'writePhrase',{part:'trumpet',measure:1,phrase:'C5 q D5 q E5 h',overwrite:true}).document;
 const after=notes(replaced).map(event=>event.pitches[0].step).join('');
 assert.notEqual(after,before);
 assert.match(after,/CDE/);
 assert.equal(Tools.confirmText(C.createScore(),'writePhrase',{phrase:'G4 q'}),null);
});

test('writePhrase without overwrite still plans a confirm when notes already exist',()=>{
 let score={...C.createScore(),instrument:'トランペット',instrumentKey:'trumpet'};
 score=Tools.run(score,'writePhrase',{measure:1,phrase:'G4 q'}).document;
 const text=Tools.confirmText(score,'writePhrase',{measure:1,phrase:'A4 q'});
 assert.match(text,/置き換えます/);
 const next=Tools.run(score,'writePhrase',{measure:1,phrase:'A4 q'}).document;
 assert.equal(notes(next)[0].pitches[0].step,'A');
});

test('writePhrase pads every part when extending the score',()=>{
 let score=Tools.run(C.createScore(),'addParts',{keys:['trumpet','clarinet']}).document;
 assert.equal(C.scoreParts(score).every(part=>part.measures.length===1),true);
 const out=Tools.run(score,'writePhrase',{part:'trumpet',measure:1,phrase:'G4 q G4 q C5 h | G4 q G4 q G4 h | C5 q E5 q G5 h | G4 q E5 q C5 w'});
 const parts=C.scoreParts(out.document);
 assert.equal(parts.length,3);
 assert.equal(parts.every(part=>part.measures.length===parts[0].measures.length),true);
 assert.ok(parts[0].measures.length>=4);
});

test('writePhrase overwrite is one undoable AI apply through the host',()=>{
 const Agent=require('../src/agent');
 let doc={...C.createScore(),instrument:'トランペット',instrumentKey:'trumpet'};
 doc=Tools.run(doc,'writePhrase',{measure:1,phrase:'G4 q G4 q C5 h'}).document;
 const original=JSON.stringify(doc);
 const history=[];
 const host={
  getDocument:()=>doc,
  apply(next){history.push(JSON.stringify(doc));doc=next;},
  undoAi(count){
   for(let i=0;i<count;i++){const snap=history.pop();if(!snap)throw new Error('なし');doc=JSON.parse(snap);}
  }
 };
 Agent.attach(host);
 try{Agent.api.call('writePhrase',{measure:1,phrase:'A4 q'},{});assert.fail('expected confirm');}
 catch(error){assert.match(error.message,/確認/);assert.match(error.confirmation.summary,/置き換えます/);}
 const result=Agent.api.call('writePhrase',{measure:1,phrase:'C5 q D5 q E5 h',overwrite:true},{confirmed:true});
 assert.equal(result.wrote,1);
 assert.equal(notes(doc)[0].pitches[0].step,'C');
 assert.equal(history.length,1);
 Agent.api.undo(1);
 assert.equal(JSON.stringify(doc),original);
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
