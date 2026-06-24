# HANDOFF — 2026-06-17  SDK Files A→D · composite-Phone CSS · QR center-logo restore

Live = **Oqtane.MSSQL3** @ http://localhost:5070 (host / `abc@ABC1024`), DLLs at MSSQL3 root,
assets under `wwwroot/Modules/MegaForm/{js,js/bundles,css}`. DB = `Oqtane_MSSQL3` on `.\SQLEXPRESS`
(Trusted). Restart recipe: `Stop-Process Oqtane.Server` → `Start-Process MSSQL3\Oqtane.Server.exe
-WorkingDirectory <MSSQL3>` (no args; rebinds :5070 in ~3s). Static JS/CSS edits need NO restart;
only DLL swaps do. Health probe: `curl /api/MegaForm/i18n/list` → 200 + **18** locales.

Cache version this session: **`20260617-B174`** (was B173). Plugin builder cache-bust: **`20260617-15`**.
Backups: `MSSQL3\_mfbackup_20260617_{AtoD, B174ccp, qrlogo}\`.

Memory written: `project_20260617_sdk_files_platform_sdkdemo_hostwiring.md`,
`project_20260617_ccp_phone_css_fix.md`, `project_20260617_qr_center_logo_restore.md` (+ MEMORY.md index).

---

## ✅ 1. Backlog A→B→C→D — SDK Files / PlatformContext / SdkDemo / host wiring (LIVE)

Source handoff: `Docs/HANDOFF_20260616_SERVER_I18N_CACHE_SDK_DOCS.md` §NEXT-SESSION.

- **A — SDK Files end-to-end (Oqtane):**
  - NEW `MegaForm.Core/Services/SubmissionFileMetaExtractor.cs` — pure parser: File/PdfForm field
    values → `FileInfo` rows. Tolerant keys (mirrors `file-links.ts`). **PdfForm payload nests file-meta
    under `pdfFile`** → descends into it (else dropped — fixed via review). `StoredPath = tempPath`
    (clean rel path, NOT url-encoded fileUrl). Leading `[`/`{` ⇒ JSON-intent (parse-or-skip, no garbage row).
  - NEW `EfFileRepository` in `MegaForm.Oqtane.Server/Data/EfRepositories.cs` (InsertFile/GetBySubmission/
    DeleteBySubmission over `db.Files`/MF_Files). Registered in `Startup.cs` (fully-qualified
    `MegaForm.Core.Interfaces.IFileRepository` — Oqtane.Repository also defines IFileRepository).
  - `OqtaneStorageService` base `Data/MegaFormFiles`→**`App_Data/MegaForm/PrivateUploads`** (where
    UploadFile writes) + registered. ResolveFull hardened (trailing-sep prefix-sibling guard).
  - Submit hook `MegaFormController.PersistSubmissionFilesFailSoft` (new partial
    `Controllers/MegaFormController.SdkFiles.cs`) called from `Submit()` success branch — fail-soft,
    mirrors the DatabaseInsert try/catch. **Core SubmissionProcessor untouched → DNN unaffected.**
- **B — `OqtanePlatformContext`** (`Services/OqtanePlatformContext.cs`, 11 members via IHttpContextAccessor;
  PortalId←`X-OQTANE-SITEID`, UserId←`sub`/NameIdentifier) + registered. Low blast radius (explicit
  `MegaFormScope` still wins in `ResolvePortalId`; nothing in-host calls SDK scope-less yet).
- **C — SdkDemo:** Index.razor `MfPanelMode.SdkDemo` enum + 2 switch maps + admin-gated render
  `<SdkDemoView PortalId=SiteState.Alias.SiteId>`. Endpoint `[HttpGet("SdkDemo/Download")] [Authorize]`
  (SdkFiles.cs): `?submissionId=&fileId=` via SDK `Files.OpenAsync` (+ repo fallback) OR `?path=` via
  PrivateUploads. **IDOR guard** on integer branch: `IsSubmissionAdmin(actor) || sub.UserId==actor.UserId`
  else 404.
- **D — `AddMegaFormSdk()` + `MegaForm.Sdk` ProjectReference** on `MegaForm.Web/Program.cs` (net9; NOTE: no
  IFileRepository on Web → SDK Files empty/graceful) + `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
  (net8, full set). **SDK already multi-targets `net472;net8;net9;net10`** — the handoff's "DNN blocked by
  TFM" was WRONG; real DNN blocker = classic Web API has no `IServiceCollection` (uses ambient
  `MegaFormSdk.RunAsync`) → **a design decision, NOT done.**

**Verified:** Core/Server/Client build 0 errors · **41/41 SDK unit tests** (incl PdfForm + File shapes) ·
**adversarial 15-agent review** (Workflow) → fixed **2 HIGH** (PdfForm-dropped; SdkDemo IDOR) + 2
path-traversal hardening · deploy healthy (200 + 18 locales = startup/DI safe) · `/SdkDemo/Download` 403 anon
(was 404 = route registered + auth-gated) · **live anonymous submit 200, submissionId=47, no regression;
MF_Files stayed 5 for the non-file form → hook runs + early-returns correctly.**

⚠️ **One manual smoke-test still open:** positive file-roundtrip (upload File → submit → Files API returns
it). Couldn't automate: direct test-form DB INSERT is blocked by the safety classifier, and Oqtane admin
API needs the antiforgery/session dance (cookie `X-XSRF-TOKEN-COOKIE` ≠ the request token). Do it manually:
builder → create a form with a File field → publish → upload+submit → `?mfpanel=sdkdemo` shows the file, OR
`SELECT * FROM MF_Files WHERE SubmissionId=<n>`.

---

## ✅ 2. QA report fix — composite Phone country-picker `.mf-ccp` CSS (LIVE)

Report: `E:\MENU SPECS\HANDOFF_MEGAFORM_5070_QA_PHONE_COMPOSITE_20260616.md` (+20 screenshots
`E:\MENU SPECS\qa-screenshots\megaform-5070-widget-qa-20260616`).

**Root cause (all 5 P1s = one bug):** `country-picker.ts` emits `.mf-ccp-*` markup but **ZERO matching CSS
shipped** → flag SVG rendered at natural ~86px, trigger stacked vertically, opening the list expanded
`<body>` to ~18000px, mobile overflowed + phone-number collapsed to 30px.

**Fix (CSS-only):** added a full `.mf-ccp` block to `Assets/css/megaform.css` (source-of-truth static, NOT
vite-compiled) after the Composite section: one-line flex trigger, **fixed 22×16 flag frame**, absolute
popover dropdown (z 1200, `[hidden]{display:none}`, max-height 260 internal scroll), flex items. Plus a
real-mobile `@media (max-width:480px)` wrapping ALL `.mf-composite-row`/`-cell` (complements the existing
`@container` rule; viewport-media fires only on phones → does NOT reintroduce the B147 narrow-column squeeze).

**Deploy:** copied edited `megaform.css` → live + `MegaForm.Oqtane.Server/wwwroot` (verified 0 divergent
live-only lines first). Bumped cache B173→**B174** (Index.razor `OqtaneCoreAssetVersion` + boot badge +
Dashboard/Builder/SubmissionsView loaders) → rebuilt+deployed Client DLL + restart.

**Visual-QA** (`tmp-qa/qa-ccp-phone-20260617.cjs`, fresh Playwright, form 9 on `/`): ALL acceptance pass —
flag 22×16 · trigger 1-line h=40 · dropdown absolute 323px · body scrollH 6779→6779 (was 25359) ·
search "vn"→single Vietnam +84 (item 38px) · select→+84 · mobile scrollWidth=390=innerWidth (no overflow) ·
phone-number 240px (was 30). Screenshots `qa-ccp-*.png` + dropdown-open/search-vn confirm visually.

**Deferred from the QA report (NOT fixed — separate/lower-pri):** builder-canvas-vs-live parity (same
megaform.css now loads in builder → likely fixed, not separately Visual-QA'd) · "PhoneNumberPro not used"
(informational — the polished composite IS the fix) · P2 composite settings pane too generic · P2 fullscreen
builder leaves homepage DOM · P2 login dup-nav · P2 publish-button text mismatch · P3 CISS.SideMenu woff2 404
(NOT MegaForm).

---

## ✅ 3. QR Code center-logo RESTORE (regression) (LIVE)

User: form-corner QR popup lost its center logo.

**Root cause:** the QR Code Corner widget `MegaForm.UI/src/widgets/plugins/megaform-widget-qrcode.ts` was
reverted to **`v20260419-14`** (April), losing the **`v20260603-02`** center-logo feature. The logo-capable
compiled JS survived ONLY in `MegaForm.Umbraco/bin/Debug/net8.0/wwwroot/js/plugins/megaform-widget-qrcode.js`
(stale build output; found via grep `drawImage|logo`). Likely April-21-revert casualty.

**Restore:** ported the logo feature back into the TS (props `logoUrl/logoSize/logoPadding/logoShape`;
bootQr uses error-level **'H' when logoUrl set**; renderProperties "Center logo" UI with file-picker; CSS
`.mfw-qr-logo-*`; `roundedRect` + `drawLogoToCanvas`). Badge → **v20260617-15**. Compiled via
`tsc --project src/widgets/plugins/tsconfig.json` → `Assets/js/plugins/`; **diff vs known-good v20260603-02 =
logo-equivalent only.**

**Deploy + cache chain (both surfaces):** copied plugin → live + 4 wwwroots.
- Public form loads plugin at `?v=<bootBadge>` = **v20260617-B174** (already bumped by the CSS fix).
- Builder: `WIDGET_PLUGIN_CACHE_BUST` 20260525-01→**20260617-15** (builder/canvas.ts) + loader
  `BUILDER_BUNDLE_VERSION` B173→**B174** (loader/index.ts) → rebuilt `build:builder`+`build:loader` →
  deployed `megaform-builder.js` + `megaform-builder-loader.js` to live (**JS only — did NOT touch live
  builder CSS, golden-CSS trap**).

**Visual-QA proven** (`tmp-qa/qa-qr-logo-20260617.cjs`, loads LIVE plugin + renders QR w/ data-URI logo):
widget registers v20260617-15; canvas center 30×30 = blue-logo 585/900 + white-plate 170/900 (=84% logo, not
QR); corner finder-pattern dark 136 (QR intact); 0 errors. Screenshot `qa-qr-logo-result.png` = blue "M"
dead-center on white rounded plate.

⚠️ **Logo is opt-in via `logoUrl`** — restoring the widget gives back the builder **"Choose logo"** picker;
existing forms (e.g. form 9) show NO logo until one is configured in the builder.

---

## Files changed this session
- Core: `Services/SubmissionFileMetaExtractor.cs` (new).
- Server: `Data/EfRepositories.cs` (EfFileRepository), `Services/OqtaneStorageService.cs`,
  `Services/OqtanePlatformContext.cs` (new), `Services/Startup.cs`, `Controllers/MegaFormController.SdkFiles.cs`
  (new), `Controllers/MegaFormController.cs` (Submit hook).
- Client: `Index.razor` (SdkDemo panel + B174), `DashboardView/BuilderView/SubmissionsView.razor` (B174).
- Web/Umbraco: `Program.cs` / `Composers/MegaFormComposer.cs` + 2 csproj (AddMegaFormSdk).
- UI: `Assets/css/megaform.css` (.mf-ccp), `src/widgets/plugins/megaform-widget-qrcode.ts` (logo),
  `src/builder/canvas.ts` (plugin cache-bust), `src/loader/index.ts` (BUILDER_BUNDLE_VERSION).
- Tests: `MegaForm.Sdk.Tests/SubmissionFileMetaExtractorTests.cs` (new, 11 tests).
- QA scripts: `tmp-qa/qa-ccp-phone-20260617.cjs`, `tmp-qa/qa-qr-logo-20260617.cjs`.

## Deploy recipe used (works)
DLL: `dotnet build <proj> -c Release` → backup live DLL → `Stop-Process Oqtane.Server` → copy DLL →
`Start-Process MSSQL3\Oqtane.Server.exe -WorkingDirectory MSSQL3` → poll `curl /i18n/list` (200+18).
JS/CSS: edit `Assets/...` (or `MegaForm.UI` + `npm run build:<entry>`) → copy to live
`wwwroot/Modules/MegaForm/{css,js,js/bundles,js/plugins}` (no restart). Fresh Playwright ctx ignores `?v=`;
warm browsers need the matching cache bump.

## ⬜ NEXT-SESSION BACKLOG
1. **Manual file-roundtrip smoke-test** for SDK Files A (above) — confirm MF_Files populates + Files API returns it.
2. **D-DNN:** decide the DNN SDK facade (classic Web API ↔ `MegaFormSdk.RunAsync`/Initialize). Not started.
3. **QA-report P2/P3:** builder-canvas parity (verify the `.mf-ccp` CSS reaches the builder preview), composite
   Phone settings pane (default/preferred/allowed countries, show-flag toggle), fullscreen builder DOM isolation,
   login dup-nav, publish-button text. CISS woff2 404 is not MegaForm.
4. **Optional:** pre-configure a `logoUrl` on a demo form's QR field so the restored logo shows live without the
   user configuring it.
5. **(carried) Client-side composite-validation i18n** renderer rebuild (from the 06-16 handoff §E) — still pending.
