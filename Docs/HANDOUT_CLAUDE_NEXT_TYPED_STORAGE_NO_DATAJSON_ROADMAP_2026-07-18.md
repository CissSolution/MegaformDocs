# HANDOUT — Typed Storage No-DataJson Roadmap (P0–P8) for Claude Next Session

Date: 2026-07-18
Author: Claude (autonomous continuation)
Driving audit: `Docs/REQUEST_CLAUDE_FIX_TYPED_STORAGE_LEGACY_TABLES_2026-07-18.md` (Codex P0–P8 plan)
Prior work this session: `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md`,
`Docs/QA_TYPED_STORAGE_WIDGET_ACCEPTANCE_2026-07-18.md`, `Docs/HANDOUT_CODEX_REVIEW_TYPED_STORAGE_WIDGET_ROUND5_2026-07-18.md`.

## Status stamp (do NOT regress)
> Round 2/3 transition: Oqtane typed-primary pilot + DNN parallel-write twin; Web/Umbraco not typed;
> Core readers still partially DataJson-based. **NOT "done no-DataJson".**

## What already shipped this session (branch `feature/typed-submission-storage-core`, NOT pushed)
- `a969c25` widget semantics + browser/SQL acceptance (sub 54).
- `824b577` **B1**: FileUpload→File canonicalize across SSR + 2 TS renderers + 3 upload endpoints. LIVE sub 56 (FileUpload → MF_Files).
- `e0bbe2a` **B3 diagnostics**: `GET /api/MegaForm/Diagnostics/TypedStorage` (host-only) detects DLL-mismatch.
- `0fe5234` **B3 packaging guard (Oqtane)**: `tools/validate-pack.ps1` + version single-source. Tested: FAIL 1.7.107 / PASS 1.7.108.
- `cd0e786` **P0 (this doc)**: DNN `BuildPackage-DNN.ps1` version single-source from manifest.
- 119 unit tests pass. Core builds clean net472/net8/net9/net10; MegaForm.DNN net472 build-clean.

---

## P0 — DNN schema/package correctness

### ✅ DONE (commit `cd0e786`)
`BuildPackage-DNN.ps1` no longer hard-codes `$VERSION='01.07.106'`; it derives from `MegaForm.dnn`
`<package name="MegaForm" version="...">` (= `01.07.108`). Manifest already references
`01.06.39.SqlDataProvider` (the 7 typed-table CREATE script), so a rebuild now produces a
correctly-versioned zip that creates typed tables on fresh install. Script parses OK.

### ⬜ REMAINING P0 (needs a build run and/or a schema decision — NOT done autonomously)

1. **Rebuild the DNN package + verify zip contents.** Run `MegaForm.DNN/BuildPackage-DNN.ps1 -BuildDotNet`
   and confirm the produced `Install/MegaForm_01.07.108_Install.zip` CONTAINS `SqlScripts/01.06.39.SqlDataProvider`
   and its inner `MegaForm.dnn` references it. NOTE: building `MegaForm.DNN` pulls in the uncommitted
   **NamedConnections** feature in `MegaFormApiController.cs` — review/commit that separately first, or build
   accepting it. The current checked-in `Install/MegaForm_01.07.106_Install.zip` is stale (pre-typed-script).

2. **Object-qualifier decision (latent bug on non-default installs).** VERIFIED:
   - `MegaForm.DNN/SqlScripts/01.06.39.SqlDataProvider` creates `{databaseOwner}{objectQualifier}MF_Submission*`
     (DNN packaging standard), incl. its FK to `{...}MF_Submissions`.
   - BUT the ENTIRE DNN runtime data layer hard-codes `dbo.MF_*`: `DnnSubmissionDataStore.cs:99/180/204`,
     `DnnExternalBindingStore.cs:70/105/110`, `DnnExternalRowMapStore.cs:91/116/134`.
   - On a DEFAULT install (`databaseOwner=dbo.`, `objectQualifier=''`) both resolve to `dbo.MF_*` → works
     (this is why :dnn10322_megaclean works). On a NON-DEFAULT qualifier install, the script creates
     `{qualifier}MF_*` while the runtime writes `dbo.MF_*` → typed writes hit tables that were never created.
   - **Recommendation:** because the whole DNN data layer is `dbo.`-hardcoded (not just typed storage), the
     lowest-risk consistent fix for THIS refactor is to make `01.06.39.SqlDataProvider` use `dbo.MF_*` to match
     the runtime — as a NEW versioned script (e.g. `01.06.40`), since a versioned SqlDataProvider that already
     ran does not re-apply on existing installs. The "resolve qualifier everywhere" path is a much larger,
     separate DNN refactor across all `Dnn*Store` classes — out of scope here; document non-default qualifier
     as unsupported until then. Do NOT silently edit the already-shipped 01.06.39.

3. **Stale `MegaForm.DNN/Install/SqlScripts/`.** VERIFIED: it does NOT contain `01.06.39.SqlDataProvider`.
   Determine whether `Install/SqlScripts` is generated output of BuildPackage (then document + ignore as
   source-of-truth) or intended source (then sync the script in). BuildPackage copies from `MegaForm.DNN/SqlScripts`,
   so `Install/SqlScripts` is almost certainly stale generated output — confirm and add a `.gitignore`/README note.

### P0 acceptance
Fresh DNN install from the newly-built `01.07.108` zip creates all 7 typed tables; a new submission writes
full `MF_Submissions.DataJson` + typed rows; no typed-write error in DNN logs; object-qualifier decision
recorded (fixed or documented-unsupported).

---

## P1–P8 — verified against current source

Each P below was re-verified against CURRENT source (8-agent pass). Verdicts, key `file:line`, and
**audit corrections** are recorded. Sequencing (dependency-first): **P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8**.

### P1 — Make typed reads the default Core facade  · verdict PARTIALLY_CONFIRMED · effort L · risk medium
Confirmed still DataJson-based: `SubmissionQueryService.GetDetail` (`SubmissionQueryService.cs:130,140-141`) + `ToListItem` (`:211,217,239`); `GetDetailTyped` (`:160-166`) is the ONLY typed-first reader. Also DataJson: `EmailNotificationService.cs:91/117/147/159`, `WebhookService.cs:44`, `WorkflowEngine.cs:289,438` (reads AND writes back via `_subRepo.UpdateData` → **clobbers typed rows on Oqtane**), `AdminRecordShellService.cs:53,159`, `DataRepeaterService.cs:321-329`, `FieldOptionsService.cs:356-358`, `Blog/ScheduledPublishService.cs:43,48`, `Blog/BlogAnalyticsRollupService.cs:47,52,106,111`.
**Audit corrections:** (a) `Payments/PaymentSubmissionVerifier.cs` — **FALSE**: it reads in-flight `formData` (`:197,209`), not stored DataJson (only comments mention it). Do NOT touch. (b) `ExternalTable/*` — **out of scope**: it *synthesizes* DataJson from external columns and has no typed rows (`ExternalSubmissionRepository.cs:174-175`). (c) `Starters/*` — PARTIAL: `ConfiguredAppStarterService.cs:690,868-873` reads; `PurchaseOrderStarterService.cs:346` write-only (leave).
**First steps:** add `MegaForm.Core/Services/TypedSubmission/SubmissionDataResolver.cs` (`typedStore!=null && HasFields(id)` → `SubmissionDataReconstructor.Reconstruct(GetData(id))` else parse DataJson — same gate as `GetDetailTyped:160-164`; DNN/Web/Umbraco leave store null → transparent DataJson fallback). Route order: **(1)** `SubmissionQueryService` GetDetail+ToListItem (central; also fixes AdminRecordShell) → fold GetDetailTyped into GetDetail as default; **(2)** Email/Webhook/Workflow (Workflow ALSO needs a typed WRITE — gate the DataJson write on `!SupportsDataJsonCollapse` or call `ReplaceFields`); **(3)** DataRepeater/FieldOptions (keep bounded-read caps, CLAUDE.md#11); **(4)** Blog/Starters. Add tests: collapsed sub + typed rows → reconstructed; store==null → DataJson fallback.

### P2 — Typed update/write sync  · verdict CONFIRMED · effort L · risk medium
Oqtane `EfRepositories.UpdateData:229-265` re-normalizes typed rows (gated on `SupportsDataJsonCollapse` + real DataJson, fail-soft). DNN/Web/Umbraco do NOT: `DNN/Data/FormRepository.cs:307-318` = `UPDATE dbo.MF_Submissions SET DataJson` only; `Umbraco/Data/EfRepositories.cs:125-134` + `Web/Data/DataLayer.cs:573` DataJson-only. `ISubmissionDataStore` has no `SetField/PatchFields` (`:32-34` only Insert/Replace/Delete). **Trap:** DNN admin-edit controller `MegaFormApiController.cs:2530-2535` calls **static `FormRepository.UpdateSubmissionData` directly, bypassing `_subRepo`** — a repo-only fix is skipped there. All `_subRepo.UpdateData` callers enumerated: SubmissionProcessor:408, WorkflowEngine:300/440, ConfiguredAppStarter:875, ExternalSubmissionRepository:210, Blog rollup:127, SDK:263, controllers (Oqtane:2633, DNN:2534-bypass, Umbraco SubmissionExtras:42, Web:884).
**First steps:** extract Oqtane's inline resync into a shared `TypedSubmissionResyncService.Resync(submissionId, formId, dataJson)` (schema-load → normalize → `ReplaceFields`, fail-soft), **decoupled from `SupportsDataJsonCollapse`** (resync whenever `typedStore!=null && dataJson!='{}'`) so parallel-write DNN stays fresh. Route the DNN controller through `_subRepo`/resync. Tests: after UpdateData, typed rows reflect new values; `'{}'` collapse-call does NOT wipe typed rows.

### P3 — Web + Umbraco typed storage parity  · verdict CONFIRMED · effort L · risk low
`Web/Data/DataLayer.cs` (DbSets `:25-48`, `ToTable MF_SubmissionValues :89`) and `Umbraco/Data/MegaFormDbContext.cs` (`:21-67`, `:108`) have NO typed DbSets. Neither `Web/Program.cs:33-122` nor `Umbraco/Composers/MegaFormComposer.cs:74-238` registers `ISubmissionDataStore` → `SubmissionProcessor.cs:391` gate `if(_typedStore!=null)` skips typed writes.
**First steps (parallel-write first, `SupportsDataJsonCollapse=false`):** add the 7 typed DbSets + `ToTable`/index config to both contexts (mirror `Oqtane/Data/MegaFormDbContext.cs:61-67,159-232`); create `Web/Data/EfSubmissionDataStore.cs` + `Umbraco/Data/EfSubmissionDataStore.cs` (mirror Oqtane's); register `AddScoped<ISubmissionDataStore, EfSubmissionDataStore>` in `Web/Program.cs` + `MegaFormComposer.cs`; create tables in schema bootstrap (`Web DatabaseSchemaBootstrapper` invoked `Program.cs:254`; Umbraco `MegaFormSchemaMigrationRunner` `MegaFormComposer.cs:231`; mirror `01060039_AddTypedSubmissionStorage.cs`). Submit on each host → confirm MF_SubmissionFields+value rows written while DataJson retained.

### P4 — Backfill wiring  · verdict CONFIRMED · effort L · risk medium
`LegacySubmissionBackfillService.cs:15,40` + Options/Result exist but callers are ONLY the tests (`TypedSubmissionStorageTests.cs:288,319`) — no host endpoint/job/DI. `ILegacySubmissionSource` has NO host impl (`GetBatch` throws `NotSupportedException` w/o FormId, `:107`). No `MigratedToTypedOnUtc` marker anywhere (idempotency is runtime-only `_store.HasFields`, `:63`). Distinct from existing `Reports/Backfill` (flat-index reindex of MF_SubmissionValues: Oqtane `Reports.cs:391`, DNN `ReportApiController.cs:426`, Web/Umbraco).
**⚠️ Trap:** on typed-primary Oqtane the submission DataJson is ALREADY `'{}'` → backfilling *from DataJson* yields nothing; the source must read pre-collapse/legacy rows (meaningful mainly for DNN/legacy where DataJson is populated).
**First steps:** admin-guarded `Reports/TypedBackfill` endpoint per host (name distinct from flat Backfill; `CanUseAdminPopup()` gate) constructing the service; single-form via `ISubmissionRepository.List(formId)`; all-forms needs an `ILegacySubmissionSource` impl; add a `MigratedToTypedOnUtc` column for persisted idempotency/audit. Run twice → 2nd = Skipped.

### P5 — Reports, search, filters, dashboards  · verdict CONFIRMED · effort L · risk medium
Report projections use the legacy flat **MF_SubmissionValues** (B55 index), NOT the typed value tables: DNN `ReportApiController.cs:388-390`, Web `ReportsController.cs:232`, Umbraco `ReportsController.cs:226`. Oqtane free-text search = `DataJson.Contains(term) OR SubmissionFields.DisplayValue.Contains(term)` (`EfRepositories.cs:188-190`; typed-value join flagged as Phase-4 TODO `:211-213`). Advanced filters client-side over the loaded page (`submission-advanced-filter.ts:8,721-740`); only Status + free-text reach the server.
**First steps:** add a Core typed-query abstraction (`QuerySubmissions(formId, TypedFilter[], status, from, to, page, pageSize)` over the sargable `(FormId,FieldKey,Value)` indexes on the 6 typed value tables); implement in Oqtane `EfRepositories.List` (keep the `countCap=10001` bounded count); switch the 3 report twins' SubmissionData projections to `MF_SubmissionFields.DisplayValue` (+ typed value joins for numeric/date), then retire the MF_SubmissionValues write (`SubmissionProcessor.cs:372-384`); push advanced filters server-side (extend List endpoint + `submission-advanced-filter.ts`).

### P6 — SDK Data/Fields contract  · verdict CONFIRMED · effort M · risk medium
`SubmissionDto.DataJson` (`Dtos.cs:118`), `SubmissionListItemDto.DataJson` (`:323`); `SubmitAsync`/`UpdateAsync` serialize dict→DataJson (`MegaFormClient.cs:206,249,263`); `ToDto` maps from DataJson (`:871`); `PublicAPI.Unshipped.txt:82-83,324-325` list only DataJson.
**Audit nuance:** `SubmissionDetailDto` ALREADY exposes typed `Values` + `FieldSnapshots` (`Dtos.cs:333-356`) — so the detail path is partly typed; the gap is on `SubmissionDto`/`SubmissionListItemDto`.
**First steps:** add `Data` (dict) + `Fields` (list of a new `SubmissionFieldDto` mirroring Core `SubmissionFieldRecord`, or reuse `SubmissionFieldSnapshotDto`) to `SubmissionDto`/`SubmissionListItemDto`; populate in `ToDto` by reading typed rows (so collapsed Oqtane subs surface values) with DataJson fallback; `[Obsolete]`-annotate DataJson (keep for compat + DNN); append new members to `PublicAPI.Unshipped.txt` (RS0016 else fails). Needs a typed reader dep wired into the SDK ctor + `AddMegaFormSdk` + 3 host DI.

### P7 — Schema versioning  · verdict CONFIRMED (from audit; not re-run this pass) · effort XL · risk medium
No `MF_FormSchemaVersions` / `MF_FormFields` / `MF_Submissions.FormSchemaVersionId` / stable form-field-id model exists. Typed field rows store label/type/page/order snapshots (`TypedSubmissionEntities.cs`) which help historical render but are not a versioning model. **First steps:** add schema-version model (`MF_FormSchemaVersions` + schema hash + current-version pointer on form); create a new version on publish when field structure changes; stamp submission with version at submit. Lower priority — do after P1–P6.

### P8 — Legacy cleanup (LAST phase only)  · verdict CONFIRMED (from audit) · effort M · risk high
Can be legacy after migration: `MF_Submissions.DataJson`, `MF_SubmissionValues`, `MF_WidgetData`, `MF_SearchIndex`. **Must NOT** be treated legacy: `MF_SavedDrafts.DataJson`, `MF_FormAnalytics.AggregatesJson`, workflow JSON columns. `MF_WidgetData`/`MF_SearchIndex` have no C# runtime refs but are still created by old DNN install scripts → do NOT drop blindly; add a guarded/reversible migration + release-note + data check. **Do NOT drop DataJson or MF_SubmissionValues yet** (convert reports/search to typed first, or add a compat view).

---

## Browser/SQL acceptance scenario (run Oqtane first, then DNN)
Reuse the harness proven this session (host-login is script-blocked → seed form via SQL clone + submit on the
public home module 36; CDP-node browser; see `QA_TYPED_STORAGE_WIDGET_ACCEPTANCE_2026-07-18.md`).
1. Form with: text, longtext, number/currency, date, datetime, checkbox/terms, **File + FileUpload alias**,
   DataRepeater/DataGrid/GridRepeater, QRCode display-only.
2. Submit via browser (not just unit tests).
3. SQL: Oqtane `DataJson='{}'`; DNN full `DataJson` (until read bridge); one `MF_SubmissionFields` row per
   input field; display-only widgets create NO typed value rows; typed values in the right table; File/FileUpload
   → `MF_Files`.
4. UI/API: public form, dashboard list, submission detail, inbox detail, report/export, workflow actions all show
   real values with collapsed DataJson.
5. Package: generated DNN zip includes the typed script; fresh DNN install creates typed tables; Oqtane
   package/Core/Server DLLs in phase (run `tools/validate-pack.ps1`).

## Do NOT claim "done no-DataJson" until
- Web + Umbraco typed OR explicitly out-of-scope (P3).
- Core default read facade is typed-first (P1).
- DNN fresh install verified from the actual generated zip (P0).
- Updates/workflows/admin edits keep typed rows synced (P2).
- Reports/search/filters no longer require `MF_SubmissionValues` (P5).
- SDK exposes `Data`/`Fields` (P6).
- Backfill wired + verified (P4).
- Package DLL/version drift guard passes (Oqtane `validate-pack.ps1` ✅; DNN version single-source ✅; DNN zip content verify ⬜).

## Environment (for the acceptance harness)
- Oqtane :5126 = `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805`, DB `Oqtane_MegaForm_Fresh1805` @ `localhost\SQLEXPRESS` (SSPI). Home = Module 36 (`Setting` EntityName='Module' SettingName `MegaForm:FormId`). Deploy = hot-swap `MegaForm.Core.dll` + `MegaForm.Oqtane.Server.Oqtane.dll` into site root + `megaform-renderer.js` into `wwwroot/Modules/MegaForm/js/`; stop `Oqtane.Server.exe` → copy → relaunch `--urls http://localhost:5126`.
- DNN = IIS site `DNN10322_MegaClean` (`E:\DNN_SITES\DNN10322_MegaClean\Website`, DB `DNN10322_MegaClean`), host `dnn10322_megaclean.ai` (cold-start ~2min; warm with ~5 requests). Deployed MegaForm.Core.dll currently 12:00AM (prior twin, no B1).
- Host login script-BLOCKED (antiforgery) → seed forms via SQL, submit public (AllowAnonymous). No-options `Checkbox` renders empty (use `required:false`). Browser = CDP-node (`--remote-debugging-port`); no MCP browser tool this session.
- ⚠️ DNN `MegaFormApiController.cs` carries uncommitted **NamedConnections** (Codex) — the B1 DNN `IsFileLike` hunk at `:3224` is applied but NOT committed; commit it separately after reviewing NamedConnections.
