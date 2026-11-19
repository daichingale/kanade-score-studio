import http from 'node:http';
import { Readable } from 'node:stream';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultRoot = path.join(projectRoot, 'app/web');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8' };
const injection = '<script>window.__KANADE_DEV__=true;</script><script defer src="/__dev/client.js"></script>';
const DEFAULT_OLLAMA = 'http://127.0.0.1:11434';
const AGENT_BODY_LIMIT = 512 * 1024;
const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export function loopbackOrigin(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error('Ollama proxy must use a loopback HTTP origin');
  }
  return parsed.origin;
}

function agentError(status, error) {
  const failure = new Error(error);
  failure.status = status;
  failure.agentError = error;
  return failure;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw agentError(413, 'payload-too-large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function prepareAgentChat(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw agentError(400, 'invalid-request');
  if (typeof value.model !== 'string' || !MODEL_NAME.test(value.model)) throw agentError(400, 'invalid-request');
  if (!Array.isArray(value.messages) || value.messages.length < 1 || value.messages.length > 80) throw agentError(400, 'invalid-request');
  let total = 0;
  const messages = value.messages.map(message => {
    if (!message || typeof message !== 'object' || !['system', 'user', 'assistant', 'tool'].includes(message.role)) throw agentError(400, 'invalid-request');
    const content = typeof message.content === 'string' ? message.content : '';
    if (content.length > 12000) throw agentError(400, 'invalid-request');
    total += content.length;
    if (total > 200000) throw agentError(400, 'invalid-request');
    const clean = { role: message.role, content };
    if (message.role === 'tool') {
      const name = message.tool_name || message.name;
      if (typeof name !== 'string' || !TOOL_NAME.test(name)) throw agentError(400, 'invalid-request');
      clean.tool_name = name;
    }
    if (message.role === 'assistant' && message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls) || message.tool_calls.length > 8) throw agentError(400, 'invalid-request');
      clean.tool_calls = message.tool_calls.map(call => {
        const fn = call?.function || call;
        if (!fn || typeof fn.name !== 'string' || !TOOL_NAME.test(fn.name)) throw agentError(400, 'invalid-request');
        let args = fn.arguments ?? {};
        if (typeof args === 'string') {
          if (args.length > 8000) throw agentError(400, 'invalid-request');
          try { args = args ? JSON.parse(args) : {}; } catch { throw agentError(400, 'invalid-request'); }
        }
        if (!args || typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 8000) throw agentError(400, 'invalid-request');
        return { function: { name: fn.name, arguments: args } };
      });
    }
    return clean;
  });
  const payload = { model: value.model, messages, stream: true };
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools) || value.tools.length > 32) throw agentError(400, 'invalid-request');
    const tools = value.tools.map(tool => {
      const fn = tool?.type === 'function' ? tool.function : null;
      if (!fn || typeof fn.name !== 'string' || !TOOL_NAME.test(fn.name)) throw agentError(400, 'invalid-request');
      if (typeof fn.description !== 'string' || fn.description.length > 2000) throw agentError(400, 'invalid-request');
      if (fn.parameters !== undefined && (typeof fn.parameters !== 'object' || fn.parameters === null || Array.isArray(fn.parameters))) throw agentError(400, 'invalid-request');
      const parameters = fn.parameters || { type: 'object', properties: {} };
      if (JSON.stringify(parameters).length > 8000) throw agentError(400, 'invalid-request');
      return { type: 'function', function: { name: fn.name, description: fn.description, parameters } };
    });
    if (tools.length) payload.tools = tools;
  }
  return payload;
}

async function proxyChat(req, res, ollamaOrigin, payload) {
  const abort = new AbortController();
  const stop = () => { if (!res.writableEnded) abort.abort(); };
  res.on('close', stop);
  const upstream = await fetch(`${ollamaOrigin}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: abort.signal,
    redirect: 'error'
  });
  if (!upstream.ok) {
    const text = (await upstream.text()).slice(0, 4000);
    if (!res.writableEnded) {
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(text);
    }
    return;
  }
  if (res.writableEnded) { abort.abort(); return; }
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (!upstream.body) { res.end(); return; }
  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', () => { if (!res.writableEnded) res.end(); });
  stream.pipe(res);
}

async function handleAgent(req, res, url, ollamaOrigin) {
  try {
    if (url.pathname === '/__agent/tags') {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const upstream = await fetch(`${ollamaOrigin}/api/tags`, { signal: AbortSignal.timeout(4000), redirect: 'error' });
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': body.length
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (url.pathname === '/__agent/chat') {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      const declared = Number(req.headers['content-length'] || 0);
      if (Number.isFinite(declared) && declared > AGENT_BODY_LIMIT) {
        sendJson(res, 413, { error: 'payload-too-large' });
        req.destroy();
        return;
      }
      const payload = prepareAgentChat(JSON.parse((await readBody(req, AGENT_BODY_LIMIT)).toString('utf8') || 'null'));
      await proxyChat(req, res, ollamaOrigin, payload);
      return;
    }
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    if (res.headersSent || res.writableEnded || res.destroyed) return;
    if (error.name === 'AbortError') return;
    if (error.status === 413 || error.agentError === 'payload-too-large') sendJson(res, 413, { error: 'payload-too-large' });
    else if (error.status === 400 || error instanceof SyntaxError || error.agentError === 'invalid-request') sendJson(res, 400, { error: 'invalid-request' });
    else sendJson(res, 503, { error: 'ollama-unavailable' });
  }
}

const fingerprintCache=new Map();
async function fingerprint(root) {
  const result = {};
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'tests') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) {
        const info=await stat(file),stamp=`${info.size}:${info.mtimeMs}:${info.ctimeMs}`,cached=fingerprintCache.get(file);
        const hash=cached?.stamp===stamp?cached.hash:createHash('sha256').update(await readFile(file)).digest('hex');
        fingerprintCache.set(file,{stamp,hash});result[path.relative(root,file).split(path.sep).join('/')]=hash;
      }
    }
  }
  await walk(root);
  return result;
}

export async function startServer({ root = defaultRoot, port = 5173, interval = 400, ollamaOrigin = DEFAULT_OLLAMA } = {}) {
  ollamaOrigin = loopbackOrigin(ollamaOrigin);
  root = await realpath(root);
  const projectId = createHash('sha256').update(root).digest('hex');
  const instanceId = randomUUID();
  const clients = new Set();
  let files = await fingerprint(root), version = 0, busy = false;
  const broadcast = data => { for (const client of clients) client.write(`data: ${JSON.stringify(data)}\n\n`); };
  const server = http.createServer(async (req, res) => {
    // Only loopback hosts and same-origin browser requests may use this local server.
    const ownHost = `127.0.0.1:${server.address().port}`;
    if (![ownHost, `localhost:${server.address().port}`].includes(req.headers.host) ||
        (req.headers.origin && ![`http://${ownHost}`, `http://localhost:${server.address().port}`].includes(req.headers.origin))) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    let requestUrl;
    try { requestUrl = new URL(req.url, `http://${ownHost}`); }
    catch { res.writeHead(400); res.end('Not found'); return; }
    if (requestUrl.pathname.startsWith('/__agent/')) {
      await handleAgent(req, res, requestUrl, ollamaOrigin); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = requestUrl;
      const name = decodeURIComponent(url.pathname);
      if (name === '/__dev/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ app: 'kanade-local', projectId, version })); return;
      }
      if (name === '/__dev/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        clients.add(res);
        res.write(`data: ${JSON.stringify({ type: 'hello', version, projectId, instanceId })}\n\n`);
        req.on('close', () => clients.delete(res)); return;
      }
      if (name === '/__dev/client.js') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(req.method === 'HEAD' ? undefined : await readFile(new URL('./dev-client.js', import.meta.url))); return;
      }
      const parts = name.split(/[\\/]/);
      if (parts.some(p => p.startsWith('.') || p === 'tests') || name.includes('\0')) { res.writeHead(403); res.end(); return; }
      const file = await realpath(path.join(root, name === '/' ? 'index.html' : name));
      const relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) { res.writeHead(403); res.end(); return; }
      let content = await readFile(file);
      if (path.extname(file) === '.html') content = Buffer.from(content.toString().replace('</head>', `${injection}</head>`));
      res.setHeader('Content-Type', (mime[path.extname(file)] || 'application/octet-stream') + (['.html','.js','.css','.json','.svg'].includes(path.extname(file)) ? '; charset=utf-8' : ''));
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404); res.end('Not found');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const poller = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const next = await fingerprint(root);
      const changed = [...new Set([...Object.keys(files), ...Object.keys(next)])].filter(key => files[key] !== next[key]);
      if (changed.length) { files = next; version++; broadcast({ type: 'update', version, files: changed }); }
    } catch (error) { console.error('Waiting for source files:', error.message); }
    finally { busy = false; }
  }, interval);
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': keepalive\n\n'); }, 15000);
  return { server, projectId, url: `http://127.0.0.1:${server.address().port}`, close: async () => {
    clearInterval(poller); clearInterval(heartbeat);
    for (const client of clients) client.end();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  } };
}

function openBrowser(url) {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Open ${url} in your browser.`)); child.unref();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = 'http://127.0.0.1:5173';
  try {
    const dev = await startServer();
    console.log(`Kanade v0.2 | ${dev.url}\nSource: ${defaultRoot}\nSave source files to update the browser. Ctrl+C to stop.`);
    if (process.argv.includes('--open')) openBrowser(dev.url);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await dev.close(); process.exit(0); });
  } catch (error) {
    let existing;
    if (error.code === 'EADDRINUSE') {
      try { existing = await (await fetch(`${url}/__dev/health`, { signal: AbortSignal.timeout(2000) })).json(); } catch {}
    }
    const expectedId = createHash('sha256').update(await realpath(defaultRoot)).digest('hex');
    if (existing?.app === 'kanade-local' && existing.projectId === expectedId) {
      console.log(`Kanade is already running: ${url}`);
      if (process.argv.includes('--open')) openBrowser(url);
    } else {
      console.error(error.code === 'EADDRINUSE' ? 'Port 5173 is in use by another app. Close that app and retry. The port stays fixed to preserve saved scores.' : error);
      process.exitCode = 1;
    }
  }
}
