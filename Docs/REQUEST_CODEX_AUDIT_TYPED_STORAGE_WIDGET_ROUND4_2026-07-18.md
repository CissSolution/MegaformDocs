# Request Codex Audit - Typed Storage Widget Semantics + Browser Acceptance (Round 4)

Date: 2026-07-18
Author: Claude (sau khi thuc thi acceptance theo REQUEST_CLAUDE_NEXT_...)
Scope: tong ket DA LAM / CON PHAI LAM + yeu cau Codex audit source.

## Related docs
- `CLAUDE_HANDOFF_20260718_TYPED_STORAGE_WIDGET_SEMANTICS_FIX.md` (fix + acceptance summary)
- `Docs/QA_TYPED_STORAGE_WIDGET_ACCEPTANCE_2026-07-18.md` (browser + SQL evidence, sub 54)
- `Docs/DESIGN_TYPED_STORAGE_PHASE3_PLANS_2026-07-18.json` (design plans: registry-widening, single-row, R3-J; da adversarial-verify)
- `Docs/AUDIT_TYPED_STORAGE_WIDGET_COVERAGE_2026-07-18.md` (audit goc cua Codex)
- `Docs/AUDIT_CODEX_ROUND3_TYPED_STORAGE_REMAINING_2026-07-18.md` (R3 P0 list)

## Status stamp (giu nguyen, dung stamp "done no-DataJson")
> Round 2 Oqtane primary + DNN parallel-write twin + WIDGET-SEMANTICS FIX (live-verified Oqtane). Chua push/release.

---

## PHAN A - DA LAM (source Codex audit duoc)

### A1. Core field-type semantics (single source) - MOI
- File moi `MegaForm.Core/Services/TypedSubmission/SubmissionFieldTypeSemantics.cs`: `Canonicalize` (FileUpload->File, DateTimePicker->Date), `IsDisplayOnly` (DataRepeater, QRCode), `IsFileLike` (File, FileUpload, PdfForm).
- **Audit:** class co dung la single-source khong; seed set co dung/du khong.

### A2. Normalizer (4 edit) - `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs`
1. `ResolveDataType`: `Canonicalize(field.Type)` truoc switch (alias khong con roi JSON default vi sai spelling).
2. `Normalize` loop: skip display-only **CHI khi `raw == null`** (chong silent data-loss).
3. `ExtractTypedValues` Json branch: field rong -> KHONG ghi row (bo forced `"null"`).
4. `SplitRawValue`: helper `StringifyItem` - item complex serialize JSON, primitive giu invariant string (het corruption `.ToString()` -> `System.Collections.Dictionary...`).
- **Audit:** 4 edit co dung/an toan khong; guard `raw==null` co bo sot case nao khong (vd raw = "" empty string thi KHONG skip -> co tao field row rong? xac nhan hanh vi mong muon).

### A3. File extractor - `MegaForm.Core/Services/SubmissionFileMetaExtractor.cs`
- Thay set private `{File,PdfForm}` bang `SubmissionFieldTypeSemantics.IsFileLike` -> `FileUpload` gio tao MF_Files row.
- **Audit:** co con cho nao hard-code file-type list khac khong.

### A4. Tests - 119/119 pass, Core Release clean 4 TFM (net472/net8/net9/net10)
- `MegaForm.Sdk.Tests/SubmissionFieldTypeSemanticsTests.cs` (MOI).
- `MegaForm.Sdk.Tests/SubmissionFileMetaExtractorTests.cs`: `FileUpload_alias_is_treated_as_file_field`.
- `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs`: InlineData FileUpload/DateTimePicker; display-only skip (2 chieu); empty-json no-null; list-of-objects serialize + round-trip; **+2 single-row (Option B)**: `ExtractTypedValues_JsonStringifiedArray_SingleRow_RoundTripsToJArray`, `ExtractTypedValues_JsonListOfObjects_SingleRow_KnownLimitation_ReconstructsAsJObject`.
- **Audit:** test co dung assert; co widget nao con thieu test truoc khi bo DataJson (doi chieu R3-I list).

### A5. Deploy + BROWSER/SQL acceptance (runtime evidence, KHONG source-auditable)
- Deploy widget-fix Core.dll len :5126 (hot-swap, asm 1.5.0.0 unchanged -> Server binds; backup `MegaForm.Core.dll.bak_preWidgetSemantics`).
- Seed Form 7 (clone Form 6 + widget schema), bind home module 36, submit THAT bang CDP headless browser. Home restore ve Form 1.
- **Sub 54 (Form 7), 3 fix PROVEN live:** DataJson=`{}`; `resume`->MF_Files 1 row (truoc 0); `line_items` DataGrid->`[{"sku":"A1","qty":2},{"sku":"B2","qty":5}]` (array giu); `leaderboard`(DataRepeater)+`ticket_qr`(QRCode)->KHONG field row; 0 literal `"null"` json; date/number/string vao typed tables. Chi tiet: `Docs/QA_TYPED_STORAGE_WIDGET_ACCEPTANCE_2026-07-18.md`.
- **Codex khong verify DB duoc** (source-only). Codex verify = code A1-A4 co san sinh ra hanh vi nay khong (logic trace).

### A6. Single-row limitation = Option B (documented, khong phai comment-only)
- 2 test tren (A4) pin: browser stringified 1-row -> JArray (safe); CLR 1-row -> JObject (value song, shape mat).
- **Audit correction da ghi nhan:** tren Oqtane KHONG latent-until-reader-switch (reconstructor chay live qua `EfRepositories.HydrateDataJson` Get/List, `SubmissionQueryService.GetDetailTyped`, `MegaFormController.Reports.ResolveSubmissionData`). Chi chua reachable vi chua co path nao day genuine CLR single-list vao normalizer (browser gui string).

---

## PHAN B - CON PHAI LAM (uu tien)

### B1. [P0-unblock] Renderer canonicalize FileUpload->File (task 3 phan quan trong nhat)
- LY DO: `MegaForm.Core/Services/FormHtmlRenderer.cs` co `case "File"` (~:637) + NativeTypes whitelist (~:48-52) NHUNG khong co `FileUpload` -> field `FileUpload` (emit boi `ProposalStarterService.cs:920`) render thanh input thuong, KHONG upload duoc qua browser. Extractor fix (A3) can NHUNG chua du.
- VIEC: Canonicalize truoc NativeTypes lookup + switch trong FormHtmlRenderer; PARITY o TS renderer (tao `field-type-semantics.ts` twin) + rebuild JS -> 4 wwwroot; test lai bang browser (proposal form co FileUpload).
- **Audit:** xac nhan day la cach dung; kiem tra con renderer/collect nao khac (TS `interactive.ts` `bindFileUploads`, SSR default widget-host branch).

### B2. [P1] Registry widening day du (task 3)
- Route ~8 hard-coded type list qua `SubmissionFieldTypeSemantics`: FormHtmlRenderer whitelist+switch, `ResolveDataType`, DNN `AiToolsController` IsLayoutOrSkippableType+MapFormTypeToSql, 3 TS skip-set (ai-form-creator.ts, ops-app-batch.ts, toolbar.ts), 2 TS renderer.
- Them helper: `IsDataCarrying`, `IsStructuredJson`, `IsConsentLike`, `IsExternalDataDisplay`, `CanonicalDataTypeFor`.
- Fix DRIFT LIVE (Codex verify): `phonenumberpro`/`phonepro` -> String vs `phoneintl` -> Json (cung 1 widget, nen canonicalize ca 3); `TermsPrivacy` (default->Json) vs `terms` (->Boolean); DataGrid/GridRepeater = data-carrying JSON (KHONG display-only).
- Chi tiet + file:line: `Docs/DESIGN_TYPED_STORAGE_PHASE3_PLANS_2026-07-18.json` key `registry-widening`.

### B3. [P0-release] R3-J packaging guard (cao nhat truoc khi push)
- 5-way version drift: nuspec 1.7.107 / ModuleInfo 1.7.108 / Server+Client 1.7.15 / Package 1.7.22 / Core 1.5.0.
- `release.cmd` pack KHONG build (ship stale DLL); `pack.cmd` incremental (khong clean), thieu net10 Core copy.
- VIEC: clean-build pack + single-source version + post-pack nupkg validator (MetadataLoadContext) + runtime diagnostics endpoint.
- **CORRECTION QUAN TRONG (dung tin narrative cu):** co che "new Server goi member Core cu thieu -> MissingMethodException nuot" la SAI. SubmissionProcessor (caller) + ISubmissionDataStore (member) CUNG o Core.dll -> stale-Core = stale-SubmissionProcessor khong co code collapse (khong throw, DataJson giu). Seam that = Server's EfSubmissionDataStore implement Core interface -> **new-Core + stale-Server = TypeLoadException luc DI construct = 500 CUNG, khong nuot**. Diagnostics sketch trong design co 2 loi compile (Server khong ref Client; `doc.Values` -> `doc.Data`).
- Chi tiet: `DESIGN_...PHASE3_PLANS...json` key `r3j-packaging-guard`.

### B4. [P1-deferred] Single-row robust fix (Option A1) tai reader-switch milestone
- Persisted column `MF_SubmissionFields.IsCollection` xuyen EF model + Oqtane migration + DNN SqlDataProvider (script versioned MOI, khong sua 01.06.39) + 2 store + reconstructor. Lam CUNG luc reader-switch (dung mo schema mid-phase).
- Fallback zero-migration = Option A2 (reconstructor doc persisted `FieldType`) neu owner muon fix ngay - fragile (File single-object legit JObject).

### B5. [env-blocked] DNN smoke
- `dnn10322_megaclean.ai` DOWN (timeout, 127.0.0.1 IIS). DNN = parallel-write twin dung chung Core normalizer/extractor (fix chay trong code) nhung chua live-verify. Chay lai khi site len: submit FileUpload/proposal form, verify typed rows + MF_Files, verify DataRepeater/QRCode khong tao "null" json.

### B6. Round 3 P0 con lai (sau B1/B3), dependency-first
1. R3-J (B3 tren).
2. R3-A Umbraco/Web: them typed store HOAC mark legacy-only (`SupportsDataJsonCollapse=false`).
3. R3-B: Core reader facade + thay direct `_subRepo.Insert` bypass (`WorkflowEngine.cs:386-402`, `ConfiguredAppStarterService.cs:773-787`).
4. R3-C typed SetField/UpdateFields + workflow sync moi host.
5. R3-D SDK Data/Fields facade (bo DataJson-centric DTO).
6. R3-E backfill wiring + migrated marker.

### B7. Commit
- Toan bo nhanh `feature/typed-submission-storage-core` UNCOMMITTED. Neu commit: NHO add 2 file untracked `SubmissionFieldTypeSemantics.cs` + `SubmissionFieldTypeSemanticsTests.cs` (`git diff --name-only` khong hien).

---

## PHAN C - YEU CAU AUDIT CHO CODEX

1. **Correctness cua fix A2/A3:** trace lai 4 edit normalizer + extractor. Dac biet: (a) guard `raw==null` skip display-only co bo sot/qua tay khong; (b) `StringifyItem` co xu ly het cac kieu (enum, DateTimeOffset, Guid, nested JToken) khong; (c) bo forced `"null"` co lam field key BIEN MAT khoi reconstructed dict theo cach nao pha consumer khong.
2. **Regression:** co consumer nao dua vao "null" json row cu, hoac dua vao display-only field row (leaderboard/QRCode) co mat khong.
3. **Acceptance claim vs code:** logic A1-A4 co that su san sinh ket qua sub 54 (Codex trace, khong can DB).
4. **Registry widening (B2):** re-scan TOAN BO codebase tim hard-coded field-type list con sot (ngoai ~8 cai da liet), va xac nhan cac classification drift (PhoneIntl, TermsPrivacy, DataGrid/GridRepeater) la that.
5. **R3-J correction (B3):** re-verify co che DLL-mismatch (TypeLoadException vs MissingMethodException) tren source that; verify 5-way version drift file:line; verify diagnostics sketch compile-ability.
6. **Single-row (A6/B4):** xac nhan tren Oqtane bug reachable qua nhung read path nao; xac nhan browser path (stringified array) an toan moi row count.
7. **Definition of done phase tiep:** liet ke tieu chi de stamp "widget parity dat" (goi y: B1 done + FileUpload browser proof + DNN smoke pass + B2 xong hoac ghi ro con lai).

## Ghi chu moi truong (cho ai chay lai acceptance)
- Site :5126 = `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1805`, DB `Oqtane_MegaForm_Fresh1805` @ `localhost\SQLEXPRESS` (SSPI). Home page (path rong) = Module 36.
- Oqtane host login script-BLOCKED (antiforgery) -> seed form qua SQL + submit public (`/api/MegaForm/Submit/Post` AllowAnonymous). Binding form<->module qua bang `Setting` (EntityName='Module', SettingName `MegaForm:FormId`), KHONG phai MF_ModuleViewConfig (bang do khong ton tai site nay).
- Checkbox khong options -> render empty option-group (khong co input) -> required se chan submit. Dung `required:false` hoac them options.
- Browser automation: khong co MCP browser tool phien nay -> CDP node thuan (Chrome `--remote-debugging-port`).
