# HANDOFF — Pane/mobile responsiveness + native action menus + popup regression fix (B276–B281, 2026-06-25)

Continues from `CLAUDE_HANDOFF_20260625_PAGE_INHERIT_SOFTNAV_PANES.md`. Live: `http://localhost:5070`
(Oqtane.MSSQL3, **net10.0**, Blazor Web App / enhanced-nav). Host `host` / `abc@ABC1024` (live
`appsettings.json → Installation.HostPassword`). Self-host root `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\`.
DB = SQL Server `Oqtane_MSSQL3` @ `.\SQLEXPRESS`. **AssetVersion now `20260625-B281`** (MegaFormAssetVersion.cs).
Browser QA = Node Playwright in `mfqa/*.mjs` (chromium; NOT MCP). Screenshots `mfqa/out/`.

---

## ✅ SHIPPED + COMMITTED this session (master)
- **`1b6653b`** `fix(css): narrow-pane responsiveness via container queries (B276)`
- **`e408f14`** `fix(oqtane): responsive panes/mobile + action-menu native + popup container-type regression (B277-B281)`

All deployed to :5070 (net10.0) + live-verified. Deploy per change type — see **DEPLOY** below.

### B276 — narrow-pane container responsiveness (`Assets/css/megaform.css`, ~line 2761 "[B276] NARROW-PANE")
Premium showcase templates (euro-youth `.ey-*`) author breakpoints by **viewport** (`@media min-width:1024/768`),
so in a narrow Oqtane pane on a WIDE screen the desktop layout fired and **overflowed the pane** (`.ey-panel`
497px in a 294px wrapper → 552px page-scroll @390px). Fix: `.mf-form-wrapper{container-type:inline-size;
container-name:mfpane}` + `@container mfpane (max-width:600px)` collapses `.ey-*` shell/grids to 1col +
`min-width:0`. Scoped under `.mf-form-wrapper` for +1 specificity (beats the template's own `!important`).
⭐container-type was INTENDED earlier (dead `@container(max-width:480px)` composite rule existed without the
declaration — lost in pre-B263 untracked history); re-adding it re-activated that dormant composite collapse.

### B277/B278 — native module action menus, no CSS leak (`MegaForm.Oqtane.Client/Index.razor` ~286, `@if(IsEditMode)` `<style>`)
The edit-mode `<style>` restyled the native Oqtane module action ▼ with **GLOBAL** `.app-moduleactions
.dropdown-toggle` → a single MegaForm module gave **EVERY** module's ▼ a white box/border site-wide
(user-reported). **B278 final = REMOVE the cosmetic box entirely** (every ▼ native/uniform). Kept only the
functional bits (z-index so form content can't cover the menu; `.dropdown-menu` colour de-contamination),
**scoped to the MegaForm module** via `.app-pane-admin-border:has(.mf-form-wrapper,.mf-oq-admin-dock,.megaform-module)`
— `.app-pane-admin-border` is Oqtane CORE, rendered PER-MODULE in edit mode (verified mfqa/qa-scope-verify.mjs:
borders never wrap >1 module). ⭐Razor gotcha: no literal `<…>` in a `<style>` comment (RZ9980 "unclosed tag").
⭐The action ▼ + oversized module TITLE were NOT a megaform leak originally suspected — title size is theme
`Theme.css` + Bootstrap `h2{3rem}`; only the toggle box was the leak.

### B279 — narrow-pane field layout (`megaform.css`, inside the `@container mfpane(max-width:600px)` block, "[B279]")
`.mf-row` (multi-col field rows) + `.mf-option-group.mf-cols-2/3/4` only collapsed at viewport ≤640 (megaform.css
~1797), so a 2-col "First name | Last name" row stayed 2-col in a 33% pane (measured 87px each). Added
container-collapse (87px→176px). Also trims premium narrow-pane internal padding (`--mf-form-edge-pad:8px` +
`.mf-form-inner{padding-inline:16px}` — pane stack was wrapper 16 + inner 28 = 44px each side).

### B280 — smart composite mobile layout (`megaform.css`, 3 composite blocks @container480 + @supports-@media540 + @media480, "[B280]")
The blanket `@media(max-width:480){.mf-composite-cell{flex:1 1 100%}}` stacked EVERY composite cell full-width →
orphaned the date `/` + time `:` separators + made forms very tall. Fix: keep SMALL groups on one row
(`flex-wrap:nowrap;flex:1 1 0`) for presets **dob, time, money, measurement, price_range** (short selects/numbers);
wide text groups (name/address/email_confirm/full_contact…) still stack. ⭐Composite markup:
`.mf-composite[data-preset=…]>.mf-composite-row>.mf-composite-cell+.mf-composite-sep`; ONLY dob(2 sep)/time(1 sep)
have separators. Test form **862 "QA All Composite Fields"** (21 composites) @ `/api/MegaForm/render/862`.

### B281 — ⭐POPUP-form regression fix (`megaform.css`, right after the B276 `container-type` decl, "[B281 regression-fix]")
**B276's `container-type:inline-size` BROKE popup-mode forms.** The popup dialog is `display:inline-block`
(shrink-to-fit; PopupRuntime ~index.ts:991, overlay z=2147483200 TRANSPARENT, auto-opens after delaySeconds≈6s).
inline-size containment makes the wrapper size from its container not content → circular → the form **collapsed to
a ~0-width sliver** (wrapW 0, card 2px) → invisible, and the transparent overlay sat over the hidden country-picker
→ real flag click intercepted by `.mf-popup-overlay`/`.mfp-card` (JS `.click()` still fired → why it "worked" in
non-popup probes). FIX: `.mf-popup-overlay .mf-form-wrapper,.mf-popup-body .mf-form-wrapper{container-type:normal
!important}`. Verified live form 868: wrapper 0→508px, real flag click opens dropdown (182 items). ⭐LESSON:
`container-type:inline-size` collapses any element in a shrink-to-fit (inline-block/float) parent — exempt them.

---

## 📦 NUGET PACKAGE — built + INSTALLED on a clean host
- **`MegaForm.Oqtane` v1.7.27** (multi-target **net9.0 + net10.0**) — `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.27.nupkg`.
  ✅ **Installed successfully on :5000 (Oqtane.New10, net10.0)** — fresh install, site boots, module+assets
  deploy, B281 CSS present. Commits `7ee0942` (version/handoff) + `6c382d8` (dependency fix).
- ⭐⭐**PACKAGING DEFECT FIXED (`6c382d8`) — the nuspec was net9.0-only AND omitted runtime deps**, so a
  FRESH install on a clean Oqtane host CRASHED at boot (`ReflectionTypeLoadException` in Oqtane's assembly
  scan): missing **MegaForm.Sdk.dll → Microsoft.AspNetCore.Razor.Language.dll → Microsoft.CodeAnalysis(.CSharp).dll**.
  (Matches the known DNN gotcha "MegaForm.Sdk.dll MISSING from every install".) The :5070 dev site only worked
  because it had ACCUMULATED these from prior manual deploys — packaging was never validated on a clean host.
  Fix: added net10.0 `lib/` entries + the 4 missing deps (both TFMs) to the nuspec. Dep closure =
  `(Core ∪ Server ∪ Sdk build output) − clean-host bin` = exactly those (HtmlAgilityPack/SixLabors on :5070
  are stale leftovers, NOT in the current build output → not needed). ⭐**INSTALL/ROLLBACK RUNBOOK** for a
  self-hosted Oqtane site: `Oqtane.New10` = :5000 (host/`Minh@2002`); copy `.nupkg` → `<site>\Packages\` →
  Stop-Process Oqtane.Server (that site) → Start-Process → Oqtane auto-installs on boot (extracts `lib/{tfm}`
  DLLs to the app ROOT + `wwwroot/Modules/MegaForm`, consumes the nupkg). Capture startup with
  `Start-Process -RedirectStandardError` to see boot crashes. ROLLBACK = stop, delete the MegaForm*.dll +
  deps from root + rename `wwwroot/Modules/MegaForm`, restart. ⚠️First install attempt CRASHED :5000 (missing
  deps) — rolled back to restore, fixed deps, re-installed OK.
- Built via lean path (this session changed only CSS + Index.razor + AssetVersion, no TS): bump
  `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec` `<version>` → 1.7.27; `cp Assets/css/megaform.css →
  MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/`; `dotnet build {Shared,Core,Client,Server} -c Release -f
  net9.0`; copy `MegaForm.Core.dll` into Server `bin/Release/net9.0`; `nuget.exe pack MegaForm.Oqtane.nuspec
  -NoPackageAnalysis`. Build log: `mfqa/_pack.log`.
- ⭐**Full official pack = `pack.cmd`** (npm builds 7 bundles → build net9.0 → `nuget pack` the nuspec). Use it if
  TS changed. ⭐Version is messy: nuspec was `1.5.1` (stale), csproj `<Version>`=`1.7.22`, last real packages 1.7.25/
  1.7.26 came from `dotnet pack` csproj. I bumped the NUSPEC to 1.7.27 and packed via nuget.exe. Reconcile both
  version sources next time. nuget.exe at `%USERPROFILE%\.nuget\nuget.exe`. net9.0 SDK 9.0.314 installed.
- Install on Oqtane: Admin → Module Management → Install → upload `.nupkg`, OR copy to `[oqtane]\Packages\` + restart.

---

## ⚠️⚠️ CLEAN-HOST INSTALL — MegaForm DB migrations BROKEN on a fresh SQL Server host (:5000)
After the package files install OK (deps fixed), MegaForm on **:5000 (Oqtane.New10, LocalDB, net10.0)**
is non-functional: `?mfpanel=myinbox` → **"Invalid object name 'MF_WorkflowTasks'"**, submissions/forms-overview
JSON errors, new forms don't save. Root cause: **the MF_* tables were NEVER created — module DB migrations fail.**
DB check: **0 MF_* tables**, ModuleDefinition `MegaForm.Oqtane.Client.Oqtane` Version=BLANK, 0 MegaForm rows
in `__EFMigrationsHistory`. Two migration bugs (only surface on a CLEAN host — :5070's tables predate them):
- **BUG 1 — FIXED (`64e2ae2`): duplicate migration id.** `01060034_AddSubmissionStatusIndex` AND
  `01060034_SeedTemplateGuides` both declared `[Migration("MegaForm.01.06.00.34")]` → EF
  `MigrationsAssembly.get_Migrations()` threw "same key already added" while BUILDING the list → NO migration
  ran. Fix: re-numbered SeedTemplateGuides → `.35` (+ renamed file 01060035_; idempotent so safe on existing DBs).
- **BUG 2 — FIXED (`740476c`, pkg v1.7.28): the EntityBuilder migration path NRE'd + the schema install had a
  GO-batch bug.** Two parts: (i) the EF `Migrate()` / EntityBuilder path threw a NullReferenceException in
  Oqtane `BaseEntityBuilder.Create()` → `MigrationBuilder.CreateTable` (FormViewEntityBuilder, op-build phase,
  deterministic). (ii) Fix = route **ALL** DBs through `MegaFormManager.InstallSchemaFromModel` (model-based
  `db.Database.GenerateCreateScript()` — never calls the migration Up()/EntityBuilders → no NRE; idempotent).
  ⭐The final blocker was **`GO` batch separators**: SQL Server's GenerateCreateScript emits `GO` (a sqlcmd-only
  keyword `ExecuteSqlRaw` rejects with "Could not find stored procedure 'GO'"); the old split-on-`;` glued GO to
  the next statement, failing ~37 CREATEs (incl MF_Workflows/MF_WorkflowTasks/MF_WorkflowTaskActions).
  `SplitSqlStatements` now strips standalone `GO` lines. History seeded from `db.Database.GetMigrations()`.
  ✅Verified on a FRESH :5000 (Oqtane.New10, LocalDB, net10.0): **0 → 24 MF_* tables** (incl the 3 workflow
  tables), 0 schema errors, 11 history rows; **My Inbox + Submissions panels load with NO error** (b310-*.png).
  ⭐**KNOWN LIMITATION:** GenerateCreateScript creates NEW tables but does NOT ALTER existing tables to add NEW
  columns. So a FRESH install gets the full current schema; an EXISTING install with schema drift keeps its old
  columns. (Seen on :5070: its old `MF_AI_Knowledge` lacks `WidgetType` → the WidgetType index logs a benign
  `[MegaForm schema] ERR ... Column ... does not exist` on boot; non-fatal, :5070 still works.) Future: add an
  ALTER-missing-columns pass for true upgrade support. Log marker `[MegaForm schema] ERR` flags any DDL failure.
- **Package IS complete** (the user's "missing KBs/SQL/DLL" was a mis-attribution — real cause = these migration
  bugs): verified the .nupkg ships 34 TemplateGuide KB `.md`, 8 PromptRecipes, 185 js, css, fonts, flags, +
  `lib/net9.0`+`lib/net10.0` DLLs incl all deps. "SQL scripts" = the EF migrations embedded in the Server DLL.

## ⚠️ OPEN / USER STILL VERIFYING
**Country-picker flag on form 868 (popup) — user reported "still doesn't drop" after B281.** My browser QA
(real Playwright mouse-click, NOT JS) on the **deployed B281** opens the dropdown (182 countries) at EVERY
viewport tested — 700px (matches the user's wide-form screenshot), 1280, 1366, 1920; nothing intercepts the
trigger; form is 508px centered on desktop / full-width at ≤768 (popup mobile design). Screenshots
`b300/b303/b305/b298`. **Conclusion: deployed code works; the user's browser is almost certainly serving CACHED
pre-B281 CSS** (consistent: Theme Designer renders the form INLINE → works; form-view POPUP with stale CSS →
collapse/overlap → flag hidden). **Action given to user:** test in **Incognito (Ctrl+Shift+N)** → `/?formid=868` →
wait ~6s for auto-open → click flag; if it works there it's cache → clear cache (Ctrl+Shift+Delete or DevTools
Network → Disable cache) + reset zoom (Ctrl+0, since ≤768 effective width makes the popup full-width = the
"quá rộng" look). ⭐If Incognito ALSO fails → it's a real server diff, dig into the popup overflow/`.mfp-card`
clip then (the bottom-flag dropdown is `clippedByCard:true` by ~8px from `.mfp-card{overflow:hidden}` — a latent
robustness fix would be `.mfp-card:has(.mf-ccp.is-open){overflow:visible}`, NOT yet shipped since unreproduced).

**Other pre-existing (NOT mine, left uncommitted):** `M MegaForm.UI/src/{ai-form-assistant/ops.ts,
dashboard/ai-form-creator.ts,shared/ddl-dialect.ts}` — from a prior session; left as-is. The lean pack did NOT
rebuild TS bundles, so these are NOT in v1.7.27 — run `pack.cmd` (full) if they need packaging.

---

## DEPLOY (per change type) — :5070 net10.0
- **CSS** (`Assets/css/megaform.css`): copy → `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\wwwroot\Modules\MegaForm\css\` +
  bump `MegaForm.Oqtane.Shared/AssetVersion.cs` (Current) → rebuild Shared dll (cache-bust stamp lives there).
- **Client dll** (Index/Dashboard/BuilderView.razor): `dotnet build MegaForm.Oqtane.Client …csproj -c Release -f
  net10.0` → `MegaForm.Oqtane.Client.Oqtane.dll` → live ROOT.
- **Shared dll** (AssetVersion bump): build `…Shared.csproj -f net10.0` → `MegaForm.Oqtane.Shared.Oqtane.dll` → live ROOT.
- ⭐STOP `Oqtane.Server.exe` before copying DLLs (loaded), then restart (also flushes Oqtane page/module cache).
  Pattern: `Stop-Process -Id <pid> -Force` → copy → `Start-Process Oqtane.Server.exe -WorkingDirectory <root>` → poll :5070.
- ⭐**QA-process hygiene (learned the hard way this session):** Playwright probes left **24 orphaned chromium**
  on this localhost box → server+browser load spiked 6–25s → made the picker look "dead". DO: run probes
  sequentially, `await browser.close()`, DON'T pipe `node …|head` (SIGPIPE orphans chromium), and after a batch
  `Get-Process chrome | ?{$_.Path -like '*ms-playwright*'} | Stop-Process -Force`.

## KEY FILES
CSS: `Assets/css/megaform.css` (B276/B279/B280/B281 all in/after the `@container mfpane` section ~2761-2810 +
composite blocks ~2750/2964). Client: `MegaForm.Oqtane.Client/Index.razor` (~286 edit-mode `<style>`). Version:
`MegaForm.Oqtane.Shared/AssetVersion.cs`. Renderer (country picker): `MegaForm.UI/src/renderer/country-picker.ts`
(`bindCountryPickers`, lazy list B216) + `interactive.ts:24` (calls it — core renderer, NOT a MegaFormWidgets
plugin). Popup runtime: `MegaForm.UI/src/renderer/index.ts:985-1160` (`ensurePopupRuntimeStyle`, `openPopup`,
triggerType scroll/click/delay). Package: `MegaForm.Oqtane.Package/MegaForm.Oqtane.nuspec`.

## QA SCRIPTS (mfqa/) committed this session
`qa-panes-rootcause/fixtest`, `qa-fullwidth-regression`, `qa-cssleak`, `qa-dropdown-source`, `qa-actionleak`,
`qa-scope-verify`, `qa-leak-verify`, `qa-beforeafter`, `qa-padding{,2,3,-fixtest}`, `qa-issue1-test`,
`qa-composite-mobile`, `qa-panes{,-diag}`, `qa-editmode`. Memory: `project_oqtane_pane_responsive_qa`,
`project_editmode_action_menu_leak_b277`.
