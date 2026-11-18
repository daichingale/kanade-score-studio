const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const home=path.join(__dirname,'../');
const html=fs.readFileSync(path.join(home,'index.html'),'utf8');
const app=fs.readFileSync(path.join(home,'src/app.js'),'utf8');
test('all static UI IDs used by JS are declared exactly once',()=>{
 const ids=[...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'duplicate id in index.html');
 for(const [,id] of app.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g))
   assert.ok(ids.includes(id),`missing element #${id}`);
});
test('offline app contains all executable JS as relative files',()=>{
 for(const [,src] of html.matchAll(/<script\s+defer\s+src="([^"]+)"/g)){
   assert.ok(!src.startsWith('http'),`remote dependency: ${src}`);
   assert.ok(fs.statSync(path.join(home,src)).isFile());
 }
});
test('Bravura font and its redistribution license are bundled locally',()=>{
 const css=fs.readFileSync(path.join(home,'style.css'),'utf8');
 assert.match(css,/@font-face[^}]*Kanade Bravura[^}]*Bravura\.woff2/);
 for(const file of ['fonts/Bravura.woff2','fonts/LICENSE-Bravura.txt']) assert.ok(fs.statSync(path.join(home,file)).isFile());
 assert.match(fs.readFileSync(path.join(home,'fonts/LICENSE-Bravura.txt'),'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
});
