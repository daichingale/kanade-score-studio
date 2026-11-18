import http from 'node:http';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultRoot = path.join(projectRoot, 'app/web');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8' };
const injection = '<script>window.__KANADE_DEV__=true;</script><script defer src="/__dev/client.js"></script>';

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

export async function startServer({ root = defaultRoot, port = 5173, interval = 400 } = {}) {
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
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, `http://${ownHost}`);
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
