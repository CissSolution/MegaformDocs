# HANDOFF — Fast form wired into an Oqtane page via iframe (B208) — 2026-06-20

Continuation of the form-load work ([HANDOFF_20260620_SESSION_SWITCH_FORM_LOAD.md](HANDOFF_20260620_SESSION_SWITCH_FORM_LOAD.md),
B203→B207). User picked **"Iframe embed (safe)"** to wire the B207 fast render-page into a real
Oqtane-site page. DONE + fully verified live on **:5070** (Oqtane.MSSQL3, net10.0).

## What shipped (B208, live :5070)

| Piece | File | What |
|---|---|---|
| Auto-resize broadcast | `MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs` | The render page now `postMessage`s its content height to the parent on load + ResizeObserver, so an embedding iframe can size itself (no inner scrollbar / clip). Version const `RenderPageAssetVersion = 20260620-B208`. |
| Embed wrapper page | `…\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\embed.html` (+ source copy in `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/embed.html`) | Static page served in INITIAL HTML (no Blazor circuit). Reads `?formId=`, embeds `/api/MegaForm/render/{id}`, listens for `mf-resize` and sizes the iframe. Optional `?maxw=720` / `?maxw=full`. |

Deploy was: build `-c Release -f net10.0` → stop the :5070 `Oqtane.Server.exe` → swap
`MegaForm.Oqtane.Server.Oqtane.dll` at the MSSQL3 root → restart. Backup:
`_mfbackup_20260620_112325_preB208_*.dll`.

## How to use
- **Standalone fast URL:** `http://localhost:5070/Modules/MegaForm/embed.html?formId=729` — link it / QR / button. Form paints in ~110–300 ms (warm), auto-sized.
- **Inside an Oqtane CMS page (in nav):** add a module that allows raw HTML+JS and paste:
  ```html
  <iframe id="mf-embed-729" src="/api/MegaForm/render/729" style="width:100%;border:0;min-height:480px" scrolling="no"></iframe>
  <script>addEventListener('message',function(e){if(e.origin===location.origin&&e.data&&e.data.type==='mf-resize'&&e.data.formId===729){document.getElementById('mf-embed-729').style.height=e.data.height+'px';}});</script>
  ```
  ⚠️ Oqtane's built-in **HtmlText sanitizes** `<script>`/`<iframe>` — if it strips them, use a raw-HTML
  theme/module, OR just iframe `embed.html` with a fixed height, OR build the Static-mode
  "Fast Form" module (the option the user deferred). The `render` endpoint has **no
  X-Frame-Options/CSP** blocking same-origin framing (verified).

## Two ratchet bugs found + fixed (both in the resize script)
1. **`documentElement.scrollHeight` ratchet** — once the parent grows the iframe, `documentElement.scrollHeight` pins to the (tall) viewport and can't shrink → broke multi-step forms that collapse after hydration. Fix: measure `#mf-form-mount` rect + `body.scrollHeight`, never `documentElement`.
2. **`min-height:100vh` ratchet (premium templates)** — page-style templates (`.mfp-*`, e.g. festa 729) use `min-height:100vh`; in a tall iframe `100vh` == iframe height → form fills it → `body.scrollHeight` == iframe height → re-broadcasts tall forever (729 stuck at 3027 px with dead-space). Fix: in embed context only, inject `html,body{height:auto;min-height:0}#mf-form-mount-{id},.mf-form-wrapper,.mf-form,.mf-form-inner,[class*="mfp"]{min-height:0!important}` before measuring.

## Verified live (harnesses in `tmp-qa/`, screenshots in `MegaForm.UI/qa-out/`)
- **iframe in INITIAL html: YES** (static wrapper, no circuit).
- **Auto-resize:** 729 gap **0 px** (1134), 743 gap **1 px** (1062). Premium 100vh no longer ratchets; multi-step collapses correctly (729 timeline 460→3027 transient ~112 ms→1134).
- **Fast paint:** first field visible ~108–127 ms warm.
- **Interactive in iframe:** filled fields, advanced steps (729 → step II rendered).
- **Submit E2E in iframe:** form 742 → `POST /api/MegaForm/Submit` **HTTP 200**, "**Submission received — Submission ID #200**" in-card success rendered + correctly sized. (Submit endpoint is `[AllowAnonymous]`+`[IgnoreAntiforgeryToken]`, cookie SameSite=Lax → same-origin iframe submit works.)
- Harnesses: `render-proof*`, `embed-proof`, `embed-timeline`, `embed-interactive`, `embed-submit-any` (`node tmp-qa/<file>.cjs [formId]`).

## B209→B211 — the MODULE itself renders the fast iframe (user-requested, DONE+verified live)
User: "I want a MegaForm module on a normal Oqtane page that loads fast — make the module render the
iframe like the demo." Implemented in `MegaForm.Oqtane.Client/Index.razor` (Blazor module):
- **B209** — form-view branch renders `<iframe src="/api/MegaForm/render/{id}">` instead of the
  circuit-gated JS mount; auto-resize listener wired via `BuildFastEmbedBootScript()` (eval in
  OnAfterRender — an inline `<script>` emitted by Blazor would NOT run). Field `_fastEmbed`.
- **B210** — **DEFAULT ON** for the public form view (per user). Disable per-module with setting
  `MegaForm:FastEmbed=false` or `?mffast=0`; `?mffast=1` forces on. Excludes popup/embed.
- **B211** — **`public override bool? Prerender => true;`** so Oqtane renders the module in the
  INITIAL HTML (SiteRouter copies the component's `Prerender` into `Module.Prerender` →
  ModuleInstance renders `Interactive:Server prerender:True`). The fast-embed `<iframe>` now lands
  in the first HTTP response → form paints with the page, **no circuit wait**. `InjectInlineScript`
  is wrapped in try/catch because JS interop throws during the static prerender pass (re-runs after
  hydration). `OqtaneCoreAssetVersion 20260620-B211`.

**Verified live (anon, :5070):**
- **curl `/`** (raw, no JS): contains `id="mf-fast-…"` + `src="/api/MegaForm/render/732"` and the
  Oqtane comment `rendermode: Interactive:Server - prerender: True` → **iframe IS in initial HTML.**
- Browser: iframe present at commit (pre-JS)=YES; form fields visible @~2.35s on the **heavy Home**
  page (FCP 2128ms is Home's own weight — AcmeSkin theme + many modules — not MegaForm; on a normal
  light page the form paints with the page ~300–500ms). Auto-resize gap 1px. **0 console errors anon.**
- Before: STANDARD module form on Home was **BLANK** (the handoff's "anon Home blank" bug) → fast-embed
  both FIXES the blank and removes the circuit wait.
- **Admin NOT broken by prerender:** Dashboard renders (Form Management/Apps&Forms/Create-with-AI),
  edit-mode dock (Settings/Form Builder/Form Dashboard) present, no `.blazor-error-ui`. The
  `_h is not defined` + 404 console errors in HOST/EDIT context are the **AcmeSkin theme (Issue A)**,
  NOT MegaForm (anon = 0 errors; my code has no `_h`).
- Build: `dotnet build MegaForm.Oqtane.Client … -c Release -f net10.0` → deploy
  `MegaForm.Oqtane.Client.Oqtane.dll` to MSSQL3 root + restart. Backups `_mfbackup_*_preB210defaulton_*`,
  `_mfbackup_*_preB211prerender_*`. Harness `tmp-qa/module-fastembed-20260620.cjs`, `admin-check-prerender-20260620.cjs`.

## B212 — PRERENDER REVERTED (double-load fix; user-reported, verified)
User found prerender (B211) caused a **double-load**: `render/{id}` ×2, `Schema/{id}` ×2, the form's
JS bundles ×2 and its images ×2 per page load. **Root cause:** Oqtane's interactive hydration
RECREATES the prerendered `<iframe>` (RenderModeBoundary re-renders on circuit connect) → the iframe
reloads its src a second time. **`@key` + deterministic markup did NOT prevent it** (verified — still
×2). So this is inherent to prerender + an iframe, not fixable cheaply.

**Fix (B212):**
- **Removed `Prerender => true`** (commented out, do NOT re-enable for the iframe path). Module is
  back to Interactive-no-prerender → the iframe renders ONCE, after the circuit. `prerender: False`
  confirmed via curl; `render/{id}` and `Schema/{id}` now ×1 (verified, 0 console errors).
- **Synced asset versions to `20260620-B212`** (both `OqtaneCoreAssetVersion` client + `RenderPageAssetVersion`
  server). Side benefit: the parent module and the iframe now request the SAME `*.js?v=B212` URLs →
  the browser cache dedupes them, so the core bundles load **once** instead of twice (B211 vs B208
  were different URLs → 2 downloads).
- Iframe markup made deterministic + `@key` (kept; harmless without prerender).

**Trade-off:** the form now paints AFTER the circuit (~1s on a light page, ~4s on the heavy AcmeSkin
Home) instead of instant — but it's a single clean load, no flicker, no doubled API/images. Still
fixes the "anon Home blank form" and is far better than the stuck standard render. **To get instant
paint AND a single load would need true field-level SSR + an idempotent/hydrating renderer (the
deferred "renderer not idempotent" item) — not the iframe.** Harness `tmp-qa/count-double-20260620.cjs`.

## Notes / leftovers
- Test submission **#200 left on form 742** (`summary.json`, a minimal test form) — benign.
- The render page still loads each form's own external Google Fonts + hero images (form CONTENT, not framework) → cold first paint pays those (preconnect added). Author should self-host fonts + WebP heroes.
- Investigation also confirmed (Oqtane source `E:\DNN_SITES\OqtaneSites\oqtane.framework-dev`): a module CAN override `RenderMode => RenderModes.Static` or `Prerender => true` (HtmlText does) → a Static "Fast Form" module is feasible WITHOUT forking Oqtane, if the in-nav CMS path is wanted later.
