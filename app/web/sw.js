/* Network-first shell. Never cache shared scores, invitation responses, dev routes, or the local Ollama proxy.
   The unmodified Verovio toolkit is precached so engraved scores stay available offline. */
const CACHE='kanade-shell-v24';
const ROOT=self.location.pathname.replace(/\/sw\.js$/,'');
const PRECACHE=[`${ROOT}/vendor/verovio/verovio-toolkit-wasm.js`,`${ROOT}/vendor/verovio/LICENSE`,`${ROOT}/vendor/verovio/NOTICE.txt`,`${ROOT}/src/verovio-mei.js`,`${ROOT}/src/verovio-view.js`,`${ROOT}/src/verovio-worker.js`];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(PRECACHE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('kanade-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/__dev/')||url.pathname.startsWith('/__agent/'))return;
 const bust=/\/src\/.*\.js$/.test(url.pathname)||url.pathname.endsWith('/index.html')||url.pathname.endsWith('/style.css')||url.pathname.endsWith('/sw.js');
 event.respondWith((async()=>{
  try{
   const response=await fetch(event.request,{cache:bust?'no-store':'default'});
   if(response.ok&&!bust){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}
   return response;
  }catch(error){
   const cached=await caches.match(event.request);if(cached)return cached;throw error;
  }
 })());
});
