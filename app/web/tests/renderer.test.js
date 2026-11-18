const test=require('node:test'); const assert=require('node:assert/strict');
const C=require('../src/core.js'); const R=require('../src/renderer.js');
test('SVG is well-formed enough to include staff, notes and data-id',()=>{
 const s=C.createScore();const n=C.makeNote({step:'C',alter:0,octave:4});
 const score=C.insertEvent(s,0,0,n).score;
 const svg=R.render(score,{eventId:n.id});
 assert.match(svg,/viewBox=/); assert.match(svg,/class="music-glyph notehead"/);assert.match(svg,/data-event-id=/);
});
test('score title is escaped, no svg script injection',()=>{
 const s=C.createScore();s.title='<script>alert(1)</script>';
 const svg=R.render(s,null); assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));
});
test('bass clef G2 is on bottom line',()=>{
 const p={step:'G',alter:0,octave:2};
 assert.equal(R.diatonicY(p,100,'bass'),148);
});
test('whole and half noteheads start on the bar grid and keep their full duration',()=>{
 const empty=C.createScore();
 const geometry=R.measureGeometry(empty,0),start=geometry.notesStart;
 const make=den=>C.makeNote({step:'C',alter:0,octave:4},den);
 const whole=C.insertEvent(empty,0,0,make(1)).score;
 const wholeSvg=R.render(whole,null);
 const wholeHead=Number(wholeSvg.match(/class="music-glyph notehead" x="([\d.]+)"/)[1]);
 assert.equal(wholeHead,start);
 const halfThenQuarter=C.insertEvent(empty,0,0,make(2)).score;
 const quarter=C.makeNote({step:'D',alter:0,octave:4},4);
 const sequence=C.insertEvent(halfThenQuarter,0,1,quarter).score;
 const svg=R.render(sequence,null);
 const heads=[...svg.matchAll(/class="music-glyph notehead" x="([\d.]+)"/g)].map(m=>Number(m[1]));
 assert.equal(heads[0],start);
 assert.equal(heads[1],start+geometry.usable/2);
});
test('clef origin is on G4 or F3 and noteheads use their pitch without a baseline offset',()=>{
 const score=C.insertEvent(C.createScore(),0,0,C.makeNote({step:'G',alter:0,octave:4},4)).score;
 const svg=R.render(score,null);
 assert.match(svg, /class="music-glyph music-glyph-treble" x="116" data-origin-y="218"/);
 assert.match(svg, /class="music-glyph notehead" x="268" data-origin-y="218"/);
 assert.match(svg, /scale\(0.048 -0.048\)/);
 score.clef='bass';
 assert.match(R.render(score,null), /class="music-glyph music-glyph-bass" x="116" data-origin-y="194"/);
});
test('hover natural cancels a sharp earlier in the measure and matches the placed accidental',()=>{
 const first=C.makeNote({step:'C',octave:4,alter:1},4);
 const score=C.insertEvent(C.createScore(),0,0,first).score;
 const g=R.measureGeometry(score,0);
 const hit=R.hitTest(score,g.notesStart+g.usable/4,g.top+60,4,0);
 const ghost=R.ghostMarkup(score,hit,4,0,'note','0');
 const next=C.placeEventAt(score,0,hit.tick,C.makeNote({step:'C',octave:4,alter:0},4)).score;
 const accidentalPath=s=>[...s.matchAll(/class="music-glyph accidental"[^>]*><use href="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(accidentalPath(ghost).length,1);
 assert.equal(accidentalPath(ghost)[0],accidentalPath(R.render(next,null))[1]);
 assert.equal(accidentalPath(R.ghostMarkup(C.createScore(),hit,4,0,'note','1')).length,1);
});

test('phone layout gives each bar its own row and keeps hit testing aligned',()=>{
 const score=C.addMeasure(C.createScore());
 const first=R.measureGeometry(score,0,R.MOBILE),second=R.measureGeometry(score,1,R.MOBILE);
 assert.equal(first.notesStart,second.notesStart);
 assert.ok(second.top>first.top);
 const hit=R.hitTest(score,second.notesStart+second.usable/4,second.top+48,4,0,null,R.MOBILE);
 assert.equal(hit.mi,1);
 assert.equal(hit.tick,C.TPQ);
 assert.match(R.render(score,null,R.MOBILE),/viewBox="0 0 560 /);
});

test('articulations survive note-to-rest conversion and export to SVG and MusicXML',()=>{
 const Ex=require('../src/musicxml.js');
 const note=C.makeNote({step:'G',alter:0,octave:4},4);
 let score=C.insertEvent(C.createScore(),0,0,note).score;
 score=C.changeEvent(score,note.id,event=>({...event,articulations:['accent','marcato']}));
 const restored=C.toggleNoteRest(C.toggleNoteRest(score,note.id),note.id);
 assert.match(R.render(restored,null,R.MOBILE),/data-articulation="accent"/);
 assert.match(Ex.musicXML(restored),/<articulations><accent \/><strong-accent \/><\/articulations>/);
 assert.throws(()=>C.changeEvent(score,note.id,event=>({...event,articulations:['invalid']})),/奏法記号/);
});

test('single-measure editor renders only the selected staff and keeps original bar coordinates',()=>{
 const score=C.addMeasure(C.addMeasure(C.createScore()));
 const geometry=R.measureGeometry(score,1,R.MOBILE);
 const markup=R.render(score,{caret:{mi:1,index:0}},R.MOBILE,1);
 assert.deepEqual([...markup.matchAll(/data-render-measure="(\d+)"/g)].map(match=>match[1]),['1']);
 assert.equal([...markup.matchAll(/class="staff-line"/g)].length,5);
 assert.match(markup,/aria-label="2小節目"/);
 assert.equal(R.hitTest(score,geometry.notesStart,geometry.top+24,4,0,null,R.MOBILE).mi,1);
 assert.equal([...R.render(score,null).matchAll(/data-render-measure=/g)].length,3);
});

test('engraving reflows sparse and dense bars and avoids a lone stretched ending',()=>{
 let score=C.createScore();
 for(let i=1;i<9;i++)score=C.addMeasure(score);
 const sparse=R.engravingLayout([score]);
 assert.ok(sparse.every(system=>system.measures.length>=2));
 for(let i=0;i<16;i++){
  const note=C.makeNote({step:i%2?'D':'C',alter:i%2?0:1,octave:4},16);
  score=C.insertEvent(score,1,i,note).score;
 }
 const systems=R.engravingLayout([score]);
 const dense=systems.flatMap(row=>row.measures).find(bar=>bar.mi===1);
 const sparseBar=systems.flatMap(row=>row.measures).find(bar=>bar.mi===0);
 assert.ok(dense.x1-dense.x0>sparseBar.x1-sparseBar.x0);
 assert.equal(systems.flatMap(row=>row.measures).length,9);
 const single=R.engravingLayout([C.createScore()])[0].measures[0];
 assert.ok(single.x1-single.x0<300);
});

test('engraving aligns shared ticks across parts with different rhythms and paginates the score',()=>{
 let a=C.createScore(),b=C.withSettings(C.createScore(),{clef:'bass'});
 a=C.insertEvent(a,0,0,C.makeNote({step:'C',alter:0,octave:5},2)).score;
 b=C.insertEvent(b,0,0,C.makeNote({step:'F',alter:0,octave:3},4)).score;
 b=C.insertEvent(b,0,1,C.makeNote({step:'G',alter:0,octave:3},4)).score;
 a=C.insertEvent(a,0,1,C.makeNote({step:'D',alter:0,octave:5},2)).score;
 b=C.insertEvent(b,0,2,C.makeNote({step:'A',alter:0,octave:3},2)).score;
 const markup=R.engrave([a,b])[0];
 const heads=[...markup.matchAll(/class="music-glyph notehead" x="([\d.]+)"/g)].map(match=>Number(match[1]));
 assert.equal(heads[0],heads[2]);assert.equal(heads[1],heads[4]);
 assert.ok(heads[0]<heads[3]&&heads[3]<heads[1]);
 for(let i=1;i<30;i++){a=C.addMeasure(a);b=C.addMeasure(b);}
 assert.ok(R.engrave([a,b],{paginate:true}).length>1);
});

test('directions are independent of notes, escape custom text and keep rhythm in exports',()=>{
 const Ex=require('../src/musicxml.js');
 const empty=C.createScore();
 const score=C.changeDirections(empty,0,()=>[
  {key:'ff',tick:0},{key:'速度:rit.',tick:C.TPQ},{key:'crescendo',tick:C.TPQ,end:C.TPQ*3},
  {key:'custom',tick:0,text:'sotto < &'}
 ]);
 assert.equal(score.measures[0].events.length,0);
 assert.equal(empty.measures[0].directions,undefined);
 const svg=R.engrave([score])[0],xml=Ex.musicXML(score);
 assert.match(svg,/data-direction="ff"/);
 assert.match(svg,/data-direction="crescendo"[^>]*><path/);
 assert.match(svg,/sotto &lt; &amp;/);
 assert.match(xml,/<dynamics><ff\/><\/dynamics>/);
 assert.match(xml,/<words>rit.<\/words><\/direction-type><offset>960<\/offset>/);
 assert.match(xml,/<wedge type="stop" number="1"\/><\/direction-type><offset>2880<\/offset>/);
 assert.throws(()=>C.changeDirections(score,0,()=>[{key:'ff',tick:3840}]),/指示記号/);
});

test('expanded note marks retain MusicXML categories and Bravura outlines',()=>{
 const Ex=require('../src/musicxml.js');
 const note=C.makeNote({step:'G',alter:0,octave:4});
 const score=C.insertEvent(C.createScore(),0,0,{...note,articulations:['fermata','trill','up-bow','tremolo-2']}).score;
 assert.match(R.render(score,null),/data-articulation="trill"/);
 const xml=Ex.musicXML(score);
 assert.match(xml,/<fermata>normal<\/fermata>/);
 assert.match(xml,/<ornaments><trill-mark \/><tremolo type="single">2<\/tremolo><\/ornaments>/);
 assert.match(xml,/<technical><up-bow \/><\/technical>/);
});

test('ensemble structure aligns inserted measures and exports a distinct MusicXML part per instrument',()=>{
 const Ex=require('../src/musicxml.js'),S=require('../src/sync.js');
 const a=C.createScore(),b={...C.createScore(),instrument:'B♭ Clarinet',transposition:'bb',key:2},
  c={...C.createScore(),instrument:'Snare',clef:'percussion',staffLines:1};
 const full={...a,ensembleParts:[b,c]};
 const fromB=C.addMeasure(b);
 const updated=C.replaceScorePart(full,1,fromB);
 assert.deepEqual(C.validateScore(updated),[]);
 assert.deepEqual(C.scoreParts(updated).map(part=>part.measures.length),[2,2,2]);
 const note=C.makeNote({step:'C',octave:4,alter:0});
 const left=C.replaceScorePart(updated,1,C.insertEvent(updated.ensembleParts[0],0,0,note).score);
 const right=C.replaceScorePart(updated,2,C.insertEvent(updated.ensembleParts[1],0,0,note).score);
 const merged=S.mergeRoom(left,S.diff(updated,right)).score;
 assert.deepEqual(C.scoreParts(merged).map(part=>part.measures[0].events.length),[0,1,1]);
 const xml=Ex.musicXMLScore(C.scoreParts(merged));
 assert.equal([...xml.matchAll(/<score-part id=/g)].length,3);
 assert.match(xml,/<part id="P2">/);
 assert.match(xml,/<chromatic>-2<\/chromatic>/);
 assert.match(xml,/id="P3-I1"/);
 assert.match(R.engrave(C.scoreParts(merged))[0],/data-engraved-part="2"/);
});

test('publication metadata survives ensemble edits and sync while print names stay part-specific',()=>{
 const S=require('../src/sync.js');
 const first={...C.createScore(),instrument:'フルート'},second={...C.createScore(),instrument:'アルト・サクソフォン',printName:'Alto Saxophone',shortName:'A. Sax.'};
 const score={...first,ensembleParts:[second]};
 const publication={subtitle:'Concert Suite',comment:'演奏の手引き',width:90};
 const result=S.mergeRoom(score,S.diff(score,{...score,publication}));
 assert.deepEqual(result.conflicts,[]);
 const edited=C.replaceScorePart(result.score,1,C.addMeasure(second));
 assert.deepEqual(edited.publication,publication);
 assert.equal(C.scoreParts(edited)[0].publication,undefined);
 assert.equal(C.scoreParts(edited)[1].shortName,'A. Sax.');
 assert.deepEqual(C.validateScore(edited),[]);
 assert.notDeepEqual(C.validateScore({...edited,publication:{width:101}}),[]);
});

test('print layout reserves a left name column and builds optional front pages from the score',()=>{
 const first={...C.createScore(),title:'祝祭序曲',composer:'作曲者',instrument:'ピアノ'};
 const parts=[first,{...first,id:C.uid(),instrument:'アルト・サクソフォン'}];
 const edition={subtitle:'Festival Overture',comment:'コメント <test>'};
 const [cover,notes]=R.frontMatter(parts,edition);
 assert.match(cover,/FULL SCORE/);
 assert.match(cover,/Festival Overture/);
 assert.match(notes,/コメント &lt;test&gt;/);
 assert.match(notes,/アルト・サクソフォン/);
 assert.match(R.frontMatter(parts,{...edition,instrumentation:'手動の編成'})[1],/手動の編成/);
 assert.equal(R.frontMatter([first]).length,0);
 assert.equal(R.frontMatter(parts,{cover:'hide',notes:'hide'}).length,0);
 const [layout]=R.engravingLayout(parts);
 const [noNames]=R.engravingLayout(parts,{names:'hide'});
 const [narrow]=R.engravingLayout(parts,{width:70});
 assert.ok(layout.staffX>noNames.staffX);
 assert.ok(narrow.staffX>layout.staffX);
 const [score]=R.engrave(parts,{edition,paginate:true,pageOffset:2});
 assert.match(score,/text-anchor="end"[^>]*>アルト・サクソフォン<\/text>/);
 assert.match(score,/>3<\/text>/);
});

test('total-score editor exposes valid rhythmic hit slots without adding them to print pages',()=>{
 const flute={...C.createScore(),instrument:'フルート'};
 flute.measures[0].events.push(C.makeNote({step:'G',octave:4,alter:0},8));
 const horn={...C.createScore(),instrument:'F ホルン',transposition:'f'};
 const parts=[flute,horn];
 const [system]=R.engravingLayout(parts);
 assert.equal(system.sections.length,2);
 const [interactive]=R.engrave(parts,{interactive:true});
 assert.match(interactive,/data-engraved-hit="0" data-slot="1"/);
 assert.doesNotMatch(interactive,/NaN|undefined/);
 assert.doesNotMatch(R.engrave(parts)[0],/data-engraved-hit/);
});

test('engraving increases interstaff clearance for ledger notes, stems and directions',()=>{
 const parts=Array.from({length:12},()=>C.createScore());
 const baseline=R.engravingLayout(parts)[0];
 assert.ok(baseline.staffTops[1]-baseline.staffTops[0]>=96);
 const upper=C.makeNote({step:'C',octave:2,alter:-1},8);
 upper.stemDirection='down';
 parts[0]=C.insertEvent(parts[0],0,0,upper).score;
 parts[0]=C.changeDirections(parts[0],0,()=>[{key:'ff',tick:0}]);
 const lower=C.makeNote({step:'A',octave:7,alter:1},8);
 lower.stemDirection='up';
 lower.articulations=['fermata'];
 parts[1]=C.insertEvent(parts[1],0,0,lower).score;
 const system=R.engravingLayout(parts)[0];
 const bottom=system.staffTops[0]+system.staffExtents[0].lower;
 const top=system.staffTops[1]+system.staffExtents[1].upper;
 assert.ok(top-bottom>=24);
 assert.ok(system.staffTops[1]-system.staffTops[0]>baseline.staffTops[1]-baseline.staffTops[0]);
 assert.match(R.engrave(parts,{interactive:true})[0],/data-engraved-hit/);
});

test('empty measures show one whole-measure rest even in 3/4, with an editable hit target',()=>{
 const score=C.withSettings(C.createScore(),{time:{num:3,den:4}});
 const svg=R.render(score,null);
 assert.match(svg,/class="music-glyph rest"[^>]*><use href="#kanade-score-58595"/);
 assert.match(svg,/data-implicit="1"[^>]*aria-label="全小節休符"/);
});

test('footer templates number front matter and score pages, and escape custom text',()=>{
 const score={...C.createScore(),title:'Suite <A>'};
 const edition={cover:'show',notes:'show',footerScope:'all',footerStyle:'custom',pageStart:4,
  copyright:'© A & B',footerText:'{copyright} · {title} · {page} / {pages}'};
 const pages=R.printPages([score],edition);
 assert.equal(pages.length,3);
 pages.forEach((page,index)=>assert.ok(page.includes('© A &amp; B · Suite &lt;A&gt; · '+(4+index)+' / 3')));
 assert.ok(R.printPages([score],{footerStyle:'none',copyright:'Hidden'})[0].includes('Hidden')===false);
 assert.doesNotMatch(R.render(score,null),/Finale-style input preview/);
});
