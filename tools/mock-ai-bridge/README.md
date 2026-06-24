# MegaForm AI Mock Bridge

Local HTTP server that speaks the OpenAI `/v1/chat/completions` protocol and
routes every request to your installed Claude Code CLI. Pointing the MegaForm
AI Form Assistant at this bridge replaces OpenAI API calls with your already-
paid Claude Code subscription — zero per-request cost during testing.

## Prereqs

- Node.js (any v18+ — comes bundled with most dev setups)
- Claude Code installed via VSCode extension (auto-located) OR `claude` on PATH

The bridge auto-discovers `claude.exe` inside
`~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/`. If
your install lives elsewhere, set `CLAUDE_BIN=<absolute path>` before starting.

## Start

```bash
node server.cjs
# or
DEBUG=1 node server.cjs                                # see every request
PORT=9000 CLAUDE_MODEL=claude-opus-4-5 node server.cjs  # custom port + model
```

You'll see:

```
[mock-ai] READY. Configure MegaForm AI Settings:
           Provider = Custom OpenAI-compatible
           Base URL = http://localhost:8787/v1
           API Key  = mock-anything
           Model    = gpt-4o
```

## Configure MegaForm

Open any MegaForm builder, click the AI sparkle (purple wand bottom-center)
to open the chat panel, then click the gear ⚙️ in the chat panel header:

| Field      | Value                                |
|------------|--------------------------------------|
| Provider   | `Custom OpenAI-compatible`           |
| Base URL   | `http://localhost:8787/v1`           |
| API Key    | anything non-empty (e.g. `mock`)     |
| Model      | `gpt-4o` (echoed; ignored by bridge) |

Click **Test connection** → should report `OK · …`. Click **Save**.

From this point on, every AI prompt in MegaForm hits Claude Code instead of
OpenAI. The MegaForm tool-use loop still works because the bridge:

1. Parses incoming OpenAI `{messages, tools, tool_choice}` payload
2. Reformats into a single instruction for Claude (full history, tools described as text, bridge envelope rules)
3. Spawns `claude --print --output-format json --append-system-prompt … --disallowedTools '*'` so Claude can't call tools directly
4. Parses Claude's JSON response — expects either `{"tool_calls":[...]}` or `{"content":"…"}`
5. Wraps as OpenAI completion shape with `finish_reason:"tool_calls"` or `"stop"`
6. Returns to MegaForm browser, which dispatches the tools via its dispatcher and POSTs back with results on the next turn

The bridge is **stateless** — each request carries its own full history, so multi-turn tool-use rounds work transparently.

## Architecture

```
   Browser MegaForm chat.ts
        │ POST /v1/chat/completions
        ▼
   ┌───────────────────────────┐
   │  bridge server.cjs :8787  │
   └──┬────────────────────────┘
      │  spawn claude.exe --print --output-format json
      ▼
   Claude Code (uses your OAuth subscription)
      │  returns {"result":"<bridge envelope JSON>"}
      ▼
   bridge unwraps → OpenAI shape
      │
      ▼
   Browser dispatches tool_calls via MFAI_Tools, loops back
```

## Quirks / Limitations

- **Latency**: each turn spawns a fresh Claude process — expect 3–8s per
  request. For interactive testing this is fine; for stress tests prefer
  the real OpenAI route.
- **No streaming**: the bridge returns one full response per turn (no SSE).
  MegaForm chat.ts doesn't stream either, so this is invisible.
- **Image attachments**: forwarded as text descriptions only in the prompt
  (Claude CLI in `--print` mode doesn't accept binary image input yet).
- **Multi-tenant** Oqtane sites: per-tenant config is saved in browser
  localStorage; bridge is shared across tenants.
- **OAuth dependency**: if `claude.exe` reports "Not logged in", open the
  Claude Code panel in VSCode and complete login first. The bridge cannot
  re-auth on your behalf.

## Smoke test

```bash
curl -X POST http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role":"system","content":"You are a MegaForm Form Assistant."},
      {"role":"user","content":"Make a contact form: name, email, message."}
    ],
    "tools": [
      {"type":"function","function":{
        "name":"list_knowledge",
        "description":"Search the form-pattern KB.",
        "parameters":{"type":"object","properties":{"kind":{"type":"string"},"search":{"type":"string"}},"required":["kind"]}
      }}
    ],
    "tool_choice": "auto"
  }'
```

Expect a 200 with `choices[0].message.content` containing
`{"ops":[{"op":"add_field",…},…],"explain":"…"}`.

## Shutdown

`Ctrl+C` in the bridge terminal — clean SIGINT handler closes the server.

## Files

- `server.cjs` — the bridge (single file, no deps beyond Node stdlib)
- `README.md` — this file
