# AUDIT — Enterprise Production Performance & Security Hardening (MegaForm)

> **Dự án:** MegaFormSolution_280_Oqtane_um
> **Ngày audit:** 2026-07-04
> **Branch:** `feat/theme-designer-picker-wizard-gallery-1.7.45`
> **Build tham chiếu:** 1.7.73+ / AssetVersion `20260704-B363`
> **Phạm vi:** Chỉ RÀ SOÁT (read-only) — **KHÔNG sửa code**. Đây là tài liệu đề xuất.
> **Phương pháp:** Đọc source trực tiếp + 5 luồng audit song song (render hot-path, data access/scalability, frontend bundle, concurrency/reliability, security verification). Mọi finding đều kèm evidence `file:line` đã đọc tận nơi.
> **Đọc kèm (không lặp lại):** `Docs/MYTHOS_SECURITY_AUDIT_REAUDIT_2026-07-04.md`, `Docs/SECURITY_CODING_RULES.md`, `Docs/AUDIT_Form743_Performance_Oqtane_2026-06-19_Retest.md`.

---

## 0. Executive Summary

MegaForm đã qua nhiều đợt security audit và **hầu hết P0 đã đóng** (unauth DML, stored-XSS content-token, SSRF workflow node, JWT forgery). Đợt audit này **hợp nhất trạng thái security hiện tại (đã verify lại theo code)** và bổ sung chiều **hiệu năng/độ sẵn sàng production** — vốn chưa được audit hệ thống ngoài 1 báo cáo lẻ về Form #743.

**Kết luận sẵn sàng production:**

| Kịch bản triển khai | Trạng thái | Chốt chặn (blocker) |
|---|---|---|
| **1 node** (single instance) | ⚠️ Gần đủ | 2 blocker security (SEC-B1 SaveModuleStyle CSRF, SEC-B2 payment fail-open) + PERF-A1 (render uncached) làm trần throughput thấp |
| **Multi-node / web-farm** (mục tiêu "enterprise") | ⛔ **CHƯA đủ** | Toàn bộ state đếm nằm **in-process** → sai về mặt correctness: coupon overspend, UniqueId trùng, rate-limit bị bypass N×. Xem PERF-D* |

**3 nhóm vấn đề lớn nhất phải xử lý trước khi gọi là "enterprise production":**

1. **State đếm / chống lạm dụng nằm trong RAM tiến trình** (PERF-D1..D4) → sai số liệu, mất tiền, bypass anti-abuse ngay khi có >1 node hoặc restart. Đây là **rào cản kiến trúc** cho mục tiêu multi-node.
2. **Đường render public không có cache** (PERF-A1/A2) → schema ~165 KB bị parse/serialize **5–6 lần mỗi lượt xem form**, lặp lại trên endpoint nóng nhất → trần throughput + áp lực GC (LOH).
3. **2 blocker security còn mở** (SEC-B1, SEC-B2) — trong đó **SEC-B1 bị doc cũ ghi nhầm là đã fix**.

**Bảng tổng hợp rủi ro (đợt này):**

| Mức | Security | Performance/Reliability | Operational | Tổng |
|---|---|---|---|---|
| **Blocker / P0–P1** | 2 | 6 | — | 8 |
| **High / P2** | 6 | 8 | 3 | 17 |
| **Medium / P3** | 4 | 9 | 2 | 15 |
| **Điểm cộng đã làm đúng** | — | — | — | 9 |

---

## 1. Phạm vi & ghi chú kiến trúc (đọc trước khi phán xét severity)

MegaForm là **module** chạy trong host CMS (Oqtane / DNN) **và** có bản host độc lập (`MegaForm.Web`, `MegaForm.AspNetCore.Component`). Điều này quyết định "ai sở hữu" một số lớp:

- **Host CMS sở hữu:** TLS/HSTS, cookie policy toàn site, HTTP/2, giới hạn kết nối, WAF/rate-limit tầng edge. → Với deployment Oqtane/DNN, một số finding "ops" là *khuyến nghị cho host operator*, không phải lỗi code module.
- **Module MegaForm sở hữu:** logic render, endpoint API riêng (`/api/MegaForm/*`), state đếm, bundle asset, guard bảo mật của chính nó. → Đây là nơi audit tập trung.
- **Bản host độc lập (`MegaForm.Web` / `Web.Host` / Samples):** MegaForm sở hữu **toàn bộ** (cookie, CORS, JWT, rate-limit). Nhiều finding cấu hình chỉ áp cho bản này.

**Deployment surface của các state-store in-memory** (quan trọng để không over-claim):
- `UniqueId` + `RateLimit` stub nằm trong `EfPhase2Repository` — **active trên CẢ Oqtane (`Startup.cs:90`) VÀ Web (`Program.cs:32`)**.
- Coupon / Quiz / Conversion store — chỉ đăng ký ở đường **AspNetCore self-host** (`MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`, dùng bởi `MegaForm.Web.Host` + Samples). Không active trong Oqtane mặc định.
- DNN app/query store — đường DNN controller.

---

## PART A — Render Hot-Path (CPU / caching / GC)

Đường nóng: mỗi lượt xem form public = SSR (`Index.razor.TryBuildSsrFormHtml` hoặc `RenderPage.cs`) **+** một fetch `GET /api/MegaForm/Schema/{id}` để hydrate.

### PERF-A1 — `Schema/{id}` re-resolve toàn bộ schema, KHÔNG cache, ~5–6 lượt JSON mỗi request `【P1 / High】`
- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1388-1414`; `MegaForm.Core/Rendering/RenderModelResolver.cs:43-116`; manifest `MegaFormController.cs:3719`; `ThemePresetInlineCssService.cs:16-23`.
- **Bằng chứng:** Mỗi lượt xem form gọi endpoint này (`RenderPage.cs:225` boot script `fetch(o.apiBase+'Schema/'+o.formId)`). Trong 1 call: `JObject.Parse(schemaJson)` + nhiều `DeepClone()` + `schema.ToString(Formatting.None)` + `JsonConvert.DeserializeObject<FormSchema>()` (resolver) **+ lại** `DeserializeObject<FormSchema>()` cho asset manifest **+ lại** `JObject.Parse(settingsJson)` cho theme CSS. Schema premium ~**165 KB** (chính code ghi chú ở `RenderPage.cs:143-146`).
- **Đã xác minh:** grep `ResponseCache`/`OutputCache` trên controller → **0 hit**. Không có lớp cache nào.
- **Tác động production:** parse/serialize payload 165 KB × 5–6 lần trên endpoint nóng nhất = CPU + allocation thuần. Kết quả **bất biến giữa 2 lần sửa form** → memoize được theo `(formId, form.ModifiedOn)`.

### PERF-A2 — Cùng một resolve chạy 2–3× trên các endpoint khác nhau cho 1 lượt xem `【P1 / High】`
- **File:** `Form/{id}` tại `MegaFormController.cs:271-283` **cũng** gọi `RenderModelResolver.Resolve`; đường Blazor SSR deserialize schema lần nữa trong `TryBuildSsrFormHtml`.
- **Tác động:** 1 lượt tải form trả phí resolve của PERF-A1 hai đến ba lần, không endpoint nào chia sẻ cache.

### PERF-A3 — Re-serialize chuỗi lớn → áp lực LOH (Large Object Heap) `【P2】`
- **File:** `RenderModelResolver.cs:45,67,68,110`. `resolvedSchemaJson`, `SettingsJson` re-serialize, và object graph deserialize đều tạo bản copy >85 KB → vào **LOH** → phân mảnh + đẩy Gen2 GC dưới tải đồng thời.

### PERF-A4 — `CustomShellCompatibilityCssService.Build` dựng lại blob CSS mỗi lần compose `【P2】`
- **File:** `MegaForm.Core/Services/CustomShellCompatibilityCssService.cs:19-285`. Dựng ~4–8 KB CSS từ đầu (hàng chục `StringBuilder.Append` + `VarDeclarationRe.Matches` quét `customCss+customHtml`) trên **mỗi** `ModuleCssComposer.Compose` (mỗi SSR snapshot-miss `Index.razor:2936`, mỗi `RenderPage.cs:90`). Output chỉ phụ thuộc `(scope, authoredVars, enableTemplateVarBridge)` — bất biến. (Regex `VarDeclarationRe` đã `static Compiled` đúng; vấn đề là cả builder không được cache.)

### PERF-A5 — `ThemePresetInlineCssService.Build` recompute mỗi Schema request + mỗi render `【P2】`
- **File:** `MegaForm.Core/Services/ThemePresetInlineCssService.cs:16-134` (gọi tại `MegaFormController.cs:1409`, `RenderPage.cs:49`). Parse settings + emit ~50 var mỗi lần; bất biến, không cache.

### PERF-A6 — Double-parse schema trong SSR build `【P2】`
- **File:** `Index.razor:2904` (`DeserializeObject<FormSchema>`) rồi `Index.razor:2924` (`JObject.Parse`) parse **cùng** payload lớn 2 lần mỗi SSR miss. Được `SsrSnapshots` giảm nhẹ khi cache-hit.

### PERF-A7 — Roslyn Razor compile: assembly nạp vào ALC không thu hồi được → **memory leak** `【P2】`
- **File:** `MegaForm.Oqtane.Server/Services/RazorCompilationService.cs:215` — `Assembly.Load(ms.ToArray())` vào default ALC (đã xác minh: `AssemblyLoadContext.All` được duyệt ở :163 nhưng load ở :215 vào default). LRU evict ở 100 chỉ bỏ *metadata*; assembly đã nạp **không bao giờ GC được** → 1 assembly leak/source, tăng vô hạn khi biên tập Razor Studio.
- **Ghi chú:** Nên dùng collectible `AssemblyLoadContext`. Admin-only nên cháy chậm. *(Trùng với F6 luồng reliability.)*

### PERF-A8 — `RazorCompilationService.Compile` dựng lại toàn bộ MetadataReference set mỗi cache-miss `【P2】`
- **File:** `RazorCompilationService.cs:135-190`. Mỗi miss duyệt TPA list + mọi assembly trong mọi ALC + `Directory.EnumerateFiles(BaseDir,"*.dll")` gọi `MetadataReference.CreateFromFile` (hàng trăm DLL, đọc PE metadata + sync file I/O). Output có cache; reference list thì không.

### PERF-A9..A13 — Micro-allocation trên render path `【P3】`
- `FormHtmlRenderer.cs:1248-1314` — `ResolveOptionIcon` tạo mới Dictionary ~60 entry **mỗi option mỗi render** (nên `static readonly`).
- `FormHtmlRenderer.cs:251-259` — quét `O(hiddenFields × customHtmlLength)` cho mỗi Hidden field.
- `FormHtmlRenderer.cs:181,216,226,235,1399-1405,1609` — regex inline chưa `Compiled` (đặc biệt `SanitizeOptionHtml` 7 `Regex.Replace`/option).
- `FormHtmlRenderer.cs:993-1023` — `DobParts` (120 năm) + `TimeParts` (60 phút) dựng lại mỗi render composite.
- Chuỗi `+` nối per-field (`FormHtmlRenderer.cs:1183-1185,1338-1341,741-744`).

> **Đòn bẩy lớn nhất (Part A):** một lớp memoize khóa `(formId, form.ModifiedOn)` bọc bộ ba *resolve + CSS compose + asset manifest* (dùng chung bởi `Schema`, `Form/{id}`, `RenderPage`, SSR) sẽ gộp A1, A2, A4, A5, A6 và phần lớn LOH churn của A3 — vì tất cả đều bất biến giữa 2 lần lưu form.

---

## PART B — Frontend Bundle / First-Paint / Asset Delivery

Đo thực tế bằng byte count trên `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/` (DNN & Web mirror).

**Payload thực của form PUBLIC (critical path, chưa nén):** ~**766 KB** (`megaform-renderer.js` 329 KB + `megaform.css` 141 KB + FontAwesome 100 KB + i18n runtime 63 KB + config 46 KB + widgets-builtin.css 40 KB + …) **+ 1 locale JSON (~70 KB) fetch on-demand**. Gate anon đúng: admin bundle bị loại qua `_adminOnlyAssets` (`Index.razor:1391`), plugin widget lazy-load, Monaco 4 MB builder-only.

### PERF-B1 — `megaform-renderer.js` = 336,728 B (329 KB) monolith trên MỌI form public `【P1 / High】`
- Tài sản critical-path lớn nhất; mọi field type inline (vd bảng 50 bang US nằm trong ~200 byte đầu). Không code-split nội bộ, không artifact nén sẵn. ~40% khối JS+CSS visitor phải tải+parse trước khi form interactive.

### PERF-B2 — FontAwesome full `all.min.css` = 102,526 B (100 KB) render-blocking `【P1 / High】`
- **File:** phát dạng `<link rel=stylesheet>` đồng bộ trong `<head>` (`RenderPage.cs:168` + Index.razor Resources). Full FA cho vài icon. Tree-shake xuống subset cắt ~90 KB CSS chặn render.

### PERF-B3 — Cache-bust thô toàn cục `MegaFormAssetVersion.Current="20260704-B363"` `【P2】`
- **File:** `MegaForm.Oqtane.Shared/AssetVersion.cs:29`. Một stamp bump tay gắn `?v=` vào **toàn bộ** ~40 asset → đổi 1 file bust cả 766 KB → tải lại toàn bộ mỗi deploy; `?v=` cũng khiến vài CDN từ chối cache. Nên dùng filename content-hash (`renderer.<hash>.js`) để `immutable, max-age=1y`.

### PERF-B4 — 13.5 MB font tự-host KHÔNG được tham chiếu ở đâu `【P1 / hygiene+risk】`
- **File:** `fonts/gf/` = 13,520,600 B (~528 woff2) + `fonts/gf/7c07b0f22a57.css` = 649,997 B chứa **738 `@font-face`**. Grep toàn source (TS/C#/razor/template/seed) → **0 tham chiếu** `fonts/gf`.
- **Rủi ro:** hoặc là rác 14 MB trong package/deploy (xóa được), hoặc nếu một premium template `customCss` `@import` sheet 650 KB/738-face này → **first-paint bomb** trên trang public đó. Cần xác định rõ orphan vs injected.

### PERF-B5 — 7.58 MB source maps (`*.map`, 32 file) ship lên production `【P2】`
- Lớn nhất: `megaform-submissions.js.map` 825 KB, `megaform-dashboard.js.map` 740 KB, `megaform-renderer.js.map` 525 KB. Bloat package + **lộ source code** nếu devtools request. Nên strip khỏi package production.

### PERF-B6 — Rác/stale trong package `【P2】`
- `css/acme-blog-mock.css` = 387,655 B (demo, không tham chiếu). `js/bundles/megaform-renderer.js` (160 KB, build cũ 2026-04-21, đã bị bản 336 KB thay) + `js/bundles/megaform-builder.js` (1.1 MB stale). ~1.7 MB rác + rủi ro wiring nhầm do trùng tên.

### PERF-B7 — Không có asset nén sẵn (`.br`/`.gz`) trong package `【P2】`
- Không tìm thấy file nén sẵn dưới module wwwroot. Delivery phụ thuộc hoàn toàn host bật response-compression cho static (Oqtane không đảm bảo mặc định). 329 KB renderer + 141 KB CSS gzip xuống ~1/3. Ship brotli-precompressed đảm bảo thắng bất kể host.
- **Lưu ý:** `Startup.cs:53-65` module CÓ `AddResponseCompression` (Brotli+Gzip) + `UseResponseCompression()` (`:225`) cho **dynamic response** — nhưng không thay việc ship static nén sẵn.

### PERF-B8 — `megaform.css` = 144,798 B (141 KB) monolith render-blocking `【P2】`
- Một sheet gộp form + admin + premium + theme, phần lớn inert trên form public nhưng đều chặn render. Tách "public form CSS" khỏi admin/theme rules cắt byte chặn render.

### PERF-B9..B11 — `【P3】`
- Builder TTI: `megaform-unified-monaco.js` 3.96 MB + `bundles/megaform-builder.js` 1.1 MB (không trên public path, nhưng ~5 MB nặng cho admin authoring).
- `RenderPage.cs:161-163` còn `preconnect` tới `fonts.googleapis.com`/`gstatic`/`cdnjs` dù đã self-host (warmup DNS/TLS thừa — hoặc dấu hiệu còn template hit Google Fonts, cần xác nhận).
- Ảnh hero PNG chưa tối ưu: `img/mock/americana-coast.png` 2.08 MB, `australia-coast.png` 1.97 MB, `bulgaria-*.png` ~1.7–1.9 MB. Nên WebP/AVIF + `loading=lazy` (đã nêu ở audit Form #743).

---

## PART C — Multi-Node Scalability & Data Access

### PERF-D1 — Bộ đếm redemption coupon nằm trong RAM → **multi-node overspend + reset khi restart** `【P1 / Blocker multi-node — correctness/tiền】`
- **File:** `MegaForm.Core/Payments/InMemoryCouponStore.cs:15,43-59`; singleton tại `MegaFormAspNetCoreExtensions.cs:407`.
- **Bằng chứng:** `RedeemAsync` kiểm `MaxRedemptions` với `ConcurrentDictionary<string,long> _redemptions` in-process. N node → mỗi node đếm riêng → coupon giới hạn 100 bị redeem ~100×N lần; restart → về 0 → redeem lại vô hạn.
- **Surface:** đường AspNetCore self-host (Web.Host + Samples).

### PERF-D2 — UniqueId counter static in-memory → **ID "unique" bị trùng giữa node & sau restart** `【P1 / Blocker multi-node — correctness】`
- **File:** `MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs:42,517-527` (**Oqtane + Web**); DNN tương tự. Chính comment `:515` thừa nhận *"Counters reset on app restart. For production use, add a real table."*
- **Bằng chứng:** `_uniqueIdCounters` static; `IncrementUniqueId` seed từ `startValue`. 2 node cùng start `startValue` → phát ID đụng nhau; chạy trên submit hot-path (`SubmissionProcessor.cs:205-213`). Phá vỡ mục đích invoice/ticket ref.

### PERF-D3 — Rate-limit store = static bag không giới hạn → **memory leak + O(N) scan + bypass N×** `【P1 / Blocker multi-node — anti-abuse】`
- **File:** `EfPhase2Repository.cs:44,547-570`. `_rateLimitBuckets` (`ConcurrentDictionary<string, ConcurrentBag<DateTime>>`) `bag.Add(DateTime.UtcNow)` mỗi submission, **không bao giờ xóa** entry hết hạn; `GetRecentSubmissionCount` lặp **mọi** bucket & **mọi** timestamp từng ghi.
- **Ba vấn đề chồng:** (a) RAM tăng vĩnh viễn theo tổng submission, (b) mỗi lần check chậm dần tuyến tính, (c) N node → limit hiệu dụng N× cấu hình → bypass chống-spam. **Active trên Oqtane + Web.**

### PERF-D4 — Conversion/Quiz singleton: unbounded + không multi-node + 1 list không thread-safe `【P1】`
- **File:** `FormAbandonmentService.cs:15`, `UserJourneyService.cs:15`, `Addons/Quiz/InMemoryQuizStore.cs:16` (singleton `:423,425,435`). Không evict → memory leak; analytics sai trên multi-node. `UserJourneyService.RecordStepAsync` `journey.Steps.Add(step)` (`:36`) **không lock** — `List<T>.Add` không thread-safe → concurrent step cùng journey có thể corrupt/throw.
- **Surface:** AspNetCore self-host.

### PERF-D5 — Scoped service giữ store instance → **tính năng hỏng ngay cả 1 node** `【P2】`
- **File:** `ConversationalFormService.cs:19` (`_sessions`, đăng ký **Scoped** `:422`); `EmailSummaryService.cs:21` (`_schedules`, Scoped `:429`). Mỗi request = scope mới → dictionary luôn rỗng ở request kế → `AnswerAsync` ném `KeyNotFoundException` cho session tạo ở request trước; email schedule biến mất tức thì.

### PERF-D6 — DNN app/query definitions nằm static process memory `【P2】`
- **File:** `MegaForm.DNN/Data/DnnRepositoryAdapters.cs:92-95` (`static _apps`, `static _queries`), tạo per-request `new DnnPhase2RepositoryAdapter()` (`DnnServiceLocator.cs:87`). Comment: *"Temporary bridge."* Config admin biến mất khi recycle app-pool, không đồng nhất giữa node.

### PERF-D7 — Workflow-run stub tăng vô hạn `【P3】`
- **File:** `EfPhase2Repository.cs:47,477-489`. `_workflowRunStub` static, add mỗi run, không evict → leak chậm theo tổng workflow execution.

> **Ghi chú captive dependency:** đã kiểm — **KHÔNG có** Singleton bắt Scoped `DbContext` (repo dùng `IDbContextFactory`). Lớp lỗi này vắng mặt. ✅

### Data-access queries

### PERF-E1 — `MF_SubmissionValues` KHÔNG có secondary index; reindex DELETE full-scan mỗi submit `【P2 / High khi table lớn】`
- **File:** `MegaFormDbContext.cs:86-90` chỉ `HasKey(ValueId)` — không index `SubmissionId`/`FormId`/`FieldKey`. `SubmissionIndexerService.cs:147` chạy `DELETE FROM MF_SubmissionValues WHERE SubmissionId=@id` **mỗi submission** (`SubmissionProcessor.cs:270`); mọi report filter theo `SubmissionId`/`FormId`/`FieldKey`.
- **Tác động:** table báo cáo dành-cho-scale nhưng unindexed → mỗi submit trả phí full-scan delete; mỗi report scan. Cần index `(SubmissionId)` và `(FormId, FieldKey)`.

### PERF-E2 — Email summary nạp **toàn bộ** submission của kỳ vào RAM `【P2】`
- **File:** `EmailSummaryService.cs:32` — `List(formId, null, null, periodStart, periodEnd, 0, int.MaxValue)` → `Take(int.MaxValue)`, rồi deserialize từng `DataJson` trong loop (`:45-57`). Tenant lớn → kéo + parse hàng triệu row/1 request. Nên page/aggregate trong SQL.

### PERF-E3 — Global submissions list: 1 query/1 form riêng biệt (N+1, DbContext mới mỗi lần) `【P2】`
- **File:** `SubmissionQueryService.cs:62-75` — `foreach (formId ...) _forms.GetForm(formId)`, mỗi `GetForm` (`EfRepositories.cs:15-19`) tạo DbContext mới. Tới `pageSize` (≤250) DbContext/query mỗi page. Nên `WHERE FormId IN (...)`.

### PERF-E4 — Auto-link on submit nạp tới 2000 parent row + deserialize từng cái (hot path) `【P2】`
- **File:** `SubmissionProcessor.cs:448-465` (`TryAutoLinkSubmission`, mỗi submission). Với parent key ≠ `SubmissionId`: `List(ParentFormId, 0, 2000)` rồi JSON-deserialize từng parent tuyến tính. → (a) O(2000) parse/submit trên form liên kết, (b) **cap correctness ngầm**: parent >2000 không bao giờ link.

### PERF-E5 — Submission search = leading-wildcard scan trên NVARCHAR(MAX) `【P2】`
- **File:** `EfRepositories.cs:142` — `s.DataJson.Contains(search)` → `LIKE '%search%'` non-sargable trên cột MAX. Mọi keyword search full-scan `MF_Submissions`.

### PERF-E6 — Submission workflow detail: N+1 xuyên task `【P2】`
- **File:** `SubmissionWorkflowDetailService.cs:59-63,120-143,171-177` — `ListTaskActions(taskId)` 1 lần/task, mỗi lần DbContext mới; `ResolveWorkflowCase` loop task gọi `GetCase`/`GetCaseByExecution`. T task → ~T+ round trip cho 1 trang detail. Nên batch `TaskId IN (...)`.

### PERF-E7..E10 — `【P3】`
- Read query thiếu `AsNoTracking()`: `EfRepositories.cs` `GetForm:18`, `ListForms:29-35`, `List:137-144`, `Get:125`, `GetValues:131` (trong khi `DuplicateForm`/`EfWorkflowRepository` reads *có* — không nhất quán).
- `GetFormStats` 6 round trip aggregate riêng (`EfRepositories.cs:71-84`), gọi trên submit path khi `MaxSubmissions` set.
- `DatabaseWorkflowMetadataService.cs:15,228-236` cache static không evict entry hết hạn.
- `ListForms` title search `Contains` non-sargable (`EfRepositories.cs:32`).

> **Đã làm ĐÚNG (không flag):** `MF_Submissions` index tốt `(FormId, SubmittedOnUtc)` + `(FormId, Status, SubmittedOnUtc)` (`MegaFormDbContext.cs:78-83`); pagination clamp ≤250/≤500; `_auditLogStub` bound 1000 entry (`EfPhase2Repository.cs:508-509`); indexer bọc try/catch riêng để lỗi index không rollback submit.

---

## PART F — Concurrency & Reliability (resource exhaustion)

### PERF-C1 — 6 `new HttpClient()` per-call trong DNN RazorWidget (4 cái `[AllowAnonymous]`) → **socket exhaustion** `【P1 / High】`
- **File:** `MegaForm.DNN/WebApi/RazorWidgetController.cs:64,89,118,170,198,222`. `List`(L59)/`Source`(L81)/`Render`(L106)/`Preview`(L193) anon; `Render` chạy mỗi trang public có Razor widget.
- **Failure mode:** `HttpClient` dispose để lại socket `TIME_WAIT`; traffic anon bền vững → cạn ephemeral port → `SocketException: address already in use` → 503 dây chuyền. Nên 1 static/`IHttpClientFactory`.

### PERF-C2 — Captcha verify: `new HttpClient()` per-call, **KHÔNG timeout**, trên public submit `【P1 / High】`
- **File:** `MegaForm.DNN/WebApi/MegaFormApiController.cs:1513`; `MegaForm.Web/Controllers/MegaFormController.cs:1400`. `new HttpClient()` (default 100s) rồi `PostAsync`. Mỗi submit có captcha spin client mới → socket churn; **+** không timeout → endpoint captcha chậm pin thread request tới 100s → thread-pool starvation. Đòn kép trên đường submit công khai.

### PERF-C3 — `.Result` trên async workflow trong controller DNN (classic ASP.NET) → nguy cơ deadlock `【P2】`
- **File:** `MegaForm.DNN/WebApi/Phase2ApiController.cs:674` — `ExecuteWorkflowAsync(...).Result`. Trên `SynchronizationContext` classic, inner `await` không `ConfigureAwait(false)` → deadlock vĩnh viễn request.

### PERF-C4 — AI CLI spawn: `WaitForExit(timeoutMs)` chặn thread tới 180s/600s, **không giới hạn concurrency** `【P2】`
- **File:** `MegaForm.Oqtane.Server/Controllers/AiAssistantController.cs:284`; `MegaForm.Web/Controllers/AiAssistantController.cs:159`. Không `SemaphoreSlim` gate → spawn `claude`/`kimi` process không chặn. Mỗi request giữ 1 thread-pool thread block nhiều phút + 1 OS process. Admin-gated (giảm phơi nhiễm).

### PERF-C5 — `PaymentController` static `HttpClient` **không timeout, không CancellationToken** `【P2】`
- **File:** `MegaForm.Web/Controllers/PaymentController.cs:43` (`new HttpClient()` không Timeout); `SendAsync` tại `:191,250,424,487,575` không truyền token. Static (socket ổn) nhưng default 100s + không cancel → provider suy giảm pin thread tới 100s/request trên payment path.
- **Đối chiếu đúng:** `GoogleSheetsAuthService.cs` (static, 30s, truyền `ct`); `WebhookNodeExecutor.cs` (linked-CTS `CancelAfter`, cap 120s).

### PERF-C6 — Webhook submission: 30s timeout nhưng không cancel/không circuit-breaker + **thiếu SsrfGuard** `【P2 — reliability + security】`
- **File:** `MegaForm.Core/Services/WebhookService.cs:17,49,73,118`. Gửi `form.WebhookUrl` **không** qua `SsrfGuard` (đã xác minh: executor có ở `WebhookNodeExecutor.cs:125`, service này không). Endpoint chậm/down cộng tới 30s vào response submit, không breaker để shed. **Vi phạm SECURITY_CODING_RULES rule #11** (mọi outbound URL user-config phải qua SsrfGuard) — SSRF authenticated còn mở ở đường webhook cấp-form. → xem SEC-M-SSRF.

### PERF-C7..C11 — `【P3】`
- Sync-over-async starter provisioning (~20 site): `WorkflowStarter.cs:373,383,387`, `*StarterService.cs` (block, không deadlock trên ASP.NET Core; tần suất thấp).
- `AiToolsController.cs:2672-2673` (DNN) `.GetAwaiter().GetResult()` trên HttpClient.
- `BlogScheduledHostedService.cs:32` Timer không overlap-guard → double-publish nếu `DoWork` >5 phút.
- Pipe-read deadlock trong kimi spawn opt-in: `MegaForm.Web/Controllers/MegaFormLocalAiController.cs:207-208`, Oqtane `:273-275` (stderr không drain / drain tuần tự). Gated `MEGAFORM_ALLOW_LOCAL_AI_CLI=1`.
- `catch {}` rỗng (100+ site, tập trung `MegaFormApiController.cs`, `FormView.ascx.cs`): phần lớn là cleanup best-effort hợp lệ; lo ngại là các nhánh non-cleanup nuốt exception không log trên request path → giấu lỗi production khỏi telemetry.

> **Đã làm ĐÚNG:** `MegaFormWarmupHostedService` (fail-soft, không chặn startup, 20s timeout, pre-JIT anon path — đọc kỹ, thiết kế tốt ✅); `WebhookNodeExecutor` (SSRF guard + linked-CTS + retry/backoff bounded ✅); `CompositePresetRegistry`/`MegaFormStrings` (`static readonly` read-only ✅); **không có `lock` bao quanh `await`** (đã grep toàn bộ ✅).
> **Isolation note:** `RazorWidgetRegistry.Override` (`:75-79`) mutate singleton process-wide → 1 tenant compile Razor thay template cho **mọi** tenant (lo ngại cách ly đa-tenant, không phải crash).

---

## PART G — Security Hardening (trạng thái hiện tại, đã verify theo code)

> Đây là **hợp nhất + verify lại theo code**, không lặp lại toàn bộ MYTHOS. Nơi doc cũ ≠ code, **code thắng** và được đánh dấu.

### ✅ Đã ĐÓNG (verify theo code)
- **RazorWidget.Action unauth DML (was P0):** admin-gate cả 3 platform — Oqtane `RazorWidgetController.cs:269`, Web `:230`, DNN `:141` (`if(!IsAdmin) 403`); `RazorActionSqlGuard` giữ làm defense-in-depth.
- **Stored-XSS `{{content:*}}` (was P0/P1-7):** content-token nay `Esc()` HTML-encode.
- **CustomHtml raw render:** raw by-design (`FormHtmlRenderer.cs:206`) nhưng **đường ghi duy nhất là `SaveForm` admin-gated** (`MegaFormController.cs:343` `[Authorize(Policy="EditModule")]`) — không có đường anon ghi CustomHtml. Residual P3 (thiếu sanitizer defense-in-depth).
- **SSRF workflow node (P0-8), JWT forgery Component (P0-9), path traversal (P1-8), DNN Upload/List+SVG (P1-9), SaveStyle IDOR (P1-2), AiKnowledge* CSRF (P1-12)** — đã đóng.

### ⛔ SEC-B1 — Oqtane `SaveModuleStyle` **thiếu `[ValidateAntiForgeryToken]`** → CSRF `【P1 / Blocker】`
- **File:** `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:2730-2734` — chỉ `[Authorize]` + `CanUseAdminPopup()`, **không** antiforgery; controller class-level `[IgnoreAntiforgeryToken]` (`:47`). Sibling `SaveStyle` (`:2684`) **CÓ** `[ValidateAntiForgeryToken]`.
- **Đã tự xác minh (đọc `:2682-2740`).** ⚠️ **Trái với doc** `MYTHOS_..._REAUDIT_2026-07-04` §9b ghi SaveModuleStyle "đã thêm token" — **code cho thấy chưa**.
- **Rủi ro:** CSRF nhắm admin/host → ghi đè module CSS → stored-XSS/defacement.

### ⛔ SEC-B2 — Payment `ResolveServerAmount` **fail-open** khi thiếu `formId`/`fieldKey` `【P1 / Blocker】`
- **File:** `MegaForm.Web/Controllers/PaymentController.cs:77-78` — `if(formId<=0 || string.IsNullOrWhiteSpace(fieldKey)) return (clientAmount, clientCurrency, null);`. Thêm nhánh fail-open `:95-96,100-102,116`. Controller là proxy public (không `[Authorize]`), dùng cho cả Stripe (`:167`) + PayPal (`:375`).
- **Rủi ro:** attacker bỏ `formId`/`fieldKey` → charge số tiền tùy ý (hạ giá) trên field fixed-price. Enforcement fixed-mode chính (`:104-112`) hoạt động; lỗ là các nhánh thoát.

### 🔶 SEC-H — nhóm P2
- **SEC-H1 Class-level `[IgnoreAntiforgeryToken]` còn trên nhiều admin controller.** Oqtane (8): `MegaFormController:47`, `AiAssistantController:28`, `AiToolsController:28`, `SubformController:30`, `RazorWidgetController:24`, `UserTemplateController:64`, `MegaFormLocalAiController:32`, `MegaFormPopupPhase2Controller:13`. Web (11, JWT-mitigated → P3): `UserTemplateController:15`, `SubformController:21`, `ReportsController:22`, `RazorWidgetController:20`, `MegaFormLocalAiController:23`, `AiToolsController:24`, `AiAssistantController:18`, `AiKnowledge*`. Mutator chưa re-arm token → CSRF nhắm admin.
- **SEC-H2 `SubformController.Compute` `[AllowAnonymous]` → anon DoS.** Oqtane `:158`/Web `:130`/DNN `:302`. Đánh giá công thức client-supplied (whitelisted func) **không giới hạn length/row/rate**.
- **SEC-H3 DNN `AiToolsController.AppEndpoint` `[AllowAnonymous]` → anon SQL config-dependent.** `MegaForm.DNN/WebApi/AiToolsController.cs:1359` chạy SELECT/WITH từ `MF_AppEndpoints` khi row `AllowAnonymous=1`; chỉ regex keyword guard. Cân nhắc read-only DB account + signed token.
- **SEC-H4 Error leakage `ex.Message`/`ToString()` cho client — 118 hit/25 file.** Hot spot: `PaymentController.cs:214,276,351,452,524` (`"Internal error: "+ex.Message`), `UserTemplateController.cs:88,102,115,148,182,215`, `AiToolsController`, `WorkflowStarter`, `MegaFormController`. Lộ schema/path/connection.
- **SEC-H5 Cookie `SecurePolicy=SameAsRequest` ngoài Dev** (`MegaForm.Web/Program.cs:125-127`) — nên `Always`.
- **SEC-H6 CORS `AllowAnyOrigin()` default** khi `MEGAFORM_CORS_ORIGINS` chưa set (`Program.cs:170`) — production phải set env.

### 🔷 SEC-M — SSRF cấp-form (nâng từ reliability C6) `【P2】`
- `WebhookService.SendWebhookAsync` gửi `form.WebhookUrl` không qua `SsrfGuard` (`WebhookService.cs:49`). SSRF authenticated (admin cấu hình URL) + **vi phạm rule #11**. `SsrfGuard` mới chỉ wire vào 1 trong 2 đường webhook.

### 🔹 SEC-L — P3 / informational
- JWT key fallback về config non-Dev (`Program.cs:95` `MEGAFORM_JWT_KEY ?? cfg["Jwt:Key"]`) — env-first (tốt) nhưng không fail-closed.
- `DevBypassHandler` (`Program.cs:226`, cấp Administrator cho mọi người) — **dead code, chưa `AddScheme` bao giờ** (đã grep). Không exploitable; **khuyến nghị xóa** để tránh wiring nhầm tương lai.
- Hardcoded demo/QA password (`Index.razor` starter, `Samples/CorporateWeb*/SetupCompletionService.cs` `admin123`) — fixture, không phải auth production; giữ trong Development gate.
- Web `UserTemplateController` CSRF residual (`:15,105,151` thiếu token, khác twin Oqtane) — JWT + `IsHostOrAdmin` + `dev.lock` + path sandbox giảm nhẹ → P3.

---

## PART H — Operational / Production-Readiness (module-owned)

### OPS-1 — **Không có rate limiting** ở đâu trong toàn repo `【P2 / High cho public endpoint】`
- Đã grep toàn repo (`AddRateLimiter`/`UseRateLimiter`/`RateLimitPartition`) → **0 hit**. Module ship endpoint anon `Submit`/`UploadFile`/`Render`/`Compute` nhưng không throttle ở tầng ứng dụng. Chống-spam duy nhất là rate-limit đếm-trong-RAM (xem PERF-D3, đã hỏng multi-node). Public submit/upload không giới hạn = bề mặt DoS/abuse. → Với Oqtane/DNN host, khuyến nghị rate-limit tầng edge/WAF; với `MegaForm.Web`, thêm `AddRateLimiter`.

### OPS-2 — Không có health check endpoint `【P2】`
- Grep `AddHealthChecks`/`MapHealthChecks` → 0 hit. Không có `/health` (liveness/readiness) cho load balancer/orchestrator multi-node quyết định route/restart. `MegaFormWarmupHostedService` warm nhưng không expose readiness.

### OPS-3 — Không có security header/HSTS trong module Startup `【P3 — host thường sở hữu】`
- `Startup.cs` không set `UseHsts`/`X-Frame-Options`/`Content-Security-Policy`/`X-Content-Type-Options` toàn cục (chỉ per-response `nosniff` cho download — P2-4 đã fix). Với Oqtane/DNN, host sở hữu; với bản host độc lập, cần bổ sung.

### OPS-4 — Observability hạn chế `【P3】`
- Dùng `ILogger<T>` (structured — tốt) nhưng không Serilog/OpenTelemetry/ApplicationInsights → thiếu distributed tracing/metrics để chẩn đoán các finding trên (socket exhaustion, thread starvation, GC pressure) dưới tải production. Với module, kế thừa logging host; với host độc lập, nên thêm OTel + metrics.

### OPS-5 — Đa dạng TFM `【thông tin】`
- `net472` (DNN) + `net8.0`/`net9.0`/`net10.0`. `MegaForm.Core` multi-target `net472;net8.0;net9.0;net10.0`. Hợp lý cho parity 4-platform nhưng tăng ma trận build/test; lưu ý surface `net472` (DNN) không có nhiều tối ưu runtime hiện đại (vd `IHttpClientFactory` mặc định, System.Text.Json perf).

---

## PART I — Bảng tổng hợp & lộ trình ưu tiên

### Bảng chốt chặn production (must-fix)

| ID | Vấn đề | Loại | Mức | Chặn kịch bản |
|---|---|---|---|---|
| SEC-B1 | SaveModuleStyle thiếu antiforgery (doc ghi nhầm đã fix) | Sec | P1 | 1-node + multi |
| SEC-B2 | Payment fail-open thiếu formId/fieldKey | Sec | P1 | 1-node + multi |
| PERF-D1 | Coupon overspend multi-node | Perf | P1 | multi-node |
| PERF-D2 | UniqueId trùng multi-node/restart | Perf | P1 | multi-node |
| PERF-D3 | Rate-limit bypass N× + leak | Perf | P1 | multi-node |
| PERF-C1 | Socket exhaustion DNN RazorWidget | Rel | P1 | tải cao |
| PERF-C2 | Captcha no-timeout public submit | Rel | P1 | tải cao |
| PERF-A1/A2 | Render schema uncached ×5-6 | Perf | P1 | trần throughput |

### Lộ trình đề xuất (audit-only — không code trong đợt này)

**Sprint 0 — Gỡ blocker 1-node (nhỏ, khẩn):**
1. SEC-B1: thêm `[ValidateAntiForgeryToken]` cho `SaveModuleStyle` (+ đồng bộ client gửi token) — cập nhật doc MYTHOS cho đúng.
2. SEC-B2: fail-closed khi thiếu `formId`/`fieldKey` (reject, không nhận client amount).
3. PERF-C2: HttpClient captcha → static + timeout ngắn (vd 10s) + `CancellationToken`.

**Sprint 1 — Trần throughput + reliability tải cao:**
4. PERF-A1/A2/A4/A5/A6: 1 lớp memoize `(formId, ModifiedOn)` bọc resolve+CSS+manifest.
5. PERF-C1: DNN RazorWidget dùng 1 static/`IHttpClientFactory`.
6. PERF-C5/C6: Payment + WebhookService thêm timeout/cancel; WebhookService qua `SsrfGuard` (đóng SEC-M).
7. OPS-1: rate-limit cho public `Submit`/`Upload`/`Compute` (app hoặc edge).

**Sprint 2 — Multi-node correctness (điều kiện gọi "enterprise"):**
8. PERF-D2 (UniqueId) → bảng DB `MF_UniqueIdCounters` (đã có DbContext); PERF-D3 (RateLimit) → bảng/`IDistributedCache`; PERF-D1 (Coupon) → DB redemption; PERF-D4/D5/D6 → external/persisted store.
9. PERF-E1: thêm index `MF_SubmissionValues(SubmissionId)` + `(FormId, FieldKey)`.
10. OPS-2: `/health` liveness+readiness.

**Sprint 3 — Hygiene & first-paint:**
11. PERF-B4/B5/B6: xóa font `gf/` (nếu orphan), source maps, `acme-blog-mock.css`, `bundles/` stale (~22 MB off deploy).
12. PERF-B7: ship brotli-precompressed static (~3× nhanh path 766 KB).
13. PERF-B2/B1/B8: tree-shake FontAwesome; cân nhắc code-split renderer; tách public vs admin CSS.
14. PERF-B3: filename content-hash → immutable caching.
15. PERF-B9/hero: WebP/AVIF + `loading=lazy`.
16. SEC-H4: bọc error handler generic + error-ID; SEC-H1: re-arm antiforgery từng mutator + đồng bộ client; SEC-H5/H6: cookie `Always` + CORS opt-in.

### Điểm cộng đã làm đúng (ghi nhận)
- `MF_Submissions` index đúng cho list query chủ đạo; pagination clamp.
- `SsrSnapshots` cache SSR có TTL 5' + soft-cap 128.
- `IDbContextFactory` khắp nơi → **không** captive-dependency.
- `MegaFormWarmupHostedService` pre-JIT anon path, fail-soft.
- `WebhookNodeExecutor` mẫu chuẩn: SSRF guard + linked-CTS timeout + retry bounded.
- Không có `lock` quanh `await` (đã grep toàn bộ).
- Widget plugin **lazy-load**; locale JSON **lazy** (1/39 fetch); Monaco 4 MB builder-only, **không** trên public path.
- `AddResponseCompression` (Brotli+Gzip) đã bật cho dynamic response.
- Content-token đã encode; RazorWidget.Action đã admin-gate 3 platform; guard SQL word-boundary.

---

## Phụ lục — Phương pháp & giới hạn

- **Read-only.** Không thực thi tấn công thật, không benchmark tải thật (số throughput là suy luận từ code path, không đo). Các con số byte là `stat`/`find` thực tế trên `wwwroot`.
- **Nguồn evidence:** đọc trực tiếp source + 5 luồng audit song song; các finding tự-verify (SEC-B1, SEC-M/WebhookService SsrfGuard, no-rate-limit, no-response-cache, Roslyn ALC, hero/i18n size) đã đọc lại tận file.
- **Không kết luận về host config thực tế** (IIS/Kestrel compression, HTTP/2, WAF) — đó là biến vận hành ngoài repo; finding OPS phân biệt rõ module-owned vs host-owned.
- **Multi-node claims** giả định >1 instance chia tải; nếu triển khai vĩnh viễn 1-node + sticky, PERF-D* hạ xuống "leak/reset khi restart" thay vì "sai correctness".

*Tài liệu audit-only. Không thay đổi code trong đợt này.*
