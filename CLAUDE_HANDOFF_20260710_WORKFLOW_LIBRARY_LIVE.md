# HANDOFF 2026-07-10 — Reusable Workflow Library: từ code chết → chạy thật (Oqtane :5122)

## 0. TL;DR

Workflow library **đã tồn tại sẵn ~85%** trong repo (models, EF tables, repository, DI, engine resolve).
Nó không chạy vì **một cổng chặn ở Core** và vì **chưa platform nào có API + UI**.

Phiên này: sửa cổng, thêm lớp override per-form, chốt chính sách version, viết API + UI, và
**chứng minh end-to-end trên :5122** (không chỉ QA giao diện — có bằng chứng ở tầng DB + negative control).

Bonus: sửa một bug có sẵn — mở BPMN editor, đóng, bấm BPMN lại thì **không mở lại**.

Deployed: `:5122` (Oqtane.MegaForm.Fresh1799), AssetVersion **B385**. Console 0 error / 0 warn.

---

## 1. Nguyên nhân gốc (đã kiểm chứng, khác với chẩn đoán của Kimi AI)

`WorkflowEngineV2` **đã ưu tiên library** từ trước:
`ExecuteAsync` → `ResolveWorkflowForForm(formId)` ([WorkflowEngineV2.cs:72,465](MegaForm.Core/Services/WorkflowEngineV2.cs#L72)),
comment ngay trên đó: *"Reusable library mappings win; legacy per-form WorkflowJson remains the fallback"*.

Engine không có lỗi. **Engine không bao giờ được gọi**:

```csharp
// SubmissionProcessor.cs:339 (cũ)
var workflowState = GetWorkflowState(form.WorkflowJson);   // chỉ đọc cột WorkflowJson
// :366 (cũ)
bool canRunWorkflow = workflowState.HasAppliedWorkflow && _workflowEngine != null;
```

Form chỉ có mapping trong `MF_FormWorkflows` (WorkflowJson rỗng) → `HasAppliedWorkflow=false`
→ rơi vào nhánh legacy (admin email + autoresponder + webhook), log *"will use legacy post-submit actions"*.
Không lỗi, không cảnh báo cho user. Đây chính là blocker đã PARK hôm 07-10 sáng.

> ⚠️ Doc `Docs/WORKFLOW_TEMPLATE_LIBRARY_WEB_IMPLEMENTATION_GUIDE.md` (Kimi AI) hướng dẫn xây
> DbSet + repo + controller cho **Web host**. Làm xong hết vẫn **không chạy**, vì cổng chặn nằm ở
> `MegaForm.Core` — dùng chung cả 4 platform. Doc đó cần sửa phần "nguyên nhân" và "flow bước 4".

---

## 2. Đã sửa gì

### P1 — Trigger gate (Core, hưởng lợi cả 4 platform)

| File | Thay đổi |
|---|---|
| `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` | **NEW** `bool HasExecutableWorkflow(int formId)` trên `IWorkflowEngine` |
| `MegaForm.Core/Services/WorkflowEngineV2.cs` | Implement = `ResolveWorkflowForForm(formId) != null`, bọc try/catch → **fail closed** |
| `MegaForm.Core/Services/SubmissionProcessor.cs` | Gate mới (xem dưới) |
| `MegaForm.Oqtane.Server/Services/NoOpWorkflowEngine.cs` | `=> false` |
| `MegaForm.AspNetCore.Component/NoOpWorkflowEngine.cs` | `=> false` |

```csharp
// SubmissionProcessor.cs — mới
bool hasLibraryWorkflow = !workflowState.HasAppliedWorkflow
    && _workflowEngine != null
    && _workflowEngine.HasExecutableWorkflow(formId);

bool canRunWorkflow = _workflowEngine != null
    && (workflowState.HasAppliedWorkflow || hasLibraryWorkflow);
```

**Vì sao an toàn cho 3 platform kia:** `WorkflowEngineV2` có overload ctor 3-tham-số truyền
`libraryRepo = null` ([WorkflowEngineV2.cs:39-46](MegaForm.Core/Services/WorkflowEngineV2.cs#L39)).
Web/Umbraco/DNN **không register** `IWorkflowLibraryRepository` → DI chọn overload đó →
`ResolveWorkflowForForm` bỏ qua library → `HasExecutableWorkflow` chỉ trả true khi có legacy applied
→ **hành vi y hệt hôm nay**. Đã build sạch cả 5 project để xác nhận.

**KHÔNG bật draft:** `IWorkflowRepository.GetByFormId` trả `envelope.AppliedWorkflow` (không phải draft),
nên gate mới không vô tình cho draft chạy. Đã đọc `EfWorkflowRepository.cs:76-79`.

Đổi thêm: `_documentRevisionService.UpsertFromSubmission(..., canRunWorkflow)` — trước truyền
`workflowState.HasAppliedWorkflow`, giờ đúng nghĩa "form này có workflow chạy được".

### P2 — Lớp override per-form (biến Hybrid thành Template Method thật)

Trước: một template dùng chung → **mọi form dùng chung một giá trị biến**. Không thể "form A duyệt qua Nam,
form B duyệt qua Lan" trừ khi nhân bản template.

| File | Thay đổi |
|---|---|
| `MegaForm.Core/Models/WorkflowLibraryModels.cs` | `FormWorkflowMappingInfo.VariableOverridesJson` (mặc định `"{}"`) + `WorkflowRuntimeDefinition.VariableOverrides` |
| `MegaForm.Core/Services/WorkflowEngineV2.cs` | `BuildContext(..., runtime)` merge overrides **sau** defaults |
| `MegaForm.Oqtane.Server/Data/EfWorkflowLibraryRepository.cs` | `ParseVariableOverrides()` + self-heal ALTER |

**Guard:** chỉ key **đã khai báo trong `definition.Variables`** được override; key lạ bị bỏ và ghi warning.
Mapping không thể tuồn key tùy ý vào context của node.

**Migration cho site đã cài:** Oqtane không chạy `Up()` migration, `InstallSchemaFromModel` chỉ `CREATE TABLE`
idempotent → site cũ sẽ **không bao giờ** có cột mới. Giải pháp: `EnsureSchema()` trong ctor repository,
chạy đúng 1 lần/process (`Interlocked`), `ALTER TABLE ... ADD` provider-aware (SqlServer/Sqlite/Npgsql/MySql),
nuốt exception "đã tồn tại". **Đã verify trên :5122**: cột `VariableOverridesJson` xuất hiện sau restart.

### P3 — Chính sách version: PIN mặc định

`FormWorkflowMappingInfo.WorkflowVersionId` nullable. `GetActiveDefinitionForForm` resolve 3 bậc:
`mapping.WorkflowVersionId` (pin) → `template.CurrentVersionId` (follow) → version `IsApplied` mới nhất.

**Mặc định cũ (null) = follow** → sửa template là **đổi hành vi mọi form production ngay lập tức**.
Với quy trình duyệt có tiền, đó là sự cố.

→ Controller `ApplyToForm` **pin cứng** version hiện hành trừ khi client gửi `autoUpdate:true`.
UI để checkbox "Auto-update…" **tắt mặc định**, có hint giải thích.

### P4a — API (Oqtane) — `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowLibrary.cs` (NEW)

Tất cả `[Authorize(Policy = "EditModule")]`:

| Route | Việc |
|---|---|
| `GET  Form/Workflow/Library/List?formId=` | templates của portal + binding hiện tại của form |
| `GET  Form/Workflow/Library/FormBinding?formId=` | binding (cho badge toolbar) |
| `GET  Form/Workflow/Library/Get?templateId=&versionId=` | header + versions + definition (JRaw) |
| `POST Form/Workflow/Library/SaveCurrent` | tạo/cập nhật template → **version mới** → ApplyVersion |
| `POST Form/Workflow/Library/ApplyToForm` | bind 1..n form; **pin** trừ khi `autoUpdate` |
| `POST Form/Workflow/Library/Unbind` | gỡ mapping, form về lại WorkflowJson của nó |
| `POST Form/Workflow/Library/Delete` | 409 nếu đang dùng, `force:true` mới xoá |

Bảo mật (theo `Docs/SECURITY_CODING_RULES.md`):
- **Cross-portal**: `TemplateBelongsToCurrentPortal()` + `ApplyToForm` chặn form khác site.
  Quan trọng vì template có thể chứa **Database node mang `connectionKey`** → nếu không chặn thì là
  đường leo thang đặc quyền. Endpoint `Form/Workflow/Apply` sẵn có **không** check portal — của tôi chặt hơn.
- **Không trả `ex.Message`** cho client (§10) — parse lỗi trả thông điệp trung tính.
- `def.FormId = 0` khi lưu vào library; repo re-stamp `definition.FormId = formId` lúc load
  ([EfWorkflowLibraryRepository.cs:74](MegaForm.Oqtane.Server/Data/EfWorkflowLibraryRepository.cs#L74)).
- Dùng `JRaw` để nhúng DefinitionJson (tránh bẫy STJ nuốt JObject — xem memory `reference_oqtane_stj_no_raw_jobject`).

⚠️ Endpoint kế thừa `[IgnoreAntiforgeryToken]` **class-level** có sẵn trên `MegaFormController` (line 47).
Tôi **không** thêm mới, nhưng đây là nợ CSRF chung của controller này — cần xử lý riêng.

### P4b — UI

| File | Thay đổi |
|---|---|
| `MegaForm.UI/src/builder/workflow/wf-library.ts` | **NEW** (~270 dòng) — modal `Workflow library` |
| `MegaForm.UI/src/builder/workflow/index.ts` | import, 5 state, 6 handler, API paths, nút **Library** trên toolbar, **badge tên workflow** thay dòng meta |
| `MegaForm.UI/src/builder/dom.ts` | fix bug reopen (mục 3) |

Badge toolbar: `Library: CV Approval Flow v1.0.0 · pinned · update available`
(`outdated` = form pin ở version cũ hơn `CurrentVersionId`).

Modal không portal ra `body` → **không dính bẫy z-index `is-fs`**: nó là con của
`#mf-wfrf-overlay` (z 2147483647), backdrop z=60. Đã verify `elementFromPoint` trúng modal trong `is-fs`.

---

## 3. Bug có sẵn đã sửa: BPMN editor không mở lại sau khi đóng

`MegaForm.UI/src/builder/dom.ts:2074` — cũ:
```js
if (document.getElementById('mf-wfrf-overlay') && fid > 0) { wfLastInitedFormId = fid; return; }
if (fid !== wfLastInitedFormId) { /* init */ }
```
"Return to App Builder" xoá overlay nhưng `wfLastInitedFormId` vẫn = fid → click BPMN lần 2:
guard đầu không return (overlay đã mất), guard thứ 2 false → **im lặng không làm gì**.

Sửa: `if (fid > 0 || fid !== wfLastInitedFormId)` (tới đây overlay chắc chắn vắng mặt).
Giữ nguyên đường fid=0 cho form chưa lưu.

---

## 4. Bằng chứng E2E trên :5122 (không phải chỉ QA giao diện)

Form 4 "Form co CV" có `WorkflowJson` **rỗng** (`LEN=0`) → đúng ca "library-only".

| Bước | Kết quả |
|---|---|
| Save "CV Approval Flow" vào library | `MF_WorkflowTemplates` 1 row, key `cv-approval-flow`, `MF_WorkflowTemplateVersions` v1.0.0 |
| **Refresh trang → mở lại Library** | Template vẫn còn ✅ (tiêu chí của user) |
| Apply lên form 4 | `MF_FormWorkflows` pinnedVer=**1** (không null) → pin mặc định ✅ |
| Open (load) từ library | Graph nạp vào editor, tên đổi thành "CV Approval Flow" ✅ |
| Sửa label node → Save new version | v2.0.0 rồi v3.0.0; `TPL current=3`; **`MAP form=4 pinned=1`** → sửa template **không** đổi form đang chạy ✅ |
| **Submit form 4** | `MF_WorkflowExecutions`: `form=4 sub=1000403 status=completed` → **engine ĐÃ chạy qua đường library** ✅ |
| **Negative control**: `IsActive=0` rồi submit lại | `execCount` vẫn = 1 → không có execution mới ⇒ row trên đúng là do mapping sinh ra ✅ |
| ContextJson của execution | `"__workflowSource":"library"`, `__workflowTemplateKey":"cv-approval-flow"` ✅ |
| Override `{"route":"fast-track","not_declared":"x"}` rồi submit | `Variables: {"score":"0","route":"fast-track", ...}` → **override ăn, default giữ, key lạ bị chặn** ✅ |
| QA `is-inline` **và** `is-fs` | Modal mở, `elementFromPoint` trúng modal, hint không bị cắt |
| Console | 0 error / 0 warn |

State demo còn lại trên :5122: template `CV Approval Flow` (3 versions), form 4 pinned v1,
overrides `{"route":"fast-track"}`, 3 execution rows, submissions 1000403–1000406 (rỗng, do test).

---

## 4b. Phiên 2 — React #310 + viết lại bộ Samples (B386→B390)

### React error #310 — bug CÓ SẴN, không phải do library

Reproduce bằng browser (không đoán): nạp graph đủ 12 loại node → click lần lượt → **crash đúng ở `User Task`**.

Nguyên nhân: `renderPrincipalPicker` ([wf-principal-picker.ts:89-93](MegaForm.UI/src/builder/workflow/wf-principal-picker.ts#L89))
gọi 3 `useState` + 1 `useEffect`, nhưng `wf-approval.ts` gọi nó như **hàm thường**, lại còn **có điều kiện**
(`ctx.formId > 0`). Hooks của nó rơi vào fiber của `NodeConfigPanel` → panel có 11 hooks với node thường,
15 hooks với node Approval → đổi node = đổi số hooks = React #310. Stack của user khớp đúng 5 frame
`Eo→wr→Be→uo→nn→useState`.

**Fix:** `h(renderPrincipalPicker, {...})` thay vì gọi trực tiếp (2 chỗ). Nó có fiber riêng, điều kiện vô hại.

Đồng thời sửa 2 vi phạm cùng loại (early-return trước hooks):
- `wf-library.ts` LibraryModal — **do tôi viết ở phiên 1**, hooks chuyển lên trước guard + `useEffect` seed lại form mỗi lần mở.
- `SampleJsonPanel` (index.ts) — có sẵn, guard chuyển xuống sau hooks.

### Samples: xoá bộ cũ, thay bằng 10 bộ mới — `wf-samples.ts` (NEW)

Bộ cũ sinh ra `Full Name → Tab 1 → gateway`. Ba nguyên nhân, đều đã sửa:

1. `autoMapWorkflowToSchema` **đổi `node.label` thành nhãn field** → trigger "Form submitted" bị đổi tên
   thành "Full Name"/"Tab 1". Nay: **không bao giờ đổi tên node**; chỉ sửa `fieldKey` khi nó *không tồn tại*
   trên form đích. (Sửa **cả 2 bản sao** — index.ts:1989 dùng bởi `onLoadJson`, và bản module-level.)
2. `autoMapWorkflowToSchema` **rebind mọi rule của Condition** vào một field bất kỳ → điều kiện mất nghĩa.
   Nay: rule đã trỏ vào field có thật **hoặc** vào biến workflow đã khai báo thì **giữ nguyên**.
3. `getNodeDisplayLabel` ([index.ts:940](MegaForm.UI/src/builder/workflow/index.ts#L940)) luôn ghi đè nhãn
   FormField. Nay: **nhãn do người viết đặt được ưu tiên**; auto-label chỉ khi node không có tên.

10 sample mới, tất cả **chạy được ngay với mọi form schema**:
`notify-admin` · `autoresponder` · `crm-sync` · `single-approval` · `two-step-approval` ·
`score-and-route` · `save-to-database` · `append-to-sheet` · `parallel-notify` · `approval-with-escalation`

Quy tắc: đúng **một** node FormField làm trigger (tên "Form submitted", chỉ là anchor, không rẽ nhánh);
field chỉ được tham chiếu khi **tìm thấy theo hint** (email/name/number), nếu không thì degrade thành
placeholder chứ không sinh `{{token}}` treo; rẽ nhánh dựa trên **outcome handle của Approval** hoặc trên
field có thật — không dựa vào biến, vì **Exclusive Gateway không bind được biến workflow** (đã kiểm chứng).
Trigger/gateway bỏ qua field layout (`section`, `html`, `row`…) — bind gateway vào một section là vô nghĩa.

Đã xoá: `SAMPLE_PRESET_META`, `buildSampleWorkflowPreset`, `SAMPLE_WORKFLOW_JSON` (−16.7k ký tự).

### QA (browser thật, :5122, B390)

- Nạp **cả 10 sample**, click **mọi node** trong từng sample (~44 lượt, gồm User Task ×4, Service Task DB,
  Sheet, Fork/Join, Gateway): **0 error**, app không chết.
- Trigger hiển thị "Form submitted" ở cả 10 (trước đây là "Tab 1").
- `score-and-route`: gateway bind vào `full_name` (field thật) chứ không phải `sec_1` (section).
- Console 0 error / 0 warn.

## 5. Còn nợ / bước tiếp

1. **UI chưa có chỗ nhập `VariableOverridesJson`** — hiện phải set bằng SQL. Cần thêm panel
   "Variables for this form" trong modal (đọc `definition.Variables` của version đang pin).
2. **UI chưa có "apply cho nhiều form"** — API `ApplyToForm` đã nhận `formIds[]`, chỉ thiếu picker.
3. **Field-key remap chưa có UI.** `WorkflowFieldMappingInfo` + `ApplyFieldMappings` đã chạy ở engine
   ([WorkflowEngineV2.cs:88](MegaForm.Core/Services/WorkflowEngineV2.cs#L88)); cần diff field key khi apply sang form khác.
4. **3 platform còn lại**: Core đã sẵn. Chỉ cần `DbSet` + `IWorkflowLibraryRepository` impl + DI + controller twin.
   Web/Umbraco/DNN hiện **fallback an toàn** (library bỏ qua).
5. `onLoadJson` **normalize lại start-node label theo schema form hiện tại** (v1 lưu "Form Submitted",
   load ra thành "Tab 1"). Hành vi có sẵn, dùng chung với đường Samples. Cần quyết định có mong muốn không.
6. **Chưa bump `ModuleInfo.Version`** (vẫn 1.7.100) và **chưa repack nupkg/DNN zip**. AssetVersion đã B385.
   Muốn ship: bump ModuleInfo + nuspec + DNN manifest rồi repack.
7. `Docs/WORKFLOW_TEMPLATE_LIBRARY_WEB_IMPLEMENTATION_GUIDE.md` cần sửa in-place (nguyên nhân sai).
8. Lỗi build **có sẵn** không liên quan: `MegaForm.Umbraco/TagHelpers/MegaFormTagHelper.cs` (`IViewComponentHelper`),
   `MegaForm.UI/src/builder/workflow/wf-app.ts:785` TS1128 (file **mồ côi**, không được import → không vào bundle).

---

## 6. Deploy notes (:5122)

- Site: `E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1799`, DB `Oqtane_MegaForm_Fresh1799` (.\SQLEXPRESS, Win-auth).
- **Khởi động phải truyền cổng**: `Oqtane.Server.exe --urls http://localhost:5122`.
  Không truyền → nó bám **:5000** (appsettings chỉ có `DefaultAlias`, không có `Urls`).
- Hot-swap: `MegaForm.Core.dll` (net8.0), `MegaForm.Oqtane.Server.Oqtane.dll` + `MegaForm.Oqtane.Shared.Oqtane.dll` (**net10.0**).
- JS: bundle builder thật là `Assets/js/bundles/megaform-builder.js` — **không phải** `Assets/js/builder/megaform-builder-*.js`
  (những file đó là di sản chết từ 2026-04-21). `sync-platforms` chỉ copy vào wwwroot **của repo**, không vào site live.
- ⭐ **Bẫy cache đã dính lại**: bump AssetVersion **trước** khi copy file mới → browser cache nội dung cũ dưới `?v` mới.
  Thứ tự đúng: copy file → restart → hard-reload. Hoặc luôn `ignoreCache` khi QA.
