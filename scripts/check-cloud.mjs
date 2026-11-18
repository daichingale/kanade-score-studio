import '../app/web/src/core.js';
const base=(process.argv[2]||'http://127.0.0.1:5175').replace(/\/$/,'');
const page=await fetch(base+'/index.html');if(!page.ok||!(await page.text()).includes('src/collaboration.js'))throw Error('Web shell failed');
const manifest=await (await fetch(base+'/manifest.webmanifest')).json();if(manifest.display!=='standalone')throw Error('Install manifest failed');
const created=await fetch(base+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({score:globalThis.KanadeCore.createScore()})});const room=await created.json();if(created.status!==201)throw Error('Room creation failed: '+JSON.stringify(room));
const read=await fetch(base+'/api/rooms/'+room.id+'?revision=-1',{headers:{Authorization:'Bearer '+room.key}});if(!read.ok||!(await read.json()).score)throw Error('Room read failed');
const denied=await fetch(base+'/api/rooms/'+room.id);if(denied.status!==401)throw Error('Invite access boundary failed');
const ended=await fetch(base+'/api/rooms/'+room.id,{method:'DELETE',headers:{Authorization:'Bearer '+room.key,'X-Kanade-Owner':room.owner}});if(!ended.ok)throw Error('Room close failed');
console.log('PASS: deployed-style Web shell, install manifest, D1 room create/read, invite authorization and close');
