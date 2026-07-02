# Handoff — Theme Designer cleanup + working CSS picker + fresh SQL QA site (2026-07-02)

Session on top of NuGet 1.7.44. All work below is **JS + CSS only (NO C# change)**, deployed to live **:5085** (`Oqtane.MegaForm.Check1743.MSSQL`, host/abc@ABC1024). NOT committed. Repack → 1.7.45 (Task 4).

## User rules reinforced this session
- **Canonical** — fix the single source of truth; beware host Bootstrap `.form-control` overriding our CSS.
- **Visual QA, no guessing** — verify every change with real screenshots / live DOM reads.
- **Anti-regression** — keep changes scoped, keep backward-compat wireup.
- **Keep TS files small** — new features → new small `.ts` file (theme-left-rail ~2k, theme-tab-adapter ~3k already large).

## DONE + Visual-QA PASS on :5085 builder Design tab (`?edit=true&mfpanel=builder&formId=1`)

### (1a) Removed **Elements** + **Colors** left-rail tabs
- `MegaForm.UI/src/builder/theme-left-rail.ts` — `visibleTabs` now `['presets']`; nav strip renders only Presets; elements/colors panes kept mounted but `display:none` (backward-compat wireup). QA: left rail shows only **Presets**. Screenshot `td-global.png`.

### (1b) Typography dropdown border made visible
- `MegaForm.UI/src/styles/megaform-builder-shell.css` `.mf-tr-font-select` — border was `#e2e8f0` (near-invisible; host Bootstrap `.form-control` could also win). Now `border:1px solid #cbd5e1 !important; border-radius:8px` + native chevron affordance (appearance:none + SVG). QA: computed border = `rgb(203,213,225)`, chevron visible. Screenshot `td-global.png`.
  - ⭐ Browser cached the old CSS under unchanged `?v=20260701-B341` — fresh install / fresh browser is fine; still, **bump AssetVersion on repack** so returning users get it.

### (2) CSS picker MOVED to right-rail **Inspector** sub-tab + MADE TO ACTUALLY WORK
The picker was previously a Pick button in the (now-removed) left Colors tab, and it **silently did nothing**. Two real root-cause bugs found & fixed:
- **Bug A (event never reached the right panel):** `theme-left-rail.ts renderInspectPick()` dispatched `mf:theme-inspect-element` on `document` **without `bubbles:true`**; the adapter listens on `window` → non-bubbling document event never reaches window bubble-phase listeners. FIX: added `bubbles:true` (also to `mf:theme-inspect-mode`).
- **Bug B (edits didn't apply):** the preview iframe applied inspector edits as plain inline style (`el.style[camel]=val`); premium template CSS uses `!important`, so the edit was overridden and looked dead. FIX in `builder/canvas.ts` iframe bootstrap: `el.style.setProperty(key,val,'important')`.
- New right-rail Pick button: `theme-tab-adapter.ts panelInspectorHtml()` adds `[data-mf-inspector-pick]` button; `onClickDelegated` fires decoupled `mf:theme-request-inspect-mode`; `theme-left-rail.ts` listens for it → `setInspectMode()`. Button label syncs via `mf:theme-inspect-mode` (`setInspectorPickBtnState`).
- **Color editing on the right:** new small module `builder/inspector-color.ts` (`isColorProp`, `colorToHex`); `inspectorRowHtml` prepends an `<input type=color>` swatch for colour props; `wireInspectorInputs` mirrors swatch → text input → `commitInspectorEdit`.
- QA (live DOM + screenshots `td-inspector.png`, `td-inspector-populated.png`, `td-inspector-colors.png`, `td-color-applied.png`): Pick element → 32 CSS rows on the right, 4 colour swatches (rgb→hex parsed), breadcrumb; **changing the colour swatch turned the preview heading red** (`rgb(241,240,237)`→`rgb(255,0,0)`); Pick button resets after one-shot pick. 0 new console errors (the `MegaFormWidgets is not defined` rating-suite error is pre-existing/unrelated).

### Files touched
- `MegaForm.UI/src/builder/theme-left-rail.ts` (tabs removed; request-inspect listener; bubbles:true)
- `MegaForm.UI/src/builder/theme-tab-adapter.ts` (right Pick button + handler + state sync; color swatch rows + wiring; import inspector-color)
- `MegaForm.UI/src/builder/canvas.ts` (iframe edit → setProperty !important)
- `MegaForm.UI/src/builder/inspector-color.ts` (NEW small module)
- `MegaForm.UI/src/styles/megaform-builder-shell.css` (`.mf-tr-font-select` border)

### Build + deploy
`cd MegaForm.UI && node scripts/build-entry.cjs builder` (70 modules; auto-syncs 3 platform wwwroot + CSS). Deployed to `Oqtane.MegaForm.Check1743.MSSQL/wwwroot/Modules/MegaForm/js/bundles/megaform-builder.js` + `.../css/megaform-builder-shell.css` (md5 verified). ⭐ Same-URL nav in the builder triggers Blazor enhanced-nav → blank builder; recover by navigating to `?mfpanel=dashboard` first, then the builder URL (full load).

## Task 4 — fresh clean SQL site + nupkg-only install (DONE — build side)

### 4a — Package 1.7.45 (DONE, verified)
- Bumped `MegaForm.Oqtane.Client/ModuleInfo.cs` Version 1.7.44→**1.7.45** (+ReleaseVersions), `MegaForm.Oqtane.Shared/AssetVersion.cs` `20260701-B341`→**20260702-B342**, nuspec version→1.7.45 (+release note). Rebuilt **Client + Shared** Release (net9.0+net10.0) — verified baked (`strings -el`: Client=1.7.45, Shared=B342). No Server/Core rebuild (no C# logic change; AssetVersion is `static readonly` read at runtime). Repacked **`MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.45.nupkg`** (78MB) — verified inside: builder.js md5 `a4b8d5ce…` + shell CSS `0331dc92…` + Client DLL 1.7.45.
- Pack cmd: `"C:\Users\Administrator\.nuget\nuget.exe" pack MegaForm.Oqtane.Package\MegaForm.Oqtane.nuspec -OutputDirectory MegaForm.Oqtane.Package -NoDefaultExcludes` (NU5128/readme warnings are pre-existing, non-fatal).

### 4b — Fresh clean Oqtane-on-SQL-Express site (**:5090**)
- Folder: **`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.FreshQA.MSSQL`** (extracted from `Oqtane.Framework.10.1.0.Install (1).zip`, self-contained `Oqtane.Server.exe`).
- **URL http://localhost:5090** · host **host / abc@ABC1024** · email daotuanhung@gmail.com.
- **DB (SQL Express, Windows auth):** `Server=.\SQLEXPRESS;Database=Oqtane_MegaFormFreshQA;Trusted_Connection=True` → inspect via SSMS / `sqlcmd -S .\SQLEXPRESS -d Oqtane_MegaFormFreshQA`. MF_* tables created by the module install.
- Auto-install via `appsettings.json` `Installation` section (no wizard). MegaForm installed **ONLY** via `Packages/MegaForm.Oqtane.1.7.45.nupkg` on first run (nupkg-only, per request).
- Launch: `cd <folder> && ./Oqtane.Server.exe` (run in background).

### 4b VERIFIED (2026-07-02)
Site up at :5090, host login works (auto-install created the host account). MegaForm **1.7.45** installed from the nupkg ONLY (Packages/ nupkg → consumed to `MegaForm.Oqtane.1.7.45.log`): DB `Oqtane_MegaFormFreshQA` has **24 MF_ tables** + ModuleDefinition Version=1.7.45; deployed `builder.js` md5 `a4b8d5ce…` + shell CSS `0331dc92…` (= my fixes) + Shared AssetVersion B342. Screenshot `fresh5090-home.png`. Launch is running in background (relaunch: `cd <folder> && ./Oqtane.Server.exe`).

### 4c — Next-session QA checklist (from scratch on :5090)
⚠️ **This is a truly clean install — NO MegaForm module is on any page yet.** First add one: login host/abc@ABC1024 → pencil (Edit) → control panel → **Add Module** → category **Common** → **MegaForm** → Add. Then the control-panel "Form Dashboard"/"Form Builder" links (or `?mfpanel=dashboard` / `?mfpanel=builder&formId=N`) work. Fresh browser → no cache issues.
1. **(1a)** Builder → Design tab: LEFT rail shows only **Presets** (no Elements/Colors).
2. **(1b)** Right Global tab → Typography: Heading/Body Font dropdowns have a clear border + chevron.
3. **(2)** Right → **Inspector** sub-tab → **Pick element** → click a form element in the preview → its CSS lists on the right (categorized, editable) with colour swatches → change a colour → the preview updates live.
4. **Regression:** wizard Template Gallery (live thumbnails + preview, from 1.7.44 work), form render, save, submissions, i18n language switch, presets/themes apply.
5. Confirm DB `Oqtane_MegaFormFreshQA` has MF_* tables + the seeded premium templates.

⚠️ Builder QA gotchas: same-URL nav → blank builder (nav to `?mfpanel=dashboard` first); builder shows a beforeunload dialog if there are unsaved inspector edits.
