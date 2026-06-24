# Báo cáo rà soát i18n / Multi-language — MegaForm

**Ngày rà soát:** 2026-06-15  
**Phạm vi:** Toàn bộ solution MegaForm (Core, Sdk, AspNetCore, Web, DNN, Oqtane, Umbraco, UI/frontend).  
**Mục tiêu:** Xác định cơ chế đa ngôn ngữ hiện tại, các điểm còn sót, chưa hoàn thiện và các chuỗi hardcode chưa được localize.  
**Ràng buộc:** Báo cáo thuần tuý, không sửa code.

---

## Mục lục

1. [Tóm tắt cấp cao](#1-tóm-tắt-cấp-cao)
2. [Cơ chế i18n hiện tại](#2-cơ-chế-i18n-hiện-tại)
3. [Điểm mạnh](#3-điểm-mạnh)
4. [Điểm yếu & lỗ hổng kiến trúc](#4-điểm-yếu--lỗ-hổng-kiến-trúc)
5. [Hardcoded string chưa localize theo nền tảng](#5-hardcoded-string-chưa-localize-theo-nền-tảng)
   - 5.1 [MegaForm.UI / Frontend](#51-megaformui--frontend)
   - 5.2 [MegaForm.Web / AspNetCore](#52-megaformweb--aspnetcore)
   - 5.3 [MegaForm.DNN](#53-megaformdnn)
   - 5.4 [MegaForm.Oqtane](#54-megaformoqtane)
   - 5.5 [MegaForm.Umbraco](#55-megaformumbraco)
   - 5.6 [MegaForm.Core / Sdk](#56-megaformcore--sdk)
6. [Vấn đề kiến trúc nổi bật](#6-vấn-đề-kiến-trúc-nổi-bật)
7. [Khuyến nghị & lộ trình ưu tiên](#7-khuyến-nghị--lộ-trình-ưu-tiên)
8. [Phụ lục: Công cụ & tài liệu liên quan](#8-phụ-lục-công-cụ--tài-liệu-liên-quan)

---

## 1. Tóm tắt cấp cao

MegaForm đã đầu tư đáng kể cho **frontend i18n**: có engine tùy chỉnh, 20 gói ngôn ngữ JSON, giao diện quản lý ngôn ngữ (Language Manager), hỗ trợ RTL, và quy trình phát hiện locale đa tầng. Tuy nhiên, **tầng server và các lớp shell đặc thù từng nền tảng còn rất nhiều chuỗi tiếng Anh hardcode** chưa qua localize. Đặc biệt:

- **Không có file `.resx`** nào trong toàn solution.
- **Server-side** chỉ có ~40 key fallback en-US trong `MegaForm.Core/i18n/MegaFormStrings.cs`; `ILocalizationProvider` chỉ được đăng ký thực sự ở `MegaForm.Web`.
- **Oqtane, DNN, Umbraco** chưa có provider localization ở server; các lỗi/API trả về tiếng Anh nguyên bản.
- **Blazor/Razor/.ascx** của Oqtane và DNN hầu như hardcode toàn bộ nhãn, tiêu đề, thông báo.
- **Frontend** dù đã có hệ thống i18n, vẫn còn ~139+ lỗi gọi `alert/confirm/prompt` với chuỗi cứng, và nhiều nhãn trong builder/dashboard/theme-designer chưa được gói qua `t()`.

**Kết luận:** Sản phẩm đang ở trạng thái “một nửa đã i18n”: runtime form renderer tương đối tốt, nhưng admin chrome, server messages, email templates, workflow designer, setup wizard và các nền tảng DNN/Oqtane/Umbraco còn nhiều điểm chưa hoàn thiện.

---

## 2. Cơ chế i18n hiện tại

### 2.1. Tài nguyên ngôn ngữ

| Định dạng | Tồn tại? | Ghi chú |
|-----------|----------|---------|
| `.resx` | ❌ Không | Toàn solution 0 file `.resx`. |
| `.po/.mo` | ❌ Không | Không sử dụng gettext. |
| JSON locale | ✅ Có | `MegaForm.UI/public/i18n/*.json` là nguồn chính; được copy ra `Assets/js/.../i18n`, `DesktopModules/MegaForm/Assets/js/.../i18n`, `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/.../i18n`, `MegaForm.Web/wwwroot/megaform/i18n`, `MegaForm.Umbraco/wwwroot/js/.../i18n`. |
| DNN `App_LocalResources` | ❌ Không | Không tồn tại. |
| Umbraco `/Lang/*.xml` | ❌ Không | Không tồn tại. |
| Oqtane `.resx` | ❌ Không | Không tồn tại. |

- `MegaForm.UI/public/i18n/en-US.json` là catalog gốc, hiện có **1.124 keys**.
- Có 20 locale files (ví dụ: `es-ES`, `fr-FR`, `de-DE`, `pt-BR`, `ar-SA`, `vi-VN`, `ja-JP`, `ko-KR`, `zh-CN`, `zh-TW`, …). Một số gói châu Á chỉ là stub vài chục/tới trăm key, chưa đầy đủ.

### 2.2. Engine & abstraction

| Lớp | File | Mô tả |
|-----|------|-------|
| Abstraction | `MegaForm.Core/i18n/MegaFormStrings.cs` | Định nghĩa `ILocalizationProvider` với `L(key, params)`; cung cấp `DefaultLocalizationProvider` (~40 key en-US fallback). |
| JSON provider | `MegaForm.Core/i18n/JsonLocalizationProvider.cs` | Đọc JSON từ đĩa, overlay locale lên en-US, hỗ trợ fallback mã ngôn ngữ (`ja` → `ja-JP`). |
| Web provider | `MegaForm.Web/Services/WebLocalizationProvider.cs` | Kế thừa `JsonLocalizationProvider`, phân giải locale từ `?lang=`, `Accept-Language`, fallback `en-US`. |
| API i18n | `MegaForm.Web/Controllers/I18nController.cs` | `GET /api/MegaForm/i18n/{locale}`, `GET /api/MegaForm/i18n/list`. |
| Oqtane API | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Các endpoint `i18n/list`, `i18n/Get?id=`, `i18n/create|save|import`, `i18n/export/{locale}`. |
| Frontend engine | `MegaForm.UI/src/i18n/index.ts` | `t(key, params)`, `tplural()`, `loadLocale()`, `detectLocale()`, `setLocale()`, hỗ trợ RTL, cache `localStorage`. |
| Format helpers | `MegaForm.UI/src/i18n/format.ts` | `formatDate/Time/DateTime/Number/Currency`, `plural` dùng `Intl`. |
| Language Manager | `MegaForm.UI/src/languages/index.ts` | UI chỉnh sửa gói ngôn ngữ toàn hệ thống. |
| QA tools | `MegaForm.UI/tools/i18n-check.cjs`, `i18n-refdiff.cjs`, `i18n-litlint.cjs`, … | Kiểm tra key parity, key thiếu, placeholder parity, literal chưa wrap. **Chưa được gắn vào CI/build.** |

### 2.3. Phát hiện locale (frontend)

Ưu tiên:
1. Query param `?mflocale=` (hoặc path DNN-friendly `/mflocale/de-DE`).
2. `localStorage('mf-locale')`.
3. `window.__MF_PLATFORM__.culture`.
4. `window.MegaFormLocale`.
5. `data-mf-locale` trên `<html>` / `<body>`.
6. `navigator.language`.
7. Fallback `en-US`.

---

## 3. Điểm mạnh

1. **Frontend engine đầy đủ:** `t()`, plural, RTL, cache, lazy-load, fallback locale.
2. **Catalog JSON tập trung:** `en-US.json` là nguồn chính, copy đồng bộ ra các nền tảng.
3. **Language Manager UI:** Cho phép tạo/sửa/import/export/AI dịch gói ngôn ngữ.
4. **RTL:** Có `isRTL()`, `setDir()`, `mf-rtl.css` và hỗ trợ Arabic.
5. **Format locale-aware:** Sử dụng `Intl` cho ngày/giờ/số/tiền tệ.
6. **Phát hiện locale linh hoạt:** Nhiều tầng ưu tiên query/storage/platform/browser.
7. **QA tooling:** Có `i18n-check.cjs`, `i18n-litlint.cjs` (dù chưa gắn CI).

---

## 4. Điểm yếu & lỗ hổng kiến trúc

| # | Vấn đề | Mức độ | Ghi chú |
|---|--------|--------|---------|
| 1 | **Không có `.resx`/tài nguyên .NET** | Cao | DNN/Oqtane/Umbraco không thể dùng cơ chế localization native. |
| 2 | **Server-side i18n rất hạn chế** | Cao | Chỉ `MegaForm.Web` đăng ký `ILocalizationProvider`; DNN/Oqtane/Umbraco server dùng fallback en-US ~40 key. |
| 3 | **Oqtane Server không đăng ký `ILocalizationProvider`** | Cao | Dù có endpoint i18n cho frontend, code server vẫn trả lỗi tiếng Anh. |
| 4 | **DNN không có RESX** | Trung bình | Toàn bộ server-rendered UI là tiếng Anh cứng. |
| 5 | **Umbraco không có tích hợp localization native** | Trung bình | Chỉ có static JS assets, không có `ILocalizedTextService`, dictionary, `/Lang`. |
| 6 | **Hai stack localization tách rời** | Trung bình | Stack “chrome catalog tĩnh” (`t('builder.save')`) và stack “dịch nội dung form” (`schema.translations[locale]`) không chia sẻ key hay trải nghiệm chỉnh sửa. |
| 7 | **i18n-check chưa gắn CI/build** | Trung bình | Không có gate chống drift; hardcode vẫn liên tục xuất hiện. |
| 8 | **`alert/confirm/prompt` với chuỗi cứng** | Cao | ~139+ vị trí ở frontend; không thể style hay localize. |
| 9 | **Email templates & workflow node UI schema hardcode** | Cao | Nhiều subject/body/preset nhãn mô tả tiếng Anh. |
| 10 | **Razor/Blazor/.ascx shell chưa localize** | Cao | Admin dock, settings, dashboard, setup wizard, workflow inbox đều hardcode. |

---

## 5. Hardcoded string chưa localize theo nền tảng

> **Ghi chú chung:** Các dòng (line) dưới đây được trích từ snapshot code tại thởi điểm rà soát. Do codebase đang phát triển liên tục, số dòng có thể dịch chuyển. Các ví dụ mang tính **đại diện**, không phải exhaustive list.

### 5.1. MegaForm.UI / Frontend

Engine i18n tồn tại, nhưng nhiều vị trí vẫn dùng literal tiếng Anh hoặc fallback en-US.

#### A. Native dialogs (`alert`/`confirm`/`prompt`)

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `src/dashboard/index.ts` | 2639, 2798, 3739, 4042, 4211 | `"Reseed will wipe all submissions..."`, `"Delete app \"...\"?"`, `"Delete \"...\"? This cannot be undone."`, `"Enter the target user id or email..."` | Xóa form/app, reseed, share |
| `src/builder/canvas.ts` | 2186, 2342, 2434, 3162 | `"Field key required"`, `"Convert this Row to a FlexGrid?"`, `"Delete this field?"` | Builder canvas |
| `src/builder/gallery.ts` | 256, 606 | `"Create or refresh published forms..."`, `"Replace the current form schema with ...?"` | Template gallery |
| `src/builder/phase2.ts` | 243, 307 | `"Delete this view?"`, `"Save the form first."` | View designer |
| `src/listview/runtime.ts` | 1204, 1246, 1256, 1283 | `"Delete submission #...? This cannot be undone."`, `"Optional claim note..."`, `"Forward this BPMN task to which username/email?"` | Workflow actions |
| `src/submissions/SubmissionsShell.ts` | 861, 956 | `"Delete this submission? This cannot be undone."`, `"Delete N submissions? This cannot be undone."` | Submissions |
| `src/ai-knowledge/index.ts` | 242, 368 | `"You have unsaved changes. Discard?"`, `"Delete \"...\"?"` | AI Knowledge |
| `src/config/ConfigPanel.ts` | 100, 233, 241 | `"⚠️ Delete ALL ... form(s) for this module?"`, `"Please select a form first"` | Module config |

#### B. Builder UI / presets / workflow

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `src/builder/dom.ts` | 836, 842, 855 | `"Form Settings"`, `"Theme Designer"`, `"BPMN 2.0 Workflow"`, `"Print Settings"` | Tabs |
| `src/builder/presets.ts` | 19–21, 88–91 | `"🎂 Birthday Party RSVP"`, `"RSVP Now!"`, `"Your Name 👤"`, `"Email Address 📧"` | Built-in presets |
| `src/builder/templates.ts` | 13 | `"Untitled Form"` | Default title |
| `src/builder/theme-tab-adapter.ts` | 110–115 | `"Modern Blue"`, `"Warm Sunset"`, `"Dark Elegance"`, `"Classic Formal"` | Theme preset names |
| `src/builder/workflow-canvas.ts` | 53–61, 119, 2730 | `" Workflow"`, `"Untitled Workflow"`, `"Automation for: "`, `"MegaForm workflow"`, `"Clear all nodes and edges?"` | Workflow designer |
| `src/builder/workflow/wf-panels.ts` | 36–71 | `"Select a node to edit its properties."`, `"Represent page"`, `"True edge label"` | Workflow panels |
| `src/builder/workflow/wf-components.ts` | 65–285 | `"Candidate role: "`, `"Show minimap"`, `"BPMN NODES"`, `"Search BPMN nodes..."` | Workflow components |
| `src/builder/workflow/wf-webhook.ts` | 143–148 | `"Webhook = send this submission..."`, `"Send all form fields"`, `"Map selected fields"`, `"Use raw JSON template"` | Webhook config |
| `src/builder/properties.ts` | 489–492, 1160, 1885, 2377 | `"Minimal Clean"`, `"Whitespace-first..."`, `"Clear custom HTML?"`, `"Add at least one field first."` | Field/theme properties |

#### C. Renderer

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `src/renderer/megaform-renderer.ts` | 967, 2289, 2308, 2638, 2761–2762 | `"Close popup form"`, `"<i class=\"fa fa-check-circle\"></i> Complete submission"`, `"Preview mode — submission disabled"`, `"Draft saved! Resume later:..."`, `"Error saving draft"` | Buttons, tooltips, draft alerts |
| `src/renderer/inputs.ts` | 88, 143, 132–134 | `"Helpful rating"`, `"Date picker"`, data-placeholder, data-label-* | ARIA/placeholder |

#### D. Dashboard / DNN host / view-designer

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `src/dashboard/index.ts` | 526, 583, 589, 3727 | `"Deploy MegaForm on your own server..."`, `"Form lock changes are disabled on demo site"`, `"Settings editing is disabled on demo site"`, `"Report module loading..."` | Dashboard banners/alerts |
| `src/dnn-host/index.ts` | 159, 169–170, 457, 464, 618, 1108 | `"Starter launch failed..."`, `"Missing moduleId context..."`, `"Choose a portal page..."`, `"This page is currently the public Renderer Host..."`, `"Could not save the renderer host..."`, `"Please choose a form first."` | DNN host messages |
| `src/view-designer/settings-popup.ts` | 7, 92–99 | `"Manage Module"`, `"MegaForm Settings"`, `"Configure this module instance..."` | Settings popup |
| `src/config/ViewSettings.ts` | 17–98 | `"Submit Form"`, `"Data entry form"`, `"List View"`, `"Newest First"`, `"Oldest First"`, `" Enable search bar"` | View settings |

#### E. Widgets

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `src/widgets/plugins/megaform-widget-captcha.ts` | 188–316 | `"Solve: "`, `"Drag the slider to..."`, `"Unscramble this word:"`, `"... letters"`, `"Click the ..."`, `"Select the correct image"` | Captcha challenges |
| `src/widgets/plugins/megaform-widget-terms-privacy.ts` | 88–99 | `"I have read and accept the"`, `"Terms of Service"`, `"Privacy Policy"`, `" and "` | Terms widget |
| `src/widgets/plugins/megaform-widget-payment-unified.ts` | 96–416 | `"Secure Payment"`, `"Amount due"`, `"Pay by card"`, `"Payment completed"`, `"Stripe publishable key is missing."` | Payment widget |
| `src/widgets/plugins/megaform-widget-datagrid.ts` | 84 | `"No matching rows."`, `"No rows yet. Click + Add row."` | DataGrid |

#### F. HTML standalone

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `Assets/embed-preview.html` | 6, 123–237 | `"MegaForm Embed Preview"`, `"🔗 MegaForm Embed Code Generator"`, `"Configuration"`, `"Method 1: Script Tag"`, `"Copied!"` | Embed generator page |

#### G. AI assistant

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `src/ai-form-assistant/chat.ts` | 144, 159, 187, 192 | `"Create with AI"`, các system prompt lớn bằng tiếng Anh | AI chat header & prompts |
| `src/ai-form-assistant/tools.ts` | 29–40 | Mô tả tool tiếng Anh gửi tới LLM | Function-tool schema |
| `src/ai-form-assistant/ops.ts` | 371, 427, 447 | `"No active form schema"`, `"[DL-001] Refused to add..."` | AI guardrails |

---

### 5.2. MegaForm.Web / AspNetCore

Các controller, service, Razor view trả về/tiếp xúc trực tiếp với ngườii dùng đều hardcode tiếng Anh.

#### Controllers

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Web/Controllers/AdminController.cs` | 89–132, 267–436 | `"Total Forms"`, `"Submissions"`, `"Saved Drafts"`, `"Revision published."`, `"Task claimed."`, `"Comment body is required."`, `"Document metadata is only available..."` | Dashboard stats, TempData messages |
| `MegaForm.Web/Controllers/SetupController.cs` | 64–368 | `"Connection successful!"`, `"Already setup."`, `"Setup is not complete yet."`, `"Production settings file not found yet."`, `"Application restarted successfully..."`, `" Tip: for local/dev SQL Server..."` | Setup wizard API |
| `MegaForm.Web/Controllers/FormController.cs` | 44–368 | `"Form not found."`, `"This form is not published yet."`, `"Untitled Form"`, `"MegaForm"`, `"Open this form online."` | Public form, share image |
| `MegaForm.Web/Controllers/PrintController.cs` | 43–133 | `"Form not found."`, `"Print layout is not enabled..."`, `"🖨️ Print Preview"`, `"✕ Close"`, `"🖨️ Print / Save PDF"` | Print toolbar |
| `MegaForm.Web/Controllers/AiKnowledgeController.cs` | 67–207 | `"Body required"`, `"Not found"`, `"slug is required"`, `"List View Designer"`, `"Card View Designer"` | AI KB seed |
| `MegaForm.Web/Controllers/WorkflowController.cs` | 46–263 | `"formId is required."`, `"nodeType is required."`, `"workflow is required."`, `"SaveDraft failed: "`, `"Apply failed: "` | Workflow API |

#### Razor Views

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Web/Views/Setup/Index.cshtml` | 187–562, 881–884 | `"MegaForm"`, `"Installation Wizard"`, `"Database"`, `"Site Info"`, `"Admin"`, `"Email"`, `"Skip for now"`, `"Continue"`, `"MegaForm is ready!"`, `"Recommended for all environments."` | Setup wizard UI |
| `MegaForm.Web/Views/Admin/Index.cshtml` | 12, 27, 41 | `"MegaForm — Dashboard"`, `"Loading dashboard…"`, `"Dashboard error: "` | Admin dashboard |
| `MegaForm.Web/Views/Admin/Login.cshtml` | 31–59 | `"Admin login"`, `"Sign in to open the MegaForm dashboard..."`, `"Username or email"`, `"Password"`, `"Sign in"` | Login |
| `MegaForm.Web/Views/Admin/Tasks.cshtml` | 18–215 | `"Workflow Inbox"`, `"No tasks are currently assigned to you."`, table headers, action buttons | Tasks inbox |
| `MegaForm.Web/Views/Admin/RecordDetail.cshtml` | 37–547 | Hàng trăm nhãn, empty state, buttons, metadata labels | Record detail |
| `MegaForm.Web/Views/Admin/Documents.cshtml` | 25–213 | `"Documents"`, status options, filter labels, empty state, table headers | Documents |
| `MegaForm.Web/Views/Admin/ViewLogs.cshtml` | 48–100 | `"View Logs"`, `"Category"`, `"Log name"`, `"Search"`, `"Take"`, `"Apply"`, `"Clear matching log files?"` | Logs |
| `MegaForm.Web/Views/Form/View.cshtml` | 8, 204–233 | `"Fill out this form"`, `"Preview Mode — this form is not yet published"`, `"← Back to Builder"`, `"Powered by MegaForm"` | Public form view |

#### Core services

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Core/Services/WorkflowTaskService.cs` | 156–507 | `"Task is not open."`, `"You do not have permission to claim this task."`, `"A comment is required."`, `"Workflow task not found."` | Workflow task errors |
| `MegaForm.Core/Services/WorkflowEvaluator.cs` | 386–659 | `"Webhook '...': URL is required."`, `"SendEmail '...': recipient (To) is required."`, `"Approval '...': choose at least one candidate role or user."` | Workflow validation |
| `MegaForm.Core/Services/EmailNotificationService.cs` | 28–167 | `"[MegaForm] New submission: ..."`, `"Thank you — {form.Title}"`, `"New Submission — ..."`, `"Thank you!"`, `"Your Answers"`, `"Automated email — do not reply."` | Email subjects/bodies |
| `MegaForm.Core/EmailSummaries/EmailSummaryService.cs` | 63–100 | `"Total Submissions"`, `"{SiteName} - Form Summary"`, `"Period: ..."`, `"View Form"` | Email summary |
| `MegaForm.Core/Services/WorkflowNodeUiSchemaProvider.cs` | 46–481 | Hàng chục node titles, descriptions, section titles, field labels, placeholders | Workflow node UI schema |
| `MegaForm.Core/Services/EmailWorkflowNodeUiService.cs` | 14–86 | `"Send Email"`, `"Recipients"`, `"To"`, `"Cc"`, `"Subject"`, `"Body"`, presets `"Confirmation"`, `"Internal Alert"`, `"Approval Request"` | Node UI |
| `MegaForm.Core/Services/WebhookWorkflowNodeUiService.cs` | 15–117 | `"Webhook"`, `"Request"`, `"Authentication"`, `"Response routing"`, `"Generic JSON POST"`, `"CRM Lead POST"` | Node UI |
| `MegaForm.Core/Models/FormSchema.cs` | 569–584 | `"Submission received"`, `"Thank you. We have received your submission."`, `"Submission ID"`, `"Your answers"` | Form defaults |
| `MegaForm.Core/SpamProtection/HttpCaptchaProviderBase.cs` | — | `"CAPTCHA token is required."`, `"CAPTCHA verification failed: ..."` | Captcha errors |
| `MegaForm.Core/Integrations/Marketing/...` | — | `"Mailchimp health check failed..."`, `"Provider '...' is not registered."`, `"Welcome"`, `"Thank you for subscribing."` | Marketing providers |

---


### 5.3. MegaForm.DNN

**Đặc điểm:** Không có `.resx`, không có `Localization.GetString`, không có `App_LocalResources`. Toàn bộ server-rendered UI là hardcode tiếng Anh. Chỉ có JS bundle modern dùng `MegaFormI18n` một phần.

#### Views `.ascx`

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.DNN/Views/FormList.ascx` | 7–102 | `"My Forms"`, `"Manage and track all your forms"`, `"Create Form"`, `"Total Forms"`, `"Published"`, `"Drafts"`, `"Total Submissions"`, `"Search forms..."`, `"No forms yet"`, `"Last:"`, `"Created:"` | Form list |
| `MegaForm.DNN/Views/FormView.ascx` | 172–748 | `"View Submissions"`, `"Edit Form"`, `"MegaForm Dashboard"`, `"Loading dashboard…"`, `"Form Builder"`, `"Submissions"`, `"Languages"`, `"My Inbox"`, `"Update Theme"`, `"Saving..."`, `"The requested form is not available..."`, `"You must be logged in..."`, `"Previous"`, `"Save Draft"`, `"Next"`, `"Submit"`, `"Submitting..."` | Module host & renderer |
| `MegaForm.DNN/Views/FormEdit.ascx` | 17–71 | `"Error loading MegaForm Builder..."`, `"Loading MegaForm Builder…"` | Builder host |
| `MegaForm.DNN/Views/ManageModule.ascx` | 6–174 | `"Configure how this MegaForm module instance behaves..."`, `"Module form & view"`, `"Renderer host"`, `"Display mode"`, `"Fixed form"`, `"Popup form"`, `"Time delay"`, `"Scroll depth"`, `"Click trigger"`, `"Sample HTML trigger"`, `"Update"`, `"Go To Dashboard"`, `"Cancel"` | Module settings |
| `MegaForm.DNN/Views/Settings.ascx` | 14–78 | `"Select Form"`, `"Default View"`, `"Custom View"`, `"Renderer Host"`, `"App Scope"`, `"Bus Channel"`, `"Detail Target Module"`, `"Quick Actions"`, `"Create New Form"` | Settings |
| `MegaForm.DNN/Views/Tasks.ascx` | 7–117 | `"Sign in with a DNN account..."`, `"MegaForm Workflow Inbox"`, `"Refresh"`, `"Inbox Link"`, `"Submissions"`, `"Builder"`, `"Manage"`, `"My Tasks"`, `"Role Queue"`, `"Task Detail"` | Workflow inbox |
| `MegaForm.DNN/Views/FormEditOld.ascx` | Toàn file | `"Create a New Form"`, `"Short Text"`, `"Long Text"`, `"Email"`, `"Number"`, `"Date"`, `"Phone"`, `"Dropdown"`, `"Radio"`, `"Checkboxes"`, `"File Upload"`, `"Submit"`, `"AI Design Assistant"`, `"JavaScript Embed (Recommended)"`, v.v. | Legacy builder |
| `MegaForm.DNN/Views/FormViewOld.ascx` | Toàn file | `"No form has been configured..."`, `"Thank You!"`, `"Reference: #"` | Legacy renderer |

#### Code-behind / Services / Controllers

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.DNN/Views/ManageModule.ascx.cs` | 208–1291 | `"Please choose a form first."`, `"-- Select a Form --"`, `"Form Renderer"`, `"Renderer Host"`, `"Admin Dashboard"`, `"No forms exist yet..."`, `"Update"`, `"Close"`, `"Cancel"`, `"Back"`, `"Go To Dashboard"`, `"Submit Registration Request"`, `"Your registration request was submitted..."` | Logic + sample seed |
| `MegaForm.DNN/Views/Settings.ascx.cs` | 37–194 | `"-- Select a Form --"`, `"Form (Submit)"`, `"List View (Table)"`, `"Card View (Grid)"`, `"Detail View (Single Record)"`, `"(Use default)"`, `"(None - standalone form)"` | Settings logic |
| `MegaForm.DNN/Views/FormView.ascx.cs` | 600, 1204–1210 | Fallback theme designer host HTML; `"Categories"`, `"Comments"`, `"Analytics"`, `"Applications"`, `"Interviews"`, `"Primary"`, `"Form"` | Renderer host / AI categories |
| `MegaForm.DNN/Services/DnnEmailSender.cs` | 68–100 | `"MegaForm"` (default from name), `"Email settings are missing."`, `"Recipient email is required."` | Email |
| `MegaForm.DNN/Services/DnnWorkflowIdentityProvisioningService.cs` | 29–243 | `"RoleName is required."`, `"UserIdentifier is required."`, `"Role '...' was not found."`, `"UserName or Email is required."`, `"MegaForm!2026"` | Workflow identity |
| `MegaForm.DNN/WebApi/AiKnowledgeController.cs` | 91, 225, 236 | `"Body required"`, `"Not found"` | API errors |
| `MegaForm.DNN/WebApi/MegaFormApiController.cs` | 1617, 2186, 2999 | `"unknown"`, `"No data"`, `"pdf"` | Fallbacks |

---

### 5.4. MegaForm.Oqtane

**Đặc điểm:** Không có `.resx`, không dùng `IStringLocalizer` dù `Microsoft.Extensions.Localization` đã import. Các component Blazor/Razor hardcode toàn bộ. JS bundles đã có i18n.

#### Client `.razor`

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Oqtane.Client/Index.razor` | 20–3138 | `"Settings"`, `"Form Builder"`, `"Form Dashboard"`, `"Design Template"`, `"Sign in required"`, `"Module Settings"`, `"Surface Role"`, `"Form / View"`, `"Fixed (inline)"`, `"Popup"`, `"Embed"`, `"Slide-in"`, `"Small (360px)"`, `"Medium (560px)"`, `"Large (820px)"`, `"Fullscreen"`, `"Time Delay"`, `"Scroll Percentage"`, `"Click Selector"`, `"Exit Intent"`, `"Saving…"`, `"Save Settings"`, `"My Records"`, `"Administrators only"`, `"Workflow Inbox"`, `"My Tasks"`, `"Role Queue"`, `"Task Detail"`, `"BPMN 2.0 Process Map"`, `"Previous"`, `"Next"`, `"Submit"`, `"Submitting..."`, `"Module settings saved."`, v.v. | Module shell & settings |
| `MegaForm.Oqtane.Client/DashboardView.razor` | 168–192 | `"Total Forms"`, `"Submissions"`, `"Current Form"`, `"Platform"`, `"Oqtane"`, `"New Form"`, `"Form Builder"`, `"Status"`, `"Online"` | Dashboard shell |
| `MegaForm.Oqtane.Client/Settings.razor` | 26–191 | `"Loading..."`, `"MegaForm Settings"`, `"Bound Form"`, `"— Select a form —"`, `"View Mode"`, `"Renderer Host URL"`, `"Popup Size"`, `"Delay (seconds)"`, `"Changes are saved..."`, `"Settings saved successfully..."` | Settings panel |
| `MegaForm.Oqtane.Client/SubmissionsView.razor` | 27, 57 | `"Loading submissions…"`, `"MegaForm.initSubmissions failed"` | Submissions host |
| `MegaForm.Oqtane.Client/SdkDemoView.razor` | 21–161 | `"MegaForm SDK — List View Demo"`, `"Loading via SDK…"`, `"Pick a form above..."`, `"No submissions."`, table headers `#`, `Submitted`, `Status`, `Files` | SDK demo |

#### Server `.cs`

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | 363–3180 | `"Request body is empty or not valid JSON"`, `"formId required"`, `"Form not found"`, `"locale required"`, `"Template file or JSON payload is required"`, `"PDF export is handled client-side."`, `"Export failed."`, `"No file provided"`, `"Authentication required for uploads"`, `"This file type is blocked by system policy"`, `"View"`, `"Open submission details"`, `"Claim"`, `"Approve"`, `"Reject"`, `"Forward"`, `"Edit"`, `"Delete"` | API validation/errors |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.GoogleSheets.cs` | 140 | `"Connection OK"` | GS test |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.Reports.cs` | 196–364 | `"Body required"`, `"name is required"`, `"definition is required"`, `"Reporting indexer not registered"`, `"Report not found"` | Reporting |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` | 128–727 | `"Invalid JSON body"`, `"Registered Users"`, `"All Users"`, `"Unauthenticated Users"`, `"Host Users"`, `"Super Users"`, `"Provisioning service unavailable"`, `"Unknown starter app."` | Workflow starter |
| `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs` | 88, 182, 190, 275, 287, 311, 323, 335 | `"Body required"`, `"Not found"`, `"slug is required"`, `"List View Designer"`, `"Card View Designer"` | AI KB |
| `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs` | 85–403 | `"table required"`, `"body required"`, `"sql required"`, `"formId required"`, `"Not found"` | AI tools |
| `MegaForm.Oqtane.Server/Controllers/UserTemplateController.cs` | 276–565 | `"name is required."`, `"file is required..."`, `"Resolved path escapes the widget folder sandbox."`, `"Content exceeds the ...-byte source-editor limit."` | User template admin |
| `MegaForm.Oqtane.Server/Services/OqtaneWorkflowIdentityProvisioningService.cs` | 44–412 | `"RoleName is required."`, `"UserIdentifier is required."`, `"Role '...' was not found."`, `"A valid Oqtane siteId is required."`, `"UserName or Email is required."` | Workflow identity |
| `MegaForm.Oqtane.Server/Data/EfWorkflowRepository.cs` | 41–64 | `"Form ... not found."`, `"No draft to apply for form ..."` | Repository errors |

#### Shared models

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs` | 22–229 | `Status = "Draft"`, `SubmitButtonText = "Submit"`, `Status = "New"`, `DisplayMode = "fixed"`, `TriggerType = "time_delay"`, `PopupSize = "medium"`, `ViewMode = "form"` | Default values |

---

### 5.5. MegaForm.Umbraco

**Đặc điểm:** Không có `ILocalizedTextService`, `@Umbraco.GetDictionaryValue`, `IStringLocalizer`, `/Lang/*.xml`. Backend C# trả lỗi tiếng Anh; JS bundles có i18n một phần nhưng nhiều chỗ hardcode.

#### C# Backend

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Umbraco/Composers/MegaFormComposer.cs` | 79 | `"Connection string 'umbracoDbDSN' was not found for MegaForm.Umbraco."` | Startup exception |
| `MegaForm.Umbraco/Controllers/MegaFormApiController.cs` | 73–197 | `"Form payload is required"`, `"Form not found"`, `"Submit"`, `"Payload is required"`, `"contentId is required"`, `"formId is required"` | API errors/defaults |
| `MegaForm.Umbraco/Data/EfRepositories.cs` | 67–68 | `" (Copy)"`, `"Draft"` | Duplicate form title/status |
| `MegaForm.Umbraco/Data/MegaFormDbContext.cs` | 24–55 | `HasDefaultValue("Draft")`, `HasDefaultValue("Submitted")`, `HasDefaultValue("submit")` | EF defaults |
| `MegaForm.Umbraco/Data/UmbracoWorkflowRepository.cs` | 41–220 | `"Form ... not found."`, `"No draft to apply for form ..."`, `"system"`, `"legacy-save"`, `"1.0.1-draft"`, `"1.0.0"` | Workflow repo |
| `MegaForm.Umbraco/Services/PlatformServices.cs` | 72, 156 | `"admin"`, `"noreply@example.com"` | Role/sender default |
| `MegaForm.Umbraco/Services/UmbracoConnectionRegistry.cs` | 34 | `"Umbraco connection string 'umbracoDbDSN' was not found."` | Startup exception |
| `MegaForm.Umbraco/Services/UmbracoModuleConfigService.cs` | 50 | `"submit"` | ViewType fallback |

#### JS Frontend (đại diện)

| File | Chuỗi hardcode | Ngữ cảnh |
|------|----------------|----------|
| `wwwroot/js/megaform-dashboard.js` | `"Embed & Share"`, `"Public form link ready"`, `"Script Tag"`, `"iFrame"`, `"Share"`, `"Copy"`, `"Open"`, `"Edit in builder"`, `"Delete form"`, confirm delete, bulk delete messages | Dashboard |
| `wwwroot/js/megaform-config.js` | confirm reset all forms, `"Reset All Forms"`, `"Form Designer"`, `"View Settings"`, `"Advanced"`, `"Please select a form first."` | Config panel |
| `wwwroot/js/megaform-renderer.js` | `alert('Draft saved! Resume later:...')`, `alert('Error saving draft')`, `"Complete submission"`, `"Preview mode — submission disabled"` | Renderer |
| `wwwroot/js/builder/megaform-builder-canvas.js` | `"Custom HTML Active — click Preview to see the design"`, `"Drop field"`, confirm delete field | Builder canvas |
| `wwwroot/js/builder/megaform-builder-dom.js` | `"Untitled Form"`, `"Form Title"`, `"Submit"`, width options, rule/date options | Builder DOM |
| `wwwroot/js/builder/megaform-builder-presets.js` | confirm replace fields | Presets |
| `wwwroot/js/builder/megaform-workflow-canvas.js` | confirm clear all nodes | Workflow |
| `wwwroot/js/megaform-presets.js` | `"Your Name"`, `"Email"`, `"Phone"`, `"Subject"`, `"Message"`, `"Send Message"` | Built-in presets |
| `wwwroot/js/megaform-submissions.js` | `"No submissions yet."`, `"All"`, `"Recent Submissions"` | Submissions |
| `wwwroot/js/plugins/widget-advanced-file.js` | `alert('Maximum ... files allowed')`, `alert('File type not allowed: ...')`, `alert('File too large: ...')` | File widget |

---

### 5.6. MegaForm.Core / Sdk

| File | Dòng (gần đúng) | Chuỗi hardcode | Ngữ cảnh |
|------|-----------------|----------------|----------|
| `MegaForm.Core/Workflow/*NodeExecutor.cs` | — | `"Invalid email config: ..."`, `"Email recipient is empty..."`, `"SendEmail '...': recipient is required."`, `"Webhook HTTP {0}: {1}"`, `"Google Sheets '...': SpreadsheetId is required."`, `"Database '...': TableName is required."`, `"Insert requires at least one FieldMapping."`, `"Approval '...': choose at least one candidate role or user."` | Workflow runtime validation |
| `MegaForm.Core/Services/WorkflowTransparencyService.cs` | 439, 514 | `"Step failed during execution."`, `"failed"` | Audit UI status |
| `MegaForm.Core/ViewModes/FormViewSelector.cs` | 98–140 | `"Invalid view payload."`, `"formId is required."`, `"View name is required."`, `"View key is required."`, `"View type is required."` | View validation |
| `MegaForm.Core/Utilities/MegaFormUtils.cs` | 551–570 | `"Schema must contain at least one field."`, `"Invalid field key: '{key}'..."`, `"Invalid JSON: {ex.Message}"` | Schema validation |
| `MegaForm.Core/Integrations/SaasAutomation/Providers/*.cs` | — | `"Zapier webhook failed: ..."`, `"Twilio send error."`, `"Slack API failed: ..."`, `"Form Submit Trigger"`, `"Send an SMS when a form is submitted."` | SaaS integrations |
| `MegaForm.Core/Integrations/Storage/Providers/*.cs` | — | `"Google Drive upload failed: ..."`, `"Google Calendar create event failed: ..."` | Storage/calendar |
| `MegaForm.Sdk/MegaFormClient.cs` | 49 | `"No portal context available. Pass a MegaFormScope, or register the SDK in a host that provides IPlatformContext."` | SDK exception |
| `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` | 295 | `Title = "MegaForm API"` | Swagger title |

---

## 6. Vấn đề kiến trúc nổi bật

### 6.1. Hai stack localization tách rời

- **Stack 1 — Chrome catalog tĩnh:** `t('builder.save')`, ~1.124 key, dùng cho admin/builder/renderer chrome. Quản lý bởi Language Manager.
- **Stack 2 — Per-form content translations:** `schema.translations[locale]`, dùng cho nhãn/trường/thông báo của từng form cụ thể.

Hai stack này không chia sẻ key, không có trải nghiệm chỉnh sửa thống nhất, dễ gây hiện tượng “một nửa được dịch”.

### 6.2. Server không chia sẻ catalog với frontend

- Frontend có catalog JSON ~1.124 key.
- Server chỉ có `DefaultLocalizationProvider` ~40 key en-US inline.
- Không có cơ chế load cùng catalog JSON ở server cho DNN/Oqtane/Umbraco.

### 6.3. Platform culture bridge không đều

| Nền tảng | Culture bridge | Tình trạng |
|----------|----------------|------------|
| Web | `?lang=` → `Accept-Language` → `defaultLanguage` | ✅ Tốt |
| Oqtane | `CultureInfo.CurrentUICulture.Name` → `data-mf-locale` | ⚠️ Chỉ cho frontend, server không localize |
| DNN | `Thread.CurrentThread.CurrentCulture.Name` load legacy locale script | ⚠️ Không có RESX, server fallback en-US |
| Umbraco | Không có | ❌ Không có bridge |

### 6.4. QA tooling chưa được thực thi

- `i18n-check.cjs`, `i18n-litlint.cjs` tồn tại.
- Chưa được tích hợp vào CI/build; không có gate chống hardcode mới.
- `i18n-litlint` báo cáo ~14.265 literal candidates (phần lớn false positive), cần lọc và baseline.

### 6.5. Native dialogs không thể localize đàng hoàng

`alert()`/`confirm()`/`prompt()` chỉ nhận plain string, do đó bắt buộc phải thay bằng custom modal nếu muốn hỗ trợ đa ngôn ngữ và RTL tử tế.

---

## 7. Khuyến nghị & lộ trình ưu tiên

### P0 — Khắc phục ngay (ảnh hưởng end-user & admin rõ ràng)

1. **Thay thế `alert/confirm/prompt` bằng custom modal** có thể render `t(key)`; thêm key tương ứng vào `en-US.json`.
2. **Localize server API error messages** cho Web, Oqtane, DNN, Umbraco: trả về `{ errorKey, fallbackMessage }` thay vì plain English.
3. **Localize default submit/success/validation messages** trong `FormSchema`, `MegaFormModels`, renderer fallback.
4. **Localize email templates mặc định** (`EmailNotificationService`, `EmailSummaryService`, `MarketingIntegrationService`).

### P1 — Hoàn thiện kiến trúc

5. **Đăng ký `ILocalizationProvider` thực thụ cho Oqtane, DNN, Umbraco**, load cùng catalog JSON mà frontend dùng.
6. **Bổ sung `.resx`/satellite assemblies** cho Oqtane & DNN nếu muốn tuân thủ native localization; hoặc thống nhất dùng JSON catalog cho cả server.
7. **Localize Razor/Blazor/.ascx shells**: `Index.razor`, `Settings.razor`, `DashboardView.razor`, DNN `.ascx` views, Web Razor views (`Setup`, `Admin/*`, `Form/View`).
8. **Localize workflow node UI schema** (`WorkflowNodeUiSchemaProvider`, `EmailWorkflowNodeUiService`, `WebhookWorkflowNodeUiService`, executor messages).

### P2 — Duy trì & nâng cao

9. **Gắn `i18n-check.cjs` + `i18n-litlint.cjs` vào CI/build** với baseline được duyệt; fail build khi phát hiện hardcode UI mới.
10. **Hoàn thiện các gói ngôn ngữ stub** (ja-JP, ko-KR, vi-VN, zh-CN, …) lên đủ ~1.124 key.
11. **Xây dựng allow-list/baseline cho `i18n-litlint`** để loại bỏ CSS class, API path, SQL, internal constants.
12. **Tài liệu hóa quy trình thêm key mới**: mọi label mới phải có key trong `en-US.json` trước khi merge.

### P3 — Chiến lược dài hạn

13. **Thống nhất hai stack localization**: xem xét gộp chrome catalog và per-form translations thành một catalog duy nhất hoặc một giao diện quản lý chung.
14. **Hỗ trợ localization cho AI system prompts / tool schemas** nếu cần admin dùng ngôn ngữ khác với LLM.
15. **Xem xét dùng `IStringLocalizer<T>` của ASP.NET Core** cho Web/Oqtane để tận dụng satellite assemblies và fallback chuẩn.

---

## 8. Phụ lục: Công cụ & tài liệu liên quan

### Files/code liên quan đã xác minh

| File | Vai trò |
|------|---------|
| `MegaForm.UI/public/i18n/en-US.json` | Catalog gốc, 1.124 keys |
| `MegaForm.UI/src/i18n/index.ts` | Frontend i18n engine |
| `MegaForm.UI/src/i18n/format.ts` | Format helpers |
| `MegaForm.UI/src/languages/index.ts` | Language Manager UI |
| `MegaForm.UI/tools/i18n-check.cjs` | Key parity / missing refs |
| `MegaForm.UI/tools/i18n-litlint.cjs` | Literal linter |
| `MegaForm.Core/i18n/MegaFormStrings.cs` | `ILocalizationProvider` abstraction + ~40 key fallback |
| `MegaForm.Core/i18n/JsonLocalizationProvider.cs` | JSON provider |
| `MegaForm.Web/Services/WebLocalizationProvider.cs` | Web host provider |
| `MegaForm.Web/Controllers/I18nController.cs` | i18n API |

### Tài liệu nội bộ đã có trong `Docs/`

- `I18N_FULL_HARDCODED_TEXT_AUDIT_REPORT.md`
- `I18N_LANGUAGE_EXPANSION_PLAN.md`
- `I18N_LANGUAGE_EXPANSION_STRATEGY_V2_20260611.md`
- `I18N_P3_SERVER_LOCALIZATION_SPEC.md`
- `I18N_V2_CRITIQUE_ADJUDICATION_20260611.md`
- `I18N_V2_CRITIQUE_AND_ENHANCEMENTS.md`
- `I18N_WORK_SPLIT.md`

### Thống kê nhanh

| Chỉ số | Giá trị |
|--------|---------|
| Số file `.resx` trong solution | 0 |
| Số key en-US catalog | ~1.124 |
| Số locale files shipped | 20 |
| Số lần gọi `alert/confirm/prompt` hardcode (frontend `src/`) | ~139+ |
| Số literal candidates theo `i18n-litlint` | ~14.265 (cần lọc false positive) |
| Nền tảng có server-side `ILocalizationProvider` thực | 1 / 4 (chỉ Web) |

---

*Kết thúc báo cáo. Không có thay đổi code nào được thực hiện.*
