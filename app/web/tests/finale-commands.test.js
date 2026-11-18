const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),Ex=require('../src/musicxml.js');
function fixture(){
 const event=C.makeNote({step:'C',octave:4,alter:1},2);
 event.pitches=C.normalizeChord([...event.pitches,C.normalPitch({step:'E',octave:4,alter:-1})]);
 event.lyric='うた';event.stemDirection='down';
 return {event,score:C.insertEvent(C.createScore(),0,0,event).score};
}
test('R switches a chord to a rest and restores pitches, lyric and stem without shifting later beats',()=>{
 const {event,score}=fixture();
 const after=C.insertEvent(score,0,1,C.makeNote({step:'G',octave:4,alter:0},4)).score;
 const rests=C.toggleNoteRest(after,event.id);
 assert.equal(rests.measures[0].events[0].type,'rest');
 assert.deepEqual(C.eventSpans(rests,0).map(s=>s.start),C.eventSpans(after,0).map(s=>s.start));
 assert.deepEqual(C.toggleNoteRest(rests,event.id),after);
 assert.equal(score.measures[0].events[0].type,'note');
});
test('rest converted to note keeps its edited duration and identity',()=>{
 const {event,score}=fixture();
 const rest=C.toggleNoteRest(score,event.id);
 const shorter=C.changeDuration(rest,event.id,4,0);
 const note=C.toggleNoteRest(shorter,event.id).measures[0].events[0];
 assert.equal(note.den,4);assert.equal(note.id,event.id);assert.deepEqual(note.pitches,event.pitches);
 const plain=C.makeRest(4);const s=C.insertEvent(C.createScore(),0,0,plain).score;
 assert.equal(C.toggleNoteRest(s,plain.id,{step:'D',octave:5,alter:0}).measures[0].events[0].pitches[0].octave,5);
});
test('chromatic movement changes every chord pitch by exactly one semitone',()=>{
 const {event,score}=fixture();
 const raised=C.changeSemitone(score,event.id,1),lowered=C.changeSemitone(raised,event.id,-1);
 assert.deepEqual(raised.measures[0].events[0].pitches.map(C.pitchMidi),event.pitches.map(p=>C.pitchMidi(p)+1));
 assert.deepEqual(lowered,score);
 let s=score;for(let i=0;i<12;i++)s=C.changeSemitone(s,event.id,1);
 assert.deepEqual(s.measures[0].events[0].pitches.map(C.pitchMidi),event.pitches.map(p=>C.pitchMidi(p)+12));
 assert.deepEqual(C.validateScore(s),[]);
});
test('manual stem survives JSON round trip and is exported for chord notes',()=>{
 const {score}=fixture();
 assert.deepEqual(C.validateScore(JSON.parse(JSON.stringify(score))),[]);
 const xml=Ex.musicXML(score);assert.equal((xml.match(/<stem>down<\/stem>/g)||[]).length,2);
 score.measures[0].events[0].stemDirection='invalid';assert.ok(C.validateScore(score).length);
});
