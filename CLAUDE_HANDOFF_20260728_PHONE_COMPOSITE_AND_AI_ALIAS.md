# BÀN GIAO — phiên 2026-07-28 (chiều/tối): permission P0, cờ điện thoại, composite alias

> Branch `feature/typed-submission-storage-core`. 5 commit mới, **KHÔNG push**.
> Đọc kèm: `CLAUDE_HANDOFF_20260728_PERMISSION_MATRIX_VERIFICATION.md` (§G).

## 0. Commit của phiên này

| Commit | Nội dung | Trạng thái |
|---|---|---|
| `7ae03ed` | 🔴**P0**: đóng lỗ hổng export ẩn danh toàn bộ submission (4 host) + 3 file Core mà `2dd59b3` còn thiếu | ✅ build 4 target + 202 test, verify từ worktree SẠCH |
| `e52e125` | Audit doc: đánh dấu finding đã đóng + ghi nợ 48 file untracked | ✅ |
| `43f7f76` | Cờ điện thoại 404 trên DNN (`FlagHtml` hardcode root Oqtane) | ✅ verify runtime trên megademo.ai |
| `5491ebb` | Builder preview composite hiện `+1`/`US` thay vì cờ | ✅ verify runtime |
| `a4d40d1` | Cờ mặc định theo **ngôn ngữ form** + UI **Allowed countries** | ✅ verify runtime |
| `2619211` | AI tạo form → field `CompositePhone` ra "plugin not installed" | ⚠️ **CHƯA verify runtime** |

**Gói đã đóng lại 3 lần** (lần cuối 13:2x): `MegaForm.DNN/Install/MegaForm_02.00.006_Install.zip`
(Production) + `..._Trial_Install.zip`, ~14 979 KB. Gói cũ backup `*.prev-20260728.zip`.
⚠️ Gói **chưa chứa** `2619211` (đóng trước commit đó) → xem §1.

---

## 1. 🔴 VIỆC ĐANG DỞ — `2619211` chưa verify + chưa vào gói

### Bug
AI tạo form → field lưu `{"type":"CompositePhone"}` **không có preset** → renderer không có case
→ vẽ hộp vàng *Widget "CompositePhone" — plugin not installed*.
**Dữ liệu thật đã xác minh**: `megademo.ai` form **37** ("Health Check Appointment"),
field key `phone`, `type: "CompositePhone"`, `preset: (none)`.

### Vì sao xảy ra
`CompositePhone` là **tên tile của palette**, hợp lệ. Mọi đường GHI đều rewrite nó thành
`{type:'Composite', widgetProps.preset}` — nhưng **studio apply thẳng schema JSON của AI**
(`ai-form-creator.ts:1643` có `normalizeCompositeFieldsDeep`, đường khác thì không) nên tên tile sống sót.

### Đã sửa (fix ở đường ĐỌC, không thêm rewrite lúc ghi ⇒ form đã lưu tự chạy đúng, không cần migrate DB)
- `MegaForm.UI/src/renderer/field-type-semantics.ts` — `canonicalizeFieldType`: `Composite<Tile>` → `Composite`
- `MegaForm.Core/.../SubmissionFieldTypeSemantics.cs` — `Canonicalize` y hệt + hàm mới `CompositePresetFromAlias`
  (tách hậu tố PascalCase: `CompositeNamePlus` → `name_plus`)
- `MegaForm.UI/src/renderer/helpers.ts` — thêm `compositePresetFor(field)` (dùng lại `compositeAliasToPresetMap()`)
- `MegaForm.UI/src/renderer/inputs.ts` — dùng `compositePresetFor`
- `MegaForm.Core/Services/FormHtmlRenderer.cs` — `CompositePreset()` fallback theo alias
- `MegaForm.Sdk.Tests/CompositeAliasTests.cs` — 18 case ghim cặp alias→preset khớp client

**220/220 test PASS, Core build 0 error.**

### ⚠️ CHƯA LÀM — phiên sau bắt đầu từ đây
1. **Verify runtime**. Lần đo cuối vẫn thấy placeholder (13 phần tử) và `data-type="CompositePhone"`
   — **KHÔNG phải fix sai**: trang form là **SSR do DLL trên site sinh ra**, mà site đang chạy DLL cũ.
   Cách verify:
   - Nhanh: stop app pool `DNN_MegaDemo` → copy `MegaForm.Core.dll` + `MegaForm.DNN.dll` (Release) vào
     `E:\DNN_SITES\DNN_MegaDemo\Website\bin\` → start pool → mở `?formid=37`.
     ⭐ Nhớ bẫy: **DNN install KHÔNG ghi đè `bin/*.dll`** → phải stop pool + copy tay.
   - Hoặc: cài gói mới rồi mở form 37.
   - Kỳ vọng: hết hộp vàng, hiện country picker + Area/Phone/Ext, cờ theo ngôn ngữ.
2. **Đóng gói LẠI** (gói hiện tại chưa có `2619211`):
   `BuildPackage-DNN.ps1 -BuildDotNet -Configuration Release -NoPause` rồi thêm `-Trial`.
3. Cân nhắc: có nên **sửa luôn đường GHI** của AI (dạy model chỉ emit `Composite`+preset, hoặc normalise
   ở server khi lưu) — hiện fix đọc đã đủ để không hỏng, nhưng schema vẫn lưu tên tile.

---

## 2. Kiến thức đắt giá của phiên (đừng phải học lại)

### Cờ / country picker
- ⭐⭐⭐ Đường dẫn cờ đúng trên DNN: `/DesktopModules/MegaForm/**Assets**/img/flags/4x3/` — thiếu `Assets` cũng **404**.
  Oqtane/Web/Umbraco: `/Modules/MegaForm/img/`. Core mặc định Oqtane, DNN set qua
  `FormHtmlRenderer.ModuleImageBase` trong `DnnServiceLocator`.
- ⭐⭐⭐ **Windows KHÔNG có glyph emoji cờ quốc gia** → `🇺🇸` render thành chữ **"US"**. Đừng dùng emoji cờ
  trong UI; dùng `<img>` SVG (`previewFlagHtml()`).
- ⭐ QA ảnh hỏng: `onerror` đã stamp `is-missing` ⇒ 404 THẬT (không phải false-negative của `loading="lazy"`).
- ⭐⭐ `allowed` (giới hạn danh sách nước) **vốn đã có engine đủ 2 phía** từ `[B216 lazy-flags]` — chỉ thiếu UI.
  Kiểm tra engine trước khi định viết mới.

### i18n — 3 tầng bẫy
1. Nguồn thật = **`MegaForm.UI/public/i18n/*.json`**. `Assets/js/i18n/` là **OUTPUT** (`build:i18n` ghi đè).
2. Builder đọc locale từ **`js/builder/i18n/`** (xem `resolveI18nBase()`); còn `js/bundles/i18n`,
   `js/plugins/i18n`. Chạy `node MegaForm.UI/tools/i18n-sync-platforms.cjs` → đồng bộ **9 thư mục**.
3. Runtime nạp catalog qua **API `/API/i18n/Get?id=xx`**, không phải file tĩnh ⇒ site cũ vẫn hiện tiếng Anh
   tới khi cache/gói mới.

### Build / deploy
- ⭐⭐ **`Assets/js/` bị `.gitignore`** (dòng 85) ⇒ bundle không vào git.
- ⭐⭐ sync-platforms đẩy bản DNN về **`../Assets`** (canonical), KHÔNG phải `DesktopModules/MegaForm/Assets/js/`
  (thư mục đó chỉ là bản deploy cục bộ, lệch ngày là bình thường). `BuildPackage-DNN.ps1` đọc `$SOLUTION_DIR\Assets`.
- ⭐⭐ Verify chuỗi trong DLL phải `strings -el` — literal .NET nằm UTF-16 ở #US heap; `grep` ASCII báo 0 SAI.
- ⭐ QA hot-deploy JS: chép vào `E:\DNN_SITES\DNN_MegaDemo\Website\DesktopModules\MegaForm\Assets\`
  (có `.bak-20260728`). Trang stamp `?v=` cũ nên browser vẫn cache →
  **`fetch(url,{cache:'reload'})` đúng URL có `?v=` rồi mở TAB MỚI** (KHÔNG `Page.reload` — treo tab builder).
- ⭐ Sửa `.cs` bằng python: đọc `utf-8-sig`, **ghi lại phải đúng BOM như file gốc**
  (`FormHtmlRenderer.cs` KHÔNG BOM, `FormView.ascx.cs` CÓ BOM) — sai sẽ tạo hunk giả ở dòng 1.

### Git — worktree lẫn nhiều backlog
Nhiều file mang hunk của backlog khác **phụ thuộc file untracked** → add nguyên file = commit không build.
Cách tách không cần `git add -p`:
```
git show HEAD:<path> > tmp        # sửa lại đúng hunk cần
git hash-object -w --path <path> tmp
git update-index --cacheinfo 100644,<sha>,<path>
git diff --cached -U0 | grep '^@@'   # kiểm chứng
```
Đã dùng cho: `SubmissionQueryService.cs`, Web/DNN controller, `FormView.ascx.cs`, `DnnServiceLocator.cs`,
`canvas.ts`, `public/i18n/{en-US,vi-VN}.json`.

---

## 3. Backlog còn treo (theo thứ tự ưu tiên đề xuất)

1. 🔴 **48 file `.cs` chưa bao giờ `git add`** mà code đã-commit tham chiếu (`NamedConnectionCatalog` 15 file HEAD,
   `SubmissionDataResolver`, toàn bộ `MegaForm.Umbraco/{Controllers,Services,HostedServices}`…).
   ⇒ **clean checkout KHÔNG build được ở tầng host** (Core thì build sạch). Mọi "tests PASS" trước nay đều là
   worktree bẩn. **Cần bạn quyết** có commit không (kéo theo code chưa review).
2. Oqtane **chưa build lại** với các fix của phiên này.
3. `pack` vẫn báo `THAT BAI: unified-monaco` — chưa điều tra.
4. Umbraco: cấp permission letter cho user group non-admin trước khi phát hành (nếu không, backoffice non-admin 403).
5. Smoke QA 8 kịch bản permission ở mục 7 bàn giao Codex — chưa chạy.
6. DocFX theo `E:/MENU SPECS/MegaForm-product-copy-02.00.006.html` (7 API surface).
7. Cosmetic: 2 `<option>` chọn address-scheme vẫn dùng emoji cờ (option không nhúng được `<img>`).

---

## 4. Môi trường QA đang mở

- Chrome debug `:9222`, profile riêng ở scratchpad; đã đăng nhập `megademo.ai` (host/dnnhost).
  Login harness: điền `#dnn_ctr_Login_Login_DNN_txtUsername/txtPassword` rồi **click** `#dnn_ctr_Login_Login_DNN_cmdLogin`.
- Form dùng để QA: **22** (Form Đăng Ký Du Học — composite phone có `def:"+1"`), **37** (Health Check Appointment
  — `CompositePhone` alias, dùng cho §1).
- Ảnh QA: `<scratchpad>/flag-before.png`, `flag-after.png`, `emoji-probe.png`,
  `builder-canvas-flag.png`, `input-designer-flag.png`.
- ⚠️ Site demo đang chạy **JS mới + DLL cũ** (đã hot-deploy renderer/builder/i18n). Muốn về trạng thái sạch:
  khôi phục từ `*.bak-20260728` trong `…\DesktopModules\MegaForm\Assets\js\`.
