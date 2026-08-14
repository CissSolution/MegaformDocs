# MegaForm Platform Audit — Umbraco vs Oqtane vs DNN

> Ngày audit: 2026-07-11  
> NgườI thực hiện: Kimi Code CLI  
> Phạm vi: `MegaForm.Umbraco`, `MegaForm.Oqtane.*`, `MegaForm.DNN`  
> Mục tiêu: đánh giá feature parity của Umbraco so với Oqtane và DNN, xác định khoảng trống và ưu tiên bàn giao.

---

## 1. Tóm tắt điều kiện so sánh

| Tiêu chí | DNN | Oqtane | Umbraco |
|---|---|---|---|
| Kiến trúc host | DNN Module (WebForms/ASCX + WebAPI) | Oqtane Module (Blazor Server + ASP.NET Core API) | Umbraco 14+ Package (RCL + MVC/API + Backoffice section) |
| Target framework | .NET Framework (legacy) | .NET 8 | .NET 8 |
| Shared Core | `MegaForm.Core` | `MegaForm.Core` | `MegaForm.Core` |
| Shared UI TS/Vite | Có (builder, dashboard, submissions, workflow, AI) | Có | Có |
| Đường dẫn public API | `/DesktopModules/MegaForm/API/` | `/api/MegaForm/` | `/umbraco/MegaForm/MegaFormApi/` (rewrite từ `/api/MegaForm/`) |
| Static assets | `/DesktopModules/MegaForm/Assets/` | `/Modules/MegaForm/` | `/App_Plugins/MegaForm/` |
| Trạng thái runtime (theo phiên hiện tại) | Không chạy trong phiên này | Không chạy trong phiên này | Host chạy, public render/embed/submit OK, backoffice dashboard OK, builder load OK, một số API trong iframe đang 401 |

> **Lưu ý quan trọng:** Đánh giá dưới đây dựa trên mã nguồn và kiểm thử runtime trên Umbraco trong phiên 2026-07-11. DNN/Oqtane không được chạy runtime trong phiên này nhưng được review qua mã nguồn.

---

## 2. Bảng so sánh chi tiết theo tính năng

### 2.1 Public rendering & embed

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Public form view | ✅ `FormView.ascx` | ✅ `Index.razor` | ✅ `/megaform/form/{id}` + view component | Umbraco dùng SSR skeleton tương tự Oqtane/DNN |
| Schema endpoint | ✅ | ✅ | ✅ `/umbraco/MegaForm/MegaFormApi/schema` |  |
| Submit endpoint | ✅ | ✅ | ✅ `/umbraco/MegaForm/MegaFormApi/Submit` | CORS cross-origin tested OK |
| File upload public | ✅ | ✅ | ✅ |  |
| Script embed | ✅ | ✅ | ✅ `/megaform/form/{id}/script` | Tự động load renderer, cross-origin tested OK |
| Iframe embed | ✅ | ✅ | ✅ `/megaform/form/{id}/embed` |  |
| Embed preview page | ✅ DNN path | ✅ Oqtane path | ✅ Đã cập nhật cho Umbraco path | File `MegaForm.Umbraco/wwwroot/embed-preview.html` |
| CORS | ✅ `MegaFormCorsHandler` | ✅ | ✅ `MegaFormCorsStartupFilter` |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** | Script embed + submit cross-origin đã chạy thành công |

### 2.2 Backoffice / admin UI

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Dashboard | ✅ `ManageModule.ascx` / `FormList` | ✅ `Dashboard.razor` shell | ✅ `/umbraco/MegaForm/Admin` | Load OK sau khi sửa auth scheme |
| Builder host | ✅ `FormEdit.ascx` | ✅ `Builder.razor` | ✅ `/umbraco/MegaForm/Builder/{id}` | Load OK, một số API 401 khi gọi trong iframe |
| Submissions host | ✅ `Submissions.ascx` | ✅ `SubmissionsView.razor` | ✅ `/umbraco/MegaForm/Submissions` | Chưa runtime test |
| Languages host | ✅ (qua i18n assets) | ✅ `Languages.razor` | ✅ `/umbraco/MegaForm/Languages` | Chưa runtime test |
| Custom backoffice section | N/A | N/A | ✅ `MegaForm.Section` | Có tab MegaForm trong Umbraco backoffice |
| Content App | N/A | N/A | ✅ `MegaForm.ContentApp.Submissions` | Hiển thị trên document workspace |
| Property editor | N/A | N/A | ✅ `megaForm` picker | Cho phép chọn form trong content node |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** | Dashboard load OK, builder load OK, cần sửa auth cho API trong iframe |

### 2.3 Form builder

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Shared TS builder | ✅ | ✅ | ✅ | Dùng chung `megaform-builder.js` |
| Form CRUD | ✅ | ✅ | ✅ |  |
| Duplicate / lock | ✅ | ✅ | ✅ |  |
| Builder templates | ✅ | ✅ | ✅ |  |
| Fields / field options | ✅ | ✅ | ✅ |  |
| Design blocks | ✅ `DesignerController` | ✅ | ✅ |  |
| Theme / style / settings | ✅ | ✅ | ✅ |  |
| Module config / view configs | ✅ | ✅ | ✅ |  |
| App definitions | ✅ | ✅ | ✅ |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** | Mã nguồn tương đương, cần runtime test save/publish sau khi sửa API auth |

### 2.4 Submissions

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| List submissions | ✅ | ✅ | ✅ |  |
| Get/update status | ✅ | ✅ | ✅ |  |
| Bulk delete | ✅ | ✅ | ⚠️ Chưa rõ | Cần verify |
| Export (JSON/CSV) | ✅ | ✅ | ⚠️ Chưa rõ | Cần verify |
| Delete submission | ✅ | ✅ | ✅ |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Trung bình–Cao ⚠️** | Cần runtime test submissions view |

### 2.5 Workflow

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Workflow builder (ReactFlow/BPMN) | ✅ | ✅ | ✅ | Có link BPMN 2.0 Workflow trong builder |
| Save/validate/apply/test workflow | ✅ | ✅ | ✅ |  |
| Workflow runtime inbox | ✅ | ✅ | ✅ |  |
| Claim/approve/reject/forward/comment | ✅ | ✅ | ✅ |  |
| Workflow library (reusable templates) | ❌ **Không có** | ✅ | ✅ | DNN thiếu tính năng này |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** | Đã có migration + repository + controller |

### 2.6 AI features

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| AI Assistant / Designer | ✅ | ✅ | ✅ |  |
| AI Knowledge Base CRUD | ✅ | ✅ | ✅ |  |
| AI KB Rules/Templates/Feedback | ✅ | ✅ | ✅ |  |
| AI Tools (SQL, widgets, catalog, LocalAI) | ✅ | ✅ | ✅ |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** | Mã nguồn đầy đủ, chưa runtime test |

### 2.7 Upload / SDK

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| File upload | ✅ | ✅ | ✅ |  |
| Image upload / list | ✅ | ✅ | ✅ |  |
| PDF template upload | ✅ | ✅ | ✅ |  |
| SDK demo download | ✅ | ✅ | ✅ |  |
| SDK registration in DI | ✅ | ✅ | ✅ | `services.AddMegaFormSdk()` |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** |  |

### 2.8 Reports / analytics

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Report CRUD | ✅ `ReportApiController` | ✅ | ✅ `ReportsController` |  |
| Submission data / forms overview | ✅ | ✅ | ✅ |  |
| Analytics charts | ✅ | ✅ | ✅ |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** |  |

### 2.9 Multi-language / i18n

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| i18n JSON assets | ✅ | ✅ | ✅ |  |
| List/Get locale endpoints | ✅ | ✅ | ✅ |  |
| Upsert/Export locale | ⚠️ hạn chế | ✅ | ✅ |  |
| Languages admin UI | ✅ | ✅ | ✅ |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** |  |

### 2.10 User portal / permissions

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Permissions catalog | ✅ | ✅ | ✅ |  |
| Save permissions | ✅ | ✅ | ✅ |  |
| Workflow principal resolver | ✅ | ✅ | ✅ |  |
| Identity provisioning service | N/A | ✅ | ✅ |  |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** |  |

### 2.11 CMS integration đặc thù

| Tính năng | DNN | Oqtane | Umbraco | Ghi chú |
|---|---|---|---|---|
| Module settings / per-instance config | ✅ ASCX | ✅ Blazor popup | ✅ Property editor + API |  |
| Content App | N/A | N/A | ✅ | Đặc thù Umbraco |
| Property editor / data type | N/A | N/A | ✅ `megaForm` | Đặc thù Umbraco |
| Tag helper / view component | N/A | N/A | ✅ `RenderMegaForm` | Đặc thù Umbraco |
| Custom tree / section | N/A | N/A | ✅ `MegaForm.Section` | Đặc thù Umbraco |
| **Mức độ hoàn thiện Umbraco** |  |  | **Cao ✅** | Tích hợp native Umbraco tốt |

---

## 3. Đánh giá tổng quan Umbraco

### 3.1 Điểm mạnh

- **Tích hợp native Umbraco tốt nhất:** content app, property editor, tag helper, custom section — đều có.
- **Feature parity gần như đầy đủ** so với Oqtane/DNN, thậm chí vượt DNN ở workflow library.
- **Public embed/script/CORS hoạt động** qua runtime test cross-origin.
- **Backoffice dashboard load thành công** sau khi sửa auth scheme.
- **Migrations ổn định** đến `megaform-schema-workflow-library`.

### 3.2 Điểm yếu / rủi ro

- **API auth trong iframe:** các API dùng `[Authorize(Policy = AuthorizationPolicies.BackOfficeAccess)]` yêu cầu Bearer token, nhưng shared TS UI chạy trong iframe chỉ gửi cookie → 401. Cần sửa policy hoặc auth scheme cho backoffice API.
- **Runtime test chưa đầy đủ:** builder save/publish, submissions view, AI KB CRUD, workflow builder runtime chưa được kiểm thử end-to-end.
- **Embed preview page shared (`Assets/embed-preview.html`)** vẫn dùng DNN path; bản Umbraco đã cập nhật trong `MegaForm.Umbraco/wwwroot` nhưng cần đảm bảo build script không ghi đè.
- **Obsolete warnings** nhiều (Umbraco 14 APIs) nhưng chưa ảnh hưởng build.
- **NuGet global cache hỏng** đang dùng workaround local-packages.

### 3.3 Đánh giá mức độ hoàn thiện

| Khu vực | Mức độ | Lý do |
|---|---|---|
| Public render/embed/submit | **Hoàn thiện cao** | Đã kiểm thử runtime cross-origin |
| Backoffice dashboard | **Hoàn thiện cao** | Load OK sau fix auth |
| Form builder | **Hoàn thiện cao** | Load OK, cần sửa API auth để save/publish |
| Submissions | **Trung bình–cao** | Chưa runtime test submissions view |
| Workflow builder + library | **Hoàn thiện cao** | Mã nguồn đầy đủ, chưa runtime test UI |
| AI features | **Hoàn thiện cao** | Mã nguồn đầy đủ, chưa runtime test |
| Reports | **Hoàn thiện cao** | Mã nguồn đầy đủ |
| CMS integration | **Hoàn thiện cao** | Content app, property editor, section đều có |

---

## 4. Gap analysis

| # | Gap | Ảnh hưởng | Khuyến nghị |
|---|---|---|---|
| 1 | API auth 401 trong iframe builder | Builder không thể load form data / save form | **Cao** — sửa policy auth cho backoffice API để chấp nhận cookie scheme |
| 2 | Runtime test chưa đầy đủ | Không xác nhận save/publish/submit từ builder, AI KB CRUD, workflow runtime | **Cao** — kiểm thử end-to-end sau khi sửa auth |
| 3 | DNN thiếu Workflow Library | Feature parity không đồng đều | **Trung bình** — cân nhắc port workflow library sang DNN nếu cần |
| 4 | Embed preview shared asset dùng DNN path | Nếu sync từ `Assets` sẽ hỏng Umbraco | **Thấp–Trung bình** — đảm bảo build script không ghi đè bản Umbraco |
| 5 | Obsolete warnings | Technical debt, rủi ro upgrade Umbraco 15 | **Thấp** — refactor dần |
| 6 | NuGet global cache hỏng | Trải nghiệm dev/local build kém | **Trung bình** — sửa cache hoặc chuyển hoàn toàn sang local-packages |

---

## 5. Khuyến nghị ưu tiên

### Ưu tiên 1 — Sửa auth cho backoffice API
- Tạo policy `MegaFormBackOffice` kết hợp cookie + Bearer, hoặc dùng `[Authorize(AuthenticationSchemes = Constants.Security.BackOfficeAuthenticationType)]` cho các API được gọi từ iframe.
- Đảm bảo builder load form data, save, publish hoạt động.

### Ưu tiên 2 — Kiểm thử runtime end-to-end
- Builder: mở form, sửa, save draft, publish.
- Submissions: view list, update status, export.
- Workflow: tạo workflow library template, gán vào form, chạy runtime inbox.
- AI KB: CRUD knowledge item, rules, templates.

### Ưu tiên 3 — Ổn định hóa môi trường build
- Sửa NuGet global cache hoặc chuyển hoàn toàn sang local-packages workflow.
- Giảm obsolete warnings.

### Ưu tiên 4 — Tài liệu và bàn giao
- Cập nhật `AGENTS.md` sau khi các ưu tiên 1–2 hoàn thành.
- Viết runbook kiểm thử cho Umbraco host.

---

## 6. Kết luận

**Umbraco hiện đạt feature parity rất cao so với Oqtane và vượt DNN ở workflow library.** Các tính năng core (public render, embed, submit, CORS, backoffice section, content app, property editor, form builder, workflow, AI, reports, permissions) đều đã được implement. Rào cản lớn nhất còn lại là **auth policy cho API trong iframe builder** — khi sửa xong, Umbraco sẽ có thể coi là sẵn sàng cho bàn giao runtime nội bộ và kiểm thử end-to-end.

DNN vẫn là nền tảng ổn định nhưng thiếu workflow library. Oqtane là reference implementation tốt nhất vì có đầy đủ tính năng và cùng target .NET 8 với Umbraco. Umbraco cần thêm một vòng kiểm thử runtime sau khi sửa auth để xác nhận parity hoàn toàn với Oqtane.
