# XÁC MINH — tầng typed field filter/query (Codex, 2026-08-14)

**Phạm vi:** đo lại trên source những gì Codex báo đã xong. **Không sửa code.**
**Cách kiểm:** đọc trực tiếp 3 implementation + service + call site + test; `git grep` để tìm *ai gọi*,
không dừng ở "code có tồn tại". Mọi kết luận kèm `file:line`.

---

## 0. Kết luận một câu

Phần lõi **làm đúng và làm sạch**: parameterized thật, bounded-read thật, fail-closed thật, validation
thật, và tuyên bố "không còn `DataJson` search" **kiểm chứng đúng**. Nhưng **`TotalCount` lệch giữa 3
host** (Oqtane cap 10.000 im lặng), **đường field-filter chỉ có đúng 1 call site trong cả repo** nên
244 dòng SQL của DNN chưa từng chạy, và **4 test đều dùng fake** nên không test nào có thể phát hiện
hai điều trên.

---

## 1. Những gì Codex báo — kiểm chứng ĐÚNG

| Tuyên bố | Bằng chứng |
|---|---|
| Contract 5 kiểu + 11 operator | [`SubmissionQueryModels.cs:46-74`](MegaForm.Core/Models/SubmissionQueryModels.cs#L46) — `String/LongText/Number/Date/Boolean`; `Equals…IsNotEmpty` |
| DNN SQL **parameterized** | [`TypedSubmissionQueryRepository.cs:125,169`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L125) — field key + value là `SqlParameter`; tên bảng từ **switch whitelist** ([`:187-198`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L187)); operator từ switch ([`:200-219`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L200)). **Không tìm thấy bề mặt injection** |
| Bounded-read (rule 11) | DNN: `OFFSET @Offset ROWS FETCH NEXT @PageSize` + `COUNT(*)` riêng ([`:54-57`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L54)). Oqtane/Umbraco: `Skip/Take` trên `IQueryable` ⇒ dịch thành SQL, **không** materialize-rồi-Skip |
| Filter chạy TRƯỚC count/paging | DNN `whereSql` dùng cho cả list và count · Oqtane [`:206-221`](MegaForm.Oqtane.Server/Data/EfRepositories.cs#L206) · Umbraco [`:135-142`](MegaForm.Umbraco/Data/EfRepositories.cs#L135) |
| Fail-loud, không bỏ điều kiện im lặng | [`SubmissionQueryService.cs:61-63`](MegaForm.Core/Services/SubmissionQueryService.cs#L61) `throw new NotSupportedException` + có test riêng |
| Validation đầu vào | [`SubmissionQueryService.cs:165-209`](MegaForm.Core/Services/SubmissionQueryService.cs#L165) — chặn null entry, bắt buộc `FieldKey`, JSON chỉ cho `IsEmpty/IsNotEmpty`, kiểm operator↔DataType, bắt buộc typed value khớp |
| Clamp page size public/trusted | [`:47,53-54`](MegaForm.Core/Services/SubmissionQueryService.cs#L53) — public **250**, `TrustedFetch` **5000** |
| Không còn `DataJson.Contains` / `LIKE DataJson` | `git grep` trên cả 4 host = **0** kết quả ✅ |
| LIKE escaping | `ESCAPE '~'` ở cả 3 đường mới (DNN [`:233-236`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L233), Oqtane/Umbraco `EF.Functions.Like(..., "~")`) |
| Field sensitive không lọt qua free-text search | `f.IsSensitive = 0` / `!f.IsSensitive` ở cả 3 host |
| Batch hydrate tránh N+1 | ✅ và **Codex under-claim**: `ISubmissionDataBatchReader` được hiện thực ở **cả 4 host** — [`MegaForm.Web/Data/EfSubmissionDataStore.cs:18`](MegaForm.Web/Data/EfSubmissionDataStore.cs#L18) · [Oqtane`:19`](MegaForm.Oqtane.Server/Data/EfSubmissionDataStore.cs#L19) · [Umbraco`:17`](MegaForm.Umbraco/Data/EfSubmissionDataStore.cs#L17) · [`DnnSubmissionDataStore.cs:20`](MegaForm.DNN/Data/DnnSubmissionDataStore.cs#L20) |
| Oqtane bound-query dùng typed filter | [`MegaFormController.cs:2795`](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L2795) |

Kiểm thêm ngoài phạm vi Codex báo: SQL của Reports (`IN ({idParam})`) dựng bằng **danh sách tên
tham số** rồi bind giá trị ⇒ **không phải injection** ([`Umbraco/ReportsController.cs:225-229`](MegaForm.Umbraco/Controllers/ReportsController.cs#L225)).

---

## 2. ⭐ G1 🔴 `TotalCount` lệch giữa 3 host — Oqtane cắt ở 10.000 KHÔNG báo

| Host | Cách đếm | Kết quả |
|---|---|---|
| DNN | [`:57`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L57) `SELECT COUNT(*)` | **chính xác** |
| Umbraco | [`:140`](MegaForm.Umbraco/Data/EfRepositories.cs#L140) `q.Count()` | **chính xác** |
| Oqtane | [`:209-216`](MegaForm.Oqtane.Server/Data/EfRepositories.cs#L209) `q.Take(10001).Count()` → nếu ≥ cap thì `total = 10000` | **cắt ở 10.000** |

```csharp
const int countCap = 10001;
var total = q.Take(countCap).Count();
if (total >= countCap)
{
    total = countCap - 1;
    var scope = ExternalSourceContext.Current;
    if (scope != null) scope.TotalIsBounded = true;   // ← chỉ báo khi scope KHÁC NULL
}
```

`ExternalSourceContext.Current` **chỉ được set trên đường external-source**
([Oqtane `MegaFormController.cs:2601`](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L2601),
[DNN `MegaFormApiController.cs:2246`](MegaForm.DNN/WebApi/MegaFormApiController.cs#L2246)). Trên đường
liệt kê submission thường, `scope == null` ⇒ **cờ `TotalIsBounded` không bao giờ được bật** ⇒ cap hoàn
toàn im lặng.

**Hệ quả cụ thể:** form có 25.000 submission khớp điều kiện → DNN và Umbraco trả `TotalCount = 25000`,
Oqtane trả `10000`. UI tính số trang từ `TotalCount` ⇒ trên Oqtane **hàng thứ 10.001 trở đi không có
đường nào tới được**, và không có một dấu hiệu nào cho người dùng biết. Đây đúng họ "mất dữ liệu im
lặng" mà `CLAUDE.md` §11 nói tới, và vi phạm luật 3-platform-twin.

**Phải chốt một trong hai, rồi áp cho cả 3 host:** (a) `COUNT(*)` chính xác ở mọi nơi, hoặc (b) cap ở
mọi nơi **kèm cờ bounded luôn được trả về response** (không phụ thuộc scope) để UI hiện "10.000+".

---

## 3. ⭐ G2 🔴 Cả repo chỉ có ĐÚNG MỘT chỗ set `FieldFilters` — SQL field-filter của DNN chưa từng chạy

`git grep FieldFilters` trên toàn bộ `*.cs`, bỏ model và test, chỉ còn:

- **Oqtane** [`MegaFormController.cs:2795`](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L2795) — bound-query, 1 filter
- SDK client [`MegaFormClient.cs:714`](MegaForm.Sdk/MegaFormClient.cs#L714) — mapping contract
- 3 implementation tự đọc `query.FieldFilters` (Core/Oqtane/Umbraco)

**Không endpoint nào của DNN, Umbraco hay Web set `FieldFilters`.** Vì
`typedQueryRequested = Search != empty || FieldFilters.Count > 0`
([`SubmissionQueryService.cs:65`](MegaForm.Core/Services/SubmissionQueryService.cs#L65)), nhánh
**Search** trên DNN/Umbraco là sống; còn nhánh **field filter** thì:

> [`BuildTypedFieldPredicate`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L122) và toàn bộ
> `BuildTextComparison` / `BuildScalarComparison` / `BuildLikeValue` / `TypedValueTable` của DNN
> **không có đường nào từ sản phẩm gọi tới**. SQL đó chưa bao giờ thực thi.

Đúng mẫu "model đúng nhưng không phải nguồn sự thật" đã ghi ở
[`REVIEW_20260814_AUDIT_PLAN_DYNAMIC_CONTENT_FINDINGS.md`](Docs/REVIEW_20260814_AUDIT_PLAN_DYNAMIC_CONTENT_FINDINGS.md).
**Đừng nhận "đã hoàn thành typed field filter layer" là bằng chứng nó chạy** — hiện tại nó chạy được
trên đúng một endpoint của đúng một host.

---

## 4. ⭐ G3 🔴 4 test, tất cả trên FAKE — không test nào chạm SQL/EF thật

[`MegaForm.Sdk.Tests/TypedSubmissionQueryTests.cs`](MegaForm.Sdk.Tests/TypedSubmissionQueryTests.cs) —
193 dòng, 4 `[Fact]`:

1. `Core_routes_search_and_filters_to_typed_repository_before_paging`
2. `Core_rejects_string_operators_for_number_fields`
3. `Core_does_not_silently_ignore_filters_on_legacy_repositories`
4. `Sdk_maps_typed_filter_contract_to_core_query`

Cả 4 chạy trên repository giả (mọi method khác `=> throw new NotSupportedException()`, `:165-190`).
**Không có test nào:** dịch EF của Oqtane/Umbraco, SQL của DNN, hay so cùng một filter trên 2+ host.

⇒ **G1 và G2 nằm ngoài tầm phát hiện của bộ test hiện tại.** Đúng bài học 08-12: *"test vẫn xanh vì
fake mô phỏng ngược"*. Test cần thêm: một bộ **conformance** chạy cùng một tập filter trên
Oqtane/Umbraco (EF SQLite/InMemory) và DNN (SQL Express có sẵn máy), assert **cùng Items và cùng
TotalCount** — chính bộ đó sẽ bắt G1 ngay.

---

## 5. G4 🟠 Field filter KHÔNG kiểm `IsSensitive`, trong khi search ngay bên cạnh thì có

| Đường | Kiểm sensitive? |
|---|---|
| Free-text search | ✅ DNN [`:89-91`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L89) `f.IsSensitive = 0` · Oqtane [`:241-255`](MegaForm.Oqtane.Server/Data/EfRepositories.cs#L241) · Umbraco [`:162-174`](MegaForm.Umbraco/Data/EfRepositories.cs#L162) |
| Field filter | ❌ DNN [`:122-176`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L122) · Oqtane [`:258`](MegaForm.Oqtane.Server/Data/EfRepositories.cs#L258) · Umbraco [`:135`](MegaForm.Umbraco/Data/EfRepositories.cs#L135) — **không join `MF_SubmissionFields` để lọc** |

Ai gọi được field filter có thể **dò giá trị của field sensitive** bằng `Equals`/`StartsWith` nhị phân
(value oracle) dù không được phép đọc giá trị đó. Chính sách hai đường phải giống nhau; nếu cố ý cho
filter trên field sensitive thì phải ghi lý do ngay tại chỗ.

---

## 6. G5 🟠 `MegaForm.Web` bị bỏ ngoài — 4 host, 3 backend search khác nhau

[`MegaForm.Web/Data/DataLayer.cs:598`](MegaForm.Web/Data/DataLayer.cs#L598):
`EfSubmissionRepository : ISubmissionRepository, ISubmissionOwnerFilterableRepository` — **không**
`ISubmissionTypedQueryRepository`.

Search của Web ([`:649-651`](MegaForm.Web/Data/DataLayer.cs#L649)) đọc **bảng legacy
`MF_SubmissionValues`** (`FieldKey`/`FieldValue`), không phải typed tables, và **không escape LIKE**:

```csharp
var pattern = $"%{term}%";     // %, _ trong từ khoá thành wildcard
_db.SubmissionValues.Where(v => EF.Functions.Like(v.FieldKey ?? "", pattern) || ...)
```

Ba host mới escape `~`, Web thì không ⇒ **cùng một từ khoá cho ra kết quả khác nhau tuỳ host**. Và
search của Web phụ thuộc `SubmissionIndexerService` (flat-index tuỳ chọn — `MEMORY.md` ghi *"Oqtane EAV
indexer LUÔN fail âm thầm"*), nên trên site không bật indexer thì search field value **trả rỗng**.

Codex nói "ba host" nên đây là chỗ **biết mà chưa làm**; nhưng field filter trên Web ⇒
`NotSupportedException`, nên nếu UI dùng chung gửi filter thì Web vỡ. Cần chốt: hiện thực cho Web, hay
tắt UI filter trên Web — không để trạng thái lửng lơ.

---

## 7. G6 🟠 Hai index song song — `MF_SubmissionValues` legacy chưa nghỉ

- **Vẫn ghi:** [`SubmissionIndexerService.cs:147,170`](MegaForm.Core/Services/SubmissionIndexerService.cs#L147) (DELETE + INSERT)
- **Vẫn đọc bởi Reports ở cả 4 host:** [DNN `ReportApiController.cs:389`](MegaForm.DNN/WebApi/ReportApiController.cs#L389) · [Oqtane `MegaFormController.Reports.cs:352`](MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs#L352) · [Umbraco `ReportsController.cs:226`](MegaForm.Umbraco/Controllers/ReportsController.cs#L226) · [Web `ReportsController.cs:232`](MegaForm.Web/Controllers/ReportsController.cs#L232)

⇒ **Report và filter đang đọc hai nguồn khác nhau** cho cùng một dữ liệu. Nếu flat index lệch (đã có
tiền sử fail âm thầm), cùng một điều kiện cho hai kết quả khác nhau ở hai màn hình. Câu *"audit xác nhận
không còn ... search bảng `MF_SubmissionValues` cũ"* **đúng trong phạm vi search**, nhưng rất dễ bị đọc
thành "bảng cũ đã nghỉ" — nó chưa. Cần ghi rõ trong docs, và có lộ trình cho Reports.

---

## 8. G7/G8 🟡 Hai điểm nhỏ nên siết

**G7 — repo layer không tự bảo vệ.** `FormRepository.ListSubmissionsTyped` là `public static`. Trong
đó: `filter.FieldKey.Trim()` ([`:125`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L125)) → NRE
nếu `FieldKey` null; `filter.NumberValue.Value` ([`:152`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L152)),
`DateValue.Value` ([`:157`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L157)),
`BooleanValue.Value` ([`:162`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L162)) →
`InvalidOperationException` nếu `DataType` được set mà value null. Cùng vấn đề ở Oqtane
`:260,277,310,327` và Umbraco. **Hiện an toàn** vì mọi đường đều qua `ValidateTypedFilters`. Nhưng repo
cap page size riêng ở 5000 ([`:17`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L17)) mà
**không biết `TrustedFetch`** ⇒ caller mới gọi trực tiếp sẽ bỏ qua cả clamp 250 lẫn validation. Thiếu
một lớp defense-in-depth.

**G8 — `NotEquals` trả chuỗi có ` AND ` ở top level, không bọc ngoặc**
([`:174-175`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L174)). Hiện **đúng** vì `where` chỉ
join bằng `AND` ([`:53`](MegaForm.DNN/Data/TypedSubmissionQueryRepository.cs#L53)) và `AND` kết hợp
được. Nhưng nếu sau này ai gộp predicate này vào một nhánh `OR` thì sai âm thầm. Bọc `(...)` là 1 dòng.

**Ghi chú về "count/paging đều chạy trong database":** đúng cho 3 implementation, nhưng đường
bound-query của Oqtane vẫn **post-process trong bộ nhớ** sau khi lấy một trang có cap
([`MegaFormController.cs:2801-2811`](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs#L2801)) —
đây là trade-off **đã được ghi lý do tại chỗ** (anonymous = cap nghiêm nhất theo rule 11), không phải
lỗi mới; chỉ là câu tổng kết không nên phát biểu tuyệt đối.

---

## 9. Chưa kiểm — cần bằng chứng chạy thật

1. **G1 trên site thật**: form >10.000 submission trên Oqtane, so `TotalCount` với DNN cùng điều kiện.
2. **G2**: có UI nào (Oqtane listview/datagrid) thật sự gửi `fieldFilter` không, và trên DNN thì UI đó biến đi đâu.
3. **G5**: site Web có bật `SubmissionIndexerService` không — nếu không, search field value đang trả rỗng.
4. **G4**: dựng 1 field `IsSensitive = 1`, thử `Equals`/`StartsWith` qua bound-query Oqtane xem có dò được.
5. Build 6 target + chạy lại toàn bộ test (Codex chưa báo con số test tổng sau thay đổi).

---

## 10. Tóm tắt một câu

Chất lượng code của lớp này cao — parameterized, bounded, fail-closed, validated đều thật; nhưng
**"đã hoàn thành" thì chưa**: một host đếm sai 10.000 mà không báo, SQL của một host chưa từng chạy vì
không ai gọi, host thứ tư vẫn dùng index cũ, và bộ test toàn fake nên cả ba điều đó vẫn xanh.
