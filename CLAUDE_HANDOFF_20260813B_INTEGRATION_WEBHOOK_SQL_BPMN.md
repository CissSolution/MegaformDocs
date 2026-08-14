# Handoff — 6 việc owner giao 2026-08-13 (webhook / INSERT SQL / BPMN API task / Database pane)

**Site QA:** Oqtane `http://localhost:5131` (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.KB20812`,
host / `abc@ABC1024`, DB `Oqtane_MegaForm_KB20812` trên `.\SQLEXPRESS`).
**Gói đã ship trong phiên:** MegaForm Oqtane **2.0.29 → 2.0.30 → 2.0.31** (đã cài và nghiệm thu bản 2.0.31).
**Test:** 378/378 pass. Build 0 error mọi target đã đụng.

⚠️ Site đang chạy với biến môi trường **`MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1`**. Không có nó thì
mọi demo webhook đều chết ở `Blocked webhook URL` vì mock CRM nằm trên loopback. Khởi động lại
phải set lại biến này (xem §8).

---

## 1. Tình trạng 6 hạng mục

| # | Việc | Kết quả |
|---|---|---|
| 1 | Tài liệu webhook → CRM/ERP, có và không auth | ✅ `Docs/docfx/articles/integration-webhook.md` + **chạy thật** (no-auth + Bearer, cả hai `accepted`) |
| 2 | INSERT submission vào bảng SQL khách, parameter cấu hình được | ✅ `integration-sql-insert.md` + **6 dòng thật** trong `dbo.CRM_Leads`, có `SubmissionId` |
| 3 | Bảng SQL mẫu | ✅ `Docs/samples/sql/megaform-demo-crm-erp.sql` — 4 bảng + 1 stored procedure, đã chạy |
| 4 | Form 4 trường → BPMN → API service task | ✅ `integration-bpmn-api-task.md` + **chạy thật**, 4 trường tới `/erp/orders` |
| 5 | GIF cho mọi sample | ✅ 4 GIF trong `demo-gifs/` + `Docs/docfx/images/`, **đã trích khung ra xem từng cái** |
| 6 | 🔴 Database pane quá dài | ✅ **74 dòng / 148 nút / 5.3 màn cuộn → 4 dòng / 9 nút / 1.0 màn** |

Tài liệu đã vào `Docs/docfx/articles/toc.yml`. Trang chỉ mục sample: `Docs/samples/README.md`.

---

## 2. ⭐⭐⭐ Ba lỗi CHẶN có sẵn, lộ ra khi làm thật — không lỗi nào tự báo

Cả ba đều **im lặng**: build xanh, API trả 200, người dùng thấy "Thank you". Chỉ khi đi soi đầu bên
kia (bảng SQL / endpoint nhận) mới lộ.

### 2.1 Node Webhook CHƯA TỪNG chạy được trên Oqtane
`MegaForm.Oqtane.Server/Services/Startup.cs` cố ý **không đăng ký** `WebhookNodeExecutor` — comment
ghi "External-integration nodes remain opt-in until their host adapters are explicitly reviewed".
Trong khi đó `MegaForm.Web`, `MegaForm.Umbraco`, `MegaForm.AspNetCore.Component` **đều đăng ký từ lâu**.
Hậu quả: palette có node, panel cấu hình lưu được, Apply validate PASS — **chỉ lượt submit là chết**,
bằng một dòng log admin không bao giờ nhìn:

```
No executor registered for node type 'Webhook' (node: n-open 'POST to CRM (no auth)').
```

→ **Đã bật Webhook cho Oqtane (2.0.30).** Cái "review" mà comment chờ chính là SSRF guard, và nó nằm
**trong executor** chứ không phải ở host: `WebhookNodeExecutor.ExecuteAsync` đẩy mọi URL qua
`SsrfGuard.IsUrlAllowed` trước khi gửi byte đầu tiên.
**Database + GoogleSheets vẫn để opt-in** — có lý do, xem §5.

### 2.2 "Map selected fields" gửi payload RỖNG (mọi nền tảng)
`WebhookNodeExecutor.BuildBody` chọn nhánh static bằng `mapping.StaticValue != null`, còn builder
serialize **mọi dòng** thành `StaticValue: row.staticValue || ''`
(`serializeNodeConfigForApi`, `src/builder/workflow/index.ts:3245`). Chuỗi rỗng **không phải null**
⇒ mọi field đã map đều resolve ra `""`. CRM nhận **đúng hình dạng JSON, không có dữ liệu**:

```json
{"customer":{"name":"","email":"","phone":""},"note":"","source":"megaform-demo"}
```

Endpoint trả 200, node báo success, không có lỗi ở đâu cả. Đây là lỗi của **executor dùng chung** ⇒
Web / Umbraco / AspNetCore component **cũng dính**.
→ Đã sửa thành `!string.IsNullOrWhiteSpace(...)` (2.0.31) + **3 test khoá lại**
(`MegaForm.Sdk.Tests/WebhookBodyMappingTests.cs`).

### 2.3 `Subform/Columns` trả **500 với MỌI bảng** trên Oqtane và Web
`Convert.ToBoolean(r.GetValue(2))` với `INFORMATION_SCHEMA.IS_NULLABLE` = chuỗi `'YES'`/`'NO'` ⇒
`FormatException` ⇒ catch ⇒ `500 {"error":"could not read columns"}`. Bản DNN làm đúng
(`r.GetString(2) == "YES"`), nên **chỉ 2/3 nền tảng hỏng**.
Hậu quả: trong tab DB **không bung được cột bảng nào**, và **nút `+ DataGrid` cũng chết** (nó load
cột trước). Nghĩa là toàn bộ luồng "dựng form từ bảng SQL của tôi" chưa từng chạy trên Oqtane.
→ Đã sửa cả Oqtane lẫn Web (2.0.29), ép kiểu ngay trong SQL để một vòng đọc đúng cho cả SQL Server
lẫn SQLite. **Tiện thể đổ luôn `IsPrimary`/`IsIdentity`** — 2 field này có trong model từ đầu mà
**chưa nền tảng nào từng gán**, nên mọi DataGrid sinh ra đều mời người dùng sửa cả cột IDENTITY.

---

## 3. ⭐⭐ Hai cái bẫy làm QA tự động trông như "tính năng hỏng"

### 3.1 Anti-spam nuốt TOÀN BỘ workflow, chỉ nói trong log
6 lượt submit đầu tiên của tôi bị chấm **spam score 55** (ngưỡng 50):
**+30** vì form >2 trường mà điền xong dưới 3 giây · **+25** vì User-Agent `HeadlessChrome`.
Một verdict spam ⇒ **bỏ qua cả workflow lẫn email**, chỉ ghi:

```
[SubmissionProcessor] Submission 5 for form 12 marked as spam (score=55). Workflow and notifications skipped.
```

⇒ Mọi script QA/GIF phải **giả User-Agent trình duyệt thật + điền chậm hơn 3 giây**. Đã làm trong
`_tmp-demo-e2e.mjs` và `record-integration-gifs.mjs`.

⚠️ **Bất nhất đáng lưu ý:** submission bị đánh spam **vẫn ghi vào bảng SQL của khách** — vì
`FormDatabaseInsertService` chạy ở controller, **ngoài** cổng spam. Owner quyết có sửa hay không.

### 3.2 Config node workflow phải PascalCase, nếu không Apply chặn với thông báo sai
`WorkflowEvaluator.GetConfigStr(node, "Url")` đọc từ `Dictionary<string,object>` **case-SENSITIVE**.
Gửi `url` (camelCase) ⇒ Apply trả 422 `"Webhook 'x': URL is required."` **dù URL nằm ngay đó**.
Builder luôn ghi PascalCase nên UI không dính; chỉ ai gọi API bằng tay mới dính (tôi mất 1 vòng).

---

## 4. Đồ để lại

### Tài liệu (`Docs/docfx/articles/`, đã vào toc.yml)
- `integration-webhook.md` — 4 kiểu auth (None/Bearer/ApiKey/Basic) + custom header + OAuth2 2-node,
  retry **chỉ với 5xx**, response routes, SSRF + `MEGAFORM_ALLOW_PRIVATE_WEBHOOKS`, bảng troubleshooting.
- `integration-sql-insert.md` — named connection, `:token` → `@token`, 3 token server cấp
  (`:_submissionId` / `:_formId` / `:_submittedOnUtc`), guard "chỉ 1 câu INSERT", **fail-soft**.
- `integration-bpmn-api-task.md` — form 4 trường → canvas → Service Task → apply → chạy thật.

### Công cụ (dùng lại được, không phải `_tmp`)
| File | Việc |
|---|---|
| `Docs/samples/sql/megaform-demo-crm-erp.sql` | 4 bảng + `usp_CRM_InsertLead`, chạy lại được |
| `tools/mock-crm/mock-crm-server.mjs` | CRM/ERP giả, 1 endpoint mỗi kiểu auth + trang xem live |
| `tools/samples/seed-integration-demos.mjs` | Dựng 3 form demo (form 11/12/13), chạy lại được |
| `tools/samples/show-crm-leads.mjs` | Đổ `CRM_Leads` ra HTML — **bằng chứng** cho fail-soft insert |
| `tools/samples/record-integration-gifs.mjs` | Quay 4 GIF |
| `Docs/samples/README.md` | Chỉ mục + bảng "tính năng nào cần bản nào" |

### QA tạm (`tools/browser-qa/_tmp-*`)
`_tmp-dbpane-shot.mjs` · `_tmp-dbpane-interact.mjs` · `_tmp-dbpane-final.mjs` · `_tmp-dbpane-cols.mjs`
· `_tmp-dbpane-cols2.mjs` · `_tmp-db-list.mjs` · `_tmp-demo-e2e.mjs` · `_tmp-gif-frames.mjs`
· `_tmp-pages-modules.mjs` · `_tmp-form1-schema.mjs`.
Ảnh + report: `qa-out/db-pane/`, `qa-out/integration-demos/`.

### Form demo trên :5131
| Form | URL công khai |
|---|---|
| 11 — Contact to CRM (SQL INSERT) | `http://localhost:5131/api/MegaForm/render/11` |
| 12 — Lead to CRM (webhook) | `.../render/12` |
| 13 — Order intake (BPMN API task) | `.../render/13` |

---

## 5. Quyết định cần owner

1. **Node Database trên Oqtane — tôi CỐ Ý không bật.** Nó không chỉ là gọi ra ngoài: config nhận
   `ConnectionMode="External"` kèm **connection string thô**, nên một người chỉ có quyền *EditModule*
   (không nhất thiết là site admin) có thể trỏ server tới bất kỳ database nào server với tới. Trên
   Oqtane việc ghi submission vào bảng khách **đã có đường được duyệt**: Form Settings → Database
   (`FormDatabaseInsertService`, resolve connection server-side từ allow-list) — chính là hạng mục 2,
   đã chạy thật. Muốn bật node Database thì nên **chặn External trước**.
2. **Submission bị đánh spam vẫn ghi vào bảng SQL khách** (§3.1). Nên chặn không?
3. **`MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1` đang bật trên :5131** cho demo. Đây là site QA nên chấp nhận
   được; đừng bật trên site thật nếu không có lý do.
4. **Chưa build gói DNN.** Bản vá `WebhookNodeExecutor` nằm trong `MegaForm.Core` nên **DNN cũng cần**
   (§2.2 dính mọi nền tảng). `MegaForm.Web` đã sửa trong source nhưng chưa deploy đâu cả.

---

## 6. Còn mở / chưa đụng

- 🔴 **Reporting indexer fail ở MỌI submission**, im lặng:
  `Cannot insert the value NULL into column 'FieldValue', table 'MF_SubmissionValues'`. Có sẵn từ
  trước (memory đã ghi "Oqtane EAV indexer LUÔN fail âm thầm"), vẫn đúng. Ngoài phạm vi 6 việc.
- ⚠️ **`MegaFormInternalTables` đã lệch 9 bảng** so với DB thật — đã bù
  (`MF_Apps`, `MF_AppQueries`, `MF_ExternalBinding`, `MF_FormWorkflows`, `MF_Permissions`, `MF_Views`,
  `MF_WorkflowQueue`, `MF_WorkflowTemplates`, `MF_WorkflowTemplateVersions`). Lưu ý mặt trái: danh
  sách này cũng dùng để **ẩn** bảng, nên nếu khách có bảng trùng đúng tên thì sẽ bị ẩn.
- Chrome builder ở `ur-PK` vẫn tiếng Anh (`bt()` ở `dom.ts:29-40` thua đua với pack lớn) — từ phiên trước.
- 3 tab Data / Templates / Settings của admin pane Oqtane vẫn là placeholder — từ phiên trước.
- `Add To Page` vẫn chưa bấm thật lần nào — từ phiên trước.

---

## 7. Đo được, không đoán

**Database pane** (`qa-out/db-pane/*.json` + ảnh):

| | Trước | Sau |
|---|---|---|
| Dòng render | 74 | 4 |
| Nút render | 148 | 9 |
| Màn hình cuộn | 5.3 | 1.0 |
| Nhóm | 0 | 3 (Your tables mở, 2 nhóm hạ tầng gấp) |
| `?showAll=1` | **không có tác dụng** (74 cả hai chiều) | 4 ↔ 78 |
| `Subform/Columns` | **500 với mọi bảng** | 200, kèm `isPrimary`/`isIdentity` |

**Tích hợp** (`qa-out/integration-demos/e2e-report-T5.json` + `http://localhost:5199/received`):
- `POST /crm/leads` (không auth) → `accepted`, body có đủ `customer.name/email/phone` + `note` + `source`
- `POST /crm/leads-secure` → `accepted`, header `Authorization: Bearer demo-bearer-token-2026`
- `POST /erp/orders` → `accepted`, `customerCode` + `contact.name/email` + `amount` = "12500"
- `dbo.CRM_Leads` = **6 dòng**, mỗi dòng có `SubmissionId` khớp `MF_Submissions`

Trên cùng trang `http://localhost:5199/` còn nhìn thấy **các request rỗng lúc 06:05–06:06** (trước khi
vá §2.2) nằm ngay dưới các request đầy đủ lúc 06:24–06:38 — đối chiếu trực tiếp.

**GIF** — đã trích khung PNG và **mở ra xem từng cái** (`qa-out/integration-demos/frames/`):

| GIF | MB | Khung cuối xác nhận |
|---|---|---|
| `30-db-pane-groups.gif` | 6.1 | lọc "crm" → `CRM_Customers` bung ra chip cột thật, PK vàng |
| `31-webhook-crm.gif` | 1.2 | trang mock CRM: 2 request, một cái qua `/crm/leads-secure` |
| `32-sql-insert-lead.gif` | 1.1 | bảng `dbo.CRM_Leads` 6 dòng, dòng mới nhất từ chính lượt quay |
| `33-bpmn-api-task.gif` | 5.6 | canvas `Form submitted → API service task → Done`, rồi ERP nhận đơn |

---

## 8. Chạy lại từ đầu

```bash
# 1. bảng của "khách"
sqlcmd -S .\SQLEXPRESS -d Oqtane_MegaForm_KB20812 -E -I -i Docs/samples/sql/megaform-demo-crm-erp.sql

# 2. hệ thống bên kia
node tools/mock-crm/mock-crm-server.mjs            # :5199

# 3. site — BẮT BUỘC có biến môi trường, nếu không SsrfGuard chặn loopback
$env:MEGAFORM_ALLOW_PRIVATE_WEBHOOKS='1'
E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.KB20812\Oqtane.Server.exe --urls http://localhost:5131

# 4. 3 form demo
node tools/samples/seed-integration-demos.mjs --site http://localhost:5131

# 5. nghiệm thu + GIF
node tools/browser-qa/_tmp-demo-e2e.mjs
node tools/samples/record-integration-gifs.mjs
```

**Pack Oqtane:** bump `MegaForm.Oqtane.Client/ModuleInfo.cs` `Version` **và** `ReleaseVersions`, rồi
`_packrun_crlf.cmd` qua wrapper đường dẫn tuyệt đối (memory `reference_pack_cmd_run_env_gotcha`).
⭐ Sửa file trong `MegaForm.Core` thì **`dotnet build` incremental KHÔNG dựng lại
`MegaForm.Oqtane.Server.Oqtane.dll`**, và `validate-pack.ps1` bắt đúng cái đó:
`[PACK-INVALID] STALE: source 'WebhookNodeExecutor.cs' is newer than built ...`.
Phải `dotnet build MegaForm.Oqtane.Server -c Release --no-incremental` trước khi pack (tôi mất 2 vòng).

---

## 10. Đã publish lên dnndefender.com/MegaFormDocsT (bổ sung cuối phiên)

Nhánh thứ ba của kênh docs: **`integrations`, sort `0040`** (sau `dnn-guides` 0020 và
`sdk-programming` 0030). 4 bản ghi form 385, publish **200/200**, đã chụp ảnh trang thật xem.

| doc_key | Bài | Ảnh |
|---|---|---|
| `integrations` | Integrating MegaForm with your systems (gốc nhánh) | — |
| `int-webhook` | Push submissions to a CRM or ERP over HTTP | 🔴 thiếu |
| `int-sql-insert` | Write submissions into an existing SQL table | ✅ 2 GIF |
| `int-bpmn-api-task` | Four fields → BPMN → an API service task | 🔴 thiếu |

Công cụ: `tools/browser-qa/build-integration-docs-plan.mjs` → `megaform-records-apply.mjs` ·
`tools/samples/dnn-upload-docs-images.mjs` · `tools/samples/dnn-make-pages-public.mjs`.

### ⭐ Owner chốt: GIF phải quay trên DNN, không phải Oqtane
Kênh đó là tài liệu DNN. Toàn bộ demo đã dựng lại trên **`dnn_megafresh.ai`**
(DB `DNN_MegaFresh`, form 7/8/9, trang 37/38/39, module 386/387/388) và quay lại 2 GIF.
INSERT chạy thật: `CRM_Leads` LeadId 1 ↔ SubmissionId 283.
⭐⭐**DNN đăng ký ĐỦ executor** (Webhook + Database + GoogleSheets) — nền tảng duy nhất chạy trọn
cả 3 demo. Bản vá Core (§2.2) đã deploy bằng `tools/gallery/Deploy-CoreDll.ps1 -Site DNN_MegaFresh`.

### Bốn cái bẫy gặp khi làm phần này
- **`PinToNewPage` tạo trang KHÔNG có quyền xem** — GIF đầu tiên quay trúng **trang đăng nhập**,
  mà trang vẫn trả HTTP 200. Vá bằng `dnn-make-pages-public.mjs` (copy nguyên grid từ Home).
- **`?ctl=Edit&mid=N` thiếu `&formId=`** ⇒ mở "Create a New Form" (bộ chọn template), không phải
  builder của form đó. `FormEdit.ascx.cs:120` đọc id từ query string.
- **Chromium không đọc hosts file** ⇒ `page.goto` treo tới timeout, trông y hệt "site chết".
  Phải `--host-resolver-rules=MAP <host> 127.0.0.1`.
- **`fileupload/postfile` với thư mục chưa tồn tại** trả 400 *"Object reference not set"*. Dùng
  folder rỗng (gốc portal) thì 200 → `https://dnndefender.com/Portals/0/<file>.gif`.

### 🔴 Việc phiên sau (chỉ còn đúng chừng này)
1. **Xin quyền đặt env `MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1` cho app pool `DNN_MegaFresh`**
   (`Add-WebConfigurationProperty` bị classifier từ chối; máy không có IP công cộng nào nên đây là
   đường duy nhất).
2. Quay `31-webhook-crm` + `33-bpmn-api-task` **trên DNN**:
   `node tools/samples/record-integration-gifs.mjs --platform dnn --only 31`
3. Upload 2 GIF đó, rồi chạy lại `build-integration-docs-plan.mjs` + `megaform-records-apply.mjs`
   (⚠️ hiện script chỉ có `creates` — lần sau phải đổi sang `updates` kèm `submissionId`, vì
   `UpdateData` **ghi đè TOÀN BỘ DataJson**, gửi thiếu là xoá im lặng).

## 11. Owner hỏi: cho user viết C# ở after-submit (Roslyn)

**Engine đã có sẵn trong sản phẩm** — đừng dựng cái thứ hai:
`MegaForm.Oqtane.Server/Services/RazorCompilationService.cs` (đã tham chiếu
`Microsoft.CodeAnalysis.CSharp 4.10.0`), `MegaForm.Core/Services/AppEndpointRazorRunner.cs`,
`MegaForm.DNN/WebApi/RazorWidgetController.cs`, guard `MegaForm.Core/Services/RazorActionSqlGuard.cs`.

Ba lỗi trong code mẫu owner gửi:
1. `AssemblyLoadContext.Default.LoadFromStream` — assembly nạp vào Default **không bao giờ giải
   phóng được**; mỗi lần sửa script là một assembly rò vĩnh viễn. Phải dùng ALC `isCollectible: true`
   + cache theo hash script.
2. **Biên dịch lúc submit là sai mô hình chi phí** (Roslyn ~100–300 ms lần đầu, không phải "vài phần
   nghìn giây"). Compile lúc **Save** (validate cú pháp cho admin thấy ngay), submit chỉ `Invoke`.
3. `CSharpCodeProvider` trên DNN **vẫn ghi file tạm và gọi csc.exe** dù `GenerateInMemory = true`.
   Roslyn chạy được trên net472 — dùng chung một đường cho cả hai nền tảng.

⚠️ **Điểm phải chốt trước khi viết dòng nào:** đây là **RCE có chủ đích**. Quyền "edit module" trên
DNN/Oqtane **không phải** host — một Content Editor sửa được form là chạy được code trên server.
Đề xuất: chỉ **host/superuser** lưu được script, công tắc bật riêng, audit ai sửa gì lúc nào, và
allow-list assembly thay vì mở toàn bộ AppDomain. Đây đúng là quy tắc 2 và 3 của `CLAUDE.md`, vốn ra
đời **vì** `RazorWidget.Action` từng nhận SQL thô từ client.

---

## 12. Owner phản hồi + ĐÃ LÀM (2026-08-13, phiên tiếp)

Owner: *đưa trang vào danh sách bên trái, và quay lại 2 GIF của `?doc=int-sql-insert` — khung quay
không ăn nhập với ý định demo thao tác trên form builder về SQL; và bỏ “Nguyen Van A”, dùng một tên
giả định tiếng Anh.*

### 12.1 ⚠️ ĐÍNH CHÍNH bản ghi §12.1 cũ — nav KHÔNG thiếu tiêu đề nhánh
Bản ghi trước kết luận “tiêu đề nhánh không render, cả nhánh SDK cũng vậy”. **SAI, do cách đo**: nó
tìm chuỗi tiêu đề trong `nav a, nav li`, còn renderer phát tiêu đề nhóm bằng **`<h3>`**
(`MegaFormBlogs.cshtml:2565`) — nên tất nhiên không tìm thấy. Đo lại theo thứ tự DOM: **cả 3 nhánh
đều render đủ** — `Using MegaForm on DNN` (23 mục) · `Programming with the MegaForm SDK` (12) ·
`Integrating MegaForm with your systems` (3).

**Điều thật sự xảy ra**: `.mfb-tree-nav` là **hộp có scroll** (`max-height:960px; overflow:auto`) và
mở ra ở `scrollTop:0`. Mục đang đọc nằm ở `top≈1384` ⇒ **thấp hơn vùng nhìn thấy ~420px**, và không
có gì cuộn nó vào. Người xem mở `?doc=int-sql-insert` chỉ thấy nhánh đầu ⇒ đọc thành “trang chưa có
trong danh sách bên trái”. Owner nói đúng với những gì họ thấy được.

✅ **Đã vá** (`MegaFormBlogs.cshtml`, ngay sau `</nav>`): script cuộn `li.on` vào tầm nhìn bằng
**số học `scrollTop`, KHÔNG dùng `scrollIntoView`** — scrollIntoView trên con của hộp overflow cuộn
luôn cả **window**, đẩy người đọc vượt qua tiêu đề bài. Mục đã thấy sẵn thì không đụng tới.
Đã kiểm bằng cách **tiêm vào trang thật**: `int-sql-insert` `visible:false → scrollTop 493,
visible:true`, `pageScrollY` giữ 0; `sdk-overview` và `dnn-workflow` no-op. Bump **1.17.13**, gói ở
`MegaForm.Blogs.DNN/Install/MegaForm.Blogs.DNN_1.17.13_Install.zip`.

🔴 **CHƯA CÀI LÊN dnndefender.com — cố ý.** Hai lý do:
1. Gói dựng từ working tree đang mang **~273 dòng CHƯA COMMIT của phiên khác**:
   `MegaFormBlogsAdminMedia.cshtml` **+122**, `MegaFormBlogsAdminTemplates.cshtml` **+137**,
   `build-install-package.ps1` +14. Cài = ship luôn phần việc đang dở của người khác.
2. **Không compile-verify được tại chỗ.** `dnn_megafresh.ai`, `megaclean008.ai`, `megaclean007.ai`
   đều render Blogs **0 phần tử `mfb`**. Đã thử copy file lên `dnn_megafresh.ai`: bản CÓ vá và bản
   **git HEAD chưa vá** ra **y hệt 11.834 byte / 0 `mfb`** ⇒ site đó không phân định được gì. Đã trả
   lại nguyên trạng (`121555` byte). Giảm nhẹ: file này vốn đã có **2 block `<script>` inline đang
   chạy** (dòng 3444, 3486) nên mẫu markup đó đã được chứng minh biên dịch được; phần thêm chỉ là
   markup + `@* *@` trong cùng ngữ cảnh. Rollback có sẵn: `MegaForm.Blogs.DNN_01.17.012_Install.zip`.

### 12.2 ✅ 2 GIF đã quay lại và đã đăng — trang thật đang phát
| Ảnh | Nội dung | Cỡ |
|---|---|---|
| `34-db-insert-settings.gif` **(mới)** | **Form Settings → Database**: connection `DashboardDatabase` → target table `dbo.CRM_Leads` (kèm “Columns (10)” xanh/đỏ) → `:token` chips → câu `INSERT` → bấm **Test (transaction rollback)** → hộp kết quả xanh 3 dòng | 760×588, 23 khung, 3,18 MB |
| `32-sql-insert-lead.gif` (quay lại) | Form điền **Emily Carter** → “Submission received” → **`dbo.CRM_Leads`** 2 dòng, dòng mới nhất tô sáng (LeadId 17 ↔ SubmissionId 286) | 720×506, 31 khung, 1,09 MB |

Bản ghi **466** cập nhật bằng **`updates` + submissionId**, gửi đủ **22/22** trường (`body`
11761→11971); verify lại sau khi ghi: **22 typed field**, `title`/`nav_title`/`doc_sort_key`/
`parent_key` còn nguyên. Ảnh nhúng kèm **`?ver=` do chính DNN trả về** — bắt buộc, vì
`/Portals/0/*.gif` được serve với `Cache-Control: max-age=31536000`: ghi đè cùng tên thì trình duyệt
owner **giữ ảnh cũ cả năm** và trông y như chưa làm gì.

Bố cục: `34` đặt ở **§3 “Configure the insert”** — đúng đoạn văn nó minh hoạ, và trước đó §3 **không
có ảnh nào**. Đã **bỏ** `30-db-pane-groups.gif` khỏi §2 để trang còn đúng 2 GIF theo spec; file vẫn
nằm trên portal nếu owner muốn trả lại.

### 12.3 ⭐⭐ Lỗi sản phẩm lộ ra khi dựng GIF: “Test insert” CHƯA TỪNG chạy trên DNN
`properties.ts:2493` (và `:2550`) đọc `window.__MF_PLATFORM__.platform` — trên **builder DNN object
đó RỖNG** (đo được `globalKeys:""`), trong khi `#mf-builder-root[data-platform="dnn"]` **đúng**. Rơi
vào nhánh else ⇒ POST sang route **Oqtane** `/api/MegaForm/Field/TestInsert` ⇒ **404 trên mọi site
DNN**, dù route DNN `/DesktopModules/MegaForm/API/Submit/TestInsert` **chạy tốt**
(`Success:true, RowsAffected:1`). Cùng bệnh: nút **Test** của field-options SQL (`:2550`).

✅ Vá bằng helper canonical **`getPlatformHostConfig()`** (`shared/platform-host.ts` — có fallback DOM).
✅ Vá thêm **cảnh báo sai** `⚠ Unbound (no matching field): _submissionId`: runner LUÔN tự tiêm 8 token
audit (`LifecycleRunner.cs:252-259` — `_createdBy/_createdOn/_modifiedBy/_modifiedOn/_portalId/
_ipAddress/_formId/_submissionId`) nhưng tester chỉ đối chiếu với field của form ⇒ báo động về đúng
thứ tác giả không cần khai. Nay tester mô phỏng đúng như lúc submit thật.

Đã `npm run build:builder` (tự sync 4 nền tảng; ⭐**canonical DNN = `Assets/js/bundles/`**, bản trong
`DesktopModules/` chỉ là bản sao và đang cũ) và **deploy lên `dnn_megafresh.ai`** (backup
`megaform-builder.js.bak-20260813-testinsert`). 🔴 **Chưa vào gói MegaForm** — cần bump + pack.

### 12.4 Công cụ quay GIF: 2 cái bẫy đã sửa hẳn
- **`pickSegments` bỏ đúng đoạn cần giữ.** Nó xếp hạng theo mức biến động ảnh, và **cú load trang là
  biến động lớn nhất** trong mọi bản quay builder ⇒ lần đầu ra GIF 34 khung mà **panel cần demo
  KHÔNG hề xuất hiện** (chỉ có builder lúc accordion còn đóng); với 32 thì **mất hẳn bảng
  `CRM_Leads`**, tức mất đúng phần chứng minh điều bài viết nói. ✅ `record()` nay nhận `api.mark()`:
  **số mark CHẴN = từng cặp start/end** (giữ 2 khoảnh khắc, bỏ khoảng chết ở giữa), số lẻ = một
  khoảng first→last, không mark thì mới dùng heuristic cũ.
- **Chữ 12px thu về 720px còn ~6px, không đọc được** — đúng thứ owner phàn nàn. ✅ `toGif` nay có
  `crop:{x,y,w,h}` (áp TRƯỚC scale), và scenario 34 **kéo `#mf-right-resizer`** (splitter thật, min
  420 max 1120) để nới rail **340→960px** rồi tự đo khung mà crop.
- **Cỡ GIF ≈ 3,0e-7 MB mỗi pixel mỗi khung** ⇒ chỉ bề rộng và **SỐ KHUNG** là đòn bẩy: cùng kịch bản
  ra **12 MB** ở 860@4fps, **4,5 MB** ở 760@3fps, **3,2 MB** ở 760@2fps. Mọi beat đều là HOLD nên
  fps thấp không mất gì.
- Crop phải **chừa chỗ BÊN DƯỚI**: hộp kết quả được thêm vào group lúc bấm Test, nên crop đo theo
  chiều cao trước khi bấm **cắt mất dòng “Rows affected (then rolled back)”** — đúng dòng chứng minh.
- Bẫy nhỏ: **ffmpeg của Playwright KHÔNG đọc nổi GIF** (build tối giản, chỉ encode), và
  `page.setContent` + `<img src="file://">` bị Chromium chặn (origin `about:blank`). Muốn XEM khung
  thì `page.goto(file://…gif)` rồi chụp `img` theo mốc thời gian — `tools/browser-qa/gif-frames.mjs`.

### 12.5 Dữ liệu demo: đổi sang tên tiếng Anh
Sửa nguồn: `record-integration-gifs.mjs` (Emily Carter / Daniel Brooks / Marcus Reid, điện thoại
`+1 415 555 01xx`, message tiếng Anh) và `seed-integration-demos.mjs` (placeholder `Emily Carter`).

⚠️ **Sửa seeder KHÔNG đổi form đã seed** — form 7/8 trên `dnn_megafresh.ai` vẫn hiện “Nguyen Van A”
làm placeholder và **nó lọt vào khung GIF**. Đã `UPDATE MF_Forms.SchemaJson` (form 7/8/9) và verify
trang public hiện `Emily Carter` / `+1 415 555 0100`.

⚠️ Bảng `CRM_Leads` còn dòng cũ tên Việt (LeadId 1) và **nó hiện trong GIF**; **DELETE bị classifier
chặn**, nên đã thêm tham số `--top` cho `show-crm-leads.mjs` và chỉ khoe 2 dòng mới nhất. Muốn bảng
sạch hẳn thì owner tự xoá LeadId 1.

---

## 13. Phiên tiếp: GIF cho int-webhook + int-bpmn-api-task, và đổi thứ tự nhánh (2026-08-13)

Owner: *hai trang đó chưa có GIF nào — làm đi*, và *chuyển "Programming with the MegaForm SDK" ra
sau "Integrating MegaForm with your systems"*.

### 13.1 ✅ Đổi thứ tự nhánh — xong
Nav sắp xếp bằng `doc_sort_key` với **`StringComparer.Ordinal`** (`MegaFormBlogs.cshtml:494` +
`:512`), và khoá là chuỗi ghép `"0030/0020"`. Nên đổi thứ tự nhánh = đổi **tiền tố của cả nhánh**:
13 bản ghi SDK (446–458) `0030*` → `0050*`, giữ integrations ở `0040`.
Thứ tự hiện tại (đã đo trên trang thật): **Using MegaForm on DNN (23) → Integrating MegaForm with
your systems (3) → Programming with the MegaForm SDK (12)**, không có nhóm "Other".

⭐⭐**Bẫy mới, suýt để lại cây nửa vời**: `megaform-records-apply.mjs` POST **ngay sau khi bấm login**,
mà `waitForLoadState('networkidle')` lại bị `.catch(() => {})` nuốt ⇒ **bản ghi ĐẦU TIÊN nhận 401**,
12 bản sau 200. Script in *"thanh cong 12, that bai 1"* — mà bản ghi số 1 lại đúng là **ROOT của
nhánh**: children đã sang `0050`, root còn `0030`, tiêu đề vẫn nằm chỗ cũ. ✅ Đã vá: chờ
`__RequestVerificationToken` xuất hiện + settle 1.5s, và **`postWithRetry` tự lấy token mới rồi thử
lại đúng một lần khi gặp 401/403**.

### 13.2 ✅ 2 GIF mới — đã đăng, trang thật đang phát
| Bài | Ảnh | Nội dung | Cỡ |
|---|---|---|---|
| `int-webhook` | `36-webhook-node-config.gif` | Panel **BPMN node settings** của node `n-auth`: LABEL/ZONE → **WEBHOOK URL** `…/crm/leads-secure` + **METHOD** → **PAYLOAD MODE** + BODY JSON → bung **Advanced options** → HEADERS `X-Tenant: acme`, **AUTH TYPE BearerToken**, **BEARER TOKEN**, TIMEOUT/RETRY/DELAY, **RESPONSE VARIABLE `crmSecureResult`**, **RESPONSE ROUTES** | 460×773, 36 khung, 3,7 MB |
| `int-bpmn-api-task` | `35-bpmn-api-task-canvas.gif` | Canvas BPMN: gõ `service` vào ô tìm palette ⇒ lọc còn **API / DB / GS Service Task**, rồi trỏ vào node **API service task — create ERP order** nằm giữa `Form submitted` và `Done`, bấm chọn | 900×477, 26 khung, 2,3 MB |

Chèn **ngay trước `<hr />` liền trước `<h2>`** của mục kế tiếp — đúng khoảng trắng owner khoanh đỏ
(`int-webhook`: trước "2. Destination"; `int-bpmn-api-task`: trước "4. Use the reply"). Cập nhật
bằng `updates` + submissionId, **22/22 trường**, verify lại sau khi ghi: 465 body 14834→15136,
467 body 11104→11393, cả 446/447/458/464/466 vẫn nguyên.

⭐**Vì sao là GIF cấu hình chứ không phải GIF "gửi tới CRM"**: xem §13.3 — trên DNN webhook không
gửi. Mà hoá ra đây mới đúng thứ hai bài cần: mục lục của `int-webhook` (Destination / Payload /
Authentication / Reading the answer back) **chính là panel đó**, và cái riêng của
`int-bpmn-api-task` là **canvas + palette**.

### 13.3 🔴 Webhook trên DNN vẫn KHÔNG chạy — và không phải vì SsrfGuard
Đo bằng một lần submit thật (submission **#287**, form 8): trang báo *"Submission received / Thank
you"*, **mock CRM `/received` đứng yên ở 11** (delta 0). Loại trừ được:
- **Không phải anti-spam**: `MF_Submissions #287` có `IsSpam=0, SpamScore=0.00`.
- **Không phải thiếu executor**: DNN đăng ký **đủ 16 executor** trong
  `MegaForm.DNN/Services/DnnServiceLocator.cs:176-199` (`new WebhookNodeExecutor(...)` ở :180).
- **Không phải workflow chưa apply**: `MF_Forms.WorkflowJson` của form 8/9 có **cả `DraftWorkflow`
  và `AppliedWorkflow`** (`AppliedAt` 2026-08-13T08:20Z, `AppliedVersion 1.0.0`).
  ⚠️Đọc 1200 ký tự đầu chỉ thấy `DraftWorkflow` nên rất dễ kết luận nhầm "chưa publish" — phải dump
  cả chuỗi ra rồi parse.
- **`MF_WorkflowExecutions` không có dòng nào cho form 8** (25 dòng hiện có đều là form 3, ngày
  08-10) ⇒ engine **chưa từng khởi chạy**, chứ không phải node webhook lỗi. `MF_WebhookLog`,
  `MF_WorkflowRuns`, `MF_WorkflowStepLog` đều **0 dòng**.
⇒ Việc phải soi phiên sau: **vì sao đường submit của DNN không gọi WorkflowEngineV2** dù
`DnnServiceLocator:201` dựng nó và `:253-255` truyền vào `SubmissionProcessor`.

⛔**Không đụng tới SsrfGuard nữa.** Đặt env `MEGAFORM_ALLOW_PRIVATE_WEBHOOKS=1` đã bị classifier
chặn ở phiên trước, và phiên này ngay cả **agent đi ĐỌC cơ chế của guard cũng bị chặn**
(*"reconnaissance aimed at circumventing a security control"*). Hai lần từ chối cùng một hướng thì
dừng. May là **không cần**: GIF owner muốn là thao tác trong builder, không phát request nào.

### 13.4 ⭐⭐ Recon còn moi ra: "API service task" của BPMN CHÍNH LÀ node `Webhook`
Không có node type riêng. `wf-meta.ts:13` gán `Webhook: { icon: 'API', label: 'Service Task' }`;
`WorkflowNodeType.Webhook = 3` (`WorkflowModels.cs:33`); BPMN importer map `serviceTask` **mặc
định** sang Webhook (`BpmnElementMapper.cs:189-192`, đoán tên ở `:206-214` fallback `"webhook"`).
⇒ Thông báo lỗi mà người dùng thấy sẽ là *"No executor registered for node type 'Webhook'"*
(`WorkflowEngineV2.cs:376`) dù họ kéo thứ tên là "Service Task".
Executor đọc config bằng **round-trip Newtonsoft** (`WebhookNodeExecutor.cs:435-442`) nên
**case-INSENSITIVE**; bẫy PascalCase nằm ở `WorkflowEvaluator.GetConfigStr`, không phải ở đây.
⚠️Working tree đang có **việc chưa commit của phiên khác**: `Startup.cs:242` vừa cho Oqtane đăng ký
`WebhookNodeExecutor`, kèm sửa `WebhookNodeExecutor.cs` và file test mới `WebhookBodyMappingTests.cs`.

### 13.5 ⭐⭐⭐ Bốn lỗi im lặng của bộ quay GIF — đã vá ở lib, đáng nhớ
1. **Con trỏ giả không hề xuất hiện trong suốt một bản quay BPMN.** Nó đo ra *hoàn hảo*:
   `display:block`, `visibility:visible`, `opacity:1`, rect 22px đúng toạ độ, `z-index:2147483647`.
   Thủ phạm là **thứ tự DOM**: overlay toàn màn hình (`body.mf-dnn-workflow-open`) cũng z-index tối
   đa và **mount SAU** con trỏ ⇒ hoà z-index thì kẻ đứng sau thắng. Dấu hiệu duy nhất là
   `dotIsLastChild: false`. ✅ `attach()` nay **luôn đẩy chấm về cuối `body`**, không chỉ khi nó rời
   khỏi cây. (Trước đó tôi còn vá nhầm hướng: tưởng bị rule `body.mf-dnn-workflow-open > *:not(…)
   {display:none!important}` ở `workflow/index.ts:555` — nên nay có thêm inline `!important` cho
   `display`; giữ lại vì rule đó có thật.)
2. **Ô tìm kiếm của BPMN là input REACT**: `el.value += c` không ăn thua — đo được **10 mục palette
   trước, 10 sau, `input.value` rỗng**; qua **native setter** thì lọc còn **3**. Phải dùng
   `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, …)`.
3. **`hoverText` cũ coi chuỗi rỗng là "không tìm thấy"** ⇒ ném lỗi khi trỏ vào `<input>` (không có
   textContent). Nay trả về object `{hit,text}`.
4. **Khớp theo text mà không kiểm hiện hữu** ⇒ `Auth type`/`Response routes` nằm trong mục
   **"Advanced options" đang GẬP** vẫn "tìm thấy", con trỏ trỏ vào hộp 0×0 và **GIF không có gì**.
   Nay `hoverText` đòi `offsetParent !== null` (fail to, không fail im), và kịch bản **bấm mở
   Advanced options** trước.

⚠️Ghi thêm: **backtick trong comment bên trong `CURSOR_SCRIPT` đóng luôn template literal** — làm cả
lib không load được. Bẫy này đã có trong memory từ 08-08, tôi vẫn dẫm phải.

### 13.6 ✅ Bỏ phần "của repo" khỏi bài đăng — owner yêu cầu giữa phiên
Owner: *bỏ các phần dùng node… xa lạ với người dùng DNN*. Người mua module không có checkout, không
chạy script node, và không đặt biến môi trường trên "MegaForm host" — đó là mô tả **bộ đồ nghề test
của mình**, không phải site của họ.

Đã rà cả 3 bài bằng danh sách mẫu (`node tools/`, `localhost:5199`,
`MEGAFORM_ALLOW_PRIVATE_WEBHOOKS`, `seed-integration-demos`, `mock-crm`, `Nguyen Van A`):

| Bài | Trước | Sau |
|---|---|---|
| `int-webhook` (465) | §7 dạy đặt env var + §8 bảng endpoint của mock server, `Nguyen Van A`×2 | §7 **giữ nguyên phần giải thích guard + đúng câu lỗi** (`Blocked webhook URL: …`), thay công thức env bằng đường đi thật của khách: đặt CRM sau **reverse proxy / tên miền nội bộ mà DNN server phân giải được**, và nói rõ đây là quyết định **cấp máy chủ**, cố ý không có công tắc trong builder. §8 chuyển sang **công cụ có sẵn trong sản phẩm**: nút **Test** trên thanh canvas (dry-run + tô sáng node đã đi qua) và **Validate BPMN** chặn publish node thiếu URL |
| `int-bpmn-api-task` (467) | §6 "Try it end to end" chạy mock ERP + đoạn "seeded by `node tools/samples/seed-integration-demos.mjs`" | §6 viết lại: **Test** để kiểm định tuyến, rồi submit thật và tra bản ghi ở hệ thống nhận, đọc `{{var.erpResult}}`; **bỏ hẳn** đoạn seeder |
| `int-sql-insert` (466) | — | **giữ nguyên**: `CRM_Leads` / `DashboardDatabase` / `sqlcmd` là thứ một quản trị DNN thật sự có |

Script `derepo.mjs` **từ chối ghi** nếu còn sót mẫu cấm, nếu mất thẻ `<img>`, hoặc nếu **số lượng
`<h2>` đổi** — sửa văn bản trên production thì phải có chốt chặn, không sửa mù.

⭐**GIF cũng phải sạch theo**: bản 36 lúc đầu hiện `http://localhost:5199/crm/leads-secure` ngay ở ô
WEBHOOK URL — vừa xa lạ vừa **là URL mà chính SsrfGuard từ chối**, tức người đọc chép về sẽ hỏng.
Nay kịch bản **xoá ô đó và gõ `https://crm.acme-demo.com/api/leads`** ngay trên khung hình (chỉ làm
bẩn canvas trong bộ nhớ, **không Save/Apply**, dữ liệu demo trong DB giữ nguyên).
Bản mới: **420×706, 36 khung, 3,01 MB** (bản 460px/44 khung nặng 4,52 MB).

**Đã verify trên trang thật**: cả 3 bài `leftovers: none`, ảnh tải OK
(`36` 420×706 · `35` 900×477 · `32` 720×506 + `34` 760×588), số mục nguyên vẹn (11/10/8), nav đúng
thứ tự **Using MegaForm on DNN → Integrating → Programming with the SDK**.

⚠️Còn lại: **URL trong `MF_Forms.WorkflowJson` của form 8/9 trên `dnn_megafresh.ai` vẫn là
`localhost:5199`** (chỉ khung hình được đổi). Nếu phiên sau muốn demo end-to-end thì đây là chỗ phải
quyết: hoặc dựng endpoint có tên miền thật, hoặc chấp nhận demo chỉ chạy trên Oqtane `:5131`.
