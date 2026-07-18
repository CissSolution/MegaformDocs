# CLAUDE HANDOFF — Typed Storage Widget Semantics Fix (2026-07-18)

Nhánh: `feature/typed-submission-storage-core` (CHƯA commit — cùng nhánh với toàn bộ typed-storage work).
Tiếp nối audit: [`Docs/AUDIT_TYPED_STORAGE_WIDGET_COVERAGE_2026-07-18.md`](Docs/AUDIT_TYPED_STORAGE_WIDGET_COVERAGE_2026-07-18.md).

## Bối cảnh
Audit (Codex, audit-only) liệt kê gap widget parity giữa typed-storage và DataJson cũ. Tôi **đối chiếu từng claim với code thật** trước khi sửa (rule CLAUDE.md: verify-before-trust guide). Kết quả: tách LIVE vs THEORETICAL, rồi fix đúng 3 gap LIVE bằng 1 lớp Core semantics dùng chung (scope tối thiểu, owner đã chọn).

## Ground-truth: LIVE vs THEORETICAL
| Gap | Trạng thái | Bằng chứng |
| --- | --- | --- |
| `FileUpload` → mất `MF_Files` | 🔴 LIVE | `ProposalStarterService.cs:920` emit `Type="FileUpload"`; extractor cũ chỉ whitelist `{File,PdfForm}`. AI/builder cũng nhận alias (`ai-form-creator.ts:2123`, `canvas.ts:1210`). Canonical plugin thật = `File`. |
| Display-only widget tạo row rác | 🔴 LIVE | `Normalize()` emit write cho MỌI field non-layout; `IsNonDataField` chỉ skip Html/Section/Captcha/Row → `DataRepeater`/`QRCode` lọt qua → field row + JSON `"null"`. |
| `SplitRawValue` bóp méo CLR `List<Dictionary>` | 🔴 LIVE (path server) | `item.ToString()` → `"System.Collections.Generic.Dictionary`2..."`. Happy-path client OK (renderer stringify JSON). |
| `DateTimePicker` alias | 🟡 THEORETICAL | **0 hit** trong `.cs`/`.ts`. Canonical = `Date`+`datePickerMode`. Chỉ thêm guard. |
| `TermsPrivacy` contract | 🟡 THEORETICAL | Là plugin thật nhưng đã rơi `Json` qua default → KHÔNG mất dữ liệu. Nice-to-have. |

## Đã làm (code)
**File mới:** `MegaForm.Core/Services/TypedSubmission/SubmissionFieldTypeSemantics.cs`
Single source of truth: `Canonicalize()` (FileUpload→File, DateTimePicker→Date), `IsDisplayOnly()` (DataRepeater, QRCode), `IsFileLike()` (File, FileUpload, PdfForm).

**`SubmissionFieldNormalizer.cs`** (4 edit):
1. `ResolveDataType` canonicalize type trước switch (alias không còn rơi JSON default vì sai spelling).
2. `Normalize` loop skip display-only **CHỈ khi `raw == null`** (chống silent data-loss nếu contract widget đổi).
3. `ExtractTypedValues` Json branch: field rỗng → KHÔNG ghi row (bỏ forced `"null"`; symmetric với scalar; hết garbage `"null"` khi reconstruct).
4. `SplitRawValue`: thêm helper `StringifyItem` — item complex → JSON compact, primitive → invariant string. Hết corruption `.ToString()` type-name.

**`SubmissionFileMetaExtractor.cs`:** bỏ set private `{File,PdfForm}`, dùng `SubmissionFieldTypeSemantics.IsFileLike` → `FileUpload` giờ tạo `MF_Files` row.

**Lan toả 2 nền tự động:** normalizer/extractor ở Core → Oqtane (`EfSubmissionDataStore`) + DNN (`DnnSubmissionDataStore`) dùng chung, không cần sửa riêng.

## Test
`MegaForm.Sdk.Tests`: **117/117 pass** (thêm 8 test).
- `SubmissionFieldTypeSemanticsTests.cs` (mới): canonicalize/isDisplayOnly/isFileLike.
- `TypedSubmissionStorageTests.cs`: +InlineData `FileUpload→json`,`DateTimePicker→date`; display-only skip (no-value skip + with-value NOT dropped); empty-json no-null-row; list-of-objects serialize-as-JSON + round-trip JArray.
- `SubmissionFileMetaExtractorTests.cs`: `FileUpload_alias_is_treated_as_file_field`.

Build: `MegaForm.Core` Release **clean cả 4 TFM** (net472/net8/net9/net10). Không đổi public signature → downstream source-compatible.

## ⚠️ Known limitation (out-of-scope, đã ghi comment test)
CLR list **1 phần tử** collapse thành JObject (không phải JArray) khi reconstruct — do `SubmissionDataReconstructor.CollapseJson` coi count==1 là scalar. Happy-path KHÔNG dính (client gửi stringified array = 1 JSON row → round-trip JArray đúng mọi count). Fix triệt để = track "was-collection" qua typed rows → thuộc scope full-registry, chưa làm.

## Next steps (đề xuất)
1. **Browser-QA acceptance** theo mandate audit (§"Ban giao"): tạo Form A/B/C trên :5126 (+DNN), submit thật, đối chiếu SQL typed tables + `MF_Files`. Đặc biệt dựng 1 **proposal form** (ProposalStarter → có field `FileUpload`) để chứng minh MF_Files giờ có row. **Chưa chạy** (owner chọn code-fix trước).
2. Cân nhắc sửa `ProposalStarterService` emit `File` thay `FileUpload` (fix tại nguồn) — hoặc giữ alias vì semantics đã cover.
3. Full-registry (scope 2): renderer/dashboard/SDK/AI validation cùng đọc `SubmissionFieldTypeSemantics`; single-element-array collapse; TermsPrivacy explicit contract.
4. Backlog cũ vẫn treo: Umbraco/Web twin, reader-switch off DataJson, typed update API, SDK Data/Fields DTO (xem `project_20260717_typed_storage_phase1_oqtane`).

## ✅ BROWSER + SQL ACCEPTANCE DONE (2026-07-18) — `Docs/QA_TYPED_STORAGE_WIDGET_ACCEPTANCE_2026-07-18.md`

Deployed the fix Core.dll lên :5126 (hot-swap, asm 1.5.0.0 unchanged → Server binds; backup `MegaForm.Core.dll.bak_preWidgetSemantics`). Seed Form 7 "ZZ Widget Acceptance" (clone Form 6 + widget schema) bound vào home module 36, submit THẬT bằng browser (CDP headless, `POST /api/MegaForm/Upload/File` + `Submit/Post` = 200). Home ĐÃ restore về Form 1; Form 7 + sub 54 giữ làm evidence.

**Sub 54 (Form 7) — 3 fix PROVEN live:** DataJson=`{}`; `resume`→**MF_Files 1 row** (trước 0); `line_items` DataGrid→`[{"sku":"A1","qty":2},{"sku":"B2","qty":5}]` (array shape giữ); `leaderboard`(DataRepeater)+`ticket_qr`(QRCode)→**KHÔNG có field row** (skip); 0 literal `"null"` json row; date/number/string vào typed tables đúng. **119/119 test** (+2 single-row proof, Option B).

⚠️**`FileUpload` alias CHƯA proven end-to-end** — bị chặn ở RENDER: `FormHtmlRenderer` chỉ có `case "File"` (không có `FileUpload`, whitelist :48-52/:637). Extractor fix đúng (unit-proven) nhưng renderer phải Canonicalize(FileUpload→File) thì browser mới upload được. ⚠️**DNN smoke BLOCKED** (site `dnn10322_megaclean.ai` timeout/không chạy).

## PHASE-3 DESIGN PLANS (workflow 6-agent, adversarially verified) — `Docs/DESIGN_TYPED_STORAGE_PHASE3_PLANS_2026-07-18.json`

- **Task 3 REGISTRY WIDENING** (`SOUND_WITH_CORRECTIONS`): widen `SubmissionFieldTypeSemantics` thành 1 registry duy nhất; route ~8 hard-coded type list qua nó (FormHtmlRenderer whitelist+switch, ResolveDataType, DNN AI DDL classifier, 3 TS skip-set, 2 TS renderer). ⭐**Renderer Canonicalize(FileUpload→File)** ở CẢ FormHtmlRenderer + TS renderer (parity, tạo `field-type-semantics.ts` twin) — đây là cái unblock FileUpload end-to-end. Thêm helper `IsDataCarrying/IsStructuredJson/IsConsentLike/IsExternalDataDisplay/CanonicalDataTypeFor`. Fix drift LIVE: PhonePro/PhoneNumberPro→String vs PhoneIntl→Json (canonicalize cả 3); TermsPrivacy (default Json) vs terms (Boolean). DataGrid/GridRepeater = data-carrying JSON (KHÔNG display-only).
- **Task 4 SINGLE-ROW = Option B DONE**: 2 test (browser stringified 1-row→JArray; CLR 1-row→JObject known-limit). Robust fix = persisted `MF_SubmissionFields.IsCollection` ở reader-switch milestone. ⚠️Correction: KHÔNG latent-until-reader-switch trên Oqtane (reconstructor chạy live qua HydrateDataJson/GetDetailTyped/Reports) — chỉ chưa reachable vì browser gửi string, chưa có path nào đẩy CLR single-list vào normalizer.
- **Task 5 R3-J** (`SOUND_WITH_CORRECTIONS`): clean-build pack + single-source version (5-way drift: nuspec 1.7.107 / ModuleInfo 1.7.108 / Server+Client 1.7.15 / Package 1.7.22 / Core 1.5.0) + post-pack nupkg validator (MetadataLoadContext) + runtime diagnostics endpoint. ⭐⭐**Correction C1 (QUAN TRỌNG — đừng tin narrative cũ):** cơ chế "new Server gọi member Core cũ thiếu → MissingMethodException nuốt" là SAI. Caller (SubmissionProcessor) + member (ISubmissionDataStore) CÙNG ở Core.dll → stale-Core = stale-SubmissionProcessor không có code collapse (không throw, DataJson giữ nguyên). Seam thật = Server's EfSubmissionDataStore implement Core interface → **new-Core+stale-Server = TypeLoadException lúc DI construct = 500 CỨNG, không nuốt**. Corrections khác: C4 diagnostics sketch có 2 lỗi compile (Server không ref Client; `doc.Values` không tồn tại → `doc.Data`), C5 auth nên theo `[Authorize(Policy)]+CanUseAdminPopup()` không phải Host-role.
- Sau R3-J: R3-A→B→C→D→E (dependency-first; kéo B lên vì direct `_subRepo.Insert` bypass là lỗ correctness).

## AUTONOMOUS SESSION PROGRESS (07-18, owner away 3h) — 3 commit

Nhánh `feature/typed-submission-storage-core`. Commits (CHƯA push):
- `a969c25` widget-semantics + browser/SQL acceptance (11 file).
- `824b577` **B1 FileUpload→File canonicalize** (renderers + upload endpoints).
- `e0bbe2a` **B3 diagnostics endpoint** (R3-J partial).

### ✅ B1 DONE + LIVE-VERIFIED
FileUpload alias giờ chạy END-TO-END. Canonicalize(FileUpload→File) tại: FormHtmlRenderer SSR (AnyHydrationWidget + render switch), 2 TS renderer (mới `renderer/field-type-semantics.ts` twin cho inputs.ts; inline `canonFieldType` trong megaform-renderer bundle), và **upload endpoint file-field check → `IsFileLike`** (Oqtane+Web committed). ⭐**Phát hiện khi verify:** upload endpoint có list `File||PdfForm` riêng (3-platform twin) → FileUpload bị 400 "Invalid file field" tới khi sửa. **LIVE :5126 sub 56** (Form 8 "ZZ FileUpload Alias"): FileUpload render dropzone, upload 200, **MF_Files row** (proposal_pack→proposal-pack.pdf), DataType=json, DataJson={}. Core+Oqtane Server+Web build clean. 119 test.
⚠️**DNN twin IsFileLike ĐÃ apply trong working tree nhưng CHƯA commit** — file `MegaForm.DNN/WebApi/MegaFormApiController.cs` mang feature NamedConnections uncommitted (Codex) rất lớn; commit hunk DNN RIÊNG sau khi review NamedConnections. DNN chưa live-verify (site down).

### ✅ B3 DIAGNOSTICS DONE + VERIFIED (endpoint gate)
`GET /api/MegaForm/Diagnostics/TypedStorage[?smoke=true]` host/admin-only (`[Authorize]`+`CanUseAdminPopup`). Report: loaded Core/Server asm version+path, serverRefCore vs loaded Core, interfaceHasCollapseMember, storeType, supportsDataJsonCollapse; smoke=write/read/delete sentinel âm (no-FK), error TYPE-only (rule 10). **Detect DLL-mismatch trap**. :5126 trả **403 unauth** (registered+gated); authenticated admin → JSON. Corrections C4/C5 đã áp (không ref Client; doc.Data; auth convention sẵn có).

### ✅ B3 PACKAGING GUARD DONE + TESTED (commit `0fe5234`)
`tools/validate-pack.ps1` (mới) + version single-source. Validator unpack nupkg, FAIL nếu: thiếu DLL bất kỳ lib\netX; Core.dll thiếu `SupportsDataJsonCollapse` (byte-scan → stale pre-typed Core rớt); nupkg version ≠ ModuleInfo; built DLL cũ hơn source .cs (bin fs mtime, KHÔNG dùng ZIP DOS-time). Version single-source: nuspec `$version$` + cả 2 script đọc ModuleInfo → `-Version` (hết drift 5-way). `release.cmd` + `pack.cmd` chạy validator làm gate, xóa nupkg + abort nếu fail. **TEST: validator FAIL 1.7.107 stale (thiếu member + drift + stale); release.cmd end-to-end PASS pack 1.7.108 mới (`[PACK-OK]`).** KHÔNG đổi AssemblyVersion (tránh destabilize) — validator + nuspec-align đủ chặn trap. nupkg gitignored.
- **B2 drift fixes** (PhoneIntl 3-spelling→1; TermsPrivacy IsConsentLike): DEFER — judgment về value-shape (e164 scalar vs JSON object) + regression risk (đổi String↔Json cho form hiện có). Cần owner quyết hướng. Registry đã widen phần AN TOÀN (renderers + upload endpoints qua B1).
- **B4 single-row IsCollection**: defer tới reader-switch milestone (đúng design; Option B đã pin test).
- **B5 DNN smoke**: site `dnn10322_megaclean.ai` THỰC RA UP (IIS site `DNN10322_MegaClean` Started; earlier timeout = DNN cold-start ~2min, warm sau ~5 request → 200). **MegaForm.DNN net472 BUILD-CLEAN với B1** (3-platform twin compile OK net472). Deployed DNN Core.dll = 12:00AM (prior twin, CHƯA có B1). Runtime smoke (deploy net472 Core+DNN DLL + renderer JS → recycle cold-start → seed DNN FileUpload form → browser submit → verify DNN parallel-write typed rows + MF_Files) = CÒN LẠI: heavy + kéo theo NamedConnections uncommitted + disrupt cold IIS. Logic = shared Core đã proven trên Oqtane. Deploy site DNN `E:\DNN_SITES\DNN10322_MegaClean\Website\bin`, DB `DNN10322_MegaClean`.
- **B6 Round 3 R3-A→E**: lớn, đa phiên; sequence trong DESIGN JSON.

Env restored: home :5126 → Form 1. Form 7/8 + sub 54/56 giữ làm evidence.

## Chưa commit — owner tự quyết
Phần còn lại của working tree (NamedConnections DNN, my-inbox, dashboard, v.v.) là việc khác/Codex — KHÔNG commit kèm. Nếu commit thêm typed-storage: NHỚ add file untracked mới.
