const test=require('node:test'),assert=require('node:assert/strict'),C=require('../src/core.js'),R=require('../src/renderer.js'),Ex=require('../src/musicxml.js'),S=require('../src/samples.js'),fs=require('node:fs'),path=require('node:path');
test('clef anchors and pitch coordinates agree in alto, tenor and neutral single-line notation',()=>{
 for(const [clef,pitch,y]of [['alto',{step:'C',octave:4},24],['tenor',{step:'C',octave:4},12],['bass',{step:'F',octave:3},12],['treble',{step:'G',octave:4},36]])assert.equal(R.diatonicY(pitch,0,clef),y);
 for(const step of C.STEPS)assert.equal(R.diatonicY({step,octave:4},0,'percussion',1),24);
 const score=C.withSettings(C.createScore(),{clef:'percussion',staffLines:1}),svg=R.render(score,null);assert.equal((svg.match(/class="staff-line"/g)||[]).length,1);assert.match(svg,/music-glyph-percussion/);
 const g=R.measureGeometry(score,0),hit=R.hitTest(score,g.notesStart,g.top+24,4,0,{step:'F',octave:4});assert.equal(hit.step,'F');assert.equal(hit.y,g.top+24);
});
test('all five staff layouts hit-test inverses of rendered pitched note positions',()=>{
 for(const clef of ['treble','bass','alto','tenor'])for(let staffLines=1;staffLines<=5;staffLines++){
 const score=C.withSettings(C.createScore(),{clef,staffLines}),g=R.measureGeometry(score,0),pitch={step:'C',octave:4};
 const y=R.diatonicY(pitch,g.top,clef,staffLines),hit=R.hitTest(score,g.notesStart,y);assert.equal(hit.step,pitch.step);assert.equal(hit.octave,pitch.octave);
 assert.equal((R.render(score,null).match(/class="staff-line"/g)||[]).length,staffLines);
 }
});
test('sound selection and written-to-sounding transposition preserve all note data and legacy scores',()=>{
 const old=C.createScore();old.measures[0].events=[C.makeNote({step:'C',octave:4,alter:0})];
 assert.deepEqual(C.validateScore(old),[]);assert.equal(C.soundName(old),'ピアノ');assert.equal(C.soundingOffset(old),0);
 for(const [transposition,offset]of [['bb',-2],['a',-3],['f',-7],['eb',-9],['bbBass',-14],['ebBass',-21],['octaveDown',-12],['octaveUp',12]]){
 const next=C.withSettings(old,{sound:'フルート',transposition});assert.equal(next.measures,old.measures);assert.equal(next.clef,'treble');assert.equal(next.instrument,'ピアノ');assert.equal(C.soundingOffset(next),offset);assert.equal(C.soundName(next),'フルート');
 }
 for(const patch of [{staffLines:0},{clef:'wrong'},{transposition:'wrong'},{notehead:'wrong'}])assert.throws(()=>C.withSettings(old,patch));
});
test('MusicXML includes C clef, staff lines, transposition, unpitched positions and independent MIDI timbre',()=>{
 let s=C.withSettings(C.createScore(),{clef:'tenor',sound:'クラリネット',transposition:'bb'});s.measures[0].events=[C.makeNote({step:'C',octave:4,alter:0})];let xml=Ex.musicXML(s);
 assert.match(xml,/<sign>C<\/sign><line>4<\/line>/);assert.match(xml,/<chromatic>-2<\/chromatic>/);assert.match(xml,/<midi-program>72<\/midi-program>/);
 s=C.withSettings(s,{clef:'percussion',staffLines:1,notehead:'cross',sound:'マーチング・シンバル'});xml=Ex.musicXML(s);assert.match(xml,/<sign>percussion<\/sign>/);assert.match(xml,/<staff-lines>1<\/staff-lines>/);assert.match(xml,/<unpitched><display-step>E<\/display-step><display-octave>4/);assert.match(xml,/<notehead>x<\/notehead>/);assert.doesNotMatch(xml,/<transpose>|<pitch>/);assert.match(xml,/<midi-unpitched>43/);
});
test('all sampled instrument options have local MP3 data and explicit attribution',()=>{
 const dir=path.join(__dirname,'../samples');
 for(const p of Object.values(S.presets)){
 const data=JSON.parse(fs.readFileSync(path.join(dir,p.file+'.json'),'utf8'));assert.ok(Object.keys(data.samples).length>=25);assert.match(data.sourceSHA256,/^[a-f0-9]{64}$/);assert.ok(Object.values(data.samples).every(s=>s.startsWith('data:audio/mp3;base64,')));
 }
 assert.ok(fs.readFileSync(path.join(dir,'ATTRIBUTION.md'),'utf8').includes('creativecommons.org/licenses/by/3.0/us/'));
});
