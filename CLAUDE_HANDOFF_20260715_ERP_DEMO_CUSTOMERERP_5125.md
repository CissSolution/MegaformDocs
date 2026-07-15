# Handoff — Customer ERP demo on :5125 using CustomerErp (LegacyErp_Demo)

Owner yêu cầu (2026-07-15): dựng demo ERP end-to-end trên **http://localhost:5125/** (Oqtane Fresh1804,
host/abc@ABC1024), **database SQL = CustomerErp**. 6 requirement: Master Data → Store → Vendor → Transaction
(+receipt) → Invoice tự sinh → Dashboard/Reports. **THÊM:** submission/report dashboard phải có **source picker**
(đọc từ JSON submissions ⇄ đọc thẳng SQL database) — làm thành **tính năng sản phẩm thật**.

## ⭐ Sự thật nền tảng (đã xác minh)
- **"CustomerErp" là connection KEY**, database thật = **`LegacyErp_Demo`** trên `.\SQLEXPRESS`
  (`ConnectionStrings:CustomerErp` trong appsettings :5125), đã whitelisted trong `MegaForm:ExternalTables:AllowedConnections`.
- Site DB (form/submission) = `Oqtane_MegaForm_Fresh1804`.
- ⭐**connectionKey "CustomerErp" DÙNG ĐƯỢC cho `optionsConnectionKey` (SQL dropdown) — verified live** (đọc LegacyErp_Demo).
- ⭐sqlcmd `-i`/stdin lỗi trên máy này ("-E and -U/-P mutually exclusive") → **dùng PowerShell `Invoke-Sqlcmd -InputFile`** (chạy DDL/seed) và **`System.Data.SqlClient` parameterized** (ghi SchemaJson/SettingsJson vào MF_Forms, né quoting).

## ✅ ĐÃ XONG + VERIFIED LIVE

### Req 1 — Master Data (LegacyErp_Demo)
`Country`(9), `Currency`(7), `Stores`(3), `Vendors`(3) đã có sẵn. Tôi thêm `Transactions`(3 seed) + `Invoices`(2 auto).
Script: `scratchpad/erp-foundation.sql` (idempotent). Schema Transactions/Invoices trong script.

### Req 2-4 — Store / Vendor / Transaction MegaForms (SQL dropdowns từ CustomerErp)
Dựng deterministic (KHÔNG qua AI): generator `scratchpad/gen-erp-forms.mjs` → SchemaJson/SettingsJson →
UPDATE vào form draft rác có sẵn (tái dùng cột NOT NULL):
- **Form 7 = "Store"** (Published): Country + Currency SQL dropdown → `databaseInsert` INSERT INTO Stores.
- **Form 9 = "Vendor"** (Published): Country dropdown → INSERT INTO Vendors.
- **Form 10 = "Transaction"** (Published): Store/Vendor/Country/Currency dropdown + **File `vendor_receipt`** → INSERT INTO Transactions.
- **Shape chuẩn** (từ form cũ, verified): field `properties:{optionsSource:'sql',optionsType:'sql',optionsSql:'... AS value, ... AS label',optionsConnectionKey:'CustomerErp'}`; settings `databaseInsert:{enabled,connectionKey:'CustomerErp',databaseType:'SqlServer',insertSql:'INSERT ... VALUES (:field,...)'}`.
- ✅ **Verified live** qua `GET /api/MegaForm/Field/Options?formId=N&fieldKey=K&siteId=1`: Store→9 nước/7 tiền; Transaction→Store 3/Vendor 3/Country 9/Currency 7; Vendor→Country 9.

## 🔴 CÒN LẠI
- **Verify databaseInsert (write-half)**: submit thật → row vào Stores/Vendors/Transactions (cùng connectionKey, rất khả năng chạy; ⚠️anti-spam curl có thể bị spam-score → dùng Playwright + UA override, hoặc test qua UI).
- **Cascade (5b)** — optional: Vendor/Currency lọc theo Country (`optionsDependsOn:["country_code"]` + `:countryCode`).
- **Req 5 — Invoice tự sinh**: workflow Approval → status `invoiced` + Print A4 stamp INVOICED, HOẶC workflow Database node INSERT INTO Invoices khi transaction approved. ⭐WorkflowJson PHẢI có `StartNodeId`.
- **Req 6 — Dashboard + 6 report**: DataRepeater widgets (masterQuery trên LegacyErp_Demo qua CustomerErp): Stores/Vendors/Transactions list + Country-wise (`GROUP BY CountryName`) + Currency-wise + Transaction summary with invoice status.
- **FEATURE source picker (owner giao thêm)**: submission dashboard + report dashboard thêm toggle nguồn = submissions(JSON DataJson) ⇄ SQL table (ExternalTable). Đây là **code change sản phẩm** — cần khảo sát `SubmissionsShell.ts` + ExternalTable/ATBE hiện có rồi thiết kế.

## 🔧 FEATURE: Source picker (JSON⇄SQL) — design + server half SHIPPED

Workflow recon `wf_4848953e-087` (output `tasks/we08nszzd.output`) map đầy đủ. **Hai cơ chế form→SQL:**
- **ATBE Bind** (ExternalTable): submission LÀ row SQL; `ExternalSubmissionRepository.List:47` decorator route bound form → `ExternalTableQueryService`. Design "chuẩn" = thêm param `source` (auto/sql/json) qua `AsyncLocal ExternalSourceContext` ở `SubmissionQueryService.List:38`. ⚠️decorator CHỈ đăng ký trên Oqtane (`Startup.cs:85`) — Web/DNN/Umbraco chưa → source=sql sẽ đọc JSON im lặng (twin gap).
- **databaseInsert** (mirror write) — **form demo 7/9/10 của tôi dùng cái này** → SQL view = bảng mirror, đọc qua **`CustomTableRows`**.

**✅ SERVER HALF SHIPPED (databaseInsert path, Oqtane):** port `CustomTableRows` DNN→Oqtane
(`MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`, sau SqlColumns). Đọc `settings.databaseInsert`
→ parse bảng → `SELECT` OFFSET/FETCH (pageSize≤200, bounded §11). ⭐**An toàn hơn DNN**: dùng `OpenAiConnection(connectionKey)`
validate qua whitelist `AllowedConnections` (DNN bản cũ không). Build net9+net10 0-error, hot-swap Server DLL net10 → :5125 + restart.
✅ Verified: `GET /api/AiTools/CustomTableRows?formId=7` = **403 anon** (route resolve + admin-gate OK). ⭐**URL đúng = `/api/AiTools/` KHÔNG phải `/api/MegaForm/AiTools/`** (livedb-modal client build URL sai prefix trên Oqtane → 404, cần sửa client khi làm toggle). **CHƯA commit** (AiToolsController.cs có thay đổi Codex trộn — cẩn thận khi commit).

**✅ CLIENT HALF SHIPPED + DEPLOYED (commit `a78cd76`):** toggle "Source: Submissions | SQL table" trong
SubmissionsShell (single form). `state.ts` (source + setSource/setSqlTableName/resetSource); `SubmissionsShell.ts`
(`buildSourceSelect`, `aiToolsBase`, `fetchSqlRows` → CustomTableRows, branch trong `loadSubmissions`, reset khi switchForm).
SQL row normalize thành `{dataJson:JSON.stringify(row), submissionId: NEGATIVE synthetic, status:'', submittedOnUtc:''}`
→ grid render không đổi. AssetVersion **B400**. Build 0-error → deploy Server+Shared DLL net10 + bundle → :5125 restart.
✅ **Verified**: served bundle có `CustomTableRows`+`Source: SQL table`; B400 live; endpoint 403 anon.
🟡 **CÒN: click-through QA** (login Oqtane :5125 → submissions form 7 → toggle SQL → thấy 3 Stores) — kẹt selector
login Oqtane trong Playwright (harness, không phải feature); anh có thể tự bấm test trên :5125.
⚠️ Server `AiToolsController.cs` (CustomTableRows) **deployed nhưng CHƯA commit** — file trộn thay đổi Codex AI-DB-picker.

**Increment 2 (chunk kế):** report-dashboard toggle (`submission-report.ts:317`); disable row-open/status/delete trong
SQL mode (id synthetic); detection ẩn toggle khi form không có databaseInsert; 4-platform twin (Web/DNN/Umbraco).

<details><summary>Hook points gốc (tham chiếu)</summary>
- `state.ts:40` SubsState → thêm `source:'submissions'|'sql'`; `initSubsState:54` default; `setSource()` mutator (mirror setFilters:106).
- `SubmissionsShell.ts:1802` `loadSubmissions()` → branch: source='sql' fetch `/api/AiTools/CustomTableRows?formId&page&pageSize`, synthesize row `{dataJson:JSON.stringify(sqlRow), submissionId:idx, status:'', submittedOnUtc:''}` → `setSubmissions(items,total)` (grid source-agnostic khi có dataJson string — cột lấy từ union branch `getResponseFieldDefs:264`).
- `SubmissionsShell.ts:634` render selWrap → `buildSourceSelect` (clone buildFormSelect:1409); onchange→setSource+loadSubmissions (mirror statusSel:639). Hiện toggle CHỈ khi form có `settings.databaseInsert.enabled` (detection: đọc từ schema/settings client-side hoặc 1 call).
- **SQL mode: disable** row-open/status/delete (id là synthetic; PK-less collide). Dùng bucket cột riêng `f{formId}:sql` (COLUMNS_STORE_KEY).
- Bump AssetVersion; build:submissions; hot-swap; QA form 7 (Store→Stores): toggle SQL thấy 3 store thật, JSON thấy submissions, toggle ẩn trên All-Forms.
- **Report dashboard** (`submission-report.ts:317`) + 4-platform twin = increment 2.
</details>

## Tài liệu tham chiếu
- Kế hoạch gốc: `CLAUDE_HANDOFF_20260714_AI_ERP_STEPWISE_PLAN.md` (map 1:1 req khách; prior work tới bước 5a).
- Bản dựng tay đối chứng: `Docs/docfx/articles/erp-end-to-end.md` (forms 8/9/10 trên :5123).
- Scratchpad phiên: `erp-foundation.sql`, `gen-erp-forms.mjs`, `erpform-*.json`.
