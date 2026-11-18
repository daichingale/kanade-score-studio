const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../src/performance.js'),C=require('../src/core.js'),R=require('../src/renderer.js');

test('chord spelling follows chord degrees and slash bass is placed below the voicing',()=>{
  const pitches=P.chordPitches('C♯maj7',4);
  assert.deepEqual(pitches.map(({step,alter})=>[step,alter]),[['C',1],['E',1],['G',1],['B',1]]);
  assert.deepEqual(P.chordPitches('D/F♯',4).map(C.pitchMidi),[54,62,69]);
  assert.deepEqual(P.chordPitches('B♭m7',4).map(C.pitchMidi),[70,73,77,80]);
  assert.throws(()=>P.chordPitches('C13oops',4),/コード名/);
  assert.equal(P.fromMidi(70,-2).step,'B');
  for(let pitch=12;pitch<=119;pitch++)assert.equal(C.pitchMidi(P.fromMidi(pitch)),pitch);
});
test('real-time capture groups attacks into chords and follows release times on a straight grid',()=>{
  assert.deepEqual(P.midiNote([0x94,60,100]),{channel:4,pitch:60,down:true});
  assert.deepEqual(P.midiNote([0x94,60,0]),{channel:4,pitch:60,down:false});
  assert.equal(P.midiNote([0xB4,64,127]),null);
  const groups=P.quantize([{pitch:60,on:10,off:290},{pitch:64,on:39,off:300},{pitch:67,on:490}],{beatMs:500,grid:240,elapsed:900});
  assert.deepEqual(groups,[{start:0,end:480,midis:[60,64]},{start:960,end:1680,midis:[67]}]);
  const {score}=P.writeTake(C.createScore(),0,groups);
  assert.deepEqual(C.eventSpans(score,0,false).map(({event,start,end})=>[event.type,start,end]),
    [['note',0,480],['rest',480,960],['note',960,1680]]);
});
test('a held MIDI note ties across the barline, transposes, and leaves input intact on a collision',()=>{
  const base=C.createScore(),position=3600;
  const groups=[{start:0,end:960,midis:[60]}];
  const {score}=P.writeTake(base,position,groups,{offset:-2});
  assert.equal(score.measures.length,2);
  assert.equal(C.pitchMidi(score.measures[1].events[0].pitches[0]),62);
  assert.equal(C.tieFlags(score,0,score.measures[0].events.length-1).start,true);
  assert.equal(C.tieFlags(score,1,0).stop,true);
  assert.throws(()=>P.writeTake(base,position,groups,{limitMeasure:0}),/小節内/);
  assert.throws(()=>P.writeTake(score,position,groups),/他の音符と重なる/);
  assert.equal(base.measures[0].events.length,0);
});
test('a chord symbol survives score validation and is rendered over its measure',()=>{
  const score=C.changeDirections(C.createScore(),0,()=>[{key:'chordSymbol',tick:0,text:'D/F♯'}]);
  assert.deepEqual(C.validateScore(JSON.parse(JSON.stringify(score))),[]);
  assert.match(R.render(score,null),/data-direction="chordSymbol"[^\n]*>D\/F♯<\/text>/);
});
