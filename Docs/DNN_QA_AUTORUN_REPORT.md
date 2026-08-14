# DNN MegaForm — Full QA autorun REPORT

Human-readable findings, measurements, screenshot paths. Newest entries appended under each stage.
Companion to `Docs/DNN_QA_AUTORUN_PROGRESS.md` (stage cursor) and
`Docs/HANDOUT_DNN_FULL_QA_NEXT_SESSION_2026-07-21.md` (the plan).

**Target site (new, created by this QA):** `DNN10322_MegaQA` — host `dnn10322_megaqa.ai`, DB `DNN10322_MegaQA` on
`WINDOWS-11\SQLEXPRESS`, root `E:\DNN_SITES\DNN10322_MegaQA\Website`. DNN base 10.3.0, MegaForm 01.07.109.

---

## STAGE 0 — Research + handout ✓ (2026-07-21)
- 6-agent research workflow `wf_63232f63-ba0` + critique agent completed (7/7, 0 errors).
- Handout written: `Docs/HANDOUT_DNN_FULL_QA_NEXT_SESSION_2026-07-21.md`.
- Key corrections captured from the critique: Stage-C bulk-create = `POST /DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms`
  (requires `dev.lock` + host antiforgery + a MegaForm module on a page); 17 templates on a fresh install (16 seedable);
  Stage-D needs a purpose-built 2-pane skin; Stage-F must be measured on child pages (not `/Home`); Stage-G must add a
  Composite/Signature/File field via builder first (no gallery template has one).
- Base install media confirmed on disk: `E:\DNN\DNN_Platform_10.3.0_Install.zip` (52,633,477 bytes).

## STAGE A — Fresh DNN site + empty DB
Site `DNN10322_MegaQA` provisioning (2026-07-21):
- ✓ Extracted DNN 10.3.0 base → `E:\DNN_SITES\DNN10322_MegaQA\Website` (116s; Default.aspx/web.config/InstallWizard present).
- ✓ Created empty DB `DNN10322_MegaQA` on `WINDOWS-11\SQLEXPRESS` (DB_ID 121, 0 tables).
- ✓ IIS: app pool `DNN10322_MegaQA` (v4.0/Integrated/AppPoolIdentity/64-bit) + site + binding `*:80:dnn10322_megaqa.ai`.
- ✓ SQL login `IIS APPPOOL\DNN10322_MegaQA` = db_owner on the DB.
- ✓ hosts: `127.0.0.1 dnn10322_megaqa.ai`. ✓ icacls Modify grant on the site tree.
- ✓ web.config `SiteSqlServer` → `Data Source=WINDOWS-11\SQLEXPRESS;Initial Catalog=DNN10322_MegaQA;Integrated Security=True`
  (the other SiteSqlServer at L40 is inside a comment; install flags AutoUpgrade/UseInstallWizard/InstallMemberRole=true).
- ✓ First hit warmed → 200, redirected to `/Install/InstallWizard.aspx` (form fields confirmed: txtUsername/Password/
  Email/WebsiteName + templateList/languageList + continueLink).
- InstallWizard headless (host/dnnhost, "MegaForm QA", Default Website / en-US) via `_dnn_install.mjs`. First pass
  stalled at 18% (browser exited early on a hidden-but-present "View Website" element); fixed the completion check +
  made it resume-safe; re-run → InstallWizard.aspx redirected to /Default.aspx = complete.
- ✅ **GATE A PASSED (2026-07-21 ~17:42):** root HTTP 200 (final URI `/`, NOT InstallWizard); `Version`=10/3/0;
  superuser=`host`; PortalAlias `0:dnn10322_megaqa.ai`; 1 portal; 146 tables; 93 Packages; 15 DesktopModules; home
  page renders (title "Home", DNN form markers, no error); Login.aspx 200 with username field. 3 install-time
  `GENERAL_EXCEPTION`s = DNN's routine swallowed schema-install exceptions (empty Message, no request context) — benign.
- Login selectors (fresh default skin): `[id$="txtUsername"]` / `[id$="txtPassword"]` / `[id$="cmdLogin"]`.

## STAGE B — Install MegaForm 01.07.109
- ✓ Staged `MegaForm_01.07.109_Install.zip` (25,900,366 B) → `…\Website\Install\Module\`. megaFormPackages(before)=0.
- ✓ **Antiforgery handshake PROVEN headless** (`_dnn_stageB_install.mjs`): Playwright login host/dnnhost → token via
  `jQuery.ServicesFramework(-1).getAntiForgeryValue()` (len 81) → `POST /API/personaBar/Extensions/InstallAvailablePackage`
  `{PackageType:'Module',FileName:'MegaForm_01.07.109_Install.zip'}` from inside the browser context (cookies reused)
  → **200 `{"newPackageId":148,"success":true}`**, "Module registered successfully". ← reuse this pattern for Stage C.
- ✅ **GATE B PASSED:** Packages `MegaForm=1.7.109`; DesktopModules `MegaForm=01.07.109.00`; **17** template JSONs in
  `DesktopModules\MegaForm\Templates`; DLLs Core/DNN/Sdk present; `Views\FormView.ascx` present; 20 `usp_MF_` procs;
  **all 12 load-bearing MF_ tables present** (MF_Forms, MF_Submissions, MF_SubmissionFields + 6 typed MF_SubmissionValue*,
  MF_ModuleViewConfig, MF_Files, MF_SubmissionValues). 37 MF_ tables total = correct fresh-install count (MegaClean's 52
  accrued over migrations/ERP demo). App pool recycled.

## STAGE C — Bulk-create all 17 templates (DevBulkCreateForms) ✅
- Prereqs done: `dev.lock` at BOTH app-root + `Portals/0`; seed page **QASeed TabID=37** with a MegaForm module
  **ModuleID=384** (ContentPane) for `ActiveModule` context; host antiforgery token (len 81).
- `POST /DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms` (headers RequestVerificationToken + ModuleId=384
  + TabId=37, body `{}`) → **200 success=true, total=17, created=17, updated=0, failed=0**, FormIds **1–17**.
- ✅ **GATE C PASSED:** 17 MF_Forms, **17 Published**; every SchemaJson = `{"version":"1.0","fields":[…` envelope
  (verified via LEFT(SchemaJson,42) spot-check — the `0/17` LIKE count was a PowerShell quote-escaping artifact, not a
  real miss). Title = source filename. F7 member-login has `fields:[]` (0 data fields) → **16 seedable**. All forms
  bound to seed module 384 (Stage E rebinds each to its own child module).
- FormId→file map: 1 youth-application, 2 wellness-patient-intake, 3 vendor-application-fl, 4 tabbed-account-setup,
  5 project-intake-onboarding, 6 outback-station-stay-booking, 7 member-login(skip), 8 megaform-pure-grid-template,
  9 Journey, 10 festa-italiana, 11 event-registration-rsvp, 12 down-under, 13 Discovery-programme,
  14 contact-map-right-modern, 15 contact-map-left-minimal, 16 contact-map-left-corporate, 17 classic-registration.

## STAGE D — 2-pane template page (HTML left + MegaForm right) ✅
- Fresh DNN 10.3 default skin **IS Aperture** (`[G]Skins/Aperture/default.ascx`) — the research recipe applies verbatim.
  All partials present (`_registers/_includes/_header/_footer`). Panes BannerPane/ContentPane/FluidPane stacked. HTML
  module def=114 (`DNN_HTML`). HtmlText published `StateID=1` confirmed (Direct Publish workflow, matches existing rows).
- ✓ Wrote `Portals\_default\Skins\Aperture\two-column.ascx` (BannerPane + flex row[LeftPane|RightPane] + ContentPane +
  FluidPane). SkinSrc token = `[G]Skins/Aperture/two-column.ascx` (the `[G]` form the portal uses — resolves the
  critique's token question).
- ✓ Template page **TwoColTemplate TabID=38**: HTML module **385** in LeftPane (welcome/instructions, StateID=1) +
  MegaForm module **386** in RightPane bound to **FormId 1** (MF_ModuleViewConfig + MegaForm_FormId + ModuleMode=render);
  `UPDATE MF_Forms.ModuleId=386 WHERE FormId=1` to claim ownership (no ping-pong). TabPermission VIEW All Users(-1)+Admin.
- ✅ **GATE D PASSED** (anonymous, no admin dock): @1280px HTML content in LeftPane (l:0–628) + mf-form-wrapper in
  RightPane (l:652–1280), **sideBySide=true**; @390px correctly stacks (flex-wrap). Screenshot `TwoColTemplate_1280.png`
  visually clean — EuroYouth form (step bar 01–04 + fields + Continue) below the sticky teal Aperture header.
- **Top-spacing (Stage F, template page):** @1280 header-bottom=160, form step-bar sits just below; `.mfp-card` inner
  section top=256 → 96px, but the 96px is occupied by the step-indicator (form chrome), NOT empty space → healthy, NOT
  stuck-to-header, NOT excessive. headerPos=sticky. (@390 GAP metric N/A — form stacks below the HTML pane.)

## STAGE E — 3 roots × 16 child pages (fan-out) ✅
- Roots created: **Forms Group A=39, B=40, C=41** (VIEW All Users(-1)+Admins, EDIT Admins). Nav dropdowns visible.
- Cloned TwoColTemplate (tab 38) → **16 child pages (TabID 42–57)**, forms **2–17** round-robin (form 1 stays on the
  template page). Each child = COPY (new Modules rows) of HTML(LeftPane)+MegaForm(RightPane), rebound via
  ModuleSettings.MegaForm_FormId + MF_ModuleViewConfig + MegaForm_ModuleMode=render, `UPDATE MF_Forms.ModuleId`→child
  module (kills ping-pong), TabPermission VIEW All Users.
- ✅ **GATE E PASSED:** 16 children, each **html=1 / form=1**, **16 DISTINCT bound forms (2–17)**, 0 wrong counts;
  per-root A=6/B=5/C=5 (≤1 diff); **0 shared ModuleIDs** (all COPY, no references). Anonymous render confirmed on
  tabs 43/42/54/53 (200, distinct forms: vendor-application, wellness, contact-map, bulgaria-discovery).

## STAGE F — Anonymous top-spacing on child pages ✅
- **Finding:** with the raw 2-pane skin, child form cards were **flush to the sticky header (GAP_px=0** at 1280, card
  top=160=header bottom) — i.e. "dính sát header", the exact state the user wants avoided. Confirms the research: DNN's
  client guards (fixed-header-guard/content-gap-trim) are **inert on DNN** (gate on `.content`, absent here), so the top
  gap is skin-governed.
- **Fix (in-scope, self-contained):** added `margin-top:32px` to the flex row in the **QA-only** skin
  `Portals\_default\Skins\Aperture\two-column.ascx` (a NEW file created for this QA — NOT canonical MegaForm CSS/TS, NOT
  an existing site). Re-measured anonymously: **GAP_px=32** at 1280 on child pages (Vendor tab 43, Wellness tab 42),
  side-by-side preserved; @390 panes push down 32px too. Screenshot `child_VendorApp_gap_1280.png` shows a clean, clearly
  comfortable band below the header. **In the comfortable 8–40 band; NOT stuck, NOT hidden (never negative), NOT excessive.**
- ⭐ For a SITE-WIDE canonical fix (all DNN installs, any skin), extend `content-gap-trim.ts` to also match
  `.aperture-content-pane, .ContentPane` (today only `.content`) — this is a canonical-source change requiring build +
  user sign-off, so NOT done autonomously. The QA-skin gap above demonstrates the desired result.

## STAGE G — Seed 20 submissions/form (file + composite) ✅
- Seeder `_dnn_seed.mjs` (Node): per form → `GET Submit/Schema?formId=N` (schema is a JSON **string** — must `JSON.parse`),
  recurse Row/Section, generate 20 valid rows per the value-format rules, `POST Submit/Post` (AllowAnonymous). File
  fields → upload a valid `%PDF-` via `Upload/File` first, embed the metadata array.
- ✅ **GATE G PASSED:** **320 submissions** = all 16 seedable forms × 20 (0 failures, 0 forms off-count, form 7
  member-login skipped=0 fields). Typed storage populated (5360 `MF_SubmissionFields` rows). DataJson shapes verified
  (form 11): multi-value chips/checkbox = JSON arrays `["design","tech"]`/`["yes"]`; Select/Radio = option VALUES
  (`virtual`,`vegetarian`); Number/Rating/Date = strings; hidden = strings; phone = string.
- ✅ **File download E2E:** forms 3/5/13 uploaded a real PDF (physical file under
  `App_Data\MegaForm\PrivateUploads\form-<id>\field-<key>\`, DataJson = metadata array with `tempPath`). Download gate
  verified: **anonymous = HTTP 401**, **host = HTTP 200 + `Content-Disposition: attachment` + `application/pdf` + valid
  `%PDF-`**. (MF_Files=0 — expected for API-POST; download resolves from physical file + tempPath.)
- ✅ **Composite + Signature coverage:** all 17 gallery templates use `customHtml` authored shells (no true
  Composite/Signature/Address field ships in any — confirms the critique; the DONEE "Phone" fields render as plain
  single inputs, NOT multi-part composites). Injected a **Composite(name)** `qa_full_name`, **Composite(address)**
  `qa_address`, and **Signature** `qa_signature` into form 8's SchemaJson (`{type:'Composite',preset,widgetProps.preset}`
  / `{type:'Signature'}`), re-seeded 20 rows. Verified stored + typed: `qa_full_name`="Diego Santos" &
  `qa_address`="88 Oak Ave, Austin, TX 78701, USA" → `type=Composite, DataType=json`; `qa_signature`=PNG dataURL →
  `type=Signature, DataType=longtext`. Data is visible in the submissions grid readout (grid reads DataJson).
  ⚠️ CAVEAT: the injected fields **store** correctly but do NOT **render** on form 8's page because pure-grid uses a
  `customHtml` shell (only fields with an authored token slot draw). To also render composites, add a `{{field:key}}`
  token to the customHtml or use a non-custom form — not needed for the DATA ("số liệu") QA.

---

# ✅ FINAL SUMMARY — FULL DNN MEGAFORM QA COMPLETE (2026-07-21)

Site **`DNN10322_MegaQA`** (host `dnn10322_megaqa.ai`, DB `DNN10322_MegaQA` @ `WINDOWS-11\SQLEXPRESS`, DNN 10.3.0,
MegaForm 01.07.109). All stages A→G executed and **every gate verified with real queries / anonymous Playwright**:

| Stage | Result |
|---|---|
| A fresh DNN install | ✅ Version 10/3/0, host superuser, portal alias, home renders |
| B MegaForm 1.7.109 | ✅ package+module installed, 17 templates, all load-bearing MF_ tables; antiforgery handshake proven headless |
| C bulk-create | ✅ DevBulkCreateForms → 17 Published forms (FormId 1–17), correct schema envelope |
| D 2-pane template page | ✅ HTML left + MegaForm right, side-by-side anonymously |
| E 3 roots × 16 children | ✅ 16 child pages, 16 distinct forms, A=6/B=5/C=5, 0 shared modules |
| F anon top-spacing | ✅ was flush (GAP=0) → added 32px in the QA skin → comfortable 32px band, not stuck/hidden |
| G seed 20/form | ✅ 320 submissions, file download gate (401 anon / 200 host), composite+signature data typed correctly |

**Notable findings for the product team:**
1. **DNN top-spacing:** MegaForm forms sit **flush against a sticky header (GAP=0)** on DNN — the client guards
   (fixed-header-guard / content-gap-trim) are **inert on DNN** (they gate on `.content`, an Oqtane/Bootswatch class
   absent on DNN). A comfortable gap must come from skin/module CSS. ⭐ For a site-wide canonical fix, extend
   `content-gap-trim.ts` to also match `.aperture-content-pane, .ContentPane` (needs build + sign-off — NOT done autonomously).
2. **Bulk-create titles = filenames** (DevBulkCreateForms sets Title = source .json filename). Fine for QA; rename for prod.
3. **No gallery template ships a true Composite/Signature/Address/DateRange field**; the "Phone" fields are plain inputs.
   Add them via builder (token slot in customHtml) if those widgets need render-QA.
4. **MF_Files stays empty on API-POST seeding**; the My-Inbox/SDK file chip needs MF_Files rows, but downloads work
   without them (physical file + DataJson tempPath).

**Constraints honored:** only NEW resources created (new site/DB/pages/forms); no existing DNN/Oqtane site touched;
nothing committed or pushed.

---

# ▶ FOLLOW-UP (user request 2026-07-21): form padding on all 4 sides

**Problem (user screenshots):** on the QA pages the premium/custom-shell form cards butt **flush against their container
edges** — right edge, and the card bottom against the footer — with no breathing room and "no setting to apply it".

**Root cause:** `.mf-form-wrapper` has a base `padding: 24px 16px` (Assets/css/megaform.css:171), but premium/custom-shell/
wizard forms get that padding **stripped to 0** — via the `:has(.mf-steps)` rule (line ~182), the
`[data-mf-has-custom-html]`/`[class*="mf-theme-"]` rule (line ~690), AND an **inline** `style="padding:0;margin:0;background:none"`
the renderer stamps on the wrapper to remove the outer frame. The strip assumes the host container supplies the spacing;
in a bare/no-padding container (a skin pane, and generally) the card touches every edge.

**Fix (canonical `Assets/css/megaform.css`, marker `[SpacingFix v20260721]`):** restore a **transparent** `24px 16px`
gutter on those stripped wrappers so the card always has top/right/bottom/left air, with **NO** visible frame (bg stays
transparent, margin stays 0 → no "card thừa" regression):
- `:has(.mf-steps)` rule → `padding: 24px 16px !important` (was `0 !important`).
- `[data-mf-has-custom-html]` / `[class*="mf-theme-"]:not(default)` / `.mf-theme-pure-grid-premium` rule →
  `padding: 24px 16px !important` (was `0`). **`!important` is required** because the renderer's INLINE `padding:0`
  beats a normal stylesheet rule; a stylesheet `!important` overrides the inline padding while leaving the inline
  `background:none`/`margin:0` intact.
- Standard (non-shell, non-theme) forms use the unchanged base rule → **no regression**.

**Verified (anonymous, DNN QA site, fresh context):** wrapper `padding: 24px 16px`, card right/left gap = 16px, clear
top gap below the sticky header, clear bottom gap above the footer. Screens: `fix2_wellness.png` (multi-step),
`fix2_outback.png` (image-left premium), `fix2_contact.png` (contact+map), `fix2_puregrid.png`, `fix2_wellness_mobile.png`
(390px — 16px gutter, not wasteful). Deployed to the running DNN site + synced canonical → 3 platform wwwroot copies
(Oqtane/Umbraco/Web). ⚠️ A repack (.nupkg / DNN package) is still needed to SHIP the fix; the running QA site is already
patched. (The repo `DesktopModules/MegaForm/Assets/css/megaform.css` is a stale older copy, not the build source — left untouched.)

---

# ▶ FOLLOW-UP 2 (2026-07-21): module Settings panel had no effect + visual QA + wizard form

**Visual QA sweep** (`_dnn_sweep.mjs`, anonymous full-page over all 17 form pages): all render, **0 empty, 0 JS errors**,
right-gap 16px everywhere (padding fix holds). Screens `sweep_t*.png`.

**Bug: "Theme & Layout" settings dead.** The user saved `theme=sunset` on module 388 (form 2 wellness) — form stayed
green. **Root cause:** `ThemePresetInlineCssService.Build` resolved theme colors ONLY from `settings.themeSelector.presets[key]`
and **ignored `themeCssOverrides`** entirely. Premium forms have no matching preset → `Build` returned empty → the saved
override (a `{--mf-primary:#f97316,--mf-preset-primary:#f97316,…}` map) was **never emitted**. (The module save + overlay
worked; only the render dropped it.)

**Fix — `MegaForm.Core/Services/ThemePresetInlineCssService.cs` (`[ModuleStyleOverride v20260721]`, shared Core → all
platforms):** refactored `Build` to `BuildPresetBlock` (unchanged preset logic) **plus** a new `BuildOverrideBlock` that
emits `settings.themeCssOverrides` + `settings.cssOverrides` as a scoped var block (names validated `--`+[a-z0-9-], values
sanitized), appended LAST so a per-module override wins. This works because premium `customCss` reads theme colours through
a var() fallback chain (e.g. `--mf-primary: var(--mf-page-primary, var(--mf-preset-primary, #0f9d76))`) — applying
`--mf-preset-primary:#f97316` on the wrapper (an ancestor) recolours the card. Built `MegaForm.Core.dll` (net472) →
deployed to DNN site bin → recycled.

**Verified:** wellness form now renders **sunset/orange** (step circles, connectors, "STEP 1 OF 4", Continue button all
orange) — screenshot `settingsfix_wellness.png`. `overrideEmitted=true`, wrapper `--mf-preset-primary=#f97316`, card
`--mf-primary=#f97316`.

**Layout settings (max-width / field-spacing):** saved as `--mf-form-max-width` / `--mf-field-gap` (settings-popup.ts:1112-1113),
now emitted by the same fix. **Apply on STANDARD forms; DO NOT apply on premium** — premium `customCss` forces
`.mf-form-inner{max-width:none}` and owns its spacing (by design; forcing it would break pixel-designed layouts like the
image-left Outback). Hide-header saves separately to the form. This is a design boundary, not a bug — communicated to the user.

**Task 3 — standard multi-step wizard** (`QA Multi-Step Wizard`, **FormId 18, TabID 58 `/QA-Wizard`, Module 419**): built a
clean 4-step wizard (Sections w/ pageBreak, no custom shell) via `usp_MF_Form_Upsert` + page/module. QA: renders as a native
wizard (4-step progress bar, "Tiếp theo" nav, 0 JS errors), **`innerMaxWidth:960px` proves max-width works on standard forms**.
Demonstrated a module override (forest theme + 640px + 32px gap) → **all three applied** (green step/button, card 960→640px) —
screenshot `wizard_styled.png` — then reset to default. Seeded **10 submissions** (DataJson correct: checkbox arrays, select
values). Standard-wizard result screenshot `wizard_qa.png`.

**Ship note:** `ThemePresetInlineCssService.cs` is shared Core source — the DNN site is patched (net472 dll deployed); a
rebuild+repack ships it to the packages and to Oqtane/Web/Umbraco (their `MegaForm.Core.dll` rebuilt on their targets). Not committed.

---

# ▶ FOLLOW-UP 3 (2026-07-21): QA the rest of the Theme & Layout panel + fix "Source: From page"

Visual-QA of every remaining Theme&Layout control, on standard (wizard form 18) + premium forms:
| Setting | saves as | Standard form | Premium form |
|---|---|---|---|
| Theme preset | `theme`+`themeCssOverrides` | ✅ | ✅ (via var() chains) |
| **Base text size** | `--mf-font-size-base` | ✅ (18px verified) | partial (shell may set own) |
| **Line height** | `--mf-line-height` | ✅ (2.0 verified) | partial |
| **Corner radius** (preset+custom) | `--mf-form-radius` | ✅ (16px on card verified) | premium card owns its radius |
| Max width | `--mf-form-max-width` | ✅ (640px verified) | ❌ by design (customCss forces none) |
| Field spacing | `--mf-field-gap` | ✅ | ❌ by design |
| Hide header | form flag | ✅ | ✅ |
| **Typography source: From page** | `inheritPageTypography` (form) | ✅ *(after fix)* | ✅ |
| **Color source: From page** | `inheritPageColors` (form) | ✅ *(after fix)* | ✅ |
All the var-based ones now work thanks to the FOLLOW-UP-2 `themeCssOverrides` fix (they were dead before it — likely what
the user's screenshots pre-dated).

**Bug fixed: "Tích hợp trang" (Typography/Color source: From page) was dead on DNN + Web.** The Settings popup saves these
via `saveFormInheritFlags → POST Form/SaveTheme {InheritPageTypography, InheritPageColors}`. The **DNN + Web `SaveTheme`
endpoints never READ those two fields** (only theme/customCss/cssOverrides/hideHeader) → returned `saved:true` but persisted
nothing → the render (`ThemeFirstPaintCssService` reads `settings.inheritPageTypography/inheritPageColors`) always saw the
default. **Oqtane's twin already handled them** — DNN + Web were the broken twins.
**Fix** (`[InheritSourceDnn v20260721]`): `MegaForm.DNN/WebApi/MegaFormApiController.cs` (SaveTheme) + `MegaForm.Web/Controllers/
MegaFormController.cs` (SaveTheme) — read `InheritPageTypography`/`InheritPageColors` (bool, partial-patch) and write to
`SchemaJson.settings` + `SettingsJson`, mirroring Oqtane lines 709/742/763 exactly. Auth unchanged: DNN `SaveTheme` is in
`FormController` (class `[DnnAuthorize StaticRoles=Administrators]`). Booleans only — no CSS/HTML/SQL surface.
**Built + deployed `MegaForm.DNN.dll` (net472) → verified E2E:** `Form/SaveTheme{InheritPageTypography:true}` now persists to
SettingsJson AND the render applies `mf-inherit-type` + **page font (Ubuntu) + page primary (#2563eb)**. Web recompiled clean
(not deployed — no Web QA site). DNN caching means a recycle/clear-cache is needed after saving to see the change.

**Wizard demonstration** (task from follow-up 2): all var settings verified applying on standard wizard (form 18) — text 18px,
line 2.0, radius 16px, max-width 640px, forest theme — screenshots `typo_wizard.png`, `wizard_styled.png`. Reset to default.

**Source changes (uncommitted):** `MegaForm.Core/Services/ThemePresetInlineCssService.cs`, `Assets/css/megaform.css`,
`MegaForm.DNN/WebApi/MegaFormApiController.cs`, `MegaForm.Web/Controllers/MegaFormController.cs`. DNN site patched (Core+DNN
dlls deployed); repack/rebuild ships to packages + Oqtane/Web/Umbraco.

---

# ▶ FOLLOW-UP 4 (2026-07-21): 3 more page groups for the ChipCards-V3 template set

Source folder: `…\MEGAFORM TEMPLATES\DefaultTemplates - Deployed\Premium-Fixed-ChipCards-Compact-V3-20260619` (40 premium
chip-card template JSONs). Copied all 40 into the DNN deployed `Templates\` folder (17→57), recycled, ran
`DevBulkCreateForms` → **57 total, 40 created (FormId 19–58), 17 updated, 0 failed**. Then fanned out: **3 new roots
"Premium Templates A/B/C" (TabID 59/60/61) + 40 child pages** (round-robin A=14/B=13/C=13), each cloning the two-column
template (HTML LeftPane + MegaForm RightPane), rebound to a distinct new form, `MF_Forms.ModuleId` updated per child.
**GATE: 40 distinct forms, every child 1 HTML+1 form, 0 shared modules.** Anonymous spot-check (Worldcup 2026, Wedding
Scrapbook, USA Training Academy, Sweet Holiday Rose Garden): all render, **0 JS errors**, padding fix holds (screenshot
`prem2_tab62.png`). Site now: **58 forms, 6 root groups, 40 new child pages**. Form titles = source filenames (DevBulkCreate
default). Nothing seeded (pages-only, per request).
