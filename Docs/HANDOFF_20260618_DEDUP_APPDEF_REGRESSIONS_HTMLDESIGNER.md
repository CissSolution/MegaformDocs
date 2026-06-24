# HANDOFF — 2026-06-17→18  Dedup CTA · Oqtane AppDefinition 404 · 3 dashboard regressions · HTML Designer invisible-modal + banner button

**Live site:** `Oqtane.MSSQL3` @ http://localhost:5070 (host / `abc@ABC1024`). Deploy root `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\`; module DLLs + `MegaForm.Core.dll` at the **ROOT**; JS at `wwwroot\Modules\MegaForm\js\` (+`js\bundles\`), CSS at `wwwroot\Modules\MegaForm\css\`. Runtime **net10.0**, RenderMode **Interactive / Runtime Server** (Blazor Server — module DLL loads server-side).
**Cache version this session:** `OqtaneCoreAssetVersion` 20260617-B180 → **B181 → B182 → B183 → 20260618-B184** (Index.razor); `BUILDER_BUNDLE_VERSION` 20260617-B180 → **20260618-B183 → B184** (loader/index.ts).
**Status: ALL FIVE tasks DONE + LIVE + Visual-QA PASS.** Server restarted on the correct PID each time. Backups at `%TEMP%\mf_backup_20260617_B181`, `_B182`, `mf_backup_20260618_B183`, `_B184`.

---

## TL;DR — what shipped (4 user requests across the session)

1. **(B181) Duplicate CTA buttons removed.** "✨ Create with AI" + "+ New Form" appeared TWICE on Form Management — page top-header AND the "Apps & Forms" card toolbar. Kept the **top-header** pair (user choice); removed the card pair (card now = search + Bulk Delete only).
2. **(B181) Oqtane "App starter" / Custom Apps 404 fixed.** Business Starters → Custom Apps hit `Phase2/AppDefinitionList` → **404**. Root cause: the AppDefinition CRUD endpoints existed **only on the DNN controller**, never ported to Oqtane. Ported 5 endpoints → now **200**.
3. **(B182) Three dashboard regressions** — Oqtane edit-mode module ▼ menu hidden behind MegaForm; submissions sidebar still showed the old 7-settings list; My Inbox had no exit link.
4. **(B183) Builder "Custom HTML editor" button "doesn't work" + add a banner trigger.** Real root cause: the button DID open the HTML Token Designer modal, but the modal was **INVISIBLE** (its CSS was scoped to the Composite designer + injected lazily). Fixed + added an "Edit HTML" button on the canvas "Custom HTML Active" banner.
5. **(B184) HTML Token Designer image tab: Gallery 404, Upload 400, URL textbox squeezed.** Ported `Upload/Image`+`Upload/List` endpoints DNN→Oqtane (same gap as AppDefinition) + restored the lost `.mf-token-image-*`/`.mf-token-gallery-*` CSS (another April-revert loss; B183 only restored the modal shell).

---

## TASK 1+2 (B181) — dedup CTA + Oqtane AppDefinition endpoints

**Files changed**
- `MegaForm.UI/src/dashboard/index.ts` — `buildAppGroupedFormsCard` (~3792): dropped the `aib2 = makeAiCreateBtn()` + `nb` (New Form) locals → `mk(hdActions, searchWrap, bulkBtn)`. (Top-header pair in `buildHeader` ~2497 KEPT. `buildRecentFormsCard` ~4070 is DEAD code — only `buildAppGroupedFormsCard` renders, called ~3525.)
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` — after `DeleteViewConfig` (~2435) added `[HttpGet("Phase2/AppDefinitionList")]`, `AppDefinitionGet`, `[HttpPost]AppDefinitionSave`, `AppDefinitionDelete`, `AppDefinitionAssignForm`. Same response shapes as the DNN `[AppBuilderCRUD]` block (`MegaForm.DNN/WebApi/MegaFormApiController.cs` ~2517-2700) so the shared JS works as-is (List → `{items:[...]}`). Used existing helpers: `CanUseAdminPopup()` gate, `ResolvePortalId(0)` (formId 0 → `AuthEntityId(Site)`/`X-OQTANE-SITEID` header), `CreateAppDefinitionService()`, `_phase2Repo.GetAppDefinition`, `_formRepo.SaveForm`, `GetCurrentUserContext().UserId`, `JsonOk`.

**Probe trick:** unauth `curl` returns **403** if a `[Authorize]` route exists, **404** if missing → fast way to tell "route missing" from "needs auth".
**Deploy:** built `megaform-dashboard.js` (npm) + Server DLL + Core DLL (matched pair) + Client DLL (B181 bump). QA `tmp-qa/qa-dedup-and-appdef-20260617.cjs` → PASS ✓✓ (header createAi/newForm=1 each, card=0; AppDefinitionList=200).

---

## TASK 3 (B182) — three dashboard regressions

**3a. Oqtane edit-mode module action menu "missing".** The native ▼ menu (Manage Settings/Unpublish/Delete/Move) is `.app-moduleactions` — it IS in the DOM (display:block ~36px) but has **no z-index**, so a MegaForm surface/card/dock in the same pane visually COVERS it. (NOT the `.app-moduletitle{display:none}` clean-look style at Index.razor:312 — that hides the title TEXT, a different element, and is panel-mode-only.) **Fix:** a top-level `@if (IsEditMode){ <style>… }` injected BEFORE the `@if (_panelMode != None)` block in `MegaForm.Oqtane.Client/Index.razor` — `.app-moduleactions{ position:relative; z-index:1200 }` + a bordered-button affordance on `.dropdown-toggle` + `.dropdown-menu{ z-index:1300 }`. Edit-mode-only → zero effect on the public form. Proven: menu opens with all actions (`tmp-qa/reg-03b-editmenu-closeup.png`).

**3b. Submissions sidebar inconsistent.** `MegaForm.UI/src/submissions/SubmissionsShell.ts buildSidebar` still rendered the OLD nav (Main had "Dashboard"; Config had 7 separate Database/Payment/Email/Upload/Captcha/AI/Google-Sheets items). Rewrote to match the dashboard's CONSOLIDATED nav: Main form-first (Form Builder / Submissions / My Inbox / Form Management), Config = Languages + a single **Settings** → `URLS.dashboard() + '#settings'` (dashboard maps `#settings`→`openSettingsPane('database')` at index.ts ~4469). Canonical dashboard nav: `src/dashboard/index.ts` ~2434-2448.

**3c. My Inbox had no exit link ("vào inbox là kẹt").** `?mfpanel=myinbox` renders a standalone 3-pane board (`src/my-inbox/view.ts renderBoard`) with its own nav and no way back. **Fix:** "← Back to Dashboard" link at the top of `buildLeftNav` (+ `.mf-mi3-nav-back` CSS in `src/styles/megaform-my-inbox-ts.css` + `arrowLeft` icon in `src/my-inbox/ui.ts`). **URL gotcha:** `getPlatformRoute('dashboard')` returns the bare page path ("/") here (no `dashboardUrl` in the inbox host config) → would dump the admin on the public form. Build it from the current URL instead: `new URL(location.href); set mfpanel=dashboard` → `/?mfpanel=dashboard` (panels are same-page query-param switches). Hard-navigates (`location.assign`, `data-enhance-nav=false`) to dodge Blazor-Server enhanced-nav.

**⚠️ CRITICAL BUILD FIX — restored a dropped vite entry.** `megaform-my-inbox.js` had **no vite entry** (the April-21 vite.config revert dropped it, same class as ai-form-assistant restored in B172) → edits to `src/my-inbox/*` never rebuilt. Restored in `MegaForm.UI/vite.config.ts`: `entries['my-inbox']`, `CSS_MAP['my-inbox']=['megaform-my-inbox-ts.css']`, + `package.json` `build:my-inbox`. **TODO: audit other Index.razor-referenced bundles for the same silent drop.**

**Deploy:** built submissions + my-inbox bundles + Client DLL (B182). QA `tmp-qa/qa-3regressions-20260617.cjs` → PASS ✓✓✓.

---

## TASK 4 (B183) — HTML Designer "invisible modal" + banner Edit-HTML button

**Real root cause (not a click bug).** In the builder (`?mfpanel=builder&formId=12`), the "Custom HTML editor" button's handler worked and `window.MFTokenDesigner.open()` created the modal in the DOM, but it rendered **INVISIBLE**: computed `position:static`, transparent bg, in-flow. The `.mf-token-designer-*` shell + inner CSS lived **ONLY scoped to `#mf-composite-designer-modal`** and was **injected LAZILY** (only when the Composite designer first opened). The HTML Token Designer modal (`#mf-token-designer-modal`, mounted on `document.body` with `data-mf-overlay="1"`) matched none of those rules → unstyled → opened-but-invisible → user reads it as "button does nothing". The `.mf-token-designer-*` styles were ABSENT from `src/styles/*` (another April-revert-class loss).

**Fixes**
- **`src/styles/megaform-builder-ts.css`** (the real fix) — added GLOBAL, EAGER `.mf-token-designer-*` modal CSS (loaded by the loader on every builder session). Backdrop critical layout uses `!important` (position:fixed/inset/z-index/display/background) to beat any builder-shell position:fixed neutraliser; the SHELL + inner rules are **NON-important** so sibling designer popups (Composite 880px via `.mf-composite-designer-shell`, Slider, ImageChoice, Video, Map) keep their own higher-specificity overrides → no regression. Also added `.mf-chb-edit`/`.mf-chb-label` banner-button styles.
- **`src/builder/canvas.ts`** — `.mf-custom-html-banner` now renders `.mf-chb-label` (left) + `<button class="mf-chb-edit" data-mf-open-html-designer>Edit HTML</button>` (right). Banner BACKGROUND click still opens Preview; the button opens the Designer.
- **`src/builder/properties.ts`** — replaced the id-bound handler with a SINGLE document-level **capture-phase delegated** listener matching `#mf-open-token-designer, [data-mf-open-html-designer]` → `openHtmlDesigner()` (preventDefault+stopPropagation so the banner preview-click can't also fire). `openHtmlDesigner()` lazily resolves `MFTokenDesigner`, is idempotent (no-op if a `.mf-token-designer-backdrop` is already open), falls back to expanding the Design-Studio "Custom HTML" accordion + focusing `#mf-custom-html-editor`. Delegation survives the accordion MOVE/re-render + dup ids.
- **`src/builder/token-designer.ts`** — the IIFE `if (!B) return;` (B = `window.MegaFormBuilder`) left `window.MFTokenDesigner` UNREGISTERED on a loader-order race ("Token Designer not loaded"). Now `(function init(){…})` defers via `setTimeout(init,50)` (≤200 tries) until MegaFormBuilder exists, then registers. **This file is UTF-16** — use PowerShell `Select-String` (ripgrep/Grep treats it as binary).

**Deploy:** built builder + loader bundles (npm); CSS-only edits propagated by plain copy `src/styles → Assets/css → live wwwroot/css` (sync IS a plain copy — no JS rebuild needed for CSS); Client DLL (B183). QA `tmp-qa/qa-htmldesigner-20260618.cjs` → PASS ✓✓ (both triggers open a now-VISIBLE modal); `probe-modal-visible-20260618.cjs` confirms backdrop fixed/full-viewport, shell white 760px (`tmp-qa/probe-modal-open.png`).

---

## TASK 5 (B184) — HTML Token Designer image tab: Gallery 404 · Upload 400 · squeezed URL textbox

**Bugs 1+2 (endpoints).** The image-token **Upload** button (`POST api/MegaForm/Upload/Image`) returned **400** and **Gallery** (`GET api/MegaForm/Upload/List`) returned **404** on Oqtane. Root cause = same gap as AppDefinition: these live ONLY in the DNN `UploadController` (`MegaForm.DNN/WebApi/MegaFormApiController.cs` ~3036); Oqtane only had `Upload/File` (private submission files). FIX: ported both into `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (after `Upload/File` ~1322): `[HttpPost("Upload/Image")]` + `[HttpGet("Upload/List")]`, `[Authorize]` + `CanUseAdminPopup()`. Images are PUBLIC → stored at `wwwroot/Modules/MegaForm/Images/{yyyy-MM}/`, served at `/Modules/MegaForm/Images/...` (mirrors `PdfForm/UploadTemplate`). Response uses **`url`** lowercase (token-designer.ts reads `j.url`); FormData field name is `file`; fetch is `credentials:'same-origin'` (controller `[IgnoreAntiforgeryToken]`). Validation reuses Core `FileUploadSecurityService.ValidateContentByExtension` + 5 MB cap + image-ext whitelist. **C# TRAP: `FileInfo` is ambiguous (`MegaForm.Core.Models.FileInfo` vs `System.IO.FileInfo`) — fully-qualify `System.IO.FileInfo`.**

**Bug 3 (squeezed textbox).** The `.mf-token-image-*` (image-row grid/preview/controls/url/buttons) + `.mf-token-gallery-*` (gallery overlay) CSS was **entirely missing** from `src/styles/megaform-builder-ts.css` (another April-revert loss; B183 only restored the `.mf-token-designer-*` modal SHELL). FIX: recovered verbatim from the pre-revert artifact `MegaForm.Umbraco/bin/Debug/net8.0/wwwroot/css/megaform-builder.css` (~1100-1134) → added after the B183 `.mf-token-designer-empty` rule. Added `width:100%;box-sizing:border-box` to `.mf-token-image-url`/`.mf-slide-img-url`; bumped `.mf-token-gallery-backdrop` z-index 100000→**100030** (above the B183 modal's 100020). NON-`!important`.

**Deploy (B184):** bumped BOTH cache tiers (`BUILDER_BUNDLE_VERSION` + `OqtaneCoreAssetVersion`) since the builder CSS is stamped with the former and the loader with the latter; `build:builder`(syncs CSS)+`build:loader`; rebuilt Server+Core+Client. QA `tmp-qa/qa-imgupload-gallery-20260618.cjs` → PASS ✓✓✓ (URL input 592px; Gallery overlay + `Upload/List`=200; real PNG upload `Upload/Image`=200 → served 200). Screenshots `imgupload-01-image-tab.png`, `imgupload-02-gallery.png`.

## TASK 6 — VERIFY another AI (GPT)'s "native rich choice controls" + add KB

**User ask:** verify GPT's claim that Radio/Checkbox now render as rich cards/chips (title+description+price-badge) Admin-configurably WITHOUT custom HTML — "I haven't seen it in the site." Then standardize the form JSONs + add KB for AI.

**VERDICT: GPT's backend is REAL + WORKING (proven).** `optionDisplay: cards|chips` + per-option `description`/`meta`/`badge`/`icon`/`richHtml` are honored by the ACTIVE renderer `src/renderer/inputs.ts` (NOT the dead `megaform-renderer.ts`), styled by `Assets/css/megaform.css` (~1274-1472), backed by `MegaForm.Core.dll` (live DLL has `OptionDisplay`/`AllowOptionHtml`/`RichHtml`), and exposed in the Builder Options panel (`#mf-prop-option-display`/`-richhtml`/`-columns`). PROOF: `tmp-qa/qa-richoptions-css-20260618.cjs` + `native-template-festa.png` render the exact festa cards/chips. **CSS TRAP: card border/padding live on `.mf-option-ui` (inner span), NOT `.mf-option-item`** — measuring the label's border falsely reports FAIL.

**Why the user couldn't see it:** the premium templates (`festa-italiana-registration.json`, `euro-youth-application.json`) **HAND-WRITE** the option `<input>`s inside `customHtml` (+ a wizard script) → the native render is bypassed. GPT added `optionDisplay` to euro-youth's FIELD defs but left the hand-written HTML, so it never shows.

**Delivered (non-breaking — did NOT mutate the bespoke live templates blind):**
1. **Clean native reference template** `MEGAFORM TEMPLATES/DefaultTemplates - Deployed/Premium/festa-italiana-native.json` — full form using ONLY native fields (cards `experience` + chips `dietary` + rich metadata) + a tiny `customCss` festa skin, NO customHtml/script. Render-verified festa-branded.
2. **KB recipe** `Resources/PromptRecipes/build-native-rich-choices.md` → deployed to DNN + Oqtane wwwroot + dist + **LIVE** MSSQL3 wwwroot.
3. **KB DB row** `build-native-rich-choices` seeded into `MF_AI_Knowledge` (so MfAiChat surfaces it). Migration `01060033_SeedNativeRichChoicesRecipe.cs` created. **⚠️ INFRA: live EF migrations are stuck at `MegaForm.01.06.00.28`** (`__EFMigrationsHistory`; NO prompt_recipe rows existed → .29-.33 never applied) — so I seeded the row via a direct idempotent `INSERT … WHERE NOT EXISTS` (sqlcmd, needs **`SET QUOTED_IDENTIFIER ON`** for the filtered index). The migration backlog is a pre-existing issue worth fixing (live DB missing 5 migrations' seed data).

**Recommended next (needs user present to view-verify):** in-place migrate the bespoke templates — replace `<div class='fi-pass-list'>…</div>`→`{{field:pass}}` + `<div class='fi-chip-list'>…</div>`→`{{field:dietary}}`, set `optionDisplay`, move price→`option.badge`, add `description`; keep the wizard/hero; drop the hand-written label rows to avoid DOUBLE labels.

## Build + deploy recipe (this session, repeatable)
- **JS bundles:** `cd MegaForm.UI && npm run build:{dashboard|submissions|my-inbox|builder|loader}` (or `node scripts/build-entry.cjs <entry>` for entries without an npm script). Output to `Assets/js/` (+`Assets/js/bundles/` for builder); the vite `syncPlatforms` plugin copies to the source-project wwwroot + Assets, **NOT to the live host**.
- **Server/Client DLL:** `dotnet build MegaForm.Oqtane.{Server|Client}\…csproj -c Debug -f net10.0`. Output `bin/Debug/net10.0/`. Rebuild Core+Server as a **matched pair** when Server changes (deploy both).
- **Cache bust:** dashboard/submissions/my-inbox bundles + CSS are stamped `?v=OqtaneCoreAssetVersion` (Index.razor) → bump that const + rebuild Client DLL. The **builder** bundle + CSS are stamped `?v=BUILDER_BUNDLE_VERSION` (loader/index.ts) and the **loader** itself is `?v=OqtaneCoreAssetVersion` → to bust the builder for warm browsers you MUST bump **BOTH** + rebuild loader + Client.
- **LIVE deploy (CAREFUL):** backup to `%TEMP%\mf_backup_*` first → resolve the MSSQL3 PID by CommandLine path (`Get-CimInstance Win32_Process … CommandLine -like '*Oqtane.MSSQL3*'`) → `Stop-Process -Force` + `Wait-Process` → copy DLLs to ROOT + js/css to wwwroot → `Start-Process Oqtane.Server.exe -WorkingDirectory <MSSQL3>` (binds :5070 in ~6-14s; the process can be slow to exit — if a stop "still alive" check trips, re-check, it usually exited). **Restart ONLY the MSSQL3 PID.** JS/CSS-only swaps need **no restart** (static files served from disk).
- **NEVER `cp -r Assets/* → live`** (reverts runtime) — copy only the specific changed files.

## QA harness gotchas (Oqtane :5070, reusable — all in `tmp-qa/`)
- **MUST navigate via `http://localhost:5070`** — `127.0.0.1:5070` returns "No Matching Alias Exists For Host Name" (alias registered as localhost).
- Login: fields are `#username` + `#password` (lowercase), button text "Login".
- Blazor-Server SignalR means `networkidle`/`domcontentloaded` can hang → use `waitUntil:'commit'` + poll the live DOM / `waitForSelector`.
- `playwright` (full) is available via `require('playwright')` from repo root.
- Pre-existing unrelated console 404s on the page: `CISS.SideMenu/DnnSkins/AcmeSkin/...` skin assets.

## Builder-specific notes
- The Design Studio (first right-tab, id `field`, label "Design") is an accordion that **MOVES** `#mf-tab-html` body (incl. `#mf-open-token-designer`) into `[data-mf-acc-body="html"]` when the "Custom HTML" item (`[data-mf-design-toggle="html"]`) is expanded — same element, binding preserved.
- Sibling designer popups all reuse `.mf-token-designer-*` classes; each self-injects its OWN scoped CSS (Composite/Slider/ImageChoice/Video/Map). Only the bare HTML Token Designer relied on the now-restored global CSS.

## Memories written this session
`project_20260617_dedup_cta_and_oqtane_appdef`, `project_20260617_three_regressions_editmenu_sidebar_inbox`, `project_20260618_html_designer_invisible_and_banner_btn`, `project_20260618_image_upload_gallery_textbox` (+ MEMORY.md pointers).

## ⬜ Follow-ups for the next session
- Audit other Index.razor-referenced bundles for silently-dropped vite entries (like my-inbox was).
- Consider de-duplicating the lazily-injected `.mf-token-designer-*` CSS in the sibling designers now that the global eager copy exists (low priority — harmless overlap).
- The builder bundle is 5 MB (single chunk). Code-splitting is a known TODO (vite warns).
