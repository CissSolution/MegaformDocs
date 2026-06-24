# MegaForm Oqtane — Fix v09 (cumulative, chồng lên v08)
**Patch ID:** `OQ-difix20260420-09`
**Supersedes:** `OQ-difix20260420-08` (`oq-inline-script-resource-fix`)
**Bug:** **G** — renderer boot script không vào DOM khi build sau `await`

## Triệu chứng

URL `/rendererhost?formid=3` (hoặc bất kỳ `?formid=N` khi form đã Published):

| Item | Trạng thái |
|---|---|
| Mount div `<div id="mf-form-38-3">` | ✓ có trong DOM |
| `window.__MF_PLATFORM__` | ✓ đầy đủ 9 fields |
| `window.MegaFormRenderer` | ✓ loaded (`typeof === "object"`) |
| API `GET /api/MegaForm/Schema/3` | ✓ 200, trả JSON 33KB |
| **`window.__MF_OQTANE_RENDERER_BOOT__`** | ✗ **false** |
| **Inline script marker `__MF_OQTANE_RENDERER_BOOT__`** | ✗ **không có trong DOM** |
| **Mount div `innerHTML.length`** | ✗ **0** (form không render) |

Console `__MF_PLATFORM_BOOT__` thì có (add trước await), còn `__MF_OQTANE_RENDERER_BOOT__` thì không.

## Root cause

Trong `MegaForm.Oqtane.Client/Index.razor` `OnParametersSetAsync`:

```csharp
AddPlatformHeadContent();            // SYNC — trước await — vào DOM OK
await LoadAdminConfigAsync();        // await #1
await BuildDashboardAsync();         // await #2
var form = await MegaFormService.GetFormAsync(_formId);  // await #3
// ... fallback ListFormsAsync thêm await #4 khi cần ...

if (_formId > 0 && _isPublished && !_embedMode)
{
    UpsertModuleInlineScript("__MF_OQTANE_RENDERER_BOOT__", BuildRendererBootScript());
    //   ↑ SAU nhiều await — Oqtane đã qua render pass → Resources.Add(...) vô tác dụng
}
```

Oqtane Blazor render pass thu thập `PageState.Page.Resources` tại một điểm cố định trong lifecycle. `AddPlatformHeadContent()` ở đầu method chạy synchronous nên kịp. Sau `await`, control trả về runtime — khi tiếp tục chạy thì pass đó đã qua, `Resources.Add(...)` mới không được inject thành `<script>`.

Tên zip v08 `oq-inline-script-resource-fix` cho thấy đã có người cố giải quyết chuyện này ở hướng Resource pipeline. Fix v09 đổi hướng: **bỏ qua Resource pipeline, dùng `IJSRuntime.InvokeVoidAsync("eval", ...)` trực tiếp trong `OnAfterRenderAsync`.**

## Fix

### File thay đổi

| File | Nội dung |
|---|---|
| `MegaForm.Oqtane.Client/Index.razor` | +2 field, sửa 1 block trong `OnParametersSetAsync`, sửa `OnAfterRenderAsync` |

### Diff tóm tắt

```diff
+ private string _pendingRendererBoot = string.Empty;
+ private bool _rendererBootExecuted;

  // trong OnParametersSetAsync, cuối method:
- if (_formId > 0 && _isPublished && !_embedMode)
- {
-     UpsertModuleInlineScript("__MF_OQTANE_RENDERER_BOOT__", BuildRendererBootScript());
- }
+ if (_formId > 0 && _isPublished && !_embedMode)
+ {
+     _pendingRendererBoot = BuildRendererBootScript();
+     _rendererBootExecuted = false;
+ }
+ else
+ {
+     _pendingRendererBoot = string.Empty;
+ }

  // OnAfterRenderAsync:
  protected override async Task OnAfterRenderAsync(bool firstRender)
  {
      await base.OnAfterRenderAsync(firstRender);
+
+     if (!_rendererBootExecuted && !string.IsNullOrEmpty(_pendingRendererBoot))
+     {
+         _rendererBootExecuted = true;
+         try
+         {
+             await Js.InvokeVoidAsync("eval", _pendingRendererBoot);
+         }
+         catch (Exception ex)
+         {
+             Console.Error.WriteLine($"MegaForm: renderer boot eval failed: {ex.Message}");
+         }
+     }
  }
```

### Vì sao guard `_rendererBootExecuted` quan trọng

Blazor có thể gọi `OnAfterRenderAsync` nhiều lần (re-render sau state change). Nếu không guard, boot script chạy 2-3 lần → `MegaFormRenderer.init` bị gọi trùng → form render chồng lên nhau hoặc rối container.

Reset `_rendererBootExecuted = false` khi `OnParametersSetAsync` build boot script mới (ví dụ: user chuyển giữa các form qua `?formid=...`) để lần tới có thể eval lại.

## Áp dụng

1. Tải zip `MegaForm_OQ_UM_v20260420-09_renderer-boot-eval-fix.zip`
2. Giải nén đè project
3. `dotnet build MegaForm.Oqtane.Client`
4. Copy `MegaForm.Oqtane.Client.Oqtane.dll` vào Oqtane `bin/`
5. **Restart Oqtane**
6. Hard-refresh browser

## Verify

### Test 1 — Browser console sau khi mở `/rendererhost?formid=3`

```javascript
JSON.stringify({
  bootBadge: window.__MF_OQTANE_RESOURCE_BOOT_BADGE__,
  bootMarker: !!window.__MF_OQTANE_RENDERER_BOOT__,
  mountInnerLen: document.getElementById('mf-form-38-3')?.innerHTML?.length,
  rendererLoaded: typeof window.MegaFormRenderer
}, null, 2)
```

**Expect sau v09:**
```json
{
  "bootBadge": "OqtaneResourceBoot v20260420-08",
  "bootMarker": true,
  "mountInnerLen": 1000+,
  "rendererLoaded": "object"
}
```

**Trước v09 (triệu chứng bug):**
```json
{
  "bootBadge": null,
  "bootMarker": false,
  "mountInnerLen": 0,
  "rendererLoaded": "object"
}
```

### Test 2 — Visible form render

Mở `/rendererhost?formid=3` (hoặc formid bất kỳ đã Published):
- Trước v09: mount div rỗng, trang không hiện form
- Sau v09: form render đầy đủ — title, description, fields, submit button

### Test 3 — Chuyển form

Thử chuyển `?formid=3` → `?formid=1` → `?formid=3` trên cùng tab:
- Mỗi lần URL đổi, `OnParametersSetAsync` set `_rendererBootExecuted=false` và build script mới
- `OnAfterRenderAsync` chạy tiếp, eval script mới cho form ID mới
- Form cũ bị DOM thay (mount ID khác vì `mf-form-{moduleId}-{formId}`), form mới init đúng container mới

### Test 4 — Event Log

`/admin/log` sau khi mở renderer host page: không có entry `ExceptionMiddleware` hoặc `JSInvokeException` mới.

## Tổng kết

Sau v09, end-to-end flow Oqtane + MegaForm hoạt động:

| Flow | v08 | v09 |
|---|---|---|
| Save form mới | ✓ | ✓ |
| List forms dropdown | ✓ | ✓ |
| Edit existing form | ✓ | ✓ |
| **Render published form** — `/rendererhost?formid=N` | ✗ | ✓ |
| Submit form | ✓ | ✓ |
| Workflow execution | ✗ (NoOp) | ✗ (NoOp) |

## Regression check

v08 `oq-inline-script-resource-fix` giữ nguyên tất cả helper (`UpsertModuleInlineScript`, `AddPlatformHeadContent`) — chúng vẫn được gọi cho `__MF_OQTANE_PLATFORM_BOOT__` (cái này chạy SYNC trước await nên vẫn OK). v09 chỉ đổi cách inject **renderer** boot, không chạm tới platform boot. Các flow admin (Manage panel, Dashboard, Builder, Submissions) không bị ảnh hưởng.
