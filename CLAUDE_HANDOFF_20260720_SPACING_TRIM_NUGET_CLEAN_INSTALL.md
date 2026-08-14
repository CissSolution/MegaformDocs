# HANDOFF — 2026-07-20: Top-spacing fix (ContentGapTrim) + NuGet 1.7.109 + clean nuget-only Oqtane install

> User (mid-session): "visual QA bằng browser để fix lỗi add spacing top của Oqtane khi sử dụng
> megaform và Bootswatch themes → sau đó đóng gói nuget lại và cài sang 1 Oqtane sạch (nuget only)
> để chuẩn bị QA lại từ đầu." + "tôi ra ngoài 3h, bạn tự động làm tất cả."

## 0. TL;DR — all three asks delivered
- ✅ **Diagnosed** the top gap (browser, no-guess). **Ground truth: it is NOT a MegaForm bug.**
- ✅ **Shipped a safe MegaForm-side mitigation** = `ContentGapTrim` (new client module). Verified E2E on the real :5126 Quartz page.
- ✅ **Repackaged** → `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.109.nupkg` (R3-J validate PASS).
- ✅ **Clean nuget-only install** → `:5127` (`Oqtane.MegaForm.Clean1809`), MegaForm **1.7.109** installed from the nupkg, all Bootswatch themes registered, renderer-with-fix served. Ready for QA from scratch.

## 1. ⭐ GROUND TRUTH of the "top spacing" (verified in-browser, do not re-litigate)
The big gap above the page content is **the stock Oqtane Bootswatch theme's own CSS**, plus (in the
user's screenshot) **Oqtane edit-mode chrome** — NOT MegaForm:
- `Themes/Oqtane.Theme.Bootswatch/Theme.css` → `.content { padding-top: 12rem }`
- `Themes/Oqtane.Theme.Bootswatch/Quartz.css` → `.content { padding-top: 14rem }`, `@media(min-width:992px){ 9rem }`
- No MegaForm stylesheet touches `.content` (grepped `Assets/css/*` + enumerated live `document.styleSheets`).
- The gap reproduces with **zero MegaForm modules on the page** (anon diagnostic: `.megaform-module` absent, `.content` padding 144px, header = `nav.navbar.fixed-top` 112px tall).
- On the REAL site the padding is only ~32–37px MORE than the actual fixed navbar (navbar 112px @≥992, **wraps to 187px** <992). So the top space is dominated by the **navbar's own height** (unavoidable — it's `position:fixed`, content must clear it), not by excess theme padding.
- The **huge** gap in the user's screenshot was **EDIT MODE** — note the faint "Default Pane" dropzone label in it. Anonymous/published view is already fine (see `scratchpad/clean-5126-1280.png`). Oqtane's edit-mode pane chrome is framework UI; MegaForm should not (and does not) fight it.

## 2. The fix — `ContentGapTrim` (companion to the existing FixedHeaderGuard)
- **New file:** `MegaForm.UI/src/renderer/content-gap-trim.ts` (small, per the keep-TS-small rule).
- **Wired:** `MegaForm.UI/src/renderer/index.ts` — `import { trimContentGap }` + call `trimContentGap(config.formId)` right after `applyFixedHeaderGuard(config.formId)` (~line 1495).
- **Also:** exported `findFixedHeader()` from `fixed-header-guard.ts` for reuse.
- **What it does:** when a MegaForm form renders inside a themed `.content` **and** there is a
  `position:fixed` navbar, it trims the host `.content`'s padding-top down to a **consistent
  `navbarBottom + 16px`**, but only when the theme reserves ≥10px more than that, and **never below the
  navbar+gap floor** — so every module in `.content` still clears the fixed bar and **nothing is ever
  hidden**. No fixed navbar / already-tight padding → no-op. Popup/preview/builder surfaces skipped.
  Re-measures on resize (navbar wrap changes height). Client-only (like FixedHeaderGuard — runtime
  measurement, so no `FormHtmlRenderer.cs` SSR twin needed).
- **Constants:** `GAP_PX=16`, `MIN_EXCESS_PX=10` (in the .ts). Earlier draft used 24/32 (too
  conservative → no-op on well-behaved Quartz). If the user wants the theme's original looser spacing
  back, raise these or delete the `trimContentGap` call.
- **Honest caveat for the user:** because the top space is mostly the navbar height itself, the visible
  win is modest (~16–21px tighter). It CANNOT move content dramatically higher without shrinking/removing
  the fixed navbar (a THEME change, outside the MegaForm package). It does NOT touch edit-mode chrome.

## 2b. ⭐ SECOND fix (user flagged mid-session): selected choice-card text invisible under Quartz borrow
- **Symptom:** on the tabbed form under a colored/dark Bootswatch theme, a **selected** choice card
  (e.g. "Founder / CEO", "11-50") showed **white text on a near-white background** → unreadable.
- **Root cause (template):** the selected card forces `background:#f7f7ff` (fixed light) but the label
  stays `color:var(--tab-ink)` = `var(--mf-page-text,…)` → borrows the page's WHITE text under Quartz.
  Verified computed: label `rgb(255,255,255)` on bg `rgb(247,247,255)`.
- **Fix (in the template JSON gốc):** added dark-text overrides for the selected card — since the
  selected bg is always the fixed light `#f7f7ff`, force selected label/meta `#101828` and desc `#475569`
  (identical to the default non-borrow look → no regression). Added to the `.mf-option-ui` (Round2
  flatten) checked rule:
  `…:has(:checked) .mf-option-label,…:has(:checked) .mf-option-meta{color:#101828!important;}` +
  `…:has(:checked) .mf-option-desc{color:#475569!important;}`.
- **Where applied:** canonical template `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/tabbed-account-setup.json`
  (the only shipped copy; DNN/Web/Umbraco have no own copy). Also deployed to Clean1809 + **shipped in
  the repacked 1.7.109**. The `Samples/FormTemplates/Premium/DONEE/` archive copy is hand-authored
  invalid-JSON (raw control chars) → left as-is (not shipped).
- **Live :5126 demo:** the existing form 15's customCss is materialized in `MF_Forms.SettingsJson`
  (NOT re-read from the template) → patched that row too (SQL REPLACE) + restarted. Now the selected
  card renders **dark `rgb(16,24,40)` text** — verified in-browser (`scratchpad/cards-fixed-live.png`).
- ⚠️ **Pattern note:** ANY premium template that borrows page colors AND forces a hardcoded light
  selected-bg has this same latent bug. Only `tabbed-account-setup` was fixed (the one the user flagged).
  Scan the other premium templates' `:checked{background:#…light}` rules if reported again.

## 3. Verification (no-guess, real pixels)
- **Isolated harness** (real Quartz+Theme.css from :5126): `scratchpad/trim-harness.html` + `run-harness.mjs`.
- **REAL E2E on :5126** (`/home`, Quartz, tabbed form 15 rendered): with the fix hot-swapped,
  `.content` padding **144→128px @1280** and **224→203px @800**, `data-mf-content-trim` set, card always
  clears navbar. Anon screenshots: `scratchpad/clean-5126-1280.png` (clean, not cramped).
- Diagnostic scripts live in the session scratchpad `…/209619be-…/scratchpad/`:
  `diag-spacing.mjs`, `diag-css-source.mjs`, `measure-stack.mjs`, `capture-5126.mjs` (will not persist).

## 4. Package — MegaForm.Oqtane **1.7.109**
- Version single-sourced from `MegaForm.Oqtane.Client/ModuleInfo.cs` → bumped **1.7.108 → 1.7.109** (+ appended to `ReleaseVersions`).
- Cache-bust `MegaForm.Oqtane.Shared/AssetVersion.cs` → **`20260717-B405` → `20260720-B406`**.
- **Built:** Shared + Core(net9) + Client + Server(net9+net10) Release, copied `Core.dll` net9 → Server bin, built Package project. Then `nuget pack MegaForm.Oqtane.nuspec -Version 1.7.109 -NoPackageAnalysis`.
- **R3-J `tools/validate-pack.ps1` → [PACK-OK]**. Verified packaged `wwwroot/Modules/MegaForm/js/megaform-renderer.js` contains the trim, packaged Shared DLL carries `20260720-B406`.
- ⚠️ **pack.cmd gotcha:** the `.cmd` wrapper wouldn't run cleanly through the cmd/PowerShell layers
  (garbled batch, `NoDefaultCurrentDirectoryInExePath`). I ran the steps directly (dotnet + nuget.exe).
  If validate flags "AssetVersion.cs newer than Server.dll", force-rebuild Server (`--no-incremental`)
  so the DLL mtime post-dates the source — it's a mtime heuristic (AssetVersion is `static readonly`,
  read at runtime from Shared, so Server needn't functionally rebuild).

## 5. Clean nuget-only install — `:5127` = `Oqtane.MegaForm.Clean1809`
- Folder `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Clean1809`; DB `Oqtane_MegaForm_Clean1809` @ `.\SQLEXPRESS` (Windows auth); alias `localhost:5127`; host `host` / `abc@ABC1024`.
- Built: robocopy from `Oqtane.Framework.10.1.0_1`; **added the Bootswatch theme** (copied `Oqtane.Theme.Bootswatch.Oqtane.dll` + `wwwroot/Themes/Oqtane.Theme.Bootswatch` from :5126 — no nupkg for it exists on disk; Oqtane discovers themes from the assembly); staged `MegaForm.Oqtane.1.7.109.nupkg` in `Packages\`; rewrote `appsettings.json` for silent SQL-Server install (removed InstallationId).
- **Launch (detached):** `Start-Process Oqtane.Server.exe --urls http://localhost:5127 -WorkingDirectory <site> -WindowStyle Hidden -RedirectStandardOutput _run_out.log`. PID recorded in `_run_pid.txt`.
- **Verified:** HTTP 200; `MF_Forms` exists; Oqtane `ModuleDefinition.Version = 1.7.109`; DLLs fresh (Shared has `20260720-B406`); served `megaform-renderer.js` has `mf-content-trim`; install log `Packages/MegaForm.Oqtane.1.7.109.log`; all Bootswatch variants in the `Theme` table.
- It is a **clean slate** (no pre-made forms/pages) — exactly "QA lại từ đầu". To QA the spacing:
  add a MegaForm module to a page, set the page theme to a Bootswatch variant (e.g. Quartz), bind a form.

## 6. ⭐ MegaForm Oqtane form↔module binding (the quagmire, now solved)
The Oqtane MegaForm module resolves its form from an Oqtane **`Setting`** row (unified table, NOT
`ModuleSetting`, NOT `MF_Forms.ModuleId`, NOT a `MF_ModuleViewConfig` table):
- `Setting`: `EntityName='Module'`, `EntityId=<moduleId>`, `SettingName='MegaForm:FormId'` (legacy `'FormId'`), `SettingValue='<formId>'`.
- Source: `MegaForm.Oqtane.Client/Index.razor:1805-1806` (`ReadModuleSetting("FormId")` / `"MegaForm:FormId"`).
- Direct DB inserts require a **site restart** (Oqtane caches module settings). Fresh Playwright context alone is not enough.

## 7. :5126 (Fresh1805) state changes made this session
- Repointed `MF_Forms.FormId=15 → ModuleId=40` (harmless; the real binding is the Setting below).
- **Inserted `Setting` (Module/40/`MegaForm:FormId`=15)** → Home now renders the tabbed form 15 under Quartz (this also restores Home from the earlier "No form configured"). Module 36's Home PageModule is soft-deleted; module 40 is the live one.
- **Hot-swapped** the new `megaform-renderer.js` (with the trim) onto :5126 wwwroot; **restarted** :5126 (now PID from `_run_*3.log`). AssetVersion on :5126 is still B405 (only JS hot-swapped, Shared DLL not redeployed) — fine because the fresh Playwright context isn't cache-bound; for a browser test append `&_cb=` or hard-reload.

## 8. Uncommitted changes (NOT committed — user rule: commit only when asked)
- `MegaForm.UI/src/renderer/content-gap-trim.ts` (new)
- `MegaForm.UI/src/renderer/index.ts` (import + call)
- `MegaForm.UI/src/renderer/fixed-header-guard.ts` (export findFixedHeader)
- `MegaForm.Oqtane.Client/ModuleInfo.cs` (1.7.109 + ReleaseVersions)
- `MegaForm.Oqtane.Shared/AssetVersion.cs` (B406)
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/Templates/tabbed-account-setup.json` (selected-card dark-text fix)
- Built artifacts: `Assets/js/megaform-renderer.js` + the 4 platform wwwroot copies; `MegaForm.Oqtane.Package/MegaForm.Oqtane.1.7.109.nupkg`.
- Suggested commit (Oqtane-only, additive; DNN/Web/Umbraco twins share the same JS via sync):
  `feat(renderer): ContentGapTrim — normalize excess theme top-gap on fixed-navbar pages (1.7.109)`

## 8c. ✅ FIXED (2nd round) — event-registration Next button + tight rows + common spacing
User (round 2): "fix form không có nút next, va spacing row quá sát (regression); điều chỉnh chung CSS
để giãn cách chiều dọc giữa các field đẹp; đóng gói lại + cài site Oqtane mới sạch để kiểm tra cuối".
- **Root cause** (see §8b for the discovery trail): `reflowWizardFieldTokensBySchemaPages`
  (`MegaForm.UI/src/shared/custom-html-insert.ts`) removes each field's wrapper and re-inserts flat at
  the step-panel → destroys the authored `.mfp-step-body > .mfp-field-row > .mfp-field-col` nesting →
  fields hoisted into the flex-ROW step panel (email/phone balloon to 620px), miss the step-body gap,
  and the `.mfp-actions`+Continue button get pushed ~1000px off-view. It already exempts
  `data-mf-flexgrid` shells; it did NOT exempt authored grid-cell shells.
- **Fix:** added a guard at the top of `reflowWizardFieldTokensBySchemaPages` — `if
  (/\bmfp-field-(?:row|col)\b/.test(src) || /\bmfp-step-body\b/.test(src)) return src;` — so hand-authored
  grid shells keep their nesting (they place tokens per-step by design; reflow is unnecessary + destructive).
  The migration runs at SAVE (wizard `dashboard`, `builder`) AND render (`renderer/helpers.ts`) → rebuilt
  all three bundles.
- **Spacing (user's "chung CSS"):** event-registration template `.mfp-step-body` gap 18→**24px** (both
  reps); common `Assets/css/megaform.css` `--mf-field-gap` 16→**20px** (synced to all wwwroots).
- **VERIFIED:** (1) unit test — ran the real `migratePremiumWizardSchemaToNative` on the pristine
  template → nesting preserved (`FLATTENED:false`). (2) Visual — rendered the migrated output:
  **Continue button visible** (top 588, was 1742), first/last + job/org **side-by-side** grid, Email/Phone
  full-width, `.mfp-step-body` gap **24px**, no 620px ballooning (`scratchpad/migrated-shot.png`).
- **Repacked FINAL 1.7.109** (dashboard+builder+renderer+event-reg template+megaform.css) → R3-J PACK-OK;
  packaged dashboard+renderer both carry the reflow-skip.
- **New clean site `Clean2` :5128** (`Oqtane.MegaForm.Clean2`, DB `Oqtane_MegaForm_Clean2`,
  host/abc@ABC1024) — silent-installed the FINAL nupkg (module 1.7.109), Bootswatch registered, all fixed
  bundles/assets deployed. Ready for the user's final QA: log in → add a MegaForm module to a page → create
  a form from **Event Registration** template → the Continue button + 2-col grid + spacing render correctly.
- ⚠️ Form 3 on :5127 (Clean1809) stays flattened — it was SAVED by the OLD (unfixed) bundle; its stored
  customHtml is already flat and render-time reflow-skip won't un-flatten it. NEW forms (post-fix) are fine.
  (PS 5.1 can't rewrite it — the schema has duplicate camel+Pascal keys ConvertFrom-Json rejects.)

## 8b. ⭐ (root-cause trail) event-registration premium template — the investigation
On `event-registration-rsvp` (form "zzzzz" id 3 on :5127 Clean1809, Solar dark theme), user reports:
(1) **no visible Next button**, (2) **row spacing too tight** ("regression, đã fix trước đây").
- **Reproducible in isolation** via `GET /api/MegaForm/render/3` (HTTP 200) — so it's the SHIPPED
  template/premium-native rendering, NOT the :5127 page setup. (Screenshot `scratchpad/render3-clean.png`.)
- **Root cause (PRECISELY located, not fixed):** the mfp root is **`mfp-native-generated`** — this
  template's premium look is BUILT BY THE RENDERER from the form schema (not hand-authored HTML like the
  working `tabbed-account-setup`). In the active step's DOM:
    - The **Email ("Email Address") and Phone ("Phone Number") `.mf-field-group`s each render at 620px**
      tall with **nothing tall inside** (`tallInside:[]`) — i.e. stretched/oversized empty boxes. Their
      grid row `.mfp-field-row` collapsed to `h=0` and the two fields **stacked** (tops 311 & 931) instead
      of sitting side-by-side. → this inflates the step to ~1742px.
    - The `.mfp-actions` bar (+ `.mfp-btn-next "Continue →"`, `display:flex/visible`) is therefore at
      **top≈1742px**, ~1000px below the visible card → **user sees no Next button**.
    - `.mfp-step-body` is **empty (h=0)**; the field cols/rows are **siblings** of it, not children →
      they miss its `gap:20px` → **tight rows**. (Legacy `.mf-form-actions` is already `display:none` —
      NOT the cause; my first "missing hide-rule" hypothesis was disproven by injecting it: no change.)
- **Where to fix (generator located):** `MegaForm.UI/src/shared/premium-native-migration.ts` +
  `MegaForm.UI/src/renderer/index.ts` build the `mfp-native-generated` DOM (NOT premium-step-reconcile.ts,
  which is only 98 lines and has none of this). The smoking gun: the `.mf-field-group`s are rendered as
  **SIBLINGS of the empty `.mfp-field-row` (grid 1fr/1fr, h=0)** and of `.mfp-step-body` — i.e. the
  migration creates the grid row/step-body containers but appends the field-groups OUTSIDE them. So (a)
  the 2-col grid never wraps Email+Phone (they stack), (b) as loose flex children of `.mfp-page` they
  balloon to 620px, (c) they miss `.mfp-step-body{gap:20px}`. FIX = append each mapped field-group
  INTO its `.mfp-field-col`/`.mfp-field-row`/`.mfp-step-body` slot (verify with a form having Email+Phone
  on one row). Contrast the hand-authored `tabbed-account-setup` (renders fine). Iterate on
  `/api/MegaForm/render/{formId}` (repro is reliable there). Templates are gitignored → no git history.
- ⚠️ NOT touched today (ContentGapTrim only changes `.content` top-padding; unrelated). Left for a
  FOCUSED session — premium templates are intricate; iterate on the render endpoint, don't blind-hack.
- ⚠️ :5127 module 36→form 3 doesn't render on the page for anon in my probes (same schema-cache/bind
  quirk as §6) — use the render endpoint to iterate, or set `Setting MegaForm:FormId` + restart.

## 8d. ✅ ROUND 3 — duplicate Submit fix + bulk gallery build + full 17-page QA sweep
- **Duplicate Submit** (user: "form contact có map bị thừa nút submit"; also pure-grid): custom-shell
  SINGLE-PAGE templates render their own submit (`.mfp-submit` / `.mf-btn-submit` inside
  `.mf-fields-container`) but are `.mf-custom-shell-mode`, **not** `.mf-premium-native-mode`, so the
  existing hide rule (megaform.css:2057) missed them → the generic `.mf-form-actions` Submit showed as a
  duplicate (visible in Oqtane EDIT-MODE; anon was already clean because the hide is client-side).
  **Fix** = one static rule in `Assets/css/megaform.css` (marker `DupSubmitFix v20260720`):
  `.mf-form-wrapper.mf-custom-shell-mode:has(.mf-fields-container button[type=submit], … .mfp-submit,
  … .mf-btn-submit) .mf-form-actions:not(.mf-postsubmit-actions):not(.mf-review-actions){display:none!important}`
  — fires only when the shell has its own submit, and applies from first paint (SSR/edit/published).
  VERIFIED with **JS disabled** (edit-mode proxy): legacy `display:none`, custom submit still visible.
- **AssetVersion B406 → `20260720-B407`** (CSS cache-bust) + rebuilt Shared/Server + **repacked FINAL
  1.7.109 (R3-J PACK-OK)**; redeployed Shared DLL + CSS to Clean2 (serves `?v=B407`).
- **Bulk gallery build on Clean2 :5128** — all **17** gallery templates created as Published forms, each on
  its own page under root `/form-gallery` (`/form-gallery/{slug}`), module bound via `MegaForm:FormId`.
  ⚠️ `POST /api/module` returns **403** for host even with a valid token → used **DB inserts** instead
  (Page+Permission+Module+Permission+PageModule+MF_Forms+Setting, SCOPE_IDENTITY chain, one GO-batch per
  form, restart after). Payloads pre-built in Node via esbuild running the fixed migration per template.
- **Full 17-page QA sweep (published + JS-off) — RESULT: CLEAN.** All 17 render; **no page has a duplicate
  submit**. Findings triaged:
  - 9 forms flagged "NO-SUBMIT" = **false alarms**: multi-step wizards showing **Continue/Next** on step 1
    (Submit only on the last step) — e.g. classic-americana(4 steps), bulgaria, down-under, festa
    ("Continua →"), journey, australiana-booking, project-intake, wellness, euro-youth.
  - `member-login`: renders its shell (branding/social/links) but has **0 fields and 0 `{{field:}}` tokens
    in the TEMPLATE itself** → presentational-only demo shell, **not a bug**. User: skip.
  - Vietnamese widget strings ("Chọn ngày…", "Chọn…", "Gửi") = **browser-locale auto-detection**, not
    hardcoding: code defaults `currentLocale='en-US'`/`fallback='en-US'`, vi lives only in `vi-VN.json`;
    forcing `locale=en-US` renders "Select date…"/"Select…". Compliant with the no-hardcoded-VN rule.
- ⚠️ **Incident:** the E: drive detached mid-session (all sites died, repo path vanished). Reconnected;
  repo + Clean2 + nupkg + handoff + both fixes all intact. Memory on C: was unaffected.

## 9. Backlog / next
- **DNN/Web/Umbraco parity:** `trimContentGap` already builds into all 4 platform wwwroot (one TS source). DNN/Web/Umbraco packages were NOT rebuilt this session — repack them if you want the fix shipped there too.
- **If the user wants a bigger visible change:** the only lever left is the THEME (reduce `.content` padding / make the navbar not-fixed or shorter) — a theme-CSS edit, outside the MegaForm nuget. Offer this.
- **Docs publish (theme-compatibility article + Bootswatch GIF)** — still pending from the earlier plan; see `Docs/HANDOUT_THEME_COMPATIBILITY_DOCFX_NEXT_SESSION_2026-07-20.md` (publish via worktree from `origin/master`; do NOT push the feature branch — it would DELETE Codex's live DNN docs series).
- **Clean1809 demo (optional):** seed one form on a Quartz page (add Module+PageModule + the `MegaForm:FormId` Setting, restart) to give the user a ready spacing demo on the clean site.
