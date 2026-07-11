# Báo cáo rà soát đa ngôn ngữ MegaForm — 2026-06-22

> **Phạm vi:** Toàn bộ solution MegaForm (UI/TS, Core, Web, DNN, Oqtane, Umbraco, Sdk).  
> **Mục tiêu:** Rà soát một vòng toàn bộ source, các gói i18n, xác định các chuỗi hardcode chưa localize đa ngôn ngữ. **Không sửa code.**  
> **Ngày thực hiện:** 2026-06-22.  
> **Trạng thái:** Báo cáo thuần túy — dữ liệu lấy từ codebase thực tế + chạy lại các công cụ i18n hiện có.

---

## 1. Tóm tắt cấp cao

So với baseline gần nhất (2026-06-19, sau Phase 0 / B199):

| Chỉ số | 2026-06-19 | 2026-06-22 | Thay đổi |
|---|---|---|---|
| `en-US.json` keys | 1.189 | **1.189** | — |
| Locale maintained full | 11 | **11** | — |
| Locale stub | 6 | **6** | — |
| Gate `i18n-check.cjs` | PASS | **FAIL** | ⚠️ Drift mới |
| Referenced-but-missing | 0 (có fallback) | **12** | ⚠️ Code mới `subs.*` chưa có catalog key |
| Native dialogs (`alert/confirm/prompt`) | 139 | **139** | — |
| Fallback EN trong `t(...)` | ~163 | **551 occurrences** | Cần lọc lại do pattern bắt rộng hơn |
| Literal candidates (`i18n-litlint`) | 15.130 | **15.457** | Tăng 327 |
| Server `.L(...)` usages | 7 | **7** | Rất ít |
| Server hardcode ước tính | ~1.500 | **~1.500** | — |

**Điểm nổi bật:**
1. **Drift vừa tái xuất hiện:** 12 key mới trong `submissions/SubmissionsShell.ts` (chức năng "Send to Inbox") được reference qua `t()` nhưng **chưa có trong `en-US.json`** → gate đỏ.
2. **Server-side localization vẫn gần như bằng 0:** chỉ `MegaForm.Core/Services/SubmissionProcessor.cs` dùng `.L(...)`. Các controller/services khác vẫn trả về English literal.
3. **Native dialogs vẫn 139 lỗi gọi** — chưa có custom modal wrapper.
4. **Platform copies** gần như đồng bộ 1.189 key, trừ một số thư mục cũ/dist.

---

## 2. Trạng thái catalog & công cụ

### 2.1. Canonical catalog `MegaForm.UI/public/i18n/`

| Locale | Keys | Trạng thái |
|---|---|---|
| `en-US` | 1.189 | Canonical |
| `de-DE` | 1.189 | ✅ Full |
| `pt-BR` | 1.189 | ✅ Full |
| `it-IT` | 1.189 | ✅ Full |
| `nl-NL` | 1.189 | ✅ Full |
| `pl-PL` | 1.189 | ✅ Full |
| `ru-RU` | 1.189 | ✅ Full |
| `tr-TR` | 1.189 | ✅ Full |
| `th-TH` | 1.189 | ✅ Full |
| `id-ID` | 1.189 | ✅ Full |
| `hi-IN` | 1.189 | ✅ Full |
| `ar-SA` | 1.193 | ✅ Full (+4 plural extra) |
| `es-ES` | 107 | ⚠️ Stub |
| `fr-FR` | 64 | ⚠️ Stub |
| `ja-JP` | 107 | ⚠️ Stub |
| `ko-KR` | 107 | ⚠️ Stub |
| `vi-VN` | 103 | ⚠️ Stub |
| `zh-CN` | 98 | ⚠️ Stub |

### 2.2. Gate `i18n-check.cjs` — hiện FAIL

```
[i18n:check] base en-US = 1189 keys
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

**Nhận xét:** Đây là feature "Send submission to inbox" mới thêm. Các fallback tiếng Anh inline đã có sẵn trong `tools/missing-ref-keys.json`:

```json
{
  "dash.cancel": "Cancel",
  "subs.assign_to": "Assign to user",
  "subs.choose_user": "— choose —",
  "subs.loading_users": "Loading users…",
  "subs.no_dir_users": "(no directory users — type a username)",
  "subs.note_optional": "Note (optional)",
  "subs.or_username": "or type a username",
  "subs.pick_user": "Pick a user or type a username.",
  "subs.send": "Send",
  "subs.send_to_inbox": "Send to Inbox",
  "subs.sending": "Sending…",
  "subs.sent_to_inbox": "Sent {n} to {u}’s inbox."
}
```

Cần bổ sung 12 key này vào `en-US.json` và dịch sang 11 locale maintained để gate xanh lại.

### 2.3. `i18n-refdiff.cjs` — 21 key referenced, 21 missing

Ngoài 12 key có fallback EN ở trên, còn 9 key **rỗng/dynamic** cần review:

| Key | File gọi | Ghi chú |
|---|---|---|
| `builder.tab_` | `builder/dom.ts` | Dynamic suffix |
| `builder.tabtitle_` | `builder/dom.ts` | Dynamic suffix |
| `dash.role_` | `dashboard/index.ts` | Dynamic suffix |
| `inbox.priority_` | `my-inbox/view.ts` | Dynamic suffix |
| `inbox.reply_` | `my-inbox/view.ts` | Dynamic suffix |
| `inbox.status_` | `my-inbox/view.ts` | Dynamic suffix |
| `inbox.view_` | `my-inbox/view.ts` | Dynamic suffix |
| `subs.col_` | `submissions/SubmissionsShell.ts` | Dynamic suffix |
| `subs.range_` | `submissions/SubmissionsShell.ts` | Dynamic suffix |

Khuyến nghị: đưa các key suffix này vào allow-list của `i18n-refdiff` hoặc refactor thành key tĩnh rõ ràng.

### 2.4. `i18n-litlint.cjs` — 15.457 literal candidates

Top file có nhiều candidate nhất:

| File | Candidates |
|---|---|
| `builder/presets.ts` | 1.074 |
| `presets/index.ts` | 819 |
| `builder/workflow-canvas.ts` | 788 |
| `dashboard/index.ts` | 771 |
| `builder/workflow/index.ts` | 634 |
| `builder/templates.ts` | 586 |
| `view-designer/settings-popup.ts` | 399 |
| `builder/properties.ts` | 344 |
| `builder/theme-tab-adapter.ts` | 317 |
| `builder/workflow/wf-app.ts` | 270 |
| `ai-form-assistant/ops.ts` | 265 |
| `view-designer/datarepeater/editor.ts` | 264 |

> Số candidate chỉ là **tiềm năng**; cần xây allow-list để loại false-positive (tên class CSS, key object, token kỹ thuật, v.v.).

---

## 3. Rà soát frontend (`MegaForm.UI/src/`)

### 3.1. Native dialogs — 139 lỗi gọi (không localize được)

`alert/confirm/prompt` plain string vẫn còn **139** lần gọi trong **57 file**.  
Các file nóng:

| File | Số lỗi gọi | Ví dụ đại diện |
|---|---|---|
| `dashboard/index.ts` | 10 | Confirm xóa/demo lock |
| `listview/runtime.ts` | 13 | Confirm xóa submission |
| `config/ConfigPanel.ts` | 6 | Confirm discard changes |
| `ai-knowledge/index.ts` | 3 | Confirm unsaved changes |
| `dashboard/ai-form-creator.ts` | 3 | Confirm clear/regenerate |
| `widgets/pdf-form-builder/index.ts` | 8 | Confirm delete field/page |
| `builder/canvas.ts` | 4 | Confirm convert Row→FlexGrid |
| `submissions/SubmissionsShell.ts` | 2 | Confirm delete submission/bulk |
| `languages/index.ts` | 1 | `window.prompt` chọn ngôn ngữ dịch AI |

**Ví dụ cụ thể:**
- `submissions/SubmissionsShell.ts:1004` — `confirm('Delete this submission? This cannot be undone.')`
- `submissions/SubmissionsShell.ts:1104` — `confirm(\`Delete ${count} submissions? This cannot be undone.\`)`
- `builder/canvas.ts` — `confirm('Convert this Row to a FlexGrid?')`
- `languages/index.ts:1037` — `window.prompt('Dịch sang ngôn ngữ nào? / Translate into which language?...')` *(còn cả tiếng Việt)*

### 3.2. Fallback tiếng Anh trong `t(...)` — 551 occurrences

Mặc dù một phần là fallback hợp lý (giữ UI không bể khi thiếu key), nhưng đây vẫn là **hardcode ẩn**.  
Top file:

| File | Số fallback | Ví dụ |
|---|---|---|
| `builder/templates.ts` | 52 | `T('builder.save','Save')` |
| `builder/dom.ts` | 70 | `T('builder.mode_build','Build')` |
| `builder/toolbar.ts` | 11 | `T('builder.preview','Preview')` |
| `dashboard/index.ts` | 70 | `T('dash.settings_title','Settings')` |
| `languages/index.ts` | 34 | `T('dash.lang.translate','Translate')` |
| `widgets/plugins/megaform-widget-payment-unified.ts` | 23 | Payment labels |
| `my-inbox/index.ts` | 13 | Inbox statuses |
| `submissions/SubmissionsShell.ts` | 12 | Vừa thêm Send to Inbox |

### 3.3. Ví dụ hardcode điển hình (file:dòng)

| # | File:Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|---|
| 1 | `builder/dom.ts:475` | `<span class="w-back-lbl">Dashboard</span>` | `builder.nav.dashboard` |
| 2 | `builder/dom.ts:810` | `<span class="mf-preview-toolbar-title">Live Preview</span>` | `builder.preview.live_preview` |
| 3 | `builder/dom.ts:731` | `<h2>Create a New Form</h2>` | `builder.modal.new_form_title` |
| 4 | `dashboard/index.ts:667` | `modal('Google Sheets', ...)` | `dash.modal.google_sheets_title` |
| 5 | `dashboard/index.ts:661` | `testBtn.textContent = 'Test connection'` | `dash.btn.test_connection` |
| 6 | `dashboard/index.ts:589` | `btn.title = 'Settings editing is disabled on demo site'` | `dash.demo.settings_disabled` |
| 7 | `submissions/SubmissionsShell.ts:1791` | `t('subs.send_to_inbox','Send to Inbox')` | Thêm `subs.send_to_inbox` vào catalog |
| 8 | `renderer/interactive.ts:528` | `date.toLocaleDateString('en-US', ...)` | Dùng locale động / `i18n/format.ts` |
| 9 | `builder/composite-designer.ts` | `January`..`December` | `date.months_long` |
| 10 | `ai-form-assistant/ops.ts` | `'Hoàn tất — nhớ bấm Save để lưu form.'` | `ai.ops.saved_reminder` *(dấu vết tiếng Việt)* |

### 3.4. Hardcode kỹ thuật đặc biệt

| Loại | Số lượng | Ví dụ | Khuyến nghị |
|---|---|---|---|
| `currency: 'USD'` | 8 | `builder/presets.ts`, `presets/index.ts`, `widgets/plugins/megaform-widget-payment-unified.ts`, `templating/lookup.ts` | Lấy từ form settings/locale |
| `toLocaleDateString('en-US')` | 1 | `renderer/interactive.ts:528` | Dùng current locale |
| Tháng/ngày tiếng Anh | 14+ | `Jan-Dec`, `Monday-Sunday` | Dùng `Intl.DateTimeFormat` |
| CSS `content:"..."` | 5 | `megaform-builder-ts.css:2145` "Theme: " | Chuyển vào HTML/JS |

---

## 4. Rà soát server-side (C#)

### 4.1. Tổng quan

- Chỉ có **7 lời gọi `.L(...)`** trong toàn solution — tất cả nằm trong `MegaForm.Core/Services/SubmissionProcessor.cs`.
- `MegaForm.Core/i18n/MegaFormStrings.cs` có **51 key** fallback EN inline.
- Chỉ `MegaForm.Web/Program.cs` register `ILocalizationProvider` (`WebLocalizationProvider`).
- **DNN, Oqtane.Server, Umbraco KHÔNG register** → dùng `DefaultLocalizationProvider` (EN).

### 4.2. Số lượng hardcode ước tính

| Nhóm | Số lượng | Ghi chú |
|---|---|---|
| `Error/Message/Success/Result = "English..."` | **177** | Chủ yếu controllers + services |
| `throw new ...Exception("English...")` | **138** | Workflow, identity, validation |
| Workflow node UI schema | **44+** | Titles, descriptions, labels |
| Models default strings | ~16 | `Submit`, `Draft`, `Submission received` |
| Views (.ascx/.cshtml/.razor) | ~351 | ASCX ~109, CSHTML ~193, Razor ~45 |
| SDK / AspNetCore.Component | ~12 | Exception messages, Swagger title |
| **Tổng ước tính** | **~1.500** | — |

### 4.3. Ví dụ đại diện

#### Controllers — DNN `MegaFormApiController.cs`

| Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|
| 595 | `error = "formId required"` | `api.error.form_id_required` |
| 881 | `error = "formId and data are required."` | `api.error.form_id_and_data_required` |
| 1186 | `error = "formId and fieldKey required"` | `api.error.form_id_and_field_key_required` |
| 1703 | `error = "formId is required."` | `api.error.form_id_required` |
| 4581 | `error = "starterKey is required."` | `api.error.starter_key_required` |

#### Controllers — Oqtane `MegaFormController.cs`

| Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|
| 2403 | `Message = "Invalid workflow JSON: " + ex.Message` | `workflow.error.invalid_workflow_json` |
| 2443 | `Message = "Invalid workflow JSON: " + ex.Message` | `workflow.error.invalid_workflow_json` |
| 2465 | `Message = "Invalid workflow JSON: " + ex.Message` | `workflow.error.invalid_workflow_json` |

#### Services — `WorkflowTaskService.cs`

| Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|
| 203 | `throw new InvalidOperationException("Task is not open.")` | `workflow.task.not_open` |
| 206 | `throw new InvalidOperationException("You do not have permission to claim this task.")` | `workflow.task.claim_permission_denied` |
| 209 | `throw new InvalidOperationException("Task is already claimed by another user.")` | `workflow.task.already_claimed` |
| 355 | `throw new InvalidOperationException("A comment is required when rejecting this task.")` | `workflow.task.reject_comment_required` |

#### Workflow UI Schema — `WorkflowNodeUiSchemaProvider.cs`

| Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|
| 42 | `Title = "Send Email"` | `workflow.node.send_email.title` |
| 43 | `Description = "Compose an email using form-field tokens..."` | `workflow.node.send_email.description` |
| 97 | `Title = "Webhook"` | `workflow.node.webhook.title` |
| 177 | `Title = "Google Sheets"` | `workflow.node.google_sheets.title` |
| 205 | `Title = "Switch"` | `workflow.node.switch.title` |
| 230 | `Title = "Loop"` | `workflow.node.loop.title` |
| 257 | `Title = "Database"` | `workflow.node.database.title` |

#### Models — `FormSchema.cs` / `MegaFormModels.cs`

| Nguồn | Chuỗi hardcode | Đề xuất key |
|---|---|---|
| `FormSchema.cs` | `SubmitButtonText = "Submit"` | `form.submit_button` |
| `FormSchema.cs` | `ReviewTitle = "Review your answers"` | `form.review_title` |
| `FormSchema.cs` | `SuccessMessage = "Thank you!..."` | `form.success_message` |
| `MegaFormModels.cs` | `Status = "Draft"` | `form.status.draft` |

> **Lưu ý:** Các giá trị mặc định này nên lưu key trung tính trong DB và dịch ở tầng hiển thị, không lưu chuỗi đã dịch.

---

## 5. Rà soát Views (Razor / ASCX / CSHTML)

### 5.1. Oqtane `.razor` — `Index.razor` nhiều hardcode nhất

| Dòng | Chuỗi hardcode | Đề xuất key |
|---|---|---|
| 86 | `<label>Module Role</label>` | `oqtane.settings.module_role` |
| 89-93 | `Dashboard`, `My Inbox`, `Submissions`, `Portal`, `Form Builder` | `dash.role.*` |
| 123 | `<label>Bound Form</label>` | `oqtane.settings.bound_form` |
| 149 | `<label>Display Mode</label>` | `oqtane.settings.display_mode` |
| 553/577 | `<h2>Administrators only</h2>` | `common.admins_only` |
| 649 | `<h4>Current App</h4>` | `oqtane.current_app` |
| 772-773 | `Use the Module Settings... Form Builder` | `oqtane.help.choose_form` |
| 820 | `MegaForm Workflow Inbox` | `workflow.inbox.title` |
| 956/968/980 | `Role assignments`, `User assignments`, `Runtime statuses` | `workflow.*` |
| 1016/1018 | `How To Change It`, `Open Builder` | `oqtane.help.*` |
| 2134 | `<button ...>Open form</button>` | `form.open_form` |

> `Index.razor:677` còn **dòng tiếng Việt** mã hóa lỗi: `"Host khÃ´ng náº±m trong dropdown..."` — cần xóa hoặc localize.

### 5.2. DNN `.ascx` — `FormList.ascx`, `FormEditOld.ascx`

`FormEditOld.ascx` là legacy builder UI với hàng trăm label cứng: palette items (`Short Text`, `Long Text`, `Email`, `Dropdown`, ...), property labels (`Field Key`, `Label`, `Placeholder`, `Help Text`, ...), tab labels (`Field`, `Settings`), buttons (`Save Draft`, `Publish`, `Cancel`).

`FormList.ascx`:
- `Manage and track all your forms`
- `Total Forms`, `Published`, `Drafts`, `Total Submissions`
- `All Status`, `Published`, `Draft`
- `No forms yet`, `Create your first form to get started`
- `Edit`, `View Data`

### 5.3. MegaForm.Web `.cshtml` — Admin views

`Views/Admin/Tasks.cshtml`, `RecordDetail.cshtml`, `ViewLogs.cshtml` chứa toàn bộ nhãn cứng:
- `Workflow Inbox`, `Dashboard`, `Documents`, `Submissions`, `Builder`
- `Task`, `Record`, `Due`, `State`, `Actions`
- `Claim`, `Approve`, `Reject`, `Forward`
- `Open Detail`, `Public URL`
- `Overview`, `Processing Timeline`, `Human Tasks`, `Form Data`
- `Current Node`, `Over SLA`, `Started`, `Completed`, `Assigned`, `Round`, `Candidates`

`Views/Admin/ViewLogs.cshtml`:
- `View Logs`, `Category`, `Log name`, `Search`, `Take`, `Apply`, `Clear matching logs`

### 5.4. Umbraco `.cshtml`

Không tìm thấy label cứng đáng kể trong views, nhưng các file `wwwroot/js/*.js` là bundle copy → chứa hardcode từ TS.

---

## 6. Bản copy locale ra các platform

### 6.1. Đồng bộ 1.189 key ✅

- `Assets/js/i18n/en-US.json`
- `Assets/js/builder/i18n/en-US.json`
- `Assets/js/bundles/i18n/en-US.json`
- `Assets/js/plugins/i18n/en-US.json`
- `DesktopModules/MegaForm/Assets/js/plugins/i18n/en-US.json`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/builder/i18n/en-US.json`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/bundles/i18n/en-US.json`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/plugins/i18n/en-US.json`
- `MegaForm.Web/wwwroot/megaform/i18n/en-US.json`
- `MegaForm.Web/wwwroot/megaform/js/plugins/i18n/en-US.json`

### 6.2. Còn lệch / cũ ⚠️

| Đường dẫn | Keys | Ghi chú |
|---|---|---|
| `dist/pack/_tmp_web/staticwebassets/megaform/i18n/en-US.json` | 295 | Cũ (Apr-2026), cần xóa/làm mới |
| `dist/pack/_tmp_web/staticwebassets/megaform/js/plugins/i18n/en-US.json` | 950 | Cũ, subset |
| `tmp-qa/pkg-inspect/Resources/Assets/js/...` | 1.189 | Có thể là extract package QA, không cần sửa |

### 6.3. DNN legacy 6-locale

`DesktopModules/MegaForm/Assets/js/builder/i18n/` và `bundles/i18n/` vẫn chỉ có 6 locale cũ (`es/fr/ja/ko/vi/zh`) — cần sync đầy đủ 18 locale nếu DNN còn active.

---

## 7. Các vấn đề kiến trúc còn tồn đọng

1. **Gate đang đỏ do drift mới:** cần vá 12 key `subs.*` + 9 dynamic key ngay để duy trì xanh.
2. **Server không chia sẻ catalog với frontend:** frontend có ~1.189 key JSON; server chỉ có 51 key inline.
3. **3/4 platform không có localization provider:** DNN/Oqtane/Umbraco đều dùng EN fallback.
4. **Native dialogs chưa thay thế:** 139 lỗi gọi `alert/confirm/prompt` plain string.
5. **Fallback EN trong `t(...)` là hardcode ẩn:** 551 occurrences cần dần externalize.
6. **Currency/date/number chưa locale-aware:** USD, `en-US` date format, tháng tiếng Anh.
7. **CSS `content` text:** 5+ chỗ không localize qua JSON được.
8. **Dấu vết tiếng Việt:** `ai-form-assistant/ops.ts`, `view-designer/layout/inspector.ts`, `view-designer/layout/tray.ts`, `Index.razor:677`.

---

## 8. Khuyến nghị ưu tiên

### P0 — Làm ngay (giữ gate xanh)

1. **Thêm 12 key `subs.*` vào `en-US.json`** (lấy từ `tools/missing-ref-keys.json`).
2. **Dịch 12 key × 11 locale maintained** = 132 chuỗi.
3. **Sync canonical ra các platform** bằng `tools/i18n-sync-platforms.cjs`.
4. **Xử lý 9 dynamic key** trong `i18n-refdiff` (allow-list hoặc refactor).

### P1 — Localize lõi

5. **Triển khai `IMegaFormLocalizer` cho Oqtane/DNN/Umbraco** theo `I18N_P3_SERVER_LOCALIZATION_SPEC.md`.
6. **Externalize ~30-50 chuỗi server respondent-facing** trước (validation, submit error, post-submit).
7. **Thay 139 native dialogs** bằng custom modal/toast render `t(key)`.
8. **Bổ sung culture bridge:** `__MF_PLATFORM__.culture` cho Oqtane/DNN, `data-mf-locale` trên root renderer.

### P2 — Hoàn thiện

9. **Localize controllers C#** (~177 message/error + ~138 exceptions).
10. **Localize workflow node UI schema** (`WorkflowNodeUiSchemaProvider`, `EmailWorkflowNodeUiService`, ...).
11. **Localize Razor/ASCX/CSHTML shells** (Dashboard, Builder settings, Tasks, RecordDetail, ViewLogs).
12. **Xử lý currency/date/number** — locale-aware.
13. **Xây allow-list cho `i18n-litlint`** và gắn CI.
14. **Xử lý 6 stub locale** (`es/fr/ja/ko/vi/zh`) — dịch đầy đủ hoặc đánh dấu beta.
15. **Dọn dẹp dấu vết tiếng Việt** và CSS `content` text.

---

## 9. Thống kê nhanh

| Chỉ số | Giá trị (2026-06-22) |
|---|---|
| Số key `en-US.json` | 1.189 |
| Locale full (≥1.189 key) | 11 + ar-SA (1.193) |
| Locale stub (<110 key) | 6 |
| Gate `i18n-check` | ❌ FAIL (12 missing) |
| Key referenced-but-missing | 21 (12 có fallback EN) |
| `alert/confirm/prompt` hardcode | 139 |
| Fallback EN trong `t(...)` | 551 occurrences |
| Literal candidates | 15.457 |
| Server `.L(...)` usages | 7 / ~1.500 hardcode |
| Platform register `ILocalizationProvider` | 1 / 4 (chỉ Web) |
| `.resx` files | 0 |

---

## 10. Kết luận

MegaForm đã có nền tảng i18n vững (canonical 1.189 key, 11 locale maintained, gate tooling sẵn), nhưng **drift vừa tái xuất hiện** do code mới `submissions/SubmissionsShell.ts` thêm feature "Send to Inbox" mà chưa bổ sung catalog key. Đây là minh chứng rõ ràng tại sao gate CI phải luôn bật.

Ngoài drift, **server-side localization và native dialogs** vẫn là hai điểm yếu lớn nhất. Các controller C# trả về English literal trực tiếp, trong khi frontend đã có catalog đa ngôn ngữ sẵn sàng. Cần ưu tiên:

1. **Vá 12 key missing để gate xanh** (công sức ~30 phút).
2. **Triển khai server localizer** và bắt đầu externalize respondent-facing strings.
3. **Thay thế native dialogs** bằng modal/toast có thể render `t(key)`.

*Báo cáo này chỉ ghi nhận — không có thay đổi code nào được thực hiện.*
