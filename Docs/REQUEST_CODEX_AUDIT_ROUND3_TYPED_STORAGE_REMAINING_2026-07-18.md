# REQUEST: Codex audit vòng 3 — các điểm typed submission storage CHƯA đạt

Date: 2026-07-18
Requested after commit **`b10b19a`** ("feat(storage): typed submission storage — Oqtane typed-primary + DNN parallel-write twin") on branch `feature/typed-submission-storage-core`.
Prior audits (đều chính xác, đã dùng để sửa): `Docs/AUDIT_TYPED_SUBMISSION_STORAGE_PHASE1_SOURCE_2026-07-17.md`, `Docs/AUDIT_TYPED_SUBMISSION_STORAGE_ROUND2_2026-07-18.md`.

## 0. Trạng thái đã commit (để Codex khỏi audit lại phần đã đóng)
Đã CHỐT ở `b10b19a` (audit-verified + live-verified — **không cần audit lại**, chỉ regression-check nếu muốn):
- Core: `ISubmissionDataStore.SupportsDataJsonCollapse` gate; `SubmissionProcessor` parallel-write + collapse-when-supported (ordering không có cửa sổ mất dữ liệu); normalizer checkbox-group→String + Number/Date lossless fallback; reconstructor fallback.
- Oqtane (typed-primary + hydration bridge): 7 DbSets/mappings + `EfSubmissionDataStore` + migration `01060039` + DI + `ModuleInfo` 1.7.108; `EfSubmissionRepository` hydrate Get/List, delete cleanup + log, hybrid search, **UpdateData re-derive typed rows**; **reports/completion/reindex reconstruct khi DataJson collapsed**.
- DNN (parallel-write): `DnnSubmissionDataStore` (ADO.NET) + `01.06.39.SqlDataProvider` (7 bảng + FK cascade) + manifest 01.07.108 + `DnnServiceLocator` wire.
- 91/91 test. Live: Oqtane :5126 (50 submission collapsed + reconstruct 100%), DNN dnn10322_megaclean.ai (submission 315, DataJson kept).

Status stamp đúng: **"Round 2: Oqtane primary pilot + DNN parallel-write twin, ready for Phase 3."** CHƯA đóng dấu "done no-DataJson toàn hệ".

## 1. Mục tiêu vòng audit này
Xác minh **các điểm CHƯA đạt** dưới đây — mỗi mục ghi rõ (a) kỳ vọng, (b) cần Codex kiểm gì, (c) tiêu chí PASS. Không cần code; chỉ audit + chỉ ra file/dòng + verdict.

---

## 2. Các điểm CHƯA đạt cần audit

### R3-A (P0) — Umbraco & Web CHƯA có typed store
- **Kỳ vọng:** cross-platform 4/4 nền. Umbraco/Web phải có typed tables + `ISubmissionDataStore` impl + DI + wire `SubmissionProcessor(typedStore:)`, tối thiểu **parallel-write** như DNN (giữ DataJson primary).
- **Codex kiểm:**
  1. `rg "ISubmissionDataStore|MF_SubmissionFields" MegaForm.Umbraco MegaForm.Web` — có impl/registration không? (kỳ vọng: KHÔNG → fail).
  2. Umbraco: `MegaForm.Umbraco/Composers/MegaFormComposer.cs` có register typed store + pass `typedStore:` vào `SubmissionProcessor` không? `MegaFormDbContext` (Umbraco) có typed DbSets không? Có Umbraco migration/`UmbracoDatabaseSchemaBootstrapper` tạo 7 bảng không?
  3. Web: `MegaForm.Web` có store + `DatabaseSchemaBootstrapper` cho 7 bảng không?
  4. Rủi ro cross-host: có chỗ nào Core GIẢ ĐỊNH typed rows tồn tại (sẽ vỡ Umbraco/Web) không? (hiện tại collapse gate=false cho host thiếu store → an toàn; xác nhận lại).
- **PASS khi:** liệt kê chính xác Umbraco/Web thiếu gì + khẳng định Core không giả định typed rows ở host chưa có store.

### R3-B (P0/P1) — Core readers vẫn DataJson-centric (chỉ được che bởi hydration)
- **Kỳ vọng:** đích cuối là reader đọc typed rows trực tiếp. Hiện Oqtane hydration che cho path qua `EfSubmissionRepository.Get/List`. Cần biết reader nào (a) đã an toàn nhờ hydration, (b) vẫn đọc raw `DataJson` bypass hydration (→ sai trên Oqtane collapsed hoặc Umbraco/Web).
- **Codex kiểm (rg `submission.DataJson`/`\.DataJson` + trace nguồn):**
  - `WorkflowEngine`, `EmailNotificationService`, `WebhookService`, `AdminRecordShellService`, `DataRepeaterService`, `FieldOptionsService`, `EmailSummaryService`, `ConfiguredAppStarterService`, Blog services, `SubmissionQueryService.GetDetail/ToListItem`.
  - Với mỗi cái: nó lấy submission qua `_subRepo.Get/List` (đã hydrate → an toàn Oqtane) hay đọc raw `db.Submissions`/direct SQL (bypass → rủi ro)?
- **PASS khi:** bảng reader × {đi qua hydration / bypass} + đánh dấu cái nào ACTIVE-broken trên Oqtane collapsed subs (ngoài reports/completion/reindex đã sửa ở b10b19a).

### R3-C (P0) — Typed update API + đồng bộ workflow/inbox
- **Kỳ vọng:** contract typed update (`SetField/UpdateFields/PatchFields`); `UpdateData` + workflow mutation không làm typed rows lệch.
- **Codex kiểm:**
  1. `ISubmissionRepository.UpdateData` — Oqtane impl (b10b19a) ĐÃ re-derive typed rows khi ghi DataJson thật. Verify: (a) đúng cho workflow field-mutation không? (b) DNN/Umbraco/Web `UpdateData` có sync typed rows không (kỳ vọng: KHÔNG — DNN/Umbraco/Web chỉ ghi DataJson)?
  2. `WorkflowEngine` mutation path: sau `_subRepo.UpdateData(...)` trên Oqtane, search DisplayValue + typed rows có current không? (b10b19a xử lý ở repo — verify logic đúng).
  3. Có `ISubmissionDataStore.SetField/UpdateFields` chưa? (kỳ vọng: chưa → đề xuất).
- **PASS khi:** xác nhận Oqtane UpdateData-sync đúng + chỉ rõ DNN/Umbraco/Web chưa sync + có/không typed update API.

### R3-D (P1) — SDK/API contract vẫn DataJson-centric
- **Kỳ vọng:** `SubmissionDto.Data` (dictionary) + `SubmissionDto.Fields` (typed) + `SubmissionFieldDto`/`SubmissionTypedValueDto`; `DataJson` obsolete/legacy; endpoint `Submissions/UpdateFields`.
- **Codex kiểm:** `MegaForm.Sdk/Dtos.cs`, `MegaFormClient.cs`, `PublicAPI.Unshipped.txt` — có `Data`/`Fields`/typed DTO chưa? `DataJson` đã `[Obsolete]` chưa? Có endpoint UpdateFields chưa?
- **PASS khi:** liệt kê chính xác SDK còn thiếu gì để khách viết card/grid/inbox không phải parse raw JSON.

### R3-E (P1) — Backfill CHƯA wire thành host command/job
- **Kỳ vọng:** admin command/job chạy `LegacySubmissionBackfillService` per host + `ILegacySubmissionSource` impl + marker `MigratedToTypedOnUtc` + verify counts.
- **Codex kiểm:** có endpoint/job/CLI gọi backfill không? Có `ILegacySubmissionSource` impl (Oqtane/DNN/Umbraco) không? Submission CŨ (trước typed write / trước 01.06.39) có typed rows không (nếu switch reader typed-only sẽ mất data cũ)?
- **PASS khi:** khẳng định backfill chưa wire + đánh giá rủi ro data cũ khi chuyển reader typed-only.

### R3-F (P1) — Oqtane delete cascade chưa DB-guaranteed
- **Kỳ vọng:** ưu tiên DB FK/cascade hoặc xoá typed rows trong CÙNG transaction với master; log failure (đã có ở b10b19a).
- **Codex kiểm:** Oqtane EF model có `HasOne/WithMany/OnDelete` cho typed tables không (kỳ vọng: KHÔNG → không có DB FK, chỉ repo cleanup)? `EfSubmissionRepository.Delete/BulkDelete` cleanup có atomic với master delete không (hiện: master trước, cleanup sau, fail-soft + log)?
- **PASS khi:** xác nhận Oqtane không có DB FK + đề xuất (thêm fluent FK cho fresh-install, hoặc cleanup-trong-transaction).

### R3-G (P2) — Search/filter chưa dùng typed value tables cho field filter
- **Kỳ vọng:** dashboard advanced-filter (number range, date range, boolean, exact) dùng `MF_SubmissionValueNumber/Date/Boolean/String`. Free-text có thể giữ DisplayValue/FTS.
- **Codex kiểm:** search hiện = `DataJson.Contains OR MF_SubmissionFields.DisplayValue.Contains` (hybrid text). Advanced-filter (`CapabilityDecisionEngine`/dashboard filter) có route qua typed value tables chưa?
- **PASS khi:** xác nhận field-filter chưa dùng typed value tables + chỉ điểm nối nên đổi.

### R3-H (P2) — Schema-version & extra columns còn thiếu
- **Kỳ vọng (target handout):** `MF_FormSchemaVersions`, `MF_FormFields`, `SubmissionKey`, `FormKey`, `SchemaVersion` trên submission/field, `MF_SubmissionAudit`, `MF_Files.SubmissionFieldId`, content/member/culture columns.
- **Codex kiểm:** cái nào tồn tại/thiếu? Ảnh hưởng render submission cũ sau khi schema đổi (hiện chỉ có metadata snapshot trên `MF_SubmissionFields`, chưa có version).
- **PASS khi:** liệt kê thiếu gì + mức ưu tiên.

### R3-I (P2) — Normalizer edge coverage
- **Codex kiểm:** test hiện có cover `System.Text.Json.JsonElement` (payload thật từ ASP.NET), File/Signature/Address/FullName/PhoneIntl/Appointment, culture date/decimal, duplicate field keys, sensitive masking chưa?
- **PASS khi:** liệt kê edge case chưa test (rủi ro data-loss khi DataJson off).

### R3-J — ⭐ Regression trap cần verify khi deploy
- **Bối cảnh:** gate `SupportsDataJsonCollapse` nằm ở **Core interface**. Deploy lệch pha (Core.dll cũ + Server.dll mới) → `MissingMethodException` bị try/catch nuốt → collapse âm thầm HỎNG (đã xảy ra với submission 52, fix = redeploy Core+Server khớp).
- **Codex kiểm/nhắc:** quy trình pack/deploy có đảm bảo Core.dll + Server.dll (+ Client cho version) luôn cùng build không? Có check timestamp/hash không?
- **PASS khi:** xác nhận rủi ro + đề xuất guard (pack đồng bộ, hoặc gate không phụ thuộc interface member mới).

---

## 3. Định dạng kết quả mong muốn từ Codex
Với mỗi mục R3-A…R3-J: **file:dòng** liên quan + **verdict** (Pass/Fail/Partial) + **rủi ro nếu bỏ qua** + **việc cần làm tiếp** (ngắn). Ưu tiên fix theo thứ tự: R3-A (Umbraco/Web) → R3-C (update sync) → R3-B (reader switch) → R3-D (SDK) → R3-E (backfill) → còn lại.

Không đóng dấu "done no-DataJson" cho tới khi R3-A/B/C/D/E xong.
