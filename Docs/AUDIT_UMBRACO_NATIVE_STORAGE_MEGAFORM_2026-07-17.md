# AUDIT: MegaForm Umbraco native integration va storage comparison

Date: 2026-07-17  
Scope: Audit technical only, khong code. Review nhanh implementation Umbraco hien tai cua MegaForm, doi chieu voi Umbraco Forms standard, va de xuat viec can lam de tich hop native vao Umbraco.

## 1. Ket luan ngan

MegaForm.Umbraco hien tai da di dung huong cho mot **Umbraco 14 / Bellissima package rieng**:

- Co composer DI, notification migration, route/controller, auth policy backoffice/bearer.
- Co backoffice section, section views, content app, property editor UI, modal, entity actions qua `umbraco-package.json`.
- Dung chung connection `umbracoDbDSN` cua Umbraco host va tao cac bang `MF_*` trong cung database.
- Co public render route, embed/script route, API submit, SDK facade, workflow/report/module settings rieng.

Nhung implementation nay **chua phai la Umbraco Forms-native integration**. No khong dung storage/service/rendering/security model cua Umbraco Forms:

- Khong luu record vao cac bang record typed cua Umbraco Forms.
- Khong dung `IRecordStorage`, `IRecordReaderService`, `IRecordFieldStorage`, `IRecordFieldValueStorage`.
- Khong render qua Umbraco Forms `RenderForm` view component/theme picker/form picker model.
- Khong hien submission trong Entries/export/workflow UI chuan cua Umbraco Forms.
- Form ID la integer MegaForm, khong phai GUID form cua Umbraco Forms.

Vi vay nen goi dung trang thai hien tai la:

> MegaForm la native Umbraco package theo nghia "installed inside Umbraco backoffice va dung Umbraco DB/auth shell", nhung chua native theo nghia "tro thanh Umbraco Forms provider/extension".

De release an toan, khuyen nghi chon chien luoc **dual-mode**:

1. Short-term: harden MegaForm-native package voi `MF_*` storage rieng, vi day la cach it rui ro va giu duoc parity voi DNN/Oqtane.
2. Mid-term: them optional Umbraco Forms bridge de sync/read submission sang standard Umbraco Forms APIs khi khach can Entries/export/workflow native.
3. Long-term: chi lam full Umbraco Forms provider neu product muon song trong ecosystem Umbraco Forms va chap nhan phu thuoc license/API/version cua package nay.

## 2. Source da review

Main files/folders:

- `MegaForm.Umbraco/MegaForm.Umbraco.csproj`
- `MegaForm.Umbraco.Host/MegaForm.Umbraco.Host.csproj`
- `MegaForm.Umbraco/Composers/MegaFormComposer.cs`
- `MegaForm.Umbraco/Data/MegaFormDbContext.cs`
- `MegaForm.Umbraco/Data/EfRepositories.cs`
- `MegaForm.Umbraco/Data/UmbracoDatabaseSchemaBootstrapper.cs`
- `MegaForm.Umbraco/Migrations/InitialMegaFormSchemaMigration.cs`
- `MegaForm.Umbraco/Controllers/MegaFormApiController.cs`
- `MegaForm.Umbraco/Controllers/FormController.cs`
- `MegaForm.Umbraco/PropertyEditors/MegaFormFormPickerPropertyEditor.cs`
- `MegaForm.Umbraco/wwwroot/umbraco-package.json`
- `MegaForm.Umbraco.Host/appsettings.Development.json`
- `local-packages-umbraco/umbraco.forms.core/14.0.0/lib/net8.0/Umbraco.Forms.Core.xml`

Official Umbraco docs doi chieu:

- Forms configuration: https://docs.umbraco.com/umbraco-forms/developer/configuration
- Working with data: https://docs.umbraco.com/umbraco-forms/developer/working-with-data
- Forms in database: https://docs.umbraco.com/umbraco-forms/developer/forms-in-the-database
- Form settings / Store Records: https://docs.umbraco.com/umbraco-forms/editor/creating-a-form/form-settings
- Rendering forms: https://docs.umbraco.com/umbraco-forms/developer/rendering-forms
- Security: https://docs.umbraco.com/umbraco-forms/developer/security
- Extending field types: https://docs.umbraco.com/umbraco-forms/developer/extending/adding-a-fieldtype

## 3. MegaForm.Umbraco hien tai da chuan o diem nao

### 3.1 Package/backoffice shell

`MegaForm.Umbraco/MegaForm.Umbraco.csproj` dung `Microsoft.NET.Sdk.Razor`, `net8.0`, `StaticWebAssetBasePath = App_Plugins/MegaForm`, package metadata danh cho Umbraco 14+/Bellissima. Day la huong chuan cho package UI/backoffice hien dai.

`wwwroot/umbraco-package.json` khai bao:

- Section: `MegaForm.Section`
- Section sidebar app/menu/menu item.
- Section views: Dashboard, Builder, Submissions, Languages.
- Content app: `MegaForm.ContentApp.Submissions`.
- Property editor UI: form picker.
- Permission condition, modal, entity actions.

Day la kieu extension native cua Bellissima backoffice. Ve UX/backoffice surface, implementation da gan dung chuan Umbraco 14.

### 3.2 Composer/DI/auth

`MegaFormComposer.cs`:

- Register `MegaFormDbContext` bang connection string `umbracoDbDSN`.
- Ho tro Sqlite va SQL Server provider.
- Register repositories/service cua MegaForm Core va SDK.
- Add route rewrite `/api/MegaForm/ -> /umbraco/MegaForm/MegaFormApi/`.
- Add backoffice auth policy va bearer API policy.
- Add notification handlers cho app starting/app started/sample content.

Diem nay tot: package khong hardcode database rieng, ma dung DB cua host Umbraco.

### 3.3 Render/API rieng cua MegaForm

`FormController.cs` co public render:

- `/megaform/form/{id}`
- `/megaform/form/{id}/embed`
- `/megaform/form/{id}/preview`
- `/megaform/form/{id}/script`

`MegaFormApiController.cs` co submit endpoint, schema endpoint, admin CRUD endpoints, permissions, workflows, reports. Day la mot runtime surface tuong doi day du cho MegaForm.

### 3.4 Property editor/content app

`MegaFormFormPickerPropertyEditor.cs` tao DataEditor `MegaForm.FormPicker` va value converter tra ve nullable int. Nhung day moi la picker cho MegaForm ID, chua phai Umbraco Forms picker model.

## 4. Chua chuan native Umbraco Forms o diem nao

### 4.1 Storage doc lap, khong phai Umbraco Forms storage

MegaForm tao cac bang rieng:

- `MF_Forms`
- `MF_Submissions`
- `MF_SubmissionValues`
- `MF_Files`
- `MF_SavedDrafts`
- `MF_ModuleSettings`
- `MF_Workflows`, `MF_WorkflowTasks`, `MF_WorkflowCases`, `MF_WorkflowExecutions`
- nhieu bang report/document/blog/AI KB/module config khac.

Umbraco Forms standard dung record master + record fields + typed data tables. Theo docs Umbraco Forms, moi value submit duoc luu vao bang rieng theo data type va cung co ban JSON thu hai de lookup/display nhanh trong backoffice.

Trong local package XML, Umbraco Forms Core co cac storage interfaces/classes lien quan:

- `IRecordStorage`
- `IRecordFieldStorage`
- `IRecordFieldValueStorage`
- `IRecordReaderService`
- `Record`, `RecordField`
- `RecordFieldDataBit`
- `RecordFieldDataDateTime`
- `RecordFieldDataInteger`
- `RecordFieldDataLongString`
- `RecordFieldDataString`
- constants cho record tables: Record, RecordField, RecordDataBit, RecordDataDateTime, RecordDataInteger, RecordDataLongString, RecordDataString, RecordAudit.

MegaForm khong dung cac interface/table nay.

### 4.2 Rendering khong dung Umbraco Forms rendering pipeline

Umbraco Forms standard render qua view component:

- `@await Component.InvokeAsync("RenderForm", new { formId = Guid, theme = "default", includeScripts = false })`
- Hoac Form Picker + Theme Picker tren document type.

MegaForm render qua controller/view/script rieng va FormId int. Vi vay template/theme picker cua Umbraco Forms khong ap dung truc tiep.

### 4.3 Submission khong hien trong Entries/export chuan cua Umbraco Forms

Vi record khong vao Umbraco Forms tables/services, cac feature native cua Umbraco Forms khong tu dong thay MegaForm submissions:

- Entries UI
- Export entries
- Approved records API
- Records by page/member/form via `IRecordReaderService`
- Native Umbraco Forms workflows
- Native Umbraco Forms permissions per form

### 4.4 Security model song song

MegaForm co granular permission rieng va policy rieng. Umbraco Forms standard co security/permission model rieng:

- Manage Forms
- View Entries
- Edit Entries
- Delete Entries
- Manage Workflows
- Manage Datasources
- Manage Prevalue Sources
- Per-form access
- Optional user-group based security.

Hien tai MegaForm chua map hoan toan sang security model do.

## 5. Standard Umbraco Forms storage

Theo docs Umbraco Forms:

- Definition form/fields/workflows/prevalues co the luu trong Umbraco database.
- Record/submission data duoc luu trong database khi `Store Records` bat.
- Khi luu record, Umbraco Forms luu field values vao bang typed theo data type, dong thoi luu them JSON copy de backoffice lookup/display nhanh.
- `IRecordReaderService` cung cap cac method doc record co paging de tranh load qua nhieu du lieu.
- `Store Records` mac dinh bat; neu tat thi record khong luu DB, nhung file upload co the van duoc giu neu workflow/process khong xoa.

Model co tinh "native Umbraco Forms":

- Form/record identity theo GUID.
- Record gan voi page/member/culture/context.
- Record state/approved flow.
- Audit records.
- Storage typed values giup query/export theo field data type.
- Services official cho read/write, khong truy van table truc tiep.

## 6. MegaForm storage hien tai

`MegaFormDbContext.cs` la EF Core context rieng, tao bang `MF_*`.

### 6.1 Form definition

`MF_Forms` luu:

- `SchemaJson`
- `SettingsJson`
- `ThemeJson`
- `RulesJson`
- `WorkflowJson`
- Metadata: title, slug, portal id, module id, status, locale, version, created/updated fields.

Uu diem:

- Portable giua DNN/Oqtane/Umbraco.
- De giu parity voi MegaForm Core va SDK.
- JSON schema linh hoat cho builder/AI/template.

Rui ro:

- Khong map native sang Umbraco Forms field definitions.
- Status casing co dau hieu khong dong nhat (`Published`, `Draft`, co noi tao `"Draft"` trong duplicate).
- Portal/site scoping trong Umbraco hien dang co logic `portalId <= 0` thi list all; multi-site Umbraco can scoping theo root/content/node.

### 6.2 Submission

`MF_Submissions` luu:

- `SubmissionId`
- `FormId`
- `ModuleId`
- `UserId`
- `SubmittedOnUtc`
- `IpAddress`
- `UserAgent`
- `Status`
- `DataJson`

Indexes:

- `(FormId, SubmittedOnUtc)`
- `(FormId, Status, SubmittedOnUtc)`
- `SubmittedOnUtc`
- `Status`

`MF_SubmissionValues` luu:

- `SubmissionId`
- `FormId`
- `FieldKey`
- `FieldValue`
- `ValueText`
- `ValueNumber`
- `ValueDate`

Indexes:

- `SubmissionId`
- `(SubmissionId, FieldKey)`
- `(FormId, FieldKey)`
- `(FormId, ValueDate)`

Day la hybrid storage: JSON canonical payload + EAV/indexed field values. Kien truc nay hop ly cho dashboard/filter/report cua MegaForm, nhung khong tu dong tuong thich Umbraco Forms.

### 6.3 Submit flow

`MegaFormApiController.Submit()`:

- Accept anonymous submit.
- Doc `formId` va `data` tu JSON body.
- Load form.
- Deserialize data.
- Lay IP/User-Agent/current user.
- Goi `_processor.ProcessAsync(...)`.
- Tra `submissionId`.

Gap can check:

- Public schema endpoint chi tra `schema`, `submitButtonText`, `enableCaptcha`, `themeJson`; trong khi render model co `settingsJson`, `rulesJson`, `successMessage`. Neu external renderer/SDK dung schema endpoint co the thieu parity voi full render.
- Can dam bao insert vao `MF_SubmissionValues` luon duoc goi cho moi submit, vi dashboard/filter phu thuoc table nay.

## 7. So sanh storage: Umbraco Forms vs MegaForm

| Topic | Umbraco Forms standard | MegaForm.Umbraco hien tai | Nhan xet |
|---|---|---|---|
| Form ID | GUID | int `FormId` | Khong tuong thich truc tiep |
| Form definition | Umbraco Forms DB definitions/workflows/prevalues | `MF_Forms` JSON schema/settings/theme/rules/workflow | MegaForm portable hon, nhung khong native Forms |
| Record master | Record table/service cua Umbraco Forms | `MF_Submissions` | Can bridge neu muon Entries native |
| Field values | Typed value tables theo data type + JSON copy | `MF_SubmissionValues` EAV + `DataJson` | Tuong dong y tuong hybrid, khac schema/service |
| Read API | `IRecordReaderService` co paging | MegaForm repository/API rieng | External dev phai dung MegaForm API |
| Backoffice entries | Native Entries/export | MegaForm submissions UI rieng | Khong share UX/security/export |
| Workflow | Umbraco Forms workflow pipeline | MegaForm workflow tables/services | Hai workflow engine doc lap |
| Page/member/culture | Native record context | Chua thay map day du vao submission | Can bo sung de native multi-site |
| Store records switch | Form setting chuan | MegaForm setting/rules rieng | Can design equivalent |
| File retention | Umbraco Forms co luu file neu store off tuy process | `MF_Files` rieng | Can cleanup/retention policy ro |
| Cross-platform parity | Umbraco-only | DNN/Oqtane/Umbraco shared | MegaForm storage giu duoc product parity |

## 8. Technical risks can sua truoc khi goi la native package on dinh

### P0 - Migration/provider bug

`UmbracoDatabaseSchemaBootstrapper.MegaFormTablesExist()` check sentinel `mf_modulesettings`, sau do log tables bang:

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
```

Query nay chi dung SQLite. Neu host dung SQL Server, doan log nay co the fail. Can tach provider-specific table inspection:

- SQLite: `sqlite_master`
- SQL Server: `INFORMATION_SCHEMA.TABLES` hoac provider API
- Npgsql/MySQL neu sau nay support: query rieng

### P0 - Schema evolution chua dung chuan Umbraco migration

Migration hien tai goi EF `EnsureCreated/CreateTables()`. Cach nay on cho bootstrap ban dau, nhung yeu cho upgrade:

- Khong version tung column/index.
- Kho add/rename/drop column an toan.
- Kho rollback/diagnose production.

Can chuyen sang versioned Umbraco migrations:

- Migration plan theo version package.
- Moi migration tao/alter bang ro rang.
- EF model van co the dung runtime, nhung schema upgrade nen co migration version.

### P0 - Delete/cascade data integrity

`UmbracoSubmissionRepository.Delete/BulkDelete` xoa `MF_Submissions`. Can audit quan he/cascade cho:

- `MF_SubmissionValues`
- `MF_Files`
- workflow cases/tasks/actions
- audit/document/report references

Neu khong co cascade/transaction cleanup thi se tao orphan rows. Day la rui ro lon cho dashboard/export/compliance.

### P1 - Content/page/member/culture context

Standard Umbraco Forms doc record by page/member/form/culture. MegaForm submission hien co IP/UserAgent/UserId/ModuleId, nhung chua thay mapping native ro:

- Current content page id/key
- Root site id
- Member key/member id
- Culture
- Page URL/referrer
- Approved/state/audit trail

Can bo sung vao submission metadata hoac companion table de dashboard loc theo page/site/member/culture.

### P1 - Property editor value model

Picker hien luu int FormId. De native hon:

- Luu structured value: `{ formId, formKey, title, version, source }`
- Hoac co stable `Guid FormKey` trong `MF_Forms`.
- Value converter tra ve typed model thay vi nullable int.
- Content app co the tim form dang dung tren document hien tai.

Khong nen phu thuoc integer ID neu sau nay import/export, sync, multi-environment deployment.

### P1 - Site scoping

`ListForms` co logic portal id <= 0 list all. Trong Umbraco multi-site, can scope theo:

- Root content node/site id.
- Hostname/culture.
- User permission/current section.
- Optional global forms.

Neu khong, editor site A co the thay forms cua site B.

### P1 - Search/report performance

Submission list search dang co `DataJson.Contains(search)`. Với data lon:

- Cham.
- Khong index duoc tot.
- Khong phan biet field/culture/type.

Can dua search/filter/report ve `MF_SubmissionValues`, computed columns, FTS hoac field indexes.

### P1 - Public API/render parity

`FormController.BuildViewModel` tra day du `SchemaJson`, `SettingsJson`, `ThemeJson`, `RulesJson`, `SuccessMessage`. Public schema API trong `MegaFormApiController.Schema` hien co ve it hon. Can dong bo contract de SDK/headless renderer khong bi thieu rules/settings/success behavior.

### P2 - Status enum/casing

Can chuan hoa status:

- Form status: `Draft`, `Published`, `Archived`
- Submission status: `Pending`, `Approved`, `Rejected`, `Completed`, etc.

Nen dung enum/constant chung, migration/backfill neu co du lieu cu.

## 9. Kien truc de tich hop native vao Umbraco

### Option A - MegaForm-native Umbraco package (khuyen nghi short-term)

MegaForm tiep tuc dung `MF_*` tables va runtime rieng, nhung harden theo chuan Umbraco.

Can lam:

1. Sua migration/provider bug va chuyen sang versioned migrations.
2. Them `FormKey` GUID va `SubmissionKey` GUID de deployment/sync/import/export on dinh.
3. Them metadata native: `ContentKey`, `ContentId`, `RootContentKey`, `Culture`, `MemberKey`, `CurrentPageUrl`.
4. Harden permission mapping voi Umbraco users/groups.
5. Form picker value typed model + content app resolve forms tren current document.
6. Submission dashboard dung paging/filter indexed fields.
7. Public SDK contract tra du `schema/settings/theme/rules/success/captcha/auth`.
8. Theming/rendering inherit Umbraco page CSS by default, khong iframe mac dinh.

Uu diem:

- Minimal risk.
- Giu DNN/Oqtane parity.
- Khong bi rang buoc boi Umbraco Forms license/API.
- Developer external dung MegaForm API/SDK de lam dashboard/inbox.

Nhuoc diem:

- Khong tu dong hien trong Umbraco Forms Entries.
- Khong tu dong dung Umbraco Forms workflows/export.

### Option B - Dual-mode bridge voi Umbraco Forms (khuyen nghi mid-term)

Giu `MF_*` la source of truth, nhung them optional bridge:

- `IUmbracoFormsBridge`
- Config per form: `NativeMegaFormOnly`, `SyncToUmbracoForms`, `ReadOnlyExportToUmbracoForms`
- Mapping MegaForm fields sang Umbraco Forms fields/data types.
- On submit: ghi MegaForm truoc, sau do sync record sang Umbraco Forms service neu enabled.
- On delete/update status: sync state/audit tuong ung.

Can nghien cuu them API write official cua Umbraco Forms 14, vi docs public chu yeu nhan manh read services va extensibility. Khong nen ghi truc tiep vao Forms tables neu co service official.

Uu diem:

- Khach co the thay record trong Entries/export native.
- Van giu MegaForm dashboard/workflow.

Nhuoc diem:

- Complexity cao: mapping field types, validation, file upload, multi-page/condition/workflow.
- Rui ro version compatibility voi Umbraco Forms.
- Can xu ly duplicate/source-of-truth.

### Option C - Full Umbraco Forms provider/extension (khong khuyen nghi luc nay)

MegaForm tro thanh mot layer tren Umbraco Forms:

- Form definitions map sang Umbraco Forms definitions.
- Submission luu truc tiep vao Umbraco Forms records.
- Workflow dung Umbraco Forms workflow pipeline.
- Field types custom qua package `@umbraco-forms/backoffice`.

Uu diem:

- Native nhat trong ecosystem Umbraco Forms.

Nhuoc diem:

- Mat cross-platform parity.
- Kho map het MegaForm AI builder/theme/rules/workflow/inbox/dashboard.
- Phu thuoc license va internal API surface.
- Blast radius lon, khong phu hop "minimal change".

## 10. Recommended roadmap

### Phase 1 - Harden current Umbraco package

Goal: MegaForm la native Umbraco package rieng, on dinh production.

Tasks:

- Fix provider-specific schema inspection, khong dung `sqlite_master` tren SQL Server.
- Thay `EnsureCreated/CreateTables` bang versioned migrations cho cac table/index/cascade quan trong.
- Kiem tra va them cascade/transaction cleanup cho submissions/values/files/workflows.
- Them `FormKey`/`SubmissionKey` GUID.
- Chuan hoa status constants.
- Dong bo public schema API voi render model.
- Them page/member/culture/root site metadata vao submission.
- Pagination bat buoc cho submissions/reports.

Acceptance:

- Cai package tren Umbraco Sqlite va SQL Server deu tao schema OK.
- Upgrade package tu version cu len moi khong mat data.
- Submit/delete/bulk delete khong tao orphan rows.
- Dashboard loc theo form/page/date/status/field tren indexed tables.

### Phase 2 - Native content integration

Goal: Editor dung MegaForm nhu mot content feature native.

Tasks:

- Upgrade Form Picker value model.
- Content app show submissions cua forms dang gan voi document hien tai.
- Add block/grid/editor integration neu Umbraco site dung Block Grid.
- Permission mapping theo Umbraco user/group/root site.
- Add form usage index: form nao dang duoc su dung o node nao.

Acceptance:

- Editor tren document thay dung forms/submissions cua document do.
- Multi-site khong leak form/submission giua root site neu khong co permission.
- Publish/import/export content khong phu thuoc integer ID duy nhat.

### Phase 3 - Optional Umbraco Forms interoperability

Goal: Khach co Umbraco Forms co the dung native Entries/export khi can.

Tasks:

- Nghien cuu official write APIs cua Umbraco Forms 14.
- Tao mapping layer field type: MegaForm type -> Umbraco Forms field/data type.
- Config per form cho sync.
- Sync record create/status/delete/file upload.
- Read-only dashboard adapter neu khach chi can view Umbraco Forms entries trong MegaForm dashboard.

Acceptance:

- Form duoc enable bridge submit vao MegaForm va co record tuong ung trong Umbraco Forms Entries.
- Disable bridge khong anh huong MegaForm default.
- Loi sync co retry/audit, khong lam mat MegaForm submission.

### Phase 4 - Migration/import/export

Goal: Khach co du lieu Umbraco Forms hoac MegaForm cu co duong migrate ro.

Tasks:

- Import Umbraco Forms records vao MegaForm.
- Export MegaForm records sang CSV/JSON/Umbraco Forms compatible bundle.
- Mapping report cho missing/unsupported fields.
- Tool verify count/hash.

Acceptance:

- Counts match theo form/date/status.
- File upload references duoc preserve hoac report ro missing assets.
- Audit log co nguon migrate.

## 11. De xuat quyet dinh san pham

Cho muc tieu hien tai cua MegaForm la cross-platform DNN/Oqtane/Umbraco va API/SDK cho dashboard/inbox/workflow rieng, khong nen rewrite sang Umbraco Forms storage ngay.

Huong tot nhat:

1. Publicly position: "MegaForm for Umbraco is a native Umbraco package with its own cross-platform MegaForm engine."
2. Internally harden native package theo Phase 1/2.
3. Add optional "Umbraco Forms compatibility bridge" cho khach doanh nghiep can Entries/export native.

Thong diep ky thuat can tranh:

- Khong noi MegaForm hien tai "stores submissions as Umbraco Forms records" vi khong dung.
- Khong hua submission se hien trong Umbraco Forms Entries neu chua co bridge.
- Khong coi `MF_*` storage la loi; day la design dung neu muc tieu la cross-platform parity.

## 12. Checklist cho Claude/dev tiep tuc

- [ ] Sua `UmbracoDatabaseSchemaBootstrapper` provider-specific table inspection.
- [ ] Design migration version plan thay cho `EnsureCreated/CreateTables` only.
- [ ] Audit EF relationships/cascade cua `MF_Submissions`, `MF_SubmissionValues`, `MF_Files`, workflow tables.
- [ ] Them stable GUID keys cho form/submission.
- [ ] Them submission context native: content/page/root/member/culture.
- [ ] Dong bo public schema API voi render model.
- [ ] Chuan hoa form/submission status constants.
- [ ] Nang Form Picker thanh typed structured value.
- [ ] Add content usage index de Content App loc dung document/form.
- [ ] Nghien cuu official Umbraco Forms write/sync API truoc khi lam bridge.

## 13. Bottom line

Implementation Kimi lam **khong sai huong**. No dang la mot MegaForm-native Umbraco package kha day du. Diem can sua khong phai la "bo het MF_* tables", ma la:

- Harden schema/migration/data integrity.
- Bo sung context native cua Umbraco.
- Lam ro product boundary voi Umbraco Forms.
- Neu can native Entries/export cua Umbraco Forms thi them optional bridge, khong nen rewrite core ngay.

## 14. Addendum: Umbraco Forms luu schema dong nhu the nao, va co tao Content Type khong?

### 14.1 Umbraco Forms khong tao table moi cho moi form schema

Umbraco Forms co the luu nhieu form co schema khac nhau vi record storage cua no la row-based:

1. Form definition luu danh sach pages/fieldsets/fields/settings/workflows/prevalues.
2. Moi field co identity rieng, thuong la GUID, alias/caption/type/settings.
3. Khi submit, Umbraco tao mot record master cho submission.
4. Moi field co value se co record-field row rieng, gan voi:
   - record/submission
   - field id
   - alias
   - data type alias
5. Gia tri field duoc luu vao bang typed theo data type, vi du string/date/integer/bit/long string.
6. Umbraco Forms cung luu them mot ban JSON cua record de backoffice lookup/display nhanh.

Nghia la database schema khong can thay doi khi editor them/bot field. Form A co 5 fields va Form B co 30 fields deu dung cung cac bang record/record-field/typed-value. Khac biet nam o rows va field ids, khong nam o columns moi.

Dieu nay gan voi MegaForm `MF_SubmissionValues`: MegaForm cung dang dung y tuong JSON + indexed EAV values. Khac biet la:

- Umbraco Forms tach typed tables theo data type.
- MegaForm gom type-ish values vao `MF_SubmissionValues` voi `ValueText`, `ValueNumber`, `ValueDate` va `DataJson`.
- Umbraco Forms co official record services/backoffice Entries.
- MegaForm co cross-platform storage/API rieng.

### 14.2 Umbraco Forms khong mac dinh tao Content Type / Document Type cho moi form

Theo docs Umbraco Forms, de chen form vao page, editor can mot Document Type co property dung Form Picker data type. Property nay luu reference toi form:

- Form Picker single: luu GUID cua form.
- Form Picker multiple: luu collection GUIDs.
- Form Details Picker: luu object gom form, theme, redirect.

Noi cach khac:

> Document Type cua Umbraco la noi gan/reference form, khong phai schema submission cua form.

Umbraco Forms khong tao Document Type tu dong cho tung form. Form schema song trong Forms section/storage cua Forms package, con page content chi pick form de render.

### 14.3 Kha nang "Save as Umbraco Content Node"

Umbraco Forms co built-in workflow **Save as Umbraco Content Node**. Workflow nay cho phep khi submit thi tao mot content node moi trong content tree.

Nhung co diem quan trong:

- Developer/editor phai chon Document Type da ton tai.
- Phai map field cua form sang properties cua Document Type.
- Co the chon noi luu node va co publish hay khong.
- Day la submit workflow, khong phai form-schema storage mac dinh.
- No khong sinh Document Type moi tu form schema.

Vi vay neu MegaForm muon tuong duong voi Umbraco Forms, nen lam theo 2 layer:

1. Submission storage layer: tiep tuc luu record dong bang `MF_Submissions` + `MF_SubmissionValues`, hoac optional bridge sang Umbraco Forms typed record storage.
2. Content creation workflow layer: them action "Create Umbraco Content Node" rieng, cho map MegaForm fields sang Document Type properties.

Khong nen tron 2 viec nay. Submission record va Content Node la hai model khac nhau trong Umbraco.

### 14.4 Data Source Type khong phai Content Type

Umbraco Forms provider model co Data Source Types. Data source type giup Forms ket noi den external storage, vi du database/webservice, va tra ve list fields/columns de map form values.

Day la integration surface cho external storage, nhung van khong co nghia la Forms tao Umbraco Content Type. No la mapping form -> data source/external storage.

MegaForm co the hoc tu diem nay:

- Tao `MegaForm.Umbraco` workflow/action "Send to SQL/Data Source" dung field mapper.
- Tao "Create Umbraco Content Node" workflow/action dung document mapper.
- Giu submission storage rieng de dashboard/inbox/workflow van on dinh.

### 14.5 Implication cho MegaForm

Neu muc tieu la developer co the tao dashboard/inbox/filter submissions cua bat ky form nao, MegaForm khong can tao SQL table moi theo tung form schema. Huong dung la:

- `MF_Submissions` giu record master + `DataJson`.
- `MF_SubmissionValues` giu field values co index, them type metadata ro hon neu can.
- Bo sung stable `FormKey`, `FieldKey/FieldId`, `FieldType`, `Culture`, `ContentId`, `MemberKey`.
- Neu can query nang, them typed/index tables hoac computed/search index, khong sinh table moi per form.
- Neu can Umbraco-native Entries/export, lam optional bridge sang Umbraco Forms services/tables.
- Neu can tao content node, lam workflow map field -> Document Type property, khong bien form schema thanh Document Type mac dinh.

## 15. Addendum: Neu MegaForm bo `DataJson` va dung typed row storage thi refactor lon khong?

Ket luan: **lon neu bo han `DataJson`; vua/kiem soat duoc neu chuyen `MF_SubmissionValues` thanh source of truth nhung giu `DataJson` lam compatibility snapshot/cache trong 1-2 version.**

Quick scan ngay 2026-07-17 cho thay `DataJson` xuat hien trong it nhat 47 source files rieng trong Core/SDK/Umbraco/DNN. No khong chi la cot fallback, ma dang la canonical payload cho nhieu luong:

- Submit pipeline: `SubmissionProcessor` tao `SubmissionInfo.DataJson`.
- Workflow: `WorkflowEngine` doc/sua JSON roi `UpdateData`.
- Email/webhook: parse `DataJson` de render/send payload.
- Admin/detail/dashboard: `SubmissionQueryService`, `AdminRecordShellService`, `DataRepeaterService`.
- SDK public DTO: `SubmissionDto.DataJson`, `SubmissionListItemDto.DataJson`.
- DNN repository: insert/update submission bang `DataJson`; `InsertValues` con comment la no-op trong mot so adapter.
- Umbraco repository: search van co `s.DataJson.Contains(search)`.
- Starter/app/sample/blog/payment/external table flows: nhieu cho parse/update JSON truc tiep.

### 15.1 Neu bo han `DataJson` ngay

Day la refactor P0/P1, khong nen lam trong mot sprint ngan:

1. Database migration:
   - DNN/Oqtane/Umbraco deu phai dam bao `MF_SubmissionValues` du du lieu cho tat ca submissions cu.
   - Can migration backfill tu `DataJson` sang value rows.
   - Can FK/cascade/index/status audit ro.
2. Repository contract:
   - `ISubmissionRepository.UpdateData(string dataJson)` phai thay bang field-level write/update API.
   - `GetValues` phai bat buoc implemented tren DNN, khong con no-op.
   - `Insert` khong duoc yeu cau `DataJson`.
3. Service layer:
   - Workflow, email, webhook, repeater, field options, starters, payment verifier, admin shell phai doc data qua abstraction moi.
   - Moi noi dang `JsonConvert.DeserializeObject(submission.DataJson)` phai thay bang `ISubmissionDataReader`.
4. SDK/API breaking change:
   - `SubmissionDto.DataJson` la public API. Bo no se break external dashboard/inbox/integrations.
   - Can DTO moi: `Fields`, `Values`, `Data`, hoac deprecate truoc.
5. UI/runtime:
   - Detail view, grid/card view, export, report, AI/starter data preview phai dung field rows/schema.
6. Compatibility:
   - Submissions cu co `DataJson` nhung chua co value rows can reindex.
   - External integrations dang gui/nhan JSON payload se break.

### 15.2 Huong an toan: doi source of truth, chua bo `DataJson`

Roadmap it rui ro:

1. Phase A - Introduce abstraction:
   - Tao `ISubmissionDataStore` / `ISubmissionValueStore`.
   - API chinh: `GetData(submissionId)`, `SetField`, `SetFields`, `GetFieldValues`, `RebuildSnapshot`.
   - Services khong parse `submission.DataJson` truc tiep nua.
2. Phase B - Make `MF_SubmissionValues` canonical:
   - Khi submit, ghi `MF_SubmissionValues` day du va xem day la source of truth.
   - `DataJson` van ghi nhu denormalized snapshot/cache cho backward compatibility.
   - Neu value rows thieu, fallback parse `DataJson` va reindex.
3. Phase C - Deprecate public JSON:
   - SDK them `SubmissionDto.Data`/`Fields` typed.
   - Giu `DataJson` read-only/deprecated it nhat 1-2 release.
   - Docs noi ro `DataJson` la compatibility snapshot, khong phai storage contract.
4. Phase D - Optional typed split:
   - Neu can giong Umbraco Forms hon, tach `MF_SubmissionValues` thanh typed tables:
     - `MF_SubmissionValueString`
     - `MF_SubmissionValueLongText`
     - `MF_SubmissionValueNumber`
     - `MF_SubmissionValueDate`
     - `MF_SubmissionValueBoolean`
   - Hoac giu 1 table hien tai voi `ValueText/ValueNumber/ValueDate/ValueBool` va indexes tot. Cach nay nhe hon.
5. Phase E - Optional remove physical `DataJson`:
   - Chi lam sau khi no direct reads con lai.
   - Co migration/export/backfill verified.
   - External API da co deprecation window.

### 15.3 Khuyen nghi kien truc

Khong nen bo `DataJson` ngay. Nen doi vai tro cua no:

> `MF_SubmissionValues` = canonical query/storage; `DataJson` = compatibility snapshot/cache.

Ly do:

- MegaForm can dashboard/filter/inbox/report nhanh: canonical values/indexes tot hon JSON.
- MegaForm can cross-platform SDK/backward compatibility: JSON snapshot giup khong break khach.
- Workflow/email/webhook can dictionary payload: co the reconstruct tu value rows + schema, hoac doc snapshot trong giai doan chuyen tiep.
- DNN hien con nhieu repository rely vao `DataJson`; bo ngay se lam blast radius lon nhat.

### 15.4 Size estimate

Neu chi lam "canonical values + keep JSON snapshot": medium-large, co the lam theo phase.

Neu "remove DataJson completely from DB + DTO + services": large rewrite, anh huong Core, SDK, DNN, Umbraco, Oqtane, migrations, external customers. Khong phu hop minimal change.

Recommended decision:

- Short-term: khong remove column.
- Mid-term: stop direct parsing by adding `ISubmissionDataStore`.
- Long-term: chi drop/deprecate `DataJson` khi telemetry/test cho thay khong con consumer nao dung.
