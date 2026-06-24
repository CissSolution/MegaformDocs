# BÀN GIAO KỸ THUẬT — Render form MegaForm theo chuẩn Static của Oqtane (bỏ độ trễ "form load chậm")

**Ngày:** 2026-06-21
**Người viết:** AI session (handoff cho dev khắc phục)
**Site test:** Oqtane.MSSQL3 → http://localhost:5070 (host / `abc@ABC1024`)
**Live root / DLLs:** `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3`
**Source:** `e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
**Trạng thái hiện tại:** `LIVE = SOURCE = B217` (ổn định). Mọi thử nghiệm trong phiên đã revert sạch.
**Đọc kèm:** `Docs/RESEARCH_20260621_OQTANE_CONTACTFORM_STATIC_RENDERMODE.md` (nghiên cứu gốc, §6 = plan).

---

## 0. TL;DR (cho dev)

- **Vấn đề:** public form của MegaForm KHÔNG nằm trong HTML đầu tiên của trang chính → trình duyệt nhận HTML rỗng (phần form) → chờ JS + WebSocket (Blazor circuit) → renderer mới vẽ form → **chậm ~0.7–1s warm, tới ~12s cold**.
- **Gốc rễ:** module `MegaForm.Oqtane.Client/Index.razor` chạy ở **RenderMode = InteractiveServer** (mặc định, KHÔNG override). Hiện tại form được né bằng **iframe** trỏ tới `/api/MegaForm/render/{id}` (form server-render trong iframe), NHƯNG iframe chỉ được JS chèn vào **sau khi circuit kết nối** → vẫn chậm.
- **Lời giải đúng (chuẩn Oqtane):** render public form ở **RenderMode = Static** (như `OqtaneLabs.ContactForm`) → form HTML nằm sẵn trong response đầu, không circuit, không iframe, **tức thì**.
- **ĐÃ CHỨNG MINH form Static chạy** (spike B220): form anon — kể cả custom-HTML 22 field — render hoàn hảo, không circuit, không iframe, 0 lỗi, ~653ms warm.
- **RÀO CẢN (đã chứng minh, ĐỪNG lặp lại):** KHÔNG thể đặt RenderMode = Static theo điều kiện (anon→Static / admin→Interactive) trong **cùng một control**, vì RenderMode được Oqtane đọc QUÁ SỚM (chưa có User/URL). 3 tín hiệu đều fail (xem §5).
- **Việc cần làm:** **refactor cấu trúc** — tách form-view (Static cố định) khỏi admin (Interactive). Hai phương án ở §7. Đây là việc lớn, nhiều bước, **bắt buộc QA hồi quy toàn bộ admin surface**.

---

## 1. Kiến trúc render hiện tại (B217) — file & dòng chính xác

File chính: **`MegaForm.Oqtane.Client/Index.razor`** (~3300 dòng, là CẢ form-view LẪN toàn bộ admin trong 1 component).

### 1.1. RenderMode hiện tại
- **KHÔNG có `public override string RenderMode`** trong Index.razor → kế thừa mặc định `ModuleBase.RenderMode` = `RenderModes.Interactive` → toàn module là **InteractiveServer** (có Blazor circuit/WebSocket).
- Hằng RenderModes của Oqtane (verify trong `Oqtane.Shared.dll`): chỉ có `Interactive`, `Static`, `Headless` (KHÔNG có "InteractiveServer"/"ServerPrerendered" dạng string).

### 1.2. Cây render (markup) — `Index.razor`
- Dòng **715**: `@if (_formId > 0 && IsFormMode && !IsPopupMode && _panelMode == MfPanelMode.None && !_embedMode)` — nhánh hiển thị FORM.
  - Bên trong: list view / card view / **iframe branch (1051)** / **in-place else branch (1081)**.
- Dòng **1051**: `else if (_fastEmbed && !SsrMode && _formId > 0 && _isPublished && !IsPopupMode && !_embedMode)` → render **host div rỗng** `<div class="mf-fast-embed-host" data-mf-fast-form="@_formId">` (KHÔNG có iframe trong markup — iframe do JS chèn, xem 1.4).
- Dòng **1081** (`else`): render `<div id="@FormMountId">` + (nếu SsrMode) form SSR + (else) `@RenderFormSkeleton` (skeleton shimmer).
- Dock admin (nút Settings/Form Builder/Form Dashboard): dòng **20–25**, đều **`@onclick`** Blazor (xem 1.5).

### 1.3. `_fastEmbed` (bật iframe) — mặc định ON
- Dòng **1522**: `_fastEmbed = true;` (reset mỗi lần parse). Opt-out: `?mffast=0` (query) hoặc per-module setting `MegaForm:FastEmbed=false`.

### 1.4. Boot JS — chạy trong `OnAfterRenderAsync` qua interop (ĐIỂM MẤU CHỐT)
- Dòng **1732**: `_pendingRendererBoot = (_fastEmbed && !SsrMode && !IsPopupMode) ? BuildFastEmbedBootScript() : BuildRendererBootScript();`
- Dòng **1769**: `await Js.InvokeVoidAsync("eval", _pendingRendererBoot);` — **chỉ chạy SAU khi circuit kết nối** (OnAfterRender của InteractiveServer). ⚠️ Đây là lý do form chờ circuit.
- `BuildFastEmbedBootScript()` (dòng **3199**): tạo `<iframe class="mf-fast-embed-frame" src="/api/MegaForm/render/{id}">` bằng JS, idempotent, + listener postMessage auto-resize.
- `BuildRendererBootScript()` (dòng **3141**): boot renderer in-place — **TỰ TÚC, poll-based** (`waitForCore()` chờ `MegaFormRenderer` global + mount, rồi fetch `/api/MegaForm/Schema/{id}` hoặc đọc preload-schema, gọi `MegaFormRenderer.init`). **Quan trọng: script này KHÔNG phụ thuộc Blazor — chạy được như `<script>` tĩnh** (đã verify ở B220).

### 1.5. Dock admin — Blazor `@onclick` (sẽ chết nếu module Static)
- `@onclick="ToggleSettingsPanel"` (dòng 20), `@onclick="OpenBuilderPanel"` (21), `@onclick="OpenDashboardPanel"` (22).
- `OpenBuilderPanel()` (dòng **2530**): `=> NavigationManager.NavigateTo(BuildPanelUrl("builder"))` — chỉ điều hướng URL, NHƯNG vì là `@onclick` nên **cần module Interactive** để wire.

### 1.6. Server SSR sẵn có (TÁI DÙNG cho refactor)
- File **`MegaForm.Oqtane.Server/Controllers/MegaFormController.RenderPage.cs`**:
  - Dòng **40**: `public IActionResult RenderPage(int formId)` — endpoint `/api/MegaForm/render/{id}`.
  - Dòng **59**: `fieldsBody = FormHtmlRenderer.RenderFieldsBody(schema, formId, null);` — **server-render TOÀN BỘ form HTML**. (Bằng chứng: `curl /api/MegaForm/render/743` = 34KB, 53 input, 5 select, 70 mf-field marker — form đầy đủ.)
- ⇒ **Khả năng server-render form ĐÃ CÓ SẴN.** Refactor chỉ cần đưa output này vào markup của control Static thay vì vào iframe.

### 1.7. Asset version (cache-bust)
- File **`MegaForm.Oqtane.Shared/AssetVersion.cs`** → `MegaFormAssetVersion.Current = "20260621-B217"` (`static readonly`, KHÔNG `const`). Bump khi đổi JS/CSS; Client+Server đọc runtime.

---

## 2. Bằng chứng "form không trong first-paint" (HTML thô, no JS)

```
curl http://localhost:5070/             → 77KB, 3 input (đều là search/anti-forgery), 0 select, 0 mf-field marker,
                                           CÓ marker Blazor:{"type":"server"...}  (= InteractiveServer)
curl http://localhost:5070/?formid=743  → tương tự, form container RỖNG
curl /api/MegaForm/render/743           → 34KB, 53 input, 5 select, 70 mf-field marker  (form SSR — nhưng trong IFRAME)
```

**Đọc số liệu:** form thật KHÔNG ở trang chính. Nó SSR sẵn nhưng trong tài liệu iframe riêng (`render/{id}`), và iframe chỉ được chèn sau circuit ⇒ first-paint của trang chính không có form ⇒ chậm. Đo timeline (CDP): host-div + iframe xuất hiện cùng lúc (**headroom = 0ms**) tại ~267ms warm / ~680ms+ cold — tức không thể chèn iframe sớm hơn vì phải chờ Blazor sinh host-div.

---

## 3. ContactForm của Oqtane làm thế nào (SO SÁNH SOURCE)

Source: `E:\DNN_SITES\OqtaneSites\OqtaneLabs.ContactForm-main\OqtaneLabs.ContactForm-main` (v10.0.0, net10.0 — CÙNG framework).

| Khía cạnh | **OqtaneLabs.ContactForm** | **MegaForm hiện tại (B217)** |
|---|---|---|
| RenderMode form-view | `public override string RenderMode => RenderModes.Static;` (Index.razor:59) | KHÔNG override → `Interactive` (cả module) |
| Form HTML | Server-render thẳng trong markup → **trong HTML đầu** | Trong iframe (`render/{id}`), chèn sau circuit |
| Circuit | **Không** (Static) | Có (InteractiveServer) |
| Submit | Static **enhanced form**: `<form method="post" @formname @onsubmit data-enhance>` + `[SupplyParameterFromForm]` + antiforgery (Index.razor:13, 61–77) | JS AJAX POST `/Submit` |
| Cấu hình admin | **Control RIÊNG** `Settings.razor : ISettingsControl` (Oqtane mở dialog Settings) — KHÔNG nằm trong form-view | Dock + panels `@onclick` NẰM TRONG form-view (Index.razor) |
| JS | 1 `onclick` vanilla + `data-enhance` (toàn cục) | renderer.js 210KB + ~13 bundle |

**Bài học cốt lõi:** ContactForm tách **form-view (Static cố định)** khỏi **admin config (control riêng)**. Form luôn Static → tức thì cho mọi người. Admin không cần form-view interactive.

ContactForm Index.razor (rút gọn):
```razor
@inherits ModuleBase
<form method="post" @formname="ContactForm" @onsubmit="SendMessage" data-enhance>
    <input type="hidden" name="__RequestVerificationToken" value="@SiteState.AntiForgeryToken" />
    <input id="field1" name="field1" class="form-control" @bind="@_name" />
    ...
</form>
@code {
    public override string RenderMode => RenderModes.Static;     // ← điểm mấu chốt
    [SupplyParameterFromForm(FormName="ContactForm")] public string Field1 { get => ""; set => _name = value; }
    private async Task SendMessage() { ... }   // chạy server-side khi POST, không circuit
}
```

---

## 4. Điều cần đạt (mục tiêu refactor)

Render **public form vào HTML đầu tiên của trang chính** (Static), không iframe, không chờ circuit — đồng thời **giữ nguyên 100% admin** (builder/dashboard/submissions/workflow/AI/settings/languages/portal/SDK).

---

## 5. ⚠️ CÁC LỖI/RÀO CẢN ĐÃ MẮC (ĐỪNG LẶP LẠI)

### 5.1. ❌ Conditional RenderMode trong CÙNG control (spike B220) — VỠ ADMIN
**Đã thử:** `public override string RenderMode => IsLightLoadContext ? RenderModes.Static : base.RenderMode;` + bỏ iframe branch khi static + emit `BuildRendererBootScript()` như `<script>` tĩnh.
- **Anon: HOÀN HẢO** (form trong HTML đầu, không circuit, không iframe, custom-HTML 743 render đủ, 0 lỗi, ~653ms). → Phần render form Static **đã chứng minh khả thi**.
- **Admin: VỠ.** Module bị Static cho cả admin → dock `@onclick` chết (bấm "Form Builder" không mở), iframe-preview không chèn (không OnAfterRender).
- **Nguyên nhân:** Oqtane đọc `RenderMode` lúc khởi tạo module — **TRƯỚC khi `NavigationManager.Uri` có query VÀ trước khi `PageState.User` được set**. Nên `IsLightLoadContext` trả `true` (tưởng anon) ngay cả admin ở `?edit=true`.

### 5.2. ❌ Tín hiệu cascading HttpContext (spike B221) — KHÔNG FLOW
**Đã thử:** `[CascadingParameter] HttpContext OqHttpContext` + thêm `<FrameworkReference Include="Microsoft.AspNetCore.App"/>` (net10) để có kiểu HttpContext (compile OK) + fail-safe (chỉ Static khi HttpContext xác nhận anon, else = B217).
- **Kết quả:** cascading `HttpContext` **NULL bên trong module MegaForm** → Oqtane **không flow** HttpContext xuống module component → fail-safe → anon vẫn iframe (không lợi ích). Đã revert (cả FrameworkReference).

### 5.3. KẾT LUẬN (đã chứng minh hết): KHÔNG có tín hiệu sớm đáng tin
3 tín hiệu cho "request có phải anon không, tại thời điểm đọc RenderMode" đều fail:
| Tín hiệu | Trạng thái lúc đọc RenderMode |
|---|---|
| `PageState.User` | chưa set (null) |
| `NavigationManager.Uri` (query `?edit=`) | chưa có query |
| cascading `HttpContext` | Oqtane không flow xuống module (null) |

⇒ **Conditional RenderMode trong 1 control là BẤT KHẢ THI.** Form-view phải là `RenderMode.Static` **CỐ ĐỊNH** → buộc tách admin ra ngoài.

### 5.4. ❌ Các lỗi nhỏ khác đã gặp (tham khảo)
- **B219 asset-gate** (bỏ asset thừa khỏi parent anon): 0 lợi băng thông (asset chỉ dời sang iframe, tổng byte không đổi) + **vỡ `?mffast=0`** (Resources getter đọc trước khi có URL query — cùng lớp hazard timing). → Đừng gate asset trong Resources getter theo URL.
- **@key trên host div** (B218): vô tác dụng (edit-mode thay cả subtree module nên @key không giữ được). Đừng thêm lại.
- **Prerender = true**: TUYỆT ĐỐI không bật cho đường InteractiveServer — gây recreate iframe (double-load) HOẶC circuit-death (JS renderer sửa DOM Blazor-quản-lý). Static mode KHÁC (không circuit) — đừng nhầm lẫn 2 cơ chế.

---

## 6. ✅ Sự thật đã CHỨNG MINH (làm nền cho refactor)

1. **Static render → form anon tức thì, KHÔNG circuit, KHÔNG iframe** (B220). Form custom-HTML premium 743 (22 field) render đầy đủ, 0 lỗi. Ảnh: `tmp-qa/out-b220/anon-743.png`.
2. **`BuildRendererBootScript()` chạy được như `<script>` tĩnh** (poll-based, không cần Blazor interop). Đây là cách boot renderer trong Static mode.
3. **Server-render form đã có sẵn** (`FormHtmlRenderer.RenderFieldsBody`, RenderPage.cs:59) — tái dùng cho SSR body nếu muốn first-paint có sẵn field (thay vì skeleton → JS build).
4. **Static mode KHÔNG có circuit → JS renderer sửa DOM thoải mái, KHÔNG circuit-batch-death** (lỗi đã giết option-C prerender). Đây là điểm mấu chốt khiến Static khả thi còn prerender thì không.

---

## 6b. ⭐ PHÁT HIỆN QUAN TRỌNG — Blazor là THIN SHELL, logic nặng ở bundle JS; DNN đã làm ĐÚNG pattern

Khảo sát cấu trúc cho thấy **lo ngại "extract toàn bộ admin" là quá bi quan**. Thực tế:

**(a) Blazor component = thin shell over Vite/TS bundles.** Mọi surface (form/builder/dashboard/submissions/inbox/languages/AI) là **bundle JS**, Blazor chỉ render mount div + boot JS:
| Blazor component | Dòng | Thực chất |
|---|---|---|
| Form-view branch (Index.razor:1081) | ~vài chục | mount div + boot |
| `BuilderView.razor` | 275 | `<div id="mf-builder-root">` + `Js.eval` boot `megaform-builder-loader.js` |
| `DashboardView.razor` | 305 | `<div id="mf-dashboard-root">` + boot `megaform-dashboard.js` |
| `SubmissionsView.razor` | 98 | `<div id="mf-submissions-root">` + bundle **tự self-mount** |
| MyInbox / Languages (Index.razor:481/495) | ~10 | `<div id="..-root" data-*>` thuần — JS tự mount |

⇒ Logic nặng KHÔNG ở Blazor. Thứ DUY NHẤT trói vào InteractiveServer = **cơ chế boot** `Js.InvokeVoidAsync("eval", …)` trong `OnAfterRenderAsync` (cần circuit). Bundle JS là **RenderMode-agnostic** (chạy y hệt dù Static hay Interactive). Nhiều bundle ĐÃ self-mount trên DOMContentLoaded (`admin-live/index.ts:21`, `ai-form-assistant/chat.ts:1350`, list/card views, SubmissionsView).

**(b) DNN (`MegaForm.DNN/Views/FormView.ascx`, 752 dòng) = bản mẫu LÀM ĐÚNG, KHÔNG dính vấn đề.** WebForms render TẤT␣CẢ mount + data-attribute + overlay vào HTML server đầu tiên (đồng bộ): `<div id="mf-dnn-host" data-form-id=...>` (form), `mf-builder-root`, `mf-dashboard-root`, `mf-submissions-root`, `mf-languages-root`. Bundle JS **tự self-mount trên DOMContentLoaded → KHÔNG có Blazor circuit → không chờ WebSocket**. Độ trễ DNN = chỉ tải JS + build. (DNN vẫn CSR field; muốn tức thì hơn thì server-render field body, nhưng KHÔNG có cú chậm circuit của Oqtane.)

**(c) Hệ quả cho plan:** đường đúng cho Oqtane = **bê pattern DNN sang**: module Static cố định + đổi boot interop→static-`<script>`/self-mount + dock `@onclick`→`<a href>` + settings panel→`ISettingsControl` dialog (như ContactForm). Phần lớn admin (builder/dashboard/submissions/inbox) là JS tự mount → **chạy dưới Static, KHÔNG cần bóc tách**. Việc thật bounded: (1) cơ chế boot, (2) dock-link, (3) settings panel.

**Mảng Blazor-interactive THẬT duy nhất cần xử lý = SETTINGS PANEL** (Index.razor ~60–220: accordion `@onclick`, `@bind`, `SaveInlineSettingsAsync`). Phương án: chuyển sang Oqtane `Settings.razor : ISettingsControl` (Oqtane host dialog riêng — đúng cách ContactForm) HOẶC chuyển logic sang JS (POST fetch).

⇒ **Phương án A/B ở §7 vẫn đúng nhưng "extraction" thực ra rất nhỏ** (chủ yếu là đổi cơ chế boot + settings + dock-link), KHÔNG phải di chuyển hàng nghìn dòng admin. Spike A0 vẫn nên làm để xác nhận self-mount/static-boot hoạt động cho builder/dashboard dưới Static.

## 7. GIẢI PHÁP — refactor tách control (2 phương án)

> Nguyên tắc: **form-view = `RenderMode.Static` CỐ ĐỊNH**; admin interactivity nằm RIÊNG.

### Phương án A — Interactive island trong module Static (ưu tiên nếu Oqtane hỗ trợ child `@rendermode`)

**Bước A0 — SPIKE quyết định (RẺ, làm TRƯỚC):**
- Tạm thêm `public override string RenderMode => RenderModes.Static;` (cố định) vào Index.razor + 1 child component `Probe.razor` với 1 nút `@onclick` tăng biến đếm, đặt `@rendermode="InteractiveServer"`.
- Build, deploy, login, bấm nút. **Nút chạy (số tăng) ⇒ Oqtane hỗ trợ interactive island trong module Static ⇒ Phương án A khả thi.** Nút chết ⇒ chuyển Phương án B.
- ⚠️ Trong lúc spike, dock thật sẽ tạm chết (module Static) → revert ngay sau khi đo.

**Nếu A khả thi:**
- **A1.** Đưa render form-view vào thân module Static: mount div + (tuỳ chọn) SSR body (`FormHtmlRenderer`) + skeleton + emit `BuildRendererBootScript()` như `<script>` tĩnh. (Tất cả đã verify ở B220.)
- **A2.** Trích TOÀN BỘ admin surface ra 1 child `<MegaFormAdmin @rendermode="InteractiveServer" .../>`, chỉ render khi `_isAdmin`:
  - Dock (Settings/Builder/Dashboard) + mọi nhánh `@if (_panelMode == ...)` (builder/dashboard/submissions/portal/myinbox/languages/sdkdemo) + các `@code` method liên quan (`OpenBuilderPanel`, `OpenDashboardPanel`, `ToggleSettingsPanel`, `SaveInlineSettingsAsync`, accordion toggles, QA buttons, starter role, workflow panel...).
  - Module Static (cha) tính `_formId`/settings/parse-state → truyền xuống child qua `[Parameter]`.
- **A3.** Form (Static) paint tức thì; admin island tự lập circuit riêng, mọi `@onclick` chạy.

### Phương án B — Control Oqtane riêng (nếu island KHÔNG hỗ trợ)
- `Index.razor` → control form-VIEW Static cố định. Cho admin: render vài `<a href>` link (hoặc dùng menu ▼ action của Oqtane) điều hướng tới control admin.
- Tạo control mới `Manage.razor` (Interactive) chứa dock + mọi panel. Vào qua menu ▼ / `?control=Manage`.
- ⚠️ Thay đổi UX admin (từ dock inline → surface "Manage" riêng).

### So sánh
| | A (island) | B (control riêng) |
|---|---|---|
| Giữ UX admin (dock inline) | ✅ | ❌ (đổi sang menu/surface) |
| Phụ thuộc Oqtane hỗ trợ child rendermode | ✅ cần verify (A0) | ❌ không cần |
| Độ phức tạp wiring | Trung bình–cao | Cao (routing control + di chuyển code) |

---

## 8. Quy trình BUILD / DEPLOY / QA / ROLLBACK

### Build (C# / Razor)
```
cd "e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
dotnet build MegaForm.Oqtane.Client/MegaForm.Oqtane.Client.csproj -c Debug -f net10.0
```
(Build Client tự build Shared. Nếu đổi JS/CSS thì còn cần `npm` trong `MegaForm.UI` — không liên quan refactor này.)

### Deploy (thủ công ra live root)
```
cp MegaForm.Oqtane.Client/bin/Debug/net10.0/MegaForm.Oqtane.Client.Oqtane.dll  E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\
cp MegaForm.Oqtane.Shared/bin/Debug/net10.0/MegaForm.Oqtane.Shared.Oqtane.dll  E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\
```
(Đổi Server code → build+deploy thêm `MegaForm.Oqtane.Server.*.dll`. RenderPage đọc version runtime.)

### Restart server (CHỈ PID phục vụ :5070)
```powershell
$p = (Get-NetTCPConnection -LocalPort 5070 -State Listen).OwningProcess
Stop-Process -Id $p -Force; Start-Sleep 2
Start-Process "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\Oqtane.Server.exe" -WorkingDirectory "E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3"
```

### Verify nhanh
```
curl http://localhost:5070/ | grep -oE "20260621-B2[0-9][0-9]"          # đúng version stamp
curl http://localhost:5070/?formid=743 | grep -oE "<select" | wc -l       # >0 ⇒ form ĐÃ trong HTML đầu (Static OK)
```

### Visual QA (Playwright)
- Harness có sẵn: `tmp-qa/qa-static-rendermode-b220-20260621.cjs` (anon static + admin), `qa-netwaterfall-20260621.cjs`, `qa-hostedit-timing-20260621.cjs`.
- ⚠️ Trước khi chạy harness: đảm bảo `MegaForm.UI/node_modules/playwright-core` còn (npm install có thể prune nó → `npm i playwright-core --no-save`).
- Login QA: `/login`, `#username`=host, `#password`=abc@ABC1024, nút `button:has-text("Login")`.

### Rollback về B217 (an toàn)
```
cp E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_preB220_Client.dll  ...\MegaForm.Oqtane.Client.Oqtane.dll
cp E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL3\_mfbackup_20260621_preB220_Shared.dll  ...\MegaForm.Oqtane.Shared.Oqtane.dll
# + restart. (Backups _preB220 / _preB221 / 102643_preB217 đều = B217 hoặc B216, ở MSSQL3 root.)
```

---

## 9. CHECKLIST QA HỒI QUY (PHẢI xanh hết trước khi ship)

**Anon (đường mới Static):**
- [ ] `curl /?formid=<id>` → HTML đầu CÓ field (`<select>`/`<input>`/mf-field marker > 0).
- [ ] Form render đủ field, 0 console error, **không** WebSocket `/_blazor` (circuit=0).
- [ ] Custom-HTML form (vd 743) render đúng layout (hero/chips/fields).
- [ ] Submit hoạt động (POST /Submit → 200, thank-you hiện).
- [ ] Popup mode (form display=popup) vẫn chạy.
- [ ] Multi-step / conditional / rich dropdown (country picker) vẫn chạy.

**Admin (PHẢI không regress):**
- [ ] Dock hiện + bấm **Settings / Form Builder / Form Dashboard** đều MỞ đúng surface.
- [ ] Builder load + sửa + **Save giữ published** + Publish.
- [ ] Dashboard / Submissions / My Inbox / Workflow inbox / Languages / Portal / SDK demo mở được.
- [ ] AI Designer (nút ✨) mở + apply-to-form.
- [ ] Module Settings (Oqtane dialog) lưu được; đổi form-binding nhận ngay (settings-cache invalidate).
- [ ] Edit mode (`?edit=true`) + menu ▼ Oqtane không bị che/lỗi.

**Cache/version:**
- [ ] Bump `AssetVersion.cs` khi đổi JS/CSS; verify stamp đồng nhất host + render-page (curl).

---

## 10. Bất biến / cảnh báo quan trọng (ĐỪNG vi phạm)

- ❌ KHÔNG bật `Prerender => true` cho đường InteractiveServer (recreate iframe / circuit-death). Static là cơ chế KHÁC (không circuit).
- ❌ KHÔNG conditional RenderMode trong 1 control (đã chứng minh bất khả thi — §5).
- ❌ KHÔNG gate asset / quyết định render theo `NavigationManager.Uri` query hay `PageState.User` trong Resources getter / RenderMode (đọc quá sớm, chưa sẵn).
- ❌ KHÔNG gate admin CSS cho anon (đã gây vỡ dashboard B205/B206).
- ✅ Live deploy path = `Oqtane.MSSQL3` (KHÔNG phải `Oqtane_new` / source wwwroot).
- ✅ Iframe (`render/{id}` + `embed.html`) giữ lại cho QR-code → mobile form link (đừng xoá endpoint).
- ✅ `_mfbackup_*` ở MSSQL3 root = các bản B217/B216 để rollback.

---

## 11. Phụ lục — file & dòng tham chiếu nhanh

| Mục | File | Dòng |
|---|---|---|
| Render form branch (gốc) | Index.razor | 715 |
| iframe branch | Index.razor | 1051 |
| in-place else branch | Index.razor | 1081 |
| Resources getter | Index.razor | 1178 |
| IsLightLoadContext | Index.razor | 1234 |
| `_fastEmbed = true` | Index.razor | 1522 |
| chọn boot (fast vs renderer) | Index.razor | 1732 |
| OnAfterRender eval boot | Index.razor | 1769 |
| dock @onclick (Settings/Builder/Dashboard) | Index.razor | 20–22 |
| OpenBuilderPanel | Index.razor | 2530 |
| ToggleSettingsPanel | Index.razor | 1994 |
| BuildRendererBootScript (in-place, poll-based) | Index.razor | 3141 |
| BuildFastEmbedBootScript (tạo iframe) | Index.razor | 3199 |
| RenderPage endpoint (SSR form) | MegaFormController.RenderPage.cs | 40 |
| FormHtmlRenderer.RenderFieldsBody | MegaFormController.RenderPage.cs | 59 |
| AssetVersion | AssetVersion.cs | 29 |
| **ContactForm RenderMode=Static** | OqtaneLabs.ContactForm/Client/Index.razor | 59 |
| **ContactForm Settings control** | OqtaneLabs.ContactForm/Client/Settings.razor | — |

**Hết. Bản B217 hiện tại ổn định; refactor §7 là việc kế tiếp, làm tăng dần + QA theo §9.**
