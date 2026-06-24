# Handoff — Oqtane Dashboard Routing + CSS + JS Fixes
**Date:** 2026-06-06  
**Session focus:** Fix "New Form / Submissions" routing, JS SyntaxError, 2 scrollbar, header CSS, action icons, submissions count display, remove Quick Actions + System cards.

---

## 1. Fix Routing — "New Form" / "Submissions" bị chuyển về View Form

**Root cause:** JS dashboard `getPlatformRoute()` cho Oqtane tự sinh URL dạng `/builder`, `/submissions` bằng cách nối vào `window.location.pathname`. Oqtane không route được các URL thiếu segment module ID → fallback về view form.

**Fix:** Truyền `data-builder-url`, `data-submissions-url`, `data-dashboard-url` vào root element của 3 inline views để JS đọc URL query-based (`?mfpanel=xxx`) thay vì tự sinh.

### Files changed
- `MegaForm.Oqtane.Client/DashboardView.razor`
  - Root `<div id="mf-dashboard-root">`: thêm `data-dashboard-url`, `data-builder-url`, `data-submissions-url`
  - `BuildPanelUrl()` already existed here
- `MegaForm.Oqtane.Client/BuilderView.razor`
  - Root `<div id="mf-builder-root">`: thêm 3 `data-*` attrs
  - Thêm `BuildPanelUrl()` + `GetQueryValue()` helpers
  - Thêm `@using System.Collections.Generic`
- `MegaForm.Oqtane.Client/SubmissionsView.razor`
  - Root `<div id="mf-submissions-root">`: thêm 3 `data-*` attrs
  - Thêm `BuildPanelUrl()` + `GetQueryValue()` helpers
  - Thêm `@using System.Collections.Generic`

---

## 2. Fix JS SyntaxError: Unexpected end of input

**Root cause:** `AddHeadContent` trong `Index.razor` inject thẳng `<script>...</script>` vào `<head>`. Blazor enhanced navigation tự chèn HTML comments (`<!--!-->`) vào giữa script khi diff head → browser parse JS lỗi.

**Fix:** Chuyển hoàn toàn sang `IJSRuntime.InvokeVoidAsync("eval", ...)` với guard để chỉ chạy 1 lần.

### Files changed
- `MegaForm.Oqtane.Client/Index.razor`
  - `OnParametersSetAsync`: bỏ `AddHeadContent` với `<script>` tag → dùng `InjectInlineScript()`
  - `AddPlatformHeadContent`: bỏ `UpsertModuleInlineScript` → dùng `InjectInlineScript()`
  - Thêm hàm `InjectInlineScript(string script)`
- `MegaForm.Oqtane.Client/BuilderView.razor`
  - `OnParametersSet`: bỏ `innerHTML` inject `<script>` tag → dùng `eval` trực tiếp với guard `__builderBooted`

---

## 3. Fix 2 Scrollbar khi Dashboard mở

**Root cause:** Dashboard render trong `div fixed fullscreen` nhưng `html/body` của Oqtane vẫn có overflow riêng.

**Fix:**
- `DashboardView.razor`: Add class `mf-oq-dashboard-active` vào `html` + `body` khi mount (trước đó chỉ có cleanup remove).
- `Index.razor`: Thêm inline `<style>` trong khối render dashboard:  
  `html.mf-oq-dashboard-active, body.mf-oq-dashboard-active { overflow: hidden !important; }`

---

## 4. Fix Header xộc xệch CSS

**Root cause:** `.mf-hd` cố định `height:56px`, nhưng badges nhiều wrap xuống dòng → bị cắt.

**Fix:** `Assets/css/megaform-admin-shell.css`
- `.mf-hd`: `height:var(--hd)` → `min-height:var(--hd)`; `padding:0 1rem` → `padding:.5rem 1rem`
- `.mf-hd-badges`: thêm `row-gap:.25rem`

**Copy to:**
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/megaform-admin-shell.css`
- `DesktopModules/MegaForm/Assets/css/megaform-admin-shell.css`

---

## 5. Bỏ Recent Submissions, cho Apps & Forms full width

**Fix:** `MegaForm.UI/src/dashboard/index.ts`
- Dòng render `mid`: bỏ `mf-g21` (2 cột grid), thay bằng container `width:100%;display:block;`
- Bỏ hẳn `buildSubs(data.recentSubmissions)`

---

## 6. Action icons vuông vức hơn

**Fix:** `Assets/css/megaform-admin-shell.css` (`.mf-ic-btn`)
- `width:2.25rem;height:2.25rem` → `width:2.5rem;height:2.5rem;min-width:2.5rem;min-height:2.5rem`
- `border-radius:8px` → `border-radius:10px`
- Thêm `flex-shrink:0`
- SVG icon: `16px` → `18px`

---

## 7. Hiển thị số Submissions cho mỗi form

**Server-side:** `MegaForm.Oqtane.Client/DashboardView.razor`
- `BuildDashboardJsonAsync`: gọi `GetSubmissionsAsync` cho từng form, lưu count vào dictionary `formSubmissions`, trả về trong `recentForms[].submissions`

**Client-side:** `MegaForm.UI/src/dashboard/index.ts`
- `buildLockedFormsCard`, `buildNormalFormsCard`, `buildStandaloneForms`: đổi header cột từ `"Fields"` → `"Submissions"`, cell value từ `f.fields ?? 0` → `f.submissions || 0`

---

## 8. Bỏ khối Quick Actions + System

**Fix:** `MegaForm.UI/src/dashboard/index.ts`
- Comment bỏ đoạn render `buildQA` và `buildSystem` ở dưới cùng dashboard.

---

## Build & Deploy Steps (for next agent)

1. **Build TS bundles** (if touching `MegaForm.UI/src/dashboard/index.ts`):
   ```bash
   cd MegaForm.UI
   npm run build:dashboard
   ```

2. **Build .NET**:
   ```bash
   dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj
   ```

3. **Copy to Oqtane runtime**:
   ```bash
   cp "MegaForm.Oqtane.Client/bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll" "/e/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/"
   cp "MegaForm.Oqtane.Server/bin/Debug/net10.0/MegaForm.Oqtane.Server.Oqtane.dll" "/e/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/"
   cp -r "MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/"* "/e/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0/wwwroot/Modules/MegaForm/"
   ```

4. **Restart Oqtane**:
   ```bash
   taskkill //F //IM Oqtane.Server.exe
   cd "/e/DNN_SITES/OqtaneSites/Oqtane.Fresh.10.1.0"
   cmd //c "start /B Oqtane.Server.exe --urls http://localhost:5005"
   ```

5. **Browser**: Hard-refresh (`Ctrl + F5`) để load JS/CSS mới.

---

## Known Issues / Notes

- `MegaForm.Core.dll` được ghi đè bằng bản build .NET 10 mới. Nếu Oqtane app gốc cần dependency `Microsoft.AspNetCore.Razor.Language.dll`, file này đã được copy từ `Oqtane.MSSQL` sang `Oqtane.Fresh.10.1.0`.
- `KbSeeder` warning khi startup là non-fatal (không ảnh hưởng dashboard).
