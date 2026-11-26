import { detectEngines, prepareOmrRequest, recognizeOnPc, OMR_BODY_LIMIT } from './omr-pc.mjs';

export async function handleOmrHttp(req, res, requestUrl, deps) {
  const { sendJson, readBody } = deps;
  const path = requestUrl.pathname;
  if (path === '/__omr/status' && req.method === 'GET') {
    const engines = await detectEngines();
    sendJson(res, 200, {
      ok: true,
      oemer: Boolean(engines.oemer),
      homr: Boolean(engines.homr),
      audiveris: Boolean(engines.audiveris),
      prefer: engines.prefer,
      maxBytes: OMR_BODY_LIMIT
    });
    return;
  }
  if (path === '/__omr/recognize' && req.method === 'POST') {
    try {
      const raw = await readBody(req, OMR_BODY_LIMIT);
      const body = JSON.parse(raw.toString('utf8'));
      const prepared = prepareOmrRequest(body);
      const result = await recognizeOnPc(prepared);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = error.status || (error.message === 'payload-too-large' ? 413 : 400);
      sendJson(res, status, { ok: false, error: error.agentError || error.message });
    }
    return;
  }
  res.writeHead(404);
  res.end();
}