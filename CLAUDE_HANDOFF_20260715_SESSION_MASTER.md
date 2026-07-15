# MASTER HANDOFF — Phiên 2026-07-15 (làm việc cho phiên sau)

Nhánh: `feat/theme-designer-picker-wizard-gallery-1.7.45` (chưa push). **12 commit phiên này** (71a30e5→63e87d7).
Chi tiết theo mảng: `CLAUDE_HANDOFF_20260715_PRINT_FIX_DNN_SDK_AND_BOUNDED_READ.md` +
`CLAUDE_HANDOFF_20260715_ERP_DEMO_CUSTOMERERP_5125.md`. File này là bản tổng hợp + việc phiên sau.

## 0. Sites đang chạy (state cuối phiên)
- **:5125 Oqtane Fresh1804** (`E:\DNN_SITES\OqtaneSites\Oqtane.MegaForm.Fresh1804`, DB `Oqtane_MegaForm_Fresh1804`,
  host/**abc@ABC1024**). Chạy `dotnet Oqtane.Server.dll --urls :5125` từ **ROOT site** (⭐`Oqtane.Server.dll` ở root, KHÔNG phải subfolder `Oqtane.Server/`; Packages folder Oqtane scan = **root `Packages/`**). TFM **net10.0**. AssetVersion **B402**. Cài **1.7.106**.
- **`http://dnn10322_megaclean.ai/`** (host/**dnnhost**, trang `/TestPinPage456`, DB `DNN10322_MegaClean` trên `WINDOWS-11\SQLEXPRESS`). Print fix + DNN 8-arg SDK + bounded-read Core đã hot-swap.
- ⭐**sqlcmd `-i`/stdin LỖI trên máy này** ("-E and -U/-P mutually exclusive") → dùng **PowerShell `Invoke-Sqlcmd -InputFile`** (chạy DDL/seed) + **`System.Data.SqlClient` parameterized** (ghi JSON vào MF_Forms). `-Q` inline vẫn OK.

## 1. XONG + DEPLOY + COMMIT (12 commit)
| Commit | Nội dung | Verified |
|---|---|---|
| `71a30e5` | **print-save fix** (4 platform): `MegaFormBuilder.getSettings/updateSettings` KHÔNG tồn tại→ghi thẳng `state.schema.settings.printSettings`; B237 | ✅ E2E :5125 (form 43 preview render A4) |
| `7aeb10d` | **bounded-read RULE** (CLAUDE.md#11 + SECURITY §11) | — |
| `8d0fc02` | **SDK facade 7-surface + DNN 8-arg** (`DnnServiceLocator` 6→8 arg: Files+Inbox chạy trên DNN) | build 0-err, recycled |
| `9753072` | Visual QA: help text OPTIONS SOURCE (SQL cho **cả 6** choice field, không chỉ 3) | ✅ live |
| `458fffd` | **bounded-read tier 1**: cap `MAX_OPTION_ROWS=500` (FieldOptionsService + DataRepeater Filter/Options) — anonymous OOM | build 0-err, deployed |
| `edfcb9a` | **bounded-read tier 2**: Reports FormsOverview GROUP BY (Web/Umbraco/DNN port từ Oqtane) | build cả 4 platform 0-err |
| `f03b335` | **Oqtane 1.7.106** (nuspec+ModuleInfo+ReleaseVersions+AssetVersion B399) | ✅ cài+verified :5125 |
| `a78cd76`/`d043655`/`08da943` | **Source-picker client** (toggle JSON⇄SQL submission dashboard) | ✅ deployed B402 :5125 |
| `63e87d7` | **P1 security**: gate `Workflow/CanvasView` (Oqtane) — was ẩn danh rò submissionId/assignee/dueAt | ✅ 403 anon |

## 2. ⚠️ UNCOMMITTED nhưng ĐÃ DEPLOY (cẩn thận khi commit — trộn Codex)
- **`MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`** = **server half source-picker** (`CustomTableRows` port DNN→Oqtane: đọc bảng mirror `databaseInsert`, `SELECT` OFFSET/FETCH pageSize≤200, whitelist connectionKey qua `OpenAiConnection`, admin-gated) — **trộn với thay đổi Codex AI-DB-picker** (`OpenAiConnection`/`SqlConnections`). Đã deploy :5125, verified `/api/AiTools/CustomTableRows` 403 anon. ⭐**URL Oqtane = `/api/AiTools/` KHÔNG phải `/api/MegaForm/AiTools/`** (livedb-modal build sai prefix). Cần tách khỏi Codex khi commit.
- SDK facade (5 file `MegaForm.Sdk/*`) đã commit trong `8d0fc02`.

## 3. ERP DEMO trên :5125 (dùng CustomerErp = key trỏ `LegacyErp_Demo` trên `.\SQLEXPRESS`)
**Req 1-4 XONG + verified live** (chi tiết: handoff ERP_DEMO):
- **Master data + tables** trong LegacyErp_Demo: Country 9, Currency 7, Stores 3, Vendors 3, **Transactions 3 + Invoices 2** (tôi tạo, script `scratchpad/erp-foundation.sql`).
- **3 form** (Published :5125, dựng deterministic — UPDATE MF_Forms qua SqlClient): **Store**(form 7), **Vendor**(9), **Transaction**(10). SQL dropdown `connectionKey:"CustomerErp"` + `databaseInsert`→bảng. ✅Verified dropdown nạp sống từ CustomerErp qua `/api/MegaForm/Field/Options`.
- **🔴 CÒN**: verify submit→ghi bảng thật (⚠️anti-spam curl→UI/Playwright); **Invoice tự sinh** (workflow Approval→invoiced + Print A4, hoặc Database node INSERT Invoices; ⭐WorkflowJson cần `StartNodeId`); **Dashboard + 6 report** (DataRepeater masterQuery trên CustomerErp: Country-wise GROUP BY, Currency-wise, summary+invoice status).

## 4. SOURCE PICKER (feature owner giao) — increment 1 SHIPPED, còn increment 2
✅ **Submission dashboard toggle JSON⇄SQL** chạy trên :5125: `Source: Submissions | SQL table`. SQL mode đọc bảng mirror
(`CustomTableRows`), normalize row→`{dataJson}`, **tự hiện cột SQL** (fix `d043655`: cột từ DB column names không phải form
field keys; bucket `:sql` riêng) + **nhớ source per form** (`08da943`, localStorage `mf-subs-source-v1`).
- 🟡 **CÒN**: click-through QA đầy đủ (kẹt selector login Oqtane Playwright — harness, không phải feature; **owner tự test được**).
- **Increment 2**: (a) **report dashboard toggle** (`submission-report.ts:317`); (b) **disable row-open/status/delete trong SQL mode** (submissionId là synthetic NEGATIVE); (c) detection ẩn toggle khi form không có databaseInsert; (d) **4-platform twin** (Web/DNN/Umbraco). Design đầy đủ: workflow `wf_4848953e-087` output.
- ⚠️Design gốc theo **ATBE Bind** (ExternalSubmissionRepository decorator + AsyncLocal `ExternalSourceContext`) — dùng khi form ATBE-bound; demo tôi dùng **databaseInsert** nên chọn đường CustomTableRows. Nếu làm feature đầy đủ cho ATBE forms → theo design ATBE (decorator chỉ đăng ký Oqtane — twin gap).

## 5. VERIFY AUDIT `Docs/OQTANE_DASHBOARD_REPORTS_SQL_AUDIT_2026-07-11.md` (workflow `wf_2754ad8d-690`)
Audit **chính xác mô tả** (8 CONFIRMED, 1 PARTIAL, 0 bịa) nhưng **overstate severity**. Điểm chốt:
- 🔴 **P1 ĐÃ VÁ** (`63e87d7`): `Workflow/CanvasView` ẩn danh rò dữ liệu (ngoài scope audit).
- 🟠 **queryKey preset >250 dòng mất dữ liệu** (correctness, audit gán nhầm "memory"; số 5000 đã chết vì SubmissionQueryService clamp 250): preset list-view (public-posts/blog-archive) trên form >250 sub chỉ thấy 250 dòng đầu, TotalCount sai, trang 2+ vỡ. **CHƯA fix** → đẩy WHERE+ORDER BY xuống SQL, GIỮ per-row `CanViewSubmissionRow`.
- 🟡 **WorkflowCanvas unbounded `ToList()`** → GROUP BY (memory, admin sau khi vá auth). **CHƯA fix**.
- 🟡 GetFormStats 6 Count→1 aggregate (⭐KHÔNG cache trên submit path — concurrency vượt MaxSubmissions). Dashboard N+1 (chạy 2 lần/render). DataJson search non-sargable (paged, thấp).
- ✅ Đã fix/không cần: FormsOverview GROUP BY (port Web/Umbraco 07-15), Completion 50-sample, External ApproxRows.
- **Hướng audit ĐÚNG** kèm 2 guardrail: (1) đừng cache formstats submit path; (2) aggregate endpoint phải re-apply per-row auth nếu không N+1-authed→IDOR (bẫy CanvasView vừa dính).

## 6. VIỆC PHIÊN SAU (ưu tiên)
1. 🟠 **Fix queryKey >250 data-loss** (correctness, đẩy WHERE+ORDER BY xuống SQL, giữ RLS).
2. 🟢 **Hoàn tất ERP demo**: verify submit→ghi bảng · Invoice workflow · Dashboard+6 report.
3. 🟢 **Source-picker increment 2** (report toggle + disable row-action SQL + 4-twin) + tách CustomTableRows khỏi Codex để commit.
4. 🟡 WorkflowCanvas GROUP BY (memory) + Web plain-`[Authorize]`→EditModule (siết).
5. 🟡 **bounded-read follow-up** (từ handoff kia): DataRepeater ExecuteSql real-pagination · Reports Backfill keyset · ListForms(pageSize:0).
6. 🟡 **DocFx DNN + GIF** (paused: ffmpeg stripped không nuốt PNG-sequence — recorder-lib `scratchpad/recorder-lib.mjs` đã có `shotsToGif` nhưng ffmpeg lỗi scale PNG-seq; cần thử `-vf` khác hoặc lanczos/pad); rà SDK doc (drafts `scratchpad/sdkdocs/`) — **SDK/razor demo track owner giao AI KHÁC làm**.
7. Pack lại DNN (mọi fix DNN là hot-swap).

## 7. Bẫy đắt phát hiện phiên này
- ⭐sqlcmd `-i` lỗi → Invoke-Sqlcmd/SqlClient.
- ⭐Oqtane site: DLL ở root, Packages ở root, TFM net10; deploy Server cần **cả Shared DLL** (AssetVersion nằm ở Shared) mới đổi `?v=`.
- ⭐URL AiTools Oqtane = `/api/AiTools/` không phải `/api/MegaForm/AiTools/`.
- ⭐Grid submission source-agnostic khi row có `dataJson` string; nhưng cột suy từ **form field keys** (single form) ≠ **SQL column names** → phải ép union branch + bucket `:sql`.
- ⭐MegaFormController Oqtane auth **per-action** (class chỉ Route+IgnoreAntiforgery) → action thiếu `[Authorize]` = ẩn danh (đã dính CanvasView).
- ⭐"CustomerErp" = connection KEY, DB thật = LegacyErp_Demo.
