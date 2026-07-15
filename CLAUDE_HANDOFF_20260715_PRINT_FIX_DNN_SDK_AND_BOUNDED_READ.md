# Handoff 2026-07-15 — Print-save fix · DNN SDK full parity · Bounded-read audit · SDK DocFx corrections

Phiên nối tiếp `CLAUDE_HANDOFF_20260714_P5_PRINT_STRIP_AND_SQL_SAFETY.md`. Owner giao thêm giữa phiên:
DocFx cho DNN phải có **GIF step-by-step như bộ Oqtane** + **rà lại SDK API cho đúng** + **demo live trên
`http://dnn10322_megaclean.ai/`** (host `host` / `dnnhost`, trang test `/TestPinPage456`, DB `DNN10322_MegaClean`
trên `WINDOWS-11\SQLEXPRESS`).

> ⚠️ **Phiên chạm SESSION LIMIT** (reset ~02:50 giờ Sài Gòn). Hai workflow con chạy nền đã xong nhưng
> khâu tổng-hợp cuối của audit bounded-read **bị cắt** (draft RULE/remediation/critic fail vì limit).
> Findings raw vẫn đủ (13/13). RULE cần **tự viết tay** (không cần agent) — nội dung đã có sẵn ở §3.

---

## 1) ĐÃ XONG + ĐÃ DEPLOY LIVE — Bug print `settings.printSettings` bị rơi khi Save (4 platform)

**Nguyên nhân (không phải bug riêng DNN):** `MegaForm.UI/src/builder/print-settings.ts` gọi
`MegaFormBuilder.getSettings()` và `.updateSettings()` — **cả hai KHÔNG tồn tại** trong bề mặt public của
`core.ts` (xem `core.ts:953-993`, chỉ có `state`, `loadSchema`, … không có 2 hàm này). Hệ quả:
- `getSettings()` → `builder.getSettings` undefined → luôn trả DEFAULTS (tab Print không bao giờ hiện giá trị đã lưu).
- `saveSettings()` → `builder.updateSettings` undefined → rơi xuống fallback `POST {apiBase}Form/SavePrintSettings`
  — route đó **không platform nào có** (Web chỉ có `/f/{id}/print/settings`) → 404 bị `.catch(()=>{})` nuốt im lặng.
→ Mọi form export đều `"printSettings":null`. Đã xác minh qua DB: form 42/44 = `"printSettings":null`, form 43 chưa có key.

**Fix (client-only, đúng cho cả 4 platform):** ghi thẳng vào `state.schema.settings.printSettings` (+ PascalCase
`PrintSettings` vì `RenderModelResolver.OverlaySavedSettings` merge SettingsJson→SchemaJson theo từng key) và set
`isDirty=true` — đúng mô hình tab Theme (`theme-tab-adapter.ts:persistToSchema`, đường đã chứng minh persist được).
`normalizeSettingsShape` (`core.ts:266`) chỉ clone + bổ sung key, KHÔNG strip → `printSettings` sống sót qua export.

**Deploy:** `npm run build:builder` (sync 4 wwwroot) + `npm run build:dnn-host`; bump `BUILDER_LAZY_VERSION`
`B236→B237` (`src/dnn-host/index.ts:1024` — URL bundle = cache key); hot-swap 2 bundle
(`Assets/js/bundles/megaform-builder.js` + `Assets/js/megaform-dnn-host.js`) → site live
`E:\DNN_SITES\DNN10322_MegaClean\Website\DesktopModules\MegaForm\Assets\js\...`. Stamp B237 đã xác nhận trong bundle live.

**CÒN THIẾU: verify E2E** — mở builder form 43, bật Print, Save, re-query DB thấy `printSettings.enabled=true`,
rồi mở `Print/Form?formId=43` thấy render (thay vì "Print layout is OFF"). Đã chứng minh Playwright **mở được builder
DNN** (script `probe.mjs` — MegaFormBuilder defined, form 43, 3 fields, settingsKeys chưa có printSettings = đúng baseline).
Login DNN qua Playwright còn kẹt selector (site cold-start >45s; đã thêm warm-up trong `dnn-lib.mjs`). → làm cùng lúc ghi GIF.

## 2) ĐÃ XONG + ĐÃ DEPLOY LIVE — SDK trên DNN nâng từ 4 → đủ 7 surface (FIX THẬT)

Rà SDK phát hiện `MegaForm.DNN/Services/DnnServiceLocator.cs:213` dựng `MegaFormClient` bằng ctor **6-arg**
(`FormRepo, SubmissionRepo, null, null, null, SubmissionProcessor`) → `_files=null, _storage=null,
_workflowTasks=null`. Hệ quả (verify tại `MegaFormClient.cs`): `Files.OpenAsync` **luôn trả null** (`:597`
`if (_files==null || _storage==null) return null`) → link download trong sample Razor `.cshtml` **404**;
mọi `Inbox.*` **throw** `InvalidOperationException` (`RequireWorkflowTasks()` `:683-686`);
`SubmissionDashboard.GetDetailAsync` trả workflow summary rỗng.

DNN **đã có sẵn** `DnnFileRepository : IFileRepository` (`Data/DnnRepositories.cs:126`, wrapper static) +
`DnnDiskStorageService : IStorageService` (`Services/DnnDiskStorageService.cs`, comment: "Added 2026-06-13 for the
SDK Files API" — viết ra đúng cho việc này nhưng chưa ai wire) + property `WorkflowTasks`/`WorkflowRepo`.

**Fix:** đổi `DnnServiceLocator:213` sang ctor **8-arg**:
`new MegaFormClient(FormRepo, SubmissionRepo, null, new DnnFileRepository(), new DnnDiskStorageService(),
SubmissionProcessor, WorkflowTasks, WorkflowRepo)`. Chỉ phơi hành vi DNN đã có qua SDK, không đổi cách lưu file/task.
Build DNN net472 Release = **0 error**. Copy 3 DLL (`MegaForm.DNN.dll`+`MegaForm.Sdk.dll`+`MegaForm.Core.dll`) →
site `bin` → touch `web.config` recycle → warm 200. **Giờ Files + Inbox + workflow-summary chạy thật trên DNN.**

**Kéo theo — doc phải mô tả DNN full parity** (KHÔNG còn "Inbox throws / Files empty" như draft workflow ban đầu
viết trước khi tôi fix). CÒN THIẾU: verify runtime Files.OpenAsync trả file thật (cần razor host page + submission có file).

## 3) Bounded-read audit — 13 finding CONFIRMED; RULE viết xong, fixes tier 1+2 SHIPPED

> **CẬP NHẬT 07-15:** RULE đã viết (CLAUDE.md #11 + SECURITY §11, commit `7aeb10d`).
> **Tier 1 (critical anonymous OOM) — DONE + deploy + commit `458fffd`:** cap `MAX_OPTION_ROWS=500`
> tại `FieldOptionsService.GetSqlOptions`, `DataRepeaterService.ExecuteFilterQuery` + `ExecuteOptionsQuery`
> (Core → 4 platform). **Tier 2 (perf timeout) — DONE + commit `edfcb9a`:** Reports FormsOverview GROUP BY
> per-(form,day) port sang Web/Umbraco/DNN (Oqtane có sẵn). Build cả 4 platform 0-error, deploy DNN site.
> **CÒN follow-up (thấp hơn):** (a) `DataRepeaterService.ExecuteSql:718` in-memory pagination — ĐÃ bounded
> ở 5000, refactor real OFFSET/FETCH rủi ro (ORDER BY/provider) → cần QA kỹ; (b) Reports `Backfill:258`
> (admin, keyset-paged loop); (c) FormsOverview `ListForms(pageSize:0)` nạp mọi form blob (admin).


Workflow `bounded-read-audit` (wf_f2ce09d5-427): 60 candidate → **13 confirmed** / 47 refuted. Output đầy đủ:
`…/tasks/w044rfmch.output` (3323 dòng JSON, `.result.confirmed[]`). Các finding load-bearing:

| # | File:line | Vấn đề | Auth | Mức |
|---|---|---|---|---|
| 1 | `FieldOptionsService.cs:285` | optionsSql đọc tới cạn, **no cap/TOP/FETCH**; 500k options → ~50-100MB/req | **anonymous** | 🔴 critical (OOM 1-req) |
| 2 | `DataRepeaterService.cs:473` (ExecuteFilterQuery) | filter-dropdown SQL đọc cạn, no cap | **anonymous** | 🔴 critical |
| 3 | `DataRepeaterService.cs:880` (ExecuteOptionsQuery) | column optionsSql đọc cạn, no cap; stored-proc bỏ cả guard | **anonymous** | 🔴 critical |
| 4 | `DataRepeaterService.cs:718` (ExecuteSql) | **in-memory pagination** — SELECT không TOP/OFFSET, đọc tới ABSOLUTE_MAX_ROWS=5000 rồi mới Skip/Take; mỗi page click quét lại từ đầu | **anonymous** | high |
| 5 | `renderer/index.ts:3096` (hydrateSqlOptions) | client KHÔNG phân trang/search — xin cả tập, nhồi mọi `<option>` vào DOM; thêm cap server sẽ **cắt câm** dữ liệu (regression) → phải ship kèm typeahead `&q=` | anonymous | medium |
| 6 | `ReportsController.cs:258` (Backfill) | `.ToList()` mọi DataJson của form, 4 twin (DNN raw-SQL twin tự thừa nhận "slow on millions") | admin | high |
| 7 | `ReportsController.cs:97` (FormsOverview) | materialize mọi submission 30 ngày cho sparkline; **Oqtane ĐÃ fix bằng GROUP BY** (`MegaFormController.Reports.cs:119`), Web/Umbraco/DNN chưa | admin | high |
| 8 | `ReportsController.cs:82` | `ListForms(pageSize:0)` nạp mọi form blob (Schema/Settings/Theme JSON) | admin | (xem output) |

(Các finding 9-13 + chi tiết: đọc `w044rfmch.output` `.result.confirmed[]` từ offset ~318.)

**Điểm chốt cho RULE (CLAUDE.md rule #11 + `Docs/SECURITY_CODING_RULES.md` mục mới #13):**
- MỌI đường đọc SQL do user/designer cấu hình phải có **cap server-side đẩy VÀO SQL** (TOP/OFFSET-FETCH/LIMIT theo
  provider) — **cấm** Skip/Take trên list đã materialize (đó chính là bug #4/DataGrid-SQL).
- Client page size **không tin** → clamp server. Count = `COUNT(*)` riêng, không materialize-rồi-đếm.
- Đường **anonymous** (public form: optionsSql/cascade, DataRepeater FilterOptions/ColumnOptions/Query) = cap NGHIÊM NHẤT
  (vài trăm dòng, không 5000). Bảng **XL** phải filter-before-list — tái dùng `CapabilityDecisionEngine.RequiresFilterBeforeList`
  (`CapabilityDecisionEngine.cs:189`, bucket XL).
- Helper dùng chung: trích bộ paging provider-aware từ `DataRepeaterService.ExecuteSql` thành 1 helper Core
  (`WrapPaged(sql, dbType, offset, limit)`); `FieldOptionsService` + cả 3 `Execute*Query` trong DataRepeater cùng đi qua nó.
  Fix ở Core 1 lần → 3 controller twin (Oqtane/Web/DNN) hưởng; Umbraco phần lớn chưa port các path này.
- Thêm `MAX_OPTION_ROWS = 500` (floor cho nhánh stored-proc không rewrite được SQL). Hạ `ABSOLUTE_MAX_ROWS` 5000→~500 cho read path.
- ⚠️ Ship server-cap **cùng lúc** với client typeahead (`&q=`/`&page=`) nếu không finding #5 biến thành regression "mất dữ liệu im lặng".
- DNN Field/Options phát `Access-Control-Allow-Origin: *` → bất kỳ origin nào cũng drive được các read anonymous này.

## 4) SDK DocFx corrections — đã DRAFT xong (workflow wf_801b2221-352), chờ áp dụng

Output: `…/tasks/wgnq2p9uz.output` `.result`; đã trích ra `…/scratchpad/sdkdocs/*.corrected.md` +
`NEWAPI-*.md` + `ACTION-LIST.md`. **Đã verify các claim load-bearing với source thật.** Tóm tắt:

- `sdk-reference.md` **stale**: chỉ tả 4/7 API. Thiếu **Dashboard / SubmissionDashboard / Inbox** (đã có draft section sẵn).
  Sơ đồ client-surface (dòng 54-60) + đoạn `AddMegaFormSdk` (dòng 33-35, thực tế wire ctor 8-arg gồm
  `WorkflowTaskService`+`IWorkflowRepository`) phải sửa. Edge-case table thiếu nhiều throw.
- `dnn-razor-host.md` **badly-wrong**: `DnnServiceLocator.Instance.Mega` **không tồn tại** (đường đúng = `MegaFormSdk.RunAsync`);
  `SdkDemoController` **chưa ship** (chỉ có trong doc + sample `.cshtml` link tới nó → 404).
  → SAU FIX §2: DNN giờ full 7 surface, nên bỏ "host-limitations box (Inbox throws/Files empty)" của draft.
  **Nên ship thật `MegaForm.DNN/WebApi/SdkDemoController.cs`** (code đã có trong doc, gọi `Files.OpenAsync`) để sample download
  sống + doc "shipped controller" thành đúng. Route catch-all `{controller}/{action}` → `/DesktopModules/MegaForm/API/SdkDemo/Download`
  (cần verify generic route tồn tại ở cuối `MegaFormRouteMapper` — đang dở khi chạm limit).
- `overview.md` stale (4→7 surface); `installation/oqtane-consumer/standalone-host/reading-data/file-download/api-stability`
  minor-drift (chi tiết từng dòng trong `ACTION-LIST.md`).

**CODE BUG khác (memory open-item, CONFIRMED):** `SubmissionDashboard.SearchAsync` (`MegaFormClient.cs:369-392`)
khi `FormId=0` lọc portal SAU phân trang → `TotalCount = items.Count` (chỉ current page), khách tưởng hết dữ liệu.
Fix: đẩy lọc portal vào `SubmissionQueryService` trước khi paginate + trả total thật.

## 5) CÒN LẠI (theo thứ tự owner)

1. **Viết RULE bounded-read** (§3) vào `Docs/SECURITY_CODING_RULES.md` + `CLAUDE.md` #11 — chỉ cần viết, không agent.
2. **Áp dụng SDK doc corrections** (§4) + ship `SdkDemoController.cs` + verify generic route.
3. **DocFx DNN section** song song Oqtane, **GIF step-by-step** (builder UI = bundle chung nên flow y hệt Oqtane;
   chỉ khác shell: thêm module vào trang DNN, dock, print preview). Pipeline GIF: Playwright video→PNG(ffmpeg stripped của
   Playwright, chỉ scale/crop)→gif-encoder-2. Recorder cũ ở scratchpad phiên Oqtane; đã dựng `dnn-lib.mjs`/`probe.mjs` mới.
4. **Verify print E2E + Files.OpenAsync runtime** trên site live (§1,§2).
5. **Implement bounded-read fixes** (§3) — Core helper + 3 twin.
6. **DNN SQL demo** (form Country ghi thẳng SQL + dashboard source picker + bảng ~500 dòng + 2 cascade SQL).
7. **Push DocFx GitHub** cho owner review (remote `origin`=`github.com/CissSolution/MegaformDocs`; push qua worktree
   origin/master để né commit lạ + uncommitted trên nhánh feature — xem `reference_demo_gif_recording.md`).

## Trạng thái commit
Mọi thay đổi phiên này **CHƯA commit** (nhánh `feat/theme-designer-picker-wizard-gallery-1.7.45`, có Codex chạy song song):
`print-settings.ts`, `dnn-host/index.ts` (B237), `DnnServiceLocator.cs` (8-arg). Đã build + hot-swap + recycle live.
Scripts QA: `…/scratchpad/dnn-lib.mjs`, `probe.mjs`. Drafts doc: `…/scratchpad/sdkdocs/`.
