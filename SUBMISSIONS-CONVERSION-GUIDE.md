# MegaForm — Chuyển đổi Submissions View sang TypeScript

## Mục tiêu

Chuyển trang quản lý submissions (`ctl/Submissions/mid/508`) từ legacy JS inline sang TS bundle chuyên nghiệp. Trang hiện đang chạy trên DNN tại URL dạng:
```
http://dnn10221.ai/Phát-triển-bản-thân/ctl/Submissions/mid/508
```

---

## Trạng thái hiện tại

### Đã có trong TypeScript (MegaForm.UI/src/submissions/)
Đã viết 671 dòng TS nhưng **chỉ dùng cho config panel inline** (khi admin mở builder → View Submissions). Chưa dùng cho trang Submissions riêng.

| File | Dòng | Chức năng |
|------|------|-----------|
| `state.ts` | 103 | State management, types (Submission, SubsConfig) |
| `SubmissionsShell.ts` | 320 | Table, filters, pagination, bulk actions |
| `SubmissionModal.ts` | 211 | Modal xem/edit từng submission |
| `index.ts` | 37 | Entry point, đọc context từ DOM |

### Legacy JS đang chạy
| File | Dòng | Chức năng |
|------|------|-----------|
| `Assets/js/megaform-submissions.js` | 673 | Toàn bộ CRUD, filters, modal, bulk, export |

### DNN View files
| File | Dòng | Vai trò |
|------|------|---------|
| `MegaForm.DNN/Views/Submissions.ascx` | 679 | ASCX template + **inline CSS 400 dòng** + inline JS init |
| `MegaForm.DNN/Views/Submissions.ascx.cs` | 113 | Code-behind, load schema + initial data |
| `MegaForm.DNN/Views/Submissions.ascx.designer.cs` | 14 | Auto-generated |

### CSS
| File | Dòng | Dùng cho |
|------|------|----------|
| `Assets/css/megaform-submissions-ts.css` | 148 | TS component (config panel inline) |
| **Inline trong Submissions.ascx** | ~400 | Trang Submissions riêng |

---

## Vấn đề cần giải quyết

### 1. Hai hệ thống song song
- Legacy `megaform-submissions.js` (XHR trực tiếp, DNN auth headers thủ công)
- TS `submissions/` bundle (dùng PlatformAdapter, typed state)
- → Cần **merge vào 1 hệ thống TS duy nhất**

### 2. ASCX quá nặng
- 679 dòng ASCX chứa cả HTML + 400 dòng CSS inline + JS init script
- → Cần **tối giản ASCX**: chỉ giữ `<div>` container + data attributes + load bundle

### 3. Tính năng hiện có trong legacy mà TS chưa có
- **View Form** — render submission data trong form layout thực tế (dùng MegaFormRenderer)
- **Print** — in submission trong form layout
- **Export CSV/JSON** — download file
- **Edit data inline** — sửa trực tiếp giá trị trong modal
- **Save data** — POST updated data back to API
- **Rating stars interactive** — click stars trong modal để sửa rating
- **Widget data rendering** — Calculator results, signature images, etc.
- **Status badge colors** — New/Read/Starred với màu khác nhau

### 4. CSS cần merge
- Inline CSS trong ASCX (~400 dòng) → chuyển vào `megaform-submissions-ts.css`
- Thiết kế hiện tại đã khá tốt, cần giữ nguyên look & feel

---

## API Endpoints (DNN)

Base URL: `/API/MegaForm/Submissions/`

| Method | Endpoint | Params | Response |
|--------|----------|--------|----------|
| GET | `List` | `formId, status?, search?, dateFrom?, dateTo?, pageIndex, pageSize` | `{ items, totalCount, pageIndex, pageSize }` |
| GET | `Get` | `submissionId` | `{ submission, files }` |
| POST | `UpdateStatus` | `submissionId, status` | `{ message }` |
| POST | `UpdateData` | `submissionId` + body JSON | `{ message }` |
| POST | `Delete` | `submissionId` | `{ message }` |
| GET | `Export` | `formId, dateFrom?, dateTo?, format` | CSV file hoặc JSON |

### DNN Auth Headers (cần cho mọi request)
```javascript
xhr.setRequestHeader('ModuleId', moduleId);
xhr.setRequestHeader('TabId', tabId);
xhr.setRequestHeader('RequestVerificationToken', token);
```
Đã có trong `MegaForm.UI/src/adapters/dnn.ts` → `getDnnHeaders()`.

---

## Kiến trúc mục tiêu

### ASCX mới (tối giản ~30 dòng)
```html
<%@ Control ... %>
<link rel="stylesheet" href="/DesktopModules/MegaForm/Assets/css/megaform-submissions-ts.css" />

<div id="mf-submissions-root"
     data-platform="dnn"
     data-instance-id="<%= ModuleId %>"
     data-form-id="<%= ViewModel.FormId %>"
     data-form-title="<%= Server.HtmlEncode(ViewModel.Form?.Title ?? "") %>"
     data-api-base="/DesktopModules/MegaForm/API/"
     data-schema='<%= SchemaJson %>'
     data-total="<%= ViewModel.TotalCount %>">
    <div style="padding:40px;text-align:center;color:#94a3b8;">
        <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Loading submissions...
    </div>
</div>

<script src="/DesktopModules/MegaForm/Assets/js/bundles/megaform-submissions.js?v=10040"></script>
<script>
    (function() {
        if (window.MegaForm && window.MegaForm.initSubmissions) {
            window.MegaForm.initSubmissions(document.getElementById('mf-submissions-root'));
        }
    })();
</script>
```

### TS Bundle mới (submissions/)
```
MegaForm.UI/src/submissions/
├── index.ts              — Entry point (đọc context, mount)
├── state.ts              — State management
├── SubmissionsShell.ts   — Header, table, filters, pagination, bulk
├── SubmissionModal.ts    — Modal detail: data view + form view + print
├── SubmissionFormView.ts — NEW: render data inside actual form layout
└── export.ts             — NEW: CSV/JSON export logic
```

### Tính năng cần implement/nâng cấp

1. **Table chuyên nghiệp**
   - Sortable columns (click header to sort)
   - Resizable columns
   - Row hover actions
   - Unread highlight (bold/yellow background)
   - Spam indicator (opacity)

2. **Modal nâng cấp**
   - Tab 1: Data View (table key-value, editable)
   - Tab 2: Form View (render trong form layout thực tế, read-only)
   - Status dropdown + Save
   - Rating stars interactive
   - Signature image display
   - Calculator/Widget data formatted display
   - Print button (chỉ khi Form View active)

3. **Export**
   - CSV download (mở URL mới)
   - JSON download
   - Date range filter cho export

4. **Bulk Actions**
   - Select all / select individual
   - Bulk delete with confirmation
   - Floating bottom bar khi có selection

---

## Môi trường test

- **Platform:** DNN 10.x tại `C:\inetpub\wwwroot\DNN10221\Website`
- **URL test:** `http://dnn10221.ai/Phát-triển-bản-thân/ctl/Submissions/mid/508`
- **Deploy:** `QuickDeploy.bat` hoặc `BuildTS.bat` → copy bundles
- **Node.js:** v24.13.1

---

## Files đính kèm trong ZIP

Upload file `MegaFormSolution_121.zip` cùng với file hướng dẫn này.

### Files quan trọng cần đọc
1. `MegaForm.DNN/Views/Submissions.ascx` — ASCX hiện tại (679 dòng)
2. `MegaForm.DNN/Views/Submissions.ascx.cs` — Code-behind (113 dòng)
3. `Assets/js/megaform-submissions.js` — Legacy JS (673 dòng)
4. `MegaForm.UI/src/submissions/` — TS đã có (671 dòng, 4 files)
5. `Assets/css/megaform-submissions-ts.css` — CSS đã có (148 dòng)
6. `MegaForm.UI/src/adapters/dnn.ts` — DNN adapter với auth headers
7. `MegaForm.UI/src/core/types.ts` — TypeScript types
8. `MegaForm.UI/vite.config.ts` — Vite build config (entry `submissions`)

### Prompt cho conversation mới
```
Tôi cần convert trang quản lý submissions của MegaForm từ legacy JS sang TypeScript chuyên nghiệp.

File hướng dẫn: SUBMISSIONS-CONVERSION-GUIDE.md (đính kèm)
Source code: MegaFormSolution_121.zip (đính kèm)

Yêu cầu:
1. Tối giản Submissions.ascx — chỉ giữ <div> container + load TS bundle
2. Merge inline CSS (400 dòng) vào megaform-submissions-ts.css
3. TS submissions bundle phải có đầy đủ tính năng:
   - Table với sort, filter, pagination, bulk actions
   - Modal detail: Data View (editable) + Form View (render trong form layout)
   - Export CSV/JSON
   - Rating stars, signature images, widget data display
   - Print support
4. Sửa Submissions.ascx.cs cho phù hợp
5. Test URL: http://dnn10221.ai/Phát-triển-bản-thân/ctl/Submissions/mid/508
6. Build: BuildTS.bat → megaform-submissions.js bundle
```
