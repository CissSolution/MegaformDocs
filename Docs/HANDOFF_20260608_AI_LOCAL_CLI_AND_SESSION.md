# MegaForm — Session Handoff & Handout (2026-06-08)
**Covers B84 → B88. Read this first to continue in a new session.**

---

## 0. TL;DR — what shipped this session

| Tag | Feature | State |
|---|---|---|
| **B84** | Dashboard **AI Settings** page (provider/key/model + Enable toggle) → single shared store `MegaForm_AI_*`. Per-browser cog removed from the chatbot; chatbot now gates on the Enable toggle. | ✅ shipped + QA'd |
| — | **CISS + MegaForm share one AI config** (CISS reads MegaForm's `/api/AiAssistant/DefaultConfig`). | ✅ shipped + QA'd |
| **B85** | **Portal + Row-Level Security** PoC: fixed a real RLS-bypass leak; `Portal/SetPrivate`+`Portal/Status`; `portal.html` "My Records". | ✅ shipped + QA'd (anon 200→403) |
| **B86** | Dashboard **Portal toggle** per form; **`?mfpanel=portal`** surface; **team scope** (`Scope="team:<field>"`, no migration); **AI op `set_record_visibility`**. | ✅ shipped + QA'd |
| **B87** | 4 builder UX fixes: label→key auto-derive; Field Properties always expanded; tighter header; Build tabs match Design tabs. | ✅ shipped + QA'd |
| **B88** | **Claude Local CLI** AI provider — free, no token, no API key. | ✅ shipped + **verified (PONG, 4.3 s)** |

---

## 1. ⭐ Claude Local CLI (B88) — the headline of this turn

MegaForm's AI now runs on the **local Claude Code CLI** on the server (`claude -p`), so there is **no API key and no token cost**. CISS shares the same config, so both modules use it.

### How it works
```
Browser (MF_AI / chatbot / AI Form Creator)
  → POST /api/AiAssistant/LocalCliChat  { prompt, systemPrompt?, model?, timeoutMs? }
     (admin-only, [Authorize] + IsAdmin, IgnoreAntiforgeryToken)
  → server spawns:  claude -p --model <m> --disallowedTools "*"   (prompt via STDIN)
  → returns { ok, content, model, durationMs }
```

### Files
- **Server endpoint:** `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` → `LocalCliChat` + `LocalCliChatBody` (ported from the CISS `AiToolsV1Controller.local-cli-chat`). Gated by env **`MEGAFORM_ALLOW_LOCAL_CLI=1`** (also accepts `ACME_ALLOW_LOCAL_CLI`). CLI path auto-discovered (`%APPDATA%\npm\claude.cmd`, etc.; override with `MEGAFORM_CLAUDE_CLI`).
- **Client provider:** `MegaForm.UI/src/ai-form-assistant/providers.ts` → new provider `claude-cli` (`api:'claude-cli'`, `baseUrl:'/api/AiAssistant/LocalCliChat'`, models `default|haiku|sonnet|opus`). `chatWithTools` flattens the chat into one prompt, POSTs, parses `content`. **No API key required** (the key check is skipped for `claude-cli`; `loadServerDefault` accepts it on provider name). When `jsonMode`, it appends a "raw JSON only" instruction + strips ``` fences.
- **Dashboard dropdown:** `MegaForm.UI/src/dashboard/index.ts` → `AI_PROVIDERS['claude-cli']` so admins can pick "Claude Local CLI (free · no token)" in the AI Settings modal.

### Current live config (already set on the host)
Shared AI store (`MegaForm_AI_*` on site 1):
```
provider = claude-cli
baseUrl  = /api/AiAssistant/LocalCliChat
model    = sonnet
apiKey   = local        (placeholder; not used by claude-cli)
enabled  = true
```

### Enable flag — IMPORTANT
`MEGAFORM_ALLOW_LOCAL_CLI=1` is now a **persistent** Machine+User env var (set via `[Environment]::SetEnvironmentVariable`). Any restart of `Oqtane.Server.exe` inherits it. If it ever 403s with *"Local CLI disabled"*, the running server was started by a process that predates the env var → restart it.

### ⚠️ Known limitations (document for users)
1. **No function-calling.** claude-cli is pure text completion. The chatbot's KB tool-use loop (list_widgets, get_table_columns, app_batch, …) **does not function-call** — it degrades to plain chat. Best fit: the **AI Form Creator** (simple JSON) and quick edits. For the full tool-driven chatbot, use a real OpenAI/Claude API key.
2. **Per-call latency** = one `claude` process spawn per request: haiku ≈ 4 s (verified), sonnet/opus slower, cold start higher. Fine for occasional use; for heavy use consider a persistent CLI session / streaming (future work).
3. **Server-side auth.** `claude -p` uses the *machine's* Claude Code login. The Oqtane server runs as Administrator here, which is authenticated. On another box, `claude` must be logged in for the server's user.
4. The user is **co-building a parallel `megaform-local` provider** (`/api/MegaFormAi`, a no-key KB provider). It coexists with `claude-cli` — don't remove either.

### Verified
`POST /api/AiAssistant/LocalCliChat {prompt:"Reply PONG", model:"haiku"}` → `{ok:true, content:"PONG", durationMs:4313}`.

### To use it (handout)
- It's already on. Builder chatbot (if Enable AI on) and "✨ Create with AI" now call claude local.
- Change provider anytime: **Dashboard → AI Settings → Provider = "Claude Local CLI"** → Save.

---

## 2. Host / build / deploy facts (read before any deploy)

- **Live host:** `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, URL `http://localhost:5005/?mfpanel=dashboard`, login `host` / `Minh@2002`, SiteId=1, moduleId=793. **No dev.lock.**
- **Module DLLs live in the host ROOT** (not a `bin/`): `MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`, `MegaForm.Oqtane.Client.Oqtane.dll`, `MegaForm.Oqtane.Shared.Oqtane.dll`. JS/CSS in `wwwroot\Modules\MegaForm\{js,js\bundles,css}`. `portal.html` in `wwwroot\Modules\MegaForm\`.
- **Build:** `cd MegaForm.UI && npm run build:<entry>` (entries: ai-form-assistant, dashboard, loader, builder, …) auto-syncs bundles into `MegaForm.Oqtane.Server/wwwroot/...`. Then copy to the host. `.NET`: `dotnet build MegaForm.Oqtane.Server -c Release` (builds Core too) + `MegaForm.Oqtane.Client`.
- **Restart sequence (the B51 quirk + 5005):**
  ```powershell
  Get-Process Oqtane.Server -EA SilentlyContinue | Stop-Process -Force; Start-Sleep 3
  # copy DLLs + bundles to the host …
  $env:ASPNETCORE_URLS="http://localhost:5005"   # bare exe defaults to 5000; DB alias is :5005
  Start-Process "$host\Oqtane.Server.exe" -WorkingDirectory $host -WindowStyle Hidden
  ```
  After restart the **API session token resets** — the page cookie still shows "signed in" but `/api/...` may 403; re-login for admin API QA.
- **🪤 CACHE-VERSION TRAP (hit 3×):** the `?v=` for `megaform-dashboard.js` + `megaform-builder-loader.js` is set by **Oqtane Resource entries in `MegaForm.Oqtane.Client/Index.razor` (~line 727-728)** — NOT only DashboardView/loader. To ship a JS/CSS change end-users will actually fetch: bump that Resource `?v=` AND `BUILDER_BUNDLE_VERSION` in `loader/index.ts` (controls builder/ai/css), rebuild **Client** (`dotnet build … --no-incremental` — Razor sometimes won't recompile incrementally; verify with a UTF-16 string search in the built DLL), deploy. Current stamps: dashboard `?v=20260608-B88`, loader `?v=20260608-B94`, builder/ai/css `BUILDER_BUNDLE_VERSION=20260608-B94`.
- See memories: `feedback-oqtane-asset-cache-versions`, `reference-local-oqtane-host`, `project-shared-ai-settings-megaform-ciss`, `project-portal-rls-poc`.

---

## 3. Portal + Row-Level Security (B85–B86) recap

- **RLS engine was ~90% pre-existing.** `MF_Submissions.UserId` captures the submitter; `PermissionService.ScopeMatchesSubmission` handles `own` / `all` / now `team:<field>`. Per-row filtering runs in `MegaFormController.ListSubmissions`.
- **Security fix (B85):** a Published form with no `queryKey` was treated as a public list view → returned every row to anyone. Now gated on `!HasExplicitSubmissionViewRule(formId)`.
- **Endpoints (Oqtane MegaFormController):** `POST Portal/SetPrivate {formId,enabled}` (writes the canonical `{view, special:authenticated, own}` rule), `GET Portal/Status?formId=N`. `team:<field>` scope: record's `<field>` value ∈ viewer roles (encoded in the Scope string → **no DB migration**; an EF-mapped `TeamField` column had broken reads → that approach was reverted).
- **Surfaces:** `portal.html?formId=N` ("My Records"); `?mfpanel=portal` Oqtane panel (iframe); dashboard per-form "Portal & access" toggle; AI op `set_record_visibility {mode:"private-own"|"public"}`.
- **Not done:** real 2-user "each user sees only their own" clip (blocked by Oqtane user-provisioning friction — registration was disabled / admin-add emails the password; engine itself is proven via anon-403 + admin-all). DNN parity for the Portal endpoints. Spec: `Docs/PORTAL_RLS_SPEC_20260608.md`.

---

## 4. Suggested next steps (for the new session)
1. **Record the 2-user RLS clip:** `/admin/users → Settings → User Settings → Allow Registration=Yes, Require Verified Email=No → Save`; register a non-admin; on a form → dashboard "Portal & access" → Private; that user sees only their own via `portal.html?formId=N`.
2. **claude-cli polish:** stream output / keep a warm CLI session to cut latency; optionally map a subset of KB tools into the prompt so the chatbot is more useful on local CLI.
3. **Reconcile** `claude-cli` with the user's `megaform-local` provider (decide default).
4. **DNN parity** for Portal endpoints + a builder/dashboard "Portal mode" first-class view type.
5. Productionize the persistent env flag (it's set Machine/User; confirm the server's launch mechanism inherits it on reboot).

---

## 5. Key files touched this session
- Server: `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` (DefaultConfig + LocalCliChat), `Controllers/MegaFormController.cs` (Portal endpoints, RLS fix, team DataJson).
- Core: `Services/PermissionService.cs` (team), `Services/PermissionCatalogService.cs` (NormalizeScope team), `Models/AiAssistantModels.cs` (Enabled).
- Client (Razor): `MegaForm.Oqtane.Client/Index.razor` (Portal panel + Resource versions), `DashboardView.razor`.
- UI bundles: `src/ai-form-assistant/{providers.ts,chat.ts,ops.ts}`, `src/dashboard/index.ts`, `src/builder/{dom.ts,properties.ts,properties-patch.ts,theme-left-rail.ts}`, `src/styles/megaform-builder-ts.css`, `src/loader/index.ts`.
- Static: `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/portal.html`.
- CISS (shared AI): `E:\CISS.SideMenu.Nuget_GPT\src\ai-client\src\providers.ts` + `oqtane-ai-loader.js`.
- Docs: `Docs/PORTAL_RLS_SPEC_20260608.md`, this file.
