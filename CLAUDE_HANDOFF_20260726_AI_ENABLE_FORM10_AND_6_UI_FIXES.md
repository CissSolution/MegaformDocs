# HANDOFF — 2026-07-25→26: DNN crash fix + AI enable + Form10 DB-insert + 6 UI/QA fixes

Site xuyên suốt: **DNN `dnn10_3_3_test20.ai`** (host/**dnnhost**), DNN 10.3.3, pool **`DNN10_3_3_Test20.AI_nvQuickSite`**,
DB **`WINDOWS-11\SQLEXPRESS` / `DNN10_3_3_Test20`** (Windows auth, current user `WINDOWS-11\Administrator` = sysadmin),
site path **`E:\DNN_SITES\DNN10_3_3_Test20\Website`**. Node v24 + playwright (local node_modules) sẵn; Invoke-Sqlcmd OK.
Memory chi tiết: [[project_20260725_ai_enable_form10_dbinsert]] + [[reference_dnn_azure_core_clientmodel_crash]].

## 0. TL;DR — mọi việc SHIPPED + VERIFIED (trừ 2 mục pending ở §9)
0. ✅ **DNN whole-site crash** sau cài MegaForm (`System.ClientModel 1.11.0.0` FileNotFound) — package quên ship 4 DLL transitive của Azure.Core 1.55. Vá build script + manifest.
1. ✅ **AI "disabled (no dev.lock)"** — tạo `dev.lock` + set OpenAI key HostSettings; site production → AI chạy (verified OpenAI gpt-4o 200).
2. ✅ **Form 10 ghi trực tiếp custom SQL table** `MF_Form10_Applications` + seed 400 + E2E submit→row. Kèm **vá bug multi-value DatabaseInsert rớt cả row**.
3. ✅ **Signature widget**: click ký → placeholder "Sign here" ẩn (CSS-only).
4. ✅ **Submissions "SQL table" source**: click row → mở **rich detail chung** với JSON mode (khi row có SubmissionId).
5. ✅ **Database Settings add/delete connection** — thực ra ĐÃ HOẠT ĐỘNG (verified E2E); user nhầm Config entry read-only.
6. ✅ **Click TÊN form (Form Management) → Submissions** thay vì Builder.
7. ✅ **Checkbox thừa cạnh toggle-pill** (builder right-palette After-Submit) — CSS-only.
8. ✅ **SSMS/VS connect** — hướng dẫn (không sửa code): kết nối thật đã thành công, DB có đủ, Refresh + Filter.

---

## 1. ⭐⭐⭐ DNN crash: Azure.Core 1.55 thiếu System.ClientModel.dll  → [[reference_dnn_azure_core_clientmodel_crash]]
- Cài MegaForm DNN → MỌI trang 500: `TypeInitializationException 'ExtensionPointManager' → FileNotFoundException: System.ClientModel, Version=1.11.0.0`.
- **Root cause:** CloudStorage bump Azure.Storage.Blobs 12.29.1 → **Azure.Core 1.55.0** kéo transitive `System.ClientModel`. Azure.Core.dll có **assembly-level attribute** trỏ type trong System.ClientModel; DNN quét custom-attribute MỌI DLL bin lúc khởi động (MEF SafeDirectoryCatalog) → force-resolve → thiếu file = crash TOÀN site (KHÔNG fail-soft). DNN 10.3.3 không carry System.ClientModel/System.Memory.Data/System.IO.Hashing/System.Diagnostics.DiagnosticSource.
- **Fix:** thêm 4 DLL vào `MegaForm.DNN/BuildPackage-DNN.ps1` `$cloudDllNames` VÀ `MegaForm.DNN/MegaForm.dnn` `<component type="Assembly">`. Chỉ `System.ClientModel` là site-killer (bị attribute-scan); 3 cái kia cho cloud runtime.
- **Hotfix site đang sập:** copy 4 DLL từ `MegaForm.DNN/bin/Release/net472/` vào `<site>/Website/bin/` (ghi bin tự recycle app-domain).

## 2. ⭐ AI "no dev.lock" — 3 GATE ĐỘC LẬP (user: dev.lock ≠ license → ĐÚNG)
- (1) **`dev.lock` (AiFeatureGate)** — AI ship dark theo policy owner 2026-05-27; thiếu → 404 `"AI assistant disabled (no dev.lock)"`. Gate DEV, tách hẳn license. DNN paths: site root `Website/`, `Website/App_Data/`, `Website/DesktopModules/MegaForm/`, `Portals/0/`. Check per-request (File.Exists) → không cần restart.
- (2) HostSetting `MegaForm_AI_Enabled`. (3) `LicenseService.IsTrial()` — trial giữ key + ép off.
- **Đã làm:** tạo `Website/dev.lock`; set HostSettings `MegaForm_AI_ApiKey`(IsSecure=1)/`_Provider=openai`/`_BaseUrl=https://api.openai.com/v1`/`_Model=gpt-4o`/`_Enabled=true`; restart. `license.lic="production"` sẵn (`DesktopModules/MegaForm/license.lic`) → không trial. **Verified:** `GET /DesktopModules/MegaForm/API/AiAssistant/DefaultConfig` → 200 `{enabled:true,trial:false,apiKey(164)}`; panel hết lỗi; curl OpenAI gpt-4o → 200. **AI traffic = browser→OpenAI trực tiếp** (key phát cho admin browser).
- 🔴 **ROTATE KEY**: OpenAI key user dán trong chat ĐÃ LỘ + đang nằm trong HostSettings `MegaForm_AI_ApiKey`.

## 3. ⭐⭐ Form 10 → custom SQL table (`MF_Form10_Applications`) + 400 seed  (form "sss", 16 field)
- **DatabaseInsert** = `FormSettings.databaseInsert` (JSON key camelCase) trong `MF_Forms.SettingsJson`: `{enabled,connectionKey,databaseType,insertSql,parameterMapping}` (class `FormDatabaseInsertSettings` — `FormSchema.cs:662`).
- Pipeline DNN: `MegaFormApiController` submit → `ProcessSubmissionAsync` → nếu enabled chạy `FormDatabaseInsertService.Execute(settings, insertData)` (`MegaFormApiController.cs:1306`). insertData = formData + `_submissionId`/`_formId`/`_submittedOnUtc`. connectionKey **`DashboardDatabase`** (always-allowed) → `DnnConnectionRegistry` (định nghĩa trong `DnnServiceLocator.cs`) fallback DNN default DB.
- Làm: tạo table (cột theo field key), chèn config vào SettingsJson bằng **surgical string-replace `"databaseInsert":null`** (KHÔNG parse-reserialize — SettingsJson đầy duplicate camel/Pascal keys, node JSON.parse last-wins sẽ collapse), seed 400 realistic, restart. Submit endpoint = `POST /DesktopModules/MegaForm/API/Submit/Post` body `{formId,submissionTime,data:{key:val}}` (`[AllowAnonymous]`, không antiforgery). Select/Radio/Checkbox value PHẢI khớp options schema (validate). E2E: submit thật → row có `SubmissionId` NOT NULL (row 401/402, SubId 2/4).
- ⭐⭐**BUG phát hiện + FIX**: multi-checkbox (`getFieldValue` `conditional.ts:38` trả **ARRAY**) → SqlClient không bind array vào cột scalar → `Execute` throw → fail-soft → **RỚT CẢ ROW** (dính MỌI form dùng DatabaseInsert + multi-value field). **Canonical fix** `FormDatabaseInsertService.cs [MultiValueCoerce v20260725]`: join non-string IEnumerable → CSV. **Config workaround NGAY** (DLL chưa rebuild): bỏ `interests`/`:interests` khỏi insertSql form 10 → row luôn ghi. Sau khi build+deploy Core fix → thêm lại interests.

## 4. ⭐ Signature: placeholder ẩn khi ký  (CSS-only — KHÔNG rebuild bundle)
- Reproduce: vẽ → `.mf-signature-empty` gỡ ĐÚNG nhưng placeholder vẫn hiện (`styleTag:false`). Root cause: rule ẩn được **inject ở render-path (`inputs.ts ensureSignaturePlaceholderCss`)**, nhưng DNN premium form render signature từ **SSR** → chỉ chạy bind-path (`interactive.ts`) → `<style>` không vào DOM.
- **Fix:** thêm rule vĩnh viễn vào `Assets/css/megaform.css` `[SignaturePlaceholderHide v20260726]` `.mf-signature-field:not(.mf-signature-empty) .mf-signature-placeholder{opacity:0;visibility:hidden}` (luôn load mọi platform/path). Deploy css → site.

## 5. ⭐ Submissions "SQL table": click row → detail CHUNG với JSON mode
- Root cause: `SubmissionsShell.ts buildRow` cố tình bỏ click cho SQL row (`isSqlRow = submissionId < 0`, "nothing to GET").
- **Fix (TS)** `[SqlRowUnifiedDetail v20260726]`: SQL row có cột **`SubmissionId`>0** (link MF_Submissions vì insertSql chứa `:_submissionId`) → `openSqlRowSheet` **delegate `openDetailSheet({...sub,submissionId:realId})`** → mở rich detail y hệt JSON mode (`mountTaskDetail`: avatar+FORM RESPONSES+Details/History/Workflow+Print/Export). Row seed (không SubmissionId) → fallback key/value sheet "Row — <table>". Verified rich detail "Submission #4".

## 6. Database Settings add/delete connection — ĐÃ HOẠT ĐỘNG (không sửa code)
- Verified E2E: backend `ModuleConfig/ConnectionsList/Save/Delete` (`MegaFormApiController` :4136/:4184/:4219) → 200 success; UI (`dashboard/index.ts:1495+` "SQL Connections") có đủ add form + Save + Edit/Delete; add qua UI → "QaUiConn" hiện với Delete.
- **User nhầm:** chỉ thấy **"Config DashboardDatabase"** = từ host config file = **READ-ONLY** (không có Delete — đúng thiết kế); phải scroll xuống form + "Save Connection" → connection badge "Saved" mới có Edit/Delete. Modal đúng = mở qua **sidebar "Cài đặt"** = `openSettingsPane()` (KHÁC popup "Cài đặt MegaForm" = module view = `settings-popup.ts`). Đã bump CrmVersion phòng cache.

## 7. ⭐ Click TÊN form → Submissions (không Builder)  — `dashboard/index.ts` `[FormNameToSubmissions v20260726]`
- 3 chỗ link `a.mf-form-name-link` đổi `getDashboardShellRoute('builder',id)`/`URLS.builder(id)` → `'submissions'`/`URLS.submissions(id)`: `openAppAdminPanel`(~3937), **`buildAppGroupedFormsCard`(~4222 = surface Form Management)**, `buildNormalFormsCard`(~4519 = dashboard home). Builder vẫn vào qua icon pencil cột Actions. Build `npm run build:dashboard` → deploy. Verified 6/6 link `#mf-submissions`.

## 8. ⭐ Checkbox thừa cạnh toggle-pill (builder right-palette After-Submit)  — CSS-only
- Reproduce + enumerate matched rules: reset `megaform-builder-shell.css` `.mf-settings-scroll input[type="checkbox"]{appearance:checkbox!important;opacity:1;position:static}` (specificity 0,2,1 + !important) **thắng** rule ẩn `.mf-evoq-toggle-input{opacity:0}` (0,1,0) → native checkbox `appearance:checkbox` + width:0 vẫn **vẽ glyph** (rect=0 nhưng nhìn thấy). "Khá nhiều" vì reset áp mọi checkbox settings → un-hide mọi evoq toggle.
- **Fix** `[EvoqToggleExclude v20260726]`: thêm `:not(.mf-evoq-toggle-input)` vào selector reset → normal checkbox vẫn native, evoq pill giữ ẩn. Deploy `megaform-builder-shell.css`. Verified DOM: 4 evoq input → `opacity:0`.

## 8b. SSMS/VS connect (không code) — `WINDOWS-11\SQLEXPRESS / DNN10_3_3_Test20`
- Lỗi "connection successfully made but error saving connection history / Element not found 0x80070490 (VisualStudio.Data.Tools)" = **kết nối OK**, chỉ bug cosmetic lưu MRU → bấm OK dùng được. DB có 127 cái, `DNN10_3_3_Test20`(id127)+`LegacyErp_Demo`(id112) ONLINE; login sysadmin thấy hết → **Refresh node Databases (F5)** + dùng **Filter** (127 DB). SSMS chỉ nhập Server name `WINDOWS-11\SQLEXPRESS` (KHÔNG dán connection string) + Windows Auth + tick Trust Server Certificate. Remote: SQL Browser STOPPED + TCP/IP off → phải bật.

---

## 8c. ✅ 07-26 GỠ HẲN Azure Blob (cắt gốc lỗi Azure.Core) — user quyết KHÔNG cần Azure Blob
- Gỡ: `MegaForm.Integrations.CloudStorage/AzureBlobStorageProvider.cs` (xoá); **5 registration** (`MegaForm.DNN/Services/DnnServiceLocator.cs`, `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs`, `MegaForm.Web/Program.cs`, `MegaForm.Oqtane.Server/Services/Startup.cs`, `MegaForm.Umbraco/Composers/MegaFormComposer.cs`); `Azure.Storage.Blobs` khỏi `CloudStorage.csproj`; 2 UI array (`cloud-storage-settings.ts`, `dashboard/index.ts`); `BuildPackage-DNN.ps1 $cloudDllNames` + `MegaForm.dnn` (bỏ mọi Azure.*/System.ClientModel/Memory.Data/IO.Hashing/Diagnostics.DiagnosticSource — chỉ còn CloudStorage+AWSSDK.Core+AWSSDK.S3). Marker `[AzureBlobRemoved v20260726]`.
- **Verified:** `dotnet build MegaForm.DNN -c Release` = **0 error**; output `bin/Release/net472` **KHÔNG còn Azure/System.ClientModel** (chỉ AWSSDK.Core/S3+CloudStorage). ⇒ **§1 (crash Azure.Core) coi như đóng** — build net472 sạch, không cần ship 4 DLL nữa. Còn Google Drive + Amazon S3.
- ⚠️ 2 UI bundle (dashboard/builder) đã sửa source nhưng **CHƯA rebuild+deploy** → dropdown Cloud Storage vẫn hiện "AzureBlob" tới khi rebuild (chọn = fail-soft vô hại).

## 9. 🔴 PENDING (chưa làm — phiên sau)
- ⭐**PHIÊN SAU: EXTENSIVE TEST "AI tạo form nhập trực tiếp vào SQL table" (+ table có QUAN HỆ/FK).** User: prompt vd "tạo 1 form nhập liệu cho bảng MF_Form10_Applications" (chọn table ở tab Database của Create-with-AI) hiện **1 loạt lỗi** — screenshot: form ra chỉ tiêu đề + Test INSERT lỗi. 2 bug đã chẩn đoán:
  - **(1) AI chỉ ra tiêu đề, KHÔNG ra field** = bug tool-calling (model emit op tiêu đề nhưng thiếu `add_field` ops). Repro (capture `[MfAiChat]` console text+toolCalls) + tune prompt/normalize `ai-form-assistant/chat.ts` (`chat.ts:962` auto-retry chỉ bắt case 0-op, không bắt case chỉ-title-op). → rebuild builder bundle.
  - **(2) Test INSERT lỗi `Cannot call methods on nvarchar`** — INSERT AI sinh có token composite **`:name.first`/`:name.last`** (Full Name có sub-part) → normalize `@name.first` → SQL Server hiểu `.first` = method trên nvarchar → fail. **Param SQL KHÔNG được có dấu chấm.** Fix: normalizer (`FormDatabaseInsertService._paramRx` + "Generate INSERT" phía client) flatten `name.first`→`name_first` + map composite field → cột thật; kèm multi-value (interests) đã có Core `[MultiValueCoerce]` chờ deploy. Test cả FK-related tables + validate + submit E2E.
- **Rebuild DNN DLL** để: (a) bust CSS/JS cache vĩnh viễn cho returning-user (const V B412→**B413** đã bump source, chưa build); (b) ship Core `[MultiValueCoerce]` fix (§3) rồi thêm lại `interests` vào insertSql form 10. (Azure DLL KHÔNG còn cần — đã gỡ §8c.) ⚠️ vẫn theo [[reference_dnn_azure_core_clientmodel_crash]] khi build net472.
- **Push branch** `feature/typed-submission-storage-core` — vẫn UNPUSHED (từ phiên trước; classifier chặn; rà secrets root trước).
- **Commit** — chưa commit gì (rule: chỉ commit khi user bảo).

## 10. FILE ĐÃ SỬA (canonical, repo — CHƯA COMMIT)
- `Assets/css/megaform.css` — `[DnnTightSpacing]` (spacing 20→12 `.DnnModule`) + `[SignaturePlaceholderHide v20260726]`.
- `Assets/css/megaform-builder-shell.css` — `[EvoqToggleExclude v20260726]`.
- `MegaForm.Core/Services/FormDatabaseInsertService.cs` — `[MultiValueCoerce v20260725]`.
- `MegaForm.DNN/Views/FormView.ascx.cs` — const V B412→B413 (pending DLL build).
- `MegaForm.DNN/BuildPackage-DNN.ps1` + `MegaForm.DNN/MegaForm.dnn` — 4 Azure.Core DLL.
- `MegaForm.UI/src/submissions/SubmissionsShell.ts` — `[SqlRowDetail/SqlRowUnifiedDetail v20260726]`.
- `MegaForm.UI/src/dashboard/index.ts` — `[FormNameToSubmissions v20260726]`.
- Built bundle (repo `Assets/js/`): `megaform-submissions.js`, `megaform-dashboard.js` (rebuilt).

## 11. ⭐⭐ DEPLOY RECIPE lên site DNN (load-bearing)
- **CSS**: sửa canonical `Assets/css/*.css` → `cp` vào `E:\DNN_SITES\DNN10_3_3_Test20\Website\DesktopModules\MegaForm\Assets\css\<f>.css`.
- **JS**: `cd MegaForm.UI && npm run build:<entry>` (submissions/dashboard/builder/renderer…) → xuất `../Assets/js/<bundle>.js` (sync-platforms chỉ copy vào **repo wwwroot**, KHÔNG site) → **`cp` tay** vào site `DesktopModules/MegaForm/Assets/js/<bundle>.js`. ⚠️ **Site load bản `js/<bundle>.js` (root) cho renderer/submissions/dashboard; NHƯNG builder load từ `js/bundles/megaform-builder.js`** — deploy đúng chỗ.
- **Cache**: DNN nhét `?v=` (const V, pinned trong DLL) + `?cdv=<CrmVersion>`. Fresh playwright context = QA không dính cache. Cho user browser: **Ctrl+F5** HOẶC bump `HostSettings.CrmVersion` (SQL `UPDATE HostSettings SET SettingValue=CAST(CAST(SettingValue AS INT)+1 AS NVARCHAR) WHERE SettingName='CrmVersion'`) + restart pool → bust mọi client resource. **Phiên này CrmVersion đã 51→52.**
- Restart pool: `Restart-WebAppPool 'DNN10_3_3_Test20.AI_nvQuickSite'`. Sau SQL đổi MF_Forms/ModuleSettings cũng cần restart (DNN cache in-memory).

## 12. Site-only artifacts (không trong repo)
- `Website/dev.lock` (AI enable), `Portals/_default/Skins/Aperture/form-2col.ascx` (skin 2-cột từ phiên trước), HostSettings AI keys, table `MF_Form10_Applications`+400 rows, form 10 SettingsJson databaseInsert, tab 40 demo page.

Scripts QA (scratchpad `9d600d8c-…`): `measure-dnn/tune-dnn/shot/shot-auth/sig-probe/sig-rules/subs-sql-probe/conn-crud/conn-ui/formname/evoq-probe.mjs`, `make-demo-pages.ps1`, `form10-setup.ps1`.
