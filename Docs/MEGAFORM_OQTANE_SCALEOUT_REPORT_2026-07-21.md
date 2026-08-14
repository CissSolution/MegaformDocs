# Báo cáo nghiên cứu: MegaForm đáp ứng yêu cầu Scaling của Oqtane 10.2

> Ngày: 2026-07-21 — Kimi Code CLI
> Phạm vi: **chỉ nghiên cứu, không code**. Nguồn: khảo sát trực tiếp source `MegaForm.Core`, `MegaForm.Oqtane.Client/Server/Shared`, `MegaForm.Umbraco`, `MegaForm.DNN` + release notes Oqtane.
> Tham chiếu Oqtane: [Release 10.2.0](https://github.com/oqtane/oqtane.framework/releases/tag/v10.2.0), [Oqtane blog — demo scale-out 10.2](https://www.oqtane.org/blog).

---

## 1. Tóm tắt điều hành

MegaForm về **kiến trúc nền đã phù hợp scale-out ở mức ~70%**: toàn bộ state chính (forms, submissions, workflow, AI KB, payment store, module settings) nằm trong **DB tenant dùng chung**, DI đúng lifetime (không singleton giữ request state), public form path là **REST + JS renderer hoàn toàn stateless**, module tự khai báo **Static SSR** — rất hợp với hướng đi của Oqtane 10.2.

Tuy nhiên có **3 nhóm blocker thật sự** phải xử lý trước khi chạy web farm/Autoscale:

1. **File storage trên local disk** — upload 2 bước, template catalog, locked-forms, images, i18n JSON đều ghi vào `App_Data` / `wwwroot` của từng node.
2. **State nghiệp vụ in-process** — UniqueId counter (trùng mã giữa các node), payment replay-guard, rate limiter, audit log stub trong `EfPhase2Repository`.
3. **Hosted services không có leader election** — blog scheduler 5 phút chạy trùng trên mọi node, rollup analytics bị lost-update.

Ngoài ra cần **cấu hình host-level** (không phải code): sticky session/Azure SignalR nếu site chạy Interactive Server, Data Protection key ring chia sẻ, license file trên mọi node, đồng bộ appsettings/SMTP giữa các node.

Một điểm cần chỉnh trong kỳ vọng: `MegaForm.Oqtane.Server.csproj` đang reference **Oqtane 10.1.0**, chưa phải 10.2 — cần nâng package và retest (xem §6).

---

## 2. Cơ chế scaling thực tế của Oqtane 10.2 (đối chiếu với mô tả nghiên cứu)

Release notes v10.2.0 xác nhận hướng scale-out tập trung vào:

| Cơ chế (theo nghiên cứu của user) | Thực tế trong Oqtane 10.2 | Điểm MegaForm cần bám vào |
|---|---|---|
| Distributed Caching | Tích hợp **FusionCache** toàn framework (#6170-6174), abstraction **`CacheManager`** wrap FusionCache + hỗ trợ multi-tenancy (#6193), hỗ trợ đồng thởi `MemoryCacheDuration` + `DistributedCacheDuration` (#6200), **Redis backplane** đồng bộ cache giữa các web instance; backplane có thể dùng **độc lập** với distributed cache (#6204) | `ISyncManager`/sync events của Oqtane sẽ lan truyền cross-node qua backplane → cơ chế invalidate settings của MegaForm (#9 bên dưới) tự được giải nếu host bật backplane |
| Folder Providers | Lưu trữ file tập trung (Azure Blob/AWS S3) thay local disk | MegaForm **chưa dùng** abstraction này — toàn bộ upload ghi local disk (§3.1) |
| Blazor Static SSR | SSR tĩnh giảm RAM, bỏ circuit SignalR cho anonymous | MegaForm đã tự khai báo `RenderModes.Static` — **điểm mạnh sẵn có** (§3.3) |
| Multi-Tenant | Nhiều site trên 1 installation, DB tách hoặc gộp | MegaForm scope theo `PortalId` = SiteId; có **khoảng trống cách ly ở submissions** (§3.4) |
| (bổ sung) Background jobs | `HostedServiceBase` được nâng cấp hỗ trợ scale-out (#6205); Job Log có **server + instance id** (#6184-6187) | MegaForm **không dùng** job framework của Oqtane mà tự chạy `IHostedService` + Timer → không hưởng lợi (§3.5) |

> Lưu ý: cache invalidation của framework trước đây dựa trên `IEventSubscriber` + `EventDistributorHostedService` (in-process). Sang 10.2, với Redis backplane, sync/cache-invalidation có thể lan giữa các instance — đây là thay đổi quan trọng nhất với MegaForm.

---

## 3. Hiện trạng MegaForm đối chiếu từng cơ chế

### 3.1 Distributed Caching & đồng bộ state giữa các node

**Đã sẵn sàng (scale-out-safe):**

- MegaForm **không dùng trực tiếp** `IMemoryCache`/`IDistributedCache`/`HttpContext.Session` nào (grep toàn repo = 0 kết quả ngoài comment). Không có anti-forgery/session token in-memory; CAPTCHA verify là server-to-server stateless.
- Repository EF thuần DB: `IDbContextFactory<MegaFormDbContext>` transient (`MegaForm.Oqtane.Server/Services/Startup.cs:71`), tạo context mới mỗi thao tác — form schema sửa ở node A là node B đọc **fresh** ngay (repository không cache).
- `RenderModelResolver._resolvedSchemaCache` (`MegaForm.Core/Rendering/RenderModelResolver.cs:103-149`) là **content-addressed** (key = SHA256 của schema+settings) → không bao giờ stale, bounded 128 entries.
- Static `HttpClient` đúng chuẩn (`PaymentGatewayClient.cs:49`, `WebhookService.cs:19`, `GoogleSheetsAuthService.cs:20`).
- Schema install idempotent (`MegaFormManager.cs:44-89`): N node cùng boot vẫn converge; seed KB race được chặn bởi unique index `(Slug, PortalId)` (`MegaFormDbContext.cs:384`).

**Rủi ro / gap:**

| # | Vấn đề | Evidence | Hệ quả trên farm |
|---|---|---|---|
| C1 | UniqueId counter in-memory, không seed từ DB | `EfPhase2Repository.cs:42, 517-521` → `UniqueIdService.cs:17` | **Hai node sinh trùng mã** (PO/đơn leave); restart reset về 0 → trùng dữ liệu cũ. Blocker nếu form dùng field UniqueId |
| C2 | Payment replay-guard + webhook facts per-process (code tự ghi *"single-node by design"*) | `PaymentTransactionRegistry.cs:14-30`; dùng ở `PaymentSubmissionVerifier.cs:168`, `PaymentWebhookService.cs:73-210` | 2 submission cùng 1 giao dịch vào 2 node đều qua; webhook đáp node A, submit ở node B mất cross-check. Chỉ còn duplicate-search LIKE trên `DataJson` với cửa sổ race read-then-insert |
| C3 | Rate limiter per-process (payment + submission) | `PaymentRateLimiter.cs:22`; `EfPhase2Repository.cs:44, 564-570` | Quota thực tế = limit × N node. Lưu ý thêm: `AntiSpamService.RateLimitChecker` **chưa được wire trên Oqtane** (chỉ DNN gán ở `DnnServiceLocator.cs:133`) → rate limit submit đang bị bypass hoàn toàn trên Oqtane |
| C4 | Audit log & workflow-run là static stub, mất khi restart | `EfPhase2Repository.cs:46-47, 477-511` (giới hạn 1000 entries) | Admin xem log trên node B không thấy hành động ở node A; không bền |
| C5 | SSR snapshot cache per-process, evict chỉ trên node xử lý save | `Index.razor:1548, 3008, 3133-3135` | Node khác giữ snapshot cũ tới khi hết TTL — jank "wireframe → form" quay lại, không sai dữ liệu |
| C6 | Settings cache invalidation không lan (trên Oqtane ≤10.1) | `MegaFormController.cs:3601-3617` bắn `ISyncManager.AddSyncEvent` — in-process | Đổi `MegaForm:FormId`/module settings ở node A, node B render cũ tạm thởi. **Oqtane 10.2 backplane (#6204) là câu trả lởi sẵn có cho điểm này** — cần verify sau khi nâng 10.2 |
| C7 | Static cache không TTL | `DatabaseInsertBindingResolver.Cache` (`:41-42`) | Schema bảng ngoài đổi → cache cũ sống tới khi restart từng node |
| C8 | License đọc file local + static cache 30-60s | `LicenseService.cs:38-65` | Mỗi node phải có file license; node thiếu → chạy trial cap (10 forms/25 submissions), hành vi lệch giữa các instance |

**In-memory stores dormant trên Oqtane** (chưa wire, nhưng sẽ là blocker nếu bật): `ConversationalFormService._sessions` (`Conversion/ConversationalFormService.cs:19`), `InMemoryQuizStore`, `InMemoryCouponStore` (coupon redemption count per-process), `EmailSummaryService._schedules`, `FormAbandonmentService`/`UserJourneyService`/`LeadFormService`, `FormTemplateCatalogService._templates` — tất cả chỉ đăng ký ở `MegaForm.AspNetCore.Component` và `MegaForm.Umbraco`, chưa có trong Oqtane `Startup.cs`.

### 3.2 Folder Providers / file storage

**Đây là blocker số 1.** Mọi dữ liệu runtime-writable đều nằm trên local disk theo 3 root, không có cấu hình storage root, không `IFileProvider`, không implementation Blob/S3:

| Loại file | Path (Oqtane) | Evidence | Vỡ thế nào trên farm |
|---|---|---|---|
| Upload field (private) | `{ContentRoot}/App_Data/MegaForm/PrivateUploads/form-{id}/field-{key}/{guid16}{ext}` | `MegaFormController.cs:1754-1767`; download `:1967-1990`; `OqtaneStorageService.cs:25` | **Flow upload 2 bước**: POST file nhận `tempPath` → submit kèm `tempPath`. LB đưa 2 request sang 2 node → **submit mất file**. Đây là điểm gãy nghiêm trọng nhất |
| Ảnh public (Token Designer) | `wwwroot/Modules/MegaForm/Images/{yyyy-MM}/{guid12}{ext}` | `MegaFormController.cs:1795-1845` | URL public 404 trên node khác; wwwroot có thể read-only trên container Linux |
| PDF templates | `wwwroot/Modules/MegaForm/PdfTemplates/` | `MegaFormController.cs:1927-1950` | Tương tự |
| Builder template catalog | `App_Data/MegaForm/Templates` | `BuilderTemplateCatalogService.cs:18, 28-45`; `BuilderTemplateCatalogStore.cs:289` | Admin lưu template ở node A → node B thấy catalog cũ (disk riêng + cache per-instance) |
| Locked forms | `App_Data/MegaForm/locked-forms.json` | `MegaFormController.cs:535-556` | Lock form vô hình với node khác; 2 admin ghi đồng thởi race file (không lock) |
| i18n locale JSON | `wwwroot/Modules/MegaForm/js/builder/i18n/{locale}.json` | `MegaFormController.cs:894-934` (comment line 873-874 tự thừa nhận read-only risk) | Bản dịch AI/hand-edited chỉ tồn tại trên 1 node. Umbraco đã làm đúng hơn: để ở `App_Data/MegaForm/i18n` |
| User templates (BYOM) | `{ContentRoot}/Resources/UserTemplates` | `UserTemplateController.cs:94, 505-510` | Dev-time, ít ảnh hưởng production nhưng cần CI/CD đồng bộ |

**Điểm cắm sẵn có:** `IStorageService` (`MegaForm.Core/Interfaces/ICoreInterfaces.cs:182-188`: `SaveFileAsync/GetFile/DeleteFile/GetFileUrl`) — abstraction duy nhất, nhưng (a) implementation duy nhất là disk (`OqtaneStorageService`), (b) **upload pipeline chính bypass nó** (ghi thẳng `FileStream` tại `MegaFormController.cs:1754`), chỉ SDK Files API dùng.

**Điểm tốt:** tên file nhất quán dùng GUID (unique, unguessable — phù hợp capability URL); export CSV/JSON build trong memory không chạm disk; log dùng `ILogManager` của Oqtane (DB-based).

**Hướng xử lý (khi được phép code):** implement `IStorageService` trên Azure Blob/S3 (hoặc bám vào Folder Providers của Oqtane 10.2), refactor `UploadFile`/`Files/Download`/image/PDF upload đi qua abstraction; dởi `locked-forms.json` + i18n JSON + template catalog sang DB hoặc shared store. Phương án tạm thởi không cần code: **mount shared volume (Azure Files)** vào `App_Data/MegaForm` + các thư mục wwwroot nói trên — nhưng không giải quyết race ghi `locked-forms.json`.

### 3.3 Blazor Static SSR & render pipeline

**Điểm mạnh sẵn có, rất hợp Oqtane 10.2:**

- Module tự khai báo Static SSR: `Index.razor:1301 public override string RenderMode => RenderModes.Static;`. Form public render bằng JS bundle (megaform-renderer) fetch `/api/MegaForm/Schema/{id}` — **không phụ thuộc Blazor circuit** → path public scale-out tự do, không cần sticky session, không tốn RAM cho SignalR circuit với anonymous users. Đúng tinh thần SSR của 10.2.
- Module có nhận biết và xử lý khi site chạy Interactive Server (`Index.razor:1303-1311 IsHostInteractive`).
- Không có SignalR hub riêng (grep `Hub|SignalR` trong Server chỉ ra comment).
- `MegaFormWarmupHostedService` (`Startup.cs:290`) self-HTTP loopback pre-JIT **per node** — instance mới do autoscale spin lên tự warm, đây là pattern đúng cho Autoscale.
- ResponseCompression bật site-wide (`Startup.cs:53-66, 321`) — stateless, skip WebSocket, an toàn farm.

**Cần cấu hình host:** khi site-level RenderMode = Interactive Server (trang admin/builder), Blazor circuit yêu cầu **ARR affinity/sticky session** + cân nhắc Azure SignalR Service khi scale-out. Public path không bị ảnh hưởng.

### 3.4 Multi-Tenant

**Nền tảng đúng chuẩn Oqtane:**

- `MegaFormDbContext : DBContextBase, ITransientService, IMultiDatabase` (`MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs:10`) — provider + connection resolve **per-request theo tenant**, không connection string riêng; hỗ trợ đủ 4 provider (SQL Server/SQLite/MySQL/PostgreSQL). Khi tenant dùng **DB riêng per tenant**, cách ly là tuyệt đối và toàn bộ §3.4-gap biến mất.
- Form/Template/AppDefinition/WorkflowTemplate/AI-KB đều có `PortalId` (= SiteId): `FormInfo.PortalId` (`EntityModels.cs:8-9`), unique index `(PortalId, AppKey)`, `(Slug, PortalId)`. `ListForms` lọc đúng `PortalId` (`EfRepositories.cs:32`). SiteId resolve từ header `X-OQTANE-SITEID` (`OqtanePlatformContext.cs:37`).
- Named connections đọc từ **site settings trong DB** (`Startup.cs:455-496`) → nhất quán cross-node, đổi config không cần restart.

**Gap cần ghi nhận:**

- **`SubmissionInfo` không có cột SiteId/PortalId** (`EntityModels.cs:63-78`) — cùng workflow runtime rows và typed submission records, chỉ có `FormId`. Cách ly cross-site phụ thuộc hoàn toàn vào join qua Form.
- **Thiếu guard site-level tổng quát**: `ResolvePortalId(formId)` lấy portal từ chính record form, không đối chiếu site của request (`MegaFormController.cs:221-222`). Admin endpoints (Submissions list `:2066-2081`, Export `:2646-2648`) authorize theo permission của form, không theo site hiện tại → khi **nhiều site dùng chung 1 DB**, user có quyền site A biết formId site B có nguy cơ đọc được. Khuyến nghị: tách DB per tenant (tùy chọn có sẵn của Oqtane) hoặc bổ sung site-check khi được phép code.
- Nếu tenant dùng **SQLite file** → DB nằm local disk, pin về 1 node; web farm bắt buộc SQL Server/MySQL/PostgreSQL dùng chung.
- FK cascade `MF_Forms → Oqtane Module` (`FormEntityBuilder.cs:14`): xóa module xóa luôn forms — hành vi tenancy cần lưu ý khi vận hành.

### 3.5 Hosted services / background jobs

- **Không có** Hangfire/Quartz/distributed lock/leader election nào trong toàn bộ code MegaForm (grep = 0).
- **`BlogScheduledHostedService`** (`BlogScheduledHostedService.cs:32`, Timer 5 phút, đăng ký `Startup.cs:270`): mọi node cùng `ProcessScheduledPostsAsync` + `RollupBlogAnalyticsAsync` cho mọi site → publish trùng; rollup là read-modify-write trên `DataJson` → **lost-update** khi 2 node chạy đồng thởi (`BlogAnalyticsRollupService.cs:29,135`; `ScheduledPublishService.cs:37-67` read-then-update không claim).
- `OqtaneKbSeederHostedService` + lazy `EnsureSeeded` — race seed kép khi cold-start nhưng được unique index `(Slug, PortalId)` bảo vệ → chấp nhận được.
- `MegaFormWarmupHostedService` — per-node, read-only, fail-soft → **có lợi** cho autoscale.
- Email workflow gửi **inline trong request** (`WorkflowTaskService.cs:861-880`, `Task.Run` fan-out) → không rủi ro gửi trùng, nhưng mất mail nếu node chết giữa chừng (durability gap, không phải scale-out blocker).
- `LegacySubmissionBackfillService` — manual, idempotent; quy ước vận hành: chạy trên đúng 1 node khi migrate.
- **Cơ hội với Oqtane 10.2:** chuyển blog scheduler sang **job framework của Oqtane** (`HostedServiceBase` đã được nâng cấp cho scale-out ở #6205, Job Log có instance id #6187) thay vì tự chạy `IHostedService` + Timer — được framework quản lý "chạy trên 1 instance" thay vì tự dựng leader election.

### 3.6 Các điểm cấu hình host-level (không cần code MegaForm)

1. **Data Protection key ring chia sẻ** (Blob/Redis + `SetApplicationName`) — bắt buộc cho auth cookie/antiforgery của Oqtane host trên farm.
2. **Sticky session (ARR affinity)** hoặc Azure SignalR Service nếu site chạy Interactive Server.
3. **License file + `dev.lock` + SMTP appsettings + `MegaForm:ExternalTables:AllowedConnections`** phải đồng bộ trên mọi node (Azure App Settings / CI-CD deploy). `dev.lock` nên chuyển sang env var.
4. **AI CLI lookup** (`AiAssistantController.cs:232-238` tìm `claude.cmd` trong `%APPDATA%/npm`) — dependency machine-level, mỗi node cài riêng.
5. Shared volume/Azure Files cho các path ở §3.2 nếu chưa refactor storage.
6. Tenant DB phải là server DB dùng chung (không SQLite).

---

## 4. Ma trận đánh giá tổng hợp

| Cơ chế Oqtane 10.2 | Trạng thái MegaForm | Mức độ |
|---|---|---|
| Distributed Caching / backplane | Không dùng cache framework, state chính trong DB → tương thích; còn 6 static store nghiệp vụ cần chuyển DB (C1-C4) | 🟡 Cần refactor nhỏ |
| Folder Providers / shared storage | Local disk toàn bộ; có `IStorageService` nhưng bị bypass | 🔴 Blocker |
| Static SSR / giảm RAM | Module đã Static SSR, public path stateless, warmup per-node | 🟢 Sẵn sàng |
| Multi-Tenant | Scope `PortalId` đúng; gap cột site ở submissions + thiếu site-guard khi gộp DB | 🟡 Chọn DB-per-tenant là an toàn |
| Background jobs scale-out | Tự Timer, không leader election; chưa dùng job framework Oqtane | 🔴 Blocker (blog scheduler) |

**Blocker phải xử lý trước khi production web farm (theo thứ tự ưu tiên):**
1. Upload 2 bước + PrivateUploads local disk (mất file submit).
2. UniqueId counter trùng mã giữa các node.
3. Payment replay-guard per-process (liên quan tiền).
4. Blog scheduler chạy trùng + rollup lost-update.
5. `locked-forms.json` / template catalog / i18n JSON local.

**Đã sẵn sàng ngay:** DB tenant chung multi-provider, DI scoped/transient, caches content-addressed, public REST path stateless, Static SSR, schema install idempotent, warmup per-node, không session/antiforgery in-memory.

---

## 5. Lộ trình đề xuất (khi được phép code — phiên sau)

**Phase 0 — Không cần code, chạy được pilot 2-node:** mount Azure Files cho `App_Data/MegaForm` + `wwwroot/Modules/MegaForm/{Images,PdfTemplates,js/builder/i18n}`; bật sticky session; tách DB per tenant; tắt forms dùng UniqueId/payment/blog-scheduling; đồng bộ license/SMTP/appsettings. Chấp nhận: race `locked-forms.json`, rate limit ×N.

**Phase 1 — Storage abstraction (giải blocker #1, #5):** implement `IStorageService` trên Blob/S3 hoặc bám Folder Providers Oqtane 10.2; route `UploadFile`/`Files/Download`/image/PDF upload qua abstraction; dởi `locked-forms.json`, i18n JSON, builder template catalog sang DB.

**Phase 2 — State nghiệp vụ sang DB (giải blocker #2, #3):** UniqueId counter → DB sequence/conditional update per (formId, fieldKey); `PaymentTransactionRegistry` + `PaymentRateLimiter` + submission rate-limit → bảng DB với atomic upsert (đồng thởi wire lại `AntiSpamService.RateLimitChecker` cho Oqtane); audit log stub → bảng `MF_AuditLog`.

**Phase 3 — Jobs & cache (giải blocker #4):** chuyển `BlogScheduledHostedService` sang Oqtane job framework (hưởng #6205); publish/rollup đổi sang conditional update (claim-by-status) để idempotent; nâng Oqtane 10.2 và verify settings invalidation qua backplane (#6204, C6).

**Phase 4 — Hardening multi-tenant:** thêm cột `SiteId` cho submissions/workflow/typed-values + guard site-level trên admin endpoints; bỏ gap cross-site khi gộp DB.

---

## 6. Việc cần làm ngay khi nâng Oqtane 10.2

- `MegaForm.Oqtane.Server.csproj:54-57` đang reference `Oqtane.Server 10.1.0` → nâng lên 10.2.x, rebuild, retest (đặc biệt pipeline startup vì 10.2 đổi thứ tự antiforgery/404 #6167 và caching config #6196-6202).
- Verify sync-event lan truyền cross-node qua backplane → xác nhận C6 được giải miễn phí.
- Cân nhắc đăng ký cache của MegaForm qua `CacheManager` abstraction của 10.2 (#6193) thay vì static dictionary — vừa được multi-tenancy key prefix vừa được distributed invalidate.
- Kiểm tra Folder Providers API của 10.2 làm backend cho `IStorageService` ở Phase 1.

---

## Phụ lục: giới hạn khảo sát

- Chưa verify trực tiếp tính idempotent của `ScheduledPublishService`/`BlogAnalyticsRollupService` ở mức chạy thật (chỉ đọc code).
- Chưa đọc toàn bộ ~4300 dòng `Index.razor` (chỉ các đoạn render mode/SSR cache).
- API Folder Providers chi tiết của Oqtane 10.2 chưa được đọc từ source Oqtane — cần khảo sát thêm ở Phase 1.
- Chưa chạy thử nghiệm 2-node thực tế; mọi kết luận dựa trên phân tích tĩnh.
