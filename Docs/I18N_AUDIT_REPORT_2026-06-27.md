# Báo cáo rà soát đa ngôn ngữ (i18n/l10n) toàn diện MegaForm — 2026-06-27

> **Phạm vi:** Toàn bộ solution MegaForm — `MegaForm.UI`, `MegaForm.Core`, `MegaForm.Web`, `MegaForm.DNN`, `MegaForm.Oqtane` (Server & Client), `MegaForm.Umbraco`, `MegaForm.Premium.AspNetCore`, `MegaForm.Sdk`, `Assets/`, `DesktopModules/`.  
> **Mục tiêu:** Xác định các vùng chưa được localize, chuỗi hardcode, ngôn ngữ đang thiếu/dang dở, drift giữa các platform copy, và đề xuất kế hoạch sửa chữa. **Không sửa code.**  
> **Ngày thực hiện:** 2026-06-27.  
> **Trạng thái:** Báo cáo thuần túy, dữ liệu lấy từ codebase thực tế.

---

## 1. Tóm tắt cấp cao

MegaForm sử dụng một **hệ thống i18n dựa trên JSON duy nhất**, không dùng `.resx`, `.po/.mo`, hay `IStringLocalizer`. Catalog gốc nằm tại `MegaForm.UI/public/i18n/`, sau đó được copy sang các target platform (Web, Oqtane, DNN, Umbraco, `Assets/`).

| Chỉ số | Giá trị hiện tại | Nhận xét |
|---|---|---|
| `en-US.json` keys | **1.268** | Canonical/bundled |
| Locale full parity (REQUIRED) | **11** | Đã dịch đầy đủ |
| Locale stub (optional/beta) | **6** | Chỉ dịch 5–14% |
| Locale tham chiếu nhưng chưa ship | **1** (`zh-TW`) | Có trong code, thiếu file JSON & manifest |
| Gate `i18n-check.cjs` | **FAIL** (drift mới) | 12 key `subs.*` mới trong `SubmissionsShell.ts` chưa có trong `en-US.json` |
| Native dialogs (`alert/confirm/prompt`) | **~142** | Không thể localize theo i18n engine |
| Fallback EN inline trong `t(...)` | **~551** | Fallback tiếng Anh ẩn trong code |
| Literal candidates (`i18n-litlint`) | **15.457** | Phần lớn là code/CSS, ước tính **4.000–5.000** literal UI thực sự |
| Server `.L(...)` usages | **~7** | Gần như chưa localize server-side |
| Server hardcode ước tính | **~1.500** | Validation, workflow, controller messages, email templates |
| Frontend hardcode ước tính | **~4.000–5.000** | Builder, dashboard, widgets, dialogs, aria-labels |
| Razor/ASCX/Blazor hardcode | **~700–900** | Hầu hết views là literal tiếng Anh |

**Điểm nổi bật cần xử lý ngay:**
1. **Gate đang đỏ** do drift key mới trong `submissions/SubmissionsShell.ts`.
2. **Server-side localization gần như bằng 0**: chỉ `SubmissionProcessor.cs` và `FormValidationService.cs` dùng `.L(...)`. Các controller/service khác trả về tiếng Anh.
3. **Razor/ASCX views chưa có abstraction localization** — toàn bộ UI admin/settings là literal.
4. **6 locale beta** (`es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN`) chỉ dịch 5–14%, gây trải nghiệm lỗi khi user chọn.
5. **`zh-TW` được tham chiếu trong code nhưng không có file JSON**.
6. **Drift copy**: DNN copy thiếu ~79 key; Umbraco copy chỉ có 6 locale beta.

---

## 2. Kiến trúc i18n hiện tại

### 2.1. Công nghệ sử dụng

| Layer | Công nghệ | File chính |
|---|---|---|
| Frontend (SPA) | Custom engine TypeScript | `MegaForm.UI/src/i18n/index.ts` |
| Format date/number/currency | `Intl.*` wrapper | `MegaForm.UI/src/i18n/format.ts` |
| Backend .NET | `ILocalizationProvider` tùy chỉnh | `MegaForm.Core/i18n/MegaFormStrings.cs` |
| Backend JSON loader | `JsonLocalizationProvider` | `MegaForm.Core/i18n/JsonLocalizationProvider.cs` |
| Web host resolver | `WebLocalizationProvider` | `MegaForm.Web/Services/WebLocalizationProvider.cs` |
| Web API i18n | `I18nController` | `MegaForm.Web/Controllers/I18nController.cs` |
| Oqtane API i18n | Endpoints trong `MegaFormController` | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` |
| Build gate | `i18n-check.cjs` | `MegaForm.UI/tools/i18n-check.cjs` |
| Ref diff / literal lint | `i18n-refdiff.cjs`, `i18n-litlint.cjs` | `MegaForm.UI/tools/` |

### 2.2. Cách resolve locale

**Frontend:**
1. Query `?mflocale=xx-XX` (hoặc DNN friendly URL `/mflocale/xx-XX`)
2. `localStorage` key `mf-locale`
3. `window.__MF_PLATFORM__.culture`
4. `window.MegaFormLocale`
5. `data-mf-locale` attribute trên `<html>`/`<body>`
6. `navigator.language`
7. Fallback `en-US`

**Web host backend:**
1. Query `?lang=xx-XX`
2. `Accept-Language` header
3. Form `defaultLanguage`
4. Fallback `en-US`

**Oqtane:** Blazor gán `_culture = CultureInfo.CurrentUICulture.Name` vào `data-mf-locale`.

**DNN:** `RegisterLocaleScript` load file JS legacy `Assets/js/locales/{locale}.js` theo `Thread.CurrentThread.CurrentCulture.Name`.

### 2.3. Nguồn sự thật (source of truth)

- **Canonical:** `MegaForm.UI/public/i18n/en-US.json` + 17 locale packs + `index.json`.
- Tất cả các vị trí khác (`Assets/js/`, `MegaForm.Web/wwwroot/`, `MegaForm.Oqtane.Server/wwwroot/`, `MegaForm.Umbraco/wwwroot/`, `DesktopModules/`) đều là **bản copy/build artifact**.
- `MegaForm.UI/src/i18n/locales/` chứa bản cũ 295 key / 5 locale — **đã lỗi thời, không dùng nữa**.
- `Assets/js/locales/vi-VN.js` là file legacy cho DNN.

---

## 3. Trạng thái catalog & ngôn ngữ

### 3.1. Danh sách 18 locale chính thức (`public/i18n/index.json`)

| Code | Ngôn ngữ | Native Name | Bundled | RTL | Keys | % so với en-US | Trạng thái |
|---|---|---|---|---:|---:|---|---|
| `en-US` | English | English | Yes | No | 1.268 | 100% | ✅ Canonical |
| `de-DE` | German | Deutsch | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `pt-BR` | Portuguese (BR) | Português (BR) | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `it-IT` | Italian | Italiano | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `nl-NL` | Dutch | Nederlands | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `pl-PL` | Polish | Polski | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `ru-RU` | Russian | Русский | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `tr-TR` | Turkish | Türkçe | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `th-TH` | Thai | ไทย | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `id-ID` | Indonesian | Bahasa Indonesia | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `hi-IN` | Hindi | हिन्दी | No | No | 1.268 | 100% | ✅ REQUIRED full |
| `ar-SA` | Arabic | العربية | No | Yes | 1.272 | 100%+ | ✅ REQUIRED full (+4 extra keys) |
| `vi-VN` | Vietnamese | Tiếng Việt | No | No | 182 | 14% | ⚠️ Stub beta |
| `es-ES` | Spanish | Español | No | No | 107 | 8% | ⚠️ Stub beta |
| `ja-JP` | Japanese | 日本語 | No | No | 107 | 8% | ⚠️ Stub beta |
| `ko-KR` | Korean | 한국어 | No | No | 107 | 8% | ⚠️ Stub beta |
| `fr-FR` | French | Français | No | No | 64 | 5% | ⚠️ Stub beta |
| `zh-CN` | Chinese (Simplified) | 简体中文 | No | No | 98 | 7% | ⚠️ Stub beta |

**REQUIRED locales** (được `i18n-check.cjs` bắt buộc full parity): `de-DE`, `pt-BR`, `it-IT`, `nl-NL`, `pl-PL`, `ru-RU`, `tr-TR`, `th-TH`, `id-ID`, `hi-IN`, `ar-SA`.

### 3.2. Ngôn ngữ bị thiếu hoặc không nhất quán

| Vấn đề | Chi tiết | Đề xuất |
|---|---|---|
| `zh-TW` tham chiếu nhưng chưa ship | Có trong `KNOWN_LOCALES` (`src/i18n/index.ts`) và `COMMON_LANGS` (`src/languages/index.ts`) nhưng **không có file `zh-TW.json`** và không có trong `public/i18n/index.json`. | Hoặc tạo `zh-TW.json` và thêm vào manifest, hoặc xóa `zh-TW` khỏi code. |
| 6 locale beta quá sơ sài | `fr-FR` chỉ 64 key (5%), các locale khác 8–14%. | Có `Language Manager` UI hỗ trợ AI-assisted translation. Nên hoàn thành hoặc ẩn khỏi picker cho đến khi đủ ít nhất 80%. |
| `ar-SA` dư 4 key | `ar-SA.json` có 1.272 key so với 1.268 của `en-US`. | Review 4 key dư; nếu cần thiết thì đưa vào `en-US.json`, nếu không thì xóa. |
| Không có locale phổ biến khác | Thiếu: `es-MX`, `pt-PT`, `zh-HK`, `fil-PH`, `ms-MY`, `sv-SE`, `el-GR`, `he-IL`, `uk-UA`, v.v. | Nếu có kế hoạch mở rộng, ưu tiên `es-MX`, `zh-HK`, `he-IL`. |

### 3.3. Drift giữa các platform copy

| Vị trí | Tình trạng |
|---|---|
| `MegaForm.UI/public/i18n/` | ✅ Source of truth, 1.268 key |
| `MegaForm.Web/wwwroot/megaform/i18n/` | ✅ Đồng bộ |
| `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/{builder,bundles,plugins}/i18n/` | ✅ Đồng bộ |
| `Assets/js/{builder,plugins,i18n}/` | ✅ Đồng bộ |
| `DesktopModules/MegaForm/Assets/js/plugins/i18n/` | ⚠️ **1.189 key, thiếu ~79 key** so với source |
| `MegaForm.Umbraco/wwwroot/js/i18n/` | ❌ **Chỉ có 6 locale beta**, thiếu 11 REQUIRED locale |
| `MegaForm.UI/src/i18n/locales/` | ❌ **Lỗi thời** (295 key, 5 locale) |

### 3.4. Gate `i18n-check.cjs` hiện FAIL

```
[i18n:check] base en-US = 1268 keys
✗ 12 referenced key(s) missing from en-US:
  subs.send_to_inbox   (submissions\SubmissionsShell.ts:1791)
  subs.assign_to       (submissions\SubmissionsShell.ts:1799)
  subs.loading_users   (submissions\SubmissionsShell.ts:1802)
  subs.or_username     (submissions\SubmissionsShell.ts:1806)
  subs.note_optional   (submissions\SubmissionsShell.ts:1813)
  dash.cancel          (submissions\SubmissionsShell.ts:1819)
  subs.send            (submissions\SubmissionsShell.ts:1839)
  subs.pick_user       (submissions\SubmissionsShell.ts:1823)
  subs.sending         (submissions\SubmissionsShell.ts:1824)
  subs.sent_to_inbox   (submissions\SubmissionsShell.ts:1835)
  subs.no_dir_users    (submissions\SubmissionsShell.ts:1869)
  subs.choose_user     (submissions\SubmissionsShell.ts:1856)
```

Đây là feature **"Send submission to inbox"** mới. Các fallback tiếng Anh đã có trong `tools/missing-ref-keys.json` nhưng chưa được merge vào `en-US.json`.


---

## 4. Hardcoded strings — Backend (.NET/C#)

Backend chỉ có ~7 chỗ dùng `.L(...)`. Phần lớn controller, service, validation, workflow, email trả về tiếng Anh literal. Ước tính **~1.500 hardcoded user-facing strings**.

### 4.1. `MegaForm.Core` — ước tính 250–350 strings

| Vùng | File ví dụ | Ví dụ hardcode | Đề xuất key |
|---|---|---|---|
| Workflow executor/evaluator | `Workflow/EmailNodeExecutor.cs:89` | `"SendEmail '{label}': recipient is required."` | `workflow.email.recipient_required` |
| Workflow executor/evaluator | `Workflow/DatabaseNodeExecutor.cs:69` | `"Database '{label}': ConnectionString is required for External mode."` | `workflow.database.connection_string_required` |
| Workflow executor/evaluator | `Workflow/GoogleSheetsNodeExecutor.cs:55` | `"Google Sheets '{label}': SpreadsheetId is required."` | `workflow.googlesheets.spreadsheet_id_required` |
| Workflow executor/evaluator | `Workflow/ApprovalNodeExecutor.cs:156` | `"Approval '{label}': choose at least one candidate role or user."` | `workflow.approval.candidate_required` |
| Workflow engine | `Services/WorkflowEngine.cs:283` | `"No submission ID in context"` | `workflow.error.no_submission_id` |
| Workflow engine | `Services/WorkflowEngine.cs:322` | `"Email recipient is empty"` | `workflow.error.email_recipient_empty` |
| Workflow engine V2 | `Services/WorkflowEngineV2.cs:102` | `"Workflow execution timed out after {timeoutSec}s."` | `workflow.error.timed_out` |
| Workflow evaluator | `Services/WorkflowEvaluator.cs` | `"Variable '{target}' not declared..."` | `workflow.evaluator.variable_not_declared` |
| Form renderer | `Services/FormHtmlRenderer.cs:162` | `<div>Field "{key}" not found</div>` | `renderer.error.field_not_found` |
| Composite presets | `Services/CompositePresetRegistry.cs:58` | `"Enter a valid 9-digit SSN"` | `form.ssn_invalid` |
| Form validation | `Services/FormValidationService.cs:30` | `"Invalid form schema"` | `form.invalid_schema` |
| Workflow UI schema | `Services/WorkflowNodeUiSchemaProvider.cs:55` | `"Thanks for your submission"` | `workflow.email.default_subject_user` |
| Workflow UI schema | `Services/WorkflowNodeUiSchemaProvider.cs:67` | `"New workflow submission"` | `workflow.email.default_subject_admin` |
| Starters — success messages | `Services/Starters/LeaveRequestStarterService.cs:241` | `"Your leave request was submitted for manager review."` | `starter.leave.success_message` |
| Starters — success messages | `Services/Starters/ProposalStarterService.cs:231` | `"Your proposal was submitted for manager review."` | `starter.proposal.success_message` |
| Starters — form labels | `Services/Starters/*` | `"Employee Name"`, `"From Date"`, `"Document Title"` | `starter.fields.*` |
| Anti-spam | `Services/AntiSpamService.cs:46` | `"Honeypot field was filled in"` | `antispam.honeypot` |
| Anti-spam | `Services/AntiSpamService.cs:158` | `"Disposable email domain detected"` | `antispam.disposable_email` |
| QR code | `Services/QrCodeCornerHtmlService.cs:15` | `"Scan QR code to open on mobile"` | `qrcode.label` |
| Form schema defaults | `Models/FormSchema.cs:590` | `FillAgainLabel = "Submit another response"` | `form.fill_again_label` |
| Form schema defaults | `Models/FormSchema.cs:610` | `ReviewTitle = "Review your answers"` | `form.review_title` |
| Data repeater | `Models/DataRepeaterModels.cs:137` | `EmptyMessage = "No data found."` | `datarepeater.empty` |
| Marketing email | `Integrations/Marketing/MarketingIntegrationService.cs:84` | `Subject = "Welcome"` | `marketing.welcome_subject` |
| Marketing email | `Integrations/Marketing/MarketingIntegrationService.cs:85` | `TextBody = "Thank you for subscribing."` | `marketing.welcome_body` |
| Render model | `Rendering/RenderModelResolver.cs:190` | `"Thank you. We have received your submission."` | `form.success` |
| Render model | `Rendering/RenderModelResolver.cs:277` | `"https://dnndefender.com Megaform Trial Mode"` | `license.trial_banner` |

### 4.2. `MegaForm.DNN` — ước tính 200–300 strings

| Vùng | File | Ví dụ | Đề xuất key |
|---|---|---|---|
| Module settings | `Views/ManageModule.ascx` | `"Module mode"`, `"Select form"`, `"Renderer host"` | `dnn.settings.*` |
| Module settings | `Views/Settings.ascx` | `"Select Form"`, `"Default View"`, `"Custom View"` | `dnn.settings.*` |
| Dashboard | `Views/FormView.ascx:166` | `"Back to home page"`, `"Home"`, `"Close"` | `dnn.dashboard.*` |
| Dashboard | `Views/FormView.ascx.cs:1204` | `"Views"`, `"Form Builder"`, `"Submissions"` | `dnn.dashboard.cards.*` |
| Builder cũ | `Views/FormEditOld.ascx` | `"Upload a template ZIP package"`, `"Import Form JSON"`, `"Export Form JSON"` | `dnn.builder.*` |
| Form list | `Views/FormList.ascx:37` | `placeholder="Search forms..."` | `dnn.formlist.search_placeholder` |
| WebApi | `WebApi/MegaFormApiController.cs:518` | `"Form saved successfully."` | `api.form.saved` |
| WebApi | `WebApi/MegaFormApiController.cs:526` | `"Form deleted."` | `api.form.deleted` |
| WebApi | `WebApi/MegaFormApiController.cs:701` | `"Form duplicated."` | `api.form.duplicated` |
| WebApi | `WebApi/MegaFormApiController.cs:1487` | `"Please complete the CAPTCHA verification."` | `form.captcha_incomplete` |
| WebApi | `WebApi/MegaFormApiController.cs:1543` | `"CAPTCHA verification failed. Please try again."` | `form.captcha_failed` |
| WebApi | `WebApi/MegaFormApiController.cs:2057` | `"Status updated."` | `api.submission.status_updated` |
| WebApi | `WebApi/MegaFormApiController.cs:2067` | `"Submission updated."` | `api.submission.updated` |
| WebApi | `WebApi/MegaFormApiController.cs:2077` | `"Submission deleted."` | `api.submission.deleted` |

### 4.3. `MegaForm.Oqtane.Server` — ước tính 150–220 strings

| Vùng | File | Ví dụ | Đề xuất key |
|---|---|---|---|
| Controllers | `Controllers/MegaFormController.cs` | `"Request body is empty or not valid JSON"` | `oqtane.api.invalid_request` |
| Controllers | `Controllers/MegaFormController.cs` | `"Authentication required for uploads"` | `oqtane.api.upload_auth_required` |
| Controllers | `Controllers/MegaFormController.cs` | `"This file type is blocked by system policy"` | `oqtane.api.file_blocked` |
| Controllers | `Controllers/MegaFormController.cs` | `"Database settings saved."` | `oqtane.database.settings_saved` |
| Submission actions | `Controllers/MegaFormController.cs:3496` | `"View"`, `"Claim"`, `"Approve"`, `"Reject"`, `"Forward"`, `"Edit"`, `"Delete"` | `oqtane.submission.actions.*` |
| AI Assistant | `Controllers/AiAssistantController.cs` | `"Admin required"`, `"Missing prompt."` | `oqtane.aiassistant.*` |
| Google Sheets | `Controllers/MegaFormController.GoogleSheets.cs` | `"Google Sheets settings saved."` | `oqtane.googlesheets.settings_saved` |
| Razor widgets | `RazorWidgets/EditableList.razor` | `"ID column"`, `"Columns to display (csv)"` | `widget.editablelist.*` |
| Razor widgets | `RazorWidgets/SqlTablePivot.razor` | `"Row group column"`, `"Aggregator"` | `widget.pivot.*` |
| Razor widgets | `RazorWidgets/InteractiveCalculator.razor` | `"Base price"`, `"Currency"` | `widget.calculator.*` |
| Razor widgets | `RazorWidgets/EmailTemplate.razor` | `"Subject"`, `"Greeting"`, `"Body"` | `widget.emailtemplate.*` |

### 4.4. `MegaForm.Web` — ước tính 120–180 strings

| Vùng | File | Ví dụ | Đề xuất key |
|---|---|---|---|
| Controllers | `Controllers/MegaFormController.cs` | `"Form not found"`, `"Published form not found"` | `web.api.form_not_found` |
| Controllers | `Controllers/SetupController.cs:77` | `"Connection successful!"` | `web.setup.connection_success` |
| Payment | `Controllers/PaymentController.cs` | `"Amount must be greater than 0."` | `web.payments.amount_invalid` |
| Payment | `Controllers/PaymentController.cs` | `"PayPal API connection successful..."` | `web.payments.paypal_success` |
| Identity provisioning | `Controllers/WebWorkflowIdentityProvisioningService.cs:421` | `"Your MegaForm account has been created"` | `web.email.account_created_subject` |
| Views | `Views/Admin/Documents.cshtml` | `"Dashboard"`, `"Workflow Tasks"`, `"Submissions"` | `web.admin.*` |
| Views | `Views/Admin/RecordDetail.cshtml:331` | `"Claim"`, `"Approve"`, `"Reject"` | `web.workflow.*` |
| Views | `Views/Admin/Login.cshtml:31` | `"Admin login"` | `web.login.title` |
| Views | `Views/Setup/Index.cshtml` | `"Skip for now"` | `web.setup.skipForNow` |

### 4.5. `MegaForm.Oqtane.Client` — ước tính 40–60 strings

| File | Ví dụ | Đề xuất key |
|---|---|---|
| `Index.razor:1467` | `_listViewEmptyMessage = "No submissions yet."` | `oqtane.client.empty_submissions` |
| `Index.razor:2037` | `"Module settings saved."` | `oqtane.client.settings_saved` |
| `Index.razor:2099` | `"Save failed: " + ex.Message` | `oqtane.client.save_failed` |
| `Index.razor:2140` | `"Open form"` | `oqtane.common.openForm` |
| `DashboardView.razor:176` | `"Submissions"`, `"Recent across this site"` | `oqtane.client.dashboard.*` |
| `DashboardView.razor:191` | `"New Form"`, `"Create a fresh form"` | `oqtane.client.dashboard.cards.*` |

### 4.6. `MegaForm.Umbraco`, `MegaForm.Sdk`, `Premium` — ước tính 20–30 strings

| Dự án | File | Ví dụ | Đề xuất key |
|---|---|---|---|
| Umbraco | `Controllers/MegaFormApiController.cs` | `"Form payload is required"` | `umbraco.api.payload_required` |
| Umbraco | `Controllers/MegaFormApiController.cs` | `"Form not found"` | `umbraco.api.form_not_found` |
| Sdk | `MegaFormClient.cs:138` | `"Form not found in this portal."` | `sdk.error.form_not_found` |
| Sdk | `MegaFormClient.cs:216` | `"Form configuration is invalid."` | `sdk.error.invalid_config` |
| Premium | `Controllers/WorkflowController.cs:326` | `"Error converting value"` | `premium.workflow.parse_error` |

### 4.7. Vấn đề wiring `ILocalizationProvider`

| Dự án | Đã register `ILocalizationProvider`? | Hệ quả |
|---|---|---|
| `MegaForm.Web` | ✅ `WebLocalizationProvider` | Server localization hoạt động |
| `MegaForm.AspNetCore.Component` | ✅ `WebLocalizationProvider` | Server localization hoạt động |
| `MegaForm.Oqtane.Server` | ❌ Không register | `SubmissionProcessor` fallback về `DefaultLocalizationProvider` → tiếng Anh |
| `MegaForm.DNN` | ❌ Không register | Validation messages trả về tiếng Anh |
| `MegaForm.Umbraco` | ❌ Không register | Chỉ register `SubmissionProcessor`, không có provider |

**Đề xuất:** Tạo/đăng ký provider cho Oqtane, DNN, Umbraco. Có thể tái sử dụng `JsonLocalizationProvider` để load từ JSON catalogs.

---

## 5. Hardcoded strings — Frontend (TypeScript/JavaScript)

Frontend có cơ chế i18n khá tốt (`t()`, `tplural()`, `@i18n/format`) nhưng áp dụng chưa đầy đủ. Ước tính **~4.000–5.000 hardcoded user-facing strings**.

### 5.1. Các pattern hardcode phổ biến

| Pattern | Mô tả | Số lượng ước tính | Ví dụ |
|---|---|---:|---|
| Native dialogs | `alert()`, `confirm()`, `prompt()` | ~142 | `alert('Field key required')`, `confirm('Delete this field?')` |
| Inline fallback trong `t(key, fallback)` | Fallback tiếng Anh khi key thiếu | ~551 | `t('form.submit', 'Submit')` |
| `tr(key, fallback)` helper trong widgets | Tương tự, ở `Assets/ts/` | ~200 | `tr('widget.appointment.select_date', 'Select a date')` |
| HTML text nodes / aria-label | Trực tiếp trong markup | ~1.500 | `<span>Build</span>`, `aria-label="AI Designer"` |
| Object property labels | `label: '...'`, `title: '...'`, `placeholder: '...'` | ~1.200 | `label: 'Slot Duration (min)'` |
| Date/number format hardcoded | `toLocaleDateString('en-US')`, `.toLocaleString()` | ~50 | `date.toLocaleDateString('en-US', {...})` |
| Toast/snackbar messages | Hardcode tiếng Anh | ~200 | `showToast('Module settings saved.')` |

### 5.2. Các vùng nặng nhất

| Vùng | Files | Ước tính strings | Severity |
|---|---|---:|---|
| `MegaForm.UI/src/builder/*` | ~35 files | 800–1.000 | High |
| `MegaForm.UI/src/dashboard/*` | ~12 files | 300–400 | High |
| `MegaForm.UI/src/submissions/*`, `my-inbox/*`, `workflow-inbox/*` | ~25 files | 350–450 | High |
| `MegaForm.UI/src/ai-form-assistant/*` | ~10 files | 150–200 | Medium |
| `MegaForm.UI/src/renderer/*`, `widgets/*` | ~45 files | 300–400 | High |
| `MegaForm.UI/src/admin-live/*`, `theme-designer/*` | ~12 files | 150–200 | Medium |
| `Assets/ts/*` (legacy widgets) | 4 files | 400–500 | High |

### 5.3. Ví dụ cụ thể theo vùng

#### Builder (`src/builder/`)

| File | Line | Hardcoded | Đề xuất key |
|---|---|---|---|
| `builder/canvas.ts` | 1847 | `title="Edit settings"` | `builder.canvas.editSettings` |
| `builder/canvas.ts` | 1848 | `title="Duplicate"` | `builder.canvas.duplicate` |
| `builder/canvas.ts` | 1849 | `title="Delete"` | `builder.canvas.delete` |
| `builder/canvas.ts` | 2317 | `alert('Field key required')` | `builder.error.fieldKeyRequired` |
| `builder/canvas.ts` | 2565 | `confirm('Delete this field?')` | `builder.confirm.deleteField` |
| `builder/dom.ts` | 468 | `<span>Build</span>` | `builder.mode.build` |
| `builder/dom.ts` | 543 | `aria-label="AI Designer"` | `builder.aria.aiDesigner` |
| `builder/fields.ts` | 86 | `title="Field Properties"` | `builder.tab.fieldProperties` |
| `builder/fields.ts` | 228 | `title="Form Settings"` | `builder.tab.formSettings` |
| `builder/gallery.ts` | 1973 | `Start Blank` | `gallery.startBlank` |
| `builder/gallery.ts` | 1294 | `← Previous` | `pagination.previous` |
| `builder/gallery.ts` | 1324 | `Next →` | `pagination.next` |

#### Dashboard & AI Assistant

| File | Line | Hardcoded | Đề xuất key |
|---|---|---|---|
| `dashboard/index.ts` | 2646 | `confirm('Reseed will wipe all submissions...')` | `dash.confirm.reseed` |
| `dashboard/index.ts` | 2805 | `confirm('Delete app')` | `dash.confirm.deleteApp` |
| `dashboard/wizard/index.ts` | 93 | `alert('Could not create the form (HTTP ...)')` | `wizard.error.createHttp` |
| `ai-form-assistant/chat.ts` | 623 | `MegaForm AI` | `ai.chat.title` |
| `ai-form-assistant/chat.ts` | 1051 | `Discard` / `Apply` | `common.discard`, `common.apply` |
| `ai-form-assistant/chat.ts` | 1137 | `confirm('Clear chat history?')` | `ai.confirm.clearHistory` |
| `ai-form-assistant/providers.ts` | 606 | `Provider`, `Base URL`, `API Key`, `Model` | `ai.provider.*` |

#### Submissions & Inbox

| File | Line | Hardcoded | Đề xuất key |
|---|---|---|---|
| `submissions/SubmissionsShell.ts` | 1004 | `confirm('Delete this submission? ...')` | `sub.confirm.delete` |
| `listview/runtime.ts` | 1241 | `alert('This workflow action is missing a task id.')` | `workflow.error.missingTaskId` |
| `listview/runtime.ts` | 1249 | `alert('Could not claim task (')` | `workflow.error.claimFailed` |
| `listview/runtime.ts` | 1259 | `alert('Could not approve task (')` | `workflow.error.approveFailed` |

#### Renderer & Widgets

| File | Line | Hardcoded | Đề xuất key |
|---|---|---|---|
| `renderer/interactive.ts` | 527–528 | `date.toLocaleString('en-US', ...)` | Dùng `formatDateTime` |
| `widgets/plugins/megaform-widget-signature.ts` | 91 | `'Signed: ' + new Date().toLocaleString()` | `widget.signature.signedAt` + `formatDateTime` |
| `widgets/plugins/megaform-widget-data-repeater.ts` | 317 | `num.toLocaleString()` | Dùng `formatNumber` |
| `widgets/plugins/megaform-widget-appointment.ts` | 210 | `tr('widget.appointment.date_placeholder', 'MM/DD/YYYY')` | Key locale-specific format mask |
| `widgets/plugins/megaform-widget-captcha.ts` | 427 | `label: 'Mode'` | `widget.captcha.mode` |
| `widgets/plugins/megaform-widget-captcha.ts` | 472 | `Verification complete` | `widget.captcha.verified` |

#### Legacy `Assets/ts/`

Các file `megaform-widget-appointment.ts`, `megaform-widget-captcha.ts`, `megaform-widget-rating-suite.ts`, `megaform-widget-terms-privacy.ts` dùng helper `tr(key, fallback)` với fallback tiếng Anh. Cần chuyển sang `t()` global để `i18n-check.cjs` tracking được và fallback được dịch.

---

## 6. Hardcoded strings — Razor / Blazor / ASCX / CSHTML Views

Hầu hết server views không dùng abstraction localization. Ước tính **~700–900 strings**.

### 6.1. `MegaForm.DNN/Views/**/*.ascx`

| File | Ví dụ | Đề xuất key |
|---|---|---|
| `FormEditOld.ascx:4` | `"Error loading form builder..."` | `dnn.error.loadBuilder` |
| `FormEditOld.ascx:13` | `"Create a New Form"` | `dnn.form.createNew` |
| `FormEditOld.ascx:21` | `"Cancel"` | `common.cancel` |
| `FormEditOld.ascx:26` | `"Use This Template"` | `dnn.template.useThis` |
| `FormEditOld.ascx:50` | `"Import"` / `"Export"` / `"Preview"` | `common.import`, `common.export`, `common.preview` |
| `FormEditOld.ascx:62` | `"Save Draft"` | `common.saveDraft` |
| `FormEditOld.ascx:65` | `"Publish"` | `common.publish` |
| `FormEditOld.ascx:88` | `placeholder="Search..."` | `common.searchPlaceholder` |
| `FormEditOld.ascx:93–115` | `"Basic"`, `"Layout"`, `"Short Text"`, `"Long Text"`, `"Email"`, ... | `dnn.field.*` |
| `FormEditOld.ascx:141` | `placeholder="Form Title"` | `dnn.form.titlePlaceholder` |
| `FormEditOld.ascx:197–233` | `"Field Key"`, `"Label"`, `"Placeholder"`, `"Help Text"`, ... | `dnn.prop.*` |
| `FormEditOld.ascx:511` | `<h4>Submit</h4>` | `dnn.perm.submit` |
| `FormList.ascx:37` | `placeholder="Search forms..."` | `dnn.list.searchPlaceholder` |
| `FormList.ascx:40–41` | `"Published"`, `"Draft"` | `dnn.status.published`, `dnn.status.draft` |
| `FormList.ascx:49` | `<h3>No forms yet</h3>` | `dnn.list.empty` |
| `FormView.ascx:190` | `"Cancel"`, `"Use selected form on this page"` | `common.cancel`, `dnn.form.useSelected` |
| `FormViewOld.ascx:242` | `<h2>Thank You!</h2>` | `form.thankYou` |

### 6.2. `MegaForm.Web/Views/**/*.cshtml`

| File | Ví dụ | Đề xuất key |
|---|---|---|
| `Admin/Documents.cshtml:64` | `"Dashboard"`, `"Workflow Tasks"`, `"Submissions"` | `web.admin.*` |
| `Admin/Documents.cshtml:81` | `placeholder="Search title, slug, summary"` | `web.docs.searchPlaceholder` |
| `Admin/Documents.cshtml:97–98` | `"Filter"`, `"Clear"` | `web.common.filter`, `web.common.clear` |
| `Admin/Documents.cshtml:102` | `<h3>Managed Documents (@totalCount)</h3>` | `web.docs.managedDocuments` |
| `Admin/Documents.cshtml:212–213` | `"Previous"`, `"Next"` | `web.pagination.previous`, `web.pagination.next` |
| `Admin/RecordDetail.cshtml:131` | `"Workflow Inbox"` | `web.admin.workflowInbox` |
| `Admin/RecordDetail.cshtml:135` | `"Public URL"` | `web.record.publicUrl` |
| `Admin/RecordDetail.cshtml:331` | `"Claim"`, `"Approve"`, `"Reject"` | `web.workflow.*` |
| `Admin/RecordDetail.cshtml:430` | `"Save Metadata"` | `web.record.saveMetadata` |
| `Admin/Tasks.cshtml:139` | `"Claim comment (optional)"` | `web.tasks.claimComment` |
| `Admin/Tasks.cshtml:143` | `"Approval note (optional)"` | `web.tasks.approvalNote` |
| `Admin/Tasks.cshtml:148` | `"Reject note"` | `web.tasks.rejectNote` |
| `Admin/Tasks.cshtml:215` | `"Claim Task"` | `web.tasks.claimTask` |
| `Admin/Login.cshtml:31` | `<h2>Admin login</h2>` | `web.login.title` |
| `Admin/Login.cshtml:56` | `"Sign in"` | `web.login.signIn` |

### 6.3. `MegaForm.Oqtane.Client/*.razor`

| File | Ví dụ | Đề xuất key |
|---|---|---|
| `DashboardView.razor:191` | `title="New Form"` | `oqtane.dash.newForm` |
| `Index.razor:553` | `<h5>Administrators only</h5>` | `oqtane.admin.adminOnly` |
| `Index.razor:555` | `← Back to site` | `oqtane.nav.backToSite` |
| `Index.razor:649` | `<h5>Current App</h5>` | `oqtane.app.currentApp` |
| `Index.razor:821` | `"Review, approve, and trace business app requests"` | `oqtane.workflow.description` |
| `Index.razor:1001` | `<h5>Assignment Rules</h5>` | `oqtane.workflow.assignmentRules` |
| `Index.razor:2140` | `"Open form"` | `oqtane.common.openForm` |

---

## 7. Date / Number / Currency format

Đã có central API trong `@i18n/format` nhưng nhiều chỗ vẫn dùng `toLocaleDateString('en-US')` hoặc `toLocaleString()`.

| File | Line | Vấn đề | Đề xuất |
|---|---|---|---|
| `renderer/interactive.ts` | 527–528 | `date.toLocaleString('en-US', ...)`, `date.toLocaleDateString('en-US', ...)` | Dùng `formatDateTime`, `formatDate` |
| `listview/runtime.ts` | 336 | `toLocaleDateString(undefined, ...)` | Dùng `formatDate` |
| `listview/runtime.ts` | 1185 | `date.toLocaleString()` | Dùng `formatDateTime` |
| `dashboard/index.ts` | 470 | `new Date(v).toLocaleDateString(undefined, ...)` | Dùng `formatDate` |
| `dashboard/submission-report.ts` | nhiều | `toLocaleDateString()`, `toLocaleString()` | Dùng `formatDate` / `formatDateTime` |
| `submissions/SubmissionsShell.ts` | 1694 | `toLocaleDateString(undefined) + ' ' + toLocaleTimeString([])` | Dùng `formatDateTime` |
| `my-inbox/*` | nhiều | `toLocaleDateString()` / `toLocaleString()` | Dùng `formatDate` / `formatDateTime` |
| `templating/lookup.ts` | 106–108 | `toLocaleString(locale, ...)` + `currency: 'USD'` hardcode | Dùng `formatCurrency` / `formatNumber` |
| `Assets/ts/megaform-widget-appointment.ts` | 210 | `tr('widget.appointment.date_placeholder', 'MM/DD/YYYY')` | Locale-specific format mask |

---

## 8. Vấn đề theo từng platform

### 8.1. DNN
- Không register `ILocalizationProvider`; server validation tiếng Anh.
- `RegisterLocaleScript` chỉ load `vi-VN.js` legacy; engine mới dùng JSON.
- Copy `DesktopModules/MegaForm/Assets/js/plugins/i18n/` thiếu ~79 key.
- Không có `.resx` dù docs vẫn đề cập `DnnLocalizationProvider`.

### 8.2. Oqtane
- Server không register `ILocalizationProvider`.
- Client Blazor chỉ set `data-mf-locale`, không inject i18n service.
- Razor widgets (`RazorWidgets/*.razor`) hardcode parameter labels.
- Có API edit locale pack runtime (`i18n/create`, `i18n/save`, `i18n/import`), `en-US` được bảo vệ.

### 8.3. Web host
- `WebLocalizationProvider` đã hoạt động, nhưng views `.cshtml` chưa dùng.
- Setup wizard placeholders và labels là literal.

### 8.4. Umbraco
- Không register `ILocalizationProvider`.
- Copy locale JSON chỉ có 6 locale beta, thiếu 11 REQUIRED locale.

### 8.5. Premium templates
- `MegaForm.Premium.AspNetCore/Templates/*.json` chứa hardcoded labels (English/French) như một phần nội dung template.
- Đây là **product decision**: template theo locale hoặc cần `schema.translations` block.

---

## 9. Các bất nhất quan khác

| Vấn đề | Chi tiết | Đề xuất |
|---|---|---|
| Source-of-truth drift | `src/i18n/locales/` lỗi thời; README cũ nói đó là source. | Cập nhật README và xóa hoặc đánh dấu `src/i18n/locales/` là deprecated. |
| Language code mix | Dùng `xx-XX` nhất quán, nhưng `zh-TW` tham chiếu không file. | Quyết định `zh-TW`. |
| `ar-SA` extra keys | 4 key dư so với `en-US`. | Review và đồng bộ. |
| Không có `SupportedCultures` config | Không có `appsettings.json` nào khai báo `SupportedCultures`. | Thêm nếu muốn dùng ASP.NET Core request localization middleware; hoặc giữ custom resolution và ghi rõ. |
| No `.resx` reality | Docs đề cập `DnnLocalizationProvider` + `.resx` nhưng không tồn tại. | Cập nhật docs: DNN dùng JSON catalogs. |
| Build copies drift | DNN thiếu key; Umbraco thiếu locale. | CI kiểm tra parity copy. |

---

## 10. Phân loại mức độ nghiêm trọng

| Severity | Định nghĩa | Ví dụ |
|---|---|---|
| **High** | User end-user nhìn thấy mỗi lần dùng form; ảnh hưởng khả năng sử dụng đa ngôn ngữ. | Validation messages, submit button, success message, CAPTCHA, payment errors, native dialogs, SDK errors. |
| **Medium** | Admin/builder surfaces, aria-labels, dashboard, widget config, toasts. | Builder property labels, dashboard nav, record detail actions, setup wizard. |
| **Low** | QA pages, dev-only hints, sample/demo data, internal exceptions, premium template defaults. | QA role labels, sample starter seed data, internal parsing errors. |

---

## 11. Kế hoạch sửa chữa cho Developer

### Phase 1 — Khẩn cấp (1–2 ngày)

- [ ] **Fix gate FAIL**: thêm 12 key `subs.*` từ `tools/missing-ref-keys.json` vào `en-US.json` (và các locale REQUIRED).
- [ ] **Refresh DNN copy**: copy `public/i18n/*.json` → `DesktopModules/MegaForm/Assets/js/plugins/i18n/`.
- [ ] **Quyết định `zh-TW`**: tạo file hoặc xóa tham chiếu.
- [ ] **Review 4 extra keys** trong `ar-SA.json`.

### Phase 2 — Server-side localization (1–2 tuần)

- [ ] Đăng ký `ILocalizationProvider` cho `MegaForm.Oqtane.Server`, `MegaForm.DNN`, `MegaForm.Umbraco`.
- [ ] Mở rộng `MegaForm.Core/i18n/MegaFormStrings.cs` với các key server phổ biến.
- [ ] Localize các controller message High priority: validation, upload, CAPTCHA, payment, submission actions.
- [ ] Localize workflow executor/evaluator messages.
- [ ] Localize email template defaults (`MarketingIntegrationService`, `WebWorkflowIdentityProvisioningService`).

### Phase 3 — Frontend hardcoded strings (2–3 tuần)

- [ ] Thay thế native dialogs (`alert`/`confirm`/`prompt`) bằng custom modal wrapper có thể localize.
- [ ] Chuyển các fallback inline `t(key, 'English')` vào `en-US.json`.
- [ ] Thay `tr(key, fallback)` trong `Assets/ts/` bằng global `t()`.
- [ ] HTML text nodes, `aria-label`, `title`, `placeholder` trong builder/dashboard: thay bằng `t()`.
- [ ] Localize AI Assistant UI (chat, providers, inline edit).

### Phase 4 — Razor/ASCX/Blazor views (1–2 tuần)

- [ ] Web/Oqtane: dùng `IStringLocalizer`/`IViewLocalizer` hoặc inject `ILocalizationProvider` vào `.cshtml`/`.razor`.
- [ ] DNN: tạo `.resx` hoặc dùng JSON catalogs qua custom helper.
- [ ] Localize `MegaForm.DNN/Views/FormEditOld.ascx`, `FormList.ascx`, `FormView.ascx`, `Settings.ascx`.
- [ ] Localize `MegaForm.Web/Views/Admin/*.cshtml`, `Setup/Index.cshtml`.
- [ ] Localize `MegaForm.Oqtane.Client/Index.razor`, `DashboardView.razor`.

### Phase 5 — Date/number/currency & format (3–5 ngày)

- [ ] Thay tất cả `toLocaleDateString('en-US')` / `toLocaleString()` bằng `@i18n/format` helpers.
- [ ] Locale-specific date placeholder: `widget.appointment.date_placeholder` = format mask theo locale.
- [ ] Thay `currency: 'USD'` hardcode bằng locale currency hoặc form setting.

### Phase 6 — Hoàn thiện locale beta (ongoing)

- [ ] Dùng Language Manager UI + AI-assisted translation để hoàn thành `es-ES`, `fr-FR`, `ja-JP`, `ko-KR`, `vi-VN`, `zh-CN` lên ít nhất 80%.
- [ ] Khi một locale đạt 100%, đưa vào danh sách REQUIRED trong `i18n-check.cjs`.

### Phase 7 — Automation & docs (1 tuần)

- [ ] Extend `i18n-check.cjs` hoặc CI để verify platform copies parity.
- [ ] Cập nhật `MegaForm.UI/src/i18n/README_I18N.md` và docs DNN cho đúng source-of-truth.
- [ ] Thêm allow-list dynamic keys (`builder.tab_`, `dash.role_`, `inbox.status_`) vào `i18n-check.cjs` nếu cần.
- [ ] Chạy `npm run i18n:litlint` hàng tuần và triage top files.

---

## 12. Checklist ngắn cho Developer sửa từng file

Khi sửa một file hardcode, kiểm tra:

1. [ ] Chuỗi có phải user-facing không? (bỏ qua nếu là internal dev/constant)
2. [ ] Đã tồn tại key trong `en-US.json` chưa? Dùng lại nếu có.
3. [ ] Nếu chưa có, tạo key theo namespace rõ ràng (`builder.*`, `dash.*`, `form.*`, `workflow.*`, `widget.*`, `common.*`).
4. [ ] Thêm key vào `en-US.json` trước, sau đó chạy `npm run i18n:check -- --fill` để backfill các locale REQUIRED.
5. [ ] Dịch nghĩa sang 11 locale REQUIRED (hoặc để `en-US` tạm nếu chưa có translator).
6. [ ] Thay chuỗi trong code bằng `t('key')`, `t('key', {param})`, hoặc `tplural('key', count)`.
7. [ ] Với native dialogs, thay bằng custom modal wrapper localize.
8. [ ] Với date/number, dùng `@i18n/format`.
9. [ ] Chạy `npm run i18n:check` để đảm bảo gate PASS.
10. [ ] Copy `public/i18n/*.json` sang các platform targets nếu build process không tự động.

---

## 13. Công cụ & lệnh hữu ích

```bash
# 1. Kiểm tra gate hiện tại
cd MegaForm.UI
npm run i18n:check

# 2. Backfill missing keys vào các locale REQUIRED (chỉ làm khi đã review)
npm run i18n:check -- --fill

# 3. Liệt kê toàn bộ literal candidates trong src/
npm run i18n:litlint

# 4. Diff keys giữa en-US và một locale
cd public/i18n
node -e "const a=require('./en-US.json'), b=require('./es-ES.json'); console.log(Object.keys(a).filter(k=>!b[k]))"

# 5. Đếm số keys mỗi locale
cd public/i18n
for f in *.json; do echo "$f: $(node -e "console.log(Object.keys(require('./$f')).length)" 2>/dev/null)"; done
```

---

## 14. Phụ lục — File & thư mục liên quan

### Catalog & engine
- `MegaForm.UI/public/i18n/en-US.json`
- `MegaForm.UI/public/i18n/index.json`
- `MegaForm.UI/src/i18n/index.ts`
- `MegaForm.UI/src/i18n/format.ts`
- `MegaForm.UI/src/languages/index.ts`

### Backend localization
- `MegaForm.Core/i18n/MegaFormStrings.cs`
- `MegaForm.Core/i18n/JsonLocalizationProvider.cs`
- `MegaForm.Web/Services/WebLocalizationProvider.cs`
- `MegaForm.Web/Controllers/I18nController.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`

### Build tools
- `MegaForm.UI/tools/i18n-check.cjs`
- `MegaForm.UI/tools/i18n-refdiff.cjs`
- `MegaForm.UI/tools/i18n-litlint.cjs`
- `MegaForm.UI/tools/missing-ref-keys.json`

### Platform copies
- `MegaForm.Web/wwwroot/megaform/i18n/`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/{builder,bundles,plugins}/i18n/`
- `MegaForm.Umbraco/wwwroot/js/{i18n,builder,bundles}/`
- `Assets/js/{builder,plugins,i18n}/`
- `DesktopModules/MegaForm/Assets/js/plugins/i18n/`

### Views cần localize
- `MegaForm.DNN/Views/*.ascx`
- `MegaForm.Web/Views/**/*.cshtml`
- `MegaForm.Oqtane.Client/*.razor`
- `MegaForm.Oqtane.Server/RazorWidgets/*.razor`

### Docs liên quan (đã tồn tại)
- `Docs/I18N_AUDIT_REPORT_2026-06-22.md`
- `Docs/I18N_FULL_HARDCODED_TEXT_AUDIT_REPORT.md`
- `Docs/I18N_LANGUAGE_EXPANSION_PLAN.md`
- `Docs/I18N_REMEDIATION_PLAN_2026-06-19.md`
- `MegaForm.UI/src/i18n/README_I18N.md`

---

*End of audit report.*
