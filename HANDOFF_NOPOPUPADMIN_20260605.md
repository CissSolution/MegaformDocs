# NoPopupAdmin + 2sxc-style Inline Handoff — 2026-06-05

## Phiên này đã làm

### 1. DashboardView.razor refactor (v20260605-02)
- **File:** `MegaForm.Oqtane.Client/DashboardView.razor`
- **Thay đổi:** Bỏ toàn bộ fullscreen DOM takeover logic (CSS ẩn modal, JS interval, MutationObserver, clone node, pump timer, ensureStyle, hideChrome)
- **Kết quả:** Pure inline component giống `BuilderView.razor` / `SubmissionsView.razor`
- **Badge:** `OQDashboardInline v20260605-02`

### 2. Redirect shells — forceLoad + JS top redirect (v20260605-02)
- **Files:** `Dashboard.razor`, `Builder.razor`, `Submissions.razor`
- **Thay đổi:**
  - Thêm `forceLoad: true` vào `NavigationManager.NavigateTo`
  - Fallback JS `window.top.location.replace(...)` trong `Submissions.razor` để break khỏi modal/iframe
- **Badge:** `OQDashboardRedirect v20260605-02`, `OQBuilderRedirect v20260605-02`, `OQSubmissionsRedirect v20260605-02`

### 3. Build + Deploy
- Build `MegaForm.Oqtane.Package` Release → 0 errors
- Tạo `MegaForm.Oqtane.1.7.22.nupkg`
- Copy package vào 5 instances:
  - `oqtane.framework-dev (1)`
  - `Oqtane.Framework.10.1.0.SQL4`
  - `Oqtane.Framework.10.1.0_1`
  - `Oqtane.Fresh.10.1.0`
  - `Oqtane.Fresh.Test.10.1.0`
- Copy DLL trực tiếp vào root instance `Oqtane.Fresh.10.1.0/` và restart (localhost:5005)

## Vấn đề còn tồn đọng (cần phiên sau tiếp tục)

### Visual QA — Modal vẫn còn
- **URL test:** `http://localhost:5005/*/793/submissions`
- **Kết quả:** Submissions view vẫn bị gói trong **Oqtane modal "MegaForm"** (có title bar + nút X)
- **JS redirect:** `window.top.location.replace()` đã hoạt động — URL đổi thành `/*/793?mfpanel=submissions`, nhưng **modal vẫn hiển thị**
- **Screenshot:** `tmp-qa/visual-qa-submissions.png` (1440x964px)

### Nguyên nhân giả thuyết (chưa xác nhận)
1. **Oqtane Edit Mode** render module pages bên trong modal dialog — dù URL đổi, modal vẫn giữ nguyên vì là cùng một Blazor circuit/page
2. Hoặc: `Index.razor` render `SubmissionsView` inline nhưng **Oqtane module container** vẫn bọc nó trong modal
3. Hoặc: Cần xóa/bỏ `@inherits ModuleBase` trong redirect shells để Oqtane không đăng ký `/submissions` như module page

### Cần test tiếp theo
- [ ] Chạy script `tmp-qa/playwright-test-direct.cjs` để test URL trực tiếp `?mfpanel=submissions` (không qua `/submissions`) — xem có modal không
- [ ] Nếu modal vẫn còn với `?mfpanel=submissions`, vấn đề nằm ở `Index.razor` hoặc Oqtane edit mode
- [ ] Nếu modal biến mất với `?mfpanel=submissions`, thì cần đảm bảo redirect từ `/submissions` hoạt động đúng

### Các approach cần xem xét
- **Approach A:** Xóa/bỏ `@inherits ModuleBase` trong redirect shells để Oqtane không tạo routes `/Dashboard`, `/Builder`, `/Submissions`
- **Approach B:** Trong `Index.razor`, khi `_panelMode != None`, thêm CSS để module expand ra khỏi modal boundary (nhẹ nhàng hơn takeover cũ)
- **Approach C:** Dùng `window.open(url, '_blank')` hoặc hard navigation với `window.location.href` thay vì `window.top.location.replace`
- **Approach D:** Điều tra cách Oqtane render module pages trong edit mode — có thể cần config ở `ModuleInfo.cs`

## Files đã sửa (cần rebuild nếu tiếp tục)
- `MegaForm.Oqtane.Client/DashboardView.razor`
- `MegaForm.Oqtane.Client/Dashboard.razor`
- `MegaForm.Oqtane.Client/Builder.razor`
- `MegaForm.Oqtane.Client/Submissions.razor`

## Oqtane instance đang chạy
- **Oqtane.Fresh.10.1.0** → `http://localhost:5005` (PID mới sau restart)
- Các instance khác chưa start
