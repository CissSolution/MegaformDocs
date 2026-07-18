# QA — Typed Storage Widget Semantics: Browser + SQL Acceptance (2026-07-18)

Executes the acceptance requested in `Docs/REQUEST_CLAUDE_NEXT_TYPED_STORAGE_WIDGET_SEMANTICS_ACCEPTANCE_2026-07-18.md`.
Prior fix handoff: `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md`.

## Verdict

**Typed SQL parity = PARTIAL PASS (live-proven for the shipped fixes; not "done no-DataJson").**
The three widget-semantics fixes are now proven end-to-end on a REAL browser submit against Oqtane :5126 with SQL confirmation — not just unit tests. Remaining widget parity (FileUpload alias end-to-end, DNN smoke) is blocked/deferred with documented reasons. Do **not** push/release. Status stays: *Round 2 pilot + widget-semantics fix, live-verified on Oqtane*.

## Environment

- Site: `http://localhost:5126/` — Oqtane 10.1.0, `Oqtane.MegaForm.Fresh1805`, MSSQL DB `Oqtane_MegaForm_Fresh1805` on `localhost\SQLEXPRESS`.
- **Deploy of the fix:** rebuilt `MegaForm.Core.dll` (Release, all 4 TFMs) and hot-swapped it into the site root (asm version unchanged `1.5.0.0`, so `MegaForm.Oqtane.Server.dll` binds unchanged — only Core changed). Backup kept at `MegaForm.Core.dll.bak_preWidgetSemantics`. Site restarted, confirmed 200. Deployed Core.dll timestamp = the widget-fix build.
- Browser automation: headless Chrome via raw CDP (Node 24, `--remote-debugging-port=9333`). Playwright/chrome-devtools MCP tools were not available this session.

## Test form (Form 7 "ZZ Widget Acceptance")

Host-login is script-blocked (Oqtane antiforgery), so the form was **seeded via SQL** (cloned Form 6, replaced SchemaJson) and the home-page MegaForm module (Module 36) was rebound to it; site restarted to bust cache. Fields: `full_name` Text, `resume` File, `hire_date` Date, `score` Number, `consent` Checkbox, `leaderboard` DataRepeater, `ticket_qr` QRCode, `line_items` DataGrid. Submitted via real browser at `http://localhost:5126/` (public, AllowAnonymous). **Home page was restored to Form 1 afterwards.** Form 7 + submission 54 remain in the DB as evidence.

Submit path exercised (network-captured, all HTTP 200): `POST /api/MegaForm/Upload/File` (file), `POST /api/MegaForm/Submit/Post` (submission). Display-only widgets hydrated cleanly (DataRepeater even queried `/api/MegaForm/DataRepeater/Query` → 200).

## Evidence — SubmissionId 54 (Form 7)

`MF_Submissions.DataJson` = **`{}`** (Oqtane typed-primary collapse; data reconstructs from typed rows).

`MF_SubmissionFields` (per-field rows written):

| FieldKey | FieldType | DataType | Value / DisplayValue | HasValue |
| --- | --- | --- | --- | --- |
| full_name | Text | string | Acceptance Bot | 1 |
| resume | File | json | `[{"fileId":0,"fileName":"acceptance-resume.pdf",...}]` | 1 |
| hire_date | Date | date | 2026-08-15 | 1 |
| score | Number | number | 88.5 | 1 |
| consent | Checkbox | boolean | (empty) | 0 |
| line_items | DataGrid | json | `[{"sku":"A1","qty":2},{"sku":"B2","qty":5}]` | 1 |
| **leaderboard (DataRepeater)** | — | — | **NO ROW** | — |
| **ticket_qr (QRCode)** | — | — | **NO ROW** | — |

Typed value tables for sub 54:
- `MF_SubmissionValueString`: full_name = "Acceptance Bot"
- `MF_SubmissionValueNumber`: score = 88.500000
- `MF_SubmissionValueDate`: hire_date = 2026-08-15
- `MF_SubmissionValueJson`: resume = file metadata; line_items = `[{"sku":"A1","qty":2},{"sku":"B2","qty":5}]`
- `MF_SubmissionValueJson` literal `'null'` rows for sub 54 = **0**
- `MF_Files`: **1 row** → SubmissionId 54, FieldKey `resume`, OriginalName `acceptance-resume.pdf`, StoredPath `form-7/field-resume/…​.pdf`, ContentType `application/pdf`, FileSizeBytes 74 (was 0 rows across the whole DB before this test).

## What this proves (live, end-to-end)

1. **File → MF_Files (headline).** A real browser file upload produced exactly one `MF_Files` row via the extractor (now routed through `SubmissionFieldTypeSemantics.IsFileLike`). Was 0 rows in the DB; now 1.
2. **Display-only skip.** `DataRepeater` + `QRCode` submitted no value → **no `MF_SubmissionFields` rows and no value rows** (the `raw == null` skip). Dashboard/detail are not polluted.
3. **JSON list shape + no "null".** `line_items` (DataGrid) round-tripped as a 2-row array `[{...},{...}]` — no `System.Collections...ToString()` corruption; empty `consent` wrote no value row; **0 literal `"null"` json rows**.
Plus: DataJson collapsed to `{}`, and Date/Number/String landed in their typed tables.

## Gaps / not-done (with reasons)

- **`FileUpload` ALIAS end-to-end is NOT browser-provable yet — it is blocked at RENDER.** `FormHtmlRenderer.cs` renders `case "File":` (`.mf-file-dropzone`) but has **no `FileUpload` case** and excludes it from the native-types whitelist (`FormHtmlRenderer.cs:48-52, 637`); the TS renderers likewise don't canonicalize. So a `FileUpload`-typed field (emitted by `ProposalStarterService.cs:920`) renders as a plain input and can't be uploaded in a browser. My Core extractor fix is **necessary but not sufficient** for the alias — the renderers must also `Canonicalize(FileUpload→File)`. The extractor's alias handling is unit-proven (`SubmissionFileMetaExtractorTests.FileUpload_alias_is_treated_as_file_field`); the browser path was proven via canonical `File`. **Fix = the renderer canonicalization in the registry-widening plan below.**
- **DNN smoke: BLOCKED.** `http://dnn10322_megaclean.ai/` timed out (resolves to local IIS `127.0.0.1`; site not warmed/running). DNN is a parallel-write twin using the same shared Core normalizer/extractor, so the fixes flow into it in code, but this session could not live-verify. Re-run when the DNN site is up.
- **Single-row grid shape:** see Option B below — documented + pin-tested, not a silent comment.

## Single-row CLR-list limitation — Option B implemented

A genuine CLR `List` with exactly one complex row reconstructs as a `JObject` (not `JArray`) because `SubmissionDataReconstructor.CollapseJson` treats count==1 as scalar. The **browser path is unaffected at any row count** (client sends a stringified array = one JSON string → `JArray`), proven live by `line_items`. Per the owner's "handle OR clearly document" instruction and the verified analysis, Option B was implemented (near-zero blast radius):
- `TypedSubmissionStorageTests.ExtractTypedValues_JsonStringifiedArray_SingleRow_RoundTripsToJArray` — positive proof the browser single-row case is a `JArray`.
- `TypedSubmissionStorageTests.ExtractTypedValues_JsonListOfObjects_SingleRow_KnownLimitation_ReconstructsAsJObject` — executable spec pinning the CLR-single-row `JObject` (value survives, only shape degrades).
- Robust fix (deferred, designed): a **persisted `MF_SubmissionFields.IsCollection`** column threaded through the EF model + Oqtane migration + DNN SqlDataProvider + both stores + reconstructor, to ship with the typed-read reader-switch. Correction from adversarial verify: on Oqtane the reconstructor already runs on the live read path (`HydrateDataJson`, `GetDetailTyped`, Reports) so this is **not** latent-until-reader-switch — it is only unreachable while no genuine CLR single-element list hits the normalizer (browser never does).

## Files changed this session

- `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs` — +2 single-row proof tests; updated the limitation NOTE to reference them. **119/119 tests pass**, Core Release build clean on net472/net8/net9/net10.
- (Fix files from the prior handoff remain: `SubmissionFieldTypeSemantics.cs`, `SubmissionFieldNormalizer.cs`, `SubmissionFileMetaExtractor.cs`, + tests. All uncommitted on `feature/typed-submission-storage-core`.)
- DB (evidence, kept): Form 7 + submission 54 on :5126. Home page rebound back to Form 1.

## Next steps (verified design plans ready — see handoff)

1. **Registry widening (task 3)** incl. the renderer `FileUpload→File` canonicalization (Core `FormHtmlRenderer` + TS renderer parity + a `field-type-semantics.ts` TS twin), plus new helpers (`IsDataCarrying/IsStructuredJson/IsConsentLike/IsExternalDataDisplay/CanonicalDataTypeFor`) and fixing live drifts (PhonePro/PhoneNumberPro→String vs PhoneIntl→Json; TermsPrivacy vs terms). Routes ~8 hard-coded type lists through the one registry.
2. **R3-J packaging guard** (highest release risk): clean-build pack, single-source version, post-pack nupkg validator, runtime diagnostics endpoint. Do before any package/push.
3. DNN smoke when the site is up; then R3-A/B/C/D/E per Round 3.
