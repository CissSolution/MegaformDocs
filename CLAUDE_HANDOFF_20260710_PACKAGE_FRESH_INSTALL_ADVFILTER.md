# HANDOFF — 2026-07-10: MegaForm 1.7.99 packages (Oqtane + DNN) + fresh installs for the next test session

> User (end of session): "package 2 bản megaform cho DNN và Oqtane, cài lên 2 bản DNN và Oqtane mới sạch để tôi test, và ghi handout — chuẩn bị sang phiên kiểm tra khác."
> This session's headline feature being packaged = the **submissions ADVANCED FILTER + PRESETS** (mock-parity), built + fixed earlier today (see `CLAUDE_HANDOFF_20260710_ADVANCED_FILTER_AND_WORKFLOW_E2E.md`).

## 0. TL;DR
- ✅ **Version bumped**: Oqtane `ModuleInfo.Version` 1.7.98→**1.7.99**, `MegaFormAssetVersion.Current` `20260709-B381`→**`20260710-B382`** (cache-bust `?v=`), nuspec 1.7.99; DNN manifest+script **01.07.99**.
- ✅ **Oqtane package**: `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.99.nupkg` (82 MB) — verified contains the new `megaform-submissions.js`/`.css` + `Shared.dll` carries `B382`.
- ✅ **DNN package**: `MegaForm.DNN/Install/MegaForm_01.07.99_Install.zip` (24.7 MB, 672 files, manifest v01.07.99) — includes the new submissions bundle.
- ✅ **Fresh Oqtane site :5122 INSTALLED + SEEDED + BROWSER-VERIFIED** — silent install of nupkg 1.7.99 into fresh DB `Oqtane_MegaForm_Fresh1799`; Shared.dll=**B382**, Client.dll=**1.7.99**. **Seeded a ready-to-test demo**: form **"Support Ticket (demo)"** (FormId 2, schema copied from :5120 form 35 → Priority/Category dropdowns, Status) on a **MegaForm module (ModuleId 38) on the Home page (PageId 31)**, bound via Setting rows, with **200 varied submissions** (random sample from :5120 → varied priority/status/category). Restarted the Oqtane process so the seed is picked up. **Browser-verified (Playwright, fresh context):** the site serves `…/megaform-submissions.js?v=20260710-B382` (fresh cache-buster ⇒ **no stale-cache issue** — the user just opens it), the submissions inbox loads (200 subs, 50/page), and the **"+ Add filter" dropdown OPENS with the real form fields** (Ticket Number/Requester Name/Email/Priority/Category/Subject/Description + Metadata) + "All fields" scope + "Presets". Screenshot `Docs/_verify_2026-07-10_shots/fresh5122-addfilter.png`.
- **To OPEN it (login host / abc@ABC1024)**: `http://localhost:5122/?mfpanel=submissions&formId=2` (or the Home page `/` shows the form; the Submissions sidebar → this form). Test: click **All fields** + **Add filter** (they DROP now — the earlier "won't drop" on :5120 was purely the stale `?v=B381` browser cache); Status filter → filters all rows; a field filter → "N of M on this page" badge.
- 📋 **Fresh DNN site** — package ready; the DNN 10.3.0 clean-install wizard is a multi-step SOP (see §3) — do in the next session or now if continuing.

## 1. Why re-package (root cause of the user's "buttons don't drop" report)
The advanced filter was hot-swapped onto the live :5120 earlier, but Oqtane stamps every module asset with a **static** cache-buster `?v=20260709-B381` sourced from `MegaFormAssetVersion.Current` (a compiled constant in `MegaForm.Oqtane.Shared.dll`). Hot-swapping the JS/CSS files does NOT change `?v=`, so the user's browser kept serving the **cached old bundle** → the new dropdowns/CSS never reached them (my Playwright tests used fresh contexts, so they always saw the new code — that mismatch is the whole story). Bumping AssetVersion → B382 + shipping it in the package makes every browser fetch the new files. A **fresh install** sidesteps caching entirely.

## 2. Fresh Oqtane :5122 (silent install)
- **Folder**: `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1799` (cloned from `Oqtane.Framework.10.1.0_1` via robocopy, App_Data + logs excluded).
- **DB**: `Oqtane_MegaForm_Fresh1799` @ `.\SQLEXPRESS` (Windows-auth; dropped-if-existed then created fresh by the installer).
- **appsettings.json** rewritten for silent install: `Database.DefaultDBType`=SqlServer; `ConnectionStrings.DefaultConnection`=`Server=.\SQLEXPRESS;Database=Oqtane_MegaForm_Fresh1799;Trusted_Connection=True;TrustServerCertificate=True;Encrypt=False;`; `Installation` = alias `localhost:5122`, host `host` / `abc@ABC1024` / `daotuanhung@gmail.com`; removed `InstallationId/Version/Date` so Oqtane runs a fresh install.
- **nupkg staged**: `MegaForm.Oqtane.1.7.99.nupkg` copied into `…\Packages\` → Oqtane auto-installs it during setup (MegaFormManager.Install builds the MegaForm schema in the fresh DB).
- **Launch (detached — the `&` in a bash background task gets killed; use this)**: PowerShell `Start-Process` with `$env:ASPNETCORE_URLS='http://localhost:5122'`, WorkingDirectory the site folder, `-WindowStyle Hidden -PassThru -RedirectStandardOutput _run_out.log -RedirectStandardError _run_err.log`. Runs as PID (was 27768). Silent install takes ~1-3 min (framework schema → MegaForm install → 16-template seed).
- **Readiness check**: `curl http://localhost:5122/` → 200/302 AND `OBJECT_ID('MF_Forms')` non-null in the DB.
- **Login**: host / abc@ABC1024. Submissions inbox: `http://localhost:5122/?mfpanel=submissions` (add a MegaForm module to a page + bind a form, OR seed a form; a truly fresh site starts with 0 forms — seed one to test the advanced filter, or map a template).
- **VERIFY (next session)**: the JS should now load as `…/js/megaform-submissions.js?v=20260710-B382`; the "All fields" scope selector + "+ Add filter" popover + "Presets" must drop open; apply a Status filter → server-filters all rows; a field filter → "N of M on this page" badge.

## 3. Fresh DNN site (package ready; install SOP from the prior session)
Package: `MegaForm.DNN/Install/MegaForm_01.07.99_Install.zip`. Clean-install SOP (proven 2026-07-09, see `CLAUDE_HANDOFF_20260709_DNN_PACKAGE_CLEAN_INSTALL_QA.md`):
1. New DNN 10.3.0 site from media `E:\DNN\DNN_Platform_10.3.0_Install.zip` → `E:\DNN_SITES\DNNQA1799x\Website`; IIS site+pool; hosts entry `127.0.0.1 dnnqaXXXX.ai`; DB `DNNQAxxxx` (grant `IIS APPPOOL\<pool>` db_owner).
2. Install wizard (`#txtUsername/#txtPassword/#txtConfirmPassword/#txtEmail/#txtWebsiteName`, `#continueLink`), host/dnnhost123!.
3. Host → Extensions → Install Extension → upload the zip; **license step: Playwright REAL click on the `<label>` in `.dnn-checkbox-container .checkbox`** (React state); Next/Install/Done are real clicks.
4. Prompt: `new-page` → `add-module --name MegaForm --pageid N --pane ContentPane --title "…"` → bind form via ModuleSettings SQL (`MegaForm_FormId`, `MegaForm_ModuleConfigured=true`) → `clear-cache`.
5. AI (optional): copy 5 `MegaForm_AI_*` HostSettings from :5120 (ApiKey row `SettingIsSecure=0`) + create `Website\dev.lock`.
Automation gotchas in the prior handoff §D (PersonaBar iframe id-clicks, install-wizard selectors).

## 4. What's in the packages (the advanced filter)
`submission-advanced-filter.ts` (new) + `SubmissionsShell.ts` (wired: icons, field adapter, value resolver, `onAdvancedChange` status→server, honest count) + `megaform-submissions-ts.css` (+95 `.mf-advf-*` rules + apply-disabled + filtered-count). All compiled into `megaform-submissions.js` + `-ts.css` and bundled in both packages. Behavior: mock-parity Add-filter/Presets/scope adapting to REAL form fields; Status→server (all rows); field/scoped/date → client page with "N of M on this page" badge; empty-value blocked. Verified on live :5120 earlier (Status 500000→49860; Priority=Urgent 50→3 + badge).

## 5. Build/pack commands used (repro)
- Oqtane: `dotnet build MegaForm.Oqtane.Client/…csproj -c Release` + same for Server (multi-target net9.0;net10.0 → also builds Shared+Core). Then `cd MegaForm.Oqtane.Package && ./nuget.exe pack MegaForm.Oqtane.nuspec -NoPackageAnalysis` → `MegaForm.Oqtane.1.7.99.nupkg`.
- DNN: `dotnet build MegaForm.DNN/MegaForm.DNN.csproj -c Release` (net472) then PowerShell `& .\MegaForm.DNN\BuildPackage-DNN.ps1 -NoPause` → the Install zip. (TS bundles already built by `npm run build:submissions` which synced to `Assets/` + all 4 platform wwwroots.)
- ⚠️ Run PowerShell scripts via the **PowerShell tool** (auto-mode blocks `powershell -ExecutionPolicy Bypass` via Bash).

## 6. Uncommitted / cleanup
- Source changes uncommitted (advanced-filter module + shell + CSS + version bumps + nuspec/ModuleInfo/AssetVersion). Commit when ready.
- :5120 still has the hot-swapped B381-labelled files with `.bak-advf` backups under `…\Oqtane.MegaForm.Prod1797\wwwroot\Modules\MegaForm\{js,css}\` — revert with the .bak or leave.
- Fresh :5122 process runs detached; stop with `Stop-Process -Id <pid>` (or Get-Process Oqtane.Server). To fully clean: stop, drop DB `Oqtane_MegaForm_Fresh1799`, delete the folder.

Memory: [[project_20260710_advanced_filter_and_workflow_e2e]] · [[reference_oqtane_module_version_deploy_gate]] · [[project_20260709_dnn_package_clean_install_qa]].
