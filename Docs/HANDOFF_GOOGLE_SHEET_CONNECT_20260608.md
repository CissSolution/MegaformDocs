# Handoff — Google Sheet One-Click Connect in Submissions
**Date:** 2026-06-08  
**Scope:** Submissions UI → Auto-create workflow with GoogleSheets node  
**Badge:** `SubsGoogleSheetConnect v20260608-01`

---

## 0. TL;DR

Thêm nút **"Connect Google Sheet"** vào header phần **Submissions**. Khi click, mở modal nhập Spreadsheet ID + Range, sau đó tự động:
1. Fetch workflow hiện tại của form
2. Tạo/cập nhật GoogleSheets node với column mappings auto-generated từ form schema
3. Save workflow qua API (`Workflow/Save`)

Build thành công, output đã sync tới `Assets/js/`, `DesktopModules/MegaForm/Assets/js/`, `MegaForm.Web/wwwroot/megaform/js/`.

---

## 1. What was done

### 1.1 UI Changes — `MegaForm.UI/src/submissions/SubmissionsShell.ts`
- **Thêm icon `googleSheet`** vào dictionary `I` (SVG bảng tính 16×16)
- **Thêm badge** `SubsGoogleSheetConnect v20260608-01`
- **Thêm nút `gsBtn`** trong `buildHeader()`, cạnh nút Refresh và Export
  - Disabled khi chưa chọn form cụ thể (toast nhắc chọn form)
- **Modal `openGoogleSheetConnectModal()`** — overlay + box nhập:
  - Spreadsheet ID (placeholder điển hình)
  - Sheet / Range (default: `Sheet1!A:Z`)
  - Info note giải thích: chỉ sync submission **mới**, không retroactive
  - Nút Cancel + Connect (async, có loading state)

### 1.2 Workflow Builder Logic
- **`fetchWorkflowDef(formId)`** — platform-aware GET:
  - DNN/Web: `Workflow/Get?formId=N`
  - Oqtane: `Form/Workflow/Get?formId=N`
  - Trả `null` nếu 404/400 (chưa có workflow)
- **`buildGoogleSheetWorkflow(...)`** — logic xây dựng workflow JSON:
  - Auto-map fields từ schema (bỏ qua Html/Section/Hidden/Row/File) → cột A, B, C…
  - Nếu **chưa có workflow**: tạo workflow mới tối thiểu (GoogleSheets → End)
  - Nếu **đã có workflow**:
    - Tìm/replace node GoogleSheets cũ (type = 25)
    - Tìm/replace node End cũ (type = 5)
    - Rewire leaf nodes → GoogleSheets → End
    - Fallback: nếu graph cyclic/empty, force edge từ node đầu tiên → GoogleSheets
- **`saveWorkflowDef(formId, workflow)`** — POST platform-aware:
  - DNN/Web: `Workflow/Save`
  - Oqtane: `Form/Workflow/Save`

### 1.3 Helpers thêm vào
- `newGuid()` — UUID v4 đơn giản
- `bumpVersion(v)` — tăng patch version (1.0.0 → 1.0.1)

---

## 2. Build & Deploy Notes

```bash
cd MegaForm.UI
npm run build:submissions
```

Output:
- `Assets/js/megaform-submissions.js` (173.37 kB)
- Auto-sync tới:
  - `DesktopModules/MegaForm/Assets/js/megaform-submissions.js`
  - `MegaForm.Web/wwwroot/megaform/js/megaform-submissions.js`
  - *(Oqtane.Client không có file submissions riêng trong wwwroot — lấy từ Assets/js hoặc server module)*

**Type check:** `npm run typecheck` báo lỗi pre-existing ở `src/builder/workflow/wf-app.ts:785` (không liên quan đến thay đổi này).

---

## 3. Known Limitations / Notes for Next Session

1. **Column mapping đơn giản:** chỉ map tối đa 20 field đầu tiên, A→T. Chưa hỗ trợ đổi thứ tự cột hoặc skip field trong UI.
2. **OAuth / Google API key:** chưa có. Node GoogleSheets hiện tại trong backend (`GoogleSheetsNodeExecutor.cs`) chỉ trả về canonical request preview (không thực sự gọi Google API). Để runtime thực sự push dữ liệu, cần:
   - Bổ sung Google OAuth / Service Account key trong server settings
   - Update `GoogleSheetsNodeExecutor.cs` để thực hiện outbound HTTP call với Bearer token
3. **Workflow overwrite risk:** nếu form đã có workflow phức tạp (Fork, Join, Condition), logic rewire leaf nodes có thể không hoàn hảo. Đã có fallback (force edge từ node 0), nhưng nên test trên workflow phức tạp.
4. **No undo:** sau khi Connect, workflow cũ bị ghi đè (save apply ngay). Có thể muốn thêm bước preview hoặc lưu backup.
5. **Chỉ hỗ trợ `append` operation:** chưa cho chọn `update` trong modal.

---

## 4. Suggested Next Steps

1. **Runtime execution:** wire `GoogleSheetsNodeExecutor.cs` để thực sự gọi Google Sheets API v4 với OAuth token (hoặc Service Account JSON) từ server settings.
2. **UI polish:** thêm dropdown chọn operation (append/update), cho phép reorder/skip columns trong modal.
3. **Validation:** sau khi Connect, gọi `Workflow/Validate` để hiển thị warning/error trước khi Save.
4. **Test on existing workflow:** tạo workflow có Fork + Join rồi click Connect, kiểm tra graph integrity.

---

## 5. Key Files Touched

| File | Action |
|---|---|
| `MegaForm.UI/src/submissions/SubmissionsShell.ts` | Thêm icon, badge, header button, modal, workflow helpers |
| `Assets/js/megaform-submissions.js` | Rebuild bundle |
| `DesktopModules/MegaForm/Assets/js/megaform-submissions.js` | Sync bundle (DNN) |
| `MegaForm.Web/wwwroot/megaform/js/megaform-submissions.js` | Sync bundle (Web standalone) |

---

## 6. Related Existing Code

- Backend executor: `MegaForm.Core/Workflow/GoogleSheetsNodeExecutor.cs`
- Workflow models: `MegaForm.Core/Models/WorkflowModels.cs`
- Workflow UI panel: `MegaForm.UI/src/builder/workflow/wf-google-sheets.ts`
- API controllers: `MegaForm.Web/Controllers/WorkflowController.cs`, `MegaForm.DNN/WebApi/WorkflowApiController.cs`
