# Báo cáo rà soát đa ngôn ngữ MegaForm — 2026-06-18

> **Phạm vi:** Toàn bộ solution MegaForm (UI/TS, Core, Web, DNN, Oqtane, Umbraco, Sdk).  
> **Mục tiêu:** Đọc lại các handout/tài liệu multi-language, rà soát code hiện tại về đồng bộ catalog, string hardcode, culture bridge, server localization; **không sửa code**.  
> **Ngày thực hiện:** 2026-06-18.  
> **Trạng thái:** Báo cáo thuần túy.

---

## 1. Các tài liệu đã đọc lại (handout & audit cũ)

| Tài liệu | Nội dung chính | Mức độ còn hiệu lực |
|---|---|---|
| `Docs/I18N_LANGUAGE_EXPANSION_PLAN.md` (V1) | Kế hoạch mở rộng 10 → 50 ngôn ngữ, cấu trúc catalog, CI gate, RTL/CJK, server JSON. | **Đã superseded** bởi V2. Một số phụ lục (glossary, plural rules, locale code) vẫn dùng được. |
| `Docs/I18N_LANGUAGE_EXPANSION_STRATEGY_V2_20260611.md` | Chiến lược thực tế: ưu tiên *drift-prevention gate*, một catalog duy nhất, xóa inline zombie, không thêm ngôn ngữ trước khi gate xanh. | **Hiệu lực cao**. Đây là north-star cho audit này. |
| `Docs/I18N_P3_SERVER_LOCALIZATION_SPEC.md` | Spec server localizer `IMegaFormLocalizer.L("key", culture)`, đọc JSON từ wwwroot, 613 string hardcode cần externalize. | **Chưa implement**. Vẫn là backlog P3. |
| `Docs/ENTERPRISE_REVIEW_MULTI_LANGUAGE_AI_SQL_2026-06-11.md` | Đánh giá enterprise: Umbraco zero i18n, server controllers hardcode English, 4 locale châu Á ~90% thiếu. | **Một phần còn đúng**, một phần đã khác (số key catalog, tình trạng es/fr). |
| `Docs/I18N_FULL_HARDCODED_TEXT_AUDIT_REPORT.md` | Audit toàn bộ hardcode ~2.550 strings theo namespace, danh sách file nóng. | **Tham khảo**. Số liệu đã cũ, nhưng phân loại namespace vẫn đúng. |
| `Docs/I18N_AUDIT_REPORT_2026-06-15.md` | Báo cáo gần nhất: en-US ~1.124 key, ~139 alert/confirm/prompt, server chỉ Web có provider. | **Cơ sở so sánh**. Nhiều chỉ số đã thay đổi sau 3 ngày. |

---

## 2. Tóm tắt cấp cao

MegaForm đã **giải quyết được vấn đề zombie catalog nghiêm trọng nhất** trong V2:
- `src/i18n/index.ts` giờ import `public/i18n/en-US.json` làm single source of truth (không còn block 295 key inline).
- Engine `t()`/`tplural()`/`isRTL()`/`normalizeLocale()` hoạt động đầy đủ.

Tuy nhiên, **điểm yếu cốt lõi vẫn chưa được đóng**:
1. **Gate chống drift chưa được gắn vào build/CI.** `i18n-check.cjs` hiện FAIL nhưng build vẫn chạy; `package.json` không có `i18n:check`.
2. **Server-side localization gần như chưa tồn tại** ngoài `MegaForm.Web`. DNN/Oqtane/Umbraco không register `ILocalizationProvider`.
3. **Catalog non-en bị sụt giảm nghiêm trọng**: `fr-FR` chỉ còn 64 key, `es-ES` 107 key (từng được coi là "full").
4. **Hardcode UI vẫn tràn ngập**: 140 native dialog, 163 fallback tiếng Anh trong `t(...)`, ~15.130 literal candidates, và hàng nghìn string cứng ở server/views/JS bundle.
5. **Các bản copy locale ra platform không đồng bộ**: Web còn catalog 295 key từ tháng 4, DNN builder/bundles chỉ có 6 locale cũ, Oqtane thiếu 11 key.

**Kết luận:** Sản phẩm chưa đạt trạng thái "một nửa đã i18n" an toàn. Cần ưu tiên gate + server localizer + sync catalog trước khi nghĩ đến việc thêm ngôn ngữ mới.

---

## 3. Trạng thái catalog & công cụ

### 3.1. Catalog `MegaForm.UI/public/i18n/`

| Locale | Số key | Thiếu vs en-US (1135) | Ghi chú |
|---|---:|---:|---|
| `en-US` | 1135 | — | Canonical. Tăng từ 1124 (15/06) và 941 (11/06). |
| `de-DE` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `pt-BR` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `it-IT` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `nl-NL` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `pl-PL` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `ru-RU` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `tr-TR` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `th-TH` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `id-ID` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `hi-IN` | 1089 | 46 | Nhóm "gần đầy đủ" |
| `ar-SA` | 1093 | 42 | +4 key plural dạng số nhiều Arabic (`zero/two/few/many`) |
| `es-ES` | 107 | 1028 | **Sụt giảm nghiêm trọng** |
| `fr-FR` | 64 | 1071 | **Sụt giảm nghiêm trọng** |
| `ja-JP` | 107 | 1028 | Stub cũ |
| `ko-KR` | 107 | 1028 | Stub cũ |
| `vi-VN` | 103 | 1032 | Stub cũ |
| `zh-CN` | 98 | 1037 | Stub cũ |

**46 key chung bị thiếu** ở nhóm 1089-key (toàn bộ thuộc dashboard/submissions mới):
`dash.nav_form_management`, `dash.nav_settings`, `dash.settings_title`, `form.incomplete`, `form.invalid_number`, `form.match`, `form.max_age`, `form.min_age`, `subs.all_forms_back`, `subs.all_status`, `subs.back_to_forms`, `subs.chart_sub`, `subs.chart_title`, `subs.col_actions`, `subs.col_all_time`, `subs.col_completion`, `subs.col_created`, `subs.col_form_name`, `subs.col_last30`, `subs.col_last7`, `subs.col_trend`, `subs.fo_error`, `subs.fo_loading`, `subs.fo_no_forms`, `subs.fo_showing`, `subs.fo_total_all`, `subs.forms`, `subs.kpi_active_forms`, `subs.kpi_all_time`, `subs.kpi_last30`, `subs.kpi_last7`, `subs.kpi_of_total`, `subs.kpi_recent`, `subs.kpi_this_month`, `subs.kpi_total`, `subs.search_forms`, `subs.star`, `subs.stat_new`, `subs.stat_pending`, `subs.stat_processed`, `subs.stat_total`, `subs.status_active`, `subs.status_paused`, `subs.status_spam`, `subs.unstar`, `subs.view_submissions`.

### 3.2. Key được reference nhưng thiếu trong `en-US.json`

`tools/i18n-refdiff.cjs` báo **27 key referenced but missing**, trong đó **18 key có fallback tiếng Anh** và **9 key rỗng/dynamic**:

| Key | Fallback (nếu có) | File gọi |
|---|---|---|
| `ai.assistant_badge` | AI Assistant | `dashboard/ai-form-creator.ts` |
| `ai.bear_greeting` | (dài) | `dashboard/ai-form-creator.ts` |
| `ai.bear_name` | Beary | `dashboard/ai-form-creator.ts` |
| `ai.subtitle_builder` | (dài) | `dashboard/ai-form-creator.ts` |
| `ai.title_builder` | AI Designer | `dashboard/ai-form-creator.ts` |
| `builder.ai_designer` | AI Designer | `builder/dom.ts` |
| `builder.toast_saved` | Saved! | `builder/toolbar.ts` |
| `form.max_value` | Maximum {n} | `renderer/validation.ts` |
| `form.min_value` | Minimum {n} | `renderer/validation.ts` |
| `form.ps_answers_title` | Your answers | `renderer/index.ts` |
| `form.ps_done` | Done | `renderer/index.ts` |
| `form.ps_fill_again` | Submit another | `renderer/index.ts` |
| `form.review_confirm` | Confirm & Submit | `renderer/index.ts` |
| `form.review_edit` | Edit | `renderer/index.ts` |
| `form.review_empty` | No answers to review. | `renderer/index.ts` |
| `form.review_hint` | (dài) | `renderer/index.ts` |
| `form.review_title` | Review your answers | `renderer/index.ts` |
| `inbox.back_dashboard` | Back to Dashboard | `my-inbox/view.ts` |
| `builder.tab_` | *(rỗng/dynamic)* | `builder/dom.ts` |
| `builder.tabtitle_` | *(rỗng/dynamic)* | `builder/dom.ts` |
| `dash.role_` | *(rỗng/dynamic)* | `dashboard/index.ts` |
| `inbox.priority_` | *(rỗng/dynamic)* | `my-inbox/view.ts` |
| `inbox.reply_` | *(rỗng/dynamic)* | `my-inbox/view.ts` |
| `inbox.status_` | *(rỗng/dynamic)* | `my-inbox/view.ts` |
| `inbox.view_` | *(rỗng/dynamic)* | `my-inbox/view.ts` |
| `subs.col_` | *(rỗng/dynamic)* | `submissions/SubmissionsShell.ts` |
| `subs.range_` | *(rỗng/dynamic)* | `submissions/SubmissionsShell.ts` |

### 3.3. Lỗi placeholder & script-bleed

`tools/i18n-check.cjs` báo **FAIL** với các vấn đề sau:

| Vấn đề | Locale bị ảnh hưởng | Ví dụ |
|---|---|---|
| Placeholder count mismatch | `ar-SA`, `de-DE`, `pt-BR` | `inbox.returned_n_times` en-US có `{n}` và `{s}`, bản dịch chỉ có `{n}` |
| Placeholder name mismatch | `ar-SA`, `de-DE`, `pt-BR` | `form.min_length` en-US dùng `{n}`, bản dịch dùng `{min}` |
| `dash.n_submissions.one` mất `{n}` | `ar-SA` | `"إرسال واحد"` thay vì `"{n} إرسال"` |
| Script-bleed trong `dash.lang.search` | `de-DE`, `pt-BR` | `"Suchen… (Español, العربية, 한국어, fr…)"` chứa Arabic + Hangul |
| CJK chars in `dash.lang.search` | `ar-SA` | `"بحث… (Español, العربية, 한국어, fr…)"` chứa Hangul |

### 3.4. Công cụ & CI

| Công cụ | Tồn tại | Tích hợp build/CI | Ghi chú |
|---|---|---|---|
| `tools/i18n-check.cjs` | ✅ | ❌ | Chạy được, exit non-zero khi FAIL, nhưng không gọi trong `package.json` hay workflow. |
| `tools/i18n-refdiff.cjs` | ✅ | ❌ | Tìm referenced-but-missing keys, xuất `missing-ref-keys.json`. |
| `tools/i18n-litlint.cjs` | ✅ | ❌ | Báo ~15.130 literal candidates, allow-list rỗng. |
| `tools/i18n-add.cjs`, `i18n-merge.cjs`, `deploy-live.cjs` | ✅ | N/A | Copy/merge/deploy thủ công. |
| `package.json` scripts | Không có `i18n:check` | — | Chỉ có `build:i18n`. |
| GitHub workflows | `docs.yml`, `sdk-ci.yml` | Không đề cập i18n | Chưa có gate. |
| Git hooks | Chỉ `.sample` | — | Không active. |

### 3.5. Bản copy locale ra các platform (không đồng bộ)

| Thư mục | Trạng thái vs canonical |
|---|---|
| `Assets/js/i18n/`, `Assets/js/builder/i18n/`, `Assets/js/bundles/i18n/` | Đồng bộ (1135 key) |
| `Assets/js/plugins/i18n/` | Subset ~950 key, cũ hơn |
| `DesktopModules/MegaForm/Assets/js/builder/bundles/i18n/` | **Legacy** — chỉ 6 locale cũ (es/fr/ja/ko/vi/zh), thiếu en-US/de/pt/ar/... |
| `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/builder/bundles/i18n/` | `en-US` chỉ có **1124 key** (thiếu 11 key mới) |
| `MegaForm.Web/wwwroot/megaform/i18n/` | **Rất cũ** — chỉ 6 locale, `en-US` **295 key** (mtime 2026-04-21) |
| `MegaForm.Umbraco/wwwroot/js/builder/bundles/i18n/` | Legacy — chỉ 6 locale cũ |

**11 key en-US bị thiếu trong Oqtane builder/bundles:** `form.incomplete`, `form.invalid_number`, `form.match`, `form.max_age`, `form.min_age`, `subs.all_forms_back`, `subs.stat_new`, `subs.stat_pending`, `subs.stat_processed`, `subs.stat_total`, `subs.status_spam`.

---

## 4. Rà soát frontend (`MegaForm.UI/src/`)

### 4.1. Số lượng vấn đề chính

| Loại | Số lượng | Ghi chú |
|---|---|---|
| `alert` / `confirm` / `prompt` | **140** | Không localize, không RTL-friendly, block UI |
| Fallback tiếng Anh trong `t(..., 'fallback')` | **163** | Tất cả fallback đều là text thực, không qua catalog |
| Literal candidates (`i18n-litlint`) | **15.130** | Cần lọc false-positive, allow-list hiện rỗng |
| `currency: 'USD'` cứng | **11** | Payment widget + preset + lookup |
| `toLocaleDateString('en-US')` | **1** | `renderer/interactive.ts` |
| Tháng/ngày tiếng Anh cứng | **14** | `Jan-Dec`, `Monday-Sunday` |
| CSS `content:"..."` chứa UI text | **25** | Không thể localize bằng JSON |
| Dấu vết tiếng Việt trong code | **15** | Prompt/toast/comment song ngữ |

### 4.2. File nóng (nhiều literal/hardcode nhất)

1. `src/builder/presets.ts` — 1.074 candidates
2. `src/presets/index.ts` — 819 candidates
3. `src/builder/workflow-canvas.ts` — 788 candidates
4. `src/dashboard/index.ts` — 771 candidates + 10 native dialogs
5. `src/builder/workflow/index.ts` — 634 candidates
6. `src/listview/runtime.ts` — 13 native dialogs
7. `src/widgets/megaform-widget-grid-repeater.ts` — 24 fallback calls
8. `src/renderer/megaform-renderer.ts` — 22 fallback calls
9. `src/languages/index.ts` — 23 fallback calls + chính màn hình quản lý ngôn ngữ chưa localize

### 4.3. Ví dụ đại diện

| # | File:Dòng | Vấn đề | Khuyến nghị |
|---|---|---|---|
| 1 | `src/ai-form-assistant/chat.ts:1076` | `window.confirm('Clear chat history?')` | Thay bằng custom modal + key `ai.chat.confirm_clear_history` |
| 2 | `src/ai-knowledge/index.ts:242` | `confirm('You have unsaved changes. Discard?')` | `common.unsaved_changes_discard` |
| 3 | `src/builder/canvas.ts:2434` | `confirm('Convert this Row to a FlexGrid?')` | `builder.confirm_convert_row_to_flexgrid` |
| 4 | `src/listview/runtime.ts:1204` | `confirm('Delete submission #...? This cannot be undone.')` | `subs.confirm_delete_submission` |
| 5 | `src/dashboard/index.ts:4042` | `confirm('Delete N selected form(s)?...')` | `dash.confirm_delete_n_forms` |
| 6 | `src/renderer/validation.ts:142-143` | `t('form.min_value','Minimum {n}')`, `t('form.max_value','Maximum {n}')` | Thêm key vào en-US.json |
| 7 | `src/renderer/interactive.ts:516` | `date.toLocaleDateString('en-US',...)` | Dùng locale động / `i18n/format.ts` |
| 8 | `src/widgets/plugins/megaform-widget-payment-unified.ts:90` | `currency: 'USD'` | Lấy từ form settings/locale |
| 9 | `src/builder/composite-designer.ts:153-158` | `label:'January'`...`'December'` | `date.months_long` |
| 10 | `src/languages/index.ts:1037-1039` | `window.prompt('Dịch sang ngôn ngữ nào? / Translate into which language?...')` | `dash.lang.translate_ai_prompt` |

### 4.4. Dấu vết tiếng Việt còn sót

- `src/ai-form-assistant/ops.ts:2145` — `'Hoàn tất — nhớ bấm Save để lưu form.'`
- `src/languages/index.ts:1059` — toast `"AI chưa sẵn sàng. Mở Dashboard → AI Settings để cấu hình..."`
- `src/dashboard/ai-form-creator.ts:763` — `title="Đính kèm ảnh / .txt / .md / .json"`
- `src/view-designer/layout/inspector.ts:101` — `promote.textContent = '⭐ Lưu thành block dùng lại'`
- `src/view-designer/layout/tray.ts:61` — `saveBtn.textContent = '+ Lưu block đã chọn'`

---

## 5. Rà soát server-side (C#)

### 5.1. Tổng quan

- `MegaForm.Core/i18n/MegaFormStrings.cs` chỉ có **~42 key** fallback en-US.
- Chỉ **`MegaForm.Web/Program.cs`** register `ILocalizationProvider` (`WebLocalizationProvider`).
- **DNN, Oqtane.Server, Umbraco không register** → các service dùng `DefaultLocalizationProvider` (EN).
- Không có file `.resx` nào trong toàn solution.

### 5.2. Số lượng hardcode ước tính

| Nhóm | Số lượng ước tính | Ghi chú |
|---|---|---|
| Controllers (Web/DNN/Oqtane/Umbraco) | ~706 | `error/message/success` trong JSON response |
| Services exceptions / messages | ~295 | `throw new ...("...")`, `Error = "..."` |
| Workflow node UI schema | ~118 | Titles, descriptions, section labels, presets |
| Email templates | ~20+ | Subject/body hardcode HTML |
| Models default strings | ~16 | `Submit`, `Draft`, `Submitted`, `Submission received` |
| EF default values có ý nghĩa i18n | ~226 | Phần lớn là `{}`/`[]`; các giá trị như `"Draft"`, `"Submit"` cần lưu ý |
| Views (.ascx/.cshtml/.razor) | ~351 | ASCX DNN ~109, CSHTML Web ~193, Razor Oqtane ~45 |
| SDK / AspNetCore.Component | ~12 | Exception messages, Swagger title |
| **Tổng (không tính empty JSON)** | **~1.500** | — |

### 5.3. Ví dụ đại diện

| # | File | Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|---|---|
| 1 | `MegaForm.Web/Controllers/MegaFormController.cs` | 199 | `error = "form required"` | `api.error.form_payload_required` |
| 2 | `MegaForm.DNN/WebApi/MegaFormApiController.cs` | 1239 | `error = "Form not found or not published."` | `form.not_found_or_not_published` |
| 3 | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | 1834 | `error = "You do not have permission to view submissions..."` | `permission.view_submissions_denied` |
| 4 | `MegaForm.Core/Services/WorkflowTaskService.cs` | 156 | `throw new InvalidOperationException("Task is not open.")` | `workflow.task.not_open` |
| 5 | `MegaForm.Core/Services/WorkflowEngineV2.cs` | 102 | `ctx.ErrorMessage = "Workflow execution timed out after " + timeoutSec + "s."` | `workflow.execution_timed_out` |
| 6 | `MegaForm.Core/Services/EmailNotificationService.cs` | 29 | `$"[MegaForm] Task assigned: {task?.NodeLabel ?? "Approval"}"` | `email.task_assigned_subject` |
| 7 | `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs` | 42 | `Title = "Send Email"` | `workflow.node.send_email.title` |
| 8 | `MegaForm.Core/Models/FormSchema.cs` | 431 | `SubmitButtonText = "Submit"` | `form.submit_button` |
| 9 | `MegaForm.Core/Models/FormSchema.cs` | 548 | `Title = "Submission received"` | `postsubmit.title` |
| 10 | `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs` | 22 | `Status = "Draft"` | `form.status.draft` |
| 11 | `MegaForm.Web/Program.cs` | 155 | `Title = "MegaForm API"` | `swagger.title` |
| 12 | `MegaForm.DNN/Views/FormList.ascx` | 7 | `<h2>My Forms</h2>` | `view.dashboard.my_forms` |
| 13 | `MegaForm.Web/Views/Admin/Login.cshtml` | 45 | `"Username or email"` | `admin.login.username_or_email` |
| 14 | `MegaForm.Oqtane.Client/Index.razor` | 21 | `"Form Builder"` | `admin.builder.title` |
| 15 | `MegaForm.Umbraco/Data/MegaFormDbContext.cs` | 24 | `.HasDefaultValue("Draft")` | Tránh lưu giá trị localized vào DB |

---

## 6. Rà soát platform shells & culture bridge

### 6.1. DNN

- `.ascx` views hoàn toàn hardcode tiếng Anh, không dùng `Localization.GetString` hay `ILocalizationProvider`.
- `FormView.ascx.cs:RegisterLocaleScript()` load file legacy `Assets/js/locales/{culture}.js`; hiện chỉ có `vi-VN.js`.
- `MegaForm.DNN/Assets/js/builder/bundles/i18n/` chỉ còn 6 locale cũ, thiếu en-US/de/pt/ar/...

### 6.2. Oqtane

- `Index.razor` có `_culture` lấy từ `CultureInfo.CurrentUICulture.Name`.
- `data-mf-locale` chỉ xuất hiện trên `#mf-myinbox-root` và `#mf-languages-root`; **root form renderer không có**.
- `window.__MF_PLATFORM__` được inject nhưng **không có `.culture`**.
- Không inject `IStringLocalizer`/`ILocalizationProvider` trong bất kỳ `.razor` nào.
- Oqtane builder/bundles `en-US.json` thiếu 11 key so với canonical.

### 6.3. MegaForm.Web

- `Program.cs` đã register `WebLocalizationProvider` ✅.
- `Views/Form/View.cshtml` làm đúng culture bridge (`lang="@Model.Locale" data-mf-locale="@Model.Locale"`).
- Tuy nhiên các admin `.cshtml` (`Admin/Index`, `Admin/Login`, `Admin/Tasks`, `Setup/Index`, ...) vẫn hardcode toàn bộ nhãn.

### 6.4. Umbraco

- `MegaFormComposer.cs` không register localization provider, không dùng `ILocalizedTextService`, không có `/Lang/*.xml`.
- Các `.cshtml` view gần như không có label cứng, nhưng các file `wwwroot/js/*.js` là bản sao bundle chung → chứa rất nhiều hardcode.

---

## 7. Các vấn đề kiến trúc nổi bật

1. **Hai stack localization tách rời:**
   - Stack chrome catalog tĩnh (`t('builder.save')`) ~1.135 key.
   - Stack per-form content (`schema.translations[locale]`).
   - Hai stack không chia sẻ key hay UX chỉnh sửa chung.

2. **Server không chia sẻ catalog với frontend:**
   - Frontend có JSON ~1.135 key; server chỉ có ~42 key inline.
   - DNN/Oqtane/Umbraco chưa load JSON catalog ở server.

3. **Platform culture bridge không đồng nhất:**
   - Web: tốt nhất nhưng admin views chưa dùng.
   - Oqtane: chỉ 2 surface có `data-mf-locale`, thiếu `__MF_PLATFORM__.culture`.
   - DNN: dùng legacy JS locale, không có RESX.
   - Umbraco: gần như không có bridge.

4. **QA tooling chưa được thực thi:**
   - `i18n-check.cjs`, `i18n-litlint.cjs` chưa gắn CI/build/pre-commit.
   - Không có gate chống hardcode mới.

5. **Native dialogs không thể localize đàng hoàng:**
   - `alert`/`confirm`/`prompt` plain string → bắt buộc thay bằng custom modal.

---

## 8. Khuyến nghị & lộ trình ưu tiên

### P0 — Làm ngay (ảnh hưởng rõ rệt, đóng drift)

1. **Gắn `i18n-check.cjs` vào build/CI** và fail build khi drift. Thêm `i18n:check` vào `package.json`.
2. **Bổ sung 18 key missing** vào `en-US.json` (nhóm `ai.*`, `builder.ai_designer`, `builder.toast_saved`, `form.review_*`, `form.ps_*`, `form.min_value`, `form.max_value`, `inbox.back_dashboard`).
3. **Bổ sung 46 key dashboard/submissions** cho nhóm 11 locale 1089-key.
4. **Fix placeholder mismatch** (`form.min_length`, `form.max_length`, `inbox.returned_n_times`) cho `ar-SA/de-DE/pt-BR`.
5. **Xử lý script-bleed `dash.lang.search`** ở `de-DE/pt-BR/ar-SA`.
6. **Bắt đầu triển khai P3 server localizer:**
   - Thêm `IMegaFormLocalizer` đọc JSON từ wwwroot (theo spec `I18N_P3_SERVER_LOCALIZATION_SPEC.md`).
   - Register provider cho Oqtane, DNN, Umbraco.
   - Externalize respondent-facing server strings trước (~30–50 key).

### P1 — Hoàn thiện kiến trúc

7. **Thay thế `alert/confirm/prompt`** bằng custom modal/toast wrapper có thể render `t(key)`.
8. **Localize server API error/success messages** cho Web, Oqtane, DNN, Umbraco.
9. **Localize default submit/success/validation messages** trong `FormSchema`, `MegaFormModels`, renderer fallback.
10. **Localize email templates mặc định**.
11. **Localize Razor/Blazor/.ascx shells** (`Index.razor`, `Settings.razor`, `DashboardView.razor`, DNN `.ascx`, Web `.cshtml`).
12. **Localize workflow node UI schema** (`WorkflowNodeUiSchemaProvider`, `EmailWorkflowNodeUiService`, `WebhookWorkflowNodeUiService`).
13. **Bổ sung `__MF_PLATFORM__.culture`** cho Oqtane/DNN; đảm bảo root form renderer có `data-mf-locale`.

### P2 — Duy trì & nâng cao

14. **Dọn dẹp `src/i18n/locales/`** (5 file legacy) nếu không còn dùng.
15. **Thống nhất deploy locale** thành một bước copy duy nhất từ `public/i18n/`; xóa các bản copy cũ ở Web/DNN/Umbraco.
16. **Xử lý các locale stub** (`es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN`): hoặc dịch đầy đủ, hoặc đánh dấu `beta`/`incomplete` và giới hạn hiển thị.
17. **Xây dựng allow-list cho `i18n-litlint`** để giảm false-positive, rồi gắn vào CI.
18. **Xem xét `IStringLocalizer<T>`** cho Web/Oqtane nếu muốn tuân thủ .NET localization native.

---

## 9. Thống kê nhanh

| Chỉ số | Giá trị (2026-06-18) |
|---|---|
| Số key `en-US.json` | 1.135 |
| Số locale files shipped | 19 (trong `public/i18n/`) |
| Locale đầy đủ (≥1089 key) | 11 |
| Locale stub (<110 key) | 6 (`es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN`) |
| Key referenced but missing | 27 (18 có fallback EN) |
| `alert/confirm/prompt` hardcode | 140 |
| Fallback tiếng Anh trong `t(...)` | 163 |
| Literal candidates (`i18n-litlint`) | 15.130 |
| Server hardcode ước tính | ~1.500 |
| Platform có `ILocalizationProvider` thực | 1 / 4 (chỉ Web) |
| File `.resx` trong solution | 0 |
| Gate i18n trong CI/build | ❌ Không |

---

## 10. Kết luận

So với chiến lược V2, MegaForm đã hoàn thành **mục tiêu P0 quan trọng nhất**: loại bỏ inline catalog zombie và thống nhất về `public/i18n/en-US.json`. Đây là nền tảng để drift-prevention hoạt động.

Tuy nhiên, **gate vẫn chưa được bật**, **server vẫn chưa localize**, và **một số locale non-en đã sụt giảm nghiêm trọng**. Nếu không gắn `i18n-check` vào CI ngay lập tức, các vấn đề trên sẽ tiếp tục lặp lại sau mỗi build.

**Hành động khẩn cấp nhất:**
1. Bật gate CI cho `i18n-check.cjs`.
2. Sửa 18 key missing + 46 key chung + placeholder/script-bleed.
3. Triển khai `IMegaFormLocalizer` cho Oqtane/DNN/Umbraco theo spec P3.
4. Đồng bộ lại toàn bộ bản copy locale ra các platform.

*Kết thúc báo cáo. Không có thay đổi code nào được thực hiện.*
