# Báo cáo QA — AI Assistant "Create form with AI" bị thoát/crash

**Ngày:** 2026-06-15  
**Tester:** Kimi Code CLI (Playwright)  
**Môi trường:** http://localhost:5000/test-template-page/v0-celebration-rsvp-simple?mfpanel=dashboard  
**Tài khoản:** host / Minh@2002 (đã đăng nhập với role Administrator)  
**Feature:** Dashboard → "Create with AI" (AI Form Assistant)

---

## 1. Tóm tắt

Hai prompt được test:

| Prompt | Kết quả |
|--------|---------|
| **P1:** "tao 1 app nhap lieu DB quan he: sinh vien, giao vien, lop hoc, mon hoc, diem so, hoc ky cua 1 truong cap 3 gom 3 nam 10,11,12" | ❌ **AI modal tự đóng ngay sau khi gửi**, form không được lưu. Network ghi nhận 6 lần `POST /api/MegaForm/Form/Save` → **400 Bad Request**. |
| **P2:** "them 1 listbox danh sach cac lop hoc" | ✅ **Hoạt động**. AI tạo form với dropdown "Chọn lớp học" và 4 lớp mẫu. Click "Save & Use Now" lưu thành công (formId=61). |

**Root cause chính:** AI Assistant chat (`MegaForm.UI/src/ai-form-assistant/ops.ts`) gọi endpoint **`/api/MegaForm/Form/Save`**, nhưng trong môi trường Oqtane server chỉ có endpoint **`POST /api/MegaForm/Form`**. Do đó, mỗi lần AI cố lưu form (sau khi tạo DDL/tables) đều bị 400, frontend không xử lý lỗi → modal biến mất.

---

## 2. Môi trường & dấu hiệu nhận dạng

- URL page có `?mfpanel=dashboard`.
- Request headers gửi kèm `x-oqtane-moduleid: 41`, `x-oqtane-siteid: 1` → đây là **Oqtane host**.
- Có Blazor circuit: `_blazor/negotiate` xuất hiện trong network log.
- Cookie `X-XSRF-TOKEN-COOKIE` tồn tại (HttpOnly, SameSite=Strict).

---

## 3. Các bước tái hiện

1. Đăng nhập vào site với tài khoản admin.
2. Vào `Form Management` (Dashboard).
3. Click nút **"Create with AI"**.
4. Gõ prompt P1 hoặc P2, click **Send**.
5. Quan sát live preview và network tab.

---

## 4. Kết quả quan sát chi tiết

### 4.1. Prompt P1 — App DB quan hệ (bị lỗi)

- AI gọi OpenAI thành công (`POST https://api.openai.com/v1/chat/completions` 200).
- AI tạo 6 bảng DDL qua `POST /api/AiTools/ExecuteDdl` (6 lần, toàn bộ 200 OK).
- Sau đó AI cố lưu form sinh viên:
  - **Endpoint:** `POST /api/MegaForm/Form/Save`
  - **Status:** `400 Bad Request`
  - **Response body:** rỗng (`content-length: 0`)
  - **Lặp lại 6 lần**, tất cả đều 400.
- Modal tự đóng, user quay về dashboard, không có form mới.

Request body đại diện của lần 400:

```json
{
  "FormId": 0,
  "Title": "Student Registration",
  "Status": "Draft",
  "SchemaJson": "{\"version\":\"1.0\",\"fields\":[{\"key\":\"full_name\",\"type\":\"Text\"},{\"key\":\"email\",\"type\":\"Email\"},{\"key\":\"phone_number\",\"type\":\"PhoneNumberPro\"},{\"key\":\"class_id\",\"type\":\"Select\",\"optionsSql\":\"SELECT Id, Name FROM Classes\"}],\"settings\":{\"databaseInsert\":{\"enabled\":true,\"connectionKey\":\"DashboardDatabase\",\"insertSql\":\"INSERT INTO [dbo].[Students] ...\"}}}",
  "SettingsJson": "{...}",
  "PreserveModuleBindingOnSave": true
}
```

### 4.2. Prompt P2 — Listbox lớp học (thành công)

- AI trả lờii bằng tiếng Anh: "This form contains a listbox for selecting a class...".
- Live preview hiển thị form với combobox `Chọn lớp học *` gồm 4 option: Lớp 1, Lớp 2, Lớp 3, Lớp 4.
- Click **"Save & Use Now"**:
  - **Endpoint:** `POST /api/MegaForm/Form?authmoduleid=41&authsiteid=1`
  - **Status:** `200 OK`
  - Browser redirect sang `?formid=61`.

Request body đại diện:

```json
{
  "FormId": 0,
  "Title": "Danh sách các lớp học",
  "SchemaJson": "{\"fields\":[{\"key\":\"class_list\",\"type\":\"Select\",\"label\":\"Chọn lớp học\",\"required\":true,\"options\":[{\"value\":\"class_1\",\"label\":\"Lớp 1\"},...]}]}",
  "PortalId": 1,
  "ModuleId": 41
}
```

**→ Hai prompt đi qua hai code path khác nhau:**
- P1 đi qua **AI chat assistant** (`ops.ts` → `Form/Save`).
- P2 đi qua **dashboard AI creator** (`ai-form-creator.ts` → `Form`).

---

## 5. Phân tích root cause

### 5.1. Endpoint mismatch (nguyên nhân chính)

Trong `MegaForm.UI/src/ai-form-assistant/ops.ts`:

```ts
function getApiBaseLocal(): string {
  // ...
  if (platformName === 'oqtane' || w.Oqtane || w.__OQTANE__ || ...) {
    return '/api/MegaForm/';
  }
  return '/DesktopModules/MegaForm/API/';
}

// ...
const url = getApiBaseLocal() + 'Form/Save';   // ← hardcode
```

→ Trên Oqtane, URL sinh ra là **`/api/MegaForm/Form/Save`**.

Nhưng trong `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs`:

```cs
[HttpPost("Form")]
[Authorize(Policy = "EditModule")]
public IActionResult SaveForm([FromBody] JsonElement bodyElement)
{
    // ...
}
```

→ Oqtane chỉ expose **`POST /api/MegaForm/Form`**, **không có** `Form/Save`.

Kết quả: request `POST /api/MegaForm/Form/Save` không match action hợp lệ → ASP.NET Core trả về **400 Bad Request** (hoặc 405/404 tùy cấu hình routing). Frontend không parse lỗi, modal crash/đóng.

### 5.2. Xử lý lỗi frontend yếu

- `postJsonSync` trong `ops.ts` chỉ `console.warn` khi fail, không hiển thị lỗi cho user.
- `opCreateForm` / `opAppBatch` không bắt 400 để dừng chuỗi tool calls hoặc hiển thị thông báo.
- Khi 6 lần `Form/Save` đều fail, chat loop kết thúc mà không có form nào được tạo, modal biến mất.

### 5.3. Vấn đề phụ: "Listbox" không phải field type chuẩn

Widget catalog trong `MegaForm.UI/src/ai-form-assistant/widget-catalog.gen.ts` chỉ định nghĩa:
- `Select`
- `MultiSelect`
- `Radio`
- `Checkbox`

Không có type `Listbox`. Trong prompt P2, AI đã tự động map "listbox" → `Select`, nên vẫn chạy được. Nếu user yêu cầu đúng kiểu WP Forms "listbox" (multi-select list), AI có thể emit type không tồn tại → render thành text input hoặc fail.

### 5.4. Các vấn đề phụ khác đã phát hiện trong code review (chưa tái hiện trực tiếp)

- **Tool-budget exhaustion:** `MAX_TOOL_ITERATIONS = 12` có thể không đủ cho prompt phức tạp (6 tables + forms).
- **DDL parser không dialect-proof:** `parseDdl` trong `ops.ts` và `ai-form-creator.ts` là regex-based, có thể fail với SQLite/Postgres/MySQL syntax.
- **Chat log selector sai:** `opAppBatch` dùng `mfai-chat-log` thay vì `mf-ai-log`, nên thông báo thành công không hiển thị.

---

## 6. Khuyến nghị fix

### P0 — Fix crash

1. **Sửa endpoint trong `MegaForm.UI/src/ai-form-assistant/ops.ts`**
   - Thay `getApiBaseLocal() + 'Form/Save'` bằng platform-aware endpoint:
     - Oqtane/standalone: `POST /api/MegaForm/Form`
     - DNN: `/DesktopModules/MegaForm/API/Form/Save` (nếu DNN controller vẫn dùng `Form/Save`)
   - Hoặc dùng cùng helper mà dashboard AI creator đang dùng (`ai-form-creator.ts`).

2. **Thêm xử lý lỗi rõ ràng trong `postJsonSync` / `opCreateForm` / `opAppBatch`**
   - Nếu HTTP ≥ 400, hiển thị message lỗi trong chat log, không đóng modal.
   - Không tiếp tục chuỗi tool calls khi save đã fail.

### P1 — Củng cố robustness

3. **Đảm bảo `Form/Save` fallback:** Nếu server trả 404/400 vì endpoint cũ, retry với `Form`.
4. **Thêm type alias `Listbox` → `Select` hoặc `MultiSelect`** trong widget catalog/system prompt để user yêu cầu WP-style listbox không bị confusion.
5. **Tăng `MAX_TOOL_ITERATIONS`** cho relational/app-batch prompts hoặc đếm tool calls chính xác hơn.

### P2 — Dài hạn

6. **Unify save path:** Để AI chat assistant và dashboard AI creator dùng chung một hàm lưu form.
7. **Dialect-proof DDL parser:** Hỗ trợ SQLite/Postgres/MySQL/MSSQL quoting & keywords.
8. **Fix chat log selector:** `mfai-chat-log` → `mf-ai-log`.

---

## 7. File & code liên quan

| File | Vai trò |
|------|---------|
| `MegaForm.UI/src/ai-form-assistant/ops.ts` | Hardcode endpoint `Form/Save`, xử lý `create_form` / `app_batch` |
| `MegaForm.UI/src/ai-form-assistant/chat.ts` | Chat loop, `MAX_TOOL_ITERATIONS`, đóng/mở modal |
| `MegaForm.UI/src/dashboard/ai-form-creator.ts` | Dashboard AI creator — dùng endpoint đúng `/api/MegaForm/Form` |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | Oqtane controller chỉ có `[HttpPost("Form")]` |
| `MegaForm.Web/Controllers/MegaFormController.cs` | Web controller có `[HttpPost("Form/Save")]` |

---

## 8. Attachments

- Screenshot sau P1 (modal biến mất): `qa-ai-assistant-02-after-prompt1.png`
- Screenshot sau P2 (preview thành công): `qa-ai-assistant-03-after-prompt2.png`
- Network log P1: `qa-ai-assistant-network-02.log`
- Network log P2: `qa-ai-assistant-network-04.log`
- Console log: `qa-ai-assistant-console-02.log`, `qa-ai-assistant-console-03.log`

---

*Kết thúc báo cáo QA. Không có thay đổi code nào được thực hiện.*
