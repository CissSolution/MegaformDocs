# Handout QA DNN vòng kế tiếp — MegaForm

Ngày lập: 2026-07-13  
Mục tiêu: source đã thay đổi khá nhiều so với phiên QA trước, nên vòng tới cần QA DNN lại theo rủi ro mới, không chạy lại checklist cũ một cách máy móc.

## 1. Snapshot repo hiện tại

- Branch hiện tại: `feat/theme-designer-picker-wizard-gallery-1.7.45`
- HEAD khi rà soát: `1d96473 docs(spec): scope the doc work to Q3-Q8 and make it start-ready`
- DNN package version trong `MegaForm.DNN/BuildPackage-DNN.ps1` và `MegaForm.DNN/MegaForm.dnn`: `01.07.99`
- Package DNN chính:
  - `MegaForm.DNN/BuildPackage-DNN.bat`
  - `MegaForm.DNN/BuildPackage-DNN.ps1`
  - Output dự kiến: `MegaForm.DNN/Install/MegaForm_01.07.99_Install.zip`

Quan trọng: worktree hiện tại đang dirty, có nhiều thay đổi chưa commit. Trước khi đóng gói để QA, phải ghi lại:

```powershell
git status --short
git rev-parse --short HEAD
```

Nếu build/package từ dirty worktree thì trong ticket QA phải ghi rõ "package built from dirty worktree" để tránh nhầm với build release sạch.

## 2. Những thay đổi/rủi ro mới cần QA lại trên DNN

### 2.1 File upload và file metadata

Thay đổi đáng chú ý:

- `MegaForm.UI/src/renderer/interactive.ts`
  - File picker giờ upload thật qua endpoint upload, không chỉ hiển thị "Ready".
  - Metadata file được ghi vào hidden input dạng JSON.
- `MegaForm.UI/src/renderer/validation.ts`
  - Submit gửi metadata JSON nếu có, fallback mới gửi filename.
- `MegaForm.Core/Services/SubmissionFileMetaExtractor.cs`
  - Có dedup để tránh tạo 2 dòng `MF_Files` cho cùng một upload khi schema có duplicate casing `fields`/`Fields`.
- `MegaForm.UI/src/submissions/SubmissionsShell.ts`
  - Submission grid render file JSON thành link file, không hiển thị raw JSON.

Vì vậy DNN phải QA file upload theo một luồng end-to-end: public form → submit → `MF_Submissions.DataJson` → `MF_Files` → Submissions grid → detail → workflow inbox.

### 2.2 Workflow / My Inbox / Send to Inbox

Thay đổi đáng chú ý:

- `MegaForm.Core/Services/WorkflowTaskService.cs`
  - Send/ad-hoc assignment resolve user trước khi tạo task.
  - Nếu nhập username sai, phải báo lỗi rõ thay vì tạo task treo.
  - Assigned task phải đếm đúng trong "Assigned to Me".
- `MegaForm.UI/src/my-inbox/*`
  - UI My Inbox thay đổi cách xác định task assigned to current user.
  - Có fix hiển thị submitter.
- `MegaForm.UI/src/workflow-inbox/api.ts`
  - Normalizer giữ lại `submitters` map để card không fallback "Unknown".
- `MegaForm.UI/src/submissions/SubmissionsShell.ts`
  - Toast Send to Inbox nói rõ task nằm ở "Assigned to Me", không phải queue claimable.

DNN có control riêng cho workflow inbox:

- `MegaForm.DNN/Views/Tasks.ascx`
- API base: `/DesktopModules/MegaForm/API/Workflow/`
- Submissions API base: `/DesktopModules/MegaForm/API/`

### 2.3 Tabbed premium form / multi-step mới

Ở code hiện tại phần tabbed form vẫn có trong renderer:

- `settings.pageNavigationMode`
- `settings.tabbedForm`
- markup `data-mf-tabnav="1"`
- class `mf-tabbed-form-mode`
- logic jump/focus vào field lỗi khi validation fail

DNN cần QA lại vì source TS khác trước; nếu chỉ test trên Oqtane thì chưa đủ. Phải xác nhận DNN package đã lấy đúng `megaform-renderer.js` và CSS mới.

### 2.4 Submissions dashboard, count, filter, file links

Sau các thay đổi dashboard/submissions:

- Cần test count tổng, count theo form, list page, detail drawer.
- Cần test search/filter với form có nhiều submissions.
- Cần test column là File field: không được hiện raw JSON, phải hiện link tải/xem file.
- Cần xác nhận không còn lỗi 404 asset kiểu `megaform-submission-inbox.js`.

### 2.5 i18n / multi-language

Nhiều file `MegaForm.UI/public/i18n/*.json` đã thay đổi. DNN phải kiểm tra:

- Không bị 404 locale file.
- Không hiện raw key như `subs.xxx`.
- Tiếng Việt/English hiển thị đúng ở Builder, Submissions, My Inbox, Workflow.

### 2.6 Payment assets

Recent commits chủ yếu nói về payment Oqtane/Web, nhưng DNN `FormView.ascx.cs` vẫn có logic load payment plugin assets. Vòng DNN QA nên xác định rõ:

- DNN có hỗ trợ payment runtime thật hay chỉ load asset?
- Nếu có widget payment trên form DNN:
  - Unpaid/tampered submit phải bị server reject.
  - Paid submit mới lưu submission.
- Nếu chưa có server-side payment verification parity trên DNN thì ghi thành gap, không demo như production-ready.

## 3. Chuẩn bị package DNN cho QA

Chạy từ root repo:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
git status --short
git rev-parse --short HEAD
```

Build/package đầy đủ bằng script DNN:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.DNN"
.\BuildPackage-DNN.bat
```

Script này gọi:

- `BuildTS.bat`
- `dotnet build MegaForm.DNN.csproj -c Release`
- tạo install ZIP

Nếu chỉ cần rebuild bundle riêng trước khi package:

```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um"
.\BuildTS.bat renderer
.\BuildTS.bat submissions
.\BuildTS.bat my-inbox
.\BuildTS.bat workflow
.\BuildTS.bat dnn-host
```

Tuy nhiên vòng QA chính nên dùng `BuildPackage-DNN.bat` để tránh thiếu bundle.

## 4. Checklist install/upgrade DNN

### 4.1 Fresh install

- [ ] Tạo DNN site sạch hoặc snapshot DB sạch.
- [ ] Install `MegaForm_01.07.99_Install.zip` qua Host/Extensions.
- [ ] Không có lỗi SQL install trong DNN event log.
- [ ] Module MegaForm xuất hiện trong Extensions.
- [ ] Add MegaForm module vào page mới.
- [ ] FormView mở được, không console error.
- [ ] Builder mở được.
- [ ] Submissions mở được.
- [ ] Tasks / Workflow Inbox mở được.

### 4.2 Upgrade install

- [ ] Backup DB và folder `DesktopModules/MegaForm`.
- [ ] Cài ZIP mới lên site đã có MegaForm cũ.
- [ ] Không mất form cũ.
- [ ] Không mất submissions cũ.
- [ ] Không mất workflow cũ.
- [ ] SQL upgrade scripts chạy đủ.
- [ ] Browser hard refresh hoặc disable cache.
- [ ] Không load stale JS/CSS.

### 4.3 Asset/package sanity

Kiểm tra trong site DNN sau install:

- [ ] `/DesktopModules/MegaForm/Assets/js/megaform-renderer.js`
- [ ] `/DesktopModules/MegaForm/Assets/js/megaform-dashboard.js`
- [ ] `/DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js`
- [ ] `/DesktopModules/MegaForm/Assets/js/bundles/megaform-submissions.js`
- [ ] `/DesktopModules/MegaForm/Assets/js/bundles/megaform-my-inbox.js` hoặc bundle tương đương do manifest/script loader dùng
- [ ] `/DesktopModules/MegaForm/Assets/js/builder/megaform-workflow-reactflow.js`
- [ ] `/DesktopModules/MegaForm/Assets/css/megaform.css`
- [ ] `/DesktopModules/MegaForm/Assets/css/megaform-my-inbox-ts.css`
- [ ] locale files under `/DesktopModules/MegaForm/Assets/js/locales/`

Pass criteria:

- Network tab không có 404 cho MegaForm assets.
- URL có cache-bust/version hoặc hard refresh vẫn load đúng file mới.
- Console không có `MegaForm... is undefined`.

## 5. Test case chi tiết

### TC-DNN-01 — Builder smoke

- [ ] Login Host/Admin.
- [ ] Add MegaForm module vào page.
- [ ] Mở Edit / Form Builder.
- [ ] Tạo form mới từ blank.
- [ ] Thêm Text, Email, Dropdown, File, Section.
- [ ] Save.
- [ ] Public view render đúng.

Pass:

- Không console error.
- Save/load schema không mất field.
- Form public có submit button và validation.

### TC-DNN-02 — Premium tabbed form

Mục tiêu: form dạng tab giống multi-step nhưng được click tab tự do, vẫn có Next.

Cách test:

- [ ] Tạo hoặc import một premium form nhiều section/page.
- [ ] Bật settings tương đương:

```json
{
  "multiPage": true,
  "premiumNativePageBreak": true,
  "pageNavigationMode": "tabs",
  "tabbedForm": true
}
```

- [ ] Public view hiển thị tabs.
- [ ] Click thẳng tab 3 trước khi điền tab 1.
- [ ] Dùng Next để chuyển tab.
- [ ] Submit khi còn required field trống ở tab khác.

Pass:

- User được click tab không tuần tự.
- Next vẫn đi tới tab kế tiếp.
- Nếu validation fail, UI tự nhảy về đúng tab chứa field lỗi.
- Focus vào đúng field lỗi đầu tiên.
- Không bị kẹt ở tab hiện tại.
- Không có duplicate Previous/Next ngoài ý muốn.

Regression bắt buộc:

- [ ] Multi-step sequential cũ vẫn hoạt động nếu không bật `pageNavigationMode: "tabs"`.
- [ ] Required field ở current step vẫn block Next trong mode sequential.

### TC-DNN-03 — File upload public submit

Form cần có:

- Required File field.
- Optional File field.
- Ít nhất một Text/Email field.

Steps:

- [ ] Chọn file hợp lệ.
- [ ] Xác nhận UI hiện trạng thái uploading/success.
- [ ] Submit.
- [ ] Vào DB kiểm tra `MF_Submissions.DataJson`.
- [ ] Kiểm tra `MF_Files`.
- [ ] Mở Submissions grid.
- [ ] Mở detail drawer/modal.

Pass:

- Submit không báo required file khi đã upload.
- `DataJson` chứa metadata JSON hoặc field value hợp lệ.
- `MF_Files` có đúng 1 row cho 1 upload, không duplicate.
- Grid hiện file link/paperclip, không hiện raw JSON dài.
- Detail mở được link file.

Negative tests:

- [ ] File vượt size limit bị reject.
- [ ] Extension không cho phép bị reject.
- [ ] Xóa file khỏi UI thì hidden value clear, submit required phải fail.

### TC-DNN-04 — Submissions dashboard/count/filter

- [ ] Tạo 3 submissions mới cho form test.
- [ ] Dashboard count tăng đúng.
- [ ] Submissions list hiện đúng record mới.
- [ ] Search theo text field.
- [ ] Filter status.
- [ ] Filter date range.
- [ ] Mở detail.
- [ ] Export nếu có.

Pass:

- Count sidebar/card/list không lệch.
- Không có asset 404.
- Paging/filter không fetch quá nhiều gây treo browser.
- File column render link.

Nếu test dữ liệu lớn:

- [ ] Tạo hoặc dùng form có 500k submissions.
- [ ] Page đầu load được trong thời gian chấp nhận được.
- [ ] Search/filter server-side không kéo toàn bộ 500k về client.
- [ ] SQL query có index phù hợp, không table scan kéo dài.

### TC-DNN-05 — Send to Inbox từ Submissions

Chuẩn bị:

- User A: submitter.
- User B: reviewer.
- User C: người không liên quan.

Steps:

- [ ] Admin chọn 1 submission.
- [ ] Send to Inbox cho User B.
- [ ] Thử nhập username sai.
- [ ] Login User B.
- [ ] Mở Tasks/My Inbox.

Pass:

- Username sai phải báo lỗi rõ, không tạo task orphan.
- Username đúng tạo task.
- Task nằm ở "Assigned to Me" của User B.
- Count "Assigned to Me" tăng.
- User C không thấy task.
- Card hiển thị submitter thật, không hiện `Unknown` nếu server có dữ liệu.

### TC-DNN-06 — Workflow role queue

Steps:

- [ ] Tạo workflow approval target role `Reviewer`.
- [ ] User A submit.
- [ ] User B thuộc role `Reviewer` mở Workflow Inbox.
- [ ] Task xuất hiện ở claimable queue.
- [ ] User B claim.
- [ ] User B approve/reject/forward.

Pass:

- Candidate role match đúng role DNN.
- Claim chuyển task sang assigned/in-progress.
- Approve/reject cập nhật status submission/case.
- Forward resolve user đúng.
- Reopen workflow editor không mất role đã cấu hình.

### TC-DNN-07 — Workflow detail + file

Steps:

- [ ] Submit form có file.
- [ ] Task workflow được tạo.
- [ ] Reviewer mở task detail.

Pass:

- Detail thấy field text.
- Detail thấy file link.
- File link mở/tải được.
- Không duplicate file rows.
- Không raw JSON làm vỡ layout.

### TC-DNN-08 — Localization

Test tối thiểu:

- English
- Vietnamese
- Một locale khác, ví dụ French hoặc German

Steps:

- [ ] Đổi DNN language/locale nếu site hỗ trợ.
- [ ] Mở Builder.
- [ ] Mở Submissions.
- [ ] Mở Tasks/My Inbox.
- [ ] Mở public form.

Pass:

- Không 404 locale.
- Không hiện raw translation key.
- Text mới liên quan Send to Inbox, advanced filters, file upload có fallback hợp lý.

### TC-DNN-09 — Payment parity/gap check

Steps:

- [ ] Tạo form có payment widget nếu DNN build hỗ trợ.
- [ ] Submit không thanh toán.
- [ ] Submit với client tamper amount/currency.
- [ ] Submit paid test flow nếu có test provider.

Pass nếu DNN payment được claim supported:

- Server reject unpaid/tampered submission.
- Server lưu paid submission đúng trạng thái.
- Workflow/email chỉ chạy sau paid success nếu business rule yêu cầu.

Nếu DNN chưa có server-side payment verification:

- [ ] Ghi rõ gap: "DNN loads payment UI/assets but not yet production-verified server-side payment enforcement."

### TC-DNN-10 — Regression: classic public form

- [ ] Form không file.
- [ ] Form không workflow.
- [ ] Form không premium shell.
- [ ] Form có conditional show/hide.
- [ ] Form có captcha/anti-spam nếu bật.

Pass:

- Submit vẫn lưu bình thường.
- Email notification cũ không gãy.
- Conditional logic field-based vẫn chạy.
- Server validation vẫn chặn field required bị bypass qua browser.

## 6. SQL kiểm tra nhanh

Điều chỉnh prefix/schema nếu DNN DB khác.

```sql
SELECT TOP 20 SubmissionId, FormId, Status, CreatedOnUtc, LEN(DataJson) AS DataLen
FROM MF_Submissions
ORDER BY SubmissionId DESC;
```

```sql
SELECT TOP 20 FileId, SubmissionId, FieldKey, OriginalName, StoredPath, FileSizeBytes, CreatedOnUtc
FROM MF_Files
ORDER BY FileId DESC;
```

```sql
SELECT TOP 20 TaskId, SubmissionId, Status, AssignedUserId, AssignedUserName,
       CandidateUsers, CandidateRoles, CreatedAt, ClaimedAt
FROM MF_WorkflowTasks
ORDER BY CreatedAt DESC;
```

```sql
SELECT FormId, COUNT(*) AS Total
FROM MF_Submissions
GROUP BY FormId
ORDER BY Total DESC;
```

## 7. Evidence cần chụp cho mỗi bug

Mỗi bug nên có đủ:

- DNN URL.
- FormId / ModuleId / PortalId.
- User đang login và role.
- Package ZIP name.
- Git short SHA.
- Browser console screenshot.
- Network tab nếu là 404/500/API.
- DNN event log nếu server error.
- SQL row liên quan nếu là submission/file/workflow.
- Steps reproduce ngắn gọn.

Bug title nên dùng format:

```text
[DNN][Area] Short symptom
```

Ví dụ:

- `[DNN][FileUpload] Required file still fails after upload`
- `[DNN][Workflow] Send to Inbox creates orphan task for bad username`
- `[DNN][Submissions] File column renders raw JSON`
- `[DNN][TabbedForm] Submit validation does not jump to hidden tab`

## 8. Quy tắc pass/fail cho vòng QA này

Pass vòng DNN khi:

- Fresh install OK.
- Upgrade install OK.
- Public submit OK.
- Builder save/load OK.
- Submissions count/list/detail OK.
- File upload end-to-end OK.
- Workflow Inbox role/user assignment OK.
- Tabbed premium form OK.
- Không còn asset 404 chính.
- Không còn raw JSON file trong grid/detail.
- i18n không hiện raw key ở các màn chính.

Fail/blocker nếu:

- DNN package không install được.
- Builder không mở.
- Public form không submit được.
- File required không submit được dù đã upload.
- Workflow task tạo nhưng user nhận không thấy.
- Submission count sai rõ ràng.
- Có 404 cho bundle bắt buộc.
- Có server 500 trên luồng chính.

## 9. Ghi chú handoff cho phiên sau

Ưu tiên chạy theo thứ tự:

1. Build package DNN từ repo hiện tại.
2. Fresh install.
3. Asset sanity.
4. Builder/public submit smoke.
5. File upload end-to-end.
6. Submissions dashboard/count/filter.
7. Send to Inbox.
8. Workflow role queue.
9. Tabbed premium form.
10. i18n/payment/gap check.

Lý do thứ tự này: file upload và workflow/inbox đang là vùng code thay đổi nhiều nhất; nếu chúng fail thì các test premium/i18n phía sau dễ bị nhiễu bởi lỗi nền.

