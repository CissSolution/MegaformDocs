# HANDOFF — Handoff-claim review + "mất CSS" / B1-B2 fixes (2026-06-15, autonomous session)

> Done autonomously while the user was out. Read each of the 7 Docs handoffs, adversarially
> verified every claim against the recovered code (24-agent workflow), then fixed the
> confirmed-broken items and Visual-QA'd on the LIVE running site. Reply language: Vietnamese.

## RUNNING SITE (IMPORTANT — changed since older memory)
- **The live/running QA site is now `Oqtane.MSSQL3` → http://localhost:5070, host / `abc@ABC1024`** (MSSQL DB `Oqtane_MSSQL3` on `.\SQLEXPRESS`). This is the April-revert RECOVERY deploy.
- `Oqtane_new` (port 5000, host/Minh@2002) = **GOLDEN reference, NOT running, do NOT deploy there.** Its CSS was used as the restore source per the user's instruction.
- All deploys + QA this session targeted **5070**.

## ROOT CAUSE of "mất CSS" (user-reported, top priority)
The April-revert recovery restored JS bundles + C# DLLs but **left the builder CSS at the April-21 reverted versions** on both `Assets/css/` (source) AND MSSQL3. Golden `Oqtane_new` had the correct June-14 versions (2–3× larger). So the builder right-rail "Design Studio" accordion rendered unstyled (plain black borders).

## WHAT WAS FIXED + DEPLOYED + QA-PROVEN on 5070

### 1. Builder CSS restore (the "mất CSS") — DONE, QA-proven
Restored from golden `Oqtane_new` → source `Assets/css/` + MSSQL3 + all 5 platform copies:
`megaform-builder-shell.css` (36→102 KB), `megaform-builder-ts.css` (44→127 KB),
`megaform-admin-shell.css`, `megaform-builder.css`, `megaform-submissions-ts.css`, `megaform-core.css`,
+ plugins `grid-repeater/pdf-form/phone-pro/rating-suite/signature/widgets-builtin`.
Backup of overwritten files: `tmp-qa/_css_backup_pre_restore/`.
**QA:** builder right-rail "Design Studio" now styled (border-radius 12px, white bg, padding); template cards + 3-button dock styled. `tmp-qa/qa-5070-builder-real.png`.

### 2. megaform.css runtime CSS — DONE
- **Composite runtime CSS** `.mf-composite-cell` (column flex), `.mf-composite-sub` (muted hint), `.mf-composite-req` (red `*`), `.mf-composite-part.mf-error`, responsive container-query (+viewport fallback). These were missing EVERYWHERE (incl. golden) — the B167 handoff claim that megaform.css carried them was STALE.
- **B2 input tokens** restored: `--mf-input-radius` 6→8px, `--mf-input-border` #d0d5dd→#e2e8f0 (the SDK/CSS-polish handoff's "RESOLVED" claim had been reverted).
Deployed to source + 5070 + all platform copies (megaform.css 39624→41548 bytes).

### 3. B1 + B2 regressions (Oqtane admin surfaces) — DONE, QA-proven  ★ biggest item
**Root cause:** active `MegaForm.Oqtane.Client/Index.razor` was the **May-24 revert version** (no panel-host); the correct June-13 version survived only as `Index.razor.bak.20260613-fix`. So `?mfpanel=dashboard` rendered nothing, the dock had 5 controls + a Settings popup, and `DashboardView/BuilderView/SubmissionsView.razor` were orphaned.
**Fix:** restored `Index.razor.bak.20260613-fix` → active `Index.razor`. The .bak referenced 2 members lost in the revert; minimal fixes applied to compile:
  - Added `public string ModuleRole {get;set;}` to `ModuleConfigDto` (`MegaForm.Oqtane.Shared/Models/MegaFormModels.cs`).
  - Neutralized `MegaFormService.SeedSubmissionsAsync` call in `Index.razor` (`GenerateSampleDataAsync`) — reseed-demo convenience disabled with a graceful message until the service method + endpoint are restored. Panel-host does NOT depend on it.
Old active file backed up: `MegaForm.Oqtane.Client/Index.razor.may24revert.bak`.
**QA on 5070:** admin dock now **exactly 3 buttons** (Settings · Form Builder · Form Dashboard); `?mfpanel=builder` → `.mf-oq-surface is-inline` windowed surface + builder boots (`window.MegaFormBuilder`) + palette + styled Design Studio; `?mfpanel=dashboard` → dashboard renders (NOT the form); Fullscreen toggle present. `tmp-qa/qa-5070-builder.png`, `qa-5070-dashboard.png`, `qa-5070-builder-real.png`.

### 4. AI assistant — A1-1 + A1-2 + Listbox hardening — DONE (the AI crash itself was ALREADY fixed)
- The QA_AI_ASSISTANT_CRASH_REPORT root cause (`ops.ts` posting `/Form/Save` on Oqtane → 400) was **already fixed in source** by a prior `[QA-20260615]` session (`saveFormEndpoint()` Oqtane→`Form`, DNN fallback, `appendErrorToChatLog`, chat-log selector `#mf-ai-log`, `MAX_TOOL_ITERATIONS`=20). The crash report's "no code changes" footer is stale. **Verified — nothing to redo.**
- **A1-1 (NEW fix):** `chat.ts ensurePromptRulesLoaded` used `platform.apiBase` (=`/api/MegaForm/`) → `/api/MegaForm/AiTools/Knowledge` → 404 → KB prompt-rules silently empty every Oqtane session. Now uses `platform.aiApiBase` (=`/api/`). Rebuilt+deployed dashboard+builder bundles.
- **A1-2 (NEW fix):** Oqtane `AiToolsController.ListKnowledge` now accepts `bool full` and returns `body` (mirrors DNN) so A1-1's rule loader gets full text, not just summary. Server rebuilt+deployed.
- **Listbox hardening:** `opAddField` (ops.ts) now normalises hallucinated `listbox`/`list box`/`multi-list`/`dropdown`→`Select`/`MultiSelect` so an unknown type can't reach the renderer.

### 5. Phone Number Pro flag dropdown — DONE
Added the §3.1 upgrade: checkmark `✓` on the selected country in a fixed-width `.mfp-phone-country-right` container (TS `renderCountryListHTML`) + `.mfp-phone-country-check`/`-right` CSS. Recompiled plugin + deployed to 5070 + all platform copies. (Scroll-into-view was already working via `highlightActiveItem`.)

### 6. Cache-bust B168→B169 — DONE
So the user's WARM browser gets the new CSS/JS on a normal F5: bumped `loader/index.ts BUILDER_BUNDLE_VERSION`, `BuilderView.razor` loader stamp, and `Index.razor` `oqtaneResourceBootBadge` → `20260615-B169`. Rebuilt loader + Client, redeployed, restarted. Verified 5070 serves loader with B169 + `megaform-builder-ts.css?v=20260615-B169` → 200/127131.

## DEPLOY / RESTART (proven twice this session)
Backups: `MSSQL3/_megaform_backup_20260615_b169/` (pre-B169 DLLs). Stop `Oqtane.Server` → copy DLLs (`MegaForm.Oqtane.{Client,Server,Shared}.Oqtane.dll`) to MSSQL3 root → `Start-Process Oqtane.Server.exe -WorkingDirectory <MSSQL3>` → site rebinds 5070 in ~2s. Static JS/CSS need no restart (fresh QA context picks them up; warm browsers need the B169 stamp).

## VERIFIED-GOOD (no action needed)
- AI save-crash fix, composite renderer (187 KB, `mf-composite-cell`) + designer wiring, SDK-listview C#/TS (DataRepeaterService submissions branch, tenant guard, launchers, unified-shell), phone-pro COUNTRIES array — all intact on 5070.
- Only 404s on the running site are the host **AcmeSkin theme** assets (`CISS.SideMenu/DnnSkins/AcmeSkin/...`) — unrelated to MegaForm, pre-existing.

## DEFERRED (documented, NOT done — lower value / higher risk / other-platform)
- **A1-3:** 6 missing Oqtane `AiToolsController` actions (`Forms/Form/GetPromptRecipe/Designers/Designer/Cascade`). The primary "Create with AI" path (`ai-form-creator.generateForm`) does NOT use the tool-loop, so impact is limited to the legacy chat tool-loop. Add by mirroring DNN (`_formRepo`/`_svc` already injected).
- **D-2 / D-1:** DNN `AiToolsController` DryRunValidate key-shape (qualified vs bare) + MSSQL-hardcoded SQL tools — DNN-only, DNN site not running.
- **Composite native SSR** (`FormHtmlRenderer`), **i18n** of new strings — carry-over from prior handoffs.
- **Renderer/CSS redeploy to golden `Oqtane_new` + DNN DesktopModules + Umbraco** — their `megaform-renderer.js` still has `composite-cell=0` (pre-revert April bundles). The RUNNING site (5070) is correct. Leave golden untouched per instruction; redeploy DNN/Umbraco on their next normal deploy.
- **wf-app.ts** `tsc --noEmit` error = FALSE ALARM (it's a concatenated fragment, not an ES module; `build:workflow` EXIT 0). No fix needed.

## ADDENDUM (2026-06-16) — ALL admin surfaces lost CSS + content (dashboard/submissions/myinbox/languages)

After the B1/B2 Index.razor restore, the user reported the **dashboard / submissions / my-inbox / languages** surfaces were UNSTYLED (bare links) or BLANK, and submissions showed "Unable to load submissions. API 404". Three stacked root causes — all now FIXED + QA-proven on 5070:

1. **`Index.razor` `Resources` getter returned `base.Resources` = EMPTY.** `@inherits ModuleBase` → `ModuleBase.Resources` is null, so the explicit CSS/JS list was empty → NO admin CSS (`megaform-admin-shell.css` etc.) or core form JS was declared. The `.bak.20260613-fix` LOST the explicit list the pre-revert May version had (its own comment "admin CSS stays ALWAYS-loaded" referred to a list that was gone). **Fix:** added `BuildMegaFormResources()` returning the full explicit list (fonts + megaform.css + widgets/themes/builtin + **admin-shell + submissions-ts + listview + workflow-inbox-ts + my-inbox-ts** CSS + core form JS + the panel admin JS bundles) and made the getter use it (keeping the `IsLightLoadContext`/`IsAdminOnlyAsset` gating: admin CSS always-on, admin JS gated for anon). Added `OqtaneCoreAssetVersion = "20260615-B169"`. **QA:** all surfaces now load 9 megaform stylesheets incl. admin-shell.

2. **`BuildSurfaceBootScript()` read the instance field `_allResourcesList`, which was empty when it ran** (the getter that populates it runs on a different prerender/interactive pass) → myinbox/languages got NO admin JS injected → blank. **Fix:** call `BuildMegaFormResources()` directly. **QA:** all admin JS (dashboard/submissions/my-inbox/languages/builder-loader) inject + register their `init*` fns; myinbox renders.

3. **Stale April-21 bundles the recovery missed:** `megaform-languages.js` (v20260407-02, no auto-mount → languages blank), `megaform-submissions.js` (v20260407-04 → called an old endpoint → API 404), plus `megaform-i18n.js`, `megaform-widgets.js`, `megaform-admin-live.js`, `megaform-config.js`. **Fix:** rebuilt all 6 from source + deployed (languages→v20260612-03, submissions→v20260609). **QA:** languages mounts (i18n/list + i18n/Get → 200); submissions loads (Form/List + Submissions API → 200, proper "No submissions found" empty state, no 404).

4. **Warm-browser cache:** bumped the View self-loader hardcoded stamps `DashboardView` (20260612-B138→B169) + `SubmissionsView` (B159→B169) so a normal F5 fetches the rebuilt bundles.

**Final QA screenshots:** `tmp-qa/final-dashboard.png` (full sidebar + Apps&Forms table + 3-button dock + Fullscreen), `final-submissions.png` (sidebar + KPI strip + submissions table, no 404), `final-languages.png`, `final-myinbox.png`. Backups: `MSSQL3/_megaform_backup_20260615_b169/`.

**LESSON:** the April-revert recovery rebuilt MOST bundles from golden sourcemaps but MISSED several (languages/submissions/i18n/widgets/admin-live/config stayed April-21), AND the restored `.bak` Index.razor had lost its explicit `Resources` list. Any future "surface unstyled/blank" → check (a) the Resources list is populated, (b) the surface bundle isn't an April-21 stale, (c) `BuildSurfaceBootScript` injects the admin JS.

## KEY FILES TOUCHED
| Concern | File |
|---|---|
| Composite + B2 CSS | `Assets/css/megaform.css` (+ 5 platform copies + MSSQL3) |
| Builder CSS restore | `Assets/css/{megaform-builder-*.css,megaform-admin-shell.css,...}` + plugins |
| A1-1 + Listbox | `MegaForm.UI/src/ai-form-assistant/chat.ts`, `ops.ts` |
| Phone-pro | `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts` + `Assets/css/plugins/megaform-widget-phone-pro.css` |
| A1-2 | `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` |
| B1/B2 panel-host | `MegaForm.Oqtane.Client/Index.razor` (restored .bak) |
| ModuleRole | `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs` |
| Cache B169 | `MegaForm.UI/src/loader/index.ts`, `BuilderView.razor`, `Index.razor` |
| QA scenarios | `tmp-qa/scn-qa-5070.cjs`, `scn-builder-via-dock.cjs`, `scn-404c.cjs` |
