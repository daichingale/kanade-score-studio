import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {roomsAPI} from '../server/rooms.mjs';import {sqliteDB} from '../server/sqlite-adapter.mjs';
const C=globalThis.KanadeCore,S=globalThis.KanadeSync;
function setup(){const db=sqliteDB();db.raw.exec(readFileSync(new URL('../server/local-schema.sql',import.meta.url),'utf8'));return db;}
const call=async(db,path='',method='GET',data,key,owner,origin='http://127.0.0.1:5173')=>{const r=await roomsAPI(new Request('https://kanade.test/api/rooms'+path,{method,headers:{Origin:origin,...(key?{Authorization:'Bearer '+key}:{}),...(owner?{'X-Kanade-Owner':owner}:{})},...(data?{body:JSON.stringify(data)}:{})}),db);return {status:r.status,data:await r.json()};};
const create=async db=>(await call(db,'','POST',{score:C.addMeasure(C.createScore())})).data;
test('different-measure changes merge and conditional Undo preserves the other author',()=>{const score=C.addMeasure(C.createScore()),a=C.placeEventAt(score,0,0,C.makeNote({step:'C',octave:4,alter:0})).score,b=C.placeEventAt(score,1,0,C.makeNote({step:'D',octave:4,alter:0})).score;const pa=S.diff(score,a),pb=S.diff(score,b),merged=S.merge(S.merge(score,pa).score,pb);assert.deepEqual(merged.conflicts,[]);const undo=S.merge(merged.score,S.inverse(pa));assert.deepEqual(undo.score.measures[0],score.measures[0]);assert.deepEqual(undo.score.measures[1],b.measures[1]);assert.deepEqual(score.measures[0].events,[]);});
test('same-measure and structural conflicts leave the current score unchanged',()=>{const score=C.addMeasure(C.createScore()),a=C.placeEventAt(score,0,0,C.makeNote({step:'C',octave:4,alter:0})).score,b=C.placeEventAt(score,0,0,C.makeNote({step:'D',octave:4,alter:0})).score;assert.ok(S.merge(a,S.diff(score,b)).conflicts.length);assert.deepEqual(S.merge(a,S.diff(score,b)).score,a);assert.throws(()=>S.merge(score,{fields:[{key:'__proto__',before:null,after:{}}],measures:[],order:null}));});
test('rooms authorize invitations, merge simultaneous authors, deduplicate retries, track peers, revoke and close',async()=>{const db=setup(),room=await create(db),base=room.score;assert.equal((await call(db,'/'+room.id)).status,401);assert.equal((await call(db,'/'+room.id,'GET',null,room.key,null,'https://evil.test')).status,403);
 const a=C.placeEventAt(base,0,0,C.makeNote({step:'C',octave:4,alter:0})).score,b=C.placeEventAt(base,1,0,C.makeNote({step:'D',octave:4,alter:0})).score;
 const results=await Promise.all([call(db,'/'+room.id+'/operations','POST',{id:'op-a',patch:S.diff(base,a)},room.key),call(db,'/'+room.id+'/operations','POST',{id:'op-b',patch:S.diff(base,b)},room.key)]);assert.ok(results.every(r=>r.status===200));let got=(await call(db,'/'+room.id+'?revision=-1','GET',null,room.key)).data;assert.equal(got.revision,2);assert.equal(got.score.measures.filter(m=>m.events.length).length,2);assert.equal(Object.hasOwn(got.score,'bassPart'),false);
 const retried=await call(db,'/'+room.id+'/operations','POST',{id:'op-a',patch:S.diff(base,a)},room.key);assert.equal(retried.data.revision,2);
 const conflicting=C.placeEventAt(base,0,0,C.makeNote({step:'E',octave:4,alter:0})).score;assert.equal((await call(db,'/'+room.id+'/operations','POST',{id:'conflict',patch:S.diff(base,conflicting)},room.key)).status,409);
 await call(db,'/'+room.id+'/presence','POST',{clientId:'alice',name:'Alice',measureId:base.measures[0].id,index:0},room.key);assert.equal((await call(db,'/'+room.id,'GET',null,room.key)).data.peers[0].name,'Alice');
 assert.equal((await call(db,'/'+room.id+'/invite','POST',{},room.key)).status,403);const rotated=await call(db,'/'+room.id+'/invite','POST',{},room.key,room.owner);assert.equal((await call(db,'/'+room.id,'GET',null,room.key)).status,401);assert.equal((await call(db,'/'+room.id,'GET',null,rotated.data.key)).status,200);assert.equal((await call(db,'/'+room.id,'DELETE',null,rotated.data.key,room.owner)).status,200);assert.equal((await call(db,'/'+room.id,'GET',null,rotated.data.key)).status,401);
 db.raw.close();});
test('public room creation is bounded and malformed edits cannot corrupt stored scores',async()=>{const db=setup();let room;for(let i=0;i<10;i++)room=await create(db);assert.equal((await call(db,'','POST',{score:C.createScore()})).status,429);const bad=await call(db,'/'+room.id+'/operations','POST',{id:'bad',patch:{fields:[{key:'clef',before:'treble',after:'invalid'}],measures:[],order:null}},room.key);assert.equal(bad.status,400);assert.equal((await call(db,'/'+room.id,'GET',null,room.key)).data.revision,0);db.raw.close();});

test('melody and bass edits in the same bar merge, including a legacy room and part-scoped undo',async()=>{
 const db=setup(),room=await create(db),path='/'+room.id,base=room.score,bass=S.part(base,'bass');
 const melodyEdit=C.placeEventAt(base,0,0,C.makeNote({step:'E',octave:4,alter:0})).score;
 const bassEdit=C.placeEventAt(bass,0,0,C.makeNote({step:'C',octave:2,alter:0})).score;
 const melodyPatch=S.diff(base,melodyEdit),bassPatch=S.diff(bass,bassEdit);
 const submit=(id,patch,part)=>call(db,path+'/operations','POST',{id,patch,part},room.key);
 const results=await Promise.all([submit('melody',melodyPatch,'melody'),submit('bass',bassPatch,'bass')]);
 assert.ok(results.every(result=>result.status===200));
 let saved=(await call(db,path+'?revision=-1','GET',null,room.key)).data;
 assert.equal(saved.revision,2);
 assert.equal(saved.score.measures[0].events[0].pitches[0].step,'E');
 assert.equal(S.part(saved.score,'bass').measures[0].events[0].pitches[0].octave,2);
 assert.equal((await submit('bass',bassPatch,'bass')).data.revision,2);
 assert.equal((await submit('undo-melody',S.inverse(melodyPatch),'melody')).status,200);
 saved=(await call(db,path+'?revision=2','GET',null,room.key)).data;
 assert.equal(saved.score.measures[0].events.length,0);
 assert.equal(S.part(saved.score,'bass').measures[0].events.length,1);
 db.raw.close();
});

test('presence rejects blank names and resolves the named part and bar of an overview editor',async()=>{
 const db=setup(),base=C.addMeasure(C.createScore());
 const brass={...C.addMeasure(C.createScore()),instrument:'トロンボーン'};
 // Imported parts can use the same measure ID, so the explicit part ID must win.
 brass.measures[1]={...brass.measures[1],id:base.measures[0].id};
 const score={...base,ensembleParts:[brass]};
 const invalid=await call(db,'','POST',{score,name:'  '});
 assert.equal(invalid.status,400);
 const room=(await call(db,'','POST',{score,name:'ホスト'})).data;
 const path='/'+room.id;
 const presence={clientId:'participant',name:'  団長  ',measureId:brass.measures[1].id,partId:brass.id,view:'overview',index:0};
 assert.equal((await call(db,path+'/presence','POST',{...presence,name:'　 '},room.key)).status,400);
 assert.equal((await call(db,path+'/presence','POST',presence,room.key)).status,200);
 const {data}=await call(db,path+'?revision=-1','GET',null,room.key);
 assert.deepEqual(data.peers[0],{clientId:'participant',name:'団長',measureId:presence.measureId,partId:brass.id,view:'overview',eventIndex:0});
 const resolved=S.peerPosition(data.score,data.peers[0]);
 assert.equal(resolved.part.instrument,'トロンボーン');assert.equal(resolved.measure,1);
 assert.equal(S.peerPosition(data.score,{measureId:brass.measures[0].id}).part.id,brass.id);
 db.raw.close();
});
