# Handout: Fix Action Icons + Design Mode Issues

## NgườI thực hiện
- Session: 2026-06-09
- Status: Code edited — NEEDS BUILD + VISUAL QA

---

## A/ Action Icons trong Row/Column

### Vấn đề
- Row field chỉ có 1 action `remove-from-row` (icon ×) + `field-type-badge` ở top-right
- Mock hiển thị đẹp: drag handle trái + duplicate/delete phải, giống normal field
- Cần làm row field giống normal field

### Files đã sửa

#### 1. `MegaForm.UI/src/builder/canvas.ts`
- **Lines ~1874-1896**: Thay HTML row field
  - Bỏ `mf-field-type-badge`
  - Thay `mf-row-remove-field` → `mf-duplicate-field` + `mf-delete-field`
  - Thêm `data-row-index`, `data-col-index`, `data-field-index` vào buttons
- **Event listener**: Xử lý duplicate/delete thay vì remove-from-row
- **Lines ~2397-2430**: Thêm 2 functions mới
  - `duplicateRowField(rowIndex, colIndex, fieldIndex)`
  - `deleteRowField(rowIndex, colIndex, fieldIndex)`
- **Line ~3150**: Export trong `registerModule('canvas', {...})`

#### 2. `MegaForm.UI/src/styles/megaform-builder-ts.css`
- **Lines ~608-626**: Cập nhật comment + bỏ `.mf-field-type-badge` CSS

---

## B/ Design Mode — Preset CSS làm form xô lệch

### Vấn đề
- Apply preset (Sunset, Ocean...) trong Design mode → form trong iframe bị margin-right: -16px
- Nguyên nhân: `.mf-form-wrapper` có `width:100% !important` + `padding:12px 8px !important` nhưng thiếu `box-sizing:border-box`
→ content-box làm total width = 100% + 16px > parent width

### File đã sửa

#### `MegaForm.UI/src/builder/canvas.ts`
- **Line ~484**: Thêm `box-sizing:border-box !important;` vào inline iframe CSS:
```css
.mf-form-wrapper{...;box-sizing:border-box !important;}
```

---

## B/ Design Mode — Không scroll up được đầu form

### Vấn đề
- Chuyển sang Design mode → đầu form bị che hoặc không scroll lên được
- Cần test sau khi build để xác định còn lỗi hay không
- Nghi ngờ liên quan đến iframe positioning (y=200.5px) hoặc overflow behavior

---

## Các bước còn lại

1. **Build MegaForm.UI**
   ```bash
   cd MegaForm.UI
   npm run build:builder
   ```
   Hoặc build toàn bộ: `npm run build`

2. **Copy CSS (nếu build không tự copy)**
   - Verify `Assets/css/megaform-builder-ts.css` được cập nhật

3. **Visual QA trên Oqtane**
   - Login host/Minh@2002
   - Vào builder form có row/column (e.g. Proposal Starter formId=4)
   - Check action icons của row field: drag handle trái, duplicate/delete phải
   - Switch Design mode → scroll up/down → verify đầu form hiển thị
   - Apply preset Sunset/Ocean → verify form không bị xô lệch

4. **Nếu scroll issue vẫn còn**
   - Kiểm tra `mf-panel-center` overflow behavior
   - Kiểm tra iframe `min-height` vs actual content height
   - Xem xét thêm `scroll-behavior: smooth` hoặc điều chỉnh iframe top margin

---

## Commit message gợi ý
```
[B83x] Fix row-field action icons + design-mode preset layout shift

- Row fields now show duplicate/delete icons matching normal fields
- Removed field-type-badge from row fields to prevent layout clutter
- Added box-sizing:border-box to iframe form wrapper preventing -16px margin
- Added duplicateRowField/deleteRowField handlers in canvas.ts
```
