# HANDOFF — START HERE — Recovery-regression fixes session (2026-06-15→16)

> Long autonomous session triggered by "read the handoffs, review every claim, fix the crash,
> Visual-QA". It turned into fixing a cascade of **April-revert regressions** the recovery had
> missed. Reply language: **Vietnamese**. Supersedes `HANDOFF_20260615_HANDOFF_CLAIM_REVIEW_AND_CSS_B1B2_FIXES.md`
> (still valid; this one consolidates + adds the later fixes). Memory: [[project-april-revert-incident-recovery]].

---

## 0) RUNNING SITE (critical — read first)
- **Live/QA site = `Oqtane.MSSQL3` → http://localhost:5070**, login **host / `abc@ABC1024`**, MSSQL DB `Oqtane_MSSQL3` on `.\SQLEXPRESS`. RenderMode=Static (server-render → no browser-cached Client DLL; only JS/CSS are browser-cached by `?v=`).
- **`Oqtane_new` (port 5000) = GOLDEN reference, usually NOT running, DO NOT deploy there.** But ⚠️ its **renderer is OLDER** than MSSQL3's (golden renderer.js=168KB no-composite/no-calendar; MSSQL3=187KB recovered, has both). So golden is NOT a faithful reference for the newer renderer's CSS — see §2.
- **Asset cache version = `20260615-B171`.** Deploy recipe: build → copy JS/CSS to `MSSQL3\wwwroot\Modules\MegaForm\{js,css}` (static, no restart) ; for a `.razor`/DLL change → `dotnet build Client` → Stop-Process Oqtane.Server → copy `MegaForm.Oqtane.Client.Oqtane.dll` to MSSQL3 root → `Start-Process MSSQL3\Oqtane.Server.exe -WorkingDirectory <MSSQL3>` → curl `/` for 200. Site rebinds in ~2-4s.
- **Backups/rollback:** `tmp-qa/_css_backup_pre_restore/`, `MSSQL3\_megaform_backup_20260615_b169/`, `MegaForm.Oqtane.Client\Index.razor.may24revert.bak`.

## 0b) THE PATTERN (why so many things broke)
The April-21 revert copied an April backup over the working folder. The recovery rebuilt MOST frontend from golden sourcemaps + C# from a ~June-1 backup (`_280_Oqtane_um4_6`) + decompiled DLLs — but **MISSED**: (a) the explicit `Resources` list in `Index.razor`, (b) `megaform.css` (left at the April-21 1092-line version — the real one is 2464 lines), (c) several JS bundles left at April-21. **Any future "X is broken/unstyled/blank" → suspect a stale April-21 file:** `stat` the deployed asset; if dated `Apr 21 21:37`, it's a revert artifact → restore from `_280_Oqtane_um4_6` (June-1) or rebuild from source.

---

## 1) FIXED + LIVE-PROVEN this session (do NOT redo)

### A. Handoff-claim audit (24-agent adversarial workflow)
Verified all 7 Docs handoffs against the recovered code. Findings: AI save-crash (QA_AI_ASSISTANT_CRASH_REPORT) was ALREADY fixed in source `[QA-20260615]` (saveFormEndpoint Oqtane→`Form`, error-log, chat-selector, MAX_TOOL_ITERATIONS=20) — verified, not redone. Composite renderer+designer source complete. SDK-listview C#/TS survived. Full results in the prior handoff.

### B. "Mất CSS" — builder + ALL admin surfaces + datetime calendar
1. **Builder CSS** (`megaform-builder-{shell,ts}.css` etc.) were April-21 on source+MSSQL3 → restored from golden (June-14). Design Studio now styled.
2. **`megaform.css` was April-21 (1092 lines) — the BIG one.** Restored from `_280_Oqtane_um4_6/Assets/css/megaform.css` (**June-1, 2464 lines**, has the `.mf-cal-*` calendar CSS + ~1372 lines of other June CSS) + re-applied B2 input tokens (radius 8px, border #e2e8f0) + the composite runtime block (`.mf-composite-cell/-sub/-req` + container-query). Deployed to MSSQL3 + all 5 platform copies. **QA: datetime calendar renders fully styled + localized (Tháng 6 2026, CN/Thứ 2…), today highlighted, Today/Clear/Apply.**
3. **Admin-surface CSS+JS (dashboard/submissions/myinbox/languages all unstyled/blank).** Root cause: the restored `.bak` `Index.razor` `Resources` getter returned `base.Resources` = EMPTY (`@inherits ModuleBase` → null), so no admin CSS/JS was declared. **Fix:** added `BuildMegaFormResources()` (fonts + megaform.css + widgets/themes/builtin + **admin-shell + submissions-ts + listview + workflow-inbox-ts + my-inbox-ts** CSS + core form JS + panel admin JS) and made the getter use it; kept `IsLightLoadContext`/`IsAdminOnlyAsset` gating (admin CSS always-on, admin JS gated for anon); added `OqtaneCoreAssetVersion`. Also `BuildSurfaceBootScript()` now calls `BuildMegaFormResources()` directly (the instance field was empty at that pass → myinbox/languages got no JS). QA: all surfaces load 9 stylesheets + render.

### C. B1/B2 — Oqtane admin panel-host (windowed surfaces + 3-button dock)
Active `Index.razor` was the May-24 revert (no panel-host). Restored `Index.razor.bak.20260613-fix` (June-13, has MfPanelMode/`.mf-oq-surface`/RenderAdminDock). It referenced 2 members lost in the revert → minimal fixes: added `ModuleConfigDto.ModuleRole` (Shared) + neutralized `IMegaFormService.SeedSubmissionsAsync` call. **QA: dock = exactly 3 buttons (Settings/Form Builder/Form Dashboard), `?mfpanel=builder|dashboard` render windowed surfaces, Fullscreen toggle present.**

### D. Stale April-21 JS bundles rebuilt from source + deployed
`megaform-languages.js` (April → no auto-mount → blank; now v20260612-03), `megaform-submissions.js` (April → old endpoint → "Unable to load submissions API 404"; now v20260609 → Form/List + Submissions 200), plus `megaform-i18n/widgets/admin-live/config.js`.

### E. AI form-builder
A1-1: `chat.ts ensurePromptRulesLoaded` used `platform.apiBase` (=`/api/MegaForm/`)→404; now `platform.aiApiBase` (=`/api/`). A1-2: Oqtane `AiToolsController.ListKnowledge` now accepts `bool full` + returns `body`. Listbox hardening: `opAddField` normalises hallucinated `listbox`/`dropdown`→`Select`/`MultiSelect`.

### F. Phone Number Pro flag dropdown
Added the selected-country checkmark (`.mfp-phone-country-check` + `-right` wrapper, TS+CSS), recompiled plugin.

### G. Submission detail → reuse the My-Inbox detail panel (re-applied 3b-C)
The TASK 3b-C swap (clicking a submission opens the polished My-Inbox detail: avatar + FORM RESPONSES rich-render + Details/History/Workflow tabs + Export, via `my-inbox/standalone-detail.ts mountTaskDetail`) was **lost in the revert** (`SubmissionsShell.viewSubmissionDetail` was back to `renderSubmissionDetailShell`). Re-applied with the old shell as fallback. **QA: detail panel = `.mf-mi3-shell mf-mi3-standalone`, Details/History/Workflow tabs, FORM RESPONSES; no old Data/Form/DB/Flow/Activity tabs.**

### H. Cache versioning → B171
Bumped every stamp (`Index.razor OqtaneCoreAssetVersion` + bootBadge, `BuilderView`/`DashboardView`/`SubmissionsView` self-loader stamps, `loader/index.ts BUILDER_BUNDLE_VERSION`) to `20260615-B171`, rebuilt loader+Client, deployed+restarted — so a normal **F5** (not Ctrl+F5) gets the new megaform.css + bundles. **NOTE the recurring trap:** if you rebuild a JS/CSS file AFTER a `?v=` bump, warm browsers keep the stale file at that same `?v=` — ALWAYS deploy all rebuilt files first, THEN bump once.

---

## 2) OUTSTANDING / NEXT SESSION
1. **DashboardDatabase not configured on MSSQL3** (AI "Create with AI" → Database tab shows "Connection string 'DashboardDatabase' not found"). It's a CONFIG choice, not a bug. Options: configure via dashboard **Configuration → Database Settings**, OR add `"DashboardDatabase": "Server=.\\SQLEXPRESS;Database=Oqtane_MSSQL3;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;"` to `MSSQL3\appsettings.json` ConnectionStrings (an auto-mode classifier BLOCKED me editing live appsettings — needs explicit user OK). Chat tab works without it.
2. **More April→June CSS/bundle gaps may surface.** The June-1 megaform.css restore covered the big one, but the source is June-1 not June-15 — a few June-1→15 CSS additions (beyond composite, which I re-applied) could still be missing. Same for any bundle still dated Apr-21 (`for f in <MSSQL3>/js/*.js; do stat -c '%y %n' $f; done | grep 'Apr 21'`).
3. **AI/DB Part-1 (from `HANDOFF_20260614_AI_DB_COMPOSITE_PLAN.md`):** A1-3 (6 missing Oqtane AiTools endpoints Forms/Form/GetPromptRecipe/Designers/Designer/Cascade — `_formRepo`/`_svc` already injected), DNN D-1/D-2 (DNN-only, DNN not running), D-3..D-9.
4. **Golden/DNN/Umbraco** still serve the OLDER renderer (composite-cell=0) + April CSS — redeploy the 187KB composite renderer + the 2464-line megaform.css there on their next normal deploy (do NOT touch golden unless asked).
5. **Composite native SSR**, **i18n** of new strings — carry-over.
6. `wf-app.ts` `tsc --noEmit` error is a FALSE ALARM (concatenated fragment; `build:workflow` EXIT 0) — no fix needed.

---

## 3) KEY FILES TOUCHED
| Concern | File |
|---|---|
| megaform.css (calendar + composite + B2) | `Assets/css/megaform.css` (restored from `_280_Oqtane_um4_6`, June-1) + 5 platform copies |
| Admin Resources list + surface boot | `MegaForm.Oqtane.Client/Index.razor` (`BuildMegaFormResources`, `BuildSurfaceBootScript`, `OqtaneCoreAssetVersion`) |
| Panel-host (B1/B2) | `Index.razor` (restored `.bak.20260613-fix`) + `ModuleConfigDto.ModuleRole` in `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs` |
| Submission detail = inbox panel | `MegaForm.UI/src/submissions/SubmissionsShell.ts` (`viewSubmissionDetail`→`mountTaskDetail`) ; host `src/my-inbox/standalone-detail.ts` |
| AI A1-1/A1-2/Listbox | `MegaForm.UI/src/ai-form-assistant/{chat,ops}.ts` ; `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` |
| Phone-pro | `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts` + `Assets/css/plugins/megaform-widget-phone-pro.css` |
| Cache stamps B171 | `Index.razor`, `BuilderView/DashboardView/SubmissionsView.razor`, `MegaForm.UI/src/loader/index.ts` |
| QA scenarios | `tmp-qa/scn-{qa-5070,surfaces2,calendar,subdetail,lang,sub-api,builder-via-dock}.cjs` |

## 4) Build / deploy quick-ref
- Bundles: `cd MegaForm.UI && node scripts/build-entry.cjs <renderer|builder|loader|dashboard|submissions|languages|i18n|widgets|admin-live|config>` → outputs to `Assets/js`. Plugins: `npx tsc -p src/widgets/plugins/tsconfig.json`.
- Deploy JS/CSS: copy `Assets/{js,css}/...` → `MSSQL3\wwwroot\Modules\MegaForm\{js,css}` (also the 4 source platform copies for consistency). Static → no restart; fresh QA ctx ignores cache.
- Client DLL: `dotnet build MegaForm.Oqtane.Client/...csproj` → `bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll` → MSSQL3 root → restart.
- QA: `node MegaForm.UI/tools/mf-hb.cjs --eval <scn>` OR `node tmp-qa/<scn>.cjs` (playwright-core, fresh no-cache ctx, login host/`abc@ABC1024`).
