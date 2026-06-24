#!/usr/bin/env node
/**
 * MegaForm AI Mock Bridge
 * ─────────────────────────────────────────────────────────────────────────
 * Local HTTP server that speaks the OpenAI `/v1/chat/completions` protocol
 * AND routes every request to your installed Claude Code CLI in --print
 * --output-format json mode.
 *
 * Why: when the MegaForm browser AI Form Assistant is configured to use
 * "OpenAI gpt-4o", every test turn burns OpenAI tokens. Pointing it at this
 * bridge instead routes the traffic through your Claude Code subscription
 * (which you're already paying for) at zero per-request cost.
 *
 * Usage
 * ─────
 *   node server.cjs                       # default port 8787, gpt-4o impersonation
 *   PORT=9000 node server.cjs             # different port
 *   CLAUDE_MODEL=opus node server.cjs     # Claude model to use
 *   DEBUG=1 node server.cjs               # log every request/response
 *
 * Then in MegaForm AI Settings (right panel ➜ Settings cog ➜ AI):
 *   Provider:  Custom OpenAI-compatible
 *   Base URL:  http://localhost:8787/v1
 *   API Key:   mock-key-anything           (any non-empty string — not validated)
 *   Model:     gpt-4o                      (echoed back; bridge ignores it)
 *
 * Architecture
 * ────────────
 *   Browser POST /v1/chat/completions
 *      ↓
 *   This server flattens {messages, tools, tool_choice} into ONE prompt
 *      ↓
 *   spawn claude.exe --print --output-format json --bare
 *                    --allowedTools '' --disallowedTools '*'
 *                    --append-system-prompt <bridge instructions>
 *      ↓
 *   Claude returns JSON: {"tool_calls":[...]} OR {"content":"..."}
 *      ↓
 *   Server wraps as OpenAI response shape and returns to browser
 *      ↓
 *   Browser dispatches tool_calls via MegaForm dispatcher, POSTs back with
 *   tool results — this server is STATELESS, every POST is independent.
 */

'use strict';

const http  = require('http');
const { spawn } = require('child_process');
const os    = require('os');
const path  = require('path');
const fs    = require('fs');

const PORT  = parseInt(process.env.PORT || '8787', 10);
const DEBUG = !!process.env.DEBUG;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || ''; // empty = Claude default
const CLAUDE_BIN = process.env.CLAUDE_BIN || autoLocateClaude();

if (!CLAUDE_BIN) {
  console.error('[FATAL] Could not locate claude.exe. Pass CLAUDE_BIN=<path> env var.');
  process.exit(1);
}
console.log('[mock-ai] Using Claude CLI:', CLAUDE_BIN);
console.log('[mock-ai] Listening on http://localhost:' + PORT);

function autoLocateClaude() {
  if (process.platform === 'win32') {
    const ext = path.join(os.homedir(), '.vscode', 'extensions');
    if (!fs.existsSync(ext)) return '';
    const dirs = fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-'));
    for (const d of dirs) {
      const bin = path.join(ext, d, 'resources', 'native-binary', 'claude.exe');
      if (fs.existsSync(bin)) return bin;
    }
    return '';
  }
  // unix-y systems: rely on PATH
  return 'claude';
}

// ─── Bridge system prompt ──────────────────────────────────────────────────
const BRIDGE_PROMPT = `You are simulating an OpenAI-compatible chat assistant for the MegaForm AI Form Assistant. The user is running you locally through a bridge that converts your output to OpenAI tool-call shape.

CRITICAL RULES:
1. You do NOT have any tool access in this session. The CALLER (a browser app) will dispatch tools on your behalf when you request them in your JSON output.
2. Respond with EXACTLY ONE JSON object — no markdown fences, no commentary, no prose outside JSON.
3. Pick exactly one shape per turn:
   • To REQUEST a tool call (the caller will run it and feed back the result on the next turn):
     {"tool_calls":[{"id":"call_<random>","name":"<tool_name>","arguments":<args_object>}]}
   • To DELIVER a final answer to the user:
     {"content":"<the final text — for MegaForm this is normally another JSON object with ops + explain>"}
4. NEVER call tools yourself with Bash, Read, Edit, Grep, etc. Always emit JSON for the caller to dispatch.
5. When the caller's system message lists "Available tools" with names like list_knowledge, get_knowledge, inspect_form_customizations, propose_table_schema, etc — those are the ONLY tool names you can reference in tool_calls.
6. When you have enough info to finalize, your "content" string should itself be the JSON the MegaForm chat layer expects: '{"ops":[...],"explain":"..."}'. Wrap that as a string inside the outer {"content":"..."} envelope.

OUTPUT FORMAT EXAMPLE — requesting a tool:
{"tool_calls":[{"id":"call_a1","name":"list_knowledge","arguments":{"kind":"form_pattern","search":"rules"}}]}

OUTPUT FORMAT EXAMPLE — delivering ops to the user:
{"content":"{\\"ops\\":[{\\"op\\":\\"add_field\\",\\"type\\":\\"Email\\",\\"key\\":\\"email\\",\\"label\\":\\"Email\\"}],\\"explain\\":\\"Added an email field.\\"}"}

Output JSON only. No surrounding text. No markdown.`;

const BRIDGE_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  oneOf: [
    {
      required: ['tool_calls'],
      properties: {
        tool_calls: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'name', 'arguments'],
            properties: {
              id:        { type: 'string' },
              name:      { type: 'string' },
              arguments: { type: 'object' },
            },
          },
        },
      },
      additionalProperties: false,
    },
    {
      required: ['content'],
      properties: { content: { type: 'string' } },
      additionalProperties: false,
    },
  ],
});

// ─── HTTP server ───────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS so DNN / Oqtane localhost variants work without extra config
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, claudeBin: CLAUDE_BIN, model: CLAUDE_MODEL || '(default)' }));
    return;
  }
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [
        { id: 'gpt-4o',        object: 'model', owned_by: 'claude-bridge' },
        { id: 'gpt-4o-mini',   object: 'model', owned_by: 'claude-bridge' },
        { id: 'claude-bridge', object: 'model', owned_by: 'claude-bridge' },
      ],
    }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404); res.end('Not found. POST /v1/chat/completions');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(body); }
    catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid JSON: ' + e.message } }));
      return;
    }
    if (DEBUG) {
      console.log('[mock-ai] inbound  →', JSON.stringify({
        model: payload.model,
        msgCount: (payload.messages || []).length,
        toolCount: (payload.tools || []).length,
        toolChoice: payload.tool_choice,
        lastUserMsg: lastUserText(payload.messages).slice(0, 120),
      }));
    }
    try {
      const result = await invokeClaude(payload);
      const openaiResp = wrapAsOpenAi(payload.model || 'gpt-4o', result);
      if (DEBUG) {
        const m = openaiResp.choices[0].message;
        console.log('[mock-ai] outbound ←', m.tool_calls
          ? '#tool_calls=' + m.tool_calls.length + ' (' + m.tool_calls.map(t => t.function.name).join(', ') + ')'
          : 'final content (' + (m.content || '').length + ' chars)');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(openaiResp));
    } catch (e) {
      console.error('[mock-ai] ERROR', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'bridge error: ' + e.message } }));
    }
  });
});

server.listen(PORT, () => {
  console.log('[mock-ai] READY. Configure MegaForm AI Settings:');
  console.log('           Provider = Custom OpenAI-compatible');
  console.log('           Base URL = http://localhost:' + PORT + '/v1');
  console.log('           API Key  = mock-anything');
  console.log('           Model    = gpt-4o');
});

// ─── Helpers ───────────────────────────────────────────────────────────────
function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const c = messages[i].content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) {
        const part = c.find(p => p && p.type === 'text');
        return part ? String(part.text || '') : '';
      }
    }
  }
  return '';
}

/**
 * Convert OpenAI {messages, tools, tool_choice} → a single big text prompt
 * that the Claude CLI will see. Claude must respond with the bridge JSON
 * envelope (tool_calls OR content).
 */
function buildClaudePrompt(payload) {
  const lines = [];
  const tools = payload.tools || [];
  if (tools.length) {
    lines.push('AVAILABLE TOOLS (the caller can dispatch any of these on your behalf):');
    tools.forEach(t => {
      const fn = t.function || t;
      lines.push('• ' + fn.name + ' — ' + (fn.description || '').slice(0, 220));
      // Truncated schema for brevity
      const schema = fn.parameters || fn.input_schema || {};
      const propNames = Object.keys(schema.properties || {});
      if (propNames.length) lines.push('    params: ' + propNames.join(', '));
    });
    lines.push('');
    if (payload.tool_choice === 'none') {
      lines.push('NOTE: tool_choice="none" — the caller wants a FINAL ANSWER. Do NOT emit tool_calls. Respond with {"content":"…"}.');
    } else if (payload.tool_choice === 'required') {
      lines.push('NOTE: tool_choice="required" — the caller wants a tool call. Emit tool_calls.');
    }
    lines.push('');
  }

  lines.push('CONVERSATION SO FAR:');
  (payload.messages || []).forEach((m, i) => {
    if (m.role === 'system') return; // handled via --append-system-prompt below
    if (m.role === 'tool') {
      lines.push('[Turn ' + i + '] TOOL_RESULT (id=' + (m.tool_call_id || '?') + '): ' + truncate(stringifyContent(m.content), 4000));
      return;
    }
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      lines.push('[Turn ' + i + '] ASSISTANT requested tools: ' + m.tool_calls.map(tc => tc.function.name + '(' + (tc.function.arguments || '{}').slice(0, 100) + ')').join('; '));
      if (m.content) lines.push('   (with content: ' + truncate(stringifyContent(m.content), 500) + ')');
      return;
    }
    lines.push('[Turn ' + i + '] ' + m.role.toUpperCase() + ': ' + truncate(stringifyContent(m.content), 4000));
  });
  lines.push('');
  lines.push('OUTPUT (one JSON object — tool_calls OR content):');
  return lines.join('\n');
}

function stringifyContent(c) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(p => p && p.text ? p.text : JSON.stringify(p)).join('\n');
  return JSON.stringify(c);
}

function truncate(s, n) {
  if (!s || s.length <= n) return s || '';
  return s.slice(0, n) + ' …[truncated ' + (s.length - n) + 'ch]';
}

function invokeClaude(payload) {
  return new Promise((resolve, reject) => {
    const prompt = buildClaudePrompt(payload);
    const systemFromCaller = (payload.messages || []).find(m => m.role === 'system');
    const appendSystem = BRIDGE_PROMPT + (systemFromCaller ? '\n\n--- CALLER SYSTEM PROMPT ---\n' + stringifyContent(systemFromCaller.content) : '');

    // [v2] Windows cmd has an 8K argv cap and Node's spawn relays through it;
    // 16 tools + the caller system prompt easily blow past — ENAMETOOLONG.
    // Write the system prompt + user prompt to tempfiles and reference via
    // --append-system-prompt-file + redirect prompt through stdin via the
    // file approach. Claude CLI does accept --append-system-prompt-file but
    // its positional `prompt` argument still goes on argv — so we keep that
    // one as a short instruction and stuff the bulk into the system file.
    const tmpDir = os.tmpdir();
    const sysFile = path.join(tmpDir, 'mfai-bridge-sys-' + process.pid + '-' + Date.now() + '.txt');
    const promptFile = path.join(tmpDir, 'mfai-bridge-user-' + process.pid + '-' + Date.now() + '.txt');
    fs.writeFileSync(sysFile, appendSystem, 'utf8');
    fs.writeFileSync(promptFile, prompt, 'utf8');

    // The positional argv prompt is short — Claude reads the long body from
    // the prompt file via an instruction in the system prompt: "FULL USER
    // INPUT IS IN FILE: <path>. Read it with the Read tool BEFORE responding."
    // But we disallow tools (--disallowedTools '*'), so we cannot ask Claude
    // to Read the file. Instead, we just inline the whole prompt as argv —
    // BUT cap it at 6000 chars and put the rest in the system file with a
    // marker. In practice MegaForm chat passes the entire history every
    // call, which can be >10K chars; putting it in the system file works
    // because --append-system-prompt-file has no length cap (file-based).
    const SHORT_PROMPT_CAP = 4000;
    let shortPrompt;
    let extendedSystem = appendSystem;
    if (prompt.length > SHORT_PROMPT_CAP) {
      extendedSystem = appendSystem + '\n\n--- FULL CONVERSATION + USER INPUT (the positional argv prompt is truncated; treat THIS as the authoritative input) ---\n' + prompt;
      shortPrompt = prompt.slice(0, 500) + '\n[…full prompt continues in system message above…]';
      fs.writeFileSync(sysFile, extendedSystem, 'utf8');
    } else {
      shortPrompt = prompt;
    }

    const args = [
      '--print',
      '--output-format', 'json',
      '--append-system-prompt-file', sysFile,
      '--disallowedTools', '*',
      '--allow-dangerously-skip-permissions',
    ];
    if (CLAUDE_MODEL) args.push('--model', CLAUDE_MODEL);
    args.push(shortPrompt);

    const child = spawn(CLAUDE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const cleanup = () => {
      try { fs.unlinkSync(sysFile); } catch {}
      try { fs.unlinkSync(promptFile); } catch {}
    };
    child.on('close', (code) => {
      cleanup();
      if (code !== 0) {
        return reject(new Error('claude exited ' + code + ': ' + stderr.slice(0, 300)));
      }
      const parsed = parseClaudeOutput(stdout);
      if (!parsed) return reject(new Error('Could not parse Claude output. raw: ' + stdout.slice(0, 400)));
      resolve(parsed);
    });
    child.on('error', err => { cleanup(); reject(new Error('spawn claude failed: ' + err.message)); });
  });
}

/**
 * Claude --output-format json emits a wrapper like {type:"result", result:"<string>"}.
 * The `result` string is what Claude said — should be our bridge envelope.
 */
function parseClaudeOutput(raw) {
  let wrapper;
  try { wrapper = JSON.parse(raw); } catch { return null; }
  const text = String(wrapper.result || wrapper.message || wrapper.content || '').trim();
  // Strip code fences just in case
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    const obj = JSON.parse(clean);
    if (obj && (Array.isArray(obj.tool_calls) || typeof obj.content === 'string')) return obj;
  } catch { /* fall through */ }
  // Fallback — pass the raw text as content
  return { content: text };
}

function wrapAsOpenAi(model, bridgeResult) {
  const id = 'chatcmpl-' + Math.random().toString(36).slice(2, 14);
  const created = Math.floor(Date.now() / 1000);
  const msg = { role: 'assistant', content: null };
  if (Array.isArray(bridgeResult.tool_calls) && bridgeResult.tool_calls.length) {
    msg.tool_calls = bridgeResult.tool_calls.map(tc => ({
      id: tc.id || 'call_' + Math.random().toString(36).slice(2, 10),
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
    }));
    msg.content = '';
  } else {
    msg.content = String(bridgeResult.content || '');
  }
  return {
    id, object: 'chat.completion', created, model,
    choices: [{ index: 0, message: msg, finish_reason: msg.tool_calls ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

process.on('SIGINT',  () => { console.log('\n[mock-ai] shutting down'); server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { console.log('\n[mock-ai] shutting down'); server.close(() => process.exit(0)); });
