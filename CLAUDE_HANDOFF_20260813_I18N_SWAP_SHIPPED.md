# Đổi bộ ngôn ngữ gói — ĐÃ SHIP (2026-08-13)

> Trạng thái: **đã build, đã pack, đã cài, đã QA bằng mắt trên CẢ Oqtane và DNN.**
> Gói: **Oqtane `MegaForm.Oqtane.2.0.28.nupkg`** · **DNN `MegaForm_02.00.017_Install.zip`**
> Còn **1 lỗi mở** (§6) — không chặn phát hành nhưng phải biết.

---

## 1. Kết quả

`vi-VN` + `ru-RU` đã ra khỏi sản phẩm. Urdu (`ur-PK`) vào, RTL. Sáu ngôn ngữ owner yêu cầu
(Dutch, Urdu, Spanish, English (British), French, Italian) nay **đủ 1974/1974 khoá** và
**bundle thẳng trong gói**, không cần add-on.

Kiểm chứng chạy thật, không phải suy đoán:

| | Oqtane `:5131` | DNN `dnn_megafresh.ai` |
|---|---|---|
| danh sách locale | 37, **không có** vi/ru, **có** ur-PK | 7 bundled, **không có** vi/ru, **có** ur-PK |
| `ur-PK.json` | HTTP 200 · 126.429 B | HTTP 200 · 1974 khoá · `builder.save` = `محفوظ کریں` |
| `vi-VN.json` / `ru-RU.json` | **404** | **404** |

---

## 2. ⭐ Handoff cũ ghi "4 thư mục" — SAI, thực tế **23 thư mục nguồn**

Nguồn canonical thật là **`MegaForm.UI/public/i18n/`** (đây là chỗ `i18n-check.cjs` đọc, và
là `publicDir` mà vite copy ra `outDir`). Bốn thư mục `Assets/js/*/i18n` chỉ là **bản copy build**.

Nhưng bản copy còn nằm ở nguồn deploy của **mọi nền tảng**, và `i18n-sync-platforms.cjs`
(chạy lúc pack) **chỉ COPY, không XOÁ** ⇒ gỡ locale phải xoá tay:

```
MegaForm.UI/public/i18n                                   ← canonical
Assets/js/{,builder/,bundles/,plugins/}i18n               ← nguồn gói DNN
MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/{,builder/,bundles/,plugins/}i18n
MegaForm.Web/wwwroot/megaform/{i18n,js/{builder,bundles,plugins}/i18n}
MegaForm.Umbraco/wwwroot/js/{,builder/,bundles/,plugins/}i18n
DesktopModules/MegaForm/Assets/js/{builder,bundles,plugins}/i18n
nopCommerce/.../MegaForm.NopCommerce.Plugin/Assets/js/{,builder/,bundles/,plugins/}i18n
```
(bin/, publish/, dist/, local-packages*, tmp*, _audit_temp là output — kệ, build lại là sạch.)

## 3. ⭐⭐ Cài đè KHÔNG xoá file cũ — phải có cơ chế dọn, nếu không "gỡ" chỉ là ảo

`i18n/list` **union index.json với một lần quét thư mục** (`Directory.GetFiles`), mà cả nupkg
lẫn gói DNN đều **giải nén đè** chứ không xoá file phiên bản mới bỏ đi. Không dọn thì site đã
cài vẫn liệt kê và vẫn phục vụ vi-VN/ru-RU ⇒ trông y như chưa làm gì.

- **Oqtane**: `SweepRetiredLocales()` trong `MegaFormWarmupHostedService` — chạy **lúc khởi
  động** (không phải trong request: `i18n/list` không có `[Authorize]`, không được gắn
  side-effect xoá file vào đó). Tên file là hằng biên dịch, không đọc gì từ request. Có
  **marker `.retired-locales-2026-08-13`** cạnh pack ⇒ admin tự tạo lại vi-VN trong Language
  Manager sau này sẽ không bị lần khởi động kế tiếp xoá mất.
- **DNN**: `<component type="Cleanup" version="02.00.017" fileName="02.00.017.txt">` +
  `MegaForm.DNN/Cleanup/02.00.017.txt` (8 đường dẫn). Đã nghiệm thu: site trước cài có
  `vi-VN.json`, sau cài **không còn**.

## 4. ⭐ Chín chỗ hardcode, không phải tám

Handoff cũ liệt kê 8 file TS. Chỗ thứ 9 **làm hỏng pack DNN** và chỉ lộ ra khi chạy thật:

**`MegaForm.DNN/BuildPackage-DNN.ps1`**
- `$I18N_KEEP` — gói DNN **chỉ bundle 2 locale** (`en-US` + `vi-VN`), 36 locale còn lại đẩy
  sang add-on `MegaForm.LanguagePacks`. Đã đổi thành 7 (`en-US` + đủ 6 ngôn ngữ owner);
  add-on còn 30. Add-on là thứ khách phải tự tìm và cài ⇒ để 6 ngôn ngữ ở đó thì **không
  tính là "có trong gói"**. Giá phải trả ~700 KB.
- `Assert-RequiredFile ... 'Packaged Vietnamese locale'` — **bắt buộc** phải có `vi-VN.json`,
  ném lỗi và **huỷ pack**. Nay assert đủ 6 ngôn ngữ owner.

Ngoài ra `megaform-widget-calculator` có **bản `.js` deploy riêng** không có build entry —
sửa `.ts` là chưa đủ, phải vá cả `Assets/js/plugins/megaform-widget-calculator.js` rồi sync tay.

## 5. Việc làm thêm (ngoài đề bài, vì không làm thì đề bài sai)

- **`i18n:check` lúc đầu phiên đang ĐỎ** — 7 khoá thiếu ở 10 locale REQUIRED, 97 khoá thiếu ở
  es-ES/fr-FR/en-GB. Đã dịch bù đủ (không dùng `--fill` vì nó nhét tiếng Anh vào). **Nay PASS.**
- **`en-GB` hoá ra là bản SAO NGUYÊN SI của en-US** — khác đúng 1 khoá trên 1877, và khoá đó là
  do thiếu sót (`des.comp.maskHint` rụng mất "U upper-letter"). Đã Anh-hoá thật 33 khoá
  (colour/centre/licence/organise/behaviour/customise…) và vá lại maskHint.
- `i18n-check.cjs`: `REQUIRED` bỏ ru-RU, thêm đủ 6 ngôn ngữ owner; **Check 4 script-bleed** trước
  đây hardcode `code !== 'ar-SA'` ⇒ mọi giá trị Urdu sẽ bị coi là "Arabic bleed" và fail gate.
  Nay dùng tập `ARABIC_SCRIPT = {ar-SA, ur-PK}`.
- Gỡ **7 chuỗi tiếng Việt hardcode** trong Language Manager (`src/languages/index.ts`) — vi phạm
  quy tắc i18n của repo và là tiếng Việt lọt vào gói không còn tiếng Việt.
- Chọn mã **`ur-PK`** (không phải `ur`): khớp quy ước 39 locale hiện có đều có region; và
  `localeDefaultIso2()` lấy region từ chuỗi locale ⇒ `ur-PK` → cờ PK, `ur` trần thì rơi về US.
  `normalizeLocale('ur')` tự map sang `ur-PK` nên site khai `ur` vẫn chạy.

## 6. 🔴 LỖI CÒN MỞ — chrome builder ở Urdu vẫn hiện tiếng Anh

**Hiện tượng.** Mở builder với `?mflocale=ur-PK`: **RTL lật đúng**, palette + panel properties +
engine đều Urdu, nhưng **thanh công cụ và nhãn palette vẫn tiếng Anh** ("Build / Design /
AI Designer / Basic / Layout / Widgets / Field Properties / Form Settings"). `ar-SA` cùng trang
thì **dịch trọn**. Ảnh đối chiếu: `qa-out/locale-swap/builder-ur-PK.png` vs `builder-ar-SA.png`.

**Đã loại trừ** (đừng làm lại): không phải thiếu khoá (1974/1974, `t('builder.mode_build')` trả
`تعمیر`); không phải endpoint (`i18n/Get?id=ur-PK` → 200, 126.429 B); không phải cache hỏng
(cache là Urdu thật — 89 K **ký tự UTF-16**, đừng đọc nhầm thành byte); không phải "locale lần
đầu xuất hiện" (`da-DK`, `sr-Latn-RS` cũng lần đầu, LTR, **dịch bình thường**); không phải
danh sách hardcode nào (đã grep hết `ar-SA` trong `src/` và `*.cs`).

**Cơ chế.** `bt()` — [`MegaForm.UI/src/builder/dom.ts:29-40`](MegaForm.UI/src/builder/dom.ts#L29-L40) —
đọc `window.MegaFormI18n` **tại thời điểm dựng DOM** và tự nhận trong comment là *giả định*
catalog đã tải xong ("by the time this DOM factory runs the active locale is loaded"). Đó là một
cuộc đua. **`ur-PK.json` là pack LỚN NHẤT được ship (126.429 B, hơn ar-SA 11%)** nên nó thua
đều đặn trên máy này.

**Seam để sửa.** `window.MegaFormI18nReady` **đã có sẵn** (đặt ở
[`src/i18n/index.ts:378`](MegaForm.UI/src/i18n/index.ts#L378), tiêu thụ ở
[`dom.ts:88`](MegaForm.UI/src/builder/dom.ts#L88) và `renderer/index.ts:4607`). Khi promise
resolve, builder **chỉ chạy lại `localizeBuilderChrome()`** — hàm này chỉ quét right-rail
(`#mf-tab-*`, `.mf-design-acc-body`) theo `BUILDER_CHROME_MAP`, **không vẽ lại** toolbar/palette
do `bt()` dựng. Hai hướng:
- (a) chặn lần render đầu của builder sau `MegaFormI18nReady` — đúng gốc, nhưng đụng thứ tự mount;
- (b) mở rộng phạm vi + map của `localizeBuilderChrome()` phủ toolbar/palette — cộng thêm, ít rủi
  ro hơn, nhưng nhãn palette đến từ khoá `field.*` nên phải bổ sung map.

⚠️ Lỗi này **có sẵn từ trước**, chỉ chưa lộ vì chưa từng ship pack nào to bằng Urdu.

## 7. Ghi chú vận hành

- Pane Oqtane `/admin/megaform` là **Razor server-render, nhãn tiếng Anh cứng, không dùng i18n JS**
  ⇒ chụp ảnh nó để QA ngôn ngữ là **vô nghĩa** (mọi locale ra ảnh y hệt, tôi đã mắc bẫy này).
  Surface đúng để QA là builder: `/?mfpanel=builder&formId=1&mflocale=<loc>`.
- `_packrun_crlf.cmd` phải **sinh lại từ `pack.cmd`** rồi gọi bằng wrapper đường dẫn tuyệt đối
  (xem memory `reference_pack_cmd_run_env_gotcha`) — gọi tên trần là cmd mở shell rồi thoát ngay.
- DNN 10.3 **đã bỏ `/Install/Install.aspx`** ⇒ route "install resources" 404. Dùng
  `tools/dnn_live_install_megaform.mjs install` với `DNN_BASE_URL/DNN_USER/DNN_PASSWORD/MEGAFORM_DNN_ZIP`.
- Khởi động lại Oqtane phải truyền `--urls http://localhost:5131`, nếu không nó nghe 5000 và
  alias `localhost:5131` không phân giải.
- `megaform-unified-monaco` **[FAIL] khi pack** — thiếu package `monaco-editor` trong
  node_modules. **Có sẵn từ trước**, bản dựng 19/06 (4.154.053 B) vẫn được đóng gói nguyên vẹn.

## 8. Công cụ QA để lại

`tools/browser-qa/_tmp-locale-swap-qa.mjs` (Oqtane, builder, 8 locale + ảnh) ·
`_tmp-dnn-verify-locales.mjs` (DNN, sau cài) · `_tmp-ur-debug.mjs` · `_tmp-ur-race.mjs` ·
`_tmp-ur-cache.mjs` · `_tmp-ur-net-diff.mjs` · `_tmp-first-seen-locale.mjs` ·
`_tmp-ur-which-strings.mjs`. Ảnh + report: `qa-out/locale-swap/`, `qa-out/locale-swap-dnn/`.

---

## 9. 📋 Owner giao cho phiên sau (2026-08-13)

1. **Tài liệu hướng dẫn webhook** đẩy form submission sang hệ thống có sẵn (CRM, ERP) —
   **cả trường hợp có authentication lẫn không**.
2. **Đẩy submission vào một bảng SQL có sẵn của khách** bằng câu lệnh INSERT với parameter
   cấu hình được — dùng đúng tính năng sẵn có của MegaForm builder.
3. **Tạo các bảng SQL mẫu** để demo.
4. **Form 4 trường → Edit form → BPMN → add API service task** → cấu hình API gửi 4 trường đó
   tới một URL giả định.
5. **Mọi sample đều kèm GIF animation minh hoạ** (xem memory `reference_demo_gif_recording`).
6. 🔴 **Database pane đang quá dài, không theo dõi nổi** — owner đã gửi ảnh khoanh đỏ: danh sách
   bảng (`__EFMigrationsHistory`, `Alias`, `AspNetUser*`…) đổ ra một mạch, mỗi dòng kèm 2 nút
   `⚡Capability` + `+DataGrid`. Cần cắt gọn/gộp nhóm/phân trang.

### Việc treo từ phiên trước (chưa đụng)
- 3 tab **Data / Templates / Settings** của admin pane Oqtane vẫn là placeholder.
- **`Add To Page` chưa bấm thật lần nào.**
- Nhãn nút **Close** → "Return to MegaForm" (sửa bundle `megaform-submissions.js`).
- Owner chưa trả lời: **"Add To Page → add to current page"** có nghĩa là chọn trang có sẵn từ
  danh sách không?
