# Refactor Plan — One CSS Source, JS Does Nothing (2026-06-24)

**Goal (user):** Exactly ONE CSS source per form, server-rendered ONCE. Every write (user CSS edit, create-from-template, pick preset) persists into that one source. Everything follows the **module setting** (override wins). **JS does nothing to CSS** on the public form → structurally impossible to flash.

**Method:** 7-agent audit workflow (`wxgw1jgel`) mapped every CSS source/sink (server + client + write-paths + static files), synthesized this plan, then 2 adversarial critiques. **Both critiques returned `holds:false`** — the design is right but has hard blockers, captured below as **Caveats**.

---

## 1. Current CSS source/sink map (the divergence)

### Server emits (first paint)
| Source | File:line | From which stored field |
|---|---|---|
| `<link>` megaform.css (base `:root` vars + DoubleCardFix strip @561 + **MF-DISPLAY-STYLE block @2909 [B251]**) | Index.razor:1242 | file (none) |
| `<link>` megaform-themes.css (`.mf-theme-{name}{--mf-*}`) | Index.razor:1244 | `settings.theme` → wrapper class |
| `<style id=mf-inline-preset-{id}>` | Index.razor:776-778 | `ThemePresetInlineCssService.Build(settings.themeSelector, selectedPresetKey)` — **per-module** `MegaForm:SelectedThemePresetKey` |
| `<style id=mf-custom-css-{id}>` (THE main block) | Index.razor:780-786 | `[scopedThemeVars] + [authored customCss] + [customShell compat]` |
| ↳ scopedThemeVars | ThemeFirstPaintCssService.cs:89 | `settings.themeCssOverrides/cssOverrides` (+ premium aliases) |
| ↳ customShell compat | CustomShellCompatibilityCssService.cs:13 | static bridge, **only if `hasCustomHtml`** |
| wrapper classes `mf-theme-* mf-style-* mf-hide-header` | Index.razor:1134 / ThemeFirstPaintCssService.cs:61 | `settings.theme/displayStyle/hideHeader` |

**Overlap:** `mf-inline-preset`, `mf-custom-css` scoped vars, AND `.mf-theme-*` link **all set the same `--mf-primary/--mfp-*` vars** for the same form, from **3 different stored fields** → they can disagree.

### Client emits (the thing to neutralise) — `MegaForm.UI/src/renderer/index.ts`
| Function | line | What it does |
|---|---|---|
| `applyFormPresentationSettings` | 261-324 | **removes + rebuilds** `#mf-custom-css-{id}` from schema → appended to `<head>` AFTER server node = the source-order overwrite that flashes |
| `installDisplayStyleSheet` | 758-905 | injects `#mf-display-style-rules` (now duplicated by megaform.css static block) |
| `applyThemeVarsToElement` | 310/355 | inline `!important` CSS vars on wrapper |
| `renderCustomHtml` theme bits | 1606-1633 | re-stamps `mf-theme-*` + **2nd** `applyFormPresentationSettings` call (worst flash) |
| `SsrThemeGuard` [B252] | 281-283 | already skips rebuild when `data-mf-ssr=1` + server node exists |

### Write paths (where it gets saved — divergence at the source)
- `Form/SaveTheme` MegaFormController.cs:642-688 → **fans into 3 stores**: `SchemaJson.settings` (camel+Pascal) + schema ROOT + `form.SettingsJson` + `ThemeJson`.
- `Form/SaveStyle` → per-module `MegaForm:SelectedThemePresetKey` (MegaFormController.cs:2654, read @3087).
- settings-popup.ts:2058 → `saveFormThemeLayout` → `settings.theme + themeCssOverrides` (good).
- gallery.ts:634 (template apply) + ai-form-creator.ts:1696 → write into `schema.settings` (good).
- theme-designer/index.ts:1978 → compiled `settings.customCss`.

---

## 2. Single-source design

**THE source = `SchemaJson.settings`** (`theme, themeCssOverrides, customCss, customHtml, displayStyle, hideHeader, themeSelector`). One server composer renders it into **one** `<style id=mf-custom-css-{id}>`.

- **New** `ThemeFirstPaintCssService.BuildFormCss(formId, settings, selectedPresetKey, hasCustomShell)` composes deterministically:
  `[1] scopedThemeVars` · `[2] preset vars (fold ThemePresetInlineCssService)` · `[3] authored customCss` · `[4] customShell compat`.
- Every host calls it ONCE → emits one block. **Delete** the separate `mf-inline-preset` block + `InitialInlineCss` DTO plumbing.
- Static `<link>`s stay as the file base layer (incl. the B251 MF-DISPLAY-STYLE static block — that one is KEPT as the intended single static source).

**Storage decision — PER-FORM (recommended):** `SchemaJson.settings` is the CSS body. The per-module `SelectedThemePresetKey` stays ONLY as a **resolve-input** (`selectedPresetKey`) that picks WHICH `themeSelector` preset composes into segment [2]. → module setting **wins on preset choice**, but CSS body is one per-form source. (Per-module storage rejected: a form in N modules would multiply sources.)

---

## 3. JS to remove + band-aids superseded

**Neutralise on the PUBLIC form (gate on `data-mf-ssr==='1'`, NOT `isPreview` — see Caveat C):**
- `applyFormPresentationSettings` theme block (early-return after hide-header/display-style toggles).
- `installDisplayStyleSheet` runtime inject (static twin already in megaform.css).
- `applyThemeVarsToElement` inline stamping.
- `renderCustomHtml` 2nd theme apply + class re-stamp.
- Delete dead `src/renderer/megaform-renderer.ts` + its build script.

**Band-aids this session:**
- B251 megaform.css static block → **KEEP** (it IS the intended single static source). Only the runtime twin is removed.
- B252 `SsrThemeGuard` → **PROMOTE** to the permanent design (gate `data-mf-ssr==='1'`, drop the node-existence sub-condition).
- `mf-inline-preset` separate block → **DELETE** (folded into BuildFormCss [2]).

---

## 4. Builder / preset / DNN / Web

- **Builder live-preview:** all client CSS generators STAY ALIVE, gated `config.isPreview === true`. Public = `data-mf-ssr` → do nothing. (theme-tab-adapter flushPreview + live-preview bridge are builder-only, untouched.)
- **Preset switcher:** KEEP (it's a deliberate user interaction, not load-time). MUST route its save into the single source. ⚠️ Caveat E: today it likely writes the per-module key via LiveEditor SaveStyle — unverified.
- **DNN / Web:** ⚠️ **the biggest finding** — see Caveats A/B.

---

## 5. ⚠️ CAVEATS (why both critiques say `holds:false`) — read before coding

**A. DNN and Web do NOT server-render the form BODY at all.**
- Web (View.cshtml:182) mounts an EMPTY `#mf-form-mount`; `MegaFormRenderer.init` builds **fields AND theme** client-side. No `data-mf-ssr`, no `#mf-custom-css`.
- DNN (FormView.ascx:658) emits an EMPTY `mf-fields-container`; fields injected by JS. Wrapper has no `data-mf-ssr`; only `mf-inline-preset` emitted.
- → **"JS does nothing" is only achievable on the Oqtane Index.razor host today.** Neutralising the client on DNN/Web = **blank/unstyled form**, not just no-flash. Making it universal needs DNN/Web to adopt full SSR-body (large, not in original scope).

**B. Hard ordering dependency:** never neutralise the client globally. Per-platform, only AFTER that platform server-renders the block (and body).

**C. Gate the early-return on `data-mf-ssr==='1'`, not `isPreview`.** isPreview=false on DNN/Web public too → a blanket `!isPreview` return would break them. `data-mf-ssr` is the real "server rendered this" signal. Also drop the node-existence sub-check so default-theme forms (BuildFormCss returns empty → no node) still skip the rebuild.

**D. custom-shell compat predicate gap (this is the form 748 case).** Client emits compat when `customHtml || /mfp/.test(customCss)` (index.ts:540). Server emits it only when `hasCustomHtml`. A **premium form with `.mfp` markup baked into customCss but no customHtml field loses the compat bridge** after neutralisation → permanently unstyled. **BuildFormCss must use the widened predicate**, not a bare `hasCustomHtml` bool.

**E. Preset-switch save path unverified.** `createThemePresetRuntime` only dispatches events; the external `theme_selector` consumer likely POSTs `ModuleConfig/SaveStyle` (per-module key), not `Form/SaveTheme` (per-form). Must verify + route to the single source.

**F. Cascade-order change.** `ThemePresetInlineCssService` has NO `!important`; scopedThemeVars HAS `!important`. Today they're 2 blocks (preset emitted first); folding into one block changes who wins for `themeSelector` forms. Needs a **byte-equality / color test** in Phase 0.

**G. Migration risk.** Older forms may have CSS only in `SettingsJson`/`ThemeJson` (not `SchemaJson.settings`). BuildFormCss reads only `settings` → those forms lose theme once the client (which reads SettingsJson) is neutralised. **Audit/backfill required before neutralising** — the "no migration needed" claim is false for legacy forms.

**H. C#↔TS port drift.** Public = C# composer; builder = TS generators. No cross-port parity harness today → builder preview can silently differ from published form. Add a parity test.

---

## 6. Phased implementation (after decisions)

- **Phase 0** — Add `BuildFormCss` (fold preset, widen custom-shell predicate per Caveat D); byte-test vs current compose on 6 sample forms incl. a themeSelector form. Delete dead renderer.ts.
- **Phase 1 (Oqtane)** — Index.razor + RenderPage.cs: collapse to one block; delete inline-preset; DLL deploy + verify on :5070.
- **Phase 2 (Oqtane client)** — neutralise public client gated `data-mf-ssr==='1'`; keep builder isPreview path; verify no rebuild + builder still themes.
- **Phase 3 (write source)** — SaveTheme → single `SchemaJson.settings` (camelCase); reconcile stale per-module key; route preset-switch to single source; **legacy-form CSS-location audit/backfill (Caveat G)**.
- **Phase 4 (DNN + Web)** — add `BuildFormCss` emission + `BuildWrapperRuntimeClasses`; Web add megaform-themes.css + version CSS; **decide SSR-body adoption (Caveat A)**; only then neutralise their clients.
- **Phase 5 (cleanup)** — unify AssetVersion cache-bust across platforms; drop dead generators / keep isPreview-only; optional camel/Pascal key normalise.

---

## 7. Decisions needed from the user

1. **Scope:** Oqtane-only first (clean, fully achievable now — fixes the live :5070 flash incl. form 748), or all-platform (DNN/Web need new SSR-body work, much larger)?
2. **Storage:** confirm per-form `SchemaJson.settings` as single source + per-module key as resolve-input (recommended).
3. **Preset switcher:** keep (route save to single source) or drop?
4. **Legacy migration (Caveat G):** run a form-data audit/backfill before neutralising, yes?
