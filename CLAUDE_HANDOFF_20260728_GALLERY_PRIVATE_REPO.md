# BÀN GIAO — Gallery repo chuyển PRIVATE (phương án A)

> Commit **`272d738`** `feat(gallery): support a PRIVATE gallery repo without letting the token leak`.
> Code đã xong + 241/241 test; **phần vận hành trên GitHub chưa làm** (cần credential của owner).

## 1. Đã làm (code)

| Thay đổi | File |
|---|---|
| Constructor nhận `accessToken`; đính token **per-request** (`HttpRequestMessage`), KHÔNG `DefaultRequestHeaders` | `MegaForm.Core/Services/GalleryRepo/GalleryRepositoryService.cs` |
| `IsTokenAllowedForUrl()` — allowlist **hard-code** `raw.githubusercontent.com` + `api.github.com`, chỉ https, so khớp **cả host** | ⬆ cùng file |
| `BuildListingUrl()` — thêm nhánh raw → **Git Trees API**; parse cả 2 dạng listing (jsDelivr lồng `files[]`, Trees phẳng `tree[]` chỉ lấy `type=="blob"`) | ⬆ cùng file |
| Đọc token: DNN host setting `MegaForm_GalleryRepoToken` (**GetEncryptedString**), Oqtane `MegaForm:GalleryRepoToken` | `MegaForm.DNN/WebApi/BuilderTemplatesController.cs`, `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` |
| 13 test ghim luật đính token + map listing | `MegaForm.Sdk.Tests/GalleryRepoTokenScopeTests.cs` |

**Mặc định KHÔNG đổi**: `DefaultRepoBaseUrl` vẫn jsDelivr; không cấu hình token ⇒ mọi request y hệt trước.

### ⭐⭐⭐ Vì sao allowlist là bắt buộc (đừng bỏ khi refactor)
Base URL là **admin-configurable**. Nếu đính token theo kiểu "URL khớp base URL đã cấu hình" thì admin site
chỉ cần trỏ setting sang host của họ là **server tự gửi PAT dùng chung** sang đó.
**`SsrfGuard` KHÔNG cứu** — nó chặn loopback/IP nội bộ, còn `attacker.tld` là domain public hợp lệ.
Và `_http` là **static shared** ⇒ set `DefaultRequestHeaders.Authorization` sẽ gửi token tới **mọi** đích.
Test đã ghim cả host đánh lừa kiểu `raw.githubusercontent.com.attacker.example` và `evil-raw.githubusercontent.com`.

## 2. Rate limit — số liệu đo từ code (việc #4 owner giao)

Đếm request thực tế mỗi thao tác (`GalleryInstallService` → `GalleryRepositoryService`):

| Thao tác | Số request GitHub | Ghi chú |
|---|---|---|
| Mở gallery (RemoteGalleryList) | **2** | `manifest.json` + listing (Trees API) |
| Preview 1 template | **1** | `templates/<slug>.json` (manifest lấy từ cache) |
| Install 1 template | **1–2** | template json + `*-assets.zip` nếu có |

Giảm tải sẵn có: cache **TTL 15 phút**, `static ConcurrentDictionary` key theo URL ⇒ dùng chung
toàn app domain, sống qua nhiều request. Nghĩa là **1 site chỉ browse** tốn ~8 req/h (2 req × 4 lần refresh cache).

Hạn mức GitHub API **5 000 req/h tính TRÊN TOKEN** ⇒ dùng chung mọi install:
- ~600 site chỉ browse → vẫn an toàn.
- Rủi ro thật là **install hàng loạt** (mỗi template 1–2 req, không cache vì khác URL) và **`forceRefresh=true`**
  (client gọi `?refresh=true` là bỏ qua cache).
- ⚠️ `raw.githubusercontent.com` có hạn mức **riêng, không công bố**, thấp hơn API — đây đúng là lý do
  comment trong code (dòng ~42) chọn jsDelivr từ đầu: *"raw.githubusercontent is rate-limited and not intended as one [CDN]"*.

**Đề xuất nếu số install lớn**: nâng TTL cache cho manifest/listing (15' → 60'), hoặc chốt phương án B
(CDN riêng) thay vì A. Chưa làm gì trong phiên này.

## 3. 🔴 RỦI RO THỨ TỰ — đọc trước khi bấm "Make private"

Chuyển repo sang private **NGAY** sẽ làm **chết gallery của MỌI install hiện có** (kể cả khách đã mua):
bản họ đang chạy trỏ jsDelivr, không có token, và jsDelivr cũng không serve repo private.

**Thứ tự an toàn:**
1. Tạo PAT + test bằng lệnh ở §5 (repo vẫn public — chỉ để chắc token đọc được).
2. Phát hành bản có `272d738` (đóng gói lại DNN + Oqtane) cho khách.
3. Khách cập nhật + nhập token vào setting.
4. **Chỉ khi đó** mới chuyển repo sang private.

Nếu không kiểm soát được khi nào khách cập nhật: cân nhắc **giữ public** và chỉ chuyển private nhóm
premium (đã bàn ở phương án "tách free vs premium").

## 4. Việc trên GitHub — owner làm (tôi không có credential)

1. Tạo GitHub account bot (vd `megaform-gallery-bot`).
2. Mời làm **Read** collaborator của `CissSolution/megaform-gallery` (đừng dùng account owner).
3. Đăng nhập bot → Settings → Developer settings → **Fine-grained tokens**:
   - Repository access: **Only select repositories** → đúng `megaform-gallery`
   - Permissions → Repository → **Contents: Read-only** (không cần gì khác)
   - Expiration: đặt lịch nhắc rotate.
4. Đổi setting trên từng site:
   - URL: `https://raw.githubusercontent.com/CissSolution/megaform-gallery/main/`
   - Token: DNN host setting `MegaForm_GalleryRepoToken` / Oqtane `MegaForm:GalleryRepoToken`
5. Sau khi tất cả đã cập nhật → repo Settings → **Change visibility → Private**.

## 5. Lệnh verify (chạy sau khi có PAT)

```bash
T=<PAT>
# 1. đọc file raw — kỳ vọng 200 + JSON manifest
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" \
  https://raw.githubusercontent.com/CissSolution/megaform-gallery/main/manifest.json
# 2. listing Trees API — kỳ vọng 200, JSON có "tree":[...]
curl -s -H "Authorization: Bearer $T" -H 'Accept: application/vnd.github+json' \
  'https://api.github.com/repos/CissSolution/megaform-gallery/git/trees/main?recursive=1' | head -c 300
# 3. hạn mức còn lại
curl -s -H "Authorization: Bearer $T" https://api.github.com/rate_limit
```
Sau khi đổi setting trên site: mở builder → Templates → Online gallery, xem list/preview/install.
⚠️ Nhớ bump cache-bust nếu đổi JS; DNN install KHÔNG ghi đè `bin/*.dll` (stop pool + copy tay).

## 6. Giới hạn phải nói với khách/đối tác

Phương án A chỉ đóng được **"người ngoài đọc repo"**. Token nằm trong setting của site khách ⇒ **chính khách
đọc được và clone toàn bộ repo**. Muốn chặn nhóm đó phải có **license key per-customer** — hiện `LicenseService`
mới chỉ có file marker `license.lic="production"` + `Func<bool>` probe, **không có key định danh** để CDN/Worker
xác thực. Đó là điều kiện tiên quyết của phương án B, và là phần việc lớn nhất (audit của Codex đánh giá thấp chỗ này).

## 7. Việc khác còn treo (nối tiếp handoff trước)

Xem `CLAUDE_HANDOFF_20260728_PHONE_COMPOSITE_AND_AI_ALIAS.md`:
1. 🔴 `2619211` (AI tạo form ra `CompositePhone`) — **chưa verify runtime, chưa vào gói**.
2. 🔴 48 file `.cs` chưa bao giờ `git add` ⇒ clean checkout không build được ở tầng host.
3. Oqtane chưa build lại; `pack` báo `THAT BAI: unified-monaco`.
4. ⚠️ `token.txt` ở root repo **vẫn chưa gitignore** (đã ghi trong memory từ 07-24).
