# HANDOFF — AI form quality, local-CLI, P2-A compiler (2026-06-10)

Session continuation. Pairs with the MANDATORY spec
`Docs/HANDOFF_20260609_AI_FORM_BUILDER_AUDIT_FIXES.md` (read that first for the
P0/P1/P2 fix specs + acceptance tests; this doc records what was BUILT after P1-4
and the current live state).

---

## 0. Live host + how to run things

- **Host:** `E:\DNN_SITES\OqtaneSites\Oqtane.Fresh.10.1.0`, URL `http://localhost:5005`,
  login `host` / `Minh@2002`, **SiteId=1, SQLite**. Module DLLs + `MegaForm.Core.dll`
  live in the host ROOT dir; JS/CSS in `wwwroot\Modules\MegaForm\{js,css}`.
  SQLite DB: `…\Data\Oqtane-202605301132.db`. The MegaForm module is **ModuleId 793 on
  the Home page** (`localhost:5005/` renders the configured form).
- **Restart the server (IMPORTANT env gotcha):** harness-spawned shells inherit an OLD
  env block that LACKS `MEGAFORM_ALLOW_LOCAL_CLI` even though it is persisted at
  Machine+User. So when restarting, set it explicitly:
  ```powershell
  Stop-Process -Name Oqtane.Server -Force
  $env:MEGAFORM_ALLOW_LOCAL_CLI="1"; $env:ASPNETCORE_URLS="http://localhost:5005"; $env:ASPNETCORE_ENVIRONMENT="Production"
  Start-Process -FilePath "<host>\Oqtane.Server.exe" -WorkingDirectory "<host>" -WindowStyle Hidden
  ```
  Without the var, `/api/AiAssistant/LocalCliChat` → 403 "Local CLI disabled".
  Known B51 quirk: a stale process can keep port 5005; always Stop-Process FIRST.
- **claude CLI** auto-found at `C:\Users\Administrator\AppData\Roaming\npm\claude.cmd`.
- **Headless QA harness:** `MegaForm.UI/tools/mf-hb.cjs` (playwright-core, FRESH non-persistent
  context per run = NO http cache, so freshly-deployed bundles always load; logs in
  in-process). Run: `node tools/mf-hb.cjs --eval tools/<scenario>.cjs [--out shot.png]`.
  `tools/lib.cjs` exports `login(page)` (host/Minh@2002).

### Fast deploy without a Client rebuild
Because the harness uses a no-cache context, to iterate on a TS bundle you can just
`node scripts/build-entry.cjs <entry>` then copy the one JS file to the host
`wwwroot\Modules\MegaForm\js\` — NO version bump, NO Client rebuild, NO restart (static
file). Only bump versions + rebuild Client at the END for the user's browser cache.
Server (C#) changes DO need rebuild + DLL copy + restart.

---

## 1. What was DONE this session (all LIVE-PROVEN on the SQLite host)

### A. Local Claude CLI as MegaForm's AI provider (free, no token, no key)
- Server endpoint already existed (`MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs`
  `LocalCliChat`, gated by `MEGAFORM_ALLOW_LOCAL_CLI=1`). Configured AI Settings (site 1) to
  `provider=claude-cli, baseUrl=/api/AiAssistant/LocalCliChat, model=sonnet, enabled=true,
  apiKey=local` via `POST /api/AiAssistant/DefaultConfig`. PONG verified through the real
  `claude` spawn. QA: `tools/scn-localcli.cjs`.
- **Caveat:** local CLI is pure text (NO function-calling) → the chatbot's KB/SQL tool-use
  loop degrades to plain chat; best for AI Form Creator + simple edits. ~15–60s/call
  (haiku faster, sonnet better). Change model in Dashboard → AI Settings.

### B. AI Settings "Test" button → was HTTP 400 for claude-cli — FIXED
- `dashboard/index.ts aiTestConnection()` only had OpenAI/Anthropic branches → posted
  `baseUrl + '/chat/completions'` with `{messages}` → 400. Added a **claude-cli branch**
  (`provider==='claude-cli' || /LocalCliChat/i`) that POSTs `{prompt,model:'haiku'}` to
  baseUrl directly with `credentials:'same-origin'`. (Bundle marker `Local Claude CLI OK`.)

### C. "Create with AI" → "AI provider not loaded" — FIXED
- The dashboard deliberately does NOT load `megaform-ai-form-assistant.js` (the ~160KB
  bundle that sets `window.MF_AI`), and AI Settings "Save" only writes the SERVER config
  (never touches MF_AI). So `callAI()` threw. Fix in `dashboard/ai-form-creator.ts`:
  **`ensureMfAi()`** injects the AI bundle on demand (URL derived from the dashboard's own
  `<script src>` so base+`?v=` match; `data-mf-ai-bundle` guard), waits for MF_AI, then
  **`applySharedAiConfig()`** fetches `/api/AiAssistant/DefaultConfig` and `setConfig`s it
  authoritatively (so Create-with-AI honours the saved provider, not stale localStorage).
  `callAI()` now `await ensureMfAi()`. LIVE-PROVEN: dashboard `mfAiPreloaded:false` → inject
  → MF_AI loads → claude-cli `chatWithTools('PONG')`→PONG. QA: `tools/scn-ai-creator-boot.cjs`.

### D. AI-generated forms rendered BARE (no border, no header) — FIXED
Root cause chain: weak/cheap model opts into "premium custom-shell" (`settings.theme="custom"`)
but emits EMPTY customHtml/customCss → renderer adds `mf-theme-custom` → CSS **DoubleCardFix**
(`Assets/css/megaform.css` ~609) strips the default `.mf-form-inner` card expecting the theme
to supply one → bare; and the standard skeleton renders NO header band.
- `renderer/index.ts applyFormPresentationSettings`: `theme==='custom'` w/ empty customCss+
  customHtml → treat as `'default'` (default card renders).
- `renderer/index.ts buildSkeleton`: emits a `.mf-form-header` band (title+description) for
  standard forms (skipped when customHtml).
- `Assets/css/megaform.css`: `.mf-form-wrapper.mf-hide-header .mf-form-header{display:none}`
  (honour settings.hideHeader) — and **added `?v=` to megaform.css** in `Index.razor` (it had
  NONE → was a stale-CSS trap).
- `dashboard/ai-form-creator.ts normalizeFormChrome()`: cleans the SAVED schema (theme
  custom+empty → default) so builder/exports match. Called after `repairCustomHtmlPlaceholders`.

### E. P2-A — deterministic form-quality compiler (the "cheap AI = good forms" unlock)
**Approach (pragmatic, vs the full blueprint→compiler):** a deterministic post-AI compiler +
renderer GUARANTEES production quality regardless of what the cheap model emits. Driven by a
real-AI + screenshot QA loop. Generated 5 diverse forms (simple / VN-event / job / survey /
premium); sonnet output was already GOOD (semantic types, 2-col Rows, Sections, placeholders).
3 systematic gaps found + fixed:
1. **Header missing on some paths** → `buildSkeleton` reads `config.title || schema.title ||
   settings.title` (was config-only; standalone/preview render had no title).
2. **Premium request → plain form** (cheap model declares premium intent but won't author
   customHtml) → `normalizeFormChrome(schema, prompt)` now detects premium intent
   (`isPremiumIntent`) and, when there is no customHtml/customCss, deterministically applies a
   **colored header-band via SCOPED customCss** (`premiumHeaderBandCss`; gradient picked by
   domain via `pickPremiumGradient`: health=teal, finance=slate, event/marketing=pink→orange,
   edu=violet, default indigo). It styles the standard `.mf-form-header`, so layout + 2-col Rows
   stay intact (no fragile `{{field:KEY}}` token-mapping). The user prompt is threaded from
   `callAI(userText)`.
3. **Vietnamese garbled** ("â”€Ã‰…") → `AiAssistantController.LocalCliChat` psi now sets
   `StandardOutputEncoding / StandardInputEncoding / StandardErrorEncoding = UTF8` (was the
   Windows OEM codepage mangling UTF-8).

**LIVE-PROVEN end-to-end (real AI → compiler → render):** VN form title "Đăng Ký Hội Thảo" +
all-VN labels correct; premium "DevCon 2026" renders a real pink→orange gradient banner +
ticket-price radios; all 5 forms have card + header. Screenshots in `tmp-qa/p2/`.

---

## 2. Files changed this session

C# (server — rebuild MegaForm.Oqtane.Server + Core, copy DLLs to host root, restart):
- `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs` — LocalCliChat psi UTF-8 encodings.

TS bundles (rebuild via `node scripts/build-entry.cjs <entry>`, copy the JS to host js dir):
- `MegaForm.UI/src/dashboard/index.ts` — `aiTestConnection` claude-cli branch. (entry: `dashboard`)
- `MegaForm.UI/src/dashboard/ai-form-creator.ts` — `ensureMfAi`/`applySharedAiConfig`,
  `normalizeFormChrome(schema,prompt)` + premium helpers, `_callAI`/`_compile` window hooks. (`dashboard`)
- `MegaForm.UI/src/renderer/index.ts` — theme custom+empty→default; `.mf-form-header` band;
  header reads schema.title. (entry: `renderer` → `megaform-renderer.js`)
- `Assets/css/megaform.css` — `.mf-hide-header .mf-form-header` rule (synced by build).

Razor (rebuild MegaForm.Oqtane.Client, copy `MegaForm.Oqtane.Client.Oqtane.dll`, restart):
- `MegaForm.Oqtane.Client/Index.razor` — `OqtaneCoreAssetVersion="20260610-B115"` (renderer/css/
  core bundles), `megaform.css?v={OqtaneCoreAssetVersion}` (added), `megaform-dashboard.js?v=20260610-B115`.

QA harnesses (read-only tools, in `MegaForm.UI/tools/`):
- `scn-localcli.cjs` (config + PONG), `scn-ai-creator-boot.cjs` (Create-with-AI bundle boot),
- `scn-p2-generate.cjs` (generate+save+render — NOTE: saves rebind module 793),
- `scn-p2-render.cjs` (FAST: render cached `tmp-qa/p2/*.json` standalone via
  `MegaFormRenderer.init` on Home + apply `_compile`; set `MF_ONLY=name` env to filter),
- `scn-p2-live.cjs` (end-to-end real AI → render), `scn-restore-home.cjs` (rebind 793→form 8).

---

## 3. Current deploy / version state

- Bundles + DLLs deployed to the host; assets serve 200 at:
  `megaform-renderer.js?v=20260610-B115`, `megaform-dashboard.js?v=20260610-B115`,
  `megaform.css?v=20260610-B115`. Server (Core + Oqtane.Server) + Client DLLs current.
- `BUILDER_BUNDLE_VERSION` (loader/index.ts) was bumped to `20260609-B113` externally but the
  **builder bundle + loader were NOT rebuilt this session** — deployed loader is B112 content
  served at `?v=20260609-B112` (consistent). If you touch the BUILDER bundle, rebuild
  `builder-loader` + `builder` + bump the loader `?v=` in Index.razor.
- AI Settings (site 1): provider=claude-cli, model=sonnet, enabled=true.

---

## 4. Traps / gotchas discovered (do not relearn the hard way)

1. **Restart env var** (§0) — biggest footgun; LocalCliChat 403 without it.
2. **`megaform.css` had NO `?v=`** → CSS edits looked "not applied" due to browser cache. Now
   versioned by `OqtaneCoreAssetVersion`. The headless harness is immune (fresh context).
3. **Oqtane has no AddNewtonsoftJson** → `[FromBody] JObject` binds to **null**; use
   `[FromBody] JsonElement` (pattern in MegaFormController.LockForm / our ExecuteDdl).
4. **AiTools route** on Oqtane is `/api/AiTools` (resolves SiteId from auth, NOT the URL alias);
   the MegaForm CRUD base is `/api/MegaForm/` and the popup base `/api/MegaFormPopup/`. Posting
   AiTools calls to the CRUD base → 404 (this bit ExecuteDdl + the dashboard ExecuteDdl).
5. **DoubleCardFix** strips the card for any `mf-theme-*` (non-default) form expecting the theme's
   own CSS — so an empty custom theme = bare. (Fixed for the empty case.)
6. **Form render requires `Status=="Published"`** (`Index.razor:959`). A direct save with
   Status:"Active" shows "This form is not published yet". The QA generate harness rebinds
   module 793 — `scn-restore-home.cjs` restores it to published form 8.
7. **Form table is `MF_Forms`** (PortalId not SiteId column); the Oqtane Log table is `Log`.
8. The AI-creator PREVIEW pane wraps the form in its OWN card + title (masks chrome bugs) — QA
   the REAL render (Home or `MegaFormRenderer.init` standalone), not the preview.

---

## 5. What REMAINS

### P1-4 follow-ups (documented in the 2026-06-09 handout, lower priority)
- (e) plumb `allowDesignReset:true` into the builder save for the AI `designDecision='change'`
  flow; (b) Oqtane Save JSON schema-parse parity; (c) port DNN `DryRunValidate` to Oqtane
  (provider-aware) as a canonical pre-save SQL validator on both platforms.

### P2 (the rest of the strategic unlock)
- **Full blueprint→compiler for SQL-connected forms:** resolve table/column names against the
  REAL schema (the now-working P0-2 SQL tools / Subform) so AI SQL-bound forms (Select optionsSql,
  DataGrid masterQuery, cascade) don't hallucinate names. P2-A so far only fixes CHROME quality;
  SQL-name correctness is the next big piece.
- **Widget-config schema validation** (DataRepeater raw-JSON columns etc.) — reject invalid JSON
  before stage instead of storing a raw string (`megaform-datarepeater-adapter.ts:290`).
- **Automated post-Apply render-QA wired into `mf-hb.cjs` as a gate** — after generate, assert:
  no console errors, required fields visible, SQL/cascade options populate, no mobile overflow,
  no unresolved `{{content:*}}`, has card+header. (The `scn-p2-render.cjs` checks are a starting set.)
- **Golden-prompt eval harness (VN + EN)** — deterministic pass/fail scoring across: simple form,
  SQL dropdown, cascade, master-detail, invoice app, booking app, convert-old-design,
  change-layout-keep-CSS. Run vs a cheap model after each AI-builder change to prevent regressions.

### Recommended next step
Either (1) extend the deterministic compiler to SQL-name resolution (highest product value for
"AI rẻ vẫn chuẩn" on database forms), or (2) build the golden-prompt eval harness so quality is
regression-protected. Both build directly on the P2-A compiler + the QA harnesses already here.

---

## 6. Cleanup notes
- QA left forms **#9–13** (Status=Active "AI Form"/"DevCon"/etc.) in the dashboard — harmless,
  user can delete. Home is restored to published form **#8** (Doctor Appointment).
- `tmp-qa/` contains the test projects (`SqlGuardTest` 29/29, `DesignGateTest` 18/18, `SqliteRead`
  DB inspector) + `tmp-qa/p2/*.png|json` (the P2-A screenshots + cached AI schemas). These are
  scratch QA artifacts, not shipped code.
