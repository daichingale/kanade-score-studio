const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core');
const Arrange=require('../src/agent-arrange');
const Tools=require('../src/agent-tools');

function pitched(part){return part.measures.flatMap(bar=>bar.events).filter(event=>event.type==='note').map(event=>event.pitches[0]);}
function inRange(part,level){return Arrange.checkPart(part,level).length===0;}

test('plans a 25-player school band without oboe or bassoon, and a marching band with mellophone',()=>{
 const school=Arrange.plan({headcount:25,missing:['オーボエ','ファゴット'],level:'初級'});
 assert.equal(school.keys.length,25);
 assert.equal(school.keys.includes('oboe'),false);
 assert.equal(school.keys.includes('bassoon'),false);
 assert.equal(school.keys.filter(key=>key==='clarinet').length>=4,true);
 assert.equal(school.keys.includes('trumpet'),true);
 assert.equal(school.keys.includes('tuba'),true);
 assert.match(school.summary,/オーボエ/);
 assert.match(school.summary,/ファゴット/);
 assert.match(school.summary,/初級/);
 const marching=Arrange.plan({headcount:18,style:'marching',level:'中級'});
 assert.equal(marching.keys.includes('mellophone'),true);
 assert.equal(marching.keys.includes('basses'),true);
 assert.equal(marching.keys.includes('horn'),false);
 assert.equal(marching.keys.includes('oboe'),false);
 const bright=Arrange.plan({style:'small bright',level:'上級'});
 assert.equal(bright.keys.length<=16,true);
 assert.match(bright.summary,/小編成|高音/);
});

test('fits written pitches to comfortable ranges and spells transposed notes',()=>{
 const fitted=Arrange.fitOctave(96,52,79);
 assert.equal(fitted.ok,true);
 assert.equal(fitted.midi%12,0);
 assert.equal(fitted.midi<=79,true);
 const clarinet=Arrange.rangeFor('clarinet','beginner');
 const written=Arrange.fitOctave(74,clarinet.low,clarinet.high);
 assert.equal(written.midi>=clarinet.low&&written.midi<=clarinet.high,true);
 assert.deepEqual(Arrange.parseChord('Dm7').slice(0,3),[2,5,9]);
});

test('distributes a four-bar melody inside every part range',()=>{
 let score=C.createScore();
 const quarters=[];
 for(let i=0;i<16;i++)quarters.push({step:'CDEFGABC'[i%8],octave:4+(i%8===7?1:0),den:4});
 score=Tools.run(score,'insertNotes',{measure:1,notes:quarters}).document;
 score=Tools.run(score,'addParts',{keys:['clarinet','trumpet','trombone','tuba','snare']}).document;
 const before=JSON.stringify(score);
 const arranged=Tools.run(score,'arrangeMelody',{melody:1,from:1,to:4,level:'初級',chords:['C','F','G','C']});
 assert.equal(JSON.stringify(score),before);
 const parts=C.scoreParts(arranged.document);
 assert.equal(parts.length,6);
 assert.equal(pitched(parts[1])[0].step,'D');
 assert.equal(pitched(parts[1])[0].octave,4);
 assert.equal(pitched(parts[2])[0].step,'D');
 for(const part of parts)assert.equal(inRange(part,'beginner'),true,part.instrument);
 assert.match(arranged.summary,/問題はありません/);
 assert.match(Tools.run(arranged.document,'checkRanges',{level:'初級'}).summary,/問題はありません/);
 const high={...parts[1],measures:parts[1].measures.map((bar,index)=>index?bar:{...bar,events:[C.makeNote({step:'C',alter:0,octave:7},1)]})};
 const fixed=Arrange.fixPart(high,'beginner');
 assert.equal(fixed.moved>0,true);
 assert.equal(Arrange.checkPart(fixed.part,'beginner').length,0);
});

test('doubles a part in transposed unison and keeps the source untouched',()=>{
 let score=Tools.run(C.createScore(),'insertNotes',{measure:1,notes:[{step:'C',octave:5,den:1}]}).document;
 score=Tools.run(score,'addParts',{keys:['alto']}).document;
 const doubled=Tools.run(score,'doublePart',{from:1,to:2,interval:'unison',level:'中級'});
 const alto=C.scoreParts(doubled.document)[1];
 assert.equal(pitched(alto)[0].step,'A');
 assert.equal(pitched(alto)[0].octave,5);
 assert.equal(inRange(alto,'intermediate'),true);
 assert.equal(C.scoreParts(score)[1].measures[0].events.length,0);
});

test('instrumentation proposal confirms before replacing notes',()=>{
 const score=Tools.run(C.createScore(),'insertNotes',{measure:1,notes:[{step:'G',octave:4,den:4}]}).document;
 const text=Tools.confirmText(score,'proposeInstrumentation',{headcount:8,style:'small',level:'初級'});
 assert.match(text,/提案する編成/);
 assert.match(text,/音符をこの編成に入れ替えます/);
 const applied=Tools.run(score,'proposeInstrumentation',{headcount:8,style:'small',level:'初級'}).document;
 assert.equal(C.scoreParts(applied).length,8);
 assert.equal(C.scoreParts(applied).some(part=>part.measures.some(bar=>bar.events.some(event=>event.type==='note'))),false);
});
