# Đổi bộ ngôn ngữ gói MegaForm — bỏ vi/ru, thêm Urdu (owner chốt 2026-08-13)

> Viết để phiên sau **bắt tay được ngay**, không phải khảo sát lại.
> Mọi con số dưới đây là **đo thật** trên repo ngày 2026-08-13, không phải ước lượng.
> Trạng thái: **CHƯA ĐỘNG VÀO FILE NÀO.**

---

## 1. Đề bài

**Bỏ khỏi gói:** tiếng Việt (`vi-VN`), tiếng Nga (`ru-RU`).
**Phải có:** Dutch, Urdu, Spanish, English (British), French, Italian.

## 2. Đo trước — quy mô NHỎ hơn đề bài nghe có vẻ

| ngôn ngữ owner yêu cầu | mã | trạng thái |
|---|---|---|
| Dutch (Nederlands) | `nl-NL` | ✅ **đã ship** — 1967 khoá |
| Spanish | `es-ES` | ✅ **đã ship** — 1877 khoá |
| English (British) | `en-GB` | ✅ **đã ship** — 1877 khoá |
| French | `fr-FR` | ✅ **đã ship** — 1877 khoá |
| Italian | `it-IT` | ✅ **đã ship** — 1967 khoá |
| **Urdu** | `ur` (hoặc `ur-PK`) | 🔴 **CHƯA CÓ** — phải tạo mới |

Thư mục i18n hiện có **39 locale**. `vi-VN` và `ru-RU` đều đang có mặt.

⇒ Việc thực chất chỉ còn **2 phần**: (A) gỡ 2 locale, (B) tạo Urdu.

---

## 3. (A) Gỡ `vi-VN` + `ru-RU` — KHÔNG chỉ là xoá JSON

### 3.1 JSON nhân bản 4 nơi trong `Assets/` (nguồn canonical)

```
Assets/js/builder/i18n/{vi-VN,ru-RU}.json      ← ⭐ bản Oqtane THỰC SỰ dùng
Assets/js/bundles/i18n/{vi-VN,ru-RU}.json
Assets/js/i18n/{vi-VN,ru-RU}.json
Assets/js/plugins/i18n/{vi-VN,ru-RU}.json
```

⚠️ **`sync-platforms` KHÔNG copy JSON i18n** (bẫy đã ghi trong memory) ⇒ phải xoá tay từng nơi,
đừng trông chờ script đồng bộ.

Còn bản sao ở `DesktopModules/`, `dist/pack/`, `local-packages/` — **là output build, không phải
nguồn**; xoá nguồn rồi build lại là sạch, không cần đụng tay.

### 3.2 ⭐ Chỉ `js/builder/i18n` mới thực sự ship trên Oqtane

`tools/gallery/build-gallery.mjs` ghi thẳng vào `.nuspec` phần exclude:

```
**\js\i18n\**  ·  **\js\bundles\i18n\**  ·  **\js\plugins\i18n\**
```

Ba thư mục kia là **bản sao thừa** (mỗi bản 3,8 MB, 39 locale) đã bị loại khỏi gói Oqtane. Oqtane
phục vụ locale **chỉ từ `js/builder/i18n`** (endpoint `i18n/list` + `i18n/Get` đọc
`WebRootPath\Modules\MegaForm\js\builder\i18n`). DNN thì đọc `Assets\js\i18n` — nên **vẫn phải xoá
đủ 4 nơi**, đừng chỉ xoá 1.

### 3.3 🔴 `vi-VN` bị HARDCODE trong 8 file nguồn — xoá JSON thôi là hỏng

Xoá JSON mà quên mấy chỗ này ⇒ danh sách ngôn ngữ **vẫn hiện tiếng Việt**, chọn vào thì 404/rỗng:

```
MegaForm.UI/src/i18n/index.ts
MegaForm.UI/src/languages/index.ts
MegaForm.UI/src/builder/country-part-settings.ts
MegaForm.UI/src/renderer/country-picker.ts
MegaForm.UI/src/renderer/helpers.ts
MegaForm.UI/src/widgets/plugins/megaform-widget-calculator.ts
MegaForm.UI/tools/i18n-check.cjs
MegaForm.UI/tools/ie-i18n-add.cjs
```

Cách rà: `grep -rn "vi-VN\|ru-RU" MegaForm.UI/src MegaForm.UI/tools` rồi xử lý **từng chỗ theo ngữ
cảnh** — có chỗ là danh sách locale, có chỗ là bảng định dạng số/ngày, có chỗ là danh sách quốc gia.
**Đừng sed mù toàn repo.**

⚠️ Quy tắc repo (memory `feedback_no_hardcoded_vietnamese_i18n`): UI dùng `T()/wt()` với **English
fallback**, bản dịch nằm trong JSON. Nên gỡ `vi-VN.json` KHÔNG làm mất chữ — chỉ rơi về tiếng Anh.
Nhưng phải kiểm: có chuỗi tiếng Việt nào bị hardcode thẳng trong TS không (`npm run i18n:litlint`).

---

## 4. (B) Thêm Urdu — ~1877 khoá, RTL

1. **Nền:** nhân bản `Assets/js/builder/i18n/en-US.json` → `ur.json` (giữ nguyên toàn bộ khoá).
2. **Dịch** 1877 khoá sang Urdu (اردو).
3. **RTL:** đã có tiền lệ — `ar-SA.json` (Arabic) trong cùng thư mục. Mở nó xem cách khai hướng
   văn bản và **làm y hệt**, đừng tự nghĩ cơ chế mới.
4. Chép sang đủ 4 thư mục i18n như §3.1 (hoặc chỉ `js/builder/i18n` nếu chỉ nhắm Oqtane — nhưng
   DNN sẽ thiếu, xem §3.2).
5. Chọn mã: `ur` hay `ur-PK`. Bản Oqtane framework owner dẫn dùng nhãn "Urdu Translation" —
   **kiểm mã locale mà Oqtane framework pack dùng rồi khớp theo**, để danh sách ngôn ngữ của site và
   của MegaForm không lệch nhau.

---

## 5. Thứ tự chạy (một mạch)

```bash
# 0. mốc trước khi sửa
cd MegaForm.UI && npm run i18n:check          # ghi lại số khoá/locale hiện tại

# 1. gỡ vi/ru: 4 thư mục Assets + rà 8 file TS (§3.1, §3.3)
# 2. thêm ur.json (§4)

# 3. cổng chất lượng — cả hai phải XANH
npm run i18n:check
npm run i18n:litlint

# 4. build lại bundle (i18n nằm trong entry riêng)
npm run build:i18n
npm run build:languages

# 5. bump ModuleInfo.Version rồi pack (Oqtane KHÔNG thay DLL nếu số không tăng)
#    pack.cmd cần CRLF — dùng _packrun_crlf.cmd như các lần trước
# 6. cài lên site QA rồi kiểm bằng mắt
```

## 6. Nghiệm thu (đừng tin "xong" nếu chưa có)

- `i18n/list` **không còn** `vi-VN`/`ru-RU`, **có** `ur`.
- Chọn từng ngôn ngữ trong 6 ngôn ngữ owner yêu cầu ⇒ UI đổi chữ thật, không rơi về tiếng Anh.
- Urdu hiển thị **phải RTL** (so với `ar-SA` để đối chiếu).
- Không còn chuỗi tiếng Việt nào trong UI (`i18n:litlint` xanh).
- Gói build ra: `js/builder/i18n` có `ur.json`, không có `vi-VN.json`/`ru-RU.json`.

## 7. Bối cảnh site QA đang chạy

```
http://localhost:5131   ·   MegaForm 2.0.27   ·   DB Oqtane_MegaForm_KB20812
host / abc@ABC1024      ·   site dir: E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.KB20812
```

Tự QA bằng trình duyệt **không cần MCP**: `playwright` có sẵn trong `node_modules` của repo —
xem `tools/browser-qa/_tmp-oq-pane-recursive.mjs` (đăng nhập + duyệt link + đo DOM) làm mẫu.

## 8. Việc khác còn treo (không thuộc i18n, đừng quên)

- 3 tab **Data / Templates / Settings** của admin pane vẫn là **placeholder** — nguồn dữ liệu cho
  từng tab đã ghi ở `CLAUDE_HANDOFF_20260812_KB_PER_TEMPLATE_FROM_GALLERY.md` §11.7.
- **`Add To Page` chưa bấm thật lần nào** (endpoint `PinToNewPage` đã có, build sạch).
- Nút **Close** của các surface đã trỏ đúng về pane, nhưng **nhãn vẫn là "Close"** — đổi thành
  "Return to MegaForm" phải sửa bundle TS `megaform-submissions.js`.
- Owner còn hỏi chưa trả lời: **"Add To Page → add to current page"** nghĩa là chọn trang có sẵn từ
  danh sách phải không?
