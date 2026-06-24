# Handoff — Form-load speedup (FastPaint), B203 → B207 — 2026-06-19/20

## ⏩ B207 update (2026-06-20) — "Cách B": server-rendered no-delay form PAGE

**Why:** the Oqtane MODULE is rendered as a Blazor Server interactive component that Oqtane does
**NOT prerender** (confirmed: initial HTML has only `<!--Blazor:{"type":"server"}-->`, empty — no
form/skeleton/spinner even with `?mfssr=1`). So ANYTHING the module renders waits for the SignalR
circuit (~1s+) — that's the irreducible "delay". Editing that needs forking Oqtane (host) or a
non-module render path.

**Built:** a standalone server-rendered form endpoint
**`GET /api/MegaForm/render/{formId}`** ([MegaFormController.RenderPage.cs](../MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs)):
returns a complete HTML document with the form already rendered server-side (`FormHtmlRenderer`,
reusing the Schema action's `RenderModelResolver` + `ThemePresetInlineCssService` +
`BuildAssetManifest`), structured to mirror the JS renderer's `buildSkeleton()` so the MegaForm JS
hydrates the same DOM (rebuild = one synchronous tick, **0 flash** verified). Self-hosted CSS only +
`preconnect` for any form-template external fonts + `preload` renderer.js. The JS boot fetches the
brotli-compressed Schema (~19KB) to hydrate (schema NOT inlined — that bloated the page 32KB→197KB).

**Proven (form 743, premium custom-HTML, 56 fields, 4-step):**
- **57 fields present in the INITIAL HTTP response** (curl-provable) vs **0** for the module path.
- Page **7.6KB brotli**, responseEnd **40–53ms warm**, **FCP ~450ms warm** (preconnect cut ~1s→450ms).
- Interactive after hydrate (typing, multi-step "Continue", submit), **0 console errors**, 0 flash.
- Renders identically (`MegaForm.UI/qa-out/render-page-743-final.png`). Page HTML is brotli-compressed.

Shipped Server DLL only (no Client/version change). Endpoint asset version const
`RenderPageAssetVersion = 20260620-B207`. Backup `_mfbackup_<ts>_preB207_*Server*` at MSSQL3 root.
Harnesses: `tmp-qa/render-page-test-20260620.cjs`, `render-page-interactive-20260620.cjs`.

**Honest scope / usage:**
- This is a **standalone URL** — use for fast public/marketing forms: link to it or `<iframe>` it.
  It is NOT the form embedded as the Oqtane module on a page (that keeps the circuit delay — inherent).
- Cold FCP still depends on the FORM's own content: form 743's customCss loads external Google Fonts
  (DM Serif/Inter/Geist) and 3.5MB hero PNGs. `preconnect` helps; the form author should self-host the
  fonts + re-encode the heroes to WebP for best cold performance (no image tool available here:
  cwebp/magick/sharp absent; PNGs referenced by the DB schema which can't be rewritten from a module).
- Kimi retest (`Docs/AUDIT_..._Retest.md`) confirmed the module form is ~1.5s warm; the 8.4s was a
  one-time cold-CDN fluctuation. The render page is the no-delay path when that matters.

---



## ⏩ B206 update (2026-06-20) — revert dashboard regression + self-host fonts

**(1) REVERTED the B205 anon admin-CSS gate** — it broke the admin **dashboard/panels** (rendered
unstyled). Root cause: `IsLightLoadContext` is not reliably "admin=false" at the moment Oqtane reads
`Resources` (ModuleState/PageState.User can be null on that pass), so admin CSS got gated for admins
too — and Oqtane does NOT re-inject `<link>` stylesheets on SPA panel nav, so the dashboard could
never recover the CSS. Admin CSS is **always-loaded again** (original design). Verified: dashboard
fully styled (`MegaForm.UI/qa-out/dashboard-B206.png`, `admin-shell` loaded). The compression from
B205 stays.

**(2) Self-hosted Font Awesome + DM Sans** (audit §3.1 — these were the MegaForm-injected external
render-blocking CSS; the other fonts Geist/DM-Serif/Inter/Roboto and Bootswatch come from the **theme
+ form template**, not MegaForm). Downloaded FA 6.5.0 (css + solid/regular/brands/v4compat woff2+ttf)
to `wwwroot/Modules/MegaForm/lib/fontawesome/`, and DM Sans (variable, 2 woff2 latin+latin-ext) to
`lib/fonts/dm-sans.css`. [Index.razor](../MegaForm.Oqtane.Client/Index.razor) Resource URLs now point
local. Verified: anon `?formid=743` HTML has **zero cdnjs/googleapis** refs; FA icons render
(`font-family: "Font Awesome 6 Free"`); form renders fine. Removes the third-party DNS/TCP/TLS on the
critical path.

Shipped **`OqtaneCoreAssetVersion 20260620-B206`** (Client DLL + new `lib/` assets). Backup
`_mfbackup_<ts>_B205_*` at MSSQL3 root. Lib assets also in repo `MegaForm.Oqtane.Server/wwwroot/.../lib/`.

> Notes: FA all.min.css is now same-origin (102KB) but still render-blocking + uncompressed (static
> files aren't compressed by the module middleware — host change needed). Further wins: subset FA to
> used glyphs; reduce the THEME/FORM fonts (not MegaForm). DNN side still loads FA/fonts from CDN —
> apply the same self-host to `FormView.ascx.cs` if DNN perf matters.

---



## ⏩ B205 update (2026-06-20) — acting on the user's form-743 perf audit

Triggered by `Docs/AUDIT_Form743_Performance_Oqtane_2026-06-19.md` (Playwright on
`http://localhost:5070/?formid=743`: FCP ~4.8s, fields ~8.4s). Implemented the two highest-impact
items that are SAFE and inside MegaForm's control:

**1. Response compression (Brotli+Gzip)** — added `AddResponseCompression` + `UseResponseCompression`
in MegaForm's `IServerStartup` ([Startup.cs](../MegaForm.Oqtane.Server/Services/Startup.cs)). The
Oqtane host doesn't enable compression. Result (verified by `Content-Encoding` header):
- **Schema/743 JSON: 164,961 → 19,107 bytes (−88%)** ✅
- **HTML page: compressed (`br`)** ✅
- **Static css/js: NOT compressed** ❌ — the module's `UseResponseCompression()` runs *after* the
  host's `UseStaticFiles()` (a module can't reorder host middleware), so `megaform.css` (107KB) and
  `megaform-renderer.js` (208KB) still ship raw. **To compress these, the Oqtane HOST needs
  `app.UseResponseCompression()` before `app.UseStaticFiles()` in its `Program.cs`** (host change,
  outside this repo) — would cut renderer.js→~60KB, megaform.css→~25KB.

**2. Gate admin-surface CSS for anonymous visitors** ([Index.razor](../MegaForm.Oqtane.Client/Index.razor)
`Resources` getter + `IsAnonGatedCss`). Anon now loads only the 3 core stylesheets; the 5 admin CSS
(`admin-shell` 45KB, `submissions-ts` 62KB, `my-inbox-ts` 43KB, `workflow-inbox-ts` 14KB, `listview` 11KB
≈ **175KB**) are dropped for anon (admins keep `IsLightLoadContext=false` → all CSS, so SPA panel nav
stays styled). Verified: anon `?formid=743` HTML contains only `megaform.css`/`-widgets`/`-themes`.

**Measured (form 743, B205):** fields visible **~8.4s → 3.6s cold / 0.86s warm**; FCP 4.8s → 3.4s cold /
0.52s warm; skeleton fills the residual gap. Form renders correctly (56 fields, submit present — see
`MegaForm.UI/qa-out/form-743-B205.png`). Shipped as **`OqtaneCoreAssetVersion 20260620-B205`** (Client +
Server DLLs). Backups `_mfbackup_<ts>_B204_*` at MSSQL3 root.

**Still needs HOST / THEME / CONTENT changes (NOT the MegaForm module — flagged for the user):**
- Static css/js compression → host `Program.cs` (above).
- External render-blocking ~3.4s cold (Bootswatch Bootstrap = the Oqtane **theme**; Font Awesome +
  Google Fonts loaded by MegaForm could be self-hosted/preconnected but Oqtane's Resource model has no
  `media=print onload`/`preconnect` hook) → theme + self-host work.
- Hero PNGs ~3.5MB (`bulgaria-rose-hero.png` etc.) are **form-template content** → the author should
  re-encode to WebP/AVIF + `loading=lazy`/`srcset`. Not a framework change.
- Inline schema into the boot (removes the late Schema fetch) — now less urgent since Schema is 19KB
  brotli; still the deferred ship-with-care item.

---



## ⏩ B204 update (2026-06-20) — "dock and form must appear at the same time"

User feedback on B203: the admin dock (Settings / Form Builder / Form Dashboard) appears
immediately but the form lands ~2s later → blank gap → "fix so the admin button and the
form appear at the same time."

**Root cause (confirmed live):** the MegaForm module **does NOT prerender** — `curl /` returns
the page with the form area completely absent (no mount, no skeleton, no spinner). The dock +
form both render only AFTER the SignalR circuit connects. The dock is static Razor (renders on
the first interactive render); the form needs the async JS boot (core-script inject + Schema
fetch + `renderer.init`) ≈ +2s. The B203 skeleton lived only in the `_loading=false` form-mount
branch, so during the `_loading=true` window the user saw the bare `mf-load-spinner`, not the
skeleton — hence the gap.

**Fix (B204):** `_formId` is resolved **synchronously** from the module settings *before* the
first `await` ([Index.razor](../MegaForm.Oqtane.Client/Index.razor):1356-1408), so the loading
window already knows whether this module renders a form. Extracted the skeleton into a reusable
`RenderFormSkeleton` fragment and render it **during `_loading`** (gated `_formId>0 && IsFormMode
&& !IsPopupMode && _panelMode==None && !_embedMode`) instead of the spinner. Now the dock and the
form-shaped skeleton render in the **same** Blazor pass.

**Verified (Playwright, host-logged-in Home):** `dock` and `skeleton` both first-seen at **2335 ms,
delta 0 ms** (appear together); `spinner: NEVER`; real form swaps in after. Screenshot:
`tmp-qa/host-dock-skeleton-20260620.png` (dock + form-frame skeleton, no blank gap). Anon warm:
skeleton 1.2s → form 2.4s. Harnesses: `tmp-qa/timeline-host-20260620.cjs`, `timeline-home-20260620.cjs`.

Shipped as **`OqtaneCoreAssetVersion 20260620-B204`** (Client DLL only; CSS/Server unchanged).
Backup `_mfbackup_<ts>_B203_MegaForm.Oqtane.Client.Oqtane.dll` at MSSQL3 root.

> Note: the *real* form still arrives after the JS boot (it's a placeholder until then). To make
> the real fields (not a skeleton) appear with the dock requires server-side SSR field render —
> still deferred (double-render flash risk; see below). The skeleton removes the *perceived* gap,
> which is what the feedback asked for.

---

# Handoff — Form-load speedup (FastPaint), B203 — 2026-06-19 (overnight)

User asked (while going to sleep) to implement the three suggestions from their own
re-measurement and **measure the result accurately**:

1. **Prerender the form frame** so the form area shows from the initial HTML (no blank gap while the SignalR circuit negotiates).
2. **Skeleton / loading placeholder** at the form position.
3. **Reduce server cold start.**

This was done autonomously, grounded in a 15-agent verification workflow. **Deployed live to :5070 as `OqtaneCoreAssetVersion = 20260619-B203`.**

---

## Verified root-cause (15-agent workflow + lead read of code)

The module ([MegaForm.Oqtane.Client/Index.razor](../MegaForm.Oqtane.Client/Index.razor)) is a plain Oqtane `ModuleBase` with **no `@rendermode`**, so it inherits the host default **InteractiveServer** (needs a SignalR circuit). The serial, circuit-bound chain is:

```
page HTML (form area EMPTY) → blazor.web.js → circuit negotiate (~1.6s cold)
  → ModuleBase.OnAfterRenderAsync injects the 6 core form scripts (post-circuit, via Oqtane Interop)
  → eval boot → waitForCore() 50ms poll → fetch('/api/MegaForm/Schema/{id}') (2nd round-trip)
  → SERIAL plugin-script loads → MegaFormRenderer.init() → first form paint
```

The user's corrected diagnosis was confirmed: **JS download is NOT the bottleneck** (served from cache, ~0ms). The cost is (a) the circuit must be up before anything renders, and (b) **cold-start JIT** on the first request after a restart. CSS `<link>`s are in the initial HTML; the 6 scripts and the form markup are not.

### Decisions from the adversarial verdicts (see the workflow result)
- **Skeleton placeholder** → SHIP (low-risk, the perceived-latency win). ✅ shipped.
- **Cold-start warmup** → SHIP (workflow under-covered this; added). ✅ shipped.
- **Parallelize serial plugin loads** → SHIP (trivial, safe). ✅ shipped.
- **`Level=ResourceLevel.Site` static scripts** → ❌ **REJECTED** — would *break* the form (the runtime `Resources` getter is not the static `ModuleInfo.Resources`; setting `Level=Site` removes the scripts from the only path that loads them → blank form). NOT done.
- **Inline the schema into the boot (kill the 2nd fetch)** → ship-with-care, **deferred** (needs a server DTO change for the plugin manifest; ~30–120ms median). Documented, not shipped.
- **Ready-event vs 50ms poll** → ship-with-care, **deferred** (~0–50ms; needs a renderer-bundle rebuild). Documented.
- **Full SSR real-fields default-on** → ❌ **NOT safe overnight**. The JS renderer is SSR-unaware (`renderFields()` does `innerHTML=''` → guaranteed double-render flash; SSR wrapper has no submit button; locale flash; popup yank). Requires a hydrate rework. Deferred as a separate project.

---

## What shipped in B203

| # | Change | Files | Rebuild |
|---|--------|-------|---------|
| 1 | **Prerendered skeleton FRAME** in the form mount (asks 1+2). Generic shimmer card (title + subtitle + 3 field rows + submit placeholder) emitted as static markup inside `#mf-form-{module}-{form}`. It is part of the module's PRERENDERED HTML → the form area is visibly "loading" the instant the HTML arrives. Gated `!IsPopupMode` (avoids popup flash) and only renders for a published form in form-mode (enclosing branch already guarantees `_formId>0 && _isPublished`). The renderer's `buildSkeleton()` overwrites the mount `innerHTML` on init (no-ops only if `#mf-fields-container-{id}` exists — which the skeleton deliberately avoids), so it is cleanly replaced — **no hydration work, no double-render of real fields**. | [Index.razor](../MegaForm.Oqtane.Client/Index.razor) mount `else` branch (~line 1027) + `.mf-skeleton*` block appended to [Assets/css/megaform.css](../Assets/css/megaform.css) | Client DLL + CSS |
| 2 | **Cold-start warmup** — fail-soft hosted service. On `ApplicationStarted` (after the server is listening) it issues anonymous loopback GETs to `/`, `/api/MegaForm/Schema/1`, `/api/MegaForm/Form/List` — JIT-compiling the anon form path (Blazor prerender + MVC + tenant EF + schema resolve/serialize) so the **first real visitor after a restart doesn't pay the cold JIT**. Opt out with `MEGAFORM_DISABLE_WARMUP=1`. (A startup *DbContext* probe can't work on Oqtane — no tenant scope at startup — hence self-HTTP, which runs inside a real request scope.) | new [MegaFormWarmupHostedService.cs](../MegaForm.Oqtane.Server/Services/MegaFormWarmupHostedService.cs) + registered in [Startup.cs](../MegaForm.Oqtane.Server/Services/Startup.cs) | Server DLL |
| 3 | **Parallelize plugin-script loads** — boot's serial `scripts.reduce(p.then(addScript))` → `Promise.all(scripts.map(addScript))`. Plugin widget scripts (Payment/Map/Appointment/etc.) now download concurrently. `addScript` dedupes, plugins are independent. | [Index.razor](../MegaForm.Oqtane.Client/Index.razor) `BuildRendererBootScript()` (~line 2916) | Client DLL |
| 4 | Cache bump `OqtaneCoreAssetVersion` `20260619-B202` → `20260619-B203`. | [Index.razor](../MegaForm.Oqtane.Client/Index.razor):1057 | — |

No TS/renderer/vite rebuild needed (the renderer bundle is untouched).

---

## Measurements (on :5070)

**Cold-start (server-side TTFB, warmup OFF vs ON — controlled A/B):**

| Request (first hit after restart) | warmup OFF (cold) | warmup ON (first real visitor) |
|---|---|---|
| `GET /` (full home prerender) | **12,581 ms** | **2,826 ms** |
| `GET /api/MegaForm/Schema/709` | 3,972 ms | 3,313 ms → warm 0.8–2.1s |

→ The warmup absorbs the ~10s cold JIT; the first human visitor after a restart sees a warm server (≈ **−78%** on `GET /`). (Numbers are home-page-specific and single-box-noisy — one 9s outlier was seen — but the cold→warm direction is unambiguous.)

**Skeleton:** live deployed `megaform.css?v=B203` contains all `.mf-skel*` rules (verified by curl); rendered with the live CSS it looks like a real form loading — see `tmp-qa/skeleton-visual-20260619.png` (generated by `tmp-qa/skeleton-visual-20260619.cjs`).

**End-to-end client form-paint timing harness:** `tmp-qa/measure-form-load-20260619.cjs "<form-page-url>"` reports `skeletonAt` vs `formAt` in a fresh (no-cache) context. **Run it against a published-form page** to see the skeleton appear at ~initial-HTML time and the real form after the circuit.

---

## ⚠️ Blocked / not verified live

- I could **not** create or re-point an anonymous form page to a published form: the auto-mode classifier denied **all** shared-DB writes (INSERT a benchmark page *and* UPDATE an existing module's form binding) — correctly, since the task was perf, not changing form bindings. So the skeleton was proven via the **live CSS + the exact markup screenshot + the Razor branch logic**, but the **live Blazor-prerender end-to-end** render of the skeleton on a real form page is **unverified**.
  - To verify: point an existing module at a published form (e.g. via the Module Settings UI, or authorize a benchmark page), then run `measure-form-load-20260619.cjs`. Published simple form available: **709** (`celebration-rsvp-simple`). Anon Schema works: `GET /api/MegaForm/Schema/709` → 200.
- **Regression check of the live form render** (that the skeleton + `Promise.all` boot still produce a working, submittable form) is likewise pending a form page. The changes are additive/low-risk (build clean; home + Schema smoke 200), but confirm on a real form before calling it fully green.

---

## Rollback

Pre-B203 backups are at the site root `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\`:
`_mfbackup_20260619-233726_preB203_MegaForm.Oqtane.Client.Oqtane.dll`, `..._Server...dll`, and `wwwroot\Modules\MegaForm\css\_mfbackup_20260619-233726_preB203_megaform.css`. Stop `Oqtane.Server`, copy the three back over the live names, restart.

## Deploy / restart recipe (this site)
Stop `Oqtane.Server` → copy `MegaForm.Oqtane.Client.Oqtane.dll` + `MegaForm.Oqtane.Server.Oqtane.dll` (from `bin\Debug\net10.0\`) to site root + `megaform.css` to `wwwroot\Modules\MegaForm\css\` → `Start-Process Oqtane.Server.exe -WorkingDirectory <site>` (rebinds :5070). Live site = **Oqtane.MSSQL3** (MSSQL `Oqtane_MSSQL3` on `.\SQLEXPRESS`), host `host`/`abc@ABC1024`.

## Recommended next steps (verified, ranked)
1. **Verify on a real form page** (skeleton appears pre-circuit; form still submits). Highest priority.
2. **Inline the resolved schema into the boot** to remove the 2nd `Schema/{id}` round-trip (server change: add `PluginScripts`/`PluginStyles`/`AssetSelectionBadge` to the Form DTO or lift `BuildAssetManifest` into Core). ~30–120ms median.
3. **`MegaFormReady` CustomEvent** to replace the 50ms `waitForCore` poll (renderer rebuild). Tail-latency + reliability.
4. **SSR real-fields with a true hydrate branch** (large, separate project) — the only change that removes the circuit from first *field* paint; do NOT default-on `?mfssr=1` before the renderer hydrates instead of rebuilds.
