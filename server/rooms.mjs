import '../app/web/src/core.js';
import '../app/web/src/sync.js';
const C=globalThis.KanadeCore,S=globalThis.KanadeSync;
const enc=new TextEncoder(),MAX=1000000;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const secret=()=>{const data=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');};
const now=()=>Date.now();
const editorViews=new Set(['part','overview','roll','timeline']);
function peerName(value){
 const name=typeof value==='string'?value.trim():'';
 if(!name||name.length>40)throw Error('表示名を1〜40文字で入力してください');
 return name;
}
function scoreCheck(score){const errors=C.validateScore(score);if(!errors.length&&score.bassPart){errors.push(...C.validateScore(S.part(score,'bass')));if(score.bassPart.bassPart)errors.push('パートの形式が不正です');}if(errors.length)throw Error(errors[0]);if(enc.encode(JSON.stringify(score)).length>MAX)throw Error('共同編集の楽譜は1MBまでです');}
async function body(req){if(Number(req.headers.get('content-length'))>MAX*3)throw Error('データが大きすぎます');const text=await req.text();if(enc.encode(text).length>MAX*3)throw Error('データが大きすぎます');return JSON.parse(text);}
export async function roomsAPI(req,db){
 const url=new URL(req.url),origin=req.headers.get('Origin'),allowed=!origin||origin===url.origin||['https://kanade-score-studio.versionthree.chatgpt.site','http://127.0.0.1:5173','http://localhost:5173'].includes(origin);
 if(!allowed)return json({error:'この接続元は許可されていません'},403);
 const cors={'Access-Control-Allow-Origin':origin||url.origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Kanade-Owner','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
 const reply=(value,status=200)=>{const res=json(value,status);for(const [k,v]of Object.entries(cors))res.headers.set(k,v);return res;};
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 try{
  const match=url.pathname.match(/^\/api\/rooms(?:\/([a-zA-Z0-9-]{1,80})(?:\/(operations|presence|invite))?)?$/);if(!match)return reply({error:'見つかりません'},404);
  if(!db)return reply({error:'共同編集サーバーの準備ができていません'},503);
  const [,id,action]=match;
  if(!id&&req.method==='POST'){
   const input=await body(req);if(input.name!==undefined)peerName(input.name);scoreCheck(input.score);
   const ip=req.headers.get('CF-Connecting-IP')||'local',bucket=await hash(ip+':'+Math.floor(now()/3600000));
   const rate=await db.prepare('INSERT INTO room_limits (bucket,count) VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<10 RETURNING count').bind(bucket).first();if(!rate)return reply({error:'ルーム作成回数の上限です。時間をおいてください'},429);
   const room=crypto.randomUUID(),key=secret(),owner=secret(),expires=now()+30*86400000;
   await db.prepare('INSERT INTO rooms (id,key_hash,owner_hash,score,revision,updated_at,expires_at,operations) VALUES (?,?,?,?,0,?,?,?)').bind(room,await hash(key),await hash(owner),JSON.stringify(input.score),now(),expires,'[]').run();
   return reply({id:room,key,owner,score:input.score,revision:0,expiresAt:expires},201);
  }
  const token=req.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];if(!id||!token)return reply({error:'招待リンクを確認してください'},401);
  const keyHash=await hash(token);
  const find=()=>db.prepare('SELECT * FROM rooms WHERE id=? AND key_hash=? AND expires_at>?').bind(id,keyHash,now()).first();
  let room=await find();if(!room)return reply({error:'招待リンクが無効か、ルームの期限が切れています'},401);
  if(req.method==='DELETE'||action==='invite'){
   const owner=req.headers.get('X-Kanade-Owner');if(!owner||await hash(owner)!==room.owner_hash)return reply({error:'ルーム作成者だけが操作できます'},403);
   if(req.method==='DELETE'){await db.prepare('UPDATE rooms SET expires_at=0 WHERE id=? AND owner_hash=?').bind(id,room.owner_hash).run();return reply({closed:true});}
   if(req.method==='POST'){const key=secret();await db.prepare('UPDATE rooms SET key_hash=? WHERE id=? AND owner_hash=?').bind(await hash(key),id,room.owner_hash).run();return reply({key});}
  }
  if(action==='presence'&&req.method==='POST'){
   const input=await body(req);
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(input.clientId))throw Error('参加者情報が不正です');
   const name=peerName(input.name);
   const measure=typeof input.measureId==='string'?input.measureId.slice(0,200):'';
   const part=typeof input.partId==='string'?input.partId.slice(0,200):null;
   const view=editorViews.has(input.view)?input.view:null;
   const index=Number.isInteger(input.index)?Math.max(0,Math.min(200,input.index)):0;
   await db.prepare('INSERT INTO room_peers (room_id,client_id,name,measure_id,part_id,editor_view,event_index,seen_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(room_id,client_id) DO UPDATE SET name=excluded.name,measure_id=excluded.measure_id,part_id=excluded.part_id,editor_view=excluded.editor_view,event_index=excluded.event_index,seen_at=excluded.seen_at').bind(id,input.clientId,name,measure,part,view,index,now()).run();
   return reply({ok:true});
  }
  if(action==='operations'&&req.method==='POST'){
   const input=await body(req);if(!/^[a-zA-Z0-9-]{1,80}$/.test(input.id))throw Error('操作IDが不正です');
   for(let attempt=0;attempt<8;attempt++){
    if(attempt)room=await find();if(!room)return reply({error:'ルームは終了しました'},401);
    const seen=JSON.parse(room.operations);if(seen.includes(input.id))return reply({score:JSON.parse(room.score),revision:room.revision});
    const merged=S.mergeRoom(JSON.parse(room.score),input.patch,input.part);if(merged.conflicts.length)return reply({error:'同じ場所の変更が重なりました',conflicts:merged.conflicts,score:JSON.parse(room.score),revision:room.revision},409);
    scoreCheck(merged.score);seen.push(input.id);
    const result=await db.prepare('UPDATE rooms SET score=?,revision=revision+1,updated_at=?,operations=? WHERE id=? AND revision=? AND key_hash=? AND expires_at>? RETURNING revision').bind(JSON.stringify(merged.score),now(),JSON.stringify(seen.slice(-128)),id,room.revision,keyHash,now()).first();
    if(result)return reply({score:merged.score,revision:result.revision});
   }
   return reply({error:'変更が集中しています。再接続して再試行します'},503);
  }
  if(!action&&req.method==='GET'){
   const peers=await db.prepare('SELECT client_id AS clientId,name,measure_id AS measureId,part_id AS partId,editor_view AS view,event_index AS eventIndex FROM room_peers WHERE room_id=? AND seen_at>? ORDER BY client_id LIMIT 32').bind(id,now()-30000).all();
   const revision=Number(url.searchParams.get('revision'));
   return reply({revision:room.revision,...(revision!==room.revision?{score:JSON.parse(room.score)}:{}),peers:peers.results,expiresAt:room.expires_at});
  }
  return reply({error:'この操作には対応していません'},405);
 }catch(error){return reply({error:error instanceof Error?error.message:'処理できませんでした'},400);}
}
