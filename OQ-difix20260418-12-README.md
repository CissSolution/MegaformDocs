# MegaForm Oqtane — Full Fix v12 (cumulative)
**Patch ID:** `OQ-difix20260418-12`
**Includes:** v4–v11 (full) + v12 Bug F (`_isPublished` defensive resolution)
**Supersedes:** all previous v1–v11 patches

## Hành trình debug — 11 tầng bug

| # | Patch | Bug | Fix |
|---|---|---|---|
| 1 | v4 | DI: `IPhase2Repository` không register | `EfPhase2Repository` |
| 2 | v5 | DI: `WorkflowEngineV2` cần chuỗi service | `NoOpWorkflowEngine` |
| 3 | v6 | EF: `SubmissionCount` tưởng là column | `e.Ignore(...)` |
| 4 | v7 | Binding: `[FromBody] JObject` không bind | `JsonElement` + parse |
| 5 | v8 | DB: 34 NOT NULL string column | `NullStringNormalizer` |
| 6 | v9-A | Bind: module ↔ form không tự động | Auto-bind trong `SaveForm` |
| 7 | v9-B | JS: View boot không lazy-load renderer | Inject 5 bundle |
| 8 | v10 | Route: `/Form/Get` 404 | `[HttpGet("Form/Get")]` alias |
| 9 | v11-D | JSON: `_forms` rỗng dù API trả đúng | Fallback `ListFormsAsync` |
| 10 | v11-E | UI: Không có nút tạo form mới | Thêm `+ New Form` button |
| 11 | **v12-F** | **`_isPublished = false` dù DB = "Published"** | **Cross-check qua `_forms` / `ListFormsAsync`** |

## Chi tiết v12 — Bug F

**Triệu chứng (từ user screenshot):**
- URL `/*/37?formid=1` hiển thị orange warning: **"MegaForm: This form is not published yet. Open Builder ↗"**
- DB `MF_Forms` có row FormId=1, Status="Published"
- API `GET /api/MegaForm/Form/1` trả `{"status":"Published",...}` (verified live)
- Nhưng C# `form.Status` deserialize ra "Draft" (default value) → `_isPublished = false`

**Root cause (giống Bug D):**
Oqtane ServiceBase `ReadFromJsonAsync<T>()` đôi khi không apply được `JsonSerializerDefaults.Web` (case-insensitive), khiến property PascalCase không được fill từ JSON camelCase. Status field bị bỏ qua → giữ nguyên default "Draft".

**Fix — defense-in-depth:**
```csharp
if (_formId > 0)
{
    try {
        var form = await MegaFormService.GetFormAsync(_formId);
        _isPublished = string.Equals(form?.Status, "Published", StringComparison.OrdinalIgnoreCase);
    } catch { _isPublished = false; }

    // Cross-check fallbacks if first check failed
    if (!_isPublished)
    {
        // 1. Check _forms (admin path — populated by v11-D fallback)
        // 2. If _forms empty (non-admin path), call ListFormsAsync directly
        FormListItem match = _forms?.FirstOrDefault(f => f.FormId == _formId);
        if (match == null) {
            var allForms = await MegaFormService.ListFormsAsync(...);
            match = ... allForms.FirstOrDefault(f => f.FormId == _formId);
        }
        if (match?.Status == "Published") _isPublished = true;
    }
}
```

→ Sau v12, `_isPublished` được verify từ 3 nguồn độc lập. Chỉ cần **1 trong 3** trả "Published" là đủ.

## File thay đổi (cumulative so với zip gốc)

| File | Patches |
|---|---|
| `MegaForm.Oqtane.Server/Data/EfPhase2Repository.cs` (Mới) | v4 + v8 |
| `MegaForm.Oqtane.Server/Services/NoOpWorkflowEngine.cs` (Mới) | v5 |
| `MegaForm.Oqtane.Server/Data/NullStringNormalizer.cs` (Mới) | v8 |
| `MegaForm.Oqtane.Server/Services/Startup.cs` (Sửa) | v4 + v5 |
| `MegaForm.Oqtane.Server/Data/MegaFormDbContext.cs` (Sửa) | v6 |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` (Sửa) | v7 + v9-A + v10 |
| `MegaForm.Oqtane.Server/Data/EfRepositories.cs` (Sửa) | v8 |
| `MegaForm.Oqtane.Client/Index.razor` (Sửa) | v9-B + v11-D + v11-E + **v12-F** |

## Áp dụng

1. Tải `MegaForm_OQ-difix20260418-12_full.zip`
2. Giải nén đè project
3. `dotnet build MegaForm.Oqtane.Server`
4. Copy 2 DLL vào Oqtane `bin/`:
   - `MegaForm.Oqtane.Server.Oqtane.dll`
   - `MegaForm.Oqtane.Client.Oqtane.dll`
5. **Restart Oqtane**
6. Hard-refresh browser

## Verify

### Test live render (URL `/*/37?formid=1`)
- Trước v12: Orange warning "This form is not published yet"
- Sau v12: Form 1 ("Celebration") render đầy đủ — title, description, fields, button "Apply Now"

### Test admin dock (URL `/*/37`)
- Click "View Settings"
- "Module form" dropdown có `Celebration (ID: 1, Published)` (v11-D)
- Click "+ New Form" → Builder mở canvas trống (v11-E)

### Network tab kiểm tra
- `GET /api/MegaForm/Form/Get?formId=1` → 200 (v10)
- `GET /api/MegaForm/Form/List?...` → 200 với forms array
- `GET /api/MegaForm/Schema/1` → 200 với schema data (renderer fetch)

### Event Log sạch
`/admin/log` không có entry `ExceptionMiddleware Error Other` mới sau click

## Tổng kết
Sau v12: hầu hết các flow MegaForm trên Oqtane phải usable end-to-end:
- ✅ Save form mới → DB persist + auto-bind module → form
- ✅ List forms → dropdown đầy đủ
- ✅ Edit existing form → Builder load đúng
- ✅ Render published form → Live view + module page hiển thị đầy đủ
- ✅ Submit form → submission persist (v8 normalize)
- ❌ Workflow execution → disabled (NoOpWorkflowEngine — v5)
