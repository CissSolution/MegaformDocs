# Đẩy 1 template mới lên Online Gallery

Gallery online = repo GitHub **`CissSolution/megaform-gallery`**, phục vụ qua **GitHub Pages**:

```
https://CissSolution.github.io/megaform-gallery/manifest.json
```

Module KHÔNG bao giờ gọi thẳng GitHub từ trình duyệt — server tải, verify sha256 rồi mới lưu.

---

## Chuẩn bị: template phải đạt 3 điều kiện

Publisher sẽ **từ chối** template nếu thiếu bất kỳ điều nào:

1. **`slug` hợp lệ + duy nhất** — `^[a-z0-9][a-z0-9-]{0,79}$`. Trùng slug với template đã có →
   bị bỏ qua (báo rõ trong log). ⚠️ Đây là lỗi hay gặp nhất: copy file cũ rồi quên đổi slug.
2. **`fields` là mảng, không rỗng.**
3. **Ảnh phải CÓ THẬT trong `Assets/img/`.** Template trỏ tới ảnh không tồn tại sẽ bị từ chối —
   publish ra sẽ là một thiết kế có hero chết.

Nên có thêm: `title`, `description`, `category`, `version`.

### Đường dẫn ảnh
Template tham chiếu ảnh bằng URL tuyệt đối. Viết theo **kiểu nào cũng được**:

```
/Modules/MegaForm/img/<thư-mục>/<file>            (Oqtane / Web / Umbraco)
/DesktopModules/MegaForm/Assets/img/<thư-mục>/<file>   (DNN)
```

Publisher quy về một khoá chung khi đóng gói ảnh, và client tự đổi sang đúng nền lúc render
(`@shared/module-asset-url.ts`). File ảnh gốc luôn đặt ở **`Assets/img/`** của solution.

---

## Các bước đẩy lên

### 1. Bỏ file JSON vào thư mục nguồn

```
Samples/FormTemplates/Premium/DONEE/<ten-file>.json
```

Nếu template có ảnh mới → copy ảnh vào `Assets/img/<thư-mục>/`.

### 2. Chạy publish — 1 lệnh

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
.\tools\gallery\Publish-Gallery.ps1 -Message "Add <tên template>"
```

Script chạy tuần tự: kiểm remote của clone → `pull --ff-only` → build → **chặn nếu số template
giảm** (thêm `-Force` nếu đúng là xoá có chủ đích) → commit → push → chờ tới khi manifest **live**
khớp đúng bản vừa build rồi mới báo xong. Muốn xem trước mà chưa đẩy: thêm `-WhatIfOnly`.

⚠️ Trên máy có **hai** clone gallery và ngày 01/08 **cả hai đều tụt lại sau origin** (44 và 35
template, origin 47). Chạy `build-gallery.mjs` tay từ một clone cũ = **xoá ngược** template khỏi
gallery. Script tự `pull` trước và tự chặn khi số template giảm — đó là lý do nó tồn tại.

Đọc kỹ output — nó nói thẳng cái gì bị bỏ và vì sao:

```
templates : 38
verified  : 38/38 (sha256 + size)
skipped   : 4
  - azure-contact-request.json (missing artwork (azure-contact-request/hero.jpg) …)
artwork   : 13 images bundled (14.96 MB moved OUT of the package)
nuspec    : UPDATED Oqtane exclusions (13 image pattern(s))
```

Lệnh này đồng thời:
- ghi `tools/gallery/gallery-exclude.json` (packaging 2 nền đọc file này),
- cập nhật `exclude=` trong `MegaForm.Oqtane.nuspec` để package không ship lại ảnh đã lên gallery.

⚠️ **Nếu build báo `FAILED`** thì repo sinh ra KHÔNG cài được — sửa rồi chạy lại, đừng push.

### 3. Không còn bước purge

`[PagesOverCdn v20260801]` Gallery phục vụ từ **GitHub Pages**
(`https://CissSolution.github.io/megaform-gallery/`), push xong Pages tự deploy, `max-age=600`.
Không có gì để purge và không có gì phải chờ ngoài 10 phút cache.

Trước đây phục vụ qua jsDelivr `@main` và bước purge là bắt buộc. Bỏ vì nó **không đủ**: purge chỉ
dọn cache **file**, còn **data-API listing** (`data.jsdelivr.com/v1/packages/gh/…`) không purge
được — ngày 01/08 nó đứng im ở ảnh chụp commit `dc53e2a` **6 ngày tuổi** và làm `GalleryRepositoryService`
âm thầm **ẩn 7 template đã publish**, trong đó 4 cái ẩn từ 26–27/07 mà không ai biết. Ref nhánh trên
jsDelivr không dùng được cho gallery hay đổi; ref theo commit thì luôn đúng.

⭐ Hostname Pages **phân biệt hoa/thường**: `CissSolution.github.io` chạy, `cissolution.github.io`
trả 404.

⭐**Consumer cache manifest trong RAM (`GalleryRepositoryService`, TTL 15 phút).** Site đang chạy
vẫn giữ manifest cũ tới khi hết TTL → **restart site** (hoặc gọi `RemoteGalleryList?refresh=true`)
để lấy ngay.

⚠️ Site nào **đã lưu** URL jsDelivr trong setting thì vẫn dùng URL đó (mặc định mới chỉ áp dụng khi
setting trống) — ở đó việc hiển thị đủ template dựa vào bản vá `[StaleListing v20260801]`, cần DLL
`MegaForm.Core` mới.

---

## Nếu template mới cũng cần vào package (bundled starter)

Mặc định template mới **chỉ nằm trên gallery**. Muốn nó ship kèm module:

1. Thêm slug vào `BUNDLED_SLUGS` trong `tools/gallery/build-gallery.mjs`.
2. Chạy lại `build-gallery.mjs` (nó sinh `bundledFiles` — packaging dùng danh sách này).
3. `node tools/gallery/sync-bundled-templates.mjs` (đưa vào payload Oqtane; `pack.cmd` tự gọi).

⚠️ Chọn template **không có ảnh** làm bundled starter, nếu không package phình theo.

---

## Nếu template là premium có KB guide cho AI

Thêm 1 dòng INSERT vào `MegaForm.Core/Seed/ai-knowledge-template-guides.sql`
(⚠️ file này bị `.gitignore` bởi `*.sql` → phải `git add -f`), rồi:

```bash
node MegaForm.UI/tools/gen-template-facts.cjs
node MegaForm.UI/tools/verify-package-complete.cjs   # phải PASS, nếu không pack.cmd sẽ chặn
```

---

## Ai xem được template mới?

| | Trial (chưa có license) | Đã kích hoạt license |
|---|---|---|
| Thấy trong tab Online | ✅ | ✅ |
| Xem thumbnail + preview | ✅ | ✅ |
| Cài về site | ❌ 402 + CTA nâng cấp | ✅ |

Gate nằm ở server (`RemoteGalleryInstall`), không phải ở client.
