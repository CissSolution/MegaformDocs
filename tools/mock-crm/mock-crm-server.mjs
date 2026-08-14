/**
 * Mock CRM/ERP endpoint — the "other system" MegaForm's webhook node posts into.
 *
 * It exists so the webhook walkthrough can be run and filmed end to end without depending on a
 * third-party request bin, and so both halves of the question "with and without authentication"
 * are answerable on one machine:
 *
 *   POST /crm/leads          → open endpoint, accepts anything          (no authentication)
 *   POST /crm/leads-secure   → Bearer token required, else 401          (Authorization header)
 *   POST /crm/leads-apikey   → X-Api-Key required, else 401             (API-key header)
 *   POST /crm/leads-basic    → HTTP Basic required, else 401            (Basic auth)
 *   POST /erp/orders         → echoes an order number + a status the workflow can route on
 *   GET  /received           → everything captured so far, newest first (JSON)
 *   GET  /                   → the same, as a plain HTML page you can watch while filming
 *
 * ⚠️ MegaForm's SsrfGuard BLOCKS webhook targets that resolve to loopback or private addresses —
 * which is every on-prem CRM, this mock included. Start the MegaForm host with
 * MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1 or the node fails with
 * "Blocked webhook URL: URL targets a blocked (private/loopback/metadata) address".
 * That is the same switch a customer needs when their real CRM sits on the LAN.
 *
 * Run:  node tools/mock-crm/mock-crm-server.mjs [port]      (default 5199)
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || process.env.MOCK_CRM_PORT || 5199);
const BEARER = process.env.MOCK_CRM_TOKEN || 'demo-bearer-token-2026';
const APIKEY = process.env.MOCK_CRM_APIKEY || 'demo-api-key-2026';
const BASIC_USER = 'megaform';
const BASIC_PASS = 'demo-pass-2026';

/** Newest first. Capped so a long filming session cannot grow without bound. */
const received = [];
const MAX_KEPT = 200;

let orderSeq = 1000;

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
    req.on('end', () => resolve(raw));
  });
}

function record(req, path, raw, outcome) {
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* keep the raw text */ }
  received.unshift({
    at: new Date().toISOString(),
    method: req.method,
    path,
    outcome,
    auth: {
      authorization: req.headers.authorization || null,
      apiKey: req.headers['x-api-key'] || null,
    },
    contentType: req.headers['content-type'] || null,
    body: parsed ?? raw,
  });
  if (received.length > MAX_KEPT) received.length = MAX_KEPT;
  const who = outcome === 'accepted' ? '✓' : '✗';
  console.log(`${who} ${req.method} ${path} → ${outcome}`);
  if (parsed) console.log('   ' + JSON.stringify(parsed));
}

function json(res, status, obj) {
  const b = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}

function unauthorized(res, how) {
  json(res, 401, { ok: false, error: 'unauthorized', expected: how });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/received') return json(res, 200, { count: received.length, received });

  if (req.method === 'GET' && path === '/') {
    const rows = received.map((r) => `<tr><td>${r.at}</td><td>${r.method} ${r.path}</td><td class="${r.outcome}">${r.outcome}</td><td><pre>${escapeHtml(JSON.stringify(r.body, null, 2))}</pre></td></tr>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><title>Mock CRM — received</title>
<meta http-equiv="refresh" content="2">
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:18px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e2e8f0;padding:8px;vertical-align:top;font-size:12px}
pre{margin:0;white-space:pre-wrap;font:11px/1.4 Consolas,monospace}
.accepted{color:#15803d;font-weight:700}.rejected{color:#b91c1c;font-weight:700}
.empty{color:#64748b;font-style:italic}</style>
<h1>Mock CRM — ${received.length} request(s) received</h1>
${received.length ? `<table><tr><th>Time</th><th>Endpoint</th><th>Result</th><th>Body</th></tr>${rows}</table>` : '<p class="empty">Nothing yet. Submit the form.</p>'}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' });

  const raw = await readBody(req);

  // ── no authentication ────────────────────────────────────────────────────
  if (path === '/crm/leads') {
    record(req, path, raw, 'accepted');
    return json(res, 200, { ok: true, leadId: 'LEAD-' + (++orderSeq), status: 'created' });
  }

  // ── Bearer token ─────────────────────────────────────────────────────────
  if (path === '/crm/leads-secure') {
    if (req.headers.authorization !== 'Bearer ' + BEARER) {
      record(req, path, raw, 'rejected');
      return unauthorized(res, `Authorization: Bearer ${BEARER}`);
    }
    record(req, path, raw, 'accepted');
    return json(res, 200, { ok: true, leadId: 'LEAD-' + (++orderSeq), status: 'created' });
  }

  // ── API key header ───────────────────────────────────────────────────────
  if (path === '/crm/leads-apikey') {
    if (req.headers['x-api-key'] !== APIKEY) {
      record(req, path, raw, 'rejected');
      return unauthorized(res, `X-Api-Key: ${APIKEY}`);
    }
    record(req, path, raw, 'accepted');
    return json(res, 200, { ok: true, leadId: 'LEAD-' + (++orderSeq), status: 'created' });
  }

  // ── HTTP Basic ───────────────────────────────────────────────────────────
  if (path === '/crm/leads-basic') {
    const expected = 'Basic ' + Buffer.from(`${BASIC_USER}:${BASIC_PASS}`).toString('base64');
    if (req.headers.authorization !== expected) {
      record(req, path, raw, 'rejected');
      return unauthorized(res, `Basic ${BASIC_USER}:${BASIC_PASS}`);
    }
    record(req, path, raw, 'accepted');
    return json(res, 200, { ok: true, leadId: 'LEAD-' + (++orderSeq), status: 'created' });
  }

  // ── ERP order intake: answers with a field the workflow can route on ─────
  if (path === '/erp/orders') {
    record(req, path, raw, 'accepted');
    let amount = 0;
    try { amount = Number(JSON.parse(raw)?.amount ?? JSON.parse(raw)?.order?.amount ?? 0) || 0; } catch { /* ignore */ }
    return json(res, 200, {
      ok: true,
      orderNo: 'SO-' + (++orderSeq),
      // Over 10,000 needs a human; the workflow's response route can branch on this.
      status: amount > 10000 ? 'needs_approval' : 'approved',
      amount,
    });
  }

  record(req, path, raw, 'rejected');
  return json(res, 404, { ok: false, error: 'no such endpoint', path });
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

server.listen(PORT, () => {
  console.log(`Mock CRM listening on http://localhost:${PORT}`);
  console.log('  POST /crm/leads          (no auth)');
  console.log(`  POST /crm/leads-secure   (Authorization: Bearer ${BEARER})`);
  console.log(`  POST /crm/leads-apikey   (X-Api-Key: ${APIKEY})`);
  console.log(`  POST /crm/leads-basic    (Basic ${BASIC_USER}:${BASIC_PASS})`);
  console.log('  POST /erp/orders         (echoes orderNo + status)');
  console.log(`  GET  http://localhost:${PORT}/  → live view of everything received`);
});
