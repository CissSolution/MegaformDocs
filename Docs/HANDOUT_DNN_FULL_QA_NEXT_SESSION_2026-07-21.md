# HANDOUT — Full MegaForm QA on a FRESH DNN site (next session, 2026-07-21)

> **Goal (user request, verbatim intent):** cài đặt mới DNN + data SQL → bulk-create tất cả form template có sẵn
> trong package → tạo 1 trang DNN mẫu nhiều column-pane (HTML pane + MegaForm pane bên phải) → copy trang mẫu ra
> nhiều trang dưới **3 root DNN page**, mỗi trang 1 form template → kiểm tra **logout state** các form KHÔNG dính sát
> header (spacing-top hợp lý) → mỗi form seed **20 submission thật** để test số liệu (file download, composite fields).
>
> This handout is the synthesis of a 6-agent research workflow (`wf_63232f63-ba0`) + an adversarial critique agent,
> all run against the existing `DNN10322_MegaClean` site. **Every SQL column, endpoint, and file path below was
> verified live** (dry-run transactions rolled back). The critique corrected 3 wrong paths the individual agents
> proposed — those corrections are folded in and flagged **[CRITIQUE]**.
>
> **Live progress / durable state:** `Docs/DNN_QA_AUTORUN_PROGRESS.md` (stage cursor) + `Docs/DNN_QA_AUTORUN_REPORT.md`
> (measurements, screenshots). Resume by reading those first.

---

## 0. Golden rules for this QA (read first)

1. **Only CREATE new resources.** Never destroy/modify existing DNN sites (`DNN10322_MegaClean`, `MegaF`, `MegaTest`,
   `MegaXIn`). Use a NEW site + NEW DB. Never commit/push.
2. **DNN caches aggressively.** Every raw-SQL insert into `Tabs/Modules/TabModules/ModuleSettings/MF_ModuleViewConfig`
   is **invisible** until app-pool recycle or `web.config` touch. Recycle after **every** SQL stage (B-post, D, E),
   then re-verify in a **fresh anonymous Playwright context** — never in the admin session.
3. **Verify with real queries/Playwright, not assumptions.** Every stage has a single decisive GATE check (§ per stage).
4. **IDs on a fresh site ≠ MegaClean IDs.** Forms 39/40/41/44/47, `MFDemo_*` tables, module 385/386/515, TabIDs 143-147
   are **MegaClean-only ERP artifacts**. Re-derive every FormId / ModuleId / TabId from the NEW DB. **[CRITIQUE]**
5. **DB server:** DNN = `WINDOWS-11\SQLEXPRESS` (Oqtane = `localhost\SQLEXPRESS`). Physical web root is the
   `…\Website\` SUBfolder. Playwright lives at `<repo>/node_modules/playwright`.
6. **Version note:** on-disk base media is **DNN 10.3.0** (`Version` table 10/3/0, `DotNetNuke.dll` 10.3.0.0). The
   "10.3.22" label is cosmetic — no 10.3.22 media exists. 10.3.0 is what every existing Mega site runs. **[CRITIQUE #10]**

---

## STAGE A — Fresh clean DNN 10.3.0 site + empty SQL DB

**Pick names once (1:1:1 convention — IIS site = app-pool = DB catalog):**
`NAME=DNN10322_MegaQA`, `HOST=dnn10322_megaqa.ai`, `ROOT=E:\DNN_SITES\DNN10322_MegaQA\Website`, `DB=DNN10322_MegaQA`,
`POOL=DNN10322_MegaQA`. Run PowerShell **elevated** (IIS + hosts need admin).

> ⚠️ Base install media path: research found it at `E:\DNN\DNN_Platform_10.3.0_Install.zip` (52.6 MB). The autorun
> progress note earlier said `E:\DNN_Platform_10.3.0_Install.zip`. **Confirm the actual path first** (`Test-Path`),
> then use whichever exists.

```powershell
# STEP 1 — extract pristine DNN framework (base to clone; its Install\Module has ONLY DNN's 18 own packages, no MegaForm)
New-Item -ItemType Directory -Force 'E:\DNN_SITES\DNN10322_MegaQA\Website' | Out-Null
Expand-Archive -Path 'E:\DNN\DNN_Platform_10.3.0_Install.zip' -DestinationPath 'E:\DNN_SITES\DNN10322_MegaQA\Website' -Force
# verify: Website\Default.aspx, \web.config, \Install\InstallWizard.aspx now exist.

# STEP 2 — empty DB + app-pool login (Integrated Security, no SQL password). DNN does NOT create the DB itself; it must pre-exist & be EMPTY.
Invoke-Sqlcmd -ServerInstance 'WINDOWS-11\SQLEXPRESS' -Query "IF DB_ID('DNN10322_MegaQA') IS NULL CREATE DATABASE [DNN10322_MegaQA];"
Invoke-Sqlcmd -ServerInstance 'WINDOWS-11\SQLEXPRESS' -Query "IF SUSER_ID('IIS APPPOOL\DNN10322_MegaQA') IS NULL CREATE LOGIN [IIS APPPOOL\DNN10322_MegaQA] FROM WINDOWS;"
Invoke-Sqlcmd -ServerInstance 'WINDOWS-11\SQLEXPRESS' -Database 'DNN10322_MegaQA' -Query "IF USER_ID('IIS APPPOOL\DNN10322_MegaQA') IS NULL CREATE USER [IIS APPPOOL\DNN10322_MegaQA] FOR LOGIN [IIS APPPOOL\DNN10322_MegaQA]; ALTER ROLE db_owner ADD MEMBER [IIS APPPOOL\DNN10322_MegaQA];"
```

**STEP 3 — point `web.config` at the empty DB** (edit `…\Website\web.config`): both `connectionStrings/SiteSqlServer`
AND `dotnetnuke/data` must read
`Data Source=WINDOWS-11\SQLEXPRESS;Initial Catalog=DNN10322_MegaQA;Integrated Security=True` (providerName `System.Data.SqlClient`).
Leave `AutoUpgrade=true`, `UseInstallWizard=true`, `InstallMemberRole=true`. **Do NOT copy `machineKey` from another
site** — let the install generate one.

```powershell
# STEP 4 — IIS site + pool + binding (elevated)
Import-Module WebAdministration
New-WebAppPool -Name 'DNN10322_MegaQA'
Set-ItemProperty 'IIS:\AppPools\DNN10322_MegaQA' managedRuntimeVersion 'v4.0'
Set-ItemProperty 'IIS:\AppPools\DNN10322_MegaQA' managedPipelineMode 'Integrated'
Set-ItemProperty 'IIS:\AppPools\DNN10322_MegaQA' processModel.identityType 'ApplicationPoolIdentity'
Set-ItemProperty 'IIS:\AppPools\DNN10322_MegaQA' enable32BitAppOnWin64 $false
New-Website -Name 'DNN10322_MegaQA' -PhysicalPath 'E:\DNN_SITES\DNN10322_MegaQA\Website' -ApplicationPool 'DNN10322_MegaQA' -HostHeader 'dnn10322_megaqa.ai' -Port 80
icacls 'E:\DNN_SITES\DNN10322_MegaQA\Website' /grant 'IIS APPPOOL\DNN10322_MegaQA:(OI)(CI)M' /T /Q

# STEP 5 — hosts entry
Add-Content -Path 'C:\Windows\System32\drivers\etc\hosts' -Value "`n127.0.0.1 dnn10322_megaqa.ai"
```

**STEP 6 — run the installer (6A = PROVEN in this env, headless InstallWizard via Playwright):**
Browse `http://dnn10322_megaqa.ai/` → DNN redirects to `/Install/InstallWizard.aspx`. Fill:
`#txtUsername=host`, `#txtPassword=dnnhost`, `#txtConfirmPassword=dnnhost`, `#txtEmail=host@changeme.invalid`,
`#txtWebsiteName="MegaForm QA"`; select `#templateList` (Default Website) + `#languageList` (en-US); **click
`#continueLink` by ID** (do NOT match by text — "Proceed with Installation" causes false positives). Poll
`#percentage`; done when body contains "installation was successful"; then click View Website.
*(6B silent-config `UseInstallWizard=false` + `DotNetNuke.install.config` is documented but UNPROVEN here — use 6A.)*

**GATE A (all must pass):**
- `Invoke-WebRequest http://dnn10322_megaqa.ai/ -UseBasicParsing` → 200, NOT redirected to InstallWizard.
- `SELECT TOP 1 Major,Minor,Build FROM Version ORDER BY CreatedDate DESC` → `10 / 3 / 0`.
- `SELECT Username,IsSuperUser FROM Users WHERE IsSuperUser=1` → `host / True`; login `host/dnnhost` at `/Login.aspx` works.
- `SELECT PortalID,HTTPAlias FROM PortalAlias` → `0 / dnn10322_megaqa.ai`.

---

## STAGE B — Install MegaForm `01.07.109`

Single-source version = `MegaForm.DNN/MegaForm.dnn` `<package … version="01.07.109">`. Asset `?v=` =
`FormView.ascx.cs:339 const V="?v=20260720-B407"` (CodeBehind → already compiled into the shipped DLL).

```powershell
# Stage the package into the site's Install\Module (NOT the outer …\Install\Module sibling — the REST endpoint resolves ApplicationMapPath\Install\Module\<file>)
Copy-Item 'e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.DNN\Install\MegaForm_01.07.109_Install.zip' 'E:\DNN_SITES\DNN10322_MegaQA\Website\Install\Module\' -Force
```

Then, **as host** (needs auth cookie + antiforgery token — see § "Antiforgery handshake" below):
```
POST http://dnn10322_megaqa.ai/API/personaBar/Extensions/InstallAvailablePackage
Headers: RequestVerificationToken=<token>; Cookie=<host session>; Content-Type: application/json
Body:    {"PackageType":"Module","FileName":"MegaForm_01.07.109_Install.zip"}
```
Endpoint is `[RequireHost]` + `[ValidateAntiForgeryToken]` (`ExtensionsController.cs:555`). **ALT (proven UI fallback):**
Persona Bar → Settings → Extensions → Install Extension wizard; upload the zip in the iframe; at the license step click
the `<label>` in `.dnn-checkbox-container .checkbox` with a **real Playwright locator click** (React resets
`evaluate()`-clicks); click Next/Install/Done as real clicks.

**GATE B:**
- `SELECT Name,Version FROM Packages WHERE Name LIKE '%MegaForm%'` → `MegaForm / 1.7.109`.
- `SELECT COUNT(*) FROM sys.tables WHERE name LIKE 'MF[_]%'` → ≥ 50.
- Count of `…\Website\DesktopModules\MegaForm\Templates\*.json` = **17** (deployed from the nested `Resources.zip`).
  **[CRITIQUE]** On a FRESH install it is exactly the 17 DONEE templates — NOT the 52 seen on dirty MegaClean.
- **Recycle app pool** after install before proceeding.

---

## STAGE C — Bulk-create ALL package form templates  ⭐ **[CRITIQUE fixed the whole approach]**

The purpose-built endpoint EXISTS — both individual agents missed it and proposed WRONG paths (`usp_MF_Form_Upsert`
with a raw DONEE file, or `Templates/Import`). **Use this one:**

```
POST /DesktopModules/MegaForm/API/BuilderTemplates/DevBulkCreateForms
```
`BuilderTemplatesController.cs:80` (ActionName `DevBulkCreateForms`). It iterates `Catalog.List()` (every deployed
gallery template) and creates/updates ONE form each in a single call. It sets **`Status="Published"`** (line 253),
`SchemaJson={"version":"1.0","fields":[...],"settings":{...}}` (239-250), **`Title` = the source FILENAME**
(line 248, e.g. `vendor-application-fl.json`), and is **IDEMPOTENT** (re-run updates, matched by
`SettingsJson.devBulkSeed.sourceFile`, 185-211).

### C-PREREQ (the findings missed these — do them BEFORE calling C):
1. **`dev.lock` MUST exist** or you get HTTP **403 "dev.lock is required"** (`HasDevLock` 168-183 checks portal
   HomeDirectory OR app-root `~/dev.lock`). Create it: **[CRITIQUE RISK #1]**
   ```powershell
   New-Item -ItemType File -Path 'E:\DNN_SITES\DNN10322_MegaQA\Website\dev.lock' -Force | Out-Null
   ```
2. **A MegaForm module must be placed on a page** — the endpoint runs through `ActiveModule.ModuleID` (line 87), so it
   needs DNN `ModuleId` + `TabId` context headers (same header requirement as `Workflow/Apply`). DNN Prompt:
   `add-module --name MegaForm --pageid <TabID> --pane ContentPane --title QASeed`. *(This module can double as the
   Stage-D template page's form module.)*
3. **Host session cookie + `RequestVerificationToken`** (Administrators role required; `[DnnAuthorize StaticRoles=Administrators]` + `[ValidateAntiForgeryToken]`).

**Effect:** creates **17 Published forms**, ALL bound to that ONE prereq module. Stage E later rebinds each to its own
module. Title = filename; that's fine for QA (dedupe/rename later if desired).

**GATE C:**
- `SELECT COUNT(*) n, SUM(CASE WHEN Status='Published' THEN 1 ELSE 0 END) pub FROM MF_Forms` → `17 / 17`.
- Spot-check: one row's `SchemaJson LIKE '{"version":"1.0","fields":[%'` (proves the correct envelope — NOT a raw flat
  DONEE file, NOT an "Imported Form" mis-import).

**Scope note [CRITIQUE]:** 17 forms created, **16 seedable** — `member-login.json` has **0 data fields** (auth widget),
exclude it from Stage G seeding → "17 created, 16 seeded".

---

## STAGE D — ONE template page: multi-column skin, HTML pane + MegaForm RIGHT pane

**No multi-column skin exists** — the only content skin (Aperture) stacks `BannerPane/ContentPane/FluidPane`
**vertically**, so two modules would render STACKED, not left/right. **[CRITIQUE RISK #6]** You MUST add a 2-pane skin.

**Step D1 — write the 2-pane skin** `…\Website\Portals\_default\Skins\Aperture\two-column.ascx` (inside Aperture so
its partial-includes resolve). **[CRITIQUE D]** BEFORE relying on it, confirm the `partials/_registers.ascx`,
`_includes.ascx`, `_header.ascx`, `_footer.ascx` files actually exist under `…\Skins\Aperture\partials\`, and load
the page once to confirm it renders.
```aspnet
<!--#include file="partials/_registers.ascx" -->
<!--#include file="partials/_includes.ascx" -->
<div class="aperture-theme">
  <!--#include file="partials/_header.ascx" -->
  <main class="aperture-main">
    <div id="BannerPane" runat="server"></div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">
      <div id="LeftPane"  runat="server" style="flex:1 1 320px;min-width:280px"></div>
      <div id="RightPane" runat="server" style="flex:1 1 320px;min-width:280px"></div>
    </div>
    <div id="ContentPane" class="aperture-content-pane" runat="server"></div>
    <div id="FluidPane" runat="server"></div>
  </main>
  <!--#include file="partials/_footer.ascx" -->
</div>
```
New `SkinSrc` value = `/Portals/_default/Skins/Aperture/two-column.ascx`. **[CRITIQUE D]** Verify the token form DNN
accepts for a hand-set `Tabs.SkinSrc` — top-spacing agent saw the live value stored as `[G]Skins/Aperture/default.ascx`
while page-pane agent wrote the leading-slash `/Portals/_default/…` form. Existing content tabs store `SkinSrc=NULL`
(inherit). If the hand-set skin doesn't apply, try the `[G]…` token form.

**Step D2 — build the page. [CRITIQUE prefers DNN-native UI here** to de-risk `HtmlText StateID`/skin-token guesswork:**]**
Persona Bar → Pages → Add Page → set page skin to two-column → Edit mode → drag an **HTML** module into **LeftPane**
+ a **MegaForm** module into **RightPane** → author HTML → MegaForm module Settings → pick a form → Save. That Save
hits `POST /DesktopModules/MegaForm/API/MegaForm/SaveModuleConfig` (`MegaFormApiController.cs:4009-4031`) which writes
BOTH `MF_ModuleViewConfig` + `ModuleSettings MegaForm_FormId`. No cache-recycle/HTML-workflow guesswork.

*(Raw-SQL alternative = the full identity-chained insert in `R2_page_pane_module` §STEP 2 — Tabs→TabPermission→
Modules/TabModules/HtmlText→Modules/TabModules→MF_ModuleViewConfig. Both modules set `InheritViewPermissions=1` so no
ModulePermission rows needed. Recycle after. Use SQL only if the UI is too slow for bulk.)*

**Form-binding facts (critical for D & E):**
- Precedence (`FormView.ascx.cs:686-726`): admin `?formid=`/`?mfFormId=` → shell URL → **`MF_ModuleViewConfig` row
  (CANONICAL)** → `ModuleSettings MegaForm_FormId`. Module mode defaults to `"render"` when no `MegaForm_ModuleMode`
  setting exists, so a bare `MF_ModuleViewConfig` row renders the form.
- **`MF_ModuleViewConfig.FormId` OVERRIDES `ModuleSettings.MegaForm_FormId`** (`:719` before `:723`). If you clone a
  module that has an MVC row without fixing FormId, every clone shows the template's form. **[CRITIQUE RISK #3b]**
- **Self-heal ping-pong:** if the bound form's `MF_Forms.ModuleId` ≠ the module id and it's not explicit-render mode,
  `BuildRenderViewModel` (`:738-741`) rewrites `MF_Forms.ModuleId` to this module and `SaveForm()`s **on every load**.
  A form is single-owner. Keep strictly **1 form : 1 module** and UPDATE `MF_Forms.ModuleId` to the owning module.
  **[CRITIQUE RISK #3a]**

**GATE D (anonymous, fresh context, 1280px):** the HTML-module content is present in the LEFT pane AND an
`[id^="mf-form-wrapper-"]` exists in the RIGHT pane AND `RightPane.left > LeftPane.right` (side-by-side, not stacked).

---

## STAGE E — 3 ROOT pages → many child pages (1 distinct form each)

The existing MegaClean site already proves the pattern: roots "Premium Forms KB 1..5" (ParentId NULL, Level 0) with
"PFS-*" children (Level 1). **The clone SQL was proven via `BEGIN TRAN…ROLLBACK`** (created root→child→2 new Module
rows→settings→HTML content, then rolled back). Full recipe = `bvas3ez25.txt` copy-3-roots §STEP 2/3. Key rules:

- **COPY not REFERENCE:** a DNN "reference" = a 2nd `TabModules` row pointing at the SAME `ModuleID` → all pages show
  the SAME form. MegaForm needs **COPY** = a NEW `Modules` row per page. Pure-SQL always copies; in the DNN UI you must
  explicitly pick "Copy" per module. **[CRITIQUE RISK #3]**
- Per child: clone HTML module (new `Modules`+`TabModules`+`HtmlText` copying LATEST version `StateID=1 IsPublished=1`)
  + clone MegaForm module (new `Modules`+`TabModules`, `DisplayTitle=0`) → rebind: `ModuleSettings.MegaForm_FormId`
  + fix/clone `MF_ModuleViewConfig.FormId` (or delete the cloned MVC row) + **UPDATE `MF_Forms.ModuleId` → child
  module** (kills ping-pong) + `MegaForm_ModuleMode='render'` explicit.
- **TabPermission is NOT inherited at DB level.** Every root AND child tab needs `VIEW (PermissionID 3)` for
  `All Users (RoleID -1)` — else the page is admin-only/invisible to anonymous (the existing PFS-* pages are broken
  this exact way). **[CRITIQUE RISK #5]**
- **Round-robin** the 16 seedable forms across the 3 roots (`@i % 3`). One `MF_Forms` row per template already exists
  from Stage C (17 forms) — no `usp_MF_Form_Upsert` needed. **[CRITIQUE: Stage-C forms replace copy-3-roots STEP 1.]**
- Identity PKs everywhere → `SCOPE_IDENTITY()`, fresh `NEWID()` for `UniqueId/VersionGuid/LocalizedVersionGuid` on
  BOTH Tabs and TabModules. `TabPath = parentPath + '//' + REPLACE(name,' ','')`; keep child names unique (no DB
  uniqueness constraint). Fallback URL `/Default.aspx?tabid=<N>` always works. **[CRITIQUE RISK #8/#9]**
- Run in a TRAN, verify, COMMIT, then **clear cache**.

**GATE E:** join query — each child = `HtmlModules=1, FormModules=1`, UNIQUE `BoundFormId`, `Status='Published'`;
`SELECT ModuleID,COUNT(*) FROM TabModules WHERE IsDeleted=0 GROUP BY ModuleID HAVING COUNT(*)>1` is EMPTY (no shared
modules); anon-fetch two children → their form titles DIFFER.

---

## STAGE F — Anonymous top-spacing verification  ⚠️ **[CRITIQUE: measure the RIGHT pages]**

**Do NOT reuse the MegaClean `/Home` result (0px flush on stock Aperture).** Stages D/E create pages on the NEW
two-column skin with the form in a flex RIGHT pane — the 0px does NOT transfer, and the `.aperture-header` selector may
not match. Re-run the gap recipe **on the D template page AND on real E child pages**, fresh anonymous context, at 1280
+ 390px, **adapting the header selector to the new skin**.

**Gap recipe** (save as `<repo>\_gap.mjs`, `cd <repo> && node _gap.mjs`, delete after — repo is git-tracked):
```js
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
for (const w of [1280, 390]) {
  const ctx = await b.newContext({ viewport:{width:w,height:1000} });   // fresh ctx = anonymous
  const pg = await ctx.newPage();
  await pg.goto('http://dnn10322_megaqa.ai/Default.aspx?tabid=<CHILD>', { waitUntil:'networkidle', timeout:30000 });
  await pg.waitForSelector('[id^="mf-form-wrapper-"]', { timeout:12000 });
  await pg.waitForTimeout(1400);                                        // let guards' setTimeout settle
  const r = await pg.evaluate(() => {
    const hdr = document.querySelector('.aperture-header') || document.querySelector('header, .Head, #Header');
    const wrap = document.querySelector('[id^="mf-form-wrapper-"]');
    const card = wrap.querySelector('.mfp-card,.fr-card,.ey-card,.mfp[class*="mfp-"]') || wrap.querySelector('.mf-form') || wrap;
    const hb = Math.round(hdr.getBoundingClientRect().bottom);
    return { anon_noAdminDock:!document.querySelector('.mf-host-admin-dock'),
      headerPosition:getComputedStyle(hdr).position, headerBottom:hb,
      cardTop:Math.round(card.getBoundingClientRect().top),
      GAP_px:Math.round(card.getBoundingClientRect().top)-hb,
      guard_headerGuardAttr:wrap.getAttribute('data-mf-header-guard'),
      guard_closestDotContent:!!wrap.closest('.content') };
  });
  console.log('@'+w+'px', JSON.stringify(r)); await ctx.close();
}
await b.close();
```
**Interpret `GAP_px`:** `<0` = card hidden under header (**regression**, FixedHeaderGuard should fire); `0` = flush
(the MegaClean state — borderline OK because the card has 24px radius + drop-shadow); `8-40` = comfortable; `>64` =
excess (Oqtane-style, would need ContentGapTrim).

**Both client guards ship but are INERT on DNN** (verified): `content-gap-trim.ts:65` gates on `closest('.content')`
which is an Oqtane/Bootswatch class, never present on DNN (`aperture-content-pane`/`ContentPane`); `fixed-header-guard`
finds the sticky header but `shortfall ≤ EXTRA_GAP_PX(8)` so it adds no margin. Function names are MINIFIED — grep the
attribute literals `data-mf-header-guard` / `data-mf-content-trim` (each should = 1) to prove the guards shipped.

**If a comfortable DNN gap is desired** (design decision for the user — measured 0px on MegaClean): add it via
skin/module CSS (top padding on `.aperture-main`/`#ContentPane` or module wrapper margin), OR extend
`content-gap-trim.ts` to also match `.aperture-content-pane, .ContentPane` (today only `.content`). **Record the
measured numbers in the report and flag the 0px-vs-gap decision — do NOT change canonical CSS unilaterally without
user sign-off** (visual-QA rule).

**GATE F:** on a real E child page, `GAP_px` in the comfortable band (roughly 0–40) at both widths; negative =
regression, >64 = excess. Screenshot each; paths in the report.

---

## STAGE G — Seed 20 REAL submissions/form (file-download + composite fields)

**Method = API-POST (primary, most realistic — exercises full pipeline incl. typed storage).** Can run in PARALLEL
with D/E as soon as C is done. **[CRITIQUE: field keys must come from the 17 gallery schemas — NOT the MegaClean
`store_code/receipt` keys; MFDemo_* side-inserts do NOT exist on the fresh site.]**

```
POST http://dnn10322_megaqa.ai/DesktopModules/MegaForm/API/Submit/Post   (AllowAnonymous, NO antiforgery, formId in body)
Content-Type: application/json
Body: {"formId":<int>,"submissionTime":<12..40>,"data":{"<fieldKey>":<value>,...}}
Response: {"success":true,"submissionId":N}
```
Per form: `GET .../API/Submit/Schema?formId=N` → read `fields[]` (key,type). Generate 20 varied `data` objects with a
per-type generator (**value formats verified from source + live DataJson**):

| Field type | DataJson value | Example |
|---|---|---|
| Text/Email/Url/Phone/Select/Radio/Hidden | plain string (Select/Radio = option **VALUE** not label) | `"role":"engineering"` |
| Textarea/RichText | plain string | `"notes":"..."` |
| Number/Currency/Slider/Rating/OpinionScale | numeric **as STRING** | `"excitement":"4"` |
| Date/DateTime/Time | ISO-ish STRING | `"txn_date":"2026-07-14"`, `"preferred_time":"14:30"` |
| Checkbox(group)/MultiSelect/Chips/Ranking | **JSON ARRAY** of option values | `["analytics","security"]` |
| Checkbox(no options)/Switch/Terms | truthy string/bool | `"terms":"yes"` |
| Composite (name/address/phone/…) | **COMBINED STRING** (parts stripped server-side) | name `"Jane Doe"`, address `"123 Main St, Springfield, IL 62704, USA"`, phone `"+1 415 5551234 ext 7"`, daterange `"2026-07-01 → 2026-07-15"` (U+2192) |
| Signature | data-URL string | `"data:image/png;base64,iVBOR..."` (seed a tiny 1×1 PNG) |
| File/FileUpload/PdfForm | **JSON ARRAY of meta objects** (see below) | |

- `submissionTime` 12–40 (real seconds; too low → anti-spam; IsSpam=true still saves the row). Do NOT include the
  honeypot (`__mf_hp`); internal keys `__mf_ts/__mf_parts/__mf_hp/__mf_resume_token` are stripped server-side.
- Recurse `Row.columns[].fields[]` when reading schemas (grid templates put ALL inputs in Row columns → a top-level
  scan reports 0 fields). PowerShell `ConvertFrom-Json` THROWS on the duplicate `properties`/`Properties` keys in
  several templates — use Node/Python/jq. **[CRITIQUE + template-inventory gotcha]**

### File-download coverage (verified live)
**Best UI path (recommended):** open the Published form, drop a PDF on the File field, Submit — writes physical file +
correct DataJson array + `MF_Files` row at submit. **API path:**
1. `POST .../API/Upload/File` (multipart, AllowAnonymous; form MUST be Published; field must be File/FileUpload/PdfForm)
   `formId=<int>&fieldKey=<key>&file=<binary>` → response `{fileName,fileSize,contentType,fileUrl,tempPath,storedIn}`.
   Physical file → `…\Website\App_Data\MegaForm\PrivateUploads\form-<id>\field-<key>\<16hex><ext>`.
   Content is magic-byte-validated (a `.pdf` must start with `%PDF-`).
2. Put the WHOLE metadata object (or array) into `data[fileFieldKey]` and submit.
- **Download** `GET .../API/Files/Download?path=<tempPath>` is `[DnnAuthorize]` → **anonymous = 401**; QA must click
  while **logged in as host**. `MF_Files` is not consulted by download (works from physical file + path) but IS needed
  for the My-Inbox/SDK file chip. **[CRITIQUE RISK #7]**
- Templates with real File fields: **vendor-application** (key `portfolio`, single page — fastest),
  **bulgaria-discovery-programme** (`supporting_document`), **project-intake-onboarding** (`reference_files`).

### Composite/Signature coverage  ⚠️ **[CRITIQUE G — NO gallery template has one]**
No DONEE/gallery template contains a true Composite/Signature/Address/DateRange/MultiColumnCombo field. To satisfy
"composite fields", **add a Composite (`widgetProps.preset` = name|address|phone|…) + a Signature + a File field via the
builder to ≥1 Published form** BEFORE seeding, then seed the combined-string / data-URL / file-array formats above.

**GATE G:** per form `SELECT COUNT(*) FROM MF_Submissions WHERE FormId=<id>` = 20; every DataJson parses as valid JSON;
multi-value fields are JSON arrays; Select/Radio store option VALUES. For the file form: physical file exists under
`PrivateUploads\form-<id>\field-<key>\`, `DataJson[key]` contains `tempPath`, and GET `fileUrl` **while authenticated as
host** = 200 + `Content-Disposition: attachment` (anonymous = 401 confirms the gate).

---

## Antiforgery handshake (gates B, C, and any host-only POST)  **[CRITIQUE B/C — unproven headless, provide + fallback]**

`InstallAvailablePackage`, `DevBulkCreateForms`, and `Templates/Import` are all `[ValidateAntiForgeryToken]` host-only.
One recipe with a fallback:
1. **Playwright**: log in `host/dnnhost` at `/Login.aspx`; keep the context (cookie jar).
2. Read the token: hidden input `__RequestVerificationToken` on any DNN page, OR
   `await page.evaluate(() => $.ServicesFramework(-1).getAntiForgeryValue())`.
3. POST from **inside the same browser context** (`page.request.post(...)` reuses cookies) with header
   `RequestVerificationToken=<token>`. This guarantees the token matches the `__RequestVerificationToken` cookie.
4. **Fallback if it 403s:** drive the Persona-Bar UI wizard (Extensions install / builder gallery) with real locator
   clicks — proven in the 07-09 handoff.

---

## Execution order + interleaving (dependency-ordered)

```
A  fresh DNN + empty DB ............................. GATE: 200, not InstallWizard, Version 10/3/0
B  install MegaForm 1.7.109 (recycle after) ........ GATE: Packages 1.7.109, ≥50 MF_ tables, 17 templates
C-prereq  dev.lock + 1 MegaForm module + host token   (dev.lock BEFORE C or 403)
C  DevBulkCreateForms (17 Published, 1 module) ...... GATE: 17/17 Published, SchemaJson envelope
D  2-pane skin + template page (HTML L + Mega R) .... GATE: side-by-side anon @1280  ← measure F immediately after
E  3 roots × children, COPY+rebind+MF_Forms.ModuleId  GATE: unique BoundFormId/child, no shared ModuleIDs
F  anon top-spacing on D page + E children .......... GATE: GAP_px in 0–40 @1280 & 390 (NOT on /Home)
G  seed 20/form (add Composite/Sig/File first) ...... GATE: 20 rows/form, file download 200 as host / 401 anon
```
**Critical interleaving:** `dev.lock` before C; recycle/clear-cache after B, D, E; re-verify anonymously in a fresh
context after every cache clear; measure F on the D template page right after D (catch a skin problem before cloning
40+ children); G can run in parallel with D/E once C is done.

---

## Source-of-truth references (all verified, repo-relative)

- Bulk-create: `MegaForm.DNN/WebApi/BuilderTemplatesController.cs:80` (DevBulkCreateForms), dev.lock gate `:168-183`,
  Published `:253`, SchemaJson `:239-250`, Title=filename `:248`, idempotent `:185-211`.
- Form resolution / binding: `MegaForm.DNN/Views/FormView.ascx.cs:686-726` (precedence), `:738-741` (self-heal),
  `:224-270` (configured gate). `Data/FormRepository.cs:734-793` (Get/Save ModuleViewConfig).
  `WebApi/MegaFormApiController.cs:4009-4031` (SaveModuleConfig).
- Submit/Upload/Download: `MegaFormApiController.cs:1092/1115` (Submit AllowAnonymous), `:3186-3306` (UploadFile,
  Published gate `:3223`, response `:3297-3306`), `:3462-3512` (Download `[DnnAuthorize]`).
  Core pipeline `MegaForm.Core/Services/SubmissionProcessor.cs:115` (ProcessAsync), DataJson `:331-343`.
  DNN keeps DataJson: `MegaForm.DNN/Data/DnnSubmissionDataStore.cs:33` (`SupportsDataJsonCollapse=false`).
- Value formats: `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs:22-101` (ResolveDataType),
  `SubmissionFieldTypeSemantics.cs:27-68` (FileLike/aliases). Composite combine
  `MegaForm.UI/src/renderer/helpers.ts:296-341` + `composite-address.ts:128`.
- Client guards: `MegaForm.UI/src/renderer/content-gap-trim.ts:60-75` (`.content` gate `:65`),
  `fixed-header-guard.ts:34-50` (`shortfall<=EXTRA_GAP_PX`), `index.ts:1495-1496` (both called).
- Install: base media `E:\DNN\DNN_Platform_10.3.0_Install.zip`; `ExtensionsController.cs:555` (InstallAvailablePackage).
  Proven fresh-install handoff `CLAUDE_HANDOFF_20260709_DNN_PACKAGE_CLEAN_INSTALL_QA.md`.
- Templates: 17 canonical `Samples/FormTemplates/Premium/DONEE/*.json` (full field inventory in
  `R1_template_inventory` — scratchpad). Deployed superset (52) only on dirty MegaClean.

## Open decisions to confirm with the user (non-blocking; make sensible default + record)
1. DNN base = **10.3.0** (no 10.3.22 media). Default: proceed with 10.3.0 (what every site runs).
2. DNN top gap: measured **0px** (flush) on MegaClean — acceptable, or add a deliberate comfortable band? Default:
   measure/record on the new skin; do not change canonical CSS without sign-off.
3. Composite/Signature: no template has one → default plan adds them via builder to 1 Published form before Stage G.
4. "All package templates" = the **17** on a fresh install (not the 52 on dirty MegaClean). Default: seed 16 (skip
   member-login).
```
