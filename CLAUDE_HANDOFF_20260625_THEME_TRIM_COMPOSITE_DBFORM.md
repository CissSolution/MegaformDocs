# HANDOFF — Theme-tab trim + all-composite QA + DB-connected form (2026-06-25, autonomous)

Live: http://localhost:5070 (Oqtane.MSSQL3, net10). Host login `host` / pwd in live `appsettings.json → Installation.HostPassword` (NOT Minh@2002). All 3 user tasks DONE + verified. **Uncommitted on `master`.** JS/CSS deployed to live → **user must Ctrl+F5** (AssetVersion not bumped, still B268).

## 1. Theme Designer — removed Inputs/Buttons tabs, made Global+Layout actually work
- `MegaForm.UI/src/builder/theme-tab-adapter.ts`: tab strip now **Global / Layout / Inspector** only (dropped Inputs + Buttons — their vars were stripped on themed forms / hardcoded = dead). `panelLayoutHtml` rebuilt: Show-border→`--mf-form-border`, Show-shadow→`--mf-form-shadow`, Column-gap→`--mf-grid-gap`; removed dead knobs (Base unit, Section gap, Alignment, Responsive-cols, Header/Footer, Sticky). Kept Form-padding, Field-gap, Max-width, Columns.
- `Assets/css/megaform.css` (deployed to live + repo wwwroot): the real standard-form card is **`.mf-form-inner`**; its radius/border/shadow/padding were **hardcoded** (~line 749 `.mfp, .mf-form-wrapper > .mf-form, > .mf-form-inner`). Made them **var-driven with fallbacks = the former hardcoded values**, and `:root --mf-form-border` `#f1f5f9`→`#e2e8f0` (keep B264). Existing forms byte-identical; themed forms now respond; premium `.mfp` shells still stripped (correct).
- VERIFIED: builder Design mode (form 861 std, 849 premium) shows only Global/Layout/Inspector; applying vars changes the **center canvas live** (red 4px border, 24px radius, big shadow, 460px width). Public render: form 860 (overrides) vs 861 (default) vs 849 (premium unchanged) all correct. Screenshots in `mfqa/out/task1qa-*.png`.
- Deploy: `cd MegaForm.UI && node scripts/build-entry.cjs builder` → copy `Assets/js/bundles/megaform-builder.js` to live `…/js/bundles/`; copy `Assets/css/megaform.css` to live `…/css/`. Backups: `megaform-builder.js.bak-pre-themetrim`, `megaform.css.bak-pre-themelayout`.

## 2. All-composite form + 30 rows (browser) → DB
- QA form **862** (`QA All Composite Fields`, module 1828) = all **19** composite presets. Filled **30 rows via real browser** (`mfqa/task2-fill.mjs`, anon `/api/MegaForm/render/862`): **30/30 submits 200**, 30 `MF_Submissions` rows with combined values. SSN left blank (its `###-##-####` mask rejects programmatic value-set; it's optional).

## 3. DB-connected form → real DB write
- Root cause of "cannot connect": `OqtaneConnectionRegistry.GetConnection("DashboardDatabase")` literal-lookup miss (appsettings only had DefaultConnection, no fallback).
- Fix (config, no rebuild): added `DashboardDatabase` (copy of DefaultConnection) to live `appsettings.json` → picked up via reloadOnChange, **no restart**. Backup `appsettings.json.bak-pre-dashboarddb`.
- Fix (durable, in source, uncommitted, needs rebuild): `MegaForm.Oqtane.Server/Services/Startup.cs` `GetConnection` now falls back to DefaultConnection when DashboardDatabase is absent (DNN parity).
- QA form **863** (`QA DB-Connected Registration`) with `settings.databaseInsert` → table `dbo.App_QA_Registrations`. PROVEN: 6/6 browser submits → **6 real rows** in App_QA_Registrations (Grace Hopper/Greeter…) + 6 audit rows. (AI-UI path not used: needs login + `MegaForm_AI_Enabled=true`; underlying feature proven deterministically.)

## Files changed (uncommitted)
- `MegaForm.UI/src/builder/theme-tab-adapter.ts`, `Assets/css/megaform.css` (+ built bundle)
- `MegaForm.Oqtane.Server/Services/Startup.cs` (DashboardDatabase fallback — needs rebuild to go live)
- Live (outside repo): `appsettings.json` (+DashboardDatabase), `js/bundles/megaform-builder.js`, `css/megaform.css`
- `mfqa/` QA scripts + screenshots. QA forms 860/861/862/863 + table App_QA_Registrations on seed module 1828 (no page → harmless; delete when done).

## Next / optional
- Bump `MegaForm.Oqtane.Shared/AssetVersion.cs` + rebuild Shared.dll + restart so users don't need Ctrl+F5.
- Rebuild+deploy Core/Server DLL to ship the Startup.cs DashboardDatabase fallback (then the appsettings entry is optional).
- DNN parity for the DashboardDatabase fallback + `data-mf-chrome` interplay if needed. Commit when you're happy.
