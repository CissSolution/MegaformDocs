# HANDOFF — SDK Listview + Unified Designer + CSS polish (2026-06-14)

Continuation of `Docs/HANDOFF_20260614_PUBLIC_SUBMISSIONS_LISTVIEW_SDK_WIDGET.md` (§0 STATUS).
Live host: **Oqtane `E:\DNN_SITES\OqtaneSites\Oqtane_new`, http://localhost:5000, host/Minh@2002**, SQLite `Data\Oqtane-202606111406.db`. Cache version now **B165**.
All QA = headless Playwright (`MegaForm.UI/tools/scn-*.cjs`, in-process login, fresh no-cache context). Real screenshots in `tmp-qa/`.

---

## A. DONE + LIVE-PROVEN this session (do NOT redo)

1. **SDK listview runtime (GĐ0/GĐ1/GĐ3)** — `DataRepeaterService.ExecuteMegaformSubmissionsQuery` reads submissions via `ISubmissionRepository.List` (= the call SDK `FindAsync` makes; Core can't ref Sdk — circular). Whitelist projection, key→label headers, pseudo-keys `__id/__status/__date`. Branch in `ExecuteQuery` on `DataSource=="megaform_submissions"`. Config props in `DataRepeaterModels.cs` (`SubmissionsFormId/StatusFilter/FieldWhitelist/FieldWhitelistCsv`, `DataRepeaterColumn.Label`). DI: `MegaFormController` (4 sites) + DNN `DataRepeaterApiController.BuildService` pass the submission repo.
2. **Security (adversarial-reviewed + fixed + proven):** tenant guard = STRICT `hostForm.PortalId == targetForm.PortalId` (PortalId 0 is a real tenant — DNN default — do NOT special-case it); `if (s.IsSpam) continue` always; server-side row cap; ExportCsv friendly-label header. Cross-portal → "Cross-tenant access denied" (negative-tested live).
3. **SSR fix:** `FormHtmlRenderer.ContainsHydrationWidget` + `Index.razor TryBuildSsrFormHtml` early-return → widget-only form skips SSR hydrate → JS full rebuild → widget paints.
4. **getApiBase Oqtane crash fix** in `megaform-widget-data-repeater.ts` (was `window.$.ServicesFramework` of undefined).
5. **Unified Designer RESTORED:** root cause of "popup designer biến mất" = the 3 launchers' `isBuilderMode()` only accepted `#mf-builder`/`?mfformid=`, NOT `?mfpanel=builder` (how the Dashboard "Build" button opens it). Fixed in `megaform-{datarepeater,razor,dynlabel}-launcher.ts` (added `if (/[?&]mfpanel=builder/.test(s)) return true;`). Proven with the user's exact URL.
6. **Data tab "Form Submissions (SDK)" mode** in `unified-shell.ts buildDataTab`: [SQL Database]/[Form Submissions (SDK)] toggle, Source form ID, "Load field keys" (fetch `apiBase()+Form/Get?formId=`), Status filter, Public-fields whitelist, **Row/table template** textarea + **"Generate from fields"** button (`genSubmissionTemplate`), staged as `masterTemplate`. Added the 4 submission keys to the adapter `SQL_OWNED_KEYS`. Proven: round-trip into `MegaFormBuilder.state.schema`.
7. **AI assistant + KB sample templates:** AI drawer cards for `kind*=template` are clickable ("↳ Use this template") → fetch `AiKnowledge/Get?slug=` → drop Body into the active template textarea (`unified-shell.ts` wireAiPane). Seeded **4 templates** into `MF_AI_Knowledge` (WidgetType='datarepeater', Surface='designer', Kind='listview_template', **PortalId=NULL** — global; PortalId=1 did NOT match the request SiteId, so NULL is required). Seeder: `MegaForm.UI/tools/seed-kb-listview-templates.cjs`. Proven: drawer shows 4 cards, click applies the KB template.
8. **CSS (partially):** `Assets/css/megaform.css` `--mf-input-radius` 6→**8px** (proven applying live — softer/more professional) + `--mf-input-border` default `#d0d5dd`→`#e2e8f0`. **DEPLOYED.**

**Cache stamps bumped to B165:** `loader/index.ts BUILDER_BUNDLE_VERSION`, `Index.razor:1117` (`?v=B165`), `BuilderView.razor:270`. Rebuilt: tsc plugins, vite builder+loader, Core+Client (net10). Deployed to host + restarted.

**QA tools added:** scn-listview-sdk, scn-designer-check/open/sdk/usercheck/probe, scn-designer-ai-tpl, scn-ai-debug, scn-form-style-probe, scn-logout-probe, seed-kb-listview-templates.

---

## B. IN-PROGRESS / REMAINING (next session — START HERE)

### B1. Header padding (premium forms) — RULE ADDED BUT INEFFECTIVE ⚠️
- User: premium form's full-bleed dark header butts right against the Oqtane menu bar — wants a little padding-top.
- I added to `megaform.css` (before `/* Form card shadow */`): `.mf-form-wrapper.mf-custom-html-mode, .mf-form-wrapper.mf-custom-shell-mode { margin-top: 16px; }`. **DEPLOYED but NOT working** — probe shows the wrapper HAS the classes (`mf-form-wrapper mf-custom-shell-mode mf-custom-html-mode mf-theme-pure-grid-premium`) yet `marginTop` stays `0px`.
- **ROOT CAUSE (to confirm):** the premium theme's customCss (`mf-theme-pure-grid-premium`, likely the per-form `settings.CustomCss` injected at runtime, OR a `.mfp`/theme rule) sets the wrapper margin with higher specificity / `!important`, beating my rule. Also `gap` probe = -30 (the menu may be sticky/overlapping) — **verify the REAL visual gap with a screenshot first** (the menu selector in the probe is unreliable).
- **NEXT:** (a) screenshot the job-app page top to see the actual gap; (b) if a gap is needed, add `!important` to the margin-top OR target `.mf-form-wrapper.mf-theme-pure-grid-premium`/the premium customCss source; OR add the gap at the Oqtane module-pane level (`Index.razor` form container `padding-top`) so it's independent of per-form customCss. Test page: `/test-template-page/v0job-application-form-v20260419-06` (form 15, premium pure-grid). Probe: `node tools/scn-form-style-probe.cjs`.

### B2. Input border "đậm/xấu" — ✅ RESOLVED 2026-06-14
- **ROOT CAUSE:** `megaform.css` B47 canonical block (`:root, .mf-form-wrapper`, ~line 2646) set **`--mf-input-bg: #fafafa`** (line ~2657) — a GLOBAL gray fill overriding the `#ffffff` default at line 59. Gray-filled inputs on white cards = the "heavy/boxy" look. (Border #e2e8f0 + radius come from this block too; both fine.)
- **FIX:** changed `--mf-input-bg` to **`#ffffff`** (crisp white). Deployed `megaform.css`. PROVEN: computed input bg now `rgb(255,255,255)`, border `1px #e2e8f0`, radius 8px — clean professional. Screenshot `tmp-qa/form-border-after.png`. Central fix (all light/default forms); dark themes override `--mf-input-bg` in their own theme block so they're unaffected.
- (Superseded notes below kept for context.)

### B2-OLD. Input border notes (superseded)
- Radius 8px + lighter default border ARE deployed. BUT the user's forms are **theme-driven** (`megaform-themes.css` each theme sets its own `--mf-input-border`; the job-app form already computes `1px solid #e2e8f0` + bg `#fafafa`). So the base-var change does NOT alter themed forms' border colour.
- The likely real gripe = the **gray `#fafafa` fill** making inputs look boxy (filled+bordered). **NEXT:** confirm desired look with the user (options: crisp **white** input bg for light themes, OR **borderless filled**, OR keep border + lighter fill). Apply via a higher-specificity rule scoped to light themes (do NOT force white on the dark theme `--mf-input-bg:#16213e`, themes.css:118). Source of per-theme borders: `Assets/css/megaform-themes.css` (lines ~25,64,87,118,154,178,217…).

### B3. Logout error — NO REAL ERROR REPRODUCED
- Repro (`scn-logout-probe.cjs`): logout WORKS — lands on the page logged-out (header→"Login"), **no `#blazor-error-ui`**, form renders fine. Only artifact = `REQFAIL: /_blazor/disconnect net::ERR_ABORTED` = **benign Blazor behaviour** (browser aborts the SignalR disconnect beacon on the logout reload; not fixable/not harmful).
- **NEXT:** ask the user for the SPECIFIC error (screenshot/message/where they logout from — e.g. dashboard/builder/role-pinned page). If it's only the console `_blazor/disconnect` abort, document as benign. Possibly try logout FROM the builder/dashboard overlay (MegaForm fullscreen state) which I did NOT test.

### B4. Other remaining (from prior handoff)
- GĐ3 **Razor** widget SDK-source mode (Razor data path is SQL-based — separate).
- **DNN** live QA (DNN site not running in this env; code is wired).
- Optional: dedicated `PreviewSubmissions` AiTools endpoint; convert the KB seed + `MF_Forms 59` fixture into a proper EF migration / install step.

---

## C. TEST FIXTURE ON HOST — REVERT WHEN DONE
- **Host form `MF_Forms.FormId=59`** ("Survey Results — Public Listview (SDK)") = clone of form 56, schema = one DataRepeater field (`key=results`, `dataSource=megaform_submissions`, `submissionsFormId=56`, `fieldWhitelist=[__date,first_name,last_name,channels,interests]`).
- **Module 50** (page `/test-template-page/aurora-style-consultation`) repointed `FormId`/`MegaForm:FormId` 20→**59** (+ ViewConfig forced `{displayMode:fixed,viewMode:form}`). This is the LIVE listview demo + the builder-test target (`?mfpanel=builder&formId=59`).
- **REVERT:** set module 50 Setting `FormId`+`MegaForm:FormId` back to **20**; `DELETE FROM MF_Forms WHERE FormId=59`; optionally `DELETE FROM MF_AI_Knowledge WHERE Slug LIKE 'lv-%'`. Mutate via `node:sqlite` while the server is stopped.
- Memory: `project-listview-via-sdk-build`, `project-listview-via-sdk-cms`.

---

## D. BUILD/DEPLOY CHEAT-SHEET (this host)
- TS plugins: `cd MegaForm.UI && npx tsc -p src/widgets/plugins/tsconfig.json` → `Assets/js/plugins/`.
- Builder bundle: `npm run build:loader && npm run build:builder` → `Assets/js/bundles/megaform-builder.js` (+ loader).
- .NET: `dotnet build MegaForm.Core/...csproj -f net10.0` ; Server/Client csproj (net10).
- Deploy to host: DLLs (`MegaForm.Core.dll`, `MegaForm.Oqtane.{Server,Client}.Oqtane.dll`) → host ROOT; JS → `wwwroot/Modules/MegaForm/js/{,bundles/,plugins/}`; CSS → `wwwroot/Modules/MegaForm/css/`. **CSS/JS need NO rebuild** — just copy (headless QA fresh-context picks them up; real browsers need the `?v=` bump).
- Restart: Stop-Process Oqtane.Server → `Start-Process Oqtane.Server.exe -ArgumentList "--urls","http://localhost:5000"`. DB edits: server STOPPED (SQLite lock).
