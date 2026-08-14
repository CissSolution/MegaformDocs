# HANDOFF 2026-07-13 — Docs Q3–Q8: 5 bài + 6 GIF, ĐÃ PUSH (spec 20260712 hoàn tất)

> Phiên này thực thi trọn `SPEC_20260712_DOCFX_CUSTOMER_QUESTIONS_AND_GIFS.md` (scope Q3–Q8).
> **Mọi hành vi trong bài đều tự tay chạy trước khi viết.** Q1/Q2 vẫn ở Phụ lục spec, chưa làm.

## 1. Deliverable — ĐÃ XONG

| Câu | Bài (Docs/docfx/articles/) | GIF (images/ + demo-gifs/) | Size |
|---|---|---|---|
| Q3 field/section permission | `field-permissions.md` (mới) | `08-field-permissions.gif` | 4.67MB |
| Q4+Q6 library + BPMN | `workflow-library.md` (mới) | `09-workflow-library-multi-form.gif` + `13-bpmn-complex.gif` | 5.43 + 4.76MB |
| Q5 inbox approval | `workflow-approvals.md` (bổ sung section "Watch it happen" — file này CHƯA từng có trên master → PR đưa cả file) | `10-inbox-approval.gif` | 5.07MB |
| Q7 grid filter | `submissions-grid.md` (mới) | `11-advanced-filter.gif` | 4.53MB |
| Q8 tabbed template | `form-templates.md` (mới) | `12-tabbed-template.gif` | 5.56MB |

- `overview.md`: thêm bảng "Product capability walkthroughs" (áp lên bản master MỚI — bản local cũ hơn master, đã sync lại local = master+section).
- `toc.yml`: thêm 5 entry vào nhóm "Using MegaForm on Oqtane" (⭐master dùng toc 2 NHÓM, khác hẳn bản local — đừng copy đè từ local).
- **Push:** branch `docs/capability-answers-gifs` → `github.com/CissSolution/MegaformDocs` (commit `a8f08ab`, 19 files +333, worktree từ origin/master, `core.longpaths=true` + path ngắn `E:\mfdocs-wt` vì checkout dài quá Windows).
- **ĐÃ MERGE fast-forward vào `master`** (owner yêu cầu) → GitHub Actions `docs.yml` tự build DocFX + deploy Pages (~5 phút) → **LIVE, đã verify 200 cả 5 bài + GIF:**
  `https://cisssolution.github.io/MegaformDocs/`

## 2. SỐ LIỆU THẬT đã kiểm (được phép viết lại)

- Form 1 :5123 = ATBE **readonly binding** → `CustomerErp` = DB `LegacyErp_Demo`, bảng `dbo.SupportTickets` = **500.000 dòng** (tự COUNT). Spec cũ nói "100 dòng" là đếm MF_Submissions — grid thực đọc bảng ngoài. Status 5×100k, PriorityId 4×125k.
- Chuỗi approval E2E thật: sub **110** (emp.hoa submit :5123 /form-a) → task "Step 1 — Manager" (role Manager) → mgr.nam Claim+Approve (+note) → task "Step 2 — Finance" TỰ tạo → fin.lan Approve → submission `approved`. Đã quay đủ trong GIF 10.
- Field visibility: schema projection per-role hoạt động (Schema/6 của mgr KHÔNG có phone_number; của fin CÓ); trang render riêng `/api/MegaForm/render/6` thể hiện đúng (mgr: mất Phone + Work email disabled; fin: đủ + gõ được).

## 3. 🐛 BUG PHÁT HIỆN TRONG LÚC QUAY (chưa vá — docs-only session)

1. **⭐Wizard đổi tên tab template thành "Step 1..5"** — import "Tabbed Account Setup" qua gallery/Use-this-template/wizard đều mất label section (Account/Company/… → Step N; chỉ "Review" giữ). Render sống vẫn đúng tên nhờ customHtml, nhưng schema label mất (căn cứ: forms 3/5 :5123 + forms 3/4 :5124 đều dính). Preview dialog (`.mfwg-peek`) render đúng vì đọc template gốc.
2. **⭐My Inbox hiện submitter "Unknown"** — server trả map `submitters` ĐÚNG ("Hoa (Employee)", verify API `Workflow/MyInbox`), nhưng client `megaform-my-inbox.js` đọc `w.submissionId` trong khi task serialize **PascalCase** `SubmissionId` → lookup trượt → fallback Unknown. Fix 1 dòng trong MegaForm.UI src my-inbox: `w.submissionId ?? w.SubmissionId`. (Spec cũ tưởng đã vá ở 1.7.104 — server vá rồi, client CHƯA.)
3. **⭐Search toàn văn = 0 kết quả trên form ATBE** — mọi term, mọi scope trên form 1 → "Showing 0-0 of 0" (server search không phủ bảng ngoài). GIF/bài né search, chỉ demo chips+presets.
4. **⭐Field-visibility KHÔNG áp trên trang Oqtane SSR nhúng module** (/form-a): mgr vẫn thấy Phone. Chỗ enforce thật = Schema API (projection, 1 call site `MegaFormController.cs:1473`) + trang render `/api/MegaForm/render/{id}`. SSR embedded = leak → cần vá renderer. Bài docs viết theo surface đúng, không overclaim.
5. "Save Access Rules" chỉ lưu MATRIX; field-visibility rules cần **Save form chính** (đúng help text "Applies when you Save the form" — dễ nhầm).
6. Inbox hiện "7h ago" cho task vừa tạo (lệch timezone VN +7 trong age calc).
7. Smoke: submit qua Playwright bị chấm spam +30 "too fast" bất kể điền chậm (đo time-to-submit hỏng với automation) + UA HeadlessChrome +25 → tổng 55 ≥ 50 = spam, workflow bị skip **im lặng**. Né bằng UA override. (AntiSpamService.cs — threshold 50.)

## 4. MUTATION TRÊN SITE QA (phiên này làm, có chủ đích)

**:5123 `Oqtane_MegaForm_Fresh1802`:**
- Form 6 WorkflowJson (Draft+Applied) + **library template v1 DefinitionJson**: n-mgr candidates → `["Manager"]`, n-fin → `["Finance"]` (trước đó label/candidates lệch nhau do phiên trước test); template rename → **"Unified approval workflow"**. ⚠️Bẫy: dump `sqlcmd -o` phá em-dash thành U+FFFD — đã REPLACE về NCHAR(8212); dump an toàn = `-u` (UTF-16).
- **MF_FormWorkflows +row FormId 7** (Apply qua UI khi quay GIF 09) → form 7 giờ chạy library template (2 forms), workflow "Finance direct" legacy bị override.
- Form 6 schema: `phone_number.showIf` Role In **Finance**; `work_email.readOnlyIf` Role In **Manager** — **ĐỂ NGUYÊN** (đúng demo docs; QA sau đừng bất ngờ khi mgr không thấy Phone trên /api/MegaForm/render/6).
- Submissions mới: 107+108 (spam, probe), 109+110 (approved, probe+GIF). Tasks cũ 103/106 + case-109 đánh completed bằng SQL cho inbox sạch. Preset grid form 1: +"Open tickets".
- WorkflowJson form 6 VẪN NGUYÊN sau builder Save (fix chống xoá OK).

**:5124 `Oqtane_MegaForm_Fresh1803`:**
- **MegaForm module thêm vào Home (module 36, pane Default)** qua control panel UI — trước đó site KHÔNG có module nào trên page (spec tưởng có sẵn gallery).
- Forms 3 & 4 "Tabbed Account Setup" (Draft) do probe + recording tạo — xoá được nếu muốn.
- `LegacyErp_Demo.SupportTickets` KHÔNG đụng (mojibake `â€"` trong Subject vẫn còn — lộ nhẹ trong GIF 11; muốn đẹp thì fix seed rồi quay lại Q7).

## 5. Harness quay GIF (tái sử dụng)

Scratchpad phiên này: `...\b08e6461-...\scratchpad` — `recorder-lib.mjs` (đã thêm `opts.userAgent`), `rec-q*.mjs` (5 script quay), `reencode-q*.mjs` (re-encode từ webm không cần quay lại — webm còn trong `video/`), `probe-q*.mjs` (~20 probe). Login users `mgr.nam/fin.lan/emp.hoa` pass `Qa@2026x`, host `host/abc@ABC1024`. Nhớ: GIF ≤ ~5MB = fps 4, width 460–540, quality 28–31, cắt segment chết bằng `toGifSegments`.
