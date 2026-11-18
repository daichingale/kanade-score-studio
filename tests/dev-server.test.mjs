import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../scripts/dev.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'kanade-test-'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body>Kanade</body></html>');
  await writeFile(path.join(root, 'style.css'), 'body { color: black; }');
  await writeFile(path.join(root, 'src/app.js'), 'window.ready = true;');
  const dev = await startServer({ root, port: 0, interval: 30 });
  t.after(async () => { await dev.close(); await rm(root, { recursive: true, force: true }); });
  return { root, ...dev };
}
test('serves the app, injects development support, disables caching', async t => {
  const { url } = await fixture(t);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /window.__KANADE_DEV__=true/);
  assert.equal((await fetch(url+'/src/app.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal((await (await fetch(url+'/__dev/health')).json()).app, 'kanade-local');
  assert.match(await (await fetch(url+'/__dev/client.js')).text(), /EventSource/);
});
test('does not expose project metadata or accept cross-origin writes', async t => {
  const { url } = await fixture(t);
  for (const name of ['/.git/config', '/tests/x.js', '/%2e%2e%5csecret', '/missing']) {
    assert.ok([403,404].includes((await fetch(url+name)).status));
  }
  assert.equal((await fetch(url, { method:'POST' })).status,405);
  assert.equal((await fetch(url, { headers:{Origin:'http://example.com'} })).status,403);
  const status = await new Promise((resolve,reject) => {
    http.get(url,{headers:{Host:'example.com'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);
  });
  assert.equal(status,403);
});
test('announces source edits and deletions over the reload stream', async t => {
  const { url, root } = await fixture(t);
  const controller = new AbortController();
  t.after(()=>controller.abort());
  const response = await fetch(url+'/__dev/events', { signal:controller.signal });
  const reader = response.body.getReader();
  let pending='';
  async function next() {
    while (!pending.includes('\n\n')) {
      const chunk = await reader.read();
      if(chunk.done)throw new Error('Stream closed');
      pending+=new TextDecoder().decode(chunk.value);
    }
    const end=pending.indexOf('\n\n'),message=pending.slice(0,end);pending=pending.slice(end+2);
    return JSON.parse(message.slice(6));
  }
  const timeout = setTimeout(()=>controller.abort(),5000);t.after(()=>clearTimeout(timeout));
  const hello=await next();assert.equal(hello.type,'hello');assert.ok(hello.instanceId);
  await writeFile(path.join(root,'style.css'),'body { color: red; }');
  const css=await next();assert.deepEqual(css.files,['style.css']);
  await writeFile(path.join(root,'src/app.js'),'window.ready = false;');
  assert.deepEqual((await next()).files,['src/app.js']);
  await rm(path.join(root,'style.css'));
  const removed=await next();assert.deepEqual(removed.files,['style.css']);assert.ok(removed.version>css.version);
  await reader.cancel();
});
test('refuses a second server on the same port', async t => {
  const { root, server } = await fixture(t);
  await assert.rejects(startServer({root,port:server.address().port}),{code:'EADDRINUSE'});
});
