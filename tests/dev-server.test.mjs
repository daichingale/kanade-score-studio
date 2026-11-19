import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../scripts/dev.mjs';

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'kanade-test-'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body>Kanade</body></html>');
  await writeFile(path.join(root, 'style.css'), 'body { color: black; }');
  await writeFile(path.join(root, 'src/app.js'), 'window.ready = true;');
  const dev = await startServer({ root, port: 0, interval: 30, ...options });
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

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

test('proxies Ollama chat as a loopback stream and rejects other callers', async t => {
  let seen;
  const ollama = http.createServer(async (req, res) => {
    if (req.url === '/api/tags' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.1:8b' }] }));
      return;
    }
    if (req.url === '/api/chat' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      seen = JSON.parse(Buffer.concat(chunks).toString());
      if (seen.model !== 'qwen2.5:7b') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'model not found' }));
        return;
      }
      res.socket?.setNoDelay(true);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ message: { role: 'assistant', content: '前半' }, done: false })}\n`);
      await new Promise(resolve => setTimeout(resolve, 80));
      res.end(`${JSON.stringify({ message: { role: 'assistant', content: '後半' }, done: true })}\n`);
      return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: 'no such model' }));
  });
  const ollamaOrigin = await listen(ollama);
  t.after(() => new Promise(resolve => ollama.close(resolve)));
  const dev = await fixture(t, { ollamaOrigin });
  const tags = await fetch(`${dev.url}/__agent/tags`);
  assert.equal(tags.status, 200);
  assert.equal(tags.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await tags.json()).models.map(model => model.name), ['qwen2.5:7b', 'llama3.1:8b']);
  assert.equal((await fetch(`${dev.url}/__agent/chat`)).status, 405);
  assert.equal((await fetch(`${dev.url}/__agent/secret`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${dev.url}/__agent/chat`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${dev.url}/__agent/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: '../passwd', messages: [{ role: 'user', content: 'x' }] }) })).status, 400);
  const payload = {
    model: 'qwen2.5:7b',
    messages: [{ role: 'system', content: '吹奏楽' }, { role: 'user', content: '音域は？' }],
    tools: [{ type: 'function', function: { name: 'getScoreSummary', description: '要約', parameters: { type: 'object', properties: {} } }, extra: 'drop-me' }],
    options: { temperature: 9 }
  };
  const streamed = await new Promise((resolve, reject) => {
    const req = http.request(`${dev.url}/__agent/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      const pieces = [];
      const times = [];
      res.on('data', chunk => { pieces.push(chunk.toString()); times.push(Date.now()); });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, text: pieces.join(''), gap: times.length >= 2 ? times.at(-1) - times[0] : 0 }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });
  assert.equal(streamed.statusCode, 200);
  assert.match(streamed.headers['content-type'], /ndjson/);
  assert.equal(seen.stream, true);
  assert.equal(seen.model, 'qwen2.5:7b');
  assert.equal(seen.options, undefined);
  assert.equal(seen.tools[0].extra, undefined);
  assert.equal(seen.tools[0].function.name, 'getScoreSummary');
  assert.match(streamed.text, /前半/);
  assert.match(streamed.text, /後半/);
  assert.ok(streamed.gap >= 40, 'chat bytes arrive before the upstream finishes');
  const missing = await fetch(`${dev.url}/__agent/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'missing:7b', messages: [{ role: 'user', content: 'hi' }] })
  });
  assert.equal(missing.status, 404);
  const huge = JSON.stringify({ model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'a'.repeat(600000) }] });
  assert.equal((await fetch(`${dev.url}/__agent/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: huge })).status, 413);
});

test('reports a stopped Ollama without opening the chat route to the network', async t => {
  const dev = await fixture(t, { ollamaOrigin: 'http://127.0.0.1:1' });
  const tags = await fetch(`${dev.url}/__agent/tags`);
  assert.equal(tags.status, 503);
  assert.equal((await tags.json()).error, 'ollama-unavailable');
  const chat = await fetch(`${dev.url}/__agent/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen2.5:7b', messages: [{ role: 'user', content: 'こんにちは' }] })
  });
  assert.equal(chat.status, 503);
  assert.equal((await chat.json()).error, 'ollama-unavailable');
  await assert.rejects(() => startServer({ root: dev.root, port: 0, ollamaOrigin: 'http://example.com:11434' }), /loopback/);
});
