# Handoff: State Chips & Tabs Scroll Fix

## Ngày tạo
2026-06-07

## Vấn đề
Người dùng yêu cầu:
1. **Remove state preview chips** (Default/Hover/Focus/Disabled/Error) khỏi topbar trong Design mode
2. **Fix tabs section** để không có scroll và giống mock

## Trạng thái hiện tại

### 1. State Chips — CHƯA HOÀN THÀNH
- State chips vẫn hiển thị trên topbar trong Design mode (đã xác nhận qua screenshot từ browser localhost:5005)
- **Không tìm thấy source code** render state chips trong toàn bộ codebase:
  - Không có trong `MegaForm.UI/src/builder/*.ts`
  - Không có trong `.cshtml`, `.ascx`, `.razor` views
  - Không có trong `megaform-builder.js` minified bundle (đã search kỹ)
  - Mock Next.js (`VERCEL_mega_form-admin-redesign`) CÓ state chips trong `app/builder/page.tsx` dòng 740-762, nhưng production codebase KHÔNG có
- Có thể nguyên nhân:
  - Browser cache đang dùng bundle cũ
  - Hoặc được render từ external script/plugin khác
  - Hoặc từ server-side code chưa tìm thấy

**Đã thử:**
- Thêm JS trong `dom.ts` `activateMode()` để scan và ẩn element chứa text state labels
- Nâng cấp lên `MutationObserver` để catch dynamically injected chips
- Build & sync thành công

**Cần làm tiếp:**
- Yêu cầu user hard refresh (Ctrl+F5) để xóa cache
- Nếu vẫn còn, cần inspect DOM trực tiếp trong browser để tìm class/selector chính xác
- Hoặc tìm trong server-side response (View Source) xem chips có được render từ HTML ban đầu không

### 2. Tabs Scroll — CẦN XÁC NHẬN

**Design mode tabs (Presets/Elements/Colors):**
- Đã thêm CSS trong `megaform-builder-shell.css` B84-B90:
  ```css
  body[data-mf-mode="design"] .mf-panel-left .mf-palette-tabs,
  body[data-mf-mode="design"] .mf-panel-left .mf-theme-nav-tabs {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    overflow: hidden !important;
    flex-wrap: nowrap !important;
  }
  ```
- Cũng có rule trong `megaform-builder-ts.css` dòng 150:
  ```css
  .mf-palette-tabs {
    display: grid !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 0 !important;
    height: 36px !important;
    ...
  }
  ```

**Build mode tabs (Basic/Layout/Widgets):**
- Từ screenshot, có vẻ có scrollbar trong Build mode left panel
- `megaform-builder-ts.css` đã có `.mf-palette-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }` nhưng có thể bị override
- Cần kiểm tra xem Build mode có dùng class `.mf-palette-tabs` hay class khác

**Cần làm tiếp:**
- Xác nhận trong browser sau hard refresh
- Nếu Build mode tabs vẫn scroll, cần thêm `overflow: hidden` hoặc sửa selector cho Build mode

## Files đã sửa
1. `MegaForm.UI/src/styles/megaform-builder-shell.css` — thêm B84-B90 Design mode tab grid
2. `MegaForm.UI/src/builder/dom.ts` — thêm MutationObserver ẩn state chips trong `activateMode()`

## Build & Sync
- `npm run build:builder` ✅ (2026-06-07)
- Synced đến: DNN, Oqtane, Web, Umbraco ✅

## Hướng dẫn phiên sau
1. Yêu cầu user **hard refresh** trình duyệt (Ctrl+F5)
2. Chụp screenshot mới kiểm tra:
   - Design mode topbar: còn state chips không?
   - Design mode tabs: còn scroll không?
   - Build mode tabs: còn scroll không?
3. Nếu state chips vẫn còn sau hard refresh:
   - Mở DevTools → Elements → tìm chips trong DOM
   - Copy outerHTML của container chứa chips
   - Tìm source render chính xác dựa trên class/attributes
4. Nếu tabs vẫn scroll:
   - Kiểm tra computed styles của `.mf-palette-tabs` và `.mf-ptab`
   - Thêm `overflow: hidden !important;` nếu cần
   - Đảm bảo không có `white-space: nowrap` hoặc `min-width` quá lớn

## Reference
- Mock source: `E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\VERCEL_mega_form-admin-redesign\app\builder\page.tsx` dòng 740-762 (state chips trong mock)
- Screenshot QA: `tmp-qa/oqtane-design.png` — hiển thị state chips trong production
