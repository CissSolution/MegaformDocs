# Đẩy 1 template mới lên Online Gallery

Gallery online = repo GitHub **`CissSolution/megaform-gallery`**, phục vụ qua CDN jsDelivr:

```
https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/manifest.json
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

## 4 bước đẩy lên

### 1. Bỏ file JSON vào thư mục nguồn

```
Samples/FormTemplates/Premium/DONEE/<ten-file>.json
```

Nếu template có ảnh mới → copy ảnh vào `Assets/img/<thư-mục>/`.

### 2. Build lại gallery

```bash
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"

node tools/gallery/build-gallery.mjs ^
  --out "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\megaform-gallery" ^
  --base "https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/"
```

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

### 3. Commit + push repo gallery

```bash
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\megaform-gallery"
git add -A
git commit -m "Add <tên template>"
git push origin main
```

### 4. ⭐ Purge cache jsDelivr — BẮT BUỘC, phải purge **MỌI file đã đổi**

⚠️⚠️ **Bẫy chí mạng (đã dính):** purge `manifest.json` nhưng QUÊN purge một `templates/<slug>.json`
đã đổi → server nhận manifest MỚI (sha256 mới) nhưng CDN trả file CŨ →
**`sha256 mismatch → preview_failed`**, template hiện thumbnail trắng + "Preview is unavailable".

⭐**Purge đúng danh sách = mọi file `git` báo đổi**, KHÔNG chỉ template vừa thêm. Publisher
re-serialize + reorder nên một sửa nhỏ (đổi description/label ở template khác) cũng đổi file đó:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\megaform-gallery"
$changed = git diff --name-only HEAD~1 HEAD          # mọi file commit vừa rồi đổi
foreach ($f in $changed) {
  Invoke-WebRequest "https://purge.jsdelivr.net/gh/CissSolution/megaform-gallery@main/$f" -UseBasicParsing | Out-Null
}
```

Kiểm tra lại — sha256 CDN phải KHỚP manifest (jsDelivr nhiều edge, có thể phải purge lại 1–2 lần):

```powershell
$m = Get-Content manifest.json -Raw | ConvertFrom-Json
foreach ($e in $m.templates) {
  $b = (Invoke-WebRequest "https://cdn.jsdelivr.net/gh/CissSolution/megaform-gallery@main/$($e.file)" -UseBasicParsing).RawContentStream.ToArray()
  $cdn = ([System.Security.Cryptography.SHA256]::Create().ComputeHash($b) | % { $_.ToString('x2') }) -join ''
  if ($cdn -ne $e.sha256) { "MISMATCH: $($e.slug) — purge lại $($e.file)" }
}
```

⭐**Consumer cache manifest trong RAM (`GalleryRepositoryService`, TTL).** Sau khi purge, site đã
chạy vẫn giữ manifest cũ tới khi hết TTL → **restart site** (hoặc gọi `RemoteGalleryList?refresh=true`)
để lấy manifest mới ngay.

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
