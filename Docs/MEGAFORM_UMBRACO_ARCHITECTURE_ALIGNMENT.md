# Báo cáo: MegaForm đáp ứng kiến trúc Umbraco như thế nào?

> Khảo sát dựa trên codebase `MegaForm.Umbraco` / `MegaForm.Umbraco.Host` (Umbraco 14, .NET 8).

---

## 1. Kiến trúc linh hoạt — Hybrid CMS (Traditional + Headless)

Umbraco 14 có thể chạy như CMS truyền thống hoặc Headless CMS qua Delivery API. MegaForm tận dụng cả hai mô hình:

### Traditional rendering
- Razor view `Views/MegaFormView.cshtml` + partial `Views/Partials/MegaForm/MegaForm.cshtml` render form trực tiếp trong trang Umbraco.
- HTML helper extension `MegaFormAsync()` cho phép gọi một dòng trong template:
  ```razor
  @await Html.MegaFormAsync(Model.Id)
  ```
- Renderer tải schema từ endpoint `/umbraco/MegaForm/MegaFormApi/Schema?formId=...` và khởi tạo widget bằng TS bundle `megaform-renderer.js`.

### Headless / API-ready
- `MegaFormApiController` cung cấp REST API đầy đủ:
  - `GET /umbraco/MegaForm/MegaFormApi/Schema` — schema form công khai.
  - `POST /umbraco/MegaForm/MegaFormApi/Submit` / `Submit/Post` — nhận submission.
  - `GET /umbraco/MegaForm/MegaFormApi/Form/List`, `Form/Get`, `Submissions/List` — quản lý.
- Host Umbraco đã bật `AddDeliveryApi()` trong `Program.cs`, sẵn sàng phục vụ nội dung cho frontend React/Angular/Vue.
- MegaForm cũng ship SDK (`MegaForm.Sdk`) với `IMegaFormClient`, cho phép bất kỳ ứng dụng .NET nào gọi API mà không cần biết Umbraco.

**Kết luận:** MegaForm không bắt buộc Razor view — có thể render inline trong Umbraco hoặc cung cấp form schema qua API cho headless consumer.

---

## 2. Hỗ trợ đa nền tảng — .NET Core / Linux / macOS / Docker

### Target framework
- `MegaForm.Umbraco.csproj` target `net8.0`.
- `MegaForm.Umbraco.Host.csproj` là `Microsoft.NET.Sdk.Web`, target `net8.0`.

### Database provider abstraction
- `MegaFormComposer` đọc connection string `umbracoDbDSN` và provider name, tự động chọn:
  - `Microsoft.EntityFrameworkCore.Sqlite` cho local/dev.
  - `Microsoft.EntityFrameworkCore.SqlServer` cho production.
- `UmbracoDatabaseSchemaBootstrapper` hỗ trợ cả SQLite và SQL Server; tự tạo bảng MegaForm (`MF_*`) nếu chưa tồn tại.
- `ResolveDataDirectoryToken` xử lý token `|DataDirectory|` trên mọi OS.

### Docker-ready potential
- Không có Dockerfile riêng trong host hiện tại, nhưng vì là ASP.NET Core 8 app chuẩn với SQLite/SQL Server, việc container hóa chỉ cần `dotnet publish` + base image `mcr.microsoft.com/dotnet/aspnet:8.0`.
- Không có dependency Windows-only (không dùng Registry, COM, IIS-specific API).

**Kết luận:** MegaForm chạy trên bất kỳ nền tảng nào .NET 8 hỗ trợ; SQLite làm local dev rất nhẹ, SQL Server cho production.

---

## 3. Khả năng mở rộng không giới hạn — "Hộp cát trống" cho .NET developers

### Composer pattern chuẩn Umbraco
- `MegaFormComposer : IComposer` đăng ký toàn bộ service vào DI container của Umbraco.
- Package manifest `wwwroot/umbraco-package.json` đăng ký section `MegaForm.Section` + 4 section views (Dashboard, Builder, Submissions, Languages) vào backoffice Bellissima.
- `MegaFormSectionAutoGrantHandler` tự động cấp quyền section cho nhóm `admin`.

### Widget / plugin extensibility
- Hệ thống plugin widget đăng ký qua `window.MegaFormWidgets.register(name, widget)`.
- Các widget sẵn có: calculator, payment, signature, rating, grid repeater, advanced file, rich text, video embed, v.v.
- Stub plugin được bổ sung cho Umbraco để tránh 404 khi builder load: dynamic-label, razor, data-repeater, golf-scorecard, map, razor-studio.

### Workflow node extensibility
- 15+ workflow node executors đã đăng ký:
  - FormField, Condition, Webhook, Email, End, Calculate, SetVariable, Approval, Database, GoogleSheets, Switch, Loop, AddRole, AddUser, AddUserToRole.
- Mỗi node là một `INodeExecutor` implementation; developer có thể thêm node mới bằng cách implement interface và đăng ký trong composer.

### Integration providers
- Marketing: Mailchimp, ConvertKit, Brevo, Klaviyo.
- SaaS Automation: Slack, Twilio, Zapier.
- Payments: Stripe.
- Storage: Google Drive, Google Calendar.
- Spam: reCAPTCHA v2/v3, hCaptcha, Turnstile.
- Conversion: conversational form, abandonment, lead form, user journey, landing page.
- Quiz & templates.

### Data & service extensibility
- `MegaFormDbContext` partial class dễ mở rộng thêm entity.
- Repository abstraction (`IFormRepository`, `ISubmissionRepository`, etc.) cho phép thay thế EF bằng provider khác.
- `IConnectionRegistry`, `IPlatformContext`, `ILocalizationProvider`, `IStorageService` là các seam rõ ràng để override behavior.

**Kết luận:** MegaForm không phải "black box" — nó được thiết kế như một nền tảng mở trên Umbraco, phù hợp với triết lý "hộp cát trống" của Umbraco cho .NET developers.

---

## 4. Hệ sinh thái Microsoft

### SQL Server
- `MegaFormComposer.ConfigureDatabaseProvider` tự động dùng `UseSqlServer` khi provider name chứa "sqlclient" hoặc không phải SQLite.
- `UmbracoConnectionRegistry` tạo `Microsoft.Data.SqlClient.SqlConnection`, tự động bật `Encrypt`, `TrustServerCertificate`, `MultipleActiveResultSets`.

### ASP.NET Core Identity / Umbraco member
- Workflow identity provisioning (`UmbracoWorkflowIdentityProvisioningService`) lưu users/roles trong bảng `MF_WebUsers` / `MF_WebRoles`.
- Auth sử dụng `Constants.Security.BackOfficeAuthenticationType` của Umbraco cho admin controller.
- Anonymous API cho public submit và schema.

### Azure-ready
- Mặc dù chưa có code Azure-specific (Blob, Key Vault, App Insights) trong `MegaForm.Umbraco`, kiến trúc .NET 8 + SQL Server + SQLite hoàn toàn tương thích Azure App Service / Azure SQL.
- Có thể triển khai lên Azure bằng cách đổi connection string sang Azure SQL và dùng Azure Files/App Service persistent storage cho SQLite (hoặc chuyển SQL Server).

**Kết luận:** MegaForm kế thừa toàn bộ stack Microsoft (ASP.NET Core, EF Core, SQL Server, Umbraco Identity) và sẵn sàng triển khai trên Azure.

---

## 5. Điểm mạnh & điểm cần lưu ý

### Điểm mạnh
| Đặc điểm Umbraco | MegaForm đáp ứng |
|---|---|
| Hybrid CMS | Razor view + public REST API + SDK |
| Cross-platform | .NET 8, SQLite/SQL Server, không dependency Windows-only |
| Extensibility | Composer, custom widgets, custom workflow nodes, integration providers |
| Microsoft ecosystem | EF Core, SQL Server, ASP.NET Core Identity |
| Bellissima backoffice | Package manifest, section, section views |

### Điểm cần lưu ý / cơ hội hoàn thiện
1. **Headless integration chặt chẽ hơn:** Hiện tại MegaForm cung cấp API riêng. Có thể tích hợp sâu hơn với Umbraco Delivery API để form schema xuất hiện như một content type hoặc custom delivery endpoint.
2. **Azure PaaS specifics:** Chưa có sample Dockerfile, Azure Key Vault, Blob Storage integration. Có thể bổ sung `MegaForm.Umbraco.Azure` package nếu cần.
3. **Linux path handling:** Code đã dùng `Path.DirectorySeparatorChar` và `Path.Combine`, nhưng cần test trên Linux/macOS để đảm bảo casing và path separator.
4. **UserTemplate/Subform advanced widgets:** Đang là stub trên Umbraco; cần port đầy đủ từ Oqtane/DNN nếu muốn feature parity 100%.

---

## 6. Tóm tắt

MegaForm for Umbraco là một package .NET 8 đúng chuẩn Umbraco 14: dùng `IComposer`, package manifest, Razor views, và ASP.NET Core API. Nó phù hợp với cả mô hình **Traditional CMS** (render form trong Razor template) lẫn **Headless CMS** (consumer lấy schema qua API). Với target `net8.0` và provider SQLite/SQL Server, nó chạy được trên Windows, Linux, macOS và dễ dàng container hóa. Kiến trúc mở qua composer DI, widget registry, workflow node executors và integration providers phù hợp với triết lý extensibility của Umbraco. Cuối cùng, vì xây dựng trên ASP.NET Core Identity và EF Core SQL Server, MegaForm sẵn sàng tích hợp với hệ sinh thái Microsoft / Azure.
