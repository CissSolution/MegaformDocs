# Handoff: Nâng cấp Phone Number Pro — Flag Dropdown

**Authored:** 2026-06-15
**Audience:** dev team tiếp nối widget Phone Number Pro
**Widget ID:** `PhoneNumberPro`
**Mục tiêu:** Dropdown chọn quốc gia hiển thị cờ + tên quốc gia + mã dial, quốc gia đang chọn có checkmark, trigger hiển thị cờ + mã dial như hình mock.

---

## 1. Tổng quan widget

Phone Number Pro là widget input điện thoại nâng cao, gồm:
- Nút trigger chọn quốc gia (flag + mã dial/ISO + chevron).
- Dropdown tìm kiếm và chọn quốc gia.
- Ô nhập số điện thoại với auto-format, validate E.164/min-max digits.
- Lưu dạng JSON hoặc E.164.

Hiện tại widget đã có cờ emoji trong dropdown và trigger, nhưng cần polish để khớp hình mock:
- Quốc gia đang chọn trong dropdown phải có **icon checkmark (✓)**.
- Flag nên ổn định trên mọi OS/browser (xem xét SVG sprite thay emoji).
- Dropdown cần scroll selected item into view khi mở.
- Error state đã có, cần giữ nguyên behavior.

---

## 2. Source code liên quan

### File nguồn chính (chỉnh sửa chính)

| File | Mô tả |
|------|-------|
| `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts` | Toàn bộ logic + render widget. **File duy nhất cần đụng đến logic.** |
| `Assets/css/plugins/megaform-widget-phone-pro.css` | Style runtime của widget. |

### Các vị trí quan trọng trong TS

| Dòng | Nội dung |
|------|----------|
| `134–317` | Mảng `COUNTRIES` ~195 quốc gia. Mỗi country có `iso2`, `name`, `dial`, `flag` (emoji). |
| `659–689` | `renderCountryListHTML()` — render HTML danh sách quốc gia trong dropdown. **Cần thêm checkmark cho selected item.** |
| `632–655` | `setCountry()` — cập nhật flag + code trên trigger khi đổi quốc gia. |
| `714–735` | `openDropdown()` / `closeDropdown()`. **Cần scroll selected item into view khi mở.** |
| `925–937` | `flagHtml` — render trigger button + dropdown container. |
| `738–826` | `bindEvents()` — xử lý click, search, keyboard navigation. |

### File đăng ký / load asset (KHÔNG cần sửa nếu chỉ nâng cấp UI)

| File | Dòng | Ghi chú |
|------|------|---------|
| `MegaForm.UI/src/builder/canvas.ts` | `980`, `1160–1161` | Preload plugin + màu palette. |
| `MegaForm.UI/src/loader/index.ts` | `78`, `381` | Load CSS/JS plugin. |
| `MegaForm.UI/src/shared/platform-host.ts` | `629`, `662` | Embed/public form asset lists. |
| `MegaForm.Core/Services/FormAssetManifestService.cs` | `109–111` | Core asset manifest. |
| `MegaForm.Web/Controllers/FormController.cs` | `493–495` | Web asset injection. |
| `MegaForm.DNN/Views/FormView.ascx.cs` | `1787–1789` | DNN asset injection. |
| `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | `3405–3407` | Oqtane asset injection. |
| `BuildTS.ps1` | `87`, `114–119`, `239` | Build TS + sync sang platform. |

---

## 3. Yêu cầu nâng cấp chi tiết

### 3.1. Thêm checkmark cho selected country trong dropdown

**File:** `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts`
**Hàm:** `renderCountryListHTML` (dòng 659)

Hiện tại selected item chỉ có class `is-active` + background xanh nhạt. Cần thêm icon checkmark bên phải mã dial (hoặc bên cạnh tên quốc gia) cho item đang chọn.

Gợi ý implement:
```ts
var checkHtml = c.iso2 === selectedIso2
  ? '<span class="mfp-phone-country-check" aria-hidden="true">✓</span>'
  : '<span class="mfp-phone-country-check" aria-hidden="true"></span>';

var item = '' +
  '<button type="button" class="mfp-phone-country-item' + activeClass + '" data-iso2="' + esc(c.iso2) + '" role="option" aria-selected="' + (c.iso2 === selectedIso2 ? 'true' : 'false') + '">' +
    '<span class="mfp-phone-country-left">' +
      '<span class="mfp-phone-country-flag">' + (props.showFlags ? esc(c.flag) : '🌐') + '</span>' +
      '<span class="mfp-phone-country-name">' + esc(c.name) + '</span>' +
    '</span>' +
    '<span class="mfp-phone-country-right">' +
      '<span class="mfp-phone-country-dial">' + esc(c.dial) + '</span>' +
      checkHtml +
    '</span>' +
  '</button>';
```

Thêm CSS tương ứng trong `Assets/css/plugins/megaform-widget-phone-pro.css`:
```css
.mfp-phone-country-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.mfp-phone-country-check {
  width: 20px;
  text-align: center;
  color: #3f7cff;
  font-weight: 700;
}

.mfp-phone-country-item.is-active .mfp-phone-country-check {
  color: #3f7cff;
}
```

### 3.2. Scroll selected item into view khi mở dropdown

**File:** `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts`
**Hàm:** `openDropdown` (dòng 714)

Sau khi `rerenderCountryList(container)`, tìm item có class `is-active` và scroll vào view:
```ts
var activeItem = state.list.querySelector('.mfp-phone-country-item.is-active');
if (activeItem) {
  setTimeout(function () {
    try { activeItem.scrollIntoView({ block: 'nearest' }); } catch (ex) {}
  }, 0);
}
```

### 3.3. (Tùy chọn) Thay flag emoji bằng SVG sprite

Nếu yêu cầu cờ hiển thị ổn định trên Windows (flag emoji thường render thành ký tự quốc gia):
- Chuẩn bị SVG flags hoặc dùng thư viện như `flag-icons` / `circle-flags`.
- Thay `flag: string` emoji trong `COUNTRIES` thành reference key (vd: `flag: 'gb'`).
- Sửa `render()` và `renderCountryListHTML()` để emit `<img>` hoặc `<span class="fi fi-gb">`.
- Thêm CSS library vào asset bundle hoặc nhúng inline.

**Lưu ý:** Nếu dùng thư viện ngoài, cần cập nhật asset lists ở `loader/index.ts`, `platform-host.ts`, và backend asset injection.

### 3.4. Giữ nguyên behavior hiện có

- `showFlags` toggle trong properties panel phải vẫn hoạt động.
- `separateDialCode` toggle phải vẫn hoạt động.
- Search dropdown, keyboard navigation (ArrowUp/Down/Enter/Escape) phải vẫn hoạt động.
- Validation, collect, hydrate phải không bị ảnh hưởng.

---

## 4. Các bước thực hiện

1. **Sửa TypeScript:**
   - Mở `MegaForm.UI/src/widgets/plugins/megaform-widget-phone-pro.ts`.
   - Chỉnh `renderCountryListHTML()` thêm checkmark cho selected item.
   - Chỉnh `openDropdown()` để scroll selected item into view.

2. **Sửa CSS:**
   - Mở `Assets/css/plugins/megaform-widget-phone-pro.css`.
   - Thêm style cho `.mfp-phone-country-right`, `.mfp-phone-country-check`.
   - Đảm bảo dropdown item vẫn align đẹp khi có/không checkmark.

3. **Build:**
   ```powershell
   .\BuildTS.ps1
   ```
   Hoặc build module phone-pro cụ thể:
   ```bash
   cd MegaForm.UI
   npx tsc -p src/widgets/plugins/tsconfig.json
   ```

4. **Sync sang platform:**
   - `BuildTS.ps1` đã có bước `Verify-SyncedFile` đồng bộ sang DNN/Web/Oqtane.
   - Kiểm tra `Assets/js/plugins/megaform-widget-phone-pro.js` và CSS được copy đến:
     - `MegaForm.Web/wwwroot/megaform/js/plugins/`
     - `MegaForm.DNN/.../js/plugins/`
     - `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/plugins/`

5. **Test:**
   - Mở Builder → thêm Phone widget → click trigger → kiểm tra dropdown.
   - Chọn một quốc gia → đóng dropdown → mở lại → verify selected item có checkmark và được scroll vào view.
   - Test trên Windows (flag emoji có thể bị lỗi).
   - Test error state: nhập số điện thoại sai → blur → border đỏ vẫn hiển thị.

---

## 5. Lưu ý QA / Regression

- **Flag emoji trên Windows:** Nếu cờ hiển thị thành ký tự quốc gia (VD, GB, VN) thay vì cờ, cần triển khai SVG flags.
- **Keyboard navigation:** Sau khi thêm checkmark, đảm bảo `state.items.length` và `state.activeIndex` vẫn khớp.
- **i18n:** Không thêm text hardcoded mới. Checkmark chỉ là icon, không cần dịch.
- **Z-index:** Dropdown `.mfp-phone-dropdown` có `z-index: 30`. Khi mở dropdown, đảm bảo không bị che bởi panel khác của builder.
- **Mobile:** Dropdown width `min(420px, 100%)` — trên mobile chiếm full width, checkmark vẫn phải visible.

---

## 6. Risk / Traps

| Risk | Mitigation |
|------|------------|
| Sửa sai TS build fail | Chạy `npm run typecheck` trong `MegaForm.UI` trước khi deploy. |
| Quên sync asset sang platform | Chạy full `BuildTS.ps1`, không copy tay. |
| Flag emoji bị lỗi trên Windows | Chuẩn bị sẵn kế hoạch SVG flags nếu QA reject. |
| Checkmark làm xê dịch layout | Dùng fixed-width container cho checkmark. |

---

## 7. Acceptance Criteria

- [ ] Dropdown mở ra, selected country có icon ✓ màu xanh.
- [ ] Dropdown tự động scroll đến selected country khi mở.
- [ ] Trigger hiển thị đúng flag + mã dial (hoặc ISO nếu `separateDialCode=false`).
- [ ] Search và keyboard navigation vẫn hoạt động.
- [ ] Validation error state vẫn hiển thị border đỏ.
- [ ] `showFlags=false` thì trigger và dropdown hiển thị 🌐 thay vì cờ.
- [ ] Build + sync thành công, không lỗi TS.
