# Handoff — 2026-06-14 — My Inbox field-render/Forward fix (DONE) + SSR form-load optimization (IMPLEMENTED, QA PENDING)

Two tasks this session. **Task 1 is DONE + QA-proven + deployed.** **Task 2 is implemented + built + deployed but the final pixel-perfect QA was NOT run yet** (user paused here). Start at **§2.5 NEXT STEP**.

---

## TASK 1 — My Inbox: HTML/image field values rendered raw + DNN Forward "No people available" (✅ DONE)

**User report (DNN My Inbox):** (a) a field whose VALUE is HTML showed raw markup; an image field showed the raw `data:image/...` URI instead of the image; (b) Forward "people or departments" tree said "No people available."; (c) DNN bundle older than Oqtane.

**Root causes:**
- `MegaForm.UI/src/my-inbox/view.ts buildDetailTabDetails` rendered every field value with `escapeHtml(f.value)` → HTML/image values became escaped text.
- Forward tree calls `GET {workflowBase}/Directory`. **Oqtane HAS it** (`MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs:248 WorkflowDirectory`); **DNN did NOT** → 404 → empty tree.
- Deployed DNN `megaform-my-inbox.js` was stale (139KB/B130 vs 152KB source).

**Fix (B160) — shipped + QA-proven on BOTH platforms:**
1. Field render (shared TS, fixes both platforms):
   - `src/my-inbox/types.ts`: added `InboxField.fieldType?: string`.
   - `src/my-inbox/enrich.ts mapFields`: pass `fieldType: String(s.type||'').toLowerCase()`.
   - `src/my-inbox/ui.ts`: new helpers `escapeAttr`, `isImageDataUri`, `isImageUrl`, `isHttpUrl`, `looksLikeHtml`, `sanitizeHtml` (DOMParser allow-list sanitizer — no script/resource exec; allows p/h1-6/img/a/table/etc, strips on*/script/style/iframe, only safe href + data:image|http src).
   - `src/my-inbox/view.ts`: import helpers; field cell renders by kind — image (`fieldType image/signature` OR `isImageUrl`/`data:image`) → `<img class=mf-mi3-cell-img>`; rich (`html/richtext/wysiwyg` OR `looksLikeHtml`) → `<div class=mf-mi3-cell-rich>`+`sanitizeHtml`; http URL → link; else `escapeHtml`. Cell widened for rich/image.
   - `src/styles/megaform-my-inbox-ts.css`: styles for `.mf-mi3-cell-rich` (typography/img/table/blockquote/pre) + `.mf-mi3-cell-img`.
   - Badge bumped: `src/my-inbox/index.ts` → `MyInbox3Pane v20260614-B160`.
2. DNN Forward directory: added `[ActionName("Directory")] Directory()` to `MegaForm.DNN/WebApi/WorkflowApiController.cs` (class `WorkflowController`, ns `MegaForm.WebApi`) — uses `RoleController.Instance.GetRoles(portalId)` + `GetUsersByRole(portalId, roleName)`, excludes system roles, returns `{ portalId, groups:[{roleId,name,userCount,users:[{userId,userName,displayName,email,roleName}]}] }` (mirrors Oqtane). Generic `{controller}/{action}` route handles it. Added usings `DotNetNuke.Entities.Users` + `DotNetNuke.Security.Roles`.
3. Build/deploy: `node scripts/build-entry.cjs my-inbox` (no npm `build:my-inbox` script — run the entry directly; sync-platforms auto-copies). Bumped cache stamps: DNN `Views/FormView.ascx.cs:378 const string V` → `?v=20260614-B160`; Oqtane `Index.razor` (27× `?v=B159`→B160). Built DNN.dll + Oqtane.Client.dll. Deployed bundle(js+css)+DNN.dll → `E:\DNN_SITES\DNN10322_MegaTest\Website` (DesktopModules\MegaForm\Assets + bin) + restart pool; bundle(js+css)+Client.dll → `E:\DNN_SITES\OqtaneSites\Oqtane_new` (wwwroot\Modules\MegaForm + root) + restart.

**QA-PROVEN 2026-06-14 (headless mf-hb):**
- DNN (dnn10322_megatest.ai, form 1267 Blog Publishing Starter): Directory 200, 15 groups/15 users; ARTICLE BODY renders H2/P/STRONG/FIGURE/IMG + 3 images, **zero raw leak**; Forward tree 15 users/15 roles (was "No people available").
- Oqtane (localhost:5000): 4 core surfaces intact; My Inbox board B160; Forward tree 9 users/5 depts after `POST /api/MegaForm/Workflow/SeedOrgDirectory` (Oqtane_new had no org users — endpoint always worked, just no data).

Memory: `feedback_myinbox_field_render_and_forward_dir.md`.

---

## TASK 2 — Form-load spinner / SSR fast-paint + JS hydrate (⏳ IMPLEMENTED + DEPLOYED, FINAL QA NOT RUN)

**User report:** `http://localhost:5000/test-template-page/aurora-style-consultation` shows a spinner "kha lau" before the form loads — JS renders the whole form. "Is there a more optimized way?"

**Diagnosis (measured headless):** Oqtane behaves as an SPA. The form area is empty until: Blazor boots (`blazor.web.js` 200KB) → the module mounts (~987ms warm) → the ~270KB MegaForm JS pipeline loads (`megaform-renderer.js` 156KB + config 45KB + i18n 52KB + rule-engine 11KB) + fetches schema/i18n → **then JS builds the entire form DOM**. On cold/slow clients that whole window is the spinner.

**User decision (AskUserQuestion):** **"SSR + JS hydrate đầy đủ (không rebuild)"** — accept pixel-perfect risk + 36-form QA.

**Design — from the `hydrate-safety` workflow analysis (4 agents):**
- Skipping `renderFields()` is SAFE only when `calculatePages()` (runs BEFORE renderFields, sets `fieldPages/totalPages/currentPage`) is the sole source of page state. **customHtml forms are UNSAFE** to hydrate: C# `FormHtmlRenderer` does NOT execute `{{script:*}}`, does NOT split multi-page, does NOT evaluate showIf inline, does NOT inject `customCss`, uses defaults not formData. **Multi-page forms** need JS paging.
- ⇒ **Hydrate (no rebuild) ONLY for STANDARD, SINGLE-PAGE forms.** customHtml + multi-page → fall through to the normal client build (which now runs on a pre-built skeleton — `buildSkeleton` already no-ops when `#mf-fields-container-{id}` exists, the same path DNN FormView.ascx already uses).
- **The aurora-style-consultation form is STANDARD + single-page** (`SqlScripts/01.06.28e-form-templates.sql:1046`; theme=aurora-fashion, multiPage=false, NO customHtml) → eligible.
- `FormHtmlRenderer.RenderFieldsBody(schema, formId, locale)` emits ONLY the fields-container inner HTML (field-groups), NOT the wrapper/actions/submit; its field-group markup matches the JS contract (`.mf-field-group[data-key][data-type] > label.mf-field-label[for=mf-{formId}-{key}] > input#mf-{formId}-{key} + .mf-field-help + .mf-field-error#mf-err-{key}`).
- KEY structural detail: JS `renderStandardFields` (megaform-renderer.ts:1315) wraps fields in `<div class="mf-page" id="mf-page-{formId}-0">` (even single-page) and calls `bindConditionalLogic(container)` for the initial showIf hide. So the SSR must ALSO wrap in `.mf-page` and the hydrate path must call `bindConditionalLogic`.

**Implementation (done this session):**
1. `MegaForm.Oqtane.Client/Index.razor`:
   - SSR now **ON by default** (was gated `?mfssr=1`). New `SsrDisabled => uri contains "mfssr=0"` (A/B escape hatch). New field `_ssrSubmitText`.
   - `TryBuildSsrFormHtml(schemaJson)`: returns early (empty) if `SsrDisabled` OR `settings.CustomHtml` non-empty OR `settings.MultiPage` OR any field `PageIndex>0` OR any Section with `pageBreak` (helper `IsFieldPageBreak`). Else sets `_ssrSubmitText` (from `settings.SubmitButtonText`) + `_ssrFieldsHtml = FormHtmlRenderer.RenderFieldsBody(schema, _formId, _culture)`.
   - Build-call (in `OnParametersSetAsync` after `LoadWorkflowPreview`) is now **unconditional** (was `if (SsrMode)`).
   - The form-mount block (`else` branch ~line 1009) now emits, when `_ssrFieldsHtml` non-empty, the **FULL skeleton matching `buildSkeleton`** (wrapper#mf-form-wrapper-{id}.mf-form-wrapper[data-mf-ssr="1"] > .mf-form-inner > #mf-form-{id}.mf-form > #mf-progress + #mf-fields-container-{id} > **.mf-page#mf-page-{id}-0** > `@((MarkupString)_ssrFieldsHtml)` + honeypot + hidden form-id + .mf-form-actions{prev/next(hidden)/submit `@_ssrSubmitText`} ; then #mf-success / #mf-error / #mf-loading). The empty mount (`<div id="@FormMountId">`) is kept for ineligible forms.
2. `MegaForm.UI/src/renderer/megaform-renderer.ts renderFields()` (~1229): added hydrate branch FIRST — `if (!isCustomHtml && totalPages <= 1 && isSsrHydratable(container)) { customHtmlHasOwnSubmit=false; bindConditionalLogic(container); return; }` then the existing `container.innerHTML=''` + customHtml/standard rebuild. New helper `isSsrHydratable(container)` = wrapper has `data-mf-ssr="1"` AND container has a `.mf-field-group`. `buildSkeleton` already no-ops on the pre-built skeleton (line 490). NOTE: `bindConditionalLogic` is defined at megaform-renderer.ts:2217 (in scope).
3. Built `node scripts/build-entry.cjs renderer` (→ megaform-renderer.js 155.83KB, synced) + Oqtane Client DLL. Bumped Oqtane `Index.razor` stamp B160→B161 (27×). Deployed `megaform-renderer.js` + `MegaForm.Oqtane.Client.Oqtane.dll` → `Oqtane_new` + restarted (site READY). **DNN got NONE of Task-2 (SSR is Oqtane-only for now).**

### 2.5 NEXT STEP (resume here)
**The pixel-perfect QA was written but NOT run.** Tool: `MegaForm.UI/tools/scn-ssr-qa.cjs` (compares aurora **hydrate default** vs **`?mfssr=0` rebuild** — first-field paint time, `data-mf-ssr` marker, field-group `key:type` signature parity, input/submit counts, `doubleContainer` guard, console errors; screenshots `tmp-qa/ssr-hydrate.png` + `ssr-rebuild.png`). Run:
```
node "e:/.../MegaForm.UI/tools/mf-hb.cjs" --eval "e:/.../MegaForm.UI/tools/scn-ssr-qa.cjs" --w 1440 --h 1700
```
Then:
1. **Verify parity**: `parity.sigMatch===true` + `sameFieldCount` + `doubleContainer===1` (no double-render) + hydrate.errs empty + hasSubmit. If `firstFieldAt(hydrate) < firstFieldAt(rebuild)` → the win is real.
2. **Visually diff** `ssr-hydrate.png` vs `ssr-rebuild.png` — MUST be pixel-identical (acceptance bar). If the SSR field-group markup differs from JS `renderSingleFieldElement`, fix `MegaForm.Core/Services/FormHtmlRenderer.cs RenderFieldGroup/RenderInput` to match (compare against megaform-renderer.ts:1758 wrapper + 1962 renderInput).
3. **Broaden QA** (still on Oqtane :5000, 36 forms at `/test-template-page/<json-name>`): a standard form WITH widgets (Rating/Signature/File — confirm `MegaFormWidgets.bindWidgets` hydrates the SSR `mf-widget-host[data-mf-widget-hydrate]` placeholders); a form WITH conditional (showIf) fields (confirm bindConditionalLogic hides them post-hydrate); a MULTI-PAGE standard form (must FALL BACK to rebuild — `_ssrFieldsHtml` empty, no regression); a customHtml premium form (must be unchanged — empty mount + JS rebuild). Also confirm SUBMIT still works on a hydrated form (POST). Builder/dashboard/submissions/my-inbox surfaces unaffected (Index.razor change only touches the form-mount branch).
4. If all pass: deploy is already live; just confirm. If a real browser needs the new renderer, the stamp is already B161. Consider the remaining (deferred): **DNN FormView.ascx Literal SSR** (mirror — emit the same skeleton via `Literal` so DNN forms fast-paint too) + **lazy-load** non-critical bundles (i18n if multi-lang, rule-engine if rules, widgets if widget fields) per the SSR project plan.

### Risks / gotchas to watch
- **Pixel-perfect**: the hydrated DOM IS the C# `FormHtmlRenderer` output (not rebuilt) — it must equal `renderSingleFieldElement`. Any class/attr drift shows. This is the #1 thing to verify.
- **Blazor owns the mount**: the renderer overwrites `#mf-mount` children on rebuild; for hydrate it does NOT touch them. `_ssrFieldsHtml` is set once → Blazor's MarkupString diff is a no-op on re-render, so the JS-bound DOM survives. (Same reason the existing empty-mount JS-fill works.)
- **`totalPages<=1` guard**: even if C# eligibility lets a multi-page form through, the JS guard forces rebuild (fields re-paged on the pre-built skeleton) → safe, just a brief SSR paint then rebuild.
- Locale: SSR submit text + field labels use `_culture`; FormHtmlRenderer handles locale. Verify a non-en form.

### Build/deploy quick-ref
- Renderer bundle: `cd MegaForm.UI && node scripts/build-entry.cjs renderer` (sync-platforms copies to repo Assets + Oqtane/DNN/Web wwwroot copies; does NOT copy to live sites).
- Oqtane Client: `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj`; deploy `bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll` → `E:\DNN_SITES\OqtaneSites\Oqtane_new\` (root). Bundle js → `Oqtane_new\wwwroot\Modules\MegaForm\js\`. Restart: `Stop-Process Oqtane.Server; Start-Process Oqtane_new\Oqtane.Server.exe --urls http://localhost:5000`.
- Live host: Oqtane_new :5000, login host/Minh@2002. DNN: dnn10322_megatest.ai host/dnnhost.
- QA: `MegaForm.UI/tools/mf-hb.cjs --eval <scenario>` (playwright-core, fresh no-cache context, in-process login). Scenarios this session: scn-dnn-mi-b160, scn-oq-mi-b160, scn-oq-seedorg, scn-formperf, scn-formtype, scn-ssr-qa.

---

## TASK 2 UPDATE (2026-06-14 cont.) — standard hydrate validated + customHtml fast-paint added + MEASURED

**Key discovery:** the prior `hydrate-safety` workflow agent misread an OLD SQL template — the LIVE **aurora-style-consultation form IS customHtml** (formId 20: `customHtml`=7948 chars, **customCss=13347 chars**, 10 `{{field}}` + 63 `{{content}}` + **2 `{{script}}`** [theme_selector, aurora_filter], single-page, theme=aurora-fashion). So aurora can't no-rebuild-hydrate (scripts). My standard-hydrate correctly EXCLUDED it (`hasMfSsr=false` — verified by QA).

**User Q ("convert customHtml→standard?") answered:** DON'T convert (loses premium design). A customHtml form = standard fields + a custom layout/CSS + optional enhancement scripts; the heavy part (layout+CSS+content) server-renders fine. Fix = make the pipeline SSR customHtml (one-time code change covers ALL existing+future premium forms, no per-form edits). User chose **"paint-nhanh + lazy-load"**.

**IMPLEMENTED (paint-nhanh, built+deployed Oqtane):** `Index.razor TryBuildSsrFormHtml` now branches: standard single-page → `_ssrFieldsHtml` (hydrate, as before); **customHtml OR multi-page → `_ssrPaintHtml` (FormHtmlRenderer body) + `_ssrPaintCss` (settings.CustomCss) + `_ssrPaintWrapClass`**. Mount emits an `else if (_ssrPaintHtml)` branch = `<style>{customCss}</style><div class="{wrapClass} mf-ssr-paint" data-mf-ssr-paint="1">{body}</div>` — a STYLED instant paint with NO `#mf-fields-container-{id}` + NO `data-mf-ssr`, so the JS renderer's `buildSkeleton` OVERWRITES it and rebuilds the real interactive form (runs scripts, re-injects customCss). **Renderer UNTOUCHED for this path → final form = JS-built = pixel-perfect.** Built Client DLL only (bundles unchanged, stamp stays B161), deployed Oqtane_new + restart.

**QA-PROVEN (aurora):** placeholder renders (`paintSeen=true` default / `false` w/ `?mfssr=0`), final form parity PERFECT (13 field-groups, 21 inputs, submit, customCss in head, placeholder overwritten, 0 errors), premium design intact (`tmp-qa/paint-on.png`).

**MEASURED (mf-hb, honest numbers):** WARM time-to-`.mfp` paint-on **158ms** vs paint-off **166ms** (+8ms). COLD bundles (fresh ctx, warm server) paint-on **684ms** vs paint-off **775ms** (+91ms); both <800ms, both 467KB JS. ⇒ **paint win is MODEST (~91ms cold)**; form is visible <1s here. The user's "kha lâu" spinner is dominated by **Blazor SPA boot** (blank BEFORE the module renders) — paint can't fix that (it lives inside the Blazor component). Only **prerender** puts form HTML in the INITIAL response (before Blazor) for a true instant paint.

### ★ NEXT-STEP RECOMMENDATION (real fix for the cold spinner)
**Enable prerender for the FORM module only** (not site-wide). With module Prerender=true, the `_ssrFieldsHtml`/`_ssrPaintHtml` already wired here lands in the initial HTTP response → form shows INSTANTLY before Blazor boots. Root cause in `[[project_form_ssr_seo_refactor]]` (Oqtane `ModuleInstance.razor:39` `_prerender = ModuleState.Prerender ?? Site.Prerender`; MegaForm sets none → inherits Site.Prerender=false here). RISKS to QA: prerender runs OnParametersSetAsync server-side AND again after connect (double API load); admin/builder/dashboard surfaces also prerender → QA they still work. Highest-value remaining lever — confirm with user before enabling.

**Lazy-load (2nd half of the choice) — NOT done:** megaform pipeline (~270KB) loads as Oqtane Resources in `Index.razor`; gating by form-content is unreliable (ModuleState not readable in the Resources getter) + risky (i18n gating breaks non-English). Needs a renderer **load-on-demand** refactor — moderate effort/risk. Since paint shows the form before the pipeline finishes, lazy-load only speeds time-to-INTERACTIVE, not the visible paint — lower priority than prerender.

**Files touched (continuation):** `Index.razor` (`_ssrPaintHtml/_ssrPaintCss/_ssrPaintWrapClass` + TryBuildSsrFormHtml branch + mount `else if`). New QA tools: scn-ssr-qa, scn-aurora-schema, scn-aurora-html, scn-paint-qa, scn-paint-timing, scn-cold-load. ⚠️ **E: drive is an external USB SSD (Samsung T7) that disconnected+reconnected mid-session** — Oqtane.Server died (restarted); risk of recurrence.

---

## TASK 2 FINAL (2026-06-14) — ★ SITE-WIDE PRERENDER ENABLED = the real spinner fix (TESTED CLEAN, KEPT)

Per-module prerender is **NOT available on the deployed Oqtane 10.1.0** — the `Module` table has NO `Prerender` column (only the newer oqtane.framework-dev added `Module.Prerender bool?`). The ONLY prerender lever is **`Site.Prerender`** (the `Site` table HAS it). User approved a reversible site-wide test → it tested CLEAN → **KEPT**.

**What was done:** set `Site.Prerender = 1 WHERE SiteId = 1` on the Oqtane_new SQLite DB (the single content site; Site 2 left at 0) via the throwaway net10 tool `tmp-qa/prerendertool/` (`dotnet run -- <db> site-set 1`). Restart Oqtane. **REVERT = `dotnet run -- <db> site-unset 1` + restart.**

**PROVEN (the win):** the form's HTML is now in the **INITIAL HTTP response** (curl, no JS): `mf-ssr-paint` + `mf-field-group` + `aur-card` + "Style Consultation" all present, comment `prerender: True`. So the premium form **paints on first byte, before Blazor boots** — the cold spinner is GONE at the root (not just the +91ms the in-component paint gave). Headless: aurora form-visible at **373ms with only blazor.web.js loaded** (form was already in the HTML; the 270 KB megaform pipeline hadn't even loaded yet) vs 684–775ms before.

**PROVEN (no breakage):** all admin surfaces intact with site prerender ON — home form ✓, dashboard 48 rows + `mf-dash-root` ✓, submissions 14 rows ✓, builder ✓, sdkdemo 49 pills ✓, **0 new console errors on every surface**. Aurora final form fully interactive + parity-perfect (13 field-groups, 21 inputs, submit, customCss in head, placeholder overwritten by the JS rebuild, 0 errors, premium design pixel-identical — `tmp-qa/paint-on.png`).

**Why it's safe + the win compounds:** the SSR work already shipped (`_ssrFieldsHtml` hydrate for standard single-page; `_ssrPaintHtml`+customCss paint for customHtml/multi-page) is exactly what prerender emits into the initial response. Standard forms → instant + no-rebuild hydrate; customHtml/premium → instant styled paint + JS rebuild for scripts/interactivity. **Works for ALL forms, existing + future, with zero per-form changes.** Known minor cost (accepted): prerender runs `OnParametersSetAsync` server-side AND again after the circuit connects → 2× `GetFormAsync` per load (server-side only, not user-facing).

**Remaining / optional:** (a) the user was originally wary of site-wide prerender ("Oqtane=SPA, ko prerender tất cả") — it tested clean here but watch for edge cases on real skins / other module types; revert is one command. (b) **Lazy-load** (renderer load-on-demand for i18n/rule-engine/widgets) still not done — now LOWER value since the form already paints from the initial HTML; it would only trim time-to-interactive. (c) **DNN**: DNN forms render via FormView.ascx (server-side already) — confirm DNN form first-paint is fine; the Literal-SSR idea is moot if DNN already server-renders. (d) For a future Oqtane upgrade with `Module.Prerender`, switch from site-wide to per-module (form modules only) to fully honor the SPA preference.

---

## TASK 2 CONTINUATION (2026-06-14 #3) — prerender FLASH fix (no-rebuild fast-path) IMPLEMENTED, NOT YET BUILT/DEPLOYED/TESTED

**User-observed regression with prerender ON:** "form hiện ra ngay, sau đó spinner xuất hiện, và form hiển thị lại thêm 1 lần" = the prerendered form paints instantly, then a **spinner flashes**, then the form re-appears. This is the prerender **double-render**: Blazor Server runs `OnParametersSetAsync` server-side (prerender) AND again after the SignalR circuit connects (interactive). The 2nd (interactive) pass resets `_loading=true` (Index.razor ~1335) and does network `await`s — `LoadAdminConfigAsync` (~1469) + `GetFormAsync` (~1485) + the publish-status `ListFormsAsync` (~1521) — and while `_loading=true` the render shows `@if(_loading){ <div class="mf-load-spinner"> }` (~684), which REPLACES the already-painted prerendered form → the flash.

**FIX IMPLEMENTED (in `Index.razor`, NOT yet built):** a **process-static cache** `_formLoadCache` (ConcurrentDictionary, key=moduleId:formId:siteId, 30s TTL). Blazor Server runs prerender + interactive in the SAME process, so:
- The prerender pass loads the form normally and **fills the cache** (added right after `GetFormAsync`/`TryBuildSsrFormHtml`: `_formLoadCache[FormLoadCacheKey()] = (DateTime.UtcNow, _isPublished, _initialInlineCss, ssrSchemaJson, form?.WorkflowJson)`).
- New `TryFastPathFormLoad()` (placed after `IsFieldPageBreak`): on the INTERACTIVE re-render only (`RendererInfo.IsInteractive`), for a plain anon form view (`!_isAdmin && _formId>0 && _panelMode==None`), restores the cached load **synchronously** (sets `_isPublished/_initialInlineCss/SSR strings/_pendingRendererBoot/_pendingSurfaceBoot`, `_loading=false`) and returns. Called via `if (TryFastPathFormLoad()) return;` placed right after `AddPlatformHeadContent()` and BEFORE the `if (_isAdmin)` await block (~1452). Because the interactive pass now does NO awaits, Blazor never renders the intermediate `_loading=true` spinner → the prerendered form stays put → **no flash**.

**★ NEXT STEP (resume here):**
1. **Build the Oqtane Client**: `dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj`. (A prior build hit a BLOCKER — see corruption note below — now resolved.)
2. Deploy `bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll` → `E:\DNN_SITES\OqtaneSites\Oqtane_new\` (root) + restart Oqtane (`--urls http://localhost:5000`).
3. **Verify the flash is gone**: load `http://localhost:5000/test-template-page/aurora-style-consultation` in a real browser (Ctrl+F5) — should be: prerendered form paints → stays (NO spinner, NO re-flash). A headless check can't easily see the sub-second flash; eyeball it OR add a console marker. Confirm the form is still interactive (type a field, submit present) + admin surfaces still 0-error.
4. If the fast-path doesn't fire (e.g. `RendererInfo.IsInteractive` not as expected on Oqtane net10, or cache key mismatch), debug: log in `TryFastPathFormLoad`. Fallback if unfixable = the flash remains (no worse than now) OR revert prerender.

**Risks / notes for the fast-path:** `RendererInfo` is `ComponentBase.RendererInfo` (net9+; net10 here so OK, wrapped in try/catch). Cache TTL 30s bounds staleness (prerender→interactive is ms apart). Only the anon plain-form path is fast-pathed; admin/panel/list/embed still load normally. If a form is edited, stale for ≤30s.

**⚠️ FILE CORRUPTION FROM THE E: USB DROP (fixed):** the build failed on 4 errors `CS1001` in 3 MegaForm.Core files that had invalid C# `?.[` (should be `?[` null-conditional indexer): `Payments/Providers/StripePaymentProvider.cs:156`, `Integrations/Marketing/Providers/ConvertKitProvider.cs:61`, `KlaviyoProvider.cs:78`. These are NOT task files — likely corrupted when the **E: external USB SSD (Samsung T7) disconnected mid-session**. Stripe fixed `?.[`→`?[`; ConvertKit + Klaviyo were refactored (externally) to temp vars (`var subscriber = json["subscriber"];`). `grep -rn '?\.\[' --include=*.cs` now returns ZERO. **If the build fails again with odd syntax errors in untouched files, suspect another USB-drop corruption — re-grep for `?.[` and other garbage.**

**State of prerender:** `Site.Prerender=1` (SiteId 1) is STILL ON (kept). Revert anytime: `cd tmp-qa/prerendertool; dotnet run -- "E:\DNN_SITES\OqtaneSites\Oqtane_new\Data\Oqtane-202606111406.db" site-unset 1` + restart Oqtane.

Related memory: `project_form_ssr_seo_refactor`, `feedback_myinbox_field_render_and_forward_dir`, `project_my_inbox_b120`.
