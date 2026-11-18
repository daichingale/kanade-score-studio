import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync} from 'node:fs';
import {sqliteDB} from './sqlite-adapter.mjs';
import {roomsAPI} from './rooms.mjs';
const path=new URL('../.local/',import.meta.url);mkdirSync(path,{recursive:true});const db=sqliteDB(fileURLToPath(new URL('collaboration.sqlite',path)));db.raw.exec(readFileSync(new URL('./local-schema.sql',import.meta.url),'utf8'));
const columns=new Set(db.raw.prepare('PRAGMA table_info(room_peers)').all().map(column=>column.name));
for(const column of ['part_id','editor_view'])if(!columns.has(column))db.raw.exec(`ALTER TABLE room_peers ADD COLUMN ${column} TEXT`);
const server=http.createServer(async(req,res)=>{
 try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request('http://127.0.0.1:5174'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body}:{} )});const result=await roomsAPI(request,db);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch(e){res.writeHead(500);res.end('Preview server error');}
});server.listen(5174,'127.0.0.1',()=>console.log('Kanade collaboration preview http://127.0.0.1:5174'));
