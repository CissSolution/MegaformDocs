# BÁO CÁO RÀ SOÁT TOÀN DIỆN

## Composite Controls / Widgets: Lưu trữ, Xử lý & Prompt AI trong MegaForm

**Ngày lập báo cáo:** 2026-06-15  
**Phạm vi rà soát:** Toàn bộ solution MegaForm (DNN, Oqtane, ASP.NET Core, Web, Umbraco, MegaForm.UI, MegaForm.Core)  
**Mục tiêu:** Đánh giá cách composite controls/widgets được lưu trữ trong database/JSON, luồng xử lý runtime, mức độ tối ưu, và tính đầy đủ của prompt AI dùng để thêm/cấu hình widget.  
**Ràng buộc:** Báo cáo này chỉ phân tích và đề xuất — KHÔNG chứa code, KHÔNG thực hiện sửa đổi source.

---

## 1. Tóm tắt điều tra

MegaForm hiện có **hai khái niệm chồng chéo** trong cùng một hệ thống:

1. **Composite Controls** (`type: "Composite"`) — cơ chế mới, đang active phát triển, dùng để biểu diễn một trường nghiệp vụ phức hợp (ví dụ: Phone, Full Name, Address, SSN, DOB, Time, Email Confirm, Password Confirm) dưới dạng nhiều sub-input trên giao diện nhưng chỉ submit **một giá trị duy nhất**.
2. **Widgets** (DataRepeater, DataGrid, DynamicLabel, StripePayment, PdfForm, Razor, UserTemplate...) — các thành phần độc lập, thường có cấu hình `widgetProps` phức tạp, có thể truy vấn dữ liệu ngoài, render độc lập.

Cả hai loại đều được lưu trữ **toàn bộ bên trong cột JSON** của bảng `MF_Forms`. Không có bảng chuẩn hóa riêng cho field hay widget. Cách tiếp cận này đơn giản, linh hoạt, nhưng tạo ra nhiều điểm yếu về hiệu năng, truy vấn chéo form, và bảo mật validation.

Về AI: hệ thống AI assistant đã có kiến trúc tool-loop, KB-driven rules, staged operations, multi-provider khá hoàn chỉnh. Tuy nhiên, **prompt AI chưa đủ thông tin để tạo ra Composite Controls đúng chuẩn** và một số endpoint `AiTools` trên Oqtane/Web còn thiếu so với DNN.

---

## 2. Cơ chế lưu trữ Composite Controls / Widgets

### 2.1. Database Schema

Bảng trung tâm là `MF_Forms`. Các cột JSON quan trọng:

| Cột | Mục đích |
|-----|----------|
| `SchemaJson` | Toàn bộ định nghĩa form: fields, pages, composite parts, widget config, conditional logic, translations |
| `SettingsJson` | Cấu hình form-level: theme, submit button, success message, redirect, custom CSS/HTML |
| `ThemeJson` | Override theme |
| `RulesJson` | Luật legacy |
| `WorkflowJson` | Workflow mới (v2) |

**Điểm quan trọng:** Không tồn tại bảng `MF_FormFields` hay `MF_Widgets`. Tất cả field/widget/composite parts đều nằm gọn trong `SchemaJson`.

Các bảng liên quan:

- `MF_Submissions` — cột `DataJson` lưu toàn bộ dữ liệu submit dạng JSON.
- `MF_SubmissionValues` — lưu per-field snapshot để phục vụ tìm kiếm/báo cáo.
- `MF_WidgetData` — bảng dự kiến cho dữ liệu widget phức tạp, nhưng hiện ít được dùng cho Composite/DataRepeater mới; giá trị composite vẫn nằm trong `MF_Submissions.DataJson`.

### 2.2. Cấu trúc JSON của Composite Control

Composite mới sử dụng cấu trúc chuẩn:

```json
{
  "type": "Composite",
  "key": "phone",
  "label": "Phone",
  "widgetProps": {
    "preset": "phone",
    "nav": "roving",
    "orient": "horizontal",
    "parts": [
      { "key": "country", "type": "country", "width": "116px", "def": "+1" },
      { "key": "area", "width": "74px", "maxLength": 4 },
      { "key": "number", "flex": 1, "type": "tel" },
      { "key": "ext", "width": "74px" }
    ]
  }
}
```

Các preset được hỗ trợ: `phone`, `name`, `name_plus`, `address`, `ssn`, `dob`, `time`, `email_confirm`, `password_confirm`. Address có scheme (`us`, `intl`, `canada`, `uk`).

**Lưu ý:** `Composite` **không nằm trong enum `FieldType`** của C# (`MegaForm.Core/Models/FormSchema.cs`). Nó được nhận diện bởi chuỗi `"Composite"` ở tầng TypeScript runtime.

### 2.3. Các loại Widget khác

- **Legacy widgets:** `FullName`, `Address` — vẫn còn trong templates cũ nhưng khác với Composite mới.
- **Data widgets:** `DataRepeater`, `DataGrid`, `DynamicLabel`, `GridRepeater` — cấu hình SQL/template phức tạp trong `widgetProps`.
- **Payment widgets:** `StripePayment`, `PayPal`, `Square`.
- **Programmable widgets:** `Razor`, `UserTemplate`, `PdfForm`.

### 2.4. Serialization / Deserialization

- Lưu form: repository ghi trực tiếp chuỗi JSON vào cột `NVARCHAR(MAX)`.
- Đọc form: `RenderModelResolver.Resolve` parse `SchemaJson` + `SettingsJson` thành `JObject`, chuẩn hóa key (`camelCase` + `PascalCase`), sau đó deserialize thành `FormSchema`.
- Submission: `SubmissionProcessor` gọi lại `RenderModelResolver.Resolve` để có `FormSchema`, rồi validate và lưu.
- DataRepeater: `DataRepeaterService` parse `JObject` từ `SchemaJson` mỗi khi query để tìm widget config.

---

## 3. Luồng xử lý Runtime

### 3.1. Rendering

- **Shared TypeScript renderer** (`MegaForm.UI/src/renderer/inputs.ts`) là source of truth cho Composite.
- Khi gặp `type: "Composite"`, renderer tạo container `.mf-composite`, chia `.mf-composite-row/cell`, render từng `data-mf-part`, và một hidden input `name="{fieldKey}"` duy nhất.
- Các platform (Oqtane, DNN, ASP.NET Core, Web) đều dùng chung renderer client-side.
- **Server-side rendering (SSR):** `FormHtmlRenderer` trong C# **không có nhánh Composite**. Khi Oqtane bật `?mfssr=1`, Composite chỉ render ra placeholder hydration, sau đó client xóa và vẽ lại toàn bộ.
- Các widget thực thụ (`DataRepeater`, v.v.) thường render hoàn toàn client-side hoặc qua Razor runtime.

### 3.2. Validation

- **Client-side:** `validation.ts` có nhánh Composite riêng, validate từng part theo `required`, `minLength`, `maxLength`, `min/max`, `mask`, `pattern`, `matchKey`, `dateAge`.
- **Server-side:** `FormValidationService.Validate` flatten fields nhưng không mở rộng Composite. Composite rơi vào default case, chỉ kiểm tra `required`, `minLength`, `maxLength`, `pattern` trên **chuỗi giá trị đã kết hợp** do client gửi lên. Các rule per-part (mask, matchKey, dateAge, numeric bounds) **không được kiểm chứng server-side**.

### 3.3. Submission

- Client gom các part value thành một chuỗi (qua `COMPOSITE_PRESETS[preset].combine` hoặc join mặc định) và ghi vào hidden input.
- `collectFormData` đọc hidden input, POST JSON lên server.
- Server lưu nguyên chuỗi đã kết hợp vào `MF_Submissions.DataJson[fieldKey]` và tạo snapshot row trong `MF_SubmissionValues`.
- Không có bước normalize/validate per-part ở server.

### 3.4. Builder / Designer

- Builder palette có các tile `CompositePhone`, `CompositeName`, `CompositeAddress`... được map sang `type: "Composite"` + `widgetProps.preset`.
- `composite-designer.ts` cung cấp modal chỉnh sửa `parts[]` chi tiết.
- `field-plugins/_index.ts` cung cấp inline editor: chọn preset, scheme, mở composite designer.

---

## 4. Đánh giá tính tối ưu

### 4.1. Lưu trữ JSON Blob — chưa tối ưu cho truy vấn

Ưu điểm:
- Lưu/load nguyên form một cách nguyên tử.
- Dễ version, dễ copy form.
- Không cần migration khi thêm loại widget mới.

Nhược điểm:
- Không thể truy vấn DB "form nào dùng widget X?" hay "có bao nhiêu composite phone?" mà không parse toàn bộ row.
- `MF_Forms` có nhiều cột `NVARCHAR(MAX)`, khiến row rất lớn, ảnh hưởng list query.
- `MF_Submissions.DataJson` được tìm kiếm bằng `LIKE '%...%'` trong một số endpoint — không scalable.

### 4.2. Parsing JSON lặp đi lặp lại — chưa tối ưu

Các điểm nóng parse JSON đi parse lại mỗi request:

- `RenderModelResolver.Resolve` parse + mutate + reserialize schema.
- `SubmissionProcessor.ProcessAsync` gọi Resolve lại.
- `FormAssetManifestService.Build` deserialize lại để tính assets.
- `DataRepeaterService.ExtractWidgetConfig` parse `JObject` mỗi lần query.
- Client cũng parse nhiều lần ở `platform-host.ts`, renderer, builder.

Chưa có cache tập trung cho deserialized schema hay resolved render model.

### 4.3. N+1 Query Patterns

- DNN `ListAll` load stats từng form trong vòng lặp.
- Oqtane `ListForms` `SELECT *` bao gồm cả `SchemaJson`, `ThemeJson`, `RulesJson`, `WorkflowJson`.
- Submission list dùng `DataJson.Contains(search)` — full scan.

### 4.4. Thiếu Caching

Gần như không có caching cho:
- Form schema.
- Resolved render model.
- Asset manifest.
- Widget config.

Chỉ có một số cache nhỏ, cục bộ như Razor compilation, DB metadata, template catalog — không đủ cho hot path render/submit.

### 4.5. Network Payload lớn

- `FormDto` trả về cả `SchemaJson` và `ResolvedSchemaJson` (trùng lặp), cả `SettingsJson` và `ResolvedSettingsJson`.
- Admin list trả về full `SchemaJson` cho tất cả form.
- Public `Schema` endpoint trả về toàn bộ schema, kèm inline CSS.

### 4.6. Sự trùng lặp dữ liệu

- `SubmitButtonText`, `SuccessMessage`, `RedirectUrl` tồn tại đồng thời trong cột `MF_Forms`, `SettingsJson`, và root `SchemaJson` sau khi Resolve.
- `RenderModelResolver` tạo cả `camelCase` và `PascalCase` keys cho nhiều setting, làm tăng gấp đôi kích thước JSON.
- Composite presets được định nghĩa ở cả renderer (`helpers.ts`), builder plugin (`_index.ts`), và composite designer (`composite-designer.ts`) — dễ lệch version.
- `DataRepeaterWidgetConfig` lưu cả dạng flat (`Detail1Query`, `Filter1Label`...) và dạng structured (`DetailLevels[]`, `Filters[]`), rồi normalize qua lại.
- Submission được lưu cả trong `MF_Submissions.DataJson` và `MF_SubmissionValues`.
- `MF_WidgetData` tồn tại nhưng hầu như không dùng cho Composite/DataRepeater mới.

---

## 5. Prompt AI cho Widget / Composite — đã đầy đủ chưa?

### 5.1. Kiến trúc AI hiện tại

- **In-builder assistant:** `MegaForm.UI/src/ai-form-assistant/chat.ts` — system prompt động, tool loop, KB rules.
- **Dashboard AI creator:** `MegaForm.UI/src/dashboard/ai-form-creator.ts` — single-shot prompt tạo form mới hoặc multi-form app.
- **Tools:** 22 tool definitions trong `tools.ts`, dispatcher đến server `AiToolsController`.
- **KB seeds:** 27 prompt rules + 3 prompt recipe pointers + nhiều seed SQL cho widget patterns, SQL samples, Razor recipes.

### 5.2. Widget Catalog

`widget-catalog.gen.ts` có 45 entries, bao gồm cả `Composite`, `CompositePhone`, `CompositeName`, `CompositeAddress`... Tuy nhiên, catalog chỉ là metadata cơ bản (type, label, category, kind), không mô tả chi tiết cấu trúc `widgetProps` hay `parts` của từng composite preset.

### 5.3. Op Vocabulary

`ops.ts` định nghĩa các operation AI có thể trả về: `add_field`, `replace_form_schema`, `set_field_property`, `set_field_sql`, `app_batch`, `create_form`, v.v. `add_field` chấp nhận `widgetProps` dạng `Dictionary<string,object>` — tức là AI **có thể** gửi widget config, nhưng không có schema chi tiết buộc AI phải điền đúng.

### 5.4. Đánh giá độ đầy đủ

**Đã tốt:**
- Có system prompt rõ ràng, yêu cầu output JSON operations.
- Có tool `list_widgets`, `get_widget` để AI tra cứu.
- Có KB rules bảo vệ custom HTML/CSS/theme.
- Có hard-block rules (PRESERVE-*, CONVERT-*, THEME-001, IMG-001).
- Dashboard prompt liệt kê danh sách field type, layout rules, theme allowlist.

**Còn thiếu / chưa đủ:**
1. **Không có hướng dẫn cụ thể cho AI cách tạo Composite Control đúng chuẩn.** Prompt không giải thích `widgetProps.preset`, `widgetProps.parts`, `nav`, `orient`, các part type, address scheme.
2. **Không có normalization alias.** Dashboard prompt cho phép `CompositePhone`, `CompositeName`... nhưng `ops.ts` không map các alias này về canonical `type: "Composite"`. Nếu AI trả về đúng alias, form có thể render sai hoặc không hoạt động.
3. **Thiếu few-shot examples cho Composite trong prompt.** AI sẽ phải "đoán" cấu trúc `parts[]`.
4. **Prompt recipe files được trỏ trong KB nhưng không tồn tại trên disk.** `convert-premium-form.md`, `build-razor-master-detail.md`, `build-dynamic-label-tabs.md` thiếu file thực tế.
5. **Endpoint parity Oqtane/Web thấp.** DNN có nhiều endpoint AI hơn Oqtane/Web (`Forms`, `Designers`, `Cascade`, `GetPromptRecipe`, `AppEndpoint`, `ExportApp`, `ImportApp`, `StarterKits`). Các tính năng AI introspect form hoặc cài starter kit không hoạt động trên Oqtane/Web.
6. **DNN SQL introspection hardcoded MSSQL** trong khi hệ thống hỗ trợ SQLite/Postgres/MySQL.
7. **Không có prompt rule cho việc tự động cấu hình widget phức tạp** như DataRepeater, DataGrid, DynamicLabel. Có KB seeds nhưng chưa được tích hợp chặt chẽ vào system prompt.
8. **Multi-form app orchestration chưa đầy đủ:** `app_batch` tạo tables/forms nhưng chưa có hướng dẫn cho navigation, parent-child links, app-level menu.

---

## 6. Các vấn đề nghiêm trọng cụ thể

| STT | Vấn đề | Mức độ | Ghi chú |
|-----|--------|--------|---------|
| 1 | Server không validate/normalize per-part của Composite | Cao | Client có thể bị bypass, dữ liệu không đồng nhất |
| 2 | Composite không có native SSR | Cao | Oqtane SSR bị "chớp", first paint kém, phụ thuộc JS |
| 3 | Prompt AI thiếu hướng dẫn tạo Composite đúng chuẩn | Cao | AI có thể sinh schema sai, composite không render |
| 4 | Alias CompositePhone/CompositeName... không được normalize | Cao | Dashboard AI path dễ tạo form hỏng |
| 5 | Thiếu cache schema/render model | Cao | Mỗi request parse JSON lại, tốn CPU/alloc |
| 6 | Admin list trả về full JSON blob | Trung bình | Payload lớn, chậm dashboard |
| 7 | N+1 stats queries trong DNN ListAll | Trung bình | Chậm khi nhiều form |
| 8 | `DataJson.Contains` search submissions | Trung bình | Full scan NVARCHAR(MAX) |
| 9 | Trùng lặp `ResolvedSchemaJson`/`SchemaJson` trong DTO | Trung bình | Lãng phí băng thông |
| 10 | `MF_WidgetData` không được dùng như thiết kế | Thấp | Dead/Legacy code |
| 11 | Composite presets định nghĩa ở 3 nơi | Thấp | Rủi ro lệch version |
| 12 | Prompt recipe files thiếu | Thấp | `GetPromptRecipe` trả về lỗi |

---

## 7. Khuyến nghị ưu tiên (KHÔNG CODE)

### P0 — Cần làm ngay

1. **Bổ sung prompt rule và few-shot examples cho Composite Controls trong AI system prompt**, bao gồm:
   - Cấu trúc canonical `type: "Composite"` + `widgetProps.preset`.
   - Danh sách preset, ý nghĩa, khi nào dùng.
   - Mô tả `parts[]`, các thuộc tính part (`type`, `width`, `flex`, `maxLength`, `options`, `row`, v.v.).
   - `nav` (`roving`/`tab`) và `orient` (`horizontal`/`vertical`/`both`).
   - Address scheme (`us`, `intl`, `canada`, `uk`).
2. **Normalize alias field types** (`CompositePhone`, `CompositeName`...) về `type: "Composite"` + `widgetProps.preset` ngay trong op dispatcher, tránh AI lưu sai type.
3. **Thêm server-side composite validation/normalization** trong submission pipeline, mirror client-side rules.
4. **Thêm cache resolved render model & deserialized schema** server-side, invalid khi save form.

### P1 — Làm sớm

5. Cung cấp lightweight list DTO không chứa `SchemaJson`/`ThemeJson`/`RulesJson`/`WorkflowJson` cho admin list.
6. Loại bỏ trường trùng lặp `ResolvedSchemaJson`/`ResolvedSettingsJson` trong `FormDto` nếu không thực sự cần.
7. Batch stats computation trong DNN `ListAll`.
8. Thay `DataJson.Contains` search bằng `MF_SubmissionValues` index.
9. Bổ sung `[ResponseCache]` hoặc output cache cho public `Schema` endpoint.
10. Hoàn thiện Oqtane/Web `AiTools` endpoint parity với DNN.

### P2 — Làm kế tiếp

11. Thêm bảng/materialized index `MF_FormFieldIndex` để truy vấn nhanh field/widget/composite usage.
12. Thêm computed persisted columns trên `MF_Forms` cho các marker JSON phổ biến.
13. Thêm native SSR branch cho Composite trong `FormHtmlRenderer`.
14. Tạo/cập nhật prompt recipe files (`convert-premium-form.md`, `build-razor-master-detail.md`, `build-dynamic-label-tabs.md`).
15. Refactor DNN SQL introspection dùng shared `SqlSchemaReader` thay vì hardcoded MSSQL.

### P3 — Cân nhắc

16. Hỗ trợ distributed cache (Redis) cho multi-server farms.
17. Đánh giá lại việc tách `MF_Forms.SchemaJson` thành normalized `MF_Fields` nếu số lượng form/complexity tăng mạnh.

---

## 8. Kết luận

MegaForm đã có một nền tảng Composite Control và AI widget assistant khá vững ở tầng UI/builder, nhưng còn khoảng cách quan trọng ở ba lĩnh vực:

- **Tính nhất quán:** Composite chưa được xử lý đồng đều giữa client/server, chưa có SSR, và AI chưa được hướng dẫn đủ để sinh đúng.
- **Hiệu năng:** Thiếu caching, parse JSON lặp, payload lớn, N+1 queries, và thiếu index DB cho JSON blobs.
- **Khả năng mở rộng AI:** Cần hoàn thiện prompt rules, normalize alias, tạo recipe files, và cân bằng endpoint parity giữa các platform.

Nếu chỉ sửa 3–4 điểm P0, chất lượng AI-generated forms và độ ổn định của Composite Controls sẽ tăng đáng kể mà không cần thay đổi kiến trúc lớn.

---

## 9. Phụ lục — Các file/tài liệu tham khảo chính

- `MegaForm.Core/Models/FormSchema.cs`
- `MegaForm.Core/Rendering/RenderModelResolver.cs`
- `MegaForm.Core/Services/SubmissionProcessor.cs`
- `MegaForm.Core/Services/FormValidationService.cs`
- `MegaForm.Core/Services/FormHtmlRenderer.cs`
- `MegaForm.Core/Services/DataRepeaterService.cs`
- `MegaForm.Core/Utilities/MegaFormUtils.cs`
- `MegaForm.Core/Seed/ai-knowledge-prompt-rules.sql`
- `MegaForm.Core/Seed/ai-knowledge-prompt-recipes.sql`
- `MegaForm.DNN/Data/FormRepository.cs`
- `MegaForm.DNN/Install/SqlScripts/01_CreateTables.sql`
- `MegaForm.DNN/WebApi/MegaFormApiController.cs`
- `MegaForm.DNN/WebApi/AiToolsController.cs`
- `MegaForm.Oqtane.Server/Migrations/EntityBuilders/FormEntityBuilder.cs`
- `MegaForm.Oqtane.Server/Data/EfRepositories.cs`
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`
- `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`
- `MegaForm.Oqtane.Client/Index.razor`
- `MegaForm.Oqtane.Shared/Models/MegaFormModels.cs`
- `MegaForm.Web/Controllers/MegaFormController.cs`
- `MegaForm.Web/Controllers/AiToolsController.cs`
- `MegaForm.UI/src/renderer/inputs.ts`
- `MegaForm.UI/src/renderer/interactive.ts`
- `MegaForm.UI/src/renderer/helpers.ts`
- `MegaForm.UI/src/renderer/composite-address.ts`
- `MegaForm.UI/src/renderer/validation.ts`
- `MegaForm.UI/src/builder/core.ts`
- `MegaForm.UI/src/builder/composite-designer.ts`
- `MegaForm.UI/src/builder/field-plugins/_index.ts`
- `MegaForm.UI/src/ai-form-assistant/chat.ts`
- `MegaForm.UI/src/ai-form-assistant/tools.ts`
- `MegaForm.UI/src/ai-form-assistant/ops.ts`
- `MegaForm.UI/src/ai-form-assistant/widget-catalog.gen.ts`
- `MegaForm.UI/src/dashboard/ai-form-creator.ts`
- `Docs/HANDOFF_20260615_COMPOSITE_CONTROLS_GD1_GD4_ROADMAP.md`
- `Docs/HANDOFF_20260614_AI_DB_COMPOSITE_PLAN.md`
- `Docs/HANDOFF_20260615_COMPOSITE_ADMIN_DESIGNER.md`
- `Docs/AI_FORM_DESIGN_ARCHITECTURE.md`
- `Docs/WIDGET-DEVELOPMENT-SPEC.md`

---

*Kết thúc báo cáo.*
