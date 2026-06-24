# HANDOFF — Dashboard treo (đơ cả máy) — Phân tích nguyên nhân gốc

**Ngày:** 2026-06-13
**Tác giả:** Claude (Opus 4.8) — phân tích TĨNH (không chạy Oqtane theo yêu cầu)
**Mục đích:** Bàn giao cho người review kỹ thuật + AI khác QA tìm lỗi.
**Trạng thái:** Nguyên nhân gốc ĐÃ xác định + đã fix MỘT PHẦN (B157). **Còn 2 bundle lỗi chưa rebuild → freeze có thể TÁI DIỄN.**

---

## 0. TL;DR (đọc cái này trước)

- **Triệu chứng:** Mở MegaForm dashboard trên Oqtane (`/?mfpanel=dashboard`) → surface mount được (nút "Windowed"/"Fullscreen" hiện ra) nhưng nội dung **trắng + treo, đơ luôn cả máy**.
- **Nguyên nhân gốc:** **Vòng lặp MutationObserver vô hạn** trong `installFullscreenToggle()` (file `src/shared/platform-host.ts`). Hàm `ensure()` — được một `MutationObserver` trên `document.body {subtree:true}` gọi mỗi khi DOM thay đổi — lại gọi `sync()`, mà `sync()` **ghi lại `innerHTML` của nút toggle** → tạo mutation mới → observer gọi lại `ensure()` → `sync()` → … **lặp vô hạn, không có guard**. Mỗi vòng cấp phát DOM/chuỗi + làm ngập microtask queue → **CPU 100% + bùng nổ bộ nhớ → treo cả máy** (không chỉ tab).
- **Vì sao treo CẢ MÁY (không chỉ 1 tab):** loop tạo object/DOM không giới hạn → renderer OOM → Windows swap-thrash → đơ toàn hệ thống.
- **Source ĐÃ được sửa từ trước** (bỏ `sync()` khỏi `ensure()`, xem comment `platform-host.ts:590-593`), **nhưng bundle JS deploy là bản CŨ** (build 11:22, trước khi source được sửa).
- **Fix đã làm (B157):** rebuild + redeploy 4 bundle (`dashboard`, `submissions`, `languages`, `admin-live`) + bump cache version `B156→B157` + rebuild DLL Client. Dashboard giờ render OK (đã verify bằng screenshot headless).
- **⚠️ FIX CHƯA TRỌN VẸN — RỦI RO CÒN LẠI:** còn **2 bundle deploy vẫn chứa code lỗi** (chưa rebuild):
  - `megaform-my-inbox.js` (build 11:22) — **load trên MỌI trang MegaForm** → NGUY HIỂM.
  - `megaform-unified-monaco.js` (build Jun 11) — chỉ load trong builder/code-edit.
  - Do `installFullscreenToggle()` có **global-guard `__mfFsToggle`**, bundle nào load TRƯỚC sẽ cài observer. Nếu `my-inbox` thắng race → **observer LỖI được cài → freeze tái diễn dù dashboard đã sạch.**

---

## 1. Môi trường

- **Host live:** `E:\DNN_SITES\OqtaneSites\Oqtane_new`, port **5000**, login `host` / `Minh@2002`, DB SQLite `Oqtane-202606111406.db`.
  - (Host cũ `Oqtane.Fresh.10.1.0:5005` đã lỗi thời — bundle/DLL cũ.)
- **Bundle JS deploy:** `…/Oqtane_new/wwwroot/Modules/MegaForm/js/`
- **Source TS:** `MegaForm.UI/src/`, build bằng Vite (`scripts/build-entry.cjs <entry>`).
- **Cache version:** const `OqtaneCoreAssetVersion` trong `MegaForm.Oqtane.Client/Index.razor` + `?v=` mỗi Resource. Hiện = `20260613-B157`.

> **LƯU Ý QA:** Việc bật Oqtane + headless Chromium nhiều lần (kèm các tiến trình node treo) cũng góp phần làm máy đơ trong lúc điều tra. Khi QA nên: chạy 1 instance Oqtane, 1 lần headless, và **kill sạch `node.exe`/`Oqtane.Server.exe`/`headless_shell.exe`** sau mỗi lần.

---

## 2. Nguyên nhân gốc — chi tiết kỹ thuật

### 2.1 Vòng lặp (bản LỖI trong bundle đang deploy)

File nguồn: `MegaForm.UI/src/shared/platform-host.ts`, hàm `installFullscreenToggle()` (dòng ~527-609).

**Bản LỖI** (giải-minify từ bundle deploy `megaform-my-inbox.js`):
```js
// ensure() — observer callback
... document.documentElement.classList.toggle("mf-host-editmode", r()),
    p /* nút toggle đã tồn tại */ ){ (_=p.__mfSync)==null || _.call(p); return }   // ⟵ GỌI sync() TRONG ensure()!
    document.body.appendChild(a())
```
- `p.__mfSync` chính là `sync()` (gán ở `...l.__mfSync=p,p(),l`).
- `sync()` làm: `btn.innerHTML = (…SVG…) + '<span class="mf-fs-lbl">' + label + '</span>'` → **ghi lại innerHTML** của nút.
- Nút nằm trong `document.body`; observer quan sát `document.body {childList:true, subtree:true}` → ghi innerHTML = mutation con → observer fire → `ensure()` → `sync()` → … **VÔ HẠN**.

**Bản ĐÃ SỬA** (source hiện tại + bundle dashboard B157):
```js
... classList.toggle("mf-host-editmode", r()), !p && document.body.appendChild(a())   // chỉ append nếu CHƯA có; KHÔNG gọi sync
```
Comment cảnh báo ngay tại nguồn — `platform-host.ts:590-593`:
> *"NOTE: do NOT call sync() here. ensure() runs on every body mutation (the observer), and sync() rewrites btn.innerHTML — which is itself a (subtree) mutation that would re-trigger ensure() → infinite loop."*

### 2.2 Vì sao bundle deploy lại là bản cũ
- Source `platform-host.ts` sửa lúc **12:35 hôm nay**; nhưng các bundle deploy build lúc **11:22** (trước đó) → bản cũ lỗi vẫn đang chạy.
- Bài học: **sửa file shared (`platform-host.ts`) thì PHẢI rebuild MỌI entry bundle import nó**, không chỉ một.

### 2.3 Cơ chế global-guard khiến bug "lây" giữa các bundle
- `installFullscreenToggle()` được gọi ở **top-level** của `platform-host.ts` (dòng 610) → chạy ngay khi import.
- Đầu hàm có guard: `if (window.__mfFsToggle) return; window.__mfFsToggle = true;`
- ⇒ Trên 1 trang load nhiều bundle (Index.razor nạp ~15 script), **bundle nào chạy `installFullscreenToggle()` TRƯỚC sẽ cài observer**; các bundle sau bị guard chặn.
- ⇒ Chỉ cần **1 bundle cũ lỗi** load trước → observer LỖI được cài → freeze. **Sửa dashboard thôi là chưa đủ.**

---

## 3. Bằng chứng tĩnh (grep trên bundle ĐÃ DEPLOY — không cần chạy Oqtane)

Quét toàn bộ `…/Oqtane_new/wwwroot/Modules/MegaForm/js/megaform-*.js`:

| Bundle | Chứa `installFullscreenToggle` | Chữ ký | mtime | Load trên trang? |
|---|---|---|---|---|
| `megaform-dashboard.js` | ✓ | **ĐÃ SỬA** (no `__mfSync`) | 14:31 | mọi trang |
| `megaform-submissions.js` | ✓ | **ĐÃ SỬA** | 14:31 | mọi trang |
| `megaform-languages.js` | ✓ | **ĐÃ SỬA** | 14:31 | mọi trang |
| `megaform-admin-live.js` | ✓ | **ĐÃ SỬA** | 14:31 | (động) |
| **`megaform-my-inbox.js`** | ✓ | **🔴 LỖI (`__mfSync` trong ensure)** | **11:22** | **MỌI trang** |
| **`megaform-unified-monaco.js`** | ✓ | **🔴 LỖI** | Jun 11 | builder/code-edit |

Chữ ký LỖI tìm thấy trong `megaform-my-inbox.js`:
```
...classList.toggle("mf-host-editmode",r()),p){(_=p.__mfSync)==null||_.call(p);return}document.body...
```

---

## 4. Các observer khác đã rà (KHÔNG phải nguyên nhân — ghi để loại trừ)

| Vị trí | Mô tả | Kết luận |
|---|---|---|
| `dashboard/index.ts:3160` | NiceTooltips observer trên `body {subtree, attributeFilter:['title']}`; `convert()` gọi `removeAttribute('title')` | **An toàn** — re-fire 1 lần rồi `getAttribute('title')` trả null → `return` (idempotent). KHÔNG loop vô hạn. |
| `platform-host.ts:772` | Embed-host height observer (iframe nhúng form) → `notifyHeight()` | **An toàn** — chỉ `postMessage`, không sửa DOM → không loop. Chỉ chạy trong iframe embed. |
| `platform-host.ts:519-524` | `clearHostFixedHeaderForInline` scroll-correct | **An toàn** — guard `__mfInlineScrollWatch` (1 lần) + tự gỡ listener sau 4s. |
| `dashboard/ai-form-creator.ts:262,284` | `while(!ready())`, `while(Date.now()-start<5000)` | Cần QA xác nhận có `await`/break — nghi thấp, chỉ chạy khi mở AI creator. |

---

## 5. Việc ĐÃ làm trong phiên này (B157)

1. Sửa đã có sẵn trong source → **rebuild 4 bundle**: `dashboard`, `submissions`, `languages`, `admin-live`
   (`npm run build:dashboard` …). Lệnh sync tự copy vào `MegaForm.Oqtane.Server/wwwroot`.
2. **Copy 4 bundle** sang host live `Oqtane_new/wwwroot/Modules/MegaForm/js/`.
3. **Bump cache version** `20260613-B156 → B157` (5 chỗ trong `Index.razor`, gồm const `OqtaneCoreAssetVersion`).
4. **Rebuild `MegaForm.Oqtane.Client`** (0 errors) + copy DLL sang `Oqtane_new` + restart Oqtane.
5. **Verify** headless (tab phụ, full-load để né Blazor enhanced-nav): dashboard render đầy đủ, KPI "46 biểu mẫu / 46 đã xuất bản", **`consoleErrors: []`, không treo**. (Ảnh `MegaForm.UI/tmp-dash-verify.png`.)

---

## 6. VIỆC CÒN LẠI / khuyến nghị fix (cho AI QA)

### 6.1 Bắt buộc — đóng nốt lỗ hổng race
Rebuild + redeploy **2 bundle còn lỗi** (và bump version):
```bash
cd MegaForm.UI
node scripts/build-entry.cjs my-inbox          # → megaform-my-inbox.js (entry ở vite.config.ts:28)
node scripts/build-entry.cjs unified-monaco     # → megaform-unified-monaco.js
# copy sang E:\DNN_SITES\OqtaneSites\Oqtane_new\wwwroot\Modules\MegaForm\js\
# bump OqtaneCoreAssetVersion B157→B158 trong Index.razor, rebuild Client DLL, restart
```

### 6.2 Quét đề phòng — MỌI bundle import `platform-host`
Các entry import `platform-host` (trực/gián tiếp) cần đảm bảo đã rebuild từ source ≥ 12:35 hôm nay:
`dashboard, submissions, languages, admin-live, my-inbox, unified-monaco, builder (core/panels/toolbar), dnn-host, embed, adapters/dnn`.
> Kiểm tra nhanh (tĩnh): `grep -l "__mfSync" …/js/megaform-*.js` → bất kỳ file nào còn match = **CHƯA fix**.

### 6.3 Fix kiến trúc (đề xuất dài hạn — chống tái phát)
Vấn đề cốt lõi: 1 hàm singleton (`installFullscreenToggle`) bị nhân bản vào ~10 bundle, cập nhật phải đồng bộ tất cả. Chọn 1:
- **(a)** Tách `installFullscreenToggle` thành 1 script độc lập nạp MỘT lần (1 bản duy nhất để sửa), HOẶC
- **(b)** Thêm script build "rebuild-all-platform-host-consumers" chạy chung mỗi khi đụng `src/shared/platform-host.ts`, HOẶC
- **(c)** Bỏ MutationObserver trên `document.body{subtree}` (rất tốn) → dùng cách re-add nút nhẹ hơn (vd quan sát có giới hạn, hoặc re-add trong vòng đời render của surface thay vì observer toàn body).

### 6.4 Hạng mục QA cần xác nhận
1. Sau khi rebuild my-inbox + monaco: mở dashboard **NHIỀU lần / nhiều thứ tự load** → xác nhận `window.__mfFsToggle` được cài bởi bundle ĐÃ SỬA (kiểm tra không còn loop bằng Performance/CPU).
2. Mở `?mfpanel=myinbox` trực tiếp → xác nhận không treo (trước fix, chính my-inbox cài observer lỗi).
3. Mở builder (nơi nạp `unified-monaco`) → xác nhận không treo.
4. Đo bộ nhớ tab khi mở dashboard 60s — không tăng vô hạn.
5. Trang Home `/` (không `?mfpanel`) hiển thị **ô trắng** ở vùng module — **CHƯA điều tra xong** (xem §7).

---

## 7. Vấn đề LIÊN QUAN chưa khép (cần QA)

Trên trang Home `localhost:5000/` (KHÔNG có `?mfpanel`), vùng module MegaForm hiện **ô trắng rỗng** (ảnh người dùng cung cấp). Theo `Index.razor:606-630`, nhánh mặc định: `_formId==0` → admin thấy alert "No form configured"; chưa publish → warning; có form → render form. Ô trắng lớn KHÔNG khớp các alert đó → **cần QA xác định**: (a) module Home có form configured không, (b) form render rỗng hay (c) ô trắng là container `.mf-oq-surface`/min-height rỗng. Chưa bắt được DOM thật vì đã dừng chạy Oqtane theo yêu cầu. *(Khả năng cao đây cũng là hệ quả của freeze cũ — sau khi fix trọn vẹn cần QA lại trang Home.)*

---

## 8. File/dòng tham chiếu nhanh

- `MegaForm.UI/src/shared/platform-host.ts:527-609` — `installFullscreenToggle` (vòng lặp).
- `…platform-host.ts:590-593` — comment cảnh báo "do NOT call sync() here".
- `…platform-host.ts:607-608` — `new MutationObserver(()=>ensure())` quan sát `document.body{childList,subtree}`.
- `…platform-host.ts:610` — gọi top-level + guard `__mfFsToggle` (dòng 529-530).
- `MegaForm.UI/src/dashboard/index.ts:3160-3166` — NiceTooltips observer (đã loại trừ).
- `MegaForm.UI/vite.config.ts:28` — entry `my-inbox` → `src/my-inbox/index.ts`.
- `MegaForm.Oqtane.Client/Index.razor:971` — `OqtaneCoreAssetVersion`; `:1012,1022,1028,1031` — `?v=` mỗi bundle.
- Bundle lỗi còn lại: `…/Oqtane_new/wwwroot/Modules/MegaForm/js/megaform-my-inbox.js`, `megaform-unified-monaco.js`.
- QA scenario đã viết: `MegaForm.UI/tools/scn-dash-verify.cjs` (login → tab phụ → full-load dashboard → bắt console + screenshot).
