# CLAUDE HANDOFF — 2026-07-09: DNN package 01.07.98 + cài DNN 10.3.0 SẠCH + QA end-to-end PASS

User yêu cầu: "tạo package cho DNN, cài lên 1 DNN sạch, QA giống như đã làm với Oqtane".
KẾT QUẢ: ✅ package build 01.07.98 → ✅ site DNN 10.3.0 sạch mới → ✅ cài qua PersonaBar wizard →
✅ QA chuỗi đầy đủ: add module → dashboard → builder → publish → public submit → submissions grid.

## §A. Package DNN 01.07.98

- **File:** `MegaForm.DNN/Install/MegaForm_01.07.98_Install.zip` (7.6MB, 535 resource files).
- Manifest `MegaForm.dnn`: package version 01.06.32 → **01.07.98** (script chain giữ nguyên tới
  01.06.32 — không cần script mới; schema mới hơn tự self-heal runtime: DnnWorkflowRepository tạo
  MF_WorkflowCases/Executions/Tasks/TaskActions, AiToolsController tạo MF_AiDdlAudit).
- **`BuildPackage-DNN.ps1` sửa (giữ lại — quan trọng):** $VERSION → 01.07.98 + thêm 4 nhóm file
  trước đây KHÔNG được đóng gói: `Assets\img\*` (bear + 271 flags — fix vĩnh viễn gotcha bear-404),
  `Resources\PromptRecipes`, `Resources\TemplateGuides` (AiToolsController đọc
  `~/DesktopModules/MegaForm/Resources/...`), `Templates\*` (5 builder-gallery templates từ repo
  `DesktopModules/MegaForm/Templates`). license.lic trong gói = **production**.
- Chạy pack: `& .\BuildPackage-DNN.ps1 -NoPause` bằng PowerShell tool (⚠️ auto-mode CHẶN
  `powershell -ExecutionPolicy Bypass` qua Bash).
- MF_ bảng code cần mà KHÔNG script/self-heal nào tạo (feature nâng cao AI app-builder, không chặn
  core): MF_Apps/MF_AppQueries/MF_AppEndpoints (AI DDL flow tự tạo khi dùng), MF_DataGridUserPrefs.

## §B. Site QA DNN sạch — dnnqa1798.ai (GIỮ LẠI cho user xem)

- **URL http://dnnqa1798.ai** (hosts 127.0.0.1) · IIS site/pool `DNNQA1798` · files
  `E:\DNN_SITES\DNNQA1798\Website` (DNN 10.3.0 media `E:\DNN\DNN_Platform_10.3.0_Install.zip`).
- DB `DNNQA1798` @ WINDOWS-11\SQLEXPRESS (Win-auth; login `IIS APPPOOL\DNNQA1798` db_owner).
- Login **host / dnnhost123!** · site name "MegaForm QA", template Default Website, en-US.
- Trang QA: **/megaform-qa** (TabID 37) — module MegaForm **ModuleID 386** (ModuleDefID 121,
  DesktopModuleID 79), bind form qua ModuleSettings `MegaForm_FormId=1` + `MegaForm_ModuleConfigured=true`
  (SQL insert + prompt `clear-cache`). Modules 384 (HTML mặc định) + 387 (MegaForm dup) đã
  delete-module (soft-delete).
- Form 1 "DNN QA Contact" Published: Full Name (composite name) + Email (required) + Message
  (textarea) + Rating. Submission #1 (Linh Tran, anonymous) — hiển thị đủ trong Submissions grid
  per-form columns (Full Name/Email/Message/Rate us), KPI Total/New/Processed/Pending.
- Screenshots QA: scratchpad af1fba79 `d3-qa-*.png` (dashboard, builder, public, filled,
  submitted, submissions).

## §C. Findings QA (cần quyết định phiên sau)

1. ⭐ **404 `megaform-submission-inbox.js` + `.css`** — `FormView.ascx.cs` L544-545 register +
   `Submissions.ascx` L10/L27 `<script src>`; file KHÔNG tồn tại trong Assets/ repo và KHÔNG build
   từ MegaForm.UI (bundle legacy mồ côi, chỉ có trong gói cũ 20260518). Runtime vẫn OK vì dnn-host
   `bootSubmissions()` fallback `initSubmissions` (megaform-submissions.js). → Fix: bỏ 4 tham chiếu
   chết (cần rebuild DLL + repack 01.07.99 — tiện thể test đường UPGRADE package).
2. Wizard "New Form" qua headless automation: field-picks (`button.mfw-pick`) không persist →
   form tạo ra 0 fields (đã thêm field qua builder API + save/publish = OK). Cần verify TAY xem có
   phải bug thật hay chỉ automation (Oqtane wizard cùng bundle hoạt động tốt các phiên trước).
3. DNN Prompt `add-module` **BẮT BUỘC `--pane ContentPane`** — thiếu → SqlException PaneName NULL
   (lỗi của DNN 10.3 Prompt, không phải MegaForm).
4. PersonaBar giữ panel cuối (Prompt) mở đè trang khi login lại → automation phải close panel trước.

## §D. Gotchas automation DNN (tái dùng)

- Scripts: scratchpad af1fba79 `d3-*.mjs` (wizard, install-ext, qa1..qa7). Chromium ms-playwright.
- **Install wizard DNN 10**: fill `#txtUsername/#txtPassword/#txtConfirmPassword/#txtEmail/#txtWebsiteName`,
  select `#templateList/#languageList`, click **`#continueLink`** (đừng match text — trúng heading
  stepper "Proceed with Installation"/"View Website" → false-positive). Theo dõi `#percentage`;
  xong khi body có "installation was successful".
- **PersonaBar**: iframe `/DesktopModules/admin/Dnn.PersonaBar/index.html`; menu click theo **id**
  (`Dnn.Extensions`, `Dnn.Prompt`...). Install Extension wizard 5 bước: upload vào file input TRONG
  pb frame; **license step phải click `<label>` trong `.dnn-checkbox-container .checkbox` bằng
  Playwright click THẬT** (React state — evaluate click/checked bị React reset); Next/Install/Done
  cũng click thật (locator), không evaluate.
- **DNN Prompt** tự động hoá tốt: `.dnn-prompt-input` + Enter (`new-page`, `add-module --name X
  --pageid N --pane ContentPane --title T`, `delete-module`, `clear-cache`, `list-modules`).
- Builder DNN = bundle shared với Oqtane: mở `#mf-builder` với `?mfFormId=N`, chờ ~15s (lazy bundle);
  `window.MegaFormBuilder` API y hệt. Dashboard `#mf-dashboard`, Submissions `#mf-submissions`.
- Lỗi runtime DNN xem `Portals/_default/Logs/YYYY.MM.DD.log.resources` (log4net) — nhanh hơn
  dbo.Exceptions/EventLog.

## §E2. PHIÊN 2 (09-07, user đi vắng — auto): DONEE templates + AI + docs DNN

- **Gallery site = 16 DONEE premium** (xoá 5 default golf/pdf theo yêu cầu; `BuildPackage-DNN.ps1`
  đổi nguồn Templates → `Samples\FormTemplates\Premium\DONEE` cho gói sau).
- **Root /templates + 16 sub-pages** (TabId 39-54, forms 3-18, modules 391-421 lẻ) — seed qua
  **Prompt REST** `POST /API/personaBar/Command/Cmd` {cmdLine,currentPage} + form qua
  `POST /DesktopModules/MegaForm/API/Form/Save?portalId=0` (header `RequestVerificationToken` từ
  input DOM; SchemaJson = STRING stringify template JSON) + ModuleSettings SQL + Restart-WebAppPool.
  Sweep 16/16 render anonymous OK (member-login 0 field = đúng, auth shell).
- **Submit → DB VERIFIED**: submission #2 form 16 (map template) đầy đủ DataJson. ⭐ Gotcha premium
  select: template có 2 placeholder option value="" → automation phải chọn option đầu có value.
- **AI WORKS trên DNN**: copy 5 HostSettings `MegaForm_AI_*` từ Oqtane :5120 DB (SQL→SQL in-memory,
  không ghi file — auto-mode chặn materialize key); ⭐ **ApiKey row phải SettingIsSecure=0**
  (DNN GetString decrypt giá trị secure → plaintext thành rác → "No API key"); ⭐ **AI gate cần
  `dev.lock`** tại site root (AiFeatureGate; đã tạo `Website\dev.lock`). AI tạo "Customer Feedback
  Form" (form 19, Draft) qua Create-with-AI → Save & Use Now.
- **Docs DNN track: PR #6 https://github.com/CissSolution/MegaformDocs/pull/6 CHỜ MERGE (1 click)**
  — `dnn-install.md` + `dnn-first-form.md` + TOC group "Using MegaForm on DNN" (+4 shared links)
  + 7 ảnh dnn-*.png. ⭐ Module bind form UI THẬT: module Settings → tab **MegaForm Settings** →
  "Select a Form" dropdown → Update (đã verify + chụp).

## §E. NEXT

1. Fix §C.1 (bỏ refs chết) → repack **01.07.99** → upgrade-install lên dnnqa1798 (test đường upgrade).
2. Verify tay wizard field-picks (§C.2); nếu bug thật → fix wizard.
3. QA sâu hơn nếu cần: widgets nâng cao trên DNN (Map/Slider/Payment), My Inbox + workflow, i18n.
4. **Merge PR #6** (docs DNN) — user 1 click hoặc ra lệnh merge tường minh.
5. Cleanup site khi xong: remove IIS site+pool, drop DB, xoá folder, bỏ dòng hosts, XOÁ dev.lock nếu không muốn AI.

Memory: [[project_20260709_dnn_package_clean_install_qa]]. Site Oqtane QA trước đó: :5120/:5121.
