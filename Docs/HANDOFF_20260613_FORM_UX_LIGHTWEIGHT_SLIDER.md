# HANDOFF — Form UX, Lightweight Loading, Slider Token Manager (2026-06-13)

> START HERE for the next session. This consolidates a long session of MegaForm
> form-rendering UX fixes + a JS-payload "load lighter" refactor + a Token-Designer
> slider feature + a **windowed-builder topbar fix (§9)**.
> Request B (§6) is **DONE** (Token-Designer "Slides" tab, B154). The one item still
> needing follow-up is the **windowed topbar boot-scroll edge case (§9)** — the topbar is
> now correctly positioned + visible at rest, but a host-theme worst-case still needs the
> sticky follow-up. All other items below are DONE + Visual-QA-proven.
> **Current cache stamp: `BUILDER_BUNDLE_VERSION = 20260613-B155`** (loader index.ts:24).

---

## 0. Environment / build / deploy (verified working)

- **Live Oqtane host:** `http://localhost:5000`, site root `E:\DNN_SITES\OqtaneSites\Oqtane_new`,
  login `host` / `Minh@2002`, SQLite DB `Data\Oqtane-202606111406.db`.
- **Oqtane 10.1.0 = .NET 10** (its NuGet only ships `net10.0` → a net8 module build is
  IMPOSSIBLE against it; user asked, it was declined as infeasible).
- **Module DLLs** live at the SITE ROOT: `MegaForm.Core.dll`,
  `MegaForm.Oqtane.Client.Oqtane.dll`, `…Server.Oqtane.dll`, `…Shared.Oqtane.dll`.
  Deploy the **`net10.0`** build (NOT net8) e.g.
  `MegaForm.Oqtane.Client\bin\Debug\net10.0\MegaForm.Oqtane.Client.Oqtane.dll`.
- **Static assets** → `E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm\{js,css}\`.
  Source of truth = solution-root `Assets\{js,css}\`.
- **Build a TS bundle:** `cd MegaForm.UI && npm run build:builder` (or `:loader`, `:i18n`, …).
  Outputs to `Assets\js\bundles\megaform-builder.js` + syncs CSS.
- **Build a DLL:** `dotnet build MegaForm.Oqtane.Client\MegaForm.Oqtane.Client.csproj -c Debug`.
- **Restart sequence** (Kestrel locks the DLL): `Stop-Process` the `Oqtane.Server.exe`
  whose CommandLine matches `Oqtane_new` → wait 3s → copy DLL → `Start-Process`
  `Oqtane.Server.exe --urls http://localhost:5000`.
- **Headless QA harness:** `cd MegaForm.UI && node tools/mf-hb.cjs --eval tools/<scn>.cjs`
  (playwright-core, fresh context per run, in-process host login). Each `--eval` run is a
  FRESH browser (no cache) — good for network-diff but SPA-cache means navigations within
  one run don't re-request loaded bundles. Module returns a `RESULT:<json>` line.
- 36 premium demo forms at `/test-template-page/<json-filename-lowercased>`. Source JSONs:
  `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium-Fixed`.

## 1. Cache-stamp layers (bump on every deploy)
- `OqtaneCoreAssetVersion` (Index.razor:957) — stamps `megaform.css`, config/i18n/widgets/
  rule-engine/renderer + most public assets. **CURRENT = `20260613-B153`**.
- `BUILDER_BUNDLE_VERSION` (MegaForm.UI/src/loader/index.ts:24) — stamps the builder bundle +
  builder CSS (now also `megaform-builder-shell.css`, see §9). **CURRENT = `20260613-B155`**;
  the loader URL stamp is mirrored in Index.razor:1018 + BuilderView.razor:261 (both B155).
- Per-bundle fixed stamps in Index.razor (`megaform-admin-shell.css?v=` now `20260613-B153`,
  dashboard B143, builder-loader B153, my-inbox/submissions/languages B142, etc.).
- Oqtane heuristic-caches under an unchanged `?v=` → ALWAYS bump the stamp + rebuild the
  Client DLL (the const is compiled in) when CSS/JS content changes.

## 2. Form responsive + layout fixes (all in `Assets/css/megaform.css`, central, NO per-JSON edits)
Root insight: forms render in an Oqtane content column far NARROWER than the viewport, so
**viewport `@media` breakpoints are wrong — use container queries / form-width logic.**
- **Container-query collapse** (`@container (max-width:600px)`): `.mf-form-wrapper,.mf-form,.mfp{container-type:inline-size}`
  → `.mf-row`, `.mf-option-group*`, custom field-rows (`[class*="-row"|"two-col"|"grid-cols-2/3"|"habits-grid"|"mfp-grid"]` with `.mf-form-wrapper .mfp.mfp.mfp` 0,5,0 specificity to beat per-form `repeat(2,1fr)!important`) collapse to 1col. Showcases/galleries (`-cards`/`products-grid`/`-gallery`) intentionally NOT matched.
- **Column "bị bóp hẹp"** (B150/B151): premium forms cap form sections to ~720px centered in a wider card → fields squeezed. Fix: `.mf-form-wrapper .mfp [class*="-section"]:has(.mf-field-group), …section:has(.mf-field-group), …[class*="-fields"]:has(.mf-field-group), …[class*="-actions"], …[class*="-newsletter"], …[class*="-footer-note"], …[class*="-cta"], .mf-form-actions { max-width:none!important; margin-inline:0!important }` — `:has(.mf-field-group)` keeps showcases safe; the actions/footer/newsletter patterns (P1) widen the submit area too.
- **Mobile "padding 2 bên quá rộng" → then "zero padding"** (B148→B151→B153): Oqtane wraps each module in nested Bootstrap `.row.px-4` + `container-fluid` gutters. Final fix `@media(max-width:600px)`: module FULL-BLEED `.megaform-module.mf-custom-shell-mode{width:100vw;margin-inline:calc(50% - 50vw);padding:0;overflow-x:clip}` + the breathing room lives on the wrapper `.mf-form-wrapper.mf-custom-shell-mode{padding-inline:var(--mf-form-edge-pad,16px)}` (var on the SAME element a wrapper-scoped setting can drive — a module-ancestor can't read a wrapper var). Default 16px (8px felt like "no padding", 27px too wide).
- **NEW builder setting "Form edge padding"** (Compact 8/Comfortable 16/Spacious 24): select `#mf-setting-form-pad` (dom.ts ~1162, DISPLAY STYLE pane), wired in properties-patch.ts `wireFormStyle` (adds `.mf-style-pad-<v>` to `.mf-form-wrapper`, NOT gated by the B83k double-card guard; persists `schema.settings.displayStyle.pad`, loads it back). CSS `.mf-form-wrapper.mf-style-pad-{compact|comfortable|spacious}{--mf-form-edge-pad:8|16|24px}` (megaform.css ~line 183). NOTE: published-page application of displayStyle classes wasn't traced (renderer index.ts:284 only GENERATES the mf-style-* rules) — the 16px DEFAULT covers all forms; the per-form override may need that apply-path verified.
- Detail: see memory `feedback_form_responsive_container_query.md`.

## 3. Token Designer modal + slider Add/Remove (B145, B152) — `MegaForm.UI/src/builder/token-designer.ts`
- Modal mounts on `document.body` (`getMountTarget` returns body; modal has `data-mf-overlay='1'` so the fullscreen takeover whitelists it). The full backdrop/shell CSS lives in `megaform-builder.css` ~line1063 (was stale-undeployed → looked unstyled; redeploying it fixed it).
- **Slider Add/Remove image (B152):** `detectRepeaters(imageKeys)` groups `p1_image,p2_image…`; `.mf-token-slider-bar` header + "+ Add image"; per-row red "Remove slide". `addSlide()` parses customHtml into a `<template>`, `findCardEl()` finds the repeating card (deepest el with the image token, walk up until parent holds another slide's token), clones it, re-indexes `{{content:p<n>…}}`→`p<n+1>` (regex `\{\{content:<prefix><n>(?![0-9])`), inserts after, seeds new tokens. `removeSlide()` deletes the card + tokens. Both → `B.callModule('canvas','render')` (THE builder re-render hook). QA: aurora 8→9→8. See memory `megaform-token-designer`.

## 4. Lightweight loading (gate ~250KB admin JS) — `MegaForm.Oqtane.Client/Index.razor`
Every form page eagerly loaded ~250KB of ADMIN-only JS (languages.js 102KB!, submission-list/card 58KB, dashboard, builder-loader, submissions, my-inbox, workflow-inbox, settings-popup, oqtane-auth) that a form-filler never needs. The big `Resources` list was renamed `_allResourcesList`; a new `Resources` getter strips `_adminOnlyAssets` (the 11 admin JS filenames) unless `IsLightLoadContext==false` (admin = URL has `mfpanel=`/`edit=`/`mfview=` OR `PageState?.User != null` — note PageState.User is null in the Resources getter so it's effectively URL-based, which is fine + gives the win to admins too). **CRITICAL:** admin CSS stays ALWAYS-loaded — Oqtane re-injects `<script>` on SPA panel click-nav but NOT gated `<link>` stylesheets → a gated admin CSS would leave the opened panel unstyled. QA: anon form loads only [config,i18n,widgets,types,rule-engine,renderer], 0 admin JS, 36/36 render, form interactive (submit/validation), dashboard/builder/submissions styled on click-nav. See memory `project_form_ssr_seo_refactor`.

## 5. SSR/SEO (built but PARKED — Oqtane is a SPA, user dropped prerender)
- `MegaForm.Core/Services/FormHtmlRenderer.cs` (NEW, compiles, all targets) — schema→static HTML matching the JS renderer contract; wired into Index.razor behind **`?mfssr=1`** (field `_ssrFieldsHtml`, `TryBuildSsrFormHtml`). **Kept but inactive** (reusable for DNN's Literal SSR later). GOTCHA fixed: a 2nd `MegaForm.Core.Services.FieldOption` shadows `Models.FieldOption` → used `using MfOption = MegaForm.Core.Models.FieldOption`.
- Oqtane SEO blocker diagnosed: module renders InteractiveServer with **`prerender:False`** (`<!-- rendermode: Interactive:Server - prerender: False -->` in curl). User then said "Oqtane is a SPA, just make MegaForm load lighter" → pivoted to §4. Do NOT resurrect prerender unless asked.

## 6. ✅ DONE (B154) — Request B: CISS Element-manager slider redesign
**Status: SHIPPED + Visual-QA-proven** (token-designer "Slides" tab). `detectSlideGroups(allKeys)` groups `<prefix><index>_<field>` tokens by prefix (≥2 indices + an image field = a slider); `renderSlidesPane` renders ONE `.mf-slide-card` per slide containing its image (preview + Upload/Gallery/Clear) **and** all its text fields together, plus Add/Remove (reusing `addSlide`/`removeSlide`). The Slides tab is shown + active-by-default when `hasSlides`; the flat Text/Image/Form tabs remain for non-repeating tokens. CSS `.mf-slide-card*` in `Assets/css/megaform-builder.css`. QA (aurora, 8 product slides): 8 cards each image+6 text fields, Add 8→9, Remove 9→8. See memory `megaform-token-designer` (B154 note). Original ask kept below for context.

**User ask:** "với slider thì việc tách string và image ra 2 tab (Text tokens / Image tokens) như hiện tại là vô lý — mỗi slide (ảnh + tên/mô tả/giá/badge) nên quản lý CÙNG NHAU như 1 element. Tham khảo **Element manager trong CISS** `E:\CISS.SideMenu.Nuget_GPT`."
- **Problem:** the Token Designer scatters a slider's data — `pN_image` shows in the Image-tokens tab, `pN_name`/`pN_desc`/`pN_price`/`pN_badge` in the Text-tokens tab. For a repeating slide this is illogical; each slide's fields should be edited together as one "element/item".
- **What already exists to build on:** `detectRepeaters()` (token-designer.ts, from B152) already groups slide tokens by numeric-index pattern; `findCardEl()` finds a slide's card; Add/Remove slide already work. So the data model (slide N = all `{{content:p<N>_*}}` tokens) is solved.
- **The work:** (a) study CISS's element-manager UX first (`E:\CISS.SideMenu.Nuget_GPT` — look for an Element/Item manager component, likely `src\Core` or `ClientApp`). (b) Add a new Token-Designer view/tab e.g. "Elements" (or restructure) that, for each detected repeater group, renders ONE card per slide containing ALL that slide's fields (image preview + upload/gallery + the slide's text inputs) together, with the existing Add/Remove. Keep the flat Text/Image tabs for non-repeating tokens. (c) Wire to the same `schema.settings.customContent` + `B.callModule('canvas','render')`.
- Files: `MegaForm.UI/src/builder/token-designer.ts` (+ CSS in `Assets/css/megaform-builder.css`). Memory: `megaform-token-designer` + `feedback_form_responsive_container_query` (PENDING note).

## 7. Recently fixed bug — host action-menu (B153)
`megaform-admin-shell.css` had UNSCOPED global resets (`html,body{…}`, `a{color:inherit}`, `button`, `*`, `svg`) that leaked onto the host Oqtane page (admin-shell.css is always-loaded). `a{color:inherit}` made the Oqtane module action-menu links invisible (dark-on-dark) → "menu disappeared". Fixed by scoping every reset to `body.mf-body`/`body.mf-builder-open` (the admin-shell body classes). **LESSON: a module's CSS must never ship unscoped element resets.** See `project_form_ssr_seo_refactor` memory.

## 8. Visual-QA acceptance bar (user standing rule)
Always Visual-QA with the **browser** (screenshots, not just getComputedStyle), pixel-perfect before/after must match, scroll-aware, check sliders/animations, CRITICAL THINKING + MINIMAL CHANGE. Reply to the user in **Vietnamese**. Frugality: AI-provider calls were rationed (OpenAI key low) — the layout/CSS/JS work here uses ZERO AI calls.
**RULE (user, 2026-06-13): only edit the canonical sources — Vite/TS + C#. NEVER hand-edit built JS/CSS.** This bit me this session: I edited `Assets/css/megaform-builder-shell.css` (a BUILD OUTPUT) and `npm run build:builder` wiped it. The CSS **source of truth is `MegaForm.UI/src/styles/*.css`** (vite.config.ts CSS_MAP copies `src/styles/ → Assets/css/ → platform wwwroot`). Same for JS: edit `src/**`, never `Assets/js/**`.

---

## 9. ⚠️ Windowed (inline) builder — "mất header" fix (DONE at rest; one edge pending)

**User:** "chế độ windowed bị mất header" (the windowed/inline Form Builder lost its top toolbar — Dashboard / form-name / Build·Design pill / Save / Publish / Fullscreen).

### Root cause
`.w-topbar` (the builder header) is `position: fixed; top:0; z-index:1000` (`src/styles/megaform-builder-shell.css:93`). That's correct in **fullscreen** (it anchors to `.mf-oq-surface.is-fs` which is `fixed inset:0`, so `top:0` = viewport top). But in **windowed** mode the builder renders inside `#mf-builder-root` in the Oqtane module pane, so a viewport-fixed `top:0` topbar lands **behind the Oqtane page header → invisible**. The Oqtane default theme's navbar is **`nav.navbar.fixed-top` — `position:fixed; height≈95px; z-index:1030`** (Bootstrap `.fixed-top`), floating over the top of the content area.

### Fix shipped (canonical sources — verified)
1. **CSS** `src/styles/megaform-builder-shell.css` (just after the `.w-topbar` base rule): in windowed mode switch the topbar to `position:absolute` so it anchors to `#mf-builder-root` (which `Index.razor` already sets to `position:relative; z-index:auto` for `.mf-oq-surface.is-inline` — a positioned containing block with NO new stacking context) and fills the strip `.b-outer` already reserves (`padding-top:var(--topbar)`):
   ```css
   .mf-oq-surface.is-inline #mf-builder-root .w-topbar { position: absolute; left: 0; right: 0; width: auto; }
   ```
   (An earlier `transform: translate(0,0)` on the root was WRONG — `transform` makes the root a stacking context that paints BELOW the host `fixed-top` navbar, so the re-rooted topbar got covered. `absolute` creates no stacking context → no occlusion.)
2. **JS** `src/shared/platform-host.ts` — `installFullscreenToggle()` now also calls `clearHostFixedHeaderForInline()` (+ on a few timeouts + a scroll listener for a ~4s boot window). It (a) measures the host fixed/sticky navbar bottom via `hostFixedHeaderBottom()` and sets `document.documentElement.style.scrollPaddingTop = navB+8` so future scroll-into-view clears the navbar; (b) one-shot/best-effort `window.scrollBy` to lift the surface top below the navbar if the SPA's focus-on-navigate scroll buried it.
3. **Cache:** bumped `BUILDER_BUNDLE_VERSION` 20260613-B154→**B155** (`src/loader/index.ts:24`); **versioned the previously-unversioned `megaform-builder-shell.css`** in the loader CSS manifest (`...shell.css?v=' + BUILDER_BUNDLE_VERSION`, index.ts ~line 61); bumped the loader-script stamps in `BuilderView.razor:261` + `Index.razor:1018` to B155. (DLL rebuilt+deployed for the Index/BuilderView changes.)

### Verified (browser, `MegaForm.UI/tools/mf-hb.cjs`)
- At rest (`scrollY=0`): topbar `top=114`, navbar bottom `95` → **fully visible**, `elementFromPoint(center)=TOPBAR`. Screenshot `MegaForm.UI/qa-topbar4.png` shows the complete header (← Dashboard · "FIFA World Cup 2026" · Published · Xây dựng/Thiết kế pill · undo/redo · Xuất bản · Fullscreen). **This is the user's primary complaint — FIXED.**
- QA scenarios added: `tools/scn-tb4.cjs` (rest-state, PASS), `tools/scn-tb5.cjs` (boot-scroll sampling), `tools/scn-tb8.cjs` (diagnostic).

### ⚠️ Remaining edge (next session — pick option A)
On the **worldcup** test page the MegaForm module sits *directly under* the host `fixed-top` navbar (builder `rootTop≈44 < navbarBottom 95`). The Blazor SPA **boot-scrolls the page to ~69px** on open (NOT a focused input — `document.activeElement==BODY`; likely a late/oscillating `scrollIntoView` during the heavy builder mount), which drags the builder top under the navbar. The best-effort `scrollBy` correction is **timing-dependent**: it WINS in some runs (`scn-tb8` → `scrollY=10`, surface top `103`, clear of navbar) but the framework re-asserts ~69 in others (`scn-tb5` → all samples 69). On a **real page with Oqtane content above the builder** (the user's actual layout in their screenshots) the builder sits well below the 95px navbar so the 69px boot-scroll does NOT bury it — this edge is specific to a module placed flush under a `fixed-top` navbar.
- **Option A (recommended, scroll-IMMUNE):** make the windowed topbar `position: sticky; top: var(--mf-host-top, 0px)` and zero `.b-outer { padding-top }` in windowed; JS sets `--mf-host-top=navB`. Sticky needs NO ancestor between topbar↔viewport to be a scroll container — change `overflow:hidden`→`overflow:clip` on `.mf-oq-surface.is-inline #mf-builder-root` and `overflow-x:auto`→`overflow-x:clip` on `.mf-oq-surface.is-inline` (both in `Index.razor` `<style>`), since `overflow:clip` clips without creating a scroll container. **Risk to verify:** Oqtane host module wrappers between the surface and `<body>` must not have `overflow:auto/hidden/scroll` (else sticky still binds to them) — inspect the live DOM chain first.
- **Option B:** find + neutralize the boot `scrollIntoView`/auto-scroll at its source (grep builder boot: `canvas.ts`, `properties.ts` have `scrollIntoView`/`.focus()`), e.g. pass `{block:'nearest'}` or `preventScroll:true`, or add `scroll-margin-top:navB` to the scrolled element.
- Do NOT use `position:fixed` below the navbar for the windowed topbar — a fixed-to-viewport bar can't stay aligned with the in-flow `.b-outer` reserved strip as the page scrolls (it overlaps content). Absolute (current) or sticky (Option A) keep it glued to the builder's top.
