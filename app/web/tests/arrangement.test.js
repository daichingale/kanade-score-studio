const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),A=require('../src/arrangement.js'),R=require('../src/renderer.js'),X=require('../src/musicxml.js'),S=require('../src/sync.js');
function part(notes){
  const score=C.createScore();
  return {...score,measures:notes.map(step=>({id:C.uid(),events:[C.makeNote({step,alter:0,octave:4},1)]}))};
}
const melody=part=>part.measures.map(bar=>bar.events[0]?.pitches[0]?.step);
test('ordered multi-selection inserts copies across every track with new IDs',()=>{
  const top=part(['C','D','E','F']),bass=part(['A','B','C','D']),score={...top,ensembleParts:[bass]};
  const clip=A.capture(score,[2,0],'断片');
  const stored={...score,clipBank:[clip]};
  assert.deepEqual(C.validateScore(stored),[]);
  const synced=S.merge(score,S.diff(score,stored)).score;
  const scoreOut=A.insert(synced,clip,1,2);
  assert.deepEqual(melody(scoreOut),['C','E','C','E','C','D','E','F']);
  assert.deepEqual(melody(scoreOut.ensembleParts[0]),['A','C','A','C','A','B','C','D']);
  assert.equal(new Set(scoreOut.measures.map(bar=>bar.id)).size,8);
  assert.equal(scoreOut.clipBank[0].id,clip.id);
  assert.equal(C.replaceScorePart(scoreOut,1,scoreOut.ensembleParts[0]).clipBank,scoreOut.clipBank);
});
test('moving a range keeps its meter, second voice, and internal slur intact',()=>{
  const score=part(['C','D','E','F']);
  score.measures[1].voice2=[C.makeNote({step:'C',octave:3,alter:0},4)];
  score.measures[1].time={num:5,den:4};
  score.measures[1].directions=[{key:'slur',tick:0,end:0,endMeasure:score.measures[2].id}];
  const {document:moved}=A.move(score,1,2,0);
  assert.deepEqual(melody(moved),['D','E','C','F']);
  assert.deepEqual(C.timeAt(moved,0),{num:5,den:4});
  assert.equal(moved.measures[0].voice2.length,1);
  assert.equal(moved.measures[0].directions[0].endMeasure,moved.measures[1].id);
  const copy=A.insert(moved,A.capture(moved,[0,1],'phrase'),4);
  assert.equal(copy.measures[4].directions[0].endMeasure,copy.measures[5].id);
  assert.equal(score.measures[0].events[0].pitches[0].step,'C');
});
test('repeat endings are engraved, exported, played in alternate order, and safely split',()=>{
  const score=part(['C','D','E','F','G']);
  const marked=A.markRepeat(score,2,2,{alternate:true,from:0,secondCount:1});
  assert.deepEqual(melody(A.playback([marked])[0]),['C','D','E','C','D','F','G']);
  const svg=R.render(marked,null),xml=X.musicXML(marked);
  assert.match(svg,/data-repeat="start"/);assert.match(svg,/data-volta="2"/);
  assert.match(xml,/<ending number="1" type="start"\/>/);
  assert.match(xml,/<repeat direction="backward"\/>/);
  assert.match(xml,/<ending number="2" type="stop"\/>/);
  const copied=A.insert(marked,A.capture(marked,[0,1,2,3],'repeat'),5);
  assert.equal(A.repeatSections(copied).length,2);
  const slice=A.capture(marked,[1,2,3],'partial').parts[0];
  assert.equal(slice.measures.some(bar=>bar.repeatStart||bar.repeatEnd||bar.volta),false);
  const cleared=A.clearRepeat(marked,3,3);
  assert.equal(A.repeatSections(cleared).length,0);
  assert.deepEqual(melody(A.playback([cleared])[0]),melody(score));
});

test('session slots match the roster, repeat shorter clips and insert a mixed phrase',()=>{
 const model=C.createScore(),note=(step,octave)=>C.makeNote({step,octave,alter:0},4);
 model.measures=Array.from({length:3},()=>({id:C.uid(),events:[]}));
 model.measures[0].events=[note('C',4)];
 const bass={...C.createScore(),instrument:'Trombone',measures:Array.from({length:3},()=>({id:C.uid(),events:[]}))};
 bass.measures[1].events=[note('E',3)];bass.measures[2].events=[note('G',3)];
 model.ensembleParts=[bass];
 const intro=A.capture(model,[0],'Intro');
 const chorus=A.capture(model,[1,2],'Chorus');
 const [one,empty]=A.sessionTracks(model,intro),[silence,two]=A.sessionTracks(model,chorus);
 assert.equal(empty,null);assert.equal(silence,null);
 const clip=A.sessionMix(model,[{part:one,loop:true},{part:two,loop:false}]);
 const inserted=A.insert(model,clip,3);
 assert.deepEqual(inserted.measures.slice(3).map(bar=>bar.events[0].pitches[0].step),['C','C']);
 assert.deepEqual(inserted.ensembleParts[0].measures.slice(3).map(bar=>bar.events[0].pitches[0].step),['E','G']);
 assert.equal(C.validateScore(inserted).length,0);
});

test('empty scenes and independently edited clips survive validation, copying, and placement',()=>{
 const top=part(['C','D']),bass=part(['E','F']);
 const empty={id:C.uid(),name:'Blank',parts:[]};
 const document={...top,ensembleParts:[bass],clipBank:[empty]};
 assert.deepEqual(C.validateScore(document),[]);
 const melodic=A.capture(document,[0],'first').parts[0];
 const stored=A.sceneSlot(document,empty,0,melodic);
 const extended=A.capture(document,[0,1],'second').parts[1];
 const mix=A.sceneSlot(document,stored,1,A.copyScenePart(extended,bass));
 const updated={...document,clipBank:[mix]};
 assert.deepEqual(C.validateScore(updated),[]);
 assert.deepEqual(A.sceneParts(updated,mix).map(track=>track.measures.length),[1,2]);
 const placed=A.insert(updated,A.sceneForTimeline(updated,mix),2);
 assert.deepEqual(melody(placed),['C','D','C',undefined]);
 assert.deepEqual(melody(placed.ensembleParts[0]),['E','F','E','F']);
});

test('fit mode keeps note lengths, inserts overflow and keeps destination bars intact',()=>{
 const score=part(['C','D','E']);
 score.measures[1]={...score.measures[1],time:{num:3,den:4},events:[C.makeNote({step:'D',octave:4,alter:0},2,1)]};
 score.measures[2]={...score.measures[2],time:{num:3,den:4},events:[]};
 const clip=A.capture(score,[0],'full');
 assert.equal(A.differentMeters(score,clip,1,1),true);
 const fitted=A.fitMeters(score,clip,1,1);
 const next=A.insert(score,fitted,1);
 assert.deepEqual(next.measures.map((_,i)=>C.timeAt(next,i).num),[4,3,3,3,3]);
 assert.equal(C.usedTicks(next.measures[1]),3*C.TPQ);
 assert.equal(C.usedTicks(next.measures[2]),C.TPQ);
 assert.equal(C.tieFlags(next,1,0).start,true);
 assert.equal(next.measures[3].id,score.measures[1].id);
});

test('edits in the session refresh multiple placements, but direct edits detach only one',()=>{
 const tune=part(['C','F']);
 const scene=A.capture(tune,[0],'Verse');
 const project={...tune,clipBank:[scene]};
 const once=A.linkScene(project,scene,1,1);
 const twice=A.linkScene(once,scene,3,1);
 const note=C.makeNote({step:'G',octave:4,alter:0},1);
 const updated=A.sceneSlot(twice,scene,0,{...scene.parts[0],measures:[{...scene.parts[0].measures[0],events:[note]}]});
 const linked=A.reconcileLinks(twice,A.updateScenes(twice,[updated]));
 assert.deepEqual(melody(linked),['C','G','F','G']);
 assert.equal(linked.sceneLinks.length,2);
 assert.equal(linked.measures[1].id,twice.measures[1].id);
 const local=C.changeEvent(linked,linked.measures[1].events[0].id,event=>({...event,pitches:[{...event.pitches[0],step:'B'}]}));
 const detached=A.reconcileLinks(linked,local);
 assert.equal(detached.sceneLinks.length,1);
 assert.deepEqual(melody(detached),['C','B','F','G']);
 const restored=S.merge(twice,S.diff(twice,linked)).score;
 assert.deepEqual(melody(restored),melody(linked));
 assert.equal(restored.sceneLinks.length,2);
});
