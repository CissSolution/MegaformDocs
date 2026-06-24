# PLAN — True SSR field-level + idempotent renderer (instant + single load) — 2026-06-20

## OUTCOME (2026-06-20): Phase 1 DONE + PROVEN, then STOPPED at user's request.
- **Phase 1 shipped & proven (B213):** the JS renderer now HYDRATES server-rendered forms instead of
  rebuilding. `index.ts`: `buildSkeleton` is additive (preserves SSR field nodes), `init()` detects
  `data-mf-ssr` and calls new `hydrateSsrFields()` (moves the existing `.mf-field-group` nodes into
  `mf-page` wrappers — no `innerHTML` wipe → no image/input re-fetch). Gated `!hasCustom`.
  `FormHtmlRenderer.IsSsrEligible/HasMultiplePages` gate the module SSR markup (`?mfssr=1`).
  **Proven on render/730:** `data-mf-hydrated=1`, console `MegaForm: HYDRATED 9 server-rendered
  fields (no rebuild)`, 15 inputs, interactive, 0 errors. Side benefit: the render-page (what the
  B210 iframe loads) now hydrates non-custom forms instead of rebuilding.
- **KEY FINDING that stopped further phases — form inventory:** of the published forms, **only 730
  is standard (non-custom)**; 709/710/717/726/727/728/731/741 **and the user's Home form 743 are all
  custom-HTML (custom-shell)**. So the standard-hydrate path benefits ~1 form here. Custom forms keep
  the iframe (B212: single clean load, circuit-gated).
- **User decision:** STOP at Phase 1, keep B212. NO Phase 3 (prerender), NO custom-HTML hydrate
  (would benefit the real/custom forms but is higher-risk — it touches the majority of forms). The
  custom-HTML hydrate design below remains the path if revisited.
- **Live state:** renderer.js (B213 hydrate) + Client/Core B213 deployed; iframe B212 unchanged for
  all forms (verified: normal Home 743 = 56 inputs, 0 errors). Server RenderPage source bumped to
  B214 by the user (live DLL still B212 — rebuild+deploy server to apply). Test harnesses:
  `tmp-qa/ssr-renderpage-test-20260620.cjs`, `ssr-phase1-test-20260620.cjs`.

---


Goal (user): a MegaForm module on a normal Oqtane page that loads **instantly** AND with a **single
load** (no double render/fetch). The iframe path (B208–B212) gives single-load but is circuit-gated
(not instant); prerender made it instant but double-loaded. The correct fix is **server-render the
real fields into the initial HTML + make the JS renderer HYDRATE that DOM** (attach, not rebuild).

## What ALREADY exists (≈80% of the server side)
- `MegaForm.Core/Services/FormHtmlRenderer.cs` — emits hydration-ready field HTML, **explicitly
  designed** to "mirror megaform-renderer.ts so the JS can HYDRATE instead of rebuild". Has
  `SsrMarkerAttr = data-mf-ssr="1"` and `ContainsHydrationWidget(schema)` (forms with non-native
  widgets must skip SSR). Per-field contract: `.mf-field-group[data-key,data-type,data-show-if] >
  label.mf-field-label > input + .mf-field-help + .mf-field-error`.
- `Index.razor`: `SsrMode` (gated by `?mfssr=1`), `_ssrFieldsHtml` (via `TryBuildSsrFormHtml` →
  FormHtmlRenderer), `BuildPreloadSchemaJson()` (embeds schema so JS can skip the Schema fetch), and
  an SSR markup branch. Comment: "Gated by ?mfssr=1 **until the JS hydration path ships; then it
  becomes the default**."
- Render-page endpoint (`GET /api/MegaForm/render/{id}`, B214) already SSRs the full form and, with the B213 hydrate branch, its JS `init()` now HYDRATES eligible non-custom forms instead of rebuilding. Custom-shell forms still rebuild via `renderCustomHtml()` (safe fallback).

## The missing piece + the gaps found (this is bigger than "add a guard")
1. **JS renderer never hydrates.** `MegaForm.UI/src/renderer/index.ts` `init()` always calls
   `renderFields()` which does `container.innerHTML = ''` (index.ts:873) — wipes + rebuilds from
   schema. No `data-mf-ssr` check anywhere. (`megaform-renderer.ts` is DEAD code; `index.ts` is live.)
2. **Shell gap.** The module SSR markup is MINIMAL (`wrapper>form>fields-container`) — NO progress
   bar, NO actions (prev/next/**submit**), NO success/error/loading. `buildSkeleton()` (index.ts:107)
   is all-or-nothing: it no-ops the moment `#mf-fields-container` exists → so an SSR form has no
   submit button. Fix: render the FULL shell server-side (mirror buildSkeleton) so it no-ops cleanly.
3. **Structure mismatch (multi-page).** JS wraps fields in `<div class="mf-page" id="mf-page-{f}-{i}">`
   (one per step; renderStandardFields index.ts:1431-1456). FormHtmlRenderer renders fields **flat**
   with `mf-page-anchor` markers (no mf-page divs). So multi-step nav (show/hide mf-page) won't work
   on SSR DOM. Even single-page differs (JS always wraps in one mf-page; SSR has none). Must reconcile:
   either SSR emits mf-page wrappers, or JS hydration groups the flat SSR fields into pages.
4. **bindConditionalLogic** is called INSIDE renderStandardFields (index.ts:1458) — if we skip
   renderFields, conditional logic never binds. Move it to run after, on the existing DOM.
5. **Double-bind risks on hydrate** (agent-confirmed): conditional listeners, SQL options re-fetch,
   popup overlay, widgets, prefill-from-URL, buildStepIndicator innerHTML, calculatePages drift —
   each needs an idempotent guard.
6. **Widgets.** Forms with hydration widgets (DataRepeater/Razor/Map/etc.) must NOT use SSR (server
   `ContainsHydrationWidget` already detects; caller must gate).

## Risk
Core renderer `index.ts` is shared by **DNN + Oqtane + Web**, used by **every form**. A bug here
breaks all forms everywhere. MITIGATION: the entire hydrate branch is **gated by `data-mf-ssr`** —
forms without the marker (i.e. all existing forms) are 100% unaffected. So we can build + ship the
hydrate branch dark, test it via `?mfssr=1` on a few forms, and only flip the default (Phase 3)
once proven.

## Phased plan (each phase independently testable; ship gated)
- **Phase 1 — Single-page standard forms.**
  - Server:
    - Render-page (`/api/MegaForm/render/{id}`) emits the FULL shell + fields, `data-mf-ssr="1"`.
    - Module (`Index.razor`) emits a MINIMAL SSR branch (`wrapper > form > #mf-fields-container-{id}`)
      only when `?mfssr=1`; `buildSkeleton()` then supplies the missing shell client-side while
      preserving the server-rendered field nodes. Gate SSR to
      `!ContainsHydrationWidget && !customHtml && single-page`.
  - JS: in `init()`, detect `isSsr` (wrapper `data-mf-ssr="1"` + populated fields-container, and
    `!hasCustom`). If SSR: `buildSkeleton()` is a node-preserving no-op/shell-injection, then
    `hydrateSsrFields()` wraps the existing `.mf-field-group` nodes into `mf-page` wrappers instead of
    calling `renderFields()`, and `bindConditionalLogic()` runs on the preserved DOM.
  - Test on an eligible single-page standard form: e.g. `/api/MegaForm/render/730` (15 inputs, 9
    SSR field-groups, 1 `mf-page`, `data-mf-hydrated="1"`, 0 console errors). The `?mfssr=1` module
    path requires the module to be bound to an eligible form and is only visible after the Blazor
    circuit connects (Oqtane module `Prerender` is OFF since B212).
- **Phase 2 — Multi-page + custom-HTML + premium.** SSR emits `mf-page` wrappers matching JS; hydrate
  multi-step nav; handle custom-HTML shell (`mf-custom-shell-mode`). Test on 729/743.
- **Phase 3 — Make it instant in the module.** Enable SSR by default for eligible forms (drop the
  `?mfssr=1` gate per the original comment) + re-enable module `Prerender=true`. SSR fields (unlike
  the iframe) are plain DOM → Blazor hydration reconciles them in place WITHOUT a network reload, so
  NO double-load. Add a `ShouldRender=>false` guard on the fields fragment so Blazor never clobbers
  the JS-hydrated DOM. Retire the iframe fast-embed (B210) for SSR-eligible forms; keep iframe as the
  fallback for widget/custom forms that can't SSR.

## Build/deploy
Renderer: edit `src/renderer/*.ts` → `npm run build:renderer` (vite) → copy `megaform-renderer.js`
to `…\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\js\` + bump version. Module: build
`MegaForm.Oqtane.Client -c Release -f net10.0` → deploy DLL + restart. Test fresh-context (no cache).

---

## Verification & corrections (static code + live smoke test — 2026-06-20)

I re-read the current source and ran a live headless smoke test against `localhost:5070` (Oqtane.MSSQL3, current build). Below is the verdict on the plan’s claims.

| Claim | Status | Evidence |
|---|---|---|
| Phase 1 hydrate shipped in B213 | ✅ Confirmed | `MegaForm.UI/src/renderer/index.ts` lines 751-780 / 941-980; `FormHtmlRenderer.IsSsrEligible` lines 70-78; `Index.razor` SSR branch lines 1078-1088 / `TryBuildSsrFormHtml` lines 2580-2595. |
| Renderer entry is `src/renderer/index.ts`; `megaform-renderer.ts` is not built | ✅ Confirmed | `vite.config.ts` maps `renderer` → `src/renderer/index.ts`. |
| `?mfssr=1` gates module SSR | ✅ Confirmed | `Index.razor:1287-1288` `SsrMode` checks the query string. |
| Render-page hydrates eligible forms | ✅ Confirmed | Live `GET /api/MegaForm/render/730`: 15 inputs, 9 SSR field-groups, 1 `mf-page`, `data-mf-hydrated="1"`, 0 console errors. |
| Custom / multi-page / widget forms excluded | ✅ Confirmed | `FormHtmlRenderer.IsSsrEligible` returns `false` for `CustomHtml`, hydration widgets, or page breaks. Live `render/743` and `render/729` (custom shell) rebuild via `renderCustomHtml()` — `mf-custom-shell-mode` present, `data-mf-hydrated` absent. |
| Module path gives instant first paint | ⚠️ Not yet | Because `Prerender` is OFF since B212, the `?mfssr=1` module markup is only rendered after the SignalR circuit connects. Phase 3 (default SSR + per-module prerender / `RenderMode.Static`) is intentionally stopped per the OUTCOME section. |
| Form 742 is a good Phase-1 test form | ❌ Stale | `/api/MegaForm/Schema/742` now returns `"fields": []`; use form **730** for a live standard-form proof. |

### Key correction vs. the original draft
The original draft said the render-page still did “SSR-then-rebuild”. That was true before B213, but the current render-page (B214) **hydrates** eligible standard forms. Custom-shell forms still rebuild, which is the intended safe fallback.
