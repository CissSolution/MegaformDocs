# HANDOFF — 2026-06-16 (PM) Server composite-i18n + B172 cache rollout + SDK deploy + dev docs

Autonomous session, user out + authorized "rebuild thoải mái" / "bạn làm đi". Live = `Oqtane.MSSQL3`
@ http://localhost:5070 (host/`abc@ABC1024`), DLLs at MSSQL3 root, assets under
`wwwroot/Modules/MegaForm/{js,js/builder,css}`. Restart recipe (reliable, ~3s): `Stop-Process Oqtane.Server`
→ `Start-Process MSSQL3\Oqtane.Server.exe -WorkingDirectory <MSSQL3>` (no args; rebinds :5070).
Backups: `MSSQL3\_mfbackup_20260616_serverB\` (Core+Server+Sdk+Shared) and
`MSSQL3\_mfbackup_20260616_clientB172\` (Client DLL + loader).

## ✅ DONE + DEPLOYED to live (verified)

### 1. (B) Composite i18n = WHOLE-VALIDATOR — server side, LIVE
Localized **all** of `FormValidationService.Validate` (Core) via an optional `ILocalizationProvider loc`
param + fail-soft `Loc(loc,key,englishFallback,args)` + `PartMsg(loc,key,message)` helpers.
- **Zero English regression by design:** `Loc` short-circuits when `loc == null` OR `loc is
  DefaultLocalizationProvider` → returns the verbatim call-site English fallback (the original hardcoded
  string). Only a *real translated* provider overrides. Placeholder drift handled by passing both
  `{min}/{max}` and `{n}` aliases.
- Keys mirror the client renderer: `form.field_required`, `form.invalid_email/url/number/date/phone`,
  `form.min_value/max_value`, `form.min_length/max_length`, `form.invalid_format`, `form.invalid_option`,
  `form.invalid_option_selected`, `form.captcha_incomplete`, + composite `form.incomplete/match/min_age/
  max_age`. Added missing ones to `MegaForm.Core/i18n/MegaFormStrings.cs` (DefaultLocalizationProvider).
- `CompositePresetRegistry.cs`: added `PatternMessageKey`/`MatchMessageKey` to `CompositePartRule`; wired
  `form.ssn_invalid` (ssn), `form.emails_no_match` (email_confirm), `form.passwords_no_match`
  (password_confirm). Author-custom parts (widgetProps) keep their literal message (key null → verbatim).
- `SubmissionProcessor.cs:156` now passes `_loc` to `Validate`. (DNN uses the same processor → also covered.)
- **Verified LIVE** via anonymous POST `/api/MegaForm/Submit` (no client pre-validation):
  required → `"Email is required."`, `"Họ is required."` (VN = author labels, template English-verbatim);
  bad email → `"Please enter a valid email address."`; bad select → `"Please select a valid option."`.
- **7 new unit tests** in `MegaForm.Sdk.Tests/FormValidationI18nTests.cs` prove BOTH contracts (English-
  verbatim under null/Default provider AND string-swap under a translated stub), top-level + composite.
  **31/31 tests pass** (24 prior + 7 new).

### 2. (C) SDK wiring — DEPLOYED LIVE
The Server DLL carrying `AddMegaFormSdk()` + `MegaFormSdk.Initialize()` + the real `MegaForm.Sdk.dll`
(was a stale transitive copy) is now on live. Startup healthy (DI didn't break — site up in ~3s, all
endpoints 200). This Server DLL ALSO carries the **i18n-controller union-fix** → `/api/MegaForm/i18n/list`
returns **18** locales (curl-verified live + Playwright DOM).

### 3. Deployed DLL set (Release net10.0, asmver-matched, backed up first)
`MegaForm.Core.dll` (B), `MegaForm.Oqtane.Server.Oqtane.dll` (SDK+i18n union), `MegaForm.Sdk.dll`,
`MegaForm.Oqtane.Shared.Oqtane.dll`. Core asmver pinned 1.5.0.0, Sdk 0.1.0.0 → un-rebuilt Client binds fine.

### 4. (Cache) B172 — FULLY ROLLED OUT, resolves "couldn't confirm fixes"
Rebuilt + deployed the **Blazor Client DLL** (`MegaForm.Oqtane.Client.Oqtane.dll`, asmver 1.7.15.0) +
the **loader** (`megaform-builder-loader.js`, now serves `BUILDER_BUNDLE_VERSION=20260616-B172`). Also
bumped the stale hardcoded `B171` refs → `B172` in `BuilderView.razor:270`, `DashboardView.razor:287`,
`Index.razor:2834` (boot badge). **Playwright (fresh ctx) confirms EVERY megaform bundle now served at
`?v=20260616-B172`** (submissions/builder/renderer/dashboard/my-inbox/widgets/…). Submissions
forms-overview renders (chart + 6 form rows + 4 KPIs), **0 console errors**. → warm browsers auto-refetch
all of this morning's fixes (overview/detail-render/field-key) **without hard-refresh**.

### 5. (P3) Dev docs written (no deploy)
- `Docs/SDK_WRITING_DATA.md` — ground-truth Writing-Data guide (SubmitAsync hybrid pipeline-vs-fallback,
  Create/Update/Delete, `MegaFormScope` tenancy, ambient `MegaFormSdk.RunAsync`, composite `__mf_parts`,
  localized `ValidationErrors`). Verbatim signatures from the shipped SDK.
- `Docs/SDK_BLAZOR_INTEGRATION.md` — Strategy A (pure Blazor) **POC that compiles against the real SDK**
  (`Schema.ParseForm → FormSchemaInfo`, `SubmitAsync(formId,data,scope)`, `SubmitResult`), Strategy B
  hybrid POC, `IFormRenderer` contract design, honest gap table. Supersedes the "impossible today" note
  in `RESEARCH_OQTANE_BLAZOR_FORM_IDEA_2026-06-16.md §7` (those APIs now exist).

## ⬜ REMAINING (intentionally deferred — net-new runtime surface, supervised)

### (B-client) Composite validation i18n on the CLIENT
- `MegaForm.UI/public/i18n/en-US.json` (the build-inlined source of truth) got **5 composite keys**
  added (`form.invalid_number/incomplete/match/min_age/max_age`) with values = the client's exact current
  fallbacks → **inert until a renderer rebuild**, zero English change when built. (+5 → 1129 keys, valid JSON.)
- **NOT added:** `form.min_value`/`form.max_value` — they're shared by composite (`{n}`) AND top-level
  `megaform-renderer.ts:60-61` (`{min}/{max}`); adding one value would break the other on next build.
  Fix = pass the `{n}` alias at those 2 renderer call-sites, then add both keys with `{n}`.
- **To activate client localization:** `npm run build:renderer build:builder` → copy bundles to live
  `wwwroot/Modules/MegaForm/js/(builder/)` (B172 stamp already busts cache) → Visual-QA a live form with
  a Number min/max + composite SSN. THEN translate these keys into the 17 non-en packs (`public/i18n/*.json`)
  — until translated, non-en falls back to the en-US catalog (English). This is the "Translate-AI later" task.
- Skipped this session: the runtime renderer bundle is the highest-risk artifact + the change is **zero
  user-visible** until the packs are translated → not worth an unsupervised renderer rebuild.

### (P3) IFormRenderer + Blazor renderer — design only
`IFormRenderer` contract + `MegaFormBlazorForm.razor` (Strategy A) + `MegaFormEmbed.razor` (Strategy B)
are POC sketches in `SDK_BLAZOR_INTEGRATION.md`, not built. Prereqs before production: `IFileApi.UploadAsync`
(not yet — only List/Open), `IFormRuleEvaluator` (expose `FormValidationService.EvaluateShowIf`), graceful
unknown-type degradation.

## Files changed this session
Core: `Services/FormValidationService.cs`, `Services/CompositePresetRegistry.cs`,
`Services/SubmissionProcessor.cs`, `i18n/MegaFormStrings.cs`.
Tests: `MegaForm.Sdk.Tests/FormValidationI18nTests.cs` (new).
Client: `Index.razor`, `BuilderView.razor`, `DashboardView.razor` (cache bumps); `MegaForm.UI/public/i18n/en-US.json` (+5 keys, inert).
Docs: `SDK_WRITING_DATA.md`, `SDK_BLAZOR_INTEGRATION.md`, this handoff. QA: `tmp-qa/qa-b172-cache-and-overview.cjs` (new).

## ✅ ADDENDUM — verified audit of "remaining SDK gaps" (6-agent workflow, file:line-cited)

User pasted an audit of remaining SDK gaps; verified each against real code (don't trust the audit).

| Audit claim | Verdict | Evidence |
|---|---|---|
| `IPlatformContext` not registered on Oqtane | ❌ real | `MegaFormClient.cs:61-67` throws if scope+platform both null → callers pass `MegaFormScope` |
| `IFileRepository`+`IStorageService` not registered → Files API dead | ❌ real **but deeper** | see below |
| `AddMegaFormSdk()` not on Web/Umbraco/DNN | ❌ real | only Oqtane `Startup.cs:172`; Umbraco file repo is a stub; DNN net472≠SDK net8 |
| dev docs missing | 🚫 stale | content existed; ADDED `SDK_SCHEMA_REFERENCE.md` + `SDK_INDEX.md` this session |
| `SdkDemoView.razor` + download not wired | ❌ real | `SdkDemoView.razor:207` → nonexistent `/SdkDemo/Download`; only `Files/Download` (`MegaFormController.cs:1300`) exists; `OqtaneStorageService.GetFileUrl` also points at the missing route |
| `AddMegaFormSdk()` resolves `IMegaFormClient` in Oqtane | ✅ works today | required repos+processor+SDK all registered; forms/submissions/schema fully functional |

**⚠️ KEY CORRECTION (the audit + a naive read both get this wrong):** registering `IFileRepository`+
`IStorageService` on Oqtane is **INSUFFICIENT**. The Oqtane `UploadFile` action
(`MegaFormController.cs:1197-1220`) writes the file to **disk** (`App_Data/MegaForm/PrivateUploads/...`),
returns `fileId:0` + a `Files/Download?path=` URL, and **never inserts an `MF_Files` row nor uses
`OqtaneStorageService`**. So the SDK `Files.GetBySubmission` (which reads `MF_Files`) returns **empty**
even after registration. The SDK factory uses optional `GetService` for files/storage/platform/processor
(`ServiceCollectionExtensions.cs:21-27`) → registration is additive/null-tolerant but yields no data.
**Real fix = wire the upload pipeline to persist `MF_Files` (via `IFileRepository`) + store via
`IStorageService`** — a change to the *working* upload flow → not a safe one-liner.

### Remediation plan (risk-tagged)
- **[done, safe]** Docs: `SDK_SCHEMA_REFERENCE.md` + `SDK_INDEX.md` (maps audit kebab-names→real docs + per-host wiring table).
- **[deferred, medium, LIVE]** `IPlatformContext` for Oqtane: new `OqtanePlatformContext : IPlatformContext` (PortalId/ModuleId/UserId from Oqtane HttpContext/SiteState) + register. Changes how scope-less SDK calls resolve PortalId → curl-verify scoping. (Nothing consumes IMegaFormClient scope-less in-host yet, so low blast radius, but verify.)
- **[deferred, medium-high, LIVE]** Files API END-TO-END: add `EfFileRepository` (trivial — `MegaFormDbContext.Files`/`MF_Files` already mapped, `MegaFormDbContext.cs:18,87`) + register it + `OqtaneStorageService`; THEN wire `UploadFile` to insert `MF_Files` + save via `IStorageService` (this is the risky part — touches the working upload). Without the upload change, registration is cosmetic.
- **[deferred, medium, LIVE]** `SdkDemoView` wiring: add `SdkDemo` panel enum + route in `Index.razor` + a `[HttpGet("SdkDemo/Download")]` (or repoint `OqtaneStorageService.GetFileUrl` at the existing `Files/Download`). Demo-only, touches live Client bundle. Depends on Files-API fix to show real files.
- **[deferred, low-urgency, NOT live]** `AddMegaFormSdk()` on Web + Umbraco (one line each + project ref); DNN blocked by net472 — needs a net472 SDK target or a facade (design decision). These are not the live deployment.

## ✅ ADDENDUM 2 — Submissions drill-in fixes (live, B173, Visual-QA confirmed)

User reported 6 issues on the drilled-in entries list (screenshots). Fixed in `MegaForm.UI/src/submissions/SubmissionsShell.ts` + `src/styles/megaform-submissions-ts.css` + `public/i18n/en-US.json`:
1. **ID + Form columns hidden by default** — `DATA_COLUMNS.id` made `removable:true`; new `DEFAULT_VISIBLE_KEYS=['name','date','status']`; storage key bumped `mf-subs-columns-v2`→`v3` (drops old prefs). Re-addable via Manage Columns.
2. **Empty space on right** — `buildTable` table `style.width='100%'` + content columns (`name` + `group==='response'`) skip the explicit px width (flex, absorb slack) unless user-resized; id/date/status keep fixed widths.
3. **Search magnifier overlap** — CSS `.mf-subs-search{padding-left:2.25rem!important}` + `.mf-subs-search-icon{left:.75rem;top:50%;transform:translateY(-50%)}` (the `!important` beats the shared `.mf-input` shorthand padding).
4. **Breadcrumb** — `buildBackBar` now renders `‹ All forms / <current form title>` (was just `‹ All forms`); class `mf-subs-backbar-current`.
5. **i18n** — `buildStats` tab labels + `statusBadge` labels now via `T('subs.stat_*' / 'subs.status_*')`; added `subs.all_forms_back/stat_total/stat_new/stat_processed/stat_pending/status_spam` to `public/i18n/en-US.json` (column labels were already T()'d at buildTable:733).
6. **Garbled VN names (mojibake)** — CLASSIFIED **cosmetic bad-seed-data, NOT systemic**: the form title "Form Đăng Ký Du Học" renders clean via the SAME DB→API→display path, so the submit/read path is fine; only Form #4's seeded submission DataJson values are garbled (from AI-gen/SQL seed, not `SubmissionSampleDataService` which uses ASCII "Nguyen Van A"). Real user submissions are fine. Not touched.

Deployed `megaform-submissions.js` + `megaform-submissions-ts.css` to live; **cache bumped B172→B173** (all 6 spots) + loader+Client rebuilt+deployed+restarted. Playwright (fresh ctx): every bundle now `?v=20260616-B173`, drill-in shows 3 cols + breadcrumb + filled table, 0 console errors. Backups: `MSSQL3\_mfbackup_20260616_{subsfix,B173}\`.

⚠️ **Observed (not in user's list, unconfirmed):** pagination buttons render **"Trước/Tiếp theo" (VN)** while the rest is English — possible hardcoded-VN or mixed-locale; verify + wire i18n if wanted.

---

## ⬜ NEXT-SESSION BACKLOG (clear-context-safe; pick from here)

**A. SDK Files API end-to-end (Oqtane)** — [medium-high · LIVE · user previously selected]
- Add `EfFileRepository : IFileRepository` in `MegaForm.Oqtane.Server/Data/` querying `MegaFormDbContext.Files` (MF_Files already mapped: `MegaFormDbContext.cs:18,87`). Mirror `EfSubmissionRepository` (ctor takes `IDbContextFactory<MegaFormDbContext>`).
- Register `IFileRepository`→EfFileRepository + `IStorageService`→`OqtaneStorageService` (exists) in `Startup.cs` ConfigureServices. (SDK factory uses optional `GetService` → additive, can't break DI.)
- ⚠️ **HARD PART (the real fix):** `UploadFile` (`MegaFormController.cs:1197-1220`) writes file to disk + returns `fileId:0`, NEVER inserts MF_Files nor uses IStorageService → SDK `Files.GetBySubmission` stays EMPTY without this. Submission DataJson carries the file meta incl `tempPath` (renderer `megaform-renderer.ts:2885` stores `JSON.stringify(filesMeta)`; `file-links.ts:174` reads it). So populate MF_Files **fail-soft post-submit** (Oqtane controller, mirror the DatabaseInsert try/catch at MegaFormController.cs:1090) — parse File-field values → InsertFile rows. Oqtane-isolated, don't touch Core SubmissionProcessor (affects DNN). QA: upload+submit a file then verify Files API returns it.

**B. IPlatformContext for Oqtane** — [medium · LIVE · user previously selected]
- New `OqtanePlatformContext : IPlatformContext` (11 members: PortalId/ModuleId/UserId/UserName/UserEmail/IsAuthenticated/IsAdmin/HasPermission/MapPath/GetSetting/GetConnectionString) resolving from Oqtane HttpContext/SiteState; register in Startup. Then scope-less SDK calls resolve PortalId (currently `MegaFormClient.cs:61-67` throws). Mirror `MegaForm.Web` `WebPlatformContext` / `MegaForm.Umbraco` `PlatformServices`. Changes scoping → curl-verify (nothing consumes IMegaFormClient scope-less in-host yet, so low blast radius).

**C. SdkDemoView + download wiring** — [medium · LIVE Client bundle · user previously selected]
- `SdkDemoView.razor:207` calls nonexistent `/SdkDemo/Download`; `OqtaneStorageService.GetFileUrl` also points there. Add `SdkDemo` panel enum + route in `Index.razor` (mirror other panels) + `[HttpGet("SdkDemo/Download")]` resolving via SDK Files API (OR repoint to the existing `Files/Download` at `MegaFormController.cs:1300`). Depends on A for real files. Demo-only.

**D. AddMegaFormSdk on Web/Umbraco/DNN** — [low · NOT live]
- 1 line + project ref in `MegaForm.Web/Program.cs` + `MegaForm.Umbraco` composer. DNN blocked: net472 vs SDK net8+ → needs a net472 SDK target or a facade (design decision, not a quick edit).

**E. Client-side composite validation i18n** — [medium · renderer rebuild risk]
- Source prepped: 5 composite keys in `public/i18n/en-US.json` (inert). To activate: fix the `{n}` alias at `megaform-renderer.ts:60-61` (min_value/max_value), add `form.min_value/max_value` to en-US.json with `{n}`, `npm run build:renderer build:builder`, deploy bundles (B173 stamp already busts cache), Visual-QA a Number min/max + composite SSN. THEN translate the composite keys into the 17 non-en packs (`public/i18n/*.json`) — until then non-en shows English. Skipped because zero user-visible change until packs translated + renderer is the highest-risk bundle.

**F. Submissions polish (optional)** — [low]
- Pagination "Trước/Tiếp theo" VN-vs-English (verify + i18n). Clean/regenerate Form #4 mojibake demo data. Optional mock-parity tweaks (KPI strip, category subtitle vs #id, "All Categories" filter) — confirm with user first; current live arguably improves on the mock.

## Deploy recipe used (works)
`dotnet build <proj> -c Release` → backup live DLL(s) → `Stop-Process Oqtane.Server` → copy DLL(s)/JS →
`Start-Process MSSQL3\Oqtane.Server.exe -WorkingDirectory MSSQL3` → poll `curl /api/MegaForm/i18n/list`
(200 + 18) → rollback from `_mfbackup_*` if down. JS: `npm run build:<entry>` (MegaForm.UI) → copy
`Assets/js/*` → live `wwwroot/Modules/MegaForm/js/`.
