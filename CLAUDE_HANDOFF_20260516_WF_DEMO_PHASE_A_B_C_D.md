# Claude Handoff — Workflow demo Phase A → D (2026-05-16)

Tiếp theo handoff cascading SQL. Tập trung vào 4 vấn đề anh nêu về workflow / BPMN:
1. Roles trong workflow settings là placeholder hard-code → **FIXED (Pha A)**
2. Sample workflows chỉ 3 roles, quá mỏng cho demo thực tế → **FIXED (Pha B)** — thêm 7-step / 5-role Purchase Order Approval
3. BPMN canvas không hiện role/user gán cho mỗi step → **FIXED (Pha A)**
4. Dashboard chưa dùng workflow làm SoT để render visually → **FIXED (Pha C)** — view canvas dashboard mới
5. Document Exchange UI không customize HTML được → **infrastructure đã có (Pha D)** — chỉ cần admin populate

Cài đặt trên Oqtane `http://localhost:5050/` (host / abc@ABC1024).

## Pha A — Real role picker + Canvas role badge

| File | Thay đổi |
|---|---|
| [MegaForm.UI/src/builder/workflow/wf-principal-picker.ts](MegaForm.UI/src/builder/workflow/wf-principal-picker.ts) | NEW. Chip-style multi-select cho role/user, fetch từ `Permissions/Catalog` (cùng endpoint DNN + Oqtane), fallback freetext khi API lỗi. Badge `WFPrincipalPicker v20260516-05`. |
| [MegaForm.UI/src/builder/workflow/wf-approval.ts](MegaForm.UI/src/builder/workflow/wf-approval.ts) | Approval panel dùng picker thay textarea cho `Candidate roles` + `Candidate users`. |
| [MegaForm.UI/src/builder/workflow/index.ts:1234](MegaForm.UI/src/builder/workflow/index.ts#L1234) | Bridge truyền `formId` vào renderApprovalConfig. |
| [MegaForm.UI/src/builder/workflow/wf-components.ts:18-91](MegaForm.UI/src/builder/workflow/wf-components.ts#L18-L91) | Canvas Approval node render chip role tím / chip user xanh / cảnh báo `⚠ no role` / slot `⏳ N pending` (sẵn cho Pha C inject runtime stats). |

**Build + deploy**: `npm run build:workflow` → bundle 222 KB → sync DNN + Oqtane.

## Pha B — Purchase Order starter (7-step / 5-role)

| File | Thay đổi |
|---|---|
| [MegaForm.Oqtane.Server/Services/PurchaseOrderStarterService.cs](MegaForm.Oqtane.Server/Services/PurchaseOrderStarterService.cs) | NEW. Lite starter (~280 lines) tạo form `Purchase Order Approval (Sample)` + workflow 7 nodes + 5 sample submissions ở các stage khác nhau. Badge `PurchaseOrderStarterLite v20260516-07`. |
| [MegaForm.Oqtane.Server/Services/Startup.cs:57](MegaForm.Oqtane.Server/Services/Startup.cs#L57) | DI registration. |
| [MegaForm.Oqtane.Server/Controllers/MegaFormController.cs](MegaForm.Oqtane.Server/Controllers/MegaFormController.cs) | Inject `PurchaseOrderStarterService` + `IDbContextFactory<MegaFormDbContext>`. |
| [MegaForm.Oqtane.Server/Controllers/MegaFormController.PurchaseOrderAndCanvas.cs](MegaForm.Oqtane.Server/Controllers/MegaFormController.PurchaseOrderAndCanvas.cs) | NEW partial. Endpoint `POST /api/megaform/Starter/PurchaseOrder/Setup` + Pha C endpoint. Badge `PoStarter + WorkflowCanvasView v20260516-08`. |

**Workflow shape:**
```
Start (Submit)
   ↓
Department Head Review (role: Department Heads)
   ↓ approved
Procurement Check (role: Procurement Officers)
   ↓ approved
Amount Gate (condition: amount > 50,000)
   ↓ true (high)              ↓ false (≤50K)
CFO Sign-off (role: CFO)   Finance Approval (role: Finance Analysts)
   ↓ approved                ↓ approved
Notify Vendor (SendEmail)
   ↓
End (Approved)
```
- 5 roles: `PO Requesters`, `Department Heads`, `Procurement Officers`, `Finance Analysts`, `CFO`
- 5 sample submissions: 2 ở CFO (Alice $84,500 IT laptops; Eva $132K Salesforce), 1 ở Finance (Brian $24K AdRoll), 1 ở Procurement (Catherine $1,850 office supplies), 1 ở Dept Head (Dao $67,800 Workday)

## Pha C — Workflow canvas dashboard (single source of truth)

| File | Thay đổi |
|---|---|
| [MegaForm.Oqtane.Server/Controllers/MegaFormController.PurchaseOrderAndCanvas.cs](MegaForm.Oqtane.Server/Controllers/MegaFormController.PurchaseOrderAndCanvas.cs) | Endpoint `GET /api/megaform/Workflow/CanvasView?formId=N` trả về workflow definition + per-node `runtimeStats: {pendingCount, claimedCount, completedCount}` + list 50 pending tasks gần nhất kèm role/user. |
| [E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\wwwroot\Modules\MegaForm\workflow-canvas.html](http://localhost:5050/Modules/MegaForm/workflow-canvas.html) | NEW. Frontend dashboard dùng React + ReactFlow đã có trong bundle: render BPMN read-only, mỗi node hiển thị role chips + ⏳ pending count overlay; side-panel list pending tasks click để mở submission detail. Badge `WorkflowCanvas v20260516-08`. |

**URL test:** `http://localhost:5050/Modules/MegaForm/workflow-canvas.html?formId=<id>`

## Pha D — HTML customization cho starter views

**Trạng thái:** Infrastructure ĐÃ có sẵn từ trước, không cần migration mới:
- Schema: `MF_FormViews.CustomHtml NVARCHAR(MAX) NULL` (từ migration `01050202_AddWorkflowRuntime`)
- Model: `FormViewInfo.CustomHtml` (Phase2Models.cs line 61)
- Builder UI: View Designer đã có tab Custom HTML
- Renderer: 19 file trong MegaForm.UI/src reference `customHtml` đã wire

Admin chỉ cần vào **Builder → Views tab → chọn view → tab Custom HTML** để paste template. Token syntax `{{field.fieldKey}}` thay vì hard-code.

**Document Exchange ship sample HTML:** Cần update `DocumentExchangeStarterService.cs` để populate `CustomHtml` cho 1 view (e.g. `document-card`) khi `EnsureStarter` chạy. Em đã skip phase này trong session để dồn time vào A/B/C — anh có thể request riêng nếu muốn em làm.

## Cách test (anh khi quay lại)

1. Mở **setup page**: `http://localhost:5050/Modules/MegaForm/workflow-demo-setup.html`
2. Click nút xanh **⚡ Seed Purchase Order Starter** — form được tạo, response hiện `formId` mới.
3. Click **→ Open builder for FormId N** — vào Builder → tab Workflow → thấy 7-node canvas với role chips tím trên mỗi Approval node (Pha A working).
4. Click 1 Approval node → bên phải hiện picker chip thay textarea, dropdown list role thật của site (Pha A picker working).
5. Click **→ Open canvas dashboard for FormId N** — render BPMN read-only kèm overlay ⏳ pending counts + side-panel 5 pending tasks click để mở submission detail (Pha C working).

## Endpoints mới

| Method | URL | Mô tả |
|---|---|---|
| POST | `/api/megaform/Starter/PurchaseOrder/Setup` | Seed PO starter (idempotent). Auth: admin |
| GET | `/api/megaform/Workflow/CanvasView?formId=N` | Workflow def + per-node runtime stats + pending tasks |

## Build/deploy summary

Oqtane DLLs đã deploy + server đã restart:
- `MegaForm.Core.dll` (today)
- `MegaForm.Oqtane.Shared.Oqtane.dll`
- `MegaForm.Oqtane.Server.Oqtane.dll`
- JS bundle `megaform-workflow-reactflow.js` (Pha A code) đã sync cả DNN + Oqtane

Phase C canvas frontend files cũng đã drop vào `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\wwwroot\Modules\MegaForm\`:
- `workflow-canvas.html`
- `workflow-demo-setup.html`

## Open items / next session

1. **DNN parity**: Pha B + C endpoints chỉ thêm cho Oqtane controller. DNN tương đương cần add ở `MegaForm.DNN/WebApi/MegaFormApiController.cs`.
2. **Document Exchange sample CustomHtml**: Update starter service để ship sample template cho 1 view, demo cho admin.
3. **Permissions seed**: PO starter không tự tạo user — admin tạo manually trong Oqtane Admin với 5 role names khớp (`PO Requesters / Department Heads / Procurement Officers / Finance Analysts / CFO`).
4. **Package 01.06.18 ZIP**: Chưa build DNN install zip với các thay đổi này. Khi cần ship, chạy `BuildPackage-DNN.ps1 -BuildTS -BuildDotNet` từ root để tạo `MegaForm_01.06.18_Install.zip` (sau khi bump version trong manifest + script).
