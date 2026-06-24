# HANDOFF — JS Load Optimization (B200) — 2026-06-19

Implements the 3 urgent fixes from `Docs/MEGAFORM_JS_LOAD_AUDIT_2026-06-18.md`:
**(1) externalize Monaco, (2) DNN lazy-load builder on render page, (3) sourcemaps off for production.**

Cache stamp bumped everywhere: **`20260619-B199` → `20260619-B200`**.

---

## Results (measured, not estimated)

| Bundle | Before | After | Δ |
|---|---:|---:|---:|
| `bundles/megaform-builder.js` raw | 5,109,228 B (5.1 MB) | **1,057,318 B (1.03 MB)** | **−79%** |
| builder gzip | ~1.27 MB | **~285 KB** | **−78%** |
| `megaform-unified-monaco.js` | 3.90 MB (stale, external font) | **4.15 MB (self-contained, codicon inlined)** | rebuilt |
| builder `monaco-editor` token hits | 792 | **1** (the externalized `import()` literal, never executes) | — |

Monaco is no longer shipped twice. It loads **only** when a code editor is opened (BYOM Source tab / Custom HTML editor), lazy-injected as `megaform-unified-monaco.js`.

---

## What changed

### Fix #1 — Externalize Monaco — `MegaForm.UI/vite.config.ts`
- Added entry **`unified-monaco`** → `src/view-designer/shared/unified-monaco-entry.ts` (publishes `window.MegaFormMonaco`).
- `rollupOptions.external = isMonaco ? [] : ['monaco-editor']` — every entry EXCEPT unified-monaco externalizes monaco.
- `output.globals = { 'monaco-editor': 'MegaFormMonaco' }` (skipped for the monaco entry itself).
- `build.assetsInlineLimit = 20_000_000` — inlines Monaco's `codicon.ttf` (~80 KB) as base64 so every entry stays a **single self-contained .js** (the sync only copies the root .js; an emitted `assets/*.ttf` sibling would 404).
- The runtime was already designed for this: `monaco-editor-adapter.ts` prefers `window.MegaFormMonaco`, dynamic `import('monaco-editor')` is only a dead fallback; `user-template-launcher.ts` lazy-injects the bundle via `ensureMonacoLoaded()`.

### Fix #3 — Sourcemaps off for prod — `MegaForm.UI/vite.config.ts`
- `build.sourcemap = process.env.MF_SOURCEMAP === '1'` (default **off**). Set `MF_SOURCEMAP=1` locally to debug.
- Deleted the now-stale `.map` for the rebuilt bundles across all deploy dirs. (The other ~130 `.map` files regenerate sourcemap-free on their next rebuild — run `BuildTS.ps1` with no args when convenient to sweep them. NOTE: `.map` files do NOT affect end-user load speed — only deploy/disk size.)

### Fix #2 — DNN lazy builder on render page
- **`MegaForm.DNN/Views/FormView.ascx.cs`** (`shouldLoadAdminShellAssets` block, ~line 547): REMOVED the eager `bundles/megaform-builder.js` + `builder/megaform-workflow-reactflow.js` registrations. The ~1.2 MB bundle was downloaded on **every** admin form-view even when the builder was never opened. Builder MODE (`ShowConfigPanel=true`, ~line 452) still eager-loads — unchanged. `Sortable` + `megaform-widgets` + schema plugins stay eager (small, needed to render the form) → builder boots with the **same plugin set**.
- **`MegaForm.UI/src/dnn-host/index.ts`**: new `ensureBuilderBundleLazyLoaded(assetsBase)` injects `megaform-builder.js` + `megaform-workflow-reactflow.js` on the **first** `open('builder')` (covers both initial-hash load at line ~1401 and `hashchange`). Init-retry budget raised 20→80 (×150 ms = 12 s) for the cold download.
- Safe because `#mf-builder-root` carries `data-lazy-boot="true"` → `dom.ts` (line ~2197) runs `build()` then waits for explicit `initBuilder()`. Deferred load runs `init()` immediately (readyState=complete) → `build()` → returns; dnn-host's retry then calls `window.MegaForm.initBuilder`. `build()` + `initBuilder` are in the same synchronous script execution → no race, no double-init. Behavior identical to the old eager path — only download timing changed.
- ascx only sets `window.location.hash='#mf-builder'` (no direct `initBuilder` call), so all entry paths funnel through `open('builder')`.

### Cache bumps (B199→B200)
- `MegaForm.Oqtane.Client/Index.razor` — `OqtaneCoreAssetVersion`
- `MegaForm.UI/src/loader/index.ts` — `BUILDER_BUNDLE_VERSION`
- `MegaForm.DNN/Views/FormView.ascx.cs` — `const string V`
- `MegaForm.UI/src/widgets/plugins/megaform-widget-user-template-launcher.ts` — lazy monaco `?v=`
- `MegaForm.UI/src/dnn-host/index.ts` — `BUILDER_LAZY_VERSION`
- `BuildTS.ps1` — added `unified-monaco` to `$allModules`

---

## Verification

### Oqtane :5070 (fix #1 + #3) — PASS (Visual-QA + curl)
`tmp-qa/monaco-externalize-qa-20260619.cjs`:
- builder served = **1,057,318 B**, served `monaco-editor` hits = **1**
- `builderHadInlineMonaco=false`, `monacoLazyAtBoot=true` (unified-monaco NOT fetched at boot)
- `monacoLoadedOnDemand=true`, `monacoEditorMounts=true` (`monaco.editor.create()` works → codicon inline OK)
- 50 palette tiles render, Design Studio + toolbar render (screenshot `tmp-qa/monaco-externalize-qa-20260619.png`)
- boot confirmed: `MegaFormBuilder.state` set, dropzone present (canvasField=0 only because form 4 is empty)
- console errors = unrelated `CISS.SideMenu` skin 404s only.

Deployed to live `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm` + repo `Assets/` + Web/Oqtane source wwwroot + `DesktopModules/MegaForm/Assets`.

### DNN (fix #2) — NOT verified here ⚠️
Live/QA site is Oqtane :5070; DNN can't be Visual-QA'd in this environment. **User must test on a DNN instance**: rebuild the DNN module DLL (FormView.ascx.cs changed) + deploy ascx + assets, then:
1. Log in as admin, view a form page → confirm `megaform-builder.js` is **NOT** in the network tab on load.
2. Click **"Edit Form"** (#mf-builder) → builder overlay opens, bundle downloads on demand, builder boots normally.
3. Open the **FLOW** tab → workflow canvas loads (workflow-reactflow lazy-injected).
4. Open a **Custom HTML / Source** code editor → Monaco lazy-loads + mounts.

---

## Next (optional, not done)
- Run `BuildTS.ps1` (no args) to regenerate ALL bundles sourcemap-free (sweep the ~130 stale `.map`).
- P1 from audit: lazy workflow/AI inside builder, code-split designers, `defer/async`, manualChunks, bundle analyzer.
