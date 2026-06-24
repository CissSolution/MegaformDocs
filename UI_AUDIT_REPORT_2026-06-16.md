# Báo cáo kiểm thử UI/UX – MegaForm Builder trên Oqtane

> Ngày kiểm thử: 2026-06-16  
> Môi trường: http://localhost:5070 (Oqtane)  
> Tài khoản: host / Minh@2002  
> Trình duyệt: Playwright Chromium  
> Ngưởi thực hiện: Kiểm thử viên (vai trò ngưởi dùng cuối)

## Tóm tắt nhanh

Sau khi đăng nhập và tạo form mới, MegaForm Builder hiển thị được giao diện cơ bản với 3 cột (widget palette – canvas – design studio). Tuy nhiên, có **7 nhóm vấn đề nghiêm trọng** cần dev xử lý trước khi đưa ra ngưởi dùng thật:

1. **Giao diện bị lồng 2 thanh header Oqtane** (lãng phí không gian, rối mắt).
2. **Blazor Server / SignalR không kết nối được** – reconnect modal chặn tương tác.
3. **Hydration mismatch + locale error** trong admin panel (React/Next.js).
4. **UX tạo form trống (Start Blank) chưa rõ ràng** – nút Use bị disabled.
5. **Inline-edit label làm panel setting không phản hồi** – cần nhấn Escape.
6. **Nút Windowed che nội dung panel phải**.
7. **Preview form hiển thị toàn bộ trang Oqtane**, ngưởi dùng phải scroll tìm form.

---

## 1. Double Oqtane Header

### Mô tả
- MegaForm panel được nhúng vào trang Oqtane hiện tại, nhưng lại render thêm một thanh navigation Oqtane thứ hai bên trong panel.
- Kết quả: ngưởi dùng nhìn thấy **2 logo Oqtane + 2 bộ menu Home/Private/My Page/Designs…** chồng lên nhau.

### Ảnh minh họa
- `dashboard_full.png`: thanh Oqtane thứ hai xuất hiện ngay phía trên MegaForm dashboard.
- `builder_blank_form.png`: hiện tượng tương tự trong builder.

### Mức độ nghiêm trọng
🔴 Cao

### Đề xuất
- Loại bỏ header Oqtane bên trong MegaForm panel khi đang chạy trong Oqtane iframe/host.
- Chỉ giữ lại MegaForm toolbar (`Settings | Form Builder | Form Dashboard`) và left/right panels.

---

## 2. Blazor Server / SignalR Connection Refused

### Mô tả
- Khi mở builder, Blazor không thể thương lượng kết nối SignalR:
  ```
  ERR_CONNECTION_REFUSED @ http://localhost:5070/_blazor/negotiate?negotiateVersion=1
  Failed to complete negotiation with the server: TypeError: Failed to fetch
  Failed to start the connection
  ```
- Kết quả: `<div id="components-reconnect-modal">` xuất hiện che phủ toàn bộ panel.
- Ngưởi dùng không thể click widget, không thể kéo thả field; Playwright báo lỗi `components-reconnect-modal intercepts pointer events`.

### Console log liên quan
```
[ERROR] Error: Connection disconnected with error 'Error: WebSocket closed with status code: 1006 (no reason given).' @ blazor.web.js
[ERROR] Failed to load resource: net::ERR_CONNECTION_REFUSED @ /_blazor/negotiate?negotiateVersion=1
```

### Mức độ nghiêm trọng
🔴 Cao (blocker)

### Đề xuất
- Kiểm tra Blazor Server endpoint `/_blazor` có được Oqtane route đúng không.
- Đảm bảo SignalR hub chạy cùng port với Oqtane (localhost:5070).
- Cấu hình lại reconnection: hiển thị thông báo thân thiện + retry limit thay vì modal vô hạn định.

---

## 3. React Hydration Mismatch trong MegaForm Admin

### Mô tả
- Tab MegaForm Admin (localhost:3000/submissions) bị lỗi hydration do số liệu hiển thị khác nhau giữa server và client:
  - Server render: `1.203`
  - Client render: `1,203`
- Nguyên nhân: locale/number format không đồng nhất.

### Console log
```
Error: Hydration failed because the server rendered text didn't match the client.
+ 1,203
- 1.203
```

### Mức độ nghiêm trọng
🟡 Trung bình (không block nhưng gây warning, có thể ảnh hưởng render).

### Đề xuất
- Chuẩn hóa locale trên server và client (ví dụ luôn dùng `en-US` hoặc `toLocaleString` với locale cố định).
- Hoặc render số liệu phía client sau hydration.

---

## 4. UX tạo form trống (Start Blank) chưa rõ ràng

### Mô tả
- Màn hình chọn template hiển thị card **Start Blank** và nút **Use This Template →**.
- Khi chọn Start Blank, nút **Use This Template bị disabled** – ngưởi dùng không biết phải làm gì tiếp.
- Chỉ khi hover/chọn template có sẵn (Corporate Contact…) thì nút Use inline mới hiện ra.

### Ảnh minh họa
- `builder_after_refresh.png`: Start Blank được chọn, nút Use This Template disabled.
- `builder_corporate_opened.png`: builder mở từ template Corporate Contact.

### Mức độ nghiêm trọng
🟡 Trung bình

### Đề xuất
- Khi chọn Start Blank, nút Use This Template phải **enabled** ngay.
- Hoặc đơn giản hóa: double-click card Start Blank để tạo form trống.
- Hiển thị trạng thái selected rõ ràng hơn cho card đang chọn.

---

## 5. Inline-edit label làm Setting Pane không phản hồi

### Mô tả
- Khi click vào label field (ví dụ “Work Email”), field chuyển sang chế độ inline-edit label (input highlight xanh).
- Trong trạng thái này, click vào **Field Properties** hoặc các accordion (General/Validation/Conditional Logic) **không mở panel**.
- Ngưởi dùng phải nhấn **Escape** để thoát inline-edit, sau đó panel mới hiển thị đúng.

### Ảnh minh họa
- `builder_work_email_selected.png`: label đang ở inline-edit, Field Properties chưa mở.
- `builder_after_escape.png`: sau khi nhấn Escape, Field Properties expand đầy đủ.

### Mức độ nghiêm trọng
🟡 Trung bình

### Đề xuất
- Khi đang inline-edit label, click vào setting pane bên phải nên tự động thoát inline-edit và mở panel tương ứng.
- Hoặc giảm vùng click trigger inline-edit (chỉ click đúng vào text label, không phải toàn bộ field).

---

## 6. Nút “Windowed” che nội dung panel phải

### Mô tả
- Nút “Windowed” nổi ở góc dưới bên phải, đè lên nội dung **Field Properties / Form Settings / Custom HTML**.
- Khi panel dài, nút này che mất phần HELP TEXT và các control ở dưới cùng.

### Ảnh minh họa
- `builder_general_expanded.png`: nút Windowed đè lên vùng HELP TEXT.

### Mức độ nghiêm trọng
🟡 Trung bình

### Đề xuất
- Đặt nút Windowed vào toolbar trên cùng hoặc góc ngoài panel.
- Thêm padding-bottom cho panel để nội dung không bị che.

---

## 7. Preview form hiển thị toàn bộ trang Oqtane

### Mô tả
- Click nút Preview mở modal “Preview – Form #9”.
- Modal render **toàn bộ trang Oqtane** (header, hero section, stats, …) thay vì chỉ hiển thị form.
- Ngưởi dùng phải scroll xuống rất nhiều mới tìm thấy form.

### Ảnh minh họa
- `builder_preview.png`: modal preview chỉ hiện hero section của trang Oqtane, chưa thấy form.

### Mức độ nghiêm trọng
🟡 Trung bình

### Đề xuất
- Preview nên tự động scroll đến vị trí form hoặc hiển thị form ở trung tâm modal.
- Cung cấp tùy chọn “Preview form only” / “Preview on page”.

---

## 8. Resource 404 – Font từ CISS.SideMenu

### Mô tả
- Console báo lỗi 404 với font `.woff2` từ `/Modules/CISS.SideMenu/OqtaneTemplates/media/...`.
- Lỗi lặp lại nhiều lần, gây nhiễu console.

### Mức độ nghiêm trọng
🟢 Thấp (chỉ là warning tài nguyên).

### Đề xuất
- Kiểm tra đường dẫn static file trong Oqtane.
- Cung cấp fallback font hoặc xóa reference nếu font không còn dùng.

---

## Điểm tích cực

- Giao diện builder 3 cột rõ ràng, widget palette trực quan với icon.
- Field Properties panel (sau khi thoát inline-edit) hiển thị đầy đủ: Field Key, Label, Placeholder, Help Text, Validation, Conditional Logic.
- Template gallery đẹp, có phân loại All/General/Healthcare/HR/Reports.
- Preview modal có nút “Open in new tab” tiện lợi.

---

## Tiến độ kiểm thử

| Bước | Trạng thái |
|------|------------|
| Đăng nhập localhost:5070 | ✅ Hoàn thành |
| Mở Form Management Dashboard | ✅ Hoàn thành |
| Tạo form mới / Start Blank | ✅ Hoàn thành (qua template Corporate Contact do Start Blank bị disable) |
| Kiểm tra widget & Field Properties | ✅ Hoàn thành |
| Kiểm tra Setting Pane (General/Validation/Conditional) | ✅ Hoàn thành (General đã mở) |
| Kiểm tra Live Preview | ✅ Hoàn thành |
| Viết báo cáo | ✅ Hoàn thành |

---

## Yêu cầu ưu tiên cho dev

1. **Fix kết nối Blazor Server / SignalR** (blocker).
2. **Loại bỏ double Oqtane header** trong MegaForm panel.
3. **Fix hydration mismatch** trong admin panel.
4. **Fix Start Blank UX** – nút Use This Template phải enabled.
5. **Sửa inline-edit behavior** để setting pane phản hồi ngay.
6. **Điều chỉnh vị trí nút Windowed** hoặc thêm padding panel.
7. **Cải thiện preview** – focus vào form thay vì hiển thị toàn trang.

---

*Kết thúc kiểm thử. Cần dev xử lý các issue trên trước khi test lại kéo thả widget và validation chi tiết.*
