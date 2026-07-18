# HANDOFF — Typed Submission Storage **Phase 1 (Oqtane pilot) SHIPPED + QA PASS**

Date: 2026-07-17
Branch: `feature/typed-submission-storage-core` (⚠️ **NOT committed** — see §6)
Builds on: Kimi's Core foundation (`8ef0ae1`) — audited & verified (88→**91 tests pass**).

## 1. What this session did
Continued Kimi's typed-storage Core foundation and delivered **Phase 1 for Oqtane** end-to-end:
schema + `ISubmissionDataStore` impl + DI + parallel-write wiring + deploy + **Visual QA on live :5126**.

**Strategy = parallel-write (additive).** New submissions now write `MF_SubmissionFields` + 6 typed
value tables **in parallel with** the legacy `MF_Submissions.DataJson`. Readers still use DataJson —
Phase 1 is write-only, so a typed-store failure is **fail-soft** (never breaks a submission).

## 2. Files changed (this session)
**Core (shared, all TFMs build clean net472/8/9/10):**
- `MegaForm.Core/Services/SubmissionProcessor.cs` — optional ctor param `ISubmissionDataStore typedStore = null`
  + `SubmissionFieldNormalizer` field; after the reporting-indexer block, a fail-soft
  `_typedStore.ReplaceFields(submissionId, formId, Normalize(...))` block.
- `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs` — **BUGFIX**: `ResolveDataType`
  for `Checkbox` now branches on options — checkbox **group** (has options) → `String` (multi-value);
  single toggle (no options) → `Boolean`. Previously ALL checkboxes → Boolean, which ran selected
  values (e.g. `["analytics"]`) through `ToBoolean` → `false` → **silent data loss** in the typed path.
- `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs` — +3 tests (checkbox group→string, single→bool,
  multi-value round-trip). **91/91 pass.**

**Oqtane (net10 site):**
- `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs` — +7 DbSets + inline mappings
  (`HasMaxLength`/`HasIndex`/`HasPrecision(18,6)`). **This is the source of truth on Oqtane** —
  schema is built from the EF model via `GenerateCreateScript` (see MegaFormManager), NOT migration Up().
- `MegaForm.Oqtane.Server/Data/EfSubmissionDataStore.cs` — **NEW** `ISubmissionDataStore` impl
  (`IDbContextFactory` pattern; `ReplaceFields` = delete-then-insert in a transaction; 2-SaveChanges
  insert to fill identity ids; bulk-read GetData avoids N+1; computes `HasValue`).
- `MegaForm.Oqtane.Server/Migrations/01060039_AddTypedSubmissionStorage.cs` — **NEW** migration
  (7 CreateTable + FKs + indexes). **DNN/EF-parity only — Up() never runs on Oqtane.**
- `MegaForm.Oqtane.Server/Services/Startup.cs` — `AddScoped<ISubmissionDataStore, EfSubmissionDataStore>()`.
- `MegaForm.Oqtane.Client/ModuleInfo.cs` — Version `1.7.107`→**`1.7.108`** + appended ReleaseVersions.

## 3. Target schema created (SQL Server, verified live)
`MF_SubmissionFields` (bigint id, FieldKey/FieldType/DataType/LabelSnapshot/DisplayValue/HasValue/
PageIndex/FieldOrder + 4 indexes) and 6 value tables `MF_SubmissionValue{String,LongText,Number,Date,
Boolean,Json}` (bigint id, denormalized SubmissionId/FormId/FieldKey + Ordinal + typed Value;
Number=decimal(18,6); indexes per §13.7). **NOT one table per form** — shared across all forms.

## 4. Deploy (done)
Site `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805` (:5126, **SQL Server** `Oqtane_MegaForm_Fresh1805`).
Hot-swap 3 net10 DLLs at site root (`MegaForm.Core.dll`, `MegaForm.Oqtane.Server.Oqtane.dll`,
`MegaForm.Oqtane.Client.Oqtane.dll`) → `Oqtane.Server.exe --urls http://localhost:5126` → on version-bump
upgrade, `MegaFormManager.InstallSchemaFromModel` created all **7 tables + indexes** (verified via
`sys.tables`/`sys.columns`/`sys.indexes`). Backup at `<site>\_bak_preTyped_1.7.108`.

## 5. Visual QA result — PASS (form 1 "abc", :5126)
- Public submit `POST /api/MegaForm/Submit/Post` → `{success:true, submissionId:1}` + success message.
- `MF_SubmissionFields`: 11 rows, correct DataType routing + DisplayValue label mapping
  (`pro`→"Pro", `app`→"Authenticator app").
- Typed counts: **String 10** (7 single + interests 3 multi-value w/ Ordinal 0/1/2 = analytics/
  automation/security → **checkbox-group fix proven live**), LongText 1 (notes), Date 1 (parsed),
  Json 1 (cards), Boolean 0, Number 0.
- **Sargable query works**: `JOIN MF_SubmissionValueString WHERE FieldKey='plan' AND Value='pro'` → row.
- `MF_Submissions.DataJson` still written (parallel-write intact). Form renders correctly (screenshot).

## 6. ⚠️ NOT committed
All changes are uncommitted on `feature/typed-submission-storage-core` (owner controls commits).
Live :5126 runs the built DLLs. To commit: the 6 files in §2 (+ this handoff).

## 7. Next (Phase 1 for other hosts + Phase 2+)
- **Umbraco / DNN / Web** twins: entity/migration + `ISubmissionDataStore` impl + DI + (Core wiring is
  already shared via SubmissionProcessor — they just need to register a store).
- **Phase 2 backfill**: register a platform `ILegacySubmissionSource`; run `LegacySubmissionBackfillService`.
- **Phase 4 reader switch** (deferred, has a known trap): `ExtractTypedValues` for Number/Date **silently
  drops** unparseable values (no row written) — must add a String/Json fallback BEFORE switching readers,
  else reconstruct returns null for those fields. Fine for Phase 1 (DataJson is source of truth).
- Consider `SchemaVersion`/`FormFieldId` population on the field record; tighten `(SubmissionId,FieldKey)`
  index to unique once real data validates no dup keys (currently intentionally non-unique for safety).
