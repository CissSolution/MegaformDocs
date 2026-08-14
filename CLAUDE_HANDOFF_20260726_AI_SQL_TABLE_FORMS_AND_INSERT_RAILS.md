# HANDOFF — 2026-07-26: AI form ↔ SQL table (FK) — 3 bug vá + on-rails premium retarget

Site: **DNN `dnn10_3_3_test20.ai`** (host/**dnnhost**), pool `DNN10_3_3_Test20.AI_nvQuickSite`,
DB `WINDOWS-11\SQLEXPRESS / DNN10_3_3_Test20`, site path `E:\DNN_SITES\DNN10_3_3_Test20\Website`.
Tiếp nối `CLAUDE_HANDOFF_20260726_AI_ENABLE_FORM10_AND_6_UI_FIXES.md` §9.

## 0. TL;DR — 6 hạng mục, tất cả SHIPPED + VERIFIED trên site

| # | Việc | Trạng thái |
|---|------|-----------|
| 1 | AI tạo form từ bảng "chỉ ra tiêu đề, không ra field" | ✅ vá — **KHÔNG phải lỗi tool-calling** |
| 2 | `Cannot call methods on nvarchar` do token `:name.first` | ✅ vá canonical ở Core + composite resolve thật |
| 3 | (mới, do E2E phát hiện) Number rỗng làm **rơi cả row**; dry-run ghi thật | ✅ vá |
| 4 | (user thêm) Premium template + bảng SQL → AI on-rails | ✅ 2 rail code + prompt + KB, verified |
| 5 | (user thêm) Danh sách bảng thiếu bảng của người dùng | ✅ vá — blacklist `MF[_]%` ăn nhầm bảng admin |
| 6 | (user thêm) Edit connection không hiện connection string | ✅ vá client + 4 twin server (mask round-trip) |
| 7 | (user thêm) Deploy site DNN **mới, sạch**, cài **bằng package** | ✅ `dnn1030_megafresh.ai` — DNN 10.3.0 + MegaForm 02.00.006 |

⚠ **Chưa commit** (rule: chỉ commit khi user bảo). Branch `feature/typed-submission-storage-core` vẫn UNPUSHED.

---

## 1. ⭐⭐⭐ Bug "AI chỉ ra tiêu đề, không ra field" = **preview bị CSS ẩn**, không phải AI

Chẩn đoán ban đầu (thiếu `add_field` ops) **SAI**. Đo thật:

- Repro headless: preview có **11 `.mf-field-group` + 16 input trong DOM**, nhưng `innerText` chỉ 21 ký tự.
- Enumerate rule thắng → thủ phạm là guard "one surface at a time" inject inline từ `FormView.ascx:168`:
  ```css
  html.mf-admin-shell-route .mf-form-wrapper:not(.mf-host-overlay .mf-form-wrapper),
  body.mf-admin-shell-route .mf-form-wrapper:not(.mf-host-overlay .mf-form-wrapper){display:none!important}
  ```
- Modal "Create with AI" mount một `.mf-form-wrapper` THẬT qua `MegaFormRenderer.init` nhưng **không nằm trong `.mf-host-overlay`** → cả form bị `display:none`, chỉ còn `<h2>` tiêu đề do `renderPreview` tự vẽ.
- **Đúng lớp lỗi đã vá cho gallery preview 07-24** (`gallery-preview.ts:463 [PreviewBlank v20260724]`) — modal AI chưa được vá.

**Fix** `dashboard/ai-form-creator.ts` `[AiPreviewBlank v20260726]`: `overlay.classList.add('mf-host-overlay')`.
⚠ **CHỈ nhánh dashboard** — class kèm `inset:0`, nếu áp cho builder thì panel dock phải sẽ có `left:0` và overlay trong suốt nuốt click của canvas.

**Verified**: preview 10/10 field hiện (`ai-e2e-preview.png`), form lưu thành FormId 13.

## 2. ⭐⭐⭐ Bug `:name.first` — vá ở Core (`FormDatabaseInsertService v20260726-01`)

Repro tầng SQL: `INSERT ... VALUES (@name.first)` → **Msg 258 `Cannot call methods on nvarchar`** (SQL Server đọc `.first` là gọi method trên biến). Đường này **fail-soft** → **mất TOÀN BỘ row**.

Vá canonical (dùng chung 4 nền):
- `_paramRx` nhận token có dấu chấm: `:([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)`.
- `SafeParam()` phẳng hoá `name.first` → `@name_first` (param SQL **không được** chứa dấu chấm); `ExtractParamNames` dedupe theo tên đã phẳng.
- `ResolveValue()` thứ tự: key nguyên văn → **`__mf_parts[field][part]`** (đúng cái renderer POST, xem `validation.ts:261-275`) → key `field_part` → DBNull.
  - `EnforceSubmit` **CloneData** nên `__mf_parts` còn sống ở `insertData` (DNN `MegaFormApiController:1301`).
- `Coerce()` = `[MultiValueCoerce]` cũ (Checkbox/Chips → CSV) áp cho MỌI nhánh, kể cả TestExecute.

⭐ Điểm quan trọng: **`:name.first` giờ CHẠY THẬT** (điền 2 cột từ 1 composite), không chỉ "hết crash".

## 3. ⭐⭐ Bug mới do E2E lộ ra: Number rỗng giết row + dry-run ghi thật

- Submit thật trả `200 success` nhưng **không có row** → khoanh vùng bằng TestInsert từng giá trị:
  `salary="" → DECIMAL` = `Error converting data type nvarchar to numeric`. (date rỗng / text rỗng thì OK.)
  ⇒ **một field Number tuỳ chọn bỏ trống = mất cả row**, im lặng.
- **Fix** `[BlankNumericRescue v20260726]`: chạy y như cũ trước; **chỉ khi throw VÀ có tham số là chuỗi rỗng** thì bind lại các chuỗi rỗng thành NULL rồi chạy lại. Không đổi hành vi của mọi ca đang chạy được.
- ⚠⚠ **BẪY**: đặt retry đó trong `TestExecute` (có transaction) làm **row dry-run bị GHI THẬT** — lần chạy đầu lỗi khiến SQL Server huỷ transaction, retry rơi vào **autocommit**, `tx.Rollback()` throw và bị `catch{}` nuốt, kết quả vẫn báo "ROLLED BACK". Đã sửa: `TestAttempt()` — **mỗi lần thử một transaction riêng**, luôn rollback. Verified `LeakedDryRunRows = 0`.

## 4. ⭐⭐ Premium template + bảng SQL → AI on-rails (yêu cầu mới của user)

Test: nhân bản form 10 (EuroYouth premium, 4 bước) → FormId **14 "PREMIUM RAIL TEST"** → Builder → AI Designer → tab Database chọn `MF_Test_Employees` → "sửa form cho khớp cột, giữ nguyên giao diện".

**Trước khi vá**: CSS + theme giữ nguyên ✓ nhưng **AI xoá mất Section `premium_step_2/3/4`** → wizard 4 bước sập còn 1; `type`/`properties` AI trả về **bị bỏ qua** (key giữ nguyên thì merge lấy field cũ) → không thể đổi kiểu trường; **không wire `databaseInsert`** → form không ghi vào bảng.

**2 rail tất định** trong `mergeKeepStyleFields` (`ai-form-creator.ts`) `[OnRails v20260726]`:
1. **Cấu trúc không phải của AI để xoá** — mọi field `Section/Heading/Divider/HtmlBlock/Html/Image` bị AI bỏ sót được **chèn lại đúng vị trí cũ**.
2. **Cho phép đúng thứ user muốn đổi** — `type` (chỉ scalar↔scalar; `Row`/`Section` vẫn đóng băng), `properties`, `widgetProps` được merge (trước đây bị vứt → `optionsSql` không bao giờ tới nơi).

Prompt premium thêm 2 dòng rail: cấm xoá Section (steps), và cho phép emit `settings.databaseInsert` khi retarget.

**Verified sau vá**: `customCss` hash **y hệt**, `theme` y hệt, 4 Section còn đủ, field remap đúng cột
(`department_id` Select, `phone` Composite, `start_date` Date, `salary` Number…), `databaseInsert` được wire.
`customHtml` 7011→6436 byte = wrapper của các field bị xoá bị gỡ theo (đúng thiết kế `syncFieldPlaceholders`,
không phải sáng tạo lại shell). Ảnh: `rails2-after.png`.

## 5. E2E "AI form trên bảng có FK → INSERT → submit → row" — PASS

Bảng test tạo mới: `MF_Test_Departments` (5 row) ← FK ← `MF_Test_Employees`.

- AI (form 13) tự sinh Select FK có **cả** `optionsSource:"sql"` **và** `optionsSql`, tự wire `databaseInsert` 10 cột.
- TestInsert 5 ca: dotted token ✓, `__mf_parts` ✓, mảng→CSV ✓, **vi phạm FK báo lỗi rõ** ✓, `:_submissionId` ✓.
- Submit thật → row: `SubmissionId=5, DepartmentId=2, FirstName=Nguyen, LastName=Van A, Skills="SQL, C#, Azure"`.

⚠ **2 lỗi AI hay mắc** (đã ghi vào KB): map Checkbox vào cột **BIT** (mảng rỗng → `""` → hỏng), và **quên `[SubmissionId] ← :_submissionId`**. Chips/Checkbox AI sinh **thiếu `options[]`**.

## 6. KB (theo rule user: kiến thức vào KB, không phình code)

3 entry `prompt_rule` mới — **song sinh 2 nơi** (Oqtane/Web/Umbraco đọc JSON nhúng; DNN seed bằng SqlScripts):
`MegaForm.Core/Seed/ai-knowledge-seed.json` (Id 330/331/332) + `MegaForm.DNN/SqlScripts/01.06.41.SqlDataProvider` (đã đăng ký trong `MegaForm.dnn`).

- `sql-table-data-entry-form` — 1 field / 1 cột thật, FK → Select trên bảng cha, wire databaseInsert, cấm form 1 field cho bảng 8 cột.
- `db-insert-token-rules` — `:field.part` cho composite, multi-select → CSV (cấm map vào BIT/INT/DATE), `:_submissionId/_formId/_submittedOnUtc`, 1 câu INSERT duy nhất, cảnh báo fail-soft.
- `premium-template-retarget-sql-table` — retarget premium: đổi field, **cấm** đụng customHtml/customCss/theme và **cấm** xoá Section steps.

Đã apply vào DB test (Id 62/63/64). ⚠ **Gap**: modal Create-with-AI ở dashboard **không đọc KB** (không có tools) — KB chỉ tới model qua builder chat (`list_knowledge`/`get_knowledge`). Muốn dashboard dùng KB thì phải nối 1 fetch nhỏ — chưa làm.

## 6b. ⭐⭐ Bảng của người dùng biến mất khỏi table picker (`NOT LIKE 'MF[_]%'`)

Đo trước, không đoán: DB có **194** bảng; `Subform/Tables?showAll=1` trả **193** (đủ) nhưng mặc định
(`showAll=0`) chỉ **49**. Nguyên nhân trong blacklist của `SubformController.ListTables`:
`AND TABLE_NAME NOT LIKE 'MF[_]%'   -- MegaForm's own tables`.
**Tiền tố không phải quyền sở hữu**: bảng dữ liệu admin tự đặt tên `MF_Form10_Applications` (402 dòng thật)
bị coi là bảng hệ thống → mất khỏi tab Database và khỏi mọi luồng "tạo form từ bảng", không một dấu hiệu nào.

**Fix**: `MegaForm.Core/Services/Subform/MegaFormInternalTables.cs` `[InternalTableList v20260726]` — liệt kê
**tường minh** 43 bảng nội bộ của MegaForm; controller đổi sang `TABLE_NAME NOT IN (…)`. Danh sách là hằng
compile-time (`^[A-Za-z0-9_]+$`) nên không có bề mặt injection.
**Verified**: mặc định 49 → **52**, có đủ `MF_Form10_Applications` + `MF_Test_*`, không lộ bảng nội bộ nào.
⚠️ 6 bảng tạo LAZY lúc chạy (`MF_ExternalBindings/RowMap`, `MF_WorkflowCases/Executions/Tasks/TaskActions`)
không có sau khi cài mới — vẫn phải nằm trong danh sách, nếu không chúng sẽ lọt vào picker khi được tạo.

## 6c. ⭐⭐ Edit connection: prefill + mask round-trip (4 nền)

Trước: nút Edit **xoá trắng** ô Connection String và bắt gõ lại toàn bộ ("secrets are never echoed back") —
trong khi **chính dòng danh sách ngay phía trên đã in cả chuỗi đó**. Sửa một lỗi chính tả ở tên server = phải
dựng lại connection từ trí nhớ.

- **Client** (`dashboard/index.ts` `[ConnEditPrefill v20260726]`): prefill đúng chuỗi mà dòng danh sách hiển thị
  (server đã `MaskSecrets` → chỉ `password=`/`pwd=` thành `***`), kèm dòng nhắc màu hổ phách nói rõ đang sửa
  connection nào và mật khẩu sẽ giữ nguyên nếu để `***`.
- **Server** (`NamedConnectionCatalog.RestoreMaskedSecrets` `[MaskRoundTrip v20260726]` + gọi ở **cả 4** twin
  DNN/Oqtane/Umbraco/Web): nếu chuỗi gửi lên còn mang mask thì **trả lại secret đã lưu**; mật khẩu gõ thật luôn thắng.
  Không có mask thì không đổi hành vi.
- **Verified bằng DB**: lưu `Password=S3cretPwd!` → list trả `Password=***` → sửa `SRV1`→`SRV2` với mask
  → PortalSettings lưu `Data Source=SRV2;…;Password=S3cretPwd!;` (mật khẩu sống sót).

## 6d. ⭐⭐⭐ Site DNN MỚI HOÀN TOÀN — cài bằng package (không copy DLL tay)

`http://dnn1030_megafresh.ai` · DNN **10.3.0** · DB `DNN1030_MegaFresh` · pool `DNN1030_MegaFresh`
· site path `E:\DNN_SITES\DNN1030_MegaFresh\Website` · host/**dnnhost**, admin/**dnnadmin**.

Công thức headless (tái sử dụng được):
1. Giải nén `E:\DNN\DNN_Platform_10.3.0_Install.zip` → `…\Website`; tạo DB rỗng.
2. `web.config` → `SiteSqlServer` (connectionStrings **và** appSettings) trỏ DB mới.
3. `Install/DotNetNuke.install.config.resources` → copy thành `DotNetNuke.install.config`, điền
   `<portalalias>` + `<portalname>`.
4. IIS: app pool v4.0 Integrated + website host-header; ACL Modify cho `IIS AppPool\<pool>` và `IIS_IUSRS`;
   hosts 127.0.0.1; tạo SQL login `IIS APPPOOL\<pool>` + `db_owner`.
5. **Đặt `MegaForm_02.00.006_Install.zip` vào `Website\Install\Module\` TRƯỚC** rồi gọi
   `GET /Install/Install.aspx?mode=install` → DNN cài platform **và** MegaForm trong cùng một lượt
   (log: `Installing Package File MegaForm_02.00.006_Install: Success`). Cài xong DNN tự xoá
   `Install.aspx` + install config (đã tự harden).

**4 bẫy gặp thật khi dựng:**
- ⭐DNN ép đổi mật khẩu host lần đăng nhập đầu (`ctl=PasswordReset&forced=true`) → `UPDATE Users SET UpdatePassword=0`.
- ⭐Bảng quyền tên là **`Permission`** (số ít), `TabModules` **không có** `IsWebSlice`, `LocalizedVersionGuid`
  NOT NULL (dùng empty-guid), `ModulePermission` cần **`PortalID`**.
- ⭐⭐**Batch `BEGIN TRAN` lỗi giữa chừng để hở transaction → khoá bảng → toàn site 500 "Execution Timeout"**.
  Chữa: `KILL` session còn `open_transaction_count>0` rồi restart pool.
- Module MegaForm không tự lên trang: chèn `ContentItems`+`Modules`+`TabModules`(+`ModulePermission`) cho
  Home tab rồi restart pool (đã làm — ModuleId **385**).

**Verified trên site sạch**: 37 bảng MF_ tạo bởi SqlScripts · **64 KB entry** trong đó có đủ 3 entry mới
(`sql-table-data-entry-form`, `db-insert-token-rules`, `premium-template-retarget-sql-table` → script
01.06.41 chạy trong package) · tab Database hiện `MF_Test_Departments`/`MF_Test_Employees`, không lộ bảng nội bộ ·
Edit connection prefill `…Password=***…` + dòng nhắc. Bảng test FK đã seed sẵn trong DB mới.
⚠️ **AI chưa bật trên site mới** (cố ý): cần `Website/dev.lock` + HostSettings `MegaForm_AI_ApiKey/_Provider/_BaseUrl/_Model/_Enabled` — key cũ **vẫn chưa rotate** nên chưa mang sang.

## 6e. ⭐⭐⭐ ĐỔI LUẬT: production ⇒ AI chạy; trial ⇒ chặn (bỏ ràng buộc `dev.lock`)

Quyết định của owner 2026-07-26: **AI là thứ giấy phép mua được** — một bản production vừa cài xong mà báo
`AI assistant disabled (no dev.lock)` là BUG, không phải tính năng. (Policy cũ 2026-05-27: AI ship dark, chỉ mở
bằng file marker `dev.lock`.)

**Luật mới** — `AiFeatureGate.IsAvailable()` `[ProductionUnlocksAi v20260726]` ở Core:
1. `LicenseService.IsProductionLicensed()` = true → **cho chạy** (không cần dev.lock).
2. Không phải production → chỉ cho chạy nếu có `dev.lock` = **máy DEV chưa có license** (build từ source).
   Bản **trial** của khách không kèm dev.lock ⇒ **luôn bị chặn**; `TrialTighten` cũ vẫn giữ nguyên
   (không phát API key + ép `enabled=false`).
3. Probe license lỗi → rơi về nhánh dev.lock (fail-closed).

Đổi **18 điểm gác** sang `IsAvailable` ở cả 4 nền: DNN (`AiAssistant/AiTools/AiKnowledge*Controller`,
`FormView.ascx.cs` ×3), Oqtane (`AiAssistantController` ×2, `Builder.razor`, `BuilderView.razor`),
Umbraco + Web (`AiAssistantController` ×2 mỗi bên).
**Giữ nguyên `IsEnabled` (dev.lock thuần)** cho 2 chỗ đúng nghĩa DEV: Oqtane `DevBulkCreateForms` và endpoint
báo cáo trạng thái `devLock`. 6 thông báo lỗi cũ ("… disabled (no dev.lock)") đổi thành
"… is not available on this install (a production licence is required)." — không còn xui người dùng tạo file lock.

**Verified trên `dnn1030_megafresh.ai` (KHÔNG có dev.lock):**
- license.lic=production → `DefaultConfig` **200** `{enabled:true, trial:false}`, `AiTools` 200, `AiKnowledge` 200.
- Tạm đổi tên license.lic (mô phỏng đúng bản trial) → cả 3 endpoint **404** với thông báo mới. Đã trả lại license.

## 6f. ⭐⭐ Submission detail thiếu trường (chữ ký + mọi field bỏ trống)

Owner: "submission detail chưa hiển thị đầy đủ các trường của form, ví dụ tôi đã thêm trường chữ ký".
Đo trên form EuroYouth (17 field, submission #2): panel chỉ vẽ **13 ô**. Server **KHÔNG có lỗi** —
`MegaFormUtils.BuildSubmissionSnapshots` dựng snapshot **theo schema**, mỗi field một snapshot (chỉ bỏ
Html/Section/Captcha), kể cả field rỗng và Signature. Mất mát 100% ở client `my-inbox/enrich.ts`:

1. `isSkippableField` lọc theo type: `/file|upload|signature|html|heading|…/` → **nuốt Signature/Image**,
   trong khi `view.ts` đã có sẵn nhánh render `signature` thành `<img>` — hai nửa của cùng một tính năng
   mâu thuẫn nhau.
2. `if (!value.trim()) return true;` → **field bỏ trống biến mất** (Year of birth / Language level /
   Motivation letter), khiến người xem tưởng form không có những trường đó.
3. Sau khi cho Signature lọt qua thì ảnh **vỡ**: client ưu tiên `displayValue`, mà server cố ý trả
   `"[signature]"` (để CSV/email/summary không mang blob base64) → `<img src="[signature]">`.

**Fix** `[DetailShowsEveryAnswer v20260726]`:
- `enrich.ts`: chỉ bỏ **type layout thuần** (`html|heading|divider|section|spacer|paragraph_static|captcha|pagebreak`)
  và `file|upload` (đã có khối **Attachments** riêng); giữ field rỗng; với `signature|image` **ưu tiên RAW value**
  (data:/http) thay cho displayValue placeholder.
- `view.ts`: value rỗng vẽ `—` (muted) thay vì ô trắng.

**Verified**: 13 → **17 ô** đúng bằng số field của form; `SIGNATURE IMG {w:570,h:104,src:"data:image/png;base64,…"}`;
Year of birth / Language level / Motivation letter hiển thị `—`. Ảnh: `detail-sig2.png`.
⚠️ Ghi nhận thêm (chưa sửa): client gọi `GET /API/Submissions/{id}?moduleid=…` → **404** rồi mới fallback sang
`Submissions/Get?submissionId=…` (thành công). Vô hại nhưng bẩn console — nên bỏ nhánh REST không tồn tại.

## 6g. ⭐⭐ Gỡ template khỏi Online Gallery — xoá trên GitHub là SAI ĐÒN BẨY

Owner xoá vài template trong `megaform-gallery/templates` trên GitHub nhưng chúng **vẫn hiện** trong Online Gallery.

Đo: `manifest.json` (raw GitHub = jsDelivr, giống hệt) khai **42** entry trong khi `/templates` chỉ còn **40**
file `.json` → **2 entry ma**: `festa-italiana`, `obsidian-member-login`.

**3 điều phải nhớ:**
1. **Gallery liệt kê theo `manifest.json`, KHÔNG theo nội dung thư mục.** Xoá file mà không sinh lại manifest
   ⇒ thẻ vẫn hiện, bấm cài thì hỏng (file 404).
2. **Nguồn sự thật là repo CHÍNH, không phải repo gallery**: `tools/gallery/build-gallery.mjs` sinh manifest từ
   `Samples/FormTemplates/Premium/DONEE/` (`SRC`). Xoá bên GitHub mà nguồn còn ⇒ **lần publish sau nó quay lại**.
   Script đã tự dọn: nó `rmSync` sạch `templates/*.json|zip` ở output rồi sinh lại → **xoá ở nguồn là đủ**.
3. Cache chỉ gây trễ **sau khi** manifest đã đúng: jsDelivr (purge từng file đã đổi) + `GalleryRepositoryService`
   TTL 15' (restart site hoặc `RemoteGalleryList?refresh=true`).

**Đã làm (07-26)**: backup 2 file nguồn ra scratchpad → xoá khỏi `DONEE/` → chạy lại `build-gallery.mjs`
→ clone: **40 templates, 40/40 verified, 0 slug ma**, git status đúng 4 xoá + manifest/index sửa.
⚠️ Owner mới xoá `.json` trên web nên **2 file `-assets.zip` vẫn còn trên origin** — commit này dọn nốt.
⚠️ Clone đang **behind origin 2 commit** → phải `git pull --rebase` trước khi push.
✅ ĐÃ ĐẨY: commit `dc53e2a` (rebase lên `0dabab4`) → push `0dabab4..dc53e2a` → purge jsDelivr **6 file**
(manifest.json, index.html, 2×.json, 2×-assets.zip) → CDN manifest còn **40 entry, 0 ghost**.

### 6g-bis. ⭐⭐⭐ FILE TRÊN REPO LÀ SỰ THẬT — xoá tay trên GitHub giờ có hiệu lực

Owner yêu cầu: "xoá tay trên GitHub, MegaForm chỉ căn cứ file có thật, không phụ thuộc manifest".
Bỏ manifest HOÀN TOÀN thì mất 2 thứ: **sha256 verify từng file tải về** (chống CDN/repo bị sửa) và
**metadata rẻ** (title/description/category/icon/premium/fieldCount) — không có manifest phải tải cả 40 file
JSON chỉ để vẽ lưới. Nên làm cách giữ được cả hai:

`GalleryRepositoryService.GetTemplatesManifestAsync` `[FilesAreTruth v20260726]` — **đối chiếu manifest với
danh sách file thật của repo**, loại mọi entry có `file` không còn tồn tại:
- Danh sách lấy 1 lần từ **jsDelivr data API** `https://data.jsdelivr.com/v1/packages/gh/<owner>/<repo>@<ref>`
  (`BuildListingUrl` suy ra từ RepoBaseUrl), cache chung TTL 15' với manifest.
- **Fail-open**: base URL không phải jsDelivr, hoặc API lỗi ⇒ trả manifest nguyên vẹn (đúng hành vi cũ).
- Manifest vẫn là nguồn của metadata + sha256 ⇒ **không mất lớp kiểm tra toàn vẹn**.

**Verified bằng chính tình huống của owner** (không đụng repo): trỏ `MegaForm_GalleryRepoUrl` vào commit
`@0dabab4` — đúng lúc owner đã xoá 2 file .json nhưng manifest còn 42 entry:
`RemoteGalleryList?refresh=true` → **40 template, 0 ghost**. Trả lại setting mặc định, gallery vẫn 40 từ `@main`.

⚠️ Vẫn còn 1 điểm KHÔNG thể tự động hoá: xoá tay trên GitHub chỉ ẩn thẻ. **Nguồn** ở
`Samples/FormTemplates/Premium/DONEE/` mà còn thì lần chạy `build-gallery.mjs` sau sẽ đăng lại template đó.

## 7. FILE ĐÃ SỬA (canonical, chưa commit)

- `MegaForm.Core/Services/FormDatabaseInsertService.cs` — `v20260726-01`: `[DottedParamFlatten]`, `ResolveValue/__mf_parts`, `[MultiValueCoerce]`, `[BlankNumericRescue]`, `TestAttempt`.
- `MegaForm.UI/src/dashboard/ai-form-creator.ts` — `[AiPreviewBlank v20260726]`, `[OnRails v20260726]` (mergeKeepStyleFields), 2 dòng rail trong prompt premium.
- `MegaForm.Core/Seed/ai-knowledge-seed.json` — entries 330/331/332.
- `MegaForm.DNN/SqlScripts/01.06.41.SqlDataProvider` (mới) + `MegaForm.DNN/MegaForm.dnn` (đăng ký script).
- `MegaForm.Core/Services/Subform/MegaFormInternalTables.cs` (mới) + `MegaForm.DNN/WebApi/SubformController.cs` — `[InternalTableList v20260726]`.
- `MegaForm.Core/Services/NamedConnectionCatalog.cs` — `RestoreMaskedSecrets` `[MaskRoundTrip v20260726]`; gọi ở `MegaForm.DNN/WebApi/MegaFormApiController.cs`, `MegaForm.Oqtane.Server/Controllers/MegaFormController.ModuleConfigDatabase.cs`, `MegaForm.Umbraco/Controllers/MegaFormApiController.ModuleConfig.cs`, `MegaForm.Web/Controllers/MegaFormController.cs`.
- `MegaForm.UI/src/dashboard/index.ts` — `[ConnEditPrefill v20260726]`.
- `MegaForm.UI/src/my-inbox/enrich.ts` + `MegaForm.UI/src/my-inbox/view.ts` — `[DetailShowsEveryAnswer v20260726]`.
- `MegaForm.Core/Services/GalleryRepo/GalleryRepositoryService.cs` — `[FilesAreTruth v20260726]` (đối chiếu manifest ↔ file thật qua jsDelivr data API, fail-open).
- Repo gallery `CissSolution/megaform-gallery` — commit `dc53e2a` (40 templates).
- `MegaForm.Core/Services/AiAssistant/AiFeatureGate.cs` — `IsAvailable()` `[ProductionUnlocksAi v20260726]`; 18 điểm gác ở DNN/Oqtane/Umbraco/Web chuyển sang dùng nó + 6 thông báo lỗi mới.
- `MegaForm.DNN/Views/FormView.ascx.cs` — const V B413 → **B414**.
- Bundle build lại: `Assets/js/megaform-dashboard.js`, `Assets/js/megaform-ai-form-assistant.js`.
- Artifact: `MegaForm.DNN/Install/MegaForm_02.00.006_Install.zip` (12,35 MB, Production edition).

## 8. DEPLOY đã làm trên site

1. `cd MegaForm.UI && npm run build:dashboard` + `node scripts/build-entry.cjs ai-form-assistant`
   → copy tay 2 file vào `Website/DesktopModules/MegaForm/Assets/js/`.
   ⚠ **AI Designer trong builder dùng `megaform-ai-form-assistant.js`** (nó gọi `openBuilderStudio` của ai-form-creator) — sửa ai-form-creator phải build **cả hai** bundle.
2. `dotnet build MegaForm.DNN -c Release` → **stop pool → copy `MegaForm.Core.dll` + `MegaForm.DNN.dll` vào `Website/bin` → start pool** (DNN install KHÔNG ghi đè bin DLL).
3. SQL: chạy `01.06.41.SqlDataProvider` (tách batch theo `GO`) vào DB.

## 9. 🔴 CÒN LẠI

- **Twin 3 nền còn lại**: Oqtane/Web/Umbraco dùng chung `FormDatabaseInsertService` (đã vá) nhưng **chưa build/QA**; `ai-form-creator.ts` là bundle chung nên chỉ cần build entry tương ứng khi deploy.
- **Dashboard AI chưa đọc KB** (§6) — cân nhắc nối 1 fetch `AiTools/Knowledge?kind=prompt_rule`.
- Chips/Cards do AI sinh **thiếu `options[]`** khi bảng không gợi ý được giá trị — cân nhắc rail deterministic (fill options từ CHECK constraint / distinct values).
- Rebuild DNN package (`BuildPackage-DNN.ps1`) để `const V B413` + script SQL mới vào gói cài đặt.
- Push branch + commit (chưa làm).
- ⚠ **OpenAI key vẫn CHƯA rotate** (nằm trong HostSettings `MegaForm_AI_ApiKey`).

## 10. Artifact test (site-only)

- Bảng `MF_Test_Departments` / `MF_Test_Employees`; Form **13** "Nhập Liệu Nhân Viên" (đã patch thành ca regression: composite `full_name`, Radio `is_active`, `[SubmissionId]`), Form **14** "PREMIUM RAIL TEST".
- Script QA (scratchpad `14a5e882-…`): `ai-repro.mjs`, `ai-probe.mjs`/`ai-probe2.mjs` (enumerate CSS rule), `ai-e2e.mjs`, `test-insert.mjs`, `test-empty.mjs`, `probe-tx.mjs`, `submit-api.mjs`, `rails-test.mjs`, `patch-form13.mjs`, `add-kb.mjs`/`add-kb2.mjs`.
