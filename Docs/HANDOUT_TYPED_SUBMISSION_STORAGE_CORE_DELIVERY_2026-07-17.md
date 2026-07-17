# HANDOUT BÀN GIAO: Typed Submission Storage Foundation (Core-only)

Date: 2026-07-17  
Author: Kimi Code CLI  
Branch: `feature/typed-submission-storage-core`  
Scope: MegaForm.Core + MegaForm.Sdk.Tests (không đụng chạm platform DNN/Oqtane/Umbraco/Web).  
Purpose: Bàn giao công việc đã làm để audit/review trước khi tiếp tục implement platform-specific storage.

---

## 1. Tóm tắt công việc đã làm

Xây dựng nền tảng **typed submission storage** trong `MegaForm.Core`, theo kiến trúc mục tiêu tại `Docs/HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`.

Kết quả:

- Định nghĩa entity models cho `MF_SubmissionFields` và 6 bảng typed value (`String`, `LongText`, `Number`, `Date`, `Boolean`, `Json`).
- Định nghĩa contract `ISubmissionDataStore` để mọi platform implement cùng một interface.
- Xây dựng `SubmissionFieldNormalizer` để chuyển submitted data thành typed rows.
- Xây dựng `SubmissionDataReconstructor` để rebuild `Dictionary<string, object>` từ typed rows.
- Xây dựng `LegacySubmissionBackfillService` để migrate `DataJson` cũ sang typed rows idempotently.
- Bổ sung preview method `GetDetailTyped()` trong `SubmissionQueryService`.
- Viết 39 unit tests, tất cả pass.
- Build thành công trên `net472`, `net8.0`, `net9.0`, `net10.0`.
- Commit checkpoint trên branch `feature/typed-submission-storage-core`.

Chiến lược chuyển đổi: **giữ `DataJson` legacy, viết song song typed rows**. Core hiện tại vẫn ghi `DataJson` như cũ; typed storage là lớp bổ sung, chưa thay thế runtime path.

---

## 2. Files đã tạo mới

| File | Mục đích |
|------|----------|
| `MegaForm.Core/Models/TypedSubmissionEntities.cs` | Entity models: `SubmissionFieldRecord`, `SubmissionValue*Record`, `SubmissionDataType` enum. |
| `MegaForm.Core/Interfaces/ISubmissionDataStore.cs` | Platform-agnostic contract để read/write typed submission data. |
| `MegaForm.Core/Interfaces/ILegacySubmissionSource.cs` | Optional contract để cross-form backfill submissions từ `DataJson`. |
| `MegaForm.Core/Services/TypedSubmission/SubmissionDataDocument.cs` | Read model: submission + fields + reconstructed data dictionary. |
| `MegaForm.Core/Services/TypedSubmission/SubmissionFieldWrite.cs` | Write DTO cho một submitted field. |
| `MegaForm.Core/Services/TypedSubmission/TypedFieldValues.cs` | Decomposed typed values cho một field (dùng bởi normalizer + store). |
| `MegaForm.Core/Services/TypedSubmission/BackfillOptions.cs` | Options cho backfill service. |
| `MegaForm.Core/Services/TypedSubmission/BackfillResult.cs` | Result summary cho backfill service. |
| `MegaForm.Core/Services/TypedSubmission/SubmissionFieldNormalizer.cs` | Chuyển `FormSchema` + submitted data → `SubmissionFieldWrite` list + typed values. |
| `MegaForm.Core/Services/TypedSubmission/SubmissionDataReconstructor.cs` | Chuyển typed rows → `Dictionary<string, object>`. |
| `MegaForm.Core/Services/TypedSubmission/LegacySubmissionBackfillService.cs` | Migrate legacy `DataJson` → typed rows idempotently. |
| `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs` | 39 unit tests cho normalizer, store round-trip, backfill, reconstructor. |

---

## 3. Files đã sửa đổi (additive only)

| File | Thay đổi |
|------|----------|
| `MegaForm.Core/Services/SubmissionQueryService.cs` | Thêm constructor overload nhận `ISubmissionDataStore`; thêm `GetDetailTyped()` preview method; thêm helper `BuildFallbackFlatValuesFromDictionary`. |
| `AGENTS.md` | Cập nhật tiến độ Phase 7 — Typed Submission Storage foundation. |

---

## 4. Build & Test Results

### 4.1 MegaForm.Core

```bash
dotnet build MegaForm.Core/MegaForm.Core.csproj -c Release
```

- Target frameworks: `net472`, `net8.0`, `net9.0`, `net10.0`
- Result: **0 error**, warnings hiện có của codebase (không liên quan đến thay đổi này).

### 4.2 MegaForm.Sdk.Tests

```bash
dotnet test MegaForm.Sdk.Tests/MegaForm.Sdk.Tests.csproj
```

- Result: **Passed: 88, Failed: 0, Skipped: 0**
- Trong đó 39 tests thuộc `TypedSubmissionStorageTests`.

---

## 5. Điểm cần audit / review

### 5.1 Kiến trúc

1. **Entity model** có đủ metadata snapshot để submission cũ render đúng sau khi schema thay đổi không?
   - `SubmissionFieldRecord` có `LabelSnapshot`, `FieldType`, `FieldOrder`, `PageIndex`.
   - Có cần thêm `SchemaVersion`/`FormVersion` vào `SubmissionFieldRecord` hay chỉ cần ở `MF_Submissions`?

2. **`ISubmissionDataStore` contract** có phù hợp với tất cả platform không?
   - Oqtane: EF Core + `IDbContextFactory`.
   - Umbraco: EF Core scoped `DbContext` + custom migrations.
   - DNN: ADO.NET/stored procedures.
   - Web: EF Core + `DatabaseSchemaBootstrapper`.

3. **Typed value decomposition** có đủ cho query/report không?
   - String/LongText/Number/Date/Boolean/Json.
   - Multi-value controls được lưu nhiều rows với `Ordinal`.
   - Composite controls lưu JSON field-scoped.

### 5.2 Code quality

4. **`SubmissionFieldNormalizer.ResolveDataType`** mapping có đúng với tất cả field types hiện tại không?
   - Các type chưa xuất hiện trong tests: `PhonePro`, `PhoneNumberPro`, `DateRange`, `Appointment`, `PaymentSummary`, `Razor`, `UserTemplate`, `MultiColumnCombo`, các payment types.

5. **`SplitRawValue` xử lý Dictionary/IEnumerable** có robust không?
   - Đã xử lý `JArray`, `JObject`, `JValue`, `Dictionary<string, object>`, generic `IEnumerable`.
   - Cần review edge cases: `List<string>`, `string[]`, `JToken` phức tạp.

6. **Date parsing** dùng `DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal`. Có cần tách `Date` vs `DateTime` vs `Time` storage type không?

7. **Boolean parsing** chấp nhận `"true"`, `true`, `"on"`, `"yes"`, `"1"`. Có cần thêm `"checked"`, `"ok"`?

### 5.3 Backfill service

8. **`LegacySubmissionBackfillService`** hiện chỉ hỗ trợ `FormId` cụ thể khi không có `ILegacySubmissionSource`. Cross-form backfill cần platform implement `ILegacySubmissionSource`.

9. **Idempotency** dựa trên `store.HasFields(submissionId)`. Nếu platform implement sai, backfill có thể duplicate.

10. **Transaction/batching** chưa được enforce ở Core; platform implementation cần đảm bảo `ReplaceFields` là atomic.

### 5.4 Compatibility

11. **`ISubmissionRepository` không bị thay đổi signature** — đảm bảo không breaking change với platform repos.

12. **`SubmissionQueryService` constructor overload mới** — platform DI cần register `ISubmissionDataStore` nếu muốn dùng `GetDetailTyped()`.

---

## 6. Hướng dẫn backup / restore

### Branch hiện tại

```bash
git branch --show-current
# feature/typed-submission-storage-core
```

### Để xem commit

```bash
git log --oneline -5
# 8ef0ae1 feat(core): typed submission storage abstractions
```

### Để restore về branch gốc (nếu cần)

```bash
git checkout feat/theme-designer-picker-wizard-gallery-1.7.45
```

> Lưu ý: branch gốc có nhiều thay đổi uncommitted từ phiên trước. Branch `feature/typed-submission-storage-core` chứa các thay đổi đó + commit typed storage.

---

## 7. Bước tiếp theo đề xuất

1. **Chọn pilot platform:** Umbraco hoặc Oqtane.
2. **Tạo migrations/entity builders** cho `MF_SubmissionFields` + 6 bảng typed value.
3. **Implement `ISubmissionDataStore`** trong platform repository.
4. **Sửa `SubmissionProcessor`** để ghi typed rows song song với `DataJson` (vẫn giữ `DataJson` để compat).
5. **Chạy backfill** cho submissions cũ.
6. **Switch readers** từng service một: `SubmissionQueryService`, dashboard, workflow, email, webhook, reports.
7. **Sau khi tất cả readers đã switch**, ngừng ghi `DataJson` cho submissions mới.

---

## 8. References

- Kiến trúc mục tiêu: `Docs/HANDOUT_NEXT_SESSION_TYPED_SUBMISSION_STORAGE_NO_DATAJSON_2026-07-17.md`
- Bàn giao tổng thể: `AGENTS.md`
- Tests: `MegaForm.Sdk.Tests/TypedSubmissionStorageTests.cs`
