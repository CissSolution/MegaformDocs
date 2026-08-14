# HANDOFF — 2026-07-27 (phiên 3): PROD dnndefender.com landing page · 2 fix kỹ thuật

Nối tiếp `CLAUDE_HANDOFF_20260727_ERP_CONNECTION_AI_TABLE_XMAS_TEMPLATE.md`.
Owner chọn **task 5 (site PROD)** làm đầu việc đầu tiên và **cho phép ghi thẳng, báo lại sau**.

Site: **https://dnndefender.com** (host/`Minh@2002`, DNN 10.2.3, MegaForm **1.7.114** — đã verify từ
`Packages` chứ không đoán). Portal 0.

---

## ✅ A — Ẩn trang demo khỏi menu (Tabs.IsVisible=0)

**37 tab** đã ẩn: `1555` (MegaForm Continue) · `1556–1588` (33 trang demo con) · `1589/1590/1591` (EuroYouth).
**GIỮ `1554` (/MegaForm) hiển thị** — đây chính là trang hub owner muốn trưng bày; ẩn nó thì không ai
tìm ra nội dung mới.

- Backup đầy đủ trước khi ghi: `out/p-tabs-isvisible-backup.json` + **`out/p-rollback-isvisible.sql`**
  (55 câu UPDATE khôi phục nguyên trạng từng tab).
- Verify anonymous: menu chỉ còn `DNNDEFENDER · DEMO DEFENDER ▾ · BLOGS · ACME SKINS SYSTEM · MEGAFORM`,
  **0 tên demo rò ra menu**; URL demo vẫn vào được bình thường (`tabid=1561` render form OK).
- ⭐ Ẩn menu **trước** rồi mới chụp ảnh ⇒ mọi thumbnail có menu sạch, không phải retouch.

## ✅ B — Trang /MegaForm mới (HTML module 21980)

Nội dung cũ (8.497 ký tự, danh sách `<ol>` 2 cột) → **16.873 ký tự**, lưới 36 thumbnail.

- **36/36 form demo đã chụp** ở chế độ **khách vãng lai** (không login ⇒ không dính persona bar),
  clip đúng vùng `[id^="mf-form-wrapper"]`, cap 760px, JPEG q82 (~2,1 MB tổng).
- **36/36 ảnh đã upload** qua `POST /DesktopModules/MegaForm/API/Upload/Image` (multipart +
  header `RequestVerificationToken`) → `/Portals/0/MegaForm/Images/2026-07/*.jpg`. Map lưu ở `out/p-urls.json`.
- Bố cục: hero → **3 ô nhấn mạnh** (Online Gallery "mua 1 lần, design về hoài" · "Tả bằng lời, AI dựng
  form" / dựng từ bảng SQL · wizard 4 bước) → link docs `https://cisssolution.github.io/DNN_MegaformDocs/`
  → lưới 33 template → mục "One application, four faces" (3 skin EuroYouth) → footer 2 link docs sâu.
- CSS đặt trong `<style>` scope `#mf-hub` (ghi thẳng SQL nên **không bị sanitizer của editor nuốt** —
  đã verify `getComputedStyle(grid).display === 'grid'` trên site thật).
- Module 21981 (hub "Continue", tab đã ẩn) → rút gọn thành 1 link trỏ về `/MegaForm` cho bookmark cũ.
- Backup nội dung cũ: `out/p-hub-21980-v1.PRE-20260727.html`, `out/p-hub-21981-v1.PRE-20260727.html`.

### Verify (anonymous, site thật)
| Kiểm tra | Kết quả |
|---|---|
| `<style>` sống sót, grid hoạt động | ✔ `display:grid` |
| Responsive | 1500px→**4 cột**, 900px→**3**, 480px→**2**; `scrollWidth == clientWidth` cả 3 (không tràn ngang) |
| Ảnh | **36/36** load (lần đo đầu ở 1500px báo "broken" là **lazy-load chưa kịp**, đo lại cache ấm = 0) |
| Link thẻ | **36/36** mở ra trang còn render form thật (`mf-form-wrapper` cao >200px) |

⚠️ **Bẫy đã gặp**: `loading="lazy"` làm QA headless báo ảnh hỏng giả. Phải cuộn hết trang rồi mới đếm.

---

## ✅ C — BONUS: Cherry Blossom hở trắng trong thẻ ảnh (đúng backlog #2, nhưng nguyên nhân KHÁC dự đoán)

Phát hiện khi QA thumbnail: 3 thẻ Garden Walk / Tea Ceremony / Lantern Festival có **174px trắng**
giữa ảnh và caption — **trên chính trang PROD**, không chỉ preview.

**Nguyên nhân thật (đo bằng computed style, không đoán):**
- `.event-card` có `aspect-ratio:3/4` → 259×346.
- `<img>` render 259×**172** (đúng tỉ lệ gốc 800×530) ⇒ `object-fit:cover` **vô tác dụng vì không có
  hộp bị ràng buộc**.
- Template *có* rule `.mfp-sakura .event-card img{width:100%;height:100%;object-fit:cover}` — nhưng
  **bị đè** bởi khối QA-compat nằm **cuối chính customCss của template**:
  ```css
  .mf-form-wrapper .mfp img, … { max-width:100% !important; height:auto !important; }
  ```
  (khối này do `fix_premium_templates.py` chèn từ 06-12; cùng specificity 0-2-1 nhưng có `!important`
  **và đứng sau** ⇒ thắng tuyệt đối). Cùng khối còn có
  `[class*="card"]{overflow:visible!important}` giết luôn bo góc của card.

⭐⭐⭐ **Đây mới là lời giải cho backlog #2 "Cherry Blossom preview ≠ thật"** — KHÔNG phải
`PREVIEW_LOGICAL_WIDTH=1240`. Preview dựng HTML **không có `.mf-form-wrapper` bọc ngoài** nên không
dính rule guard ⇒ preview đúng, trang thật vỡ. Ai làm tiếp backlog #2 đừng đi theo hướng scale/width.

**Đã sửa 2 nơi:**
1. **Canonical**: `Samples/FormTemplates/Premium/DONEE/cherry-blossom-festival-registration.json` —
   thêm khối `MF-QA-SAKURA-CARDFILL-20260727` vào **cả 3 slot** (`customCss`, `settings.customCss`,
   `settings.CustomCss`), specificity `.mf-form-wrapper .mfp.mfp-sakura .event-card img` (0-4-1) đặt
   cuối. Script tái dùng được: **`tools/templates/fix-sakura-cardfill.mjs`** (có `--check`, idempotent,
   giữ nguyên format 2-space + trailing newline nên diff chỉ 3 dòng).
2. **PROD form 346**: `REPLACE()` có neo trong `MF_Forms.SettingsJson` **và** `SchemaJson` (không ghi đè
   cả document). CSS chèn vào **cố ý không có nháy đơn/kép** để không phá JSON lẫn SQL literal.
   Backup: `out/p-form346-{Schema,Settings}Json.backup.json`.
   **Verify live: `card 261×348 / img 261×348 / gap 0`** (trước: `259×346 / 259×172 / gap 174`).

⚠️ Guard này gãy với **mọi** template dùng `aspect-ratio` + `object-fit:cover`. Mới chỉ vá Cherry
Blossom. Nên rà `fix_premium_templates.py` để sửa tận gốc cho template tương lai.

---

## ✅ D — Fix preview gallery mất field (backlog #1)

Đúng như chẩn đoán phiên trước: preview tĩnh không chạy step engine ⇒ **không page nào có `.is-active`**
⇒ CSS `.mfp-page{display:none!important}` ẩn sạch field.

**Làm khác handoff cũ một chỗ (tốt hơn)**: thay vì sửa 2 hàm song sinh (dễ lệch pha về sau), tách
helper dùng chung **`MegaForm.UI/src/shared/preview-active-page.ts`** → `activateFirstPreviewPage(html)`,
gọi ở cuối `buildResolvedCustomTemplateHtml()` của **cả hai** file:
- `MegaForm.UI/src/dashboard/wizard/gallery-preview.ts`
- `MegaForm.UI/src/builder/gallery.ts`

Đã **scan toàn bộ DONEE** để lấy đúng quy ước (không đoán): container `.mfp-page`(10) `.ey-page`(4)
`.bg-page` `.au-page` `.am-page` `.mf-ms-panel` `.mfp-tab-panel`; **class reveal thống nhất là
`.is-active`**. Có thêm fallback generic cho họ template mới đặt tên `*-page`, và **không ghi đè** nếu
template đã tự đánh dấu active.

**Test thật (render template thật trong browser, đếm field nhìn thấy được):**
| Template | Trước | Sau |
|---|---|---|
| classic-registration | **0**/21 field, 0 page active | **4**/21, 1 page active |
| christmas-signup | **0**/19 | **4**/19 |
| cherry-blossom (1 trang) | 11/11 | 11/11 — **không regression** |

Build: `npm run build:dashboard` + `npm run build:builder` → OK, `sync-platforms` tự copy sang **4
wwwroot** (oqtane/web/dnn/umbraco). Đã verify literal selector có trong cả 2 bundle.

⚠️ `npx tsc --noEmit` báo **1 lỗi có sẵn** `src/builder/workflow/wf-app.ts(785,3) TS1128` — file đó
**không nằm trong danh sách thay đổi của tôi** (git sạch), là lỗi tồn tại từ trước.

---

## ✅ E — Vá rule 10: Subform rò `ex.Message` (4 platform)

Handoff cũ ghi 1 chỗ (`Subform/Tables`); quét ra **19 chỗ** trên **4** controller song sinh
(handoff cũ nói "3 platform" — thực tế có **4**, thêm Umbraco).

Rò gì: `Cannot open database "X" … Login failed for user 'IIS APPPOOL\Y'` ⇒ lộ **tên DB + danh tính
app-pool**.

Theo đúng convention sẵn có của repo (`ExternalTableController` / `AiToolsController`): **log server-side,
trả chuỗi tĩnh**.

| File | Sửa |
|---|---|
| `MegaForm.Oqtane.Server/Controllers/SubformController.cs` | 5 chỗ, log `_logger.Log(LogLevel.Error, …)` |
| `MegaForm.DNN/WebApi/SubformController.cs` | 5 chỗ, log `Exceptions.LogException` |
| `MegaForm.Umbraco/Controllers/SubformController.cs` | 5 chỗ (đã sẵn `_logger`) |
| `MegaForm.Web/Controllers/SubformController.cs` | 4 chỗ + **thêm `ILogger<SubformController>` vào ctor** |

Message mới: `could not list tables` / `could not read columns` / `could not read rows` /
`the database rejected this CREATE TABLE statement` / `connection is not configured`.

**Ngoại lệ có chủ đích (ghi rõ trong comment)**: `Compute` giữ `InvalidOperationException.Message` vì đó
là chẩn đoán **công thức của chính designer** (`Unknown function`, `Mismatched parens`…) do
`SubformExpressionEvaluator` sinh ra, **không chứa state server**; mọi exception khác → chuỗi tĩnh.
Đây là action `[AllowAnonymous]` nên phần còn lại siết chặt.

**Build sạch 0 error cả 4**: Oqtane · Web · Umbraco · DNN(net472).
**Client không cần sửa**: JS chỉ hiển thị giá trị `error` (`esc(err)`), không match chuỗi cũ ⇒ contract
`{error: "..."}` giữ nguyên.

> 📌 `MegaForm.Umbraco/Controllers/SubformController.cs` đang là file **untracked** (`??`) trong git —
> chưa từng commit. Nhớ `git add` khi commit.

---

---

# PHỤ LỤC — vòng 2 (owner review trang /MegaForm) + tiếp nhận commit của Codex

## ✅ F — Trang /MegaForm v2 (module 21980: 16.873 → 21.435 ký tự)

Owner khoanh đỏ trên ảnh chụp trang: bỏ 2 demo trùng, đưa EuroYouth lên lưới chung, thêm 2 GIF, thêm mục
"simple form".

1. **Bỏ 2 demo trùng/thừa** → lưới còn **34 card**:
   - `1556 Schedule Your Test Drive` — trùng thiết kế với `1557`, và **đang HỎNG**: ảnh xe đầu tiên là URL
     Unsplash chết (`photo-1584345604476-…`). Đo được: 1556 = **1/5 ảnh vỡ**, 1557 = **0/5**. Giữ 1557.
   - `1558 Share Your Experience` — trùng bộ nhận diện AURORA với `1559 Style Consultation`; 1559 giàu hơn
     (có thêm hàng chip "featured collection"). Giữ 1559.
   - ⭐ Card 1557 hiển thị nhãn **"Schedule Your Test Drive"** (bỏ đuôi " 2" vô nghĩa với khách) — trang gốc
     vẫn giữ tên cũ, chỉ nhãn trên landing đổi.
2. **Gộp 3 skin EuroYouth vào lưới chính**, xoá hẳn section riêng "One application, four faces"; giữ ý nghĩa
   bằng meta `premium skin / same 20 fields`.
3. **2 GIF thật** (chọn bản DNN, không phải bản Oqtane):
   - `dnn-03-creating-forms.gif` **0,53 MB** — wizard 5 bước Setup/Fields/Workflow/Design/Publish + live preview.
   - `dnn-ai-create-form.gif` — "Create form with AI" (Beary + live preview + Save & Use Now).
   - ⭐⭐ **Upload chặn ở 5 MB** (`{"error":"Image must be under 5 MB."}`) mà bản gốc 6,28 MB ⇒ tự re-encode:
     `p-gif-info.mjs` (parser GIF thuần, đọc đúng 124 khung / 23,4 s) → `p-gif-shrink.mjs` phát lại trong
     browser đúng nhịp rồi encode lại qua pipeline `shotsToGif` sẵn có → **800×529, 4,56 MB**, chữ vẫn đọc rõ.
     Không cần ffmpeg (bản Playwright đã bị lược).
4. **Mục "Don't need a custom design?"** — ảnh form trần `oq-standard-contact.png` + 3 tab palette
   (Basic 19 / Layout 11 / Widgets 14) + 34 pill tên widget.
   ⭐ Danh sách widget lấy từ **`Assets/js/builder/i18n/en-US.json`**, KHÔNG lấy `label:` trong code
   (`Radio`→UI hiện "Radio Buttons", `Checkbox`→"Checkboxes"). ⭐ **"Input" là một họ**, không phải 1 widget:
   từ 2026-06-18 "Unify v3" các tile Short Text/Email/Number/Phone/Full Name/SSN bị ẩn, chọn qua dropdown
   "Input type" ⇒ đừng viết "có widget Short Text". ⭐ Không nhắc các widget đã khai tử (Phone Pro, Subform,
   Repeater, Likert, NPS, tile Stripe/PayPal rời).
   ⭐ Ảnh palette **chỉ rộng 256px** ⇒ phải `max-width:256px` kẻo phóng lên là mờ chữ.

### Bẫy QA mới
⭐⭐ **`decoding="async"` làm ảnh chụp headless ra XÁM** (screenshot chộp trước khi decode xong) — báo động giả
y hệt `loading="lazy"`. Đã bỏ hẳn attribute này; giữ `loading="lazy"`.

### Verify live (anonymous)
34 card · 40 ảnh · **0 hỏng** · 4/3/2 cột ở 1500/900/480 · `scrollWidth == clientWidth` · **34/34 link**
mở ra trang còn render form.

## 🔴 G — Tiếp nhận commit `2dd59b3` của Codex (permission matrix): **KHÔNG PASS như bàn giao mô tả**

Chi tiết đầy đủ: **`CLAUDE_HANDOFF_20260728_PERMISSION_MATRIX_VERIFICATION.md`**.

Thiết kế đúng và có giá trị, nhưng tự kiểm chứng (read-only) ra **3 blocker + 1 P0**:
- Commit **không tự build được**: `ISubmissionOwnerFilterableRepository` dùng ở 7 file nhưng không khai báo
  ở đâu trong cây commit; `SubmissionListQuery.UserId` không tồn tại.
- **Rò dữ liệu**: `SubmissionQueryService` tại commit **không đọc `query.UserId`** ⇒ push-down `own` là no-op,
  trong khi Web/Oqtane đã chủ động TẮT lọc per-row (`rowScoped = … && !ownOnlyScope`) ⇒ user scope `own`
  nhận **toàn bộ** dòng.
- **Nguyên nhân chung**: 3 file Core cần thiết **vẫn uncommitted** (` M`) ⇒ "194/194 tests + 5/5 build PASS"
  là kết quả của **worktree bẩn**, không phải của commit. Change set thật ~35 file, không phải 32.
- 🔴 **P0 export ẩn danh**: `PermissionService.cs:196` fail-OPEN khi form chưa có dòng nào trong
  `MF_Permissions`, cộng với Web/Oqtane export đổi `[Authorize]`/`ViewModule` → **`[AllowAnonymous]`**
  ⇒ khách chưa đăng nhập tải được toàn bộ submission. Vi phạm rule 3 + rule 11.
  **Chưa lộ ra production** (dnndefender.com đang chạy 1.7.114 từ 07-24, commit này 07-28 chưa đóng gói).

Chưa sửa gì — đúng mục 8 bàn giao (không `git add/reset/clean`, không commit, không đụng fallback).

## 🟡 H — BUG PHONE MẤT CỜ: đã tìm ra gốc + đã vá source, **CHƯA verify xong, CHƯA đóng gói lại**

Owner báo: ô "Số Điện Thoại" hiện chữ `US` thay vì lá cờ.

### Nguyên nhân (đã xác minh, không phải đoán)
- File cờ **có đủ**: `Assets/img/flags/4x3/` = **271 SVG**; trên site thật
  `dnndefender.com/DesktopModules/MegaForm/Assets/img/flags/4x3/us.svg` → **200** (648 B).
  Đường Oqtane `/Modules/MegaForm/img/flags/4x3/us.svg` trên DNN → **404**.
- Chữ `US` chính là `<span class="mf-ccp-flag-fallback">` — nghĩa là `<img>` cờ **404**, không phải mất file.
- ⭐⭐⭐ **Thủ phạm: `MegaForm.Core/Services/FormHtmlRenderer.cs` `FlagHtml()` hardcode CỨNG**
  `src="/Modules/MegaForm/img/flags/4x3/…"` — **không hề dò nền tảng**. Đây là **URL ảnh module DUY NHẤT
  bị hardcode trong Core** (grep toàn Core chỉ ra 1 chỗ). ⇒ **mọi form render server-side trên DNN/Web/Umbraco
  đều 404 cờ**. Bản client (`country-picker.ts`) tự dò từ script src nên **client render thì đúng** — đó là
  lý do ảnh phiên 07-27 trên megademo.ai thấy cờ Mỹ, còn ảnh owner thì ra chữ `US`. **SSR hỏng / client OK.**
- Phụ: `country-picker.ts:getFlagAssetBaseUrl()` fallback cũng hardcode đường **Oqtane**, lại **memo hoá
  vĩnh viễn** giá trị sai → hỏng thêm ở (a) **srcdoc iframe** (Design preview / gallery thumbnail: không có
  thẻ `<script>` megaform nào) và (b) DNN **Client Resource Management** gộp/minify JS làm tên file mất chữ
  "megaform".

### Đã sửa (source), build sạch
| Nơi | Sửa |
|---|---|
| `MegaForm.Core/Services/FormHtmlRenderer.cs` | thêm `public static string ModuleImageBase` (mặc định `/Modules/MegaForm/img/`, tự thêm `/` cuối); `FlagHtml()` dùng nó. **Không đổi hành vi Oqtane/Web/Umbraco.** |
| `MegaForm.DNN/Services/DnnServiceLocator.cs` | ctor set `FormHtmlRenderer.ModuleImageBase = "/DesktopModules/MegaForm/Assets/img/"` (chạy 1 lần/app domain). |
| `MegaForm.UI/src/renderer/country-picker.ts` | `getFlagAssetBaseUrl()`: quét thêm **same-origin parent/top** (iframe), fallback theo **`__MF_PLATFORM__`** thay vì 1 host, **không memo hoá giá trị fallback**. Thêm `repairSsrFlagUrls()` gọi đầu `bindCountryPickers()` → **sửa luôn `src` do SSR bản cũ sinh**, nên site đã cài được chữa mà chưa cần thay DLL. |

- `dotnet build` **MegaForm.DNN** và **MegaForm.Oqtane.Server**: **0 error**.
- `npm run build:renderer` OK → `megaform-renderer.js` 392,92 kB, sync đủ **4 wwwroot**.
- ⚠️ **Vì sao Core cần sửa chứ không chỉ vá client**: HTML của `FormHtmlRenderer` còn dùng cho **PRINT** —
  không có JS chạy để chữa.

### 🔴 CÒN DANG DỞ (owner yêu cầu tạm dừng)
1. **Chưa verify chạy thật** phần `repairSsrFlagUrls`. Test đã dựng nhưng chưa xong:
   bundle renderer chỉ export `MegaFormRenderer.init(cfg)` (không export `bindCountryPickers`), nên trang test
   trần **không hydrate** ⇒ repair không chạy ⇒ 2 case test còn ra `/Modules/...`. **Đó là hạn chế của harness
   test, KHÔNG phải bằng chứng fix sai.** Cách verify đúng ở phiên sau, chọn 1:
   - `npx esbuild src/renderer/country-picker.ts --bundle --format=iife --global-name=CP` (binary có ở
     `MegaForm.UI/node_modules/.bin/esbuild`, gọi qua đường dẫn đầy đủ — `npx esbuild` bị lỗi resolve) rồi gọi
     thẳng `CP.bindCountryPickers(document)`; **hoặc**
   - gọi `MegaFormRenderer.init({schema})` với schema có composite phone; **hoặc**
   - deploy lên site DNN thật rồi mở form có phone (⚠️ **không demo nào trên dnndefender.com có phone
     composite** — đã query DB forms 342-377: **0 form**; dùng megademo.ai hoặc tạo form mới).
2. **Đóng gói lại — BẮT BUỘC**: gói Production `MegaForm_02.00.006_Install.zip` (14.972,6 KB) được build
   **TRƯỚC** khi vá cờ ⇒ **KHÔNG có fix**. Bản **Trial CHƯA build**. Oqtane **chưa build bản nào**.
   - DNN: `.\BuildPackage-DNN.ps1 -BuildTS -BuildDotNet -NoPause` (Production) rồi thêm **`-Trial`**.
     Script tự đặt tên `..._Trial_Install.zip`; khác biệt DUY NHẤT là **có/không `license.lic`**.
   - Oqtane: `pack.cmd` (nuspec exclude `license.lic` cho bản trial).
   - Gói cũ đã backup: `MegaForm_02.00.006_*.prev-20260728.zip`.
3. ⚠️ Build TS trong lượt pack báo **`THAT BAI: unified-monaco`** (1 entry lỗi) — chưa điều tra, cần xem có
   ảnh hưởng gói không.
4. ⚠️⚠️ **Gói build từ worktree này SẼ CHỨA P0 export ẩn danh** ở mục G. **Đừng phát hành** trước khi
   owner quyết xử lý P0.

## 📋 I — PHIÊN SAU: cập nhật DocFX theo product-copy Codex vừa tạo

Nguồn: **`E:/MENU SPECS/MegaForm-product-copy-02.00.006.html`** (Codex tạo, HTML đã cân bằng thẻ).

Nội dung cần đưa vào DocFX — mô tả **đúng 7 public API surface**:

| Surface | Phạm vi |
|---|---|
| `IFormApi` | quản lý form |
| `ISchemaApi` | parse schema để dựng Razor input/view |
| `ISubmissionApi` | query, submit, update, delete |
| `IFileApi` | attachment và download |
| `IDashboardApi` | KPI và thống kê form |
| `ISubmissionDashboardApi` | search, detail, filter, status |
| `IInboxApi` | Inbox, Claim, Approve, Reject, Forward, Comment, Attach File |

- Có sẵn ví dụ Razor dùng `MegaFormScope`, `Dashboard.GetOverviewAsync()`, `Inbox.GetMyInboxAsync()`.
- ⭐ **Ranh giới đã chốt, giữ nguyên khi viết docs**: SDK cung cấp **DTO/schema để lập trình viên tự render
  Razor**; **AI Designer, Builder và Payment Admin KHÔNG phải public SDK** — không được quảng cáo nhầm.
- Việc cần làm: đối chiếu nội dung này với `Docs/SDK_INDEX.md` + `Docs/docfx/articles/sdk-reference.md`
  (đang `M` trong worktree), cập nhật/bổ sung trang DocFX rồi push repo docs
  (`origin` = CissSolution/**DNN_MegaformDocs**).

## 🔴 CÒN LẠI / BÀN GIAO

1. **Chưa commit gì** (owner không yêu cầu; worktree đang bẩn **616 file**, Codex chạy song song).
   File tôi động: 4 `SubformController.cs` · 2 `gallery*.ts` · `shared/preview-active-page.ts` (mới) ·
   `cherry-blossom-*.json` · `tools/templates/fix-sakura-cardfill.mjs` (mới).
   Built JS (`Assets/js/**`) bị **gitignore** — deploy phải build lại, không lấy từ git.
2. **Backlog chưa làm** (owner giao phiên trước): DocFX **Permissions & Access + field visibility by role**
   (chụp nút Expand, quay animation kèm output anon/role) · DocFX **Submissions → Google Sheet + Reports**
   (seed ~300 dòng chậm, chụp dashboard + filter).
3. **Christmas chưa vào bundled templates** trong package (mới chỉ có ở gallery online).
4. **Guard `height:auto!important`** còn gãy cho template khác dùng `aspect-ratio`+`object-fit` — nên sửa
   tận gốc ở `fix_premium_templates.py`.
5. Site demo vẫn ghim gallery theo commit `@01f8388`; khi data API `@main` bắt kịp thì trả về `@main`.
6. **Rollback trang PROD nếu cần**: chạy `out/p-rollback-isvisible.sql` (hiện menu lại) và ghi lại
   `out/p-hub-21980-v1.PRE-20260727.html` vào `HtmlText` (ModuleID 21980, Version 1) + `clear-cache`.

## Tài nguyên tái dùng (scratchpad `<SCRATCH_393fd39d>/gifrec/`)
`p-lib.mjs` (login PROD + SQL Console + clear-cache) · `p-demos.mjs` (bảng 36 tab↔form↔slug) ·
`p-shots.mjs` (chụp hàng loạt, có retry + skip-existing) · `p-upload.mjs` · `p-build-hub.mjs` /
`p-publish-hub.mjs` · `p-qa-hub.mjs` + `p-contact-sheet.mjs` (QA ảnh cục bộ) · `p-verify-live.mjs`
(verify anon 3 breakpoint + 36 link) · `p-fix-sakura-prod.mjs` · `p-diag-sakura{,2,3}.mjs`
(liệt kê **mọi CSS rule đang match 1 element** — rất hợp để truy "ai đè ai").
