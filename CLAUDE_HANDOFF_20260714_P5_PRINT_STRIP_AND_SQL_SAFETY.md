# HANDOFF 2026-07-14 (p5) — DNN: print preview, DB panel, và 3 YÊU CẦU MỚI của owner

Site QA: **http://dnn10322_megaclean.ai/** (host / `dnnhost`), trang `/TestPinPage456`, module **385**,
form QA: **43** ("Country New Form", đang **Draft**), **44** (AI sinh, bind `dbo.MFDemo_NoPkLead`).
DB: `DNN10322_MegaClean` (SQL Server `WINDOWS-11\SQLEXPRESS`, Integrated Security).
Site đang chạy **hot-swap** (DLL + JS), **CHƯA repack gói**.

---

## 0. XONG trong phiên này (đã verify live)

| Commit | Nội dung |
|---|---|
| `1b3fc31` | **AI designer thấy bảng SQL trên DNN** — 3 lỗi AiTools (shape `{count,results}` vs `j.tables`; `connectionKey` bị bỏ qua; `SqlConnections` trả trùng `DashboardDatabase`) + rule 10 |
| `f258204` | **Canvas tab Build trắng** — CSS `OneSurfaceAtATime` ẩn `.mf-form-wrapper` không định danh, mà **canvas builder dùng chung class đó** |
| `9b707af` | **`ExternalTableController` port sang DNN** (+ `DnnExternalBindingStore`) → Capability probe + AI-on-rails chạy; **bảng KHÔNG PK = `insertonly`**, không phải unsupported |
| `396aac4` | **Gỡ strip "In use by this form"** (+ "Build fields with AI", "Clear", "+ Use") — chỉ còn 1 cửa: **⚡ Capability** |
| (chưa commit) | **Print preview cho DNN** — xem §1 |

---

## 1. 🔴 ĐANG DỞ — Print preview trên DNN (code đã viết, chưa commit)

### Đã làm
- **Nguyên nhân gốc:** nút Preview (tab Print) mở cứng `/f/{id}/print` cho **mọi nền**, nhưng route đó
  **chỉ có ở `MegaForm.Web`** (`PrintController`). Oqtane + DNN chỉ có `Submissions/{id}/Print` (in bản
  **đã điền**). Trên DNN → rơi vào trang 404 của DNN (ảnh owner gửi).
- **Mới thêm:** `MegaForm.DNN/WebApi/PrintController.cs` — `GET /DesktopModules/MegaForm/API/Print/Form?formId=N`
  - Dùng `RenderModelResolver.ResolveSchema(SchemaJson, SettingsJson, …)` (⚠️tránh bẫy **SettingsJson đè SchemaJson** trên DNN)
    + `PrintFormRenderer` của Core → shell mỏng.
  - Auth: `[AllowAnonymous]` + gate — **admin portal xem được cả form Draft** (để Preview trong builder chạy);
    ẩn danh chỉ khi `printSettings.enabled` **và** form `Published`. Form khác portal → 404. Không trả `ex.Message`.
  - Trả **HTML** (endpoint được *điều hướng tới*, không phải fetch) → lỗi cũng là trang HTML đọc được.
- **Client:** `print-settings.ts` thêm **1 chokepoint** `printPreviewUrl(formId)`: DNN → endpoint mới,
  còn lại → `/f/{id}/print`. Dòng mô tả trong tab cũng hiện đúng URL theo nền.
- **Verify:** route sống (`formId=99999` → 404 "Form not found"; form chưa bật print → trang thông báo rõ ràng,
  KHÔNG còn 404 của DNN). Tab Print bật được toggle, hint hiện `/DesktopModules/MegaForm/API/Print/Form?formId={id}`.

### 🔴 Chặn ở đâu (việc phiên sau)
**`printSettings` KHÔNG được lưu.** Sau khi bật toggle + bấm Save (trong tab Print) + Save form:
```sql
SELECT FormId, Status,
       CASE WHEN SchemaJson   LIKE '%printSettings%' THEN 1 ELSE 0 END AS SchemaHasPrint,
       CASE WHEN SettingsJson LIKE '%printSettings%' THEN 1 ELSE 0 END AS SettingsHasPrint
FROM MF_Forms WHERE FormId = 43;
-- → 43 | Draft | 0 | 0     (settingsJson dài 2331 ký tự nhưng KHÔNG có printSettings)
```
→ endpoint đúng nhưng luôn trả "Print layout is OFF".
**Nghi can #1 (mạnh):** builder Save **rơi mất `settings.printSettings`** — **cùng lớp bug với "builder Save XOÁ
WorkflowJson"** đã gặp 07-11 (xem memory `project_20260711_workflow_approval_qa_executed`). Kiểm tra
`MegaFormBuilder.updateSettings({printSettings})` có thực sự vào payload `SaveForm` không (DNN + Oqtane + Web).
**Nghi can #2:** nút Save tôi click qua CDP không phải nút lưu form.
👉 Làm: bật print bằng tay trên UI → Save → chạy lại query trên. Nếu vẫn 0 ⇒ lỗi ở đường save, vá ở Core/controller
(3 twin), rồi mới QA lại tài liệu in.

---

## 2. 🆕 YÊU CẦU MỚI (owner giao cuối phiên) — ưu tiên cho phiên sau

### 2.1 ⭐⭐⭐ RULE AN TOÀN BỘ NHỚ cho MỌI đường đọc SQL (quan trọng nhất — làm trước)
> "nếu số liệu trong SQL table quá lớn thì phải có cơ chế **limit** hoặc **đọc từng phần kiểu AJAX**, không được
> đọc 1 lúc hàng chục nghìn bản ghi sẽ bị **tràn bộ nhớ** → điều này phải áp dụng cho **tất cả** SQL dropdown,
> repeater… → **rà soát lại và thành RULE** để MegaForm hoạt động an toàn trên **mọi platform**."

Việc phải làm:
1. **Rà soát toàn bộ đường đọc SQL do người dùng cấu hình** — tối thiểu: `optionsSql` (dropdown/select, kể cả
   cascade), DataGrid/DataGrid-SQL, **DataRepeater** (`widgetProps.masterQuery`), Subform (`Subform/Rows`),
   Razor widget (`masterQuery`/`razorSource`), `AiTools/PreviewSql`, `ExternalTable` list/rows, export/report.
   Với **mỗi** đường: có `TOP/LIMIT` server-side chưa? có phân trang chưa? client có `fetch` toàn bộ rồi lọc không?
2. **Áp cơ chế bắt buộc:** cap cứng server-side (vd `TOP (n)` do server chèn, không tin client), phân trang
   (`page`/`pageSize` + `total` gần đúng), và **search-as-you-type kiểu AJAX** cho dropdown lớn (không nạp hết).
   Fail-safe: vượt ngưỡng → trả lỗi/cắt + cảnh báo, **không bao giờ nạp hết**.
3. **Ghi thành RULE** trong `Docs/SECURITY_CODING_RULES.md` (mục mới: "Bounded reads") **và** `CLAUDE.md`
   (rule #11) — 4 platform. Có sẵn tín hiệu: `CapabilityDecisionEngine` đã có `RequiresFilterBeforeList`
   (Size.Bucket == "XL") — tái dùng khái niệm này thay vì đẻ cơ chế mới.
4. Test: bảng ~500 dòng (yêu cầu 2.2) + 1 bảng lớn (vài chục nghìn dòng) để chứng minh không tràn.

### 2.2 ⭐⭐ Demo trên DNN (dựng thật, không mock)
- **Form "Country" nhập số liệu THẲNG vào bảng SQL** (databaseInsert → bảng thật).
- **Submission dashboard có lựa chọn nguồn xem**: **từ SQL Table** (form có bind SQL) **hoặc mặc định**
  (MF_Submissions). ⚠️Bối cảnh sẵn có: `ExternalTable/Bind` đã ghi binding (`MF_ExternalBindings`, mode
  `readonly`) và **đường ĐỌC từ bảng khách (P1/P3) chưa ship** → đây chính là phần còn thiếu.
- **Tạo 1 bảng ~500 dòng** và submissions **phải xem được từ bảng đó** (đúng ràng buộc §2.1: phân trang).
- **Form có 2 dropdown CASCADE chạy SQL**: chọn dropdown 1 (SQL) → dropdown 2 **repopulate theo giá trị** của 1.
  ⭐bẫy đã biết: thiếu `optionsConnectionKey` → dropdown trả `[]` **im lặng**; cascade dùng
  `properties.optionsDependsOn:["parent_key"]`.

### 2.3 ⭐⭐ DocFx cho DNN + push GitHub để owner review
- Đọc phần **DocFx đang có cho Oqtane** (`Docs/docfx/**`, site live `https://cisssolution.github.io/MegaformDocs/`,
  Actions tự build khi push `master` chạm `Docs/docfx/**`) → **làm bộ tương tự cho nhánh DNN**, rồi **push lên GitHub**;
  owner sẽ review.

---

## 3. Ghi chú kỹ thuật / bẫy mới của phiên này (đừng dẫm lại)

- ⭐⭐⭐**Cache bundle**: DNN nạp builder qua `dnn-host` với hằng `BUILDER_LAZY_VERSION`
  (`MegaForm.UI/src/dnn-host/index.ts`). **URL = cache key** → thay file mà không bump hằng này thì trình duyệt
  vẫn chạy bundle CŨ và "bản vá như không có tác dụng". Hiện đang ở **`20260714-B236`**.
  Sau khi sửa JS builder: `npm run build:builder && npm run build:dnn-host` → copy **cả hai** file.
- ⭐**Bundle builder thật** = `Assets/js/bundles/megaform-builder.js` (không phải `Assets/js/builder/`).
- ⭐**Sửa `.ascx`** → phải **touch `web.config`** mới ăn.
- ⭐⭐**Bỏ nút UI thì phải bỏ cả đoạn wire nó**: tôi xoá nút `[data-ai]` mà quên `aiBtn.addEventListener` →
  `null.addEventListener` làm **vỡ toàn bộ danh sách bảng**, và thông báo lỗi hiện ra lại là
  *"Failed to load tables… Check that DashboardDatabase connection is configured"* → **đánh lạc hướng hoàn toàn**.
- ⭐⭐⭐**CDP**: đừng `Page.reload` tab builder (beforeunload → kẹt renderer → **treo mọi tab cùng origin**);
  dùng `Page.navigate` + `&_cb=<random>`; `Page.navigate` tới đúng URL hiện tại (chỉ khác hash) = **không tải lại**.
  Profile Chrome QA (`%TEMP%\chrome-qa-5116`) **không có sẵn phiên host** → login `host`/`dnnhost`.

## 4. Hot-swap (sau khi build)
```bash
cp MegaForm.DNN/bin/Release/net472/MegaForm.DNN.dll  E:/DNN_SITES/DNN10322_MegaClean/Website/bin/
cp Assets/js/bundles/megaform-builder.js  E:/DNN_SITES/DNN10322_MegaClean/Website/DesktopModules/MegaForm/Assets/js/bundles/
cp Assets/js/megaform-dnn-host.js         E:/DNN_SITES/DNN10322_MegaClean/Website/DesktopModules/MegaForm/Assets/js/
cp MegaForm.DNN/Views/FormView.ascx       E:/DNN_SITES/DNN10322_MegaClean/Website/DesktopModules/MegaForm/Views/
```

## 5. Còn nợ từ trước (chưa đụng)
Ảnh template 404 (nhúng path Oqtane `/Modules/MegaForm/img/...`) · `Workflow/Library/FormBinding` chưa port DNN ·
gap module↔dock · QA My Inbox bằng 5 user đã seed · **repack gói DNN** (mọi fix 07-14 mới là hot-swap).
