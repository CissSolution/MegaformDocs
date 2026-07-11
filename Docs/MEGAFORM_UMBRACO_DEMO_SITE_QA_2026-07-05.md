# MegaForm Umbraco — Demo Corporate Site & AI QA

> Ngày: 2026-07-05
> Host: `MegaForm.Umbraco.Host` tại `http://localhost:5003`
> DB: SQLite `MegaForm.Umbraco.Host/umbraco/Data/Umbraco.sqlite.db`

---

## 1. Demo site Corporate/News

### 1.1 Cấu trúc tạo ra
- `MegaForm.Umbraco.Host/Controllers/DemoController.cs` — các trang demo + endpoint seed.
- `MegaForm.Umbraco.Host/Views/_DemoLayout.cshtml` — layout chung kiểu corporate.
- `MegaForm.Umbraco.Host/Views/Demo/Index.cshtml` — trang chủ.
- `MegaForm.Umbraco.Host/Views/Demo/News.cshtml` — trang tin tức.
- `MegaForm.Umbraco.Host/Views/Demo/Services.cshtml` — trang dịch vụ.
- `MegaForm.Umbraco.Host/Views/Demo/Contact.cshtml` — trang liên hệ.
- Copy `MegaForm.Umbraco/Views/MegaFormView.cshtml` sang host để partial hoạt động.

### 1.2 Forms nhúng
| Trang | FormId | Mục đích |
|---|---|---|
| `/demo/Index` | 2 | Newsletter subscribe |
| `/demo/Index` | 3 | Request a quote |
| `/demo/News` | 2 | Newsletter sidebar |
| `/demo/News` | 4 | Event/webinar registration |
| `/demo/Services` | 3 | Request a quote |
| `/demo/Services` | 4 | Event registration |
| `/demo/Contact` | 1 | Contact Us |

### 1.3 Seed forms mẫu
Forms được seed trực tiếp vào SQLite với `INSERT OR IGNORE`:
- **FormId=1** — Contact Us (đã có sẵn)
- **FormId=2** — Newsletter Subscribe (email)
- **FormId=3** — Request a Quote (name, email, company, budget select, message)
- **FormId=4** — Event Registration (name, email, ticket select, dietary)

### 1.4 Kết quả QA render + submit

#### `/demo/Index`
- ✅ Renderer hiển thị form Quote (5 fields + select) và Newsletter (email).
- ✅ Submit Quote thành công: **Reference #3**.
- ✅ Submit Newsletter thành công: **Reference #4**.

#### `/demo/News`
- ✅ Renderer hiển thị Newsletter sidebar và Event Registration.
- ✅ Submit Event Registration thành công: **Reference #5** (ticket = `vip`).

#### `/demo/Services` & `/demo/Contact`
- ✅ HTML trả về đúng title, chứa `megaform-root` để mount form.
- ✅ Contact page sử dụng FormId=1.

### 1.5 Submissions trong DB
```text
SubmissionId  FormId  SubmittedOnUtc
5             4       2026-07-05 05:31:20  (Event Registration)
4             2       2026-07-05 05:30:23  (Newsletter)
3             3       2026-07-05 05:29:24  (Quote)
2             2       2026-07-05 05:28:47  (Newsletter)
1             1       2026-07-05 04:56:34  (Contact Us)
```

---

## 2. AI Form Assistant trên Umbraco

### 2.1 Controllers mới
- `MegaForm.Umbraco.Host/Controllers/AiAssistantController.cs`
  - `GET /api/AiAssistant/DefaultConfig` — trả về local AI config.
- `MegaForm.Umbraco.Host/Controllers/MegaFormAiController.cs`
  - `GET /api/MegaFormAi/ping`
  - `POST /api/MegaFormAi/chat/completions` — OpenAI-compatible, tìm kiếm Knowledge Base.

### 2.2 Kết quả test
- ✅ `/api/AiAssistant/DefaultConfig`
  ```json
  { "provider": "megaform-local", "baseUrl": "/api/MegaFormAi", "model": "megaform-local-kb", "apiKey": "", "enabled": true }
  ```
- ✅ `/api/MegaFormAi/ping` → `{ "pong": true }`
- ✅ `/api/MegaFormAi/chat/completions` với prompt `"how do I add a dropdown field"` trả về kết quả từ KB gồm Email Field, Select Field, Text Field.

### 2.3 Knowledge Base seed
Đã thêm 4 entries vào `MF_AI_Knowledge`:
1. Text Field
2. Email Field
3. Select Field
4. Workflows

---

## 3. Các URL demo

| URL | Mô tả |
|---|---|
| `http://localhost:5003/demo/Index` | Trang chủ corporate |
| `http://localhost:5003/demo/News` | Tin tức + newsletter + event registration |
| `http://localhost:5003/demo/Services` | Dịch vụ + quote + event |
| `http://localhost:5003/demo/Contact` | Liên hệ (FormId=1) |
| `http://localhost:5003/demo/Seed` | Seed/re-seed demo forms (GET JSON) |

---

## 4. Lưu ý & hạn chế

- Các trang demo là **MVC controllers** trong host, không phải Umbraco content nodes thật. Đủ để QA MegaForm renderer nhúng trong layout phức tạp.
- AI controller hiện chỉ dùng **local Knowledge Base** (không gọi OpenAI/Kimi). Để dùng provider bên ngoài, cần bổ sung config key và proxy.
- Demo form seed dùng raw SQL vì `SaveForm` repository bỏ qua khi `FormId > 0` và entity chưa tồn tại.
- Build có nhiều warning cũ (nullable, obsolete `UmbracoApiController`, NuGet vulnerabilities) nhưng **0 errors**.
