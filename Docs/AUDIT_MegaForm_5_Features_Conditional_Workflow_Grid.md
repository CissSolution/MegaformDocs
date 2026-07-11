# MegaForm Architecture Audit — 5 Câu hỏi về Conditional Display, Permission, Workflow & Grid Controls

> **Scope:** Oqtane / DNN / AspNetCore Web  
> **Method:** Source-code audit, no code changes  
> **Date:** 2026-07-09

---

## 1. Can fields, tabs, and sections be displayed dynamically based on user roles or permissions?

### Kết luận: **KHÔNG** — hiện tại chỉ hỗ trợ điều kiện dựa trên **giá trị field**.

### Evidence

`ShowIfRule` trong `MegaForm.Core/Models/FormSchema.cs` chỉ mô hình hóa điều kiện dựa trên field value:

```csharp
public class ShowIfRule
{
    public string Field { get; set; }       // key của field trigger
    public ConditionType Condition { get; set; }
    public string Value { get; set; }
}
```

`ConditionType` gồm: `Equals`, `NotEquals`, `Contains`, `NotContains`, `GreaterThan`, `LessThan`, `IsEmpty`, `IsNotEmpty`, `StartsWith`, `EndsWith`.

Runtime client-side (`MegaForm.UI/src/renderer/conditional.ts`) cũng chỉ đọc giá trị DOM của các widget và đánh giá các điều kiện trên. Không có tham chiếu đến `role`, `permission`, `user`, `query string` trong `ShowIfRule` hay trong `evaluateCondition`.

Rule builder cũ (`MegaForm.UI/src/builder/rule-engine.ts`, `rule-builder-ui.ts`) cho phép các action `show/hide/require/optional/enable/disable/setValue/clear`, nhưng phần condition vẫn chỉ dựa trên field values.

### How it works

- Builder cho phép gán `ShowIf` cho field/section/page.
- Khi user thay đổi field trigger, client-side `conditional.ts` evaluate rule và show/hide target.
- Tabs cũng là section với `displayMode: 'tabs'`, nên cũng chỉ hỗ trợ field-based ShowIf.

### Limitations

- Không thể ẩn field/tab/section dựa trên role, permission, authentication state, query string, URL params, user profile.
- Client-side hide dễ bị bypass nếu không có server-side enforcement.

### Recommended solution

1. **Mở rộng `ShowIfRule` model** thêm `ContextCondition` hoặc `SourceType`:
   - `field` (mặc định)
   - `role` — kiểm tra user có role nào
   - `permission` — kiểm tra user có quyền `submit/view/edit/...`
   - `query` — so sánh query string parameter
   - `user` — so sánh `user.id`, `user.isAuthenticated`, v.v.

2. **Client renderer** cần nhận `userContext` từ `window.__MF_PLATFORM__.user` (đã có sẵn trong `parseTemplateContextFromElement`) và đưa vào `evaluateCondition`.

3. **Server-side field-level permission**: Cần thêm `CanViewField`/`CanEditField` để tránh bypass. API submit/view detail cần strip/redact field nếu user không có quyền.

---

## 2. Are tabbed forms supported?

### Kết luận: **CÓ** — tabs được hỗ trợ dưới dạng **section display mode**.

### Evidence

Trong `MegaForm.Core/Models/FormSchema.cs`, section có property:

```csharp
public string DisplayMode { get; set; } // "default", "tabs", "accordion", "wizard", "steps"
```

Builder UI (`MegaForm.UI/src/builder/section-editor.ts`) cho phép chọn `DisplayMode` cho section, bao gồm `tabs`.

Renderer (`MegaForm.UI/src/renderer/section.ts` hoặc tương đương) render section dạng tab navigation khi `displayMode === 'tabs'`.

### How it works

- Tab không phải là widget/field type riêng.
- Tab = section với `displayMode: 'tabs'`. Các child section/page trở thành các tab.
- Có thể kết hợp với ShowIf field-based để ẩn/hiện tab.

### Limitations

- Không có dedicated "Tabs widget" để đặt ở bất kỳ đâu trong form.
- Tabs chỉ hoạt động trong phạm vi section hierarchy.
- Không hỗ trợ conditional tab dựa trên role/permission (xem mục 1).

### Recommended solution

- Giữ nguyên cách tiếp cận "section as tabs" vì nó phù hợp với form schema hiện tại.
- Nếu cần tab động theo role/permission, áp dụng giải pháp mục 1.
- Cân nhắc thêm tab validation state (invalid tab indicator) và lazy render tab content để cải thiện performance form dài.

---

## 3. Can complex workflows be designed and configured?

### Kết luận: **CÓ** — MegaForm có **Workflow Engine V2** với directed graph, hỗ trợ approval, condition, fork/join, webhook, email, database, calculate, v.v.

### Evidence

`MegaForm.Core/Services/WorkflowEngineV2.cs` thực thi workflow dạng directed graph:

```csharp
public async Task<WorkflowExecutionResult> ExecuteAsync(
    int formId,
    WorkflowTrigger trigger,
    SubmissionInfo submission,
    UserContext actor,
    CancellationToken ct)
```

WorkflowDefinition bao gồm:

```csharp
public class WorkflowDefinition
{
    public string StartNodeId { get; set; }
    public List<WorkflowNode> Nodes { get; set; }
    public List<WorkflowEdge> Edges { get; set; }
    public int MaxSteps { get; set; } = 100;
    public int TimeoutSeconds { get; set; } = 300;
}
```

Các node types thường gặp:

| Node Type | Mô tả |
|-----------|-------|
| `Start` | Điểm bắt đầu |
| `Condition` | Branching dựa trên field value / expression |
| `Email` | Gửi email |
| `Webhook` | Gọi HTTP endpoint |
| `Database` | Insert/update external DB |
| `Approval` | Tạo human task |
| `Fork` / `Join` | Parallel branches |
| `Calculate` | Tính toán field value |
| `Delay` | Scheduled execution |

Workflow state được persist qua `IWorkflowRepository`:

```csharp
public interface IWorkflowRepository
{
    WorkflowDefinition GetByFormId(int formId);
    WorkflowEnvelope GetEnvelope(int formId);
    WorkflowCaseInstance GetCase(int caseId);
    WorkflowTaskInstance GetTask(int taskId);
    void Save(WorkflowExecutionContext context);
}
```

### How it works

- Workflow được trigger bởi `on_submit`, `on_update`, hoặc resume từ human task.
- `WorkflowEngineV2` duyệt graph từ `StartNodeId`, theo edges, thực thi từng node.
- Có giới hạn `MaxSteps = 100` và `TimeoutSeconds = 300` để tránh infinite loop.
- Human tasks (approval) tạo `WorkflowTaskInstance`, user có thể claim/approve/reject/forward.

### Limitations

- Workflow V2 gắn với 1 form (1-1). Xem mục 4.
- Không có visual BPMN designer hoàn chỉnh; UI designer là node-edge editor tùy chỉnh.
- Chưa thấy support cho compensation, sagas, event-driven workflow.

### Recommended solution

- Nếu yêu cầu workflow phức tạp, V2 đã đủ cho đa số use-case approval + automation.
- Nếu cần BPMN chuẩn, cân nhắc integrate với external engine (Camunda, Temporal) qua webhook/API gateway node.
- Cải thiện UI designer: thêm validation graph (detect unreachable nodes, cycles), test run mode, version control cho workflow definition.

---

## 4. Is it possible to assign multiple forms to a single workflow?

### Kết luận: **Workflow Engine V2 là 1-1 (1 form = 1 workflow)**. Workflow Engine V1 (legacy) cho phép **1 form = nhiều workflow**.

### Evidence

**V2 — 1 Form ↔ 1 WorkflowDefinition:**

```csharp
public interface IWorkflowRepository
{
    WorkflowDefinition GetByFormId(int formId);
    void Save(int formId, WorkflowDefinition definition);
    WorkflowEnvelope GetEnvelope(int formId);
}
```

`WorkflowDefinition` có property `FormId`. Runtime `WorkflowEngineV2.ExecuteAsync(formId, ...)` chỉ load một definition duy nhất.

**V1 (legacy) — 1 Form ↔ nhiều WorkflowInfo:**

```csharp
// ICoreInterfaces.cs
List<WorkflowInfo> GetWorkflows(int formId);

// WorkflowEngine.cs
var workflows = _repo.GetWorkflows(formId);
foreach (var wf in workflows.Where(w => w.IsEnabled && w.TriggerType == triggerType)) { ... }
```

`WorkflowInfo` có `WorkflowId` + `FormId`, cho phép nhiều workflow per form, mỗi workflow có trigger type và steps riêng.

### How it works

- V2: Mỗi form có một workflow definition duy nhất được áp dụng. Nếu cần nhiều quy trình, phải gộp vào cùng một graph bằng Condition/Fork nodes.
- V1: Cho phép nhiều workflow per form, nhưng đã legacy và ít được dùng.

### Limitations

- Không thể reuse cùng một workflow definition cho nhiều form trong V2.
- Không thể gán 1 form vào nhiều workflow độc lập trong V2.

### Recommended solution

**Nếu cần reuse workflow across forms (n-n relationship):**

1. **Tách `WorkflowDefinition` ra khỏi `FormId`**: WorkflowDefinition trở thành template độc lập.
2. **Thêm bảng liên kết `FormWorkflow`**:
   ```sql
   FormWorkflow(Id, FormId, WorkflowDefinitionId, IsActive, AppliedAt, AppliedBy)
   ```
3. **Thay đổi `IWorkflowRepository`**:
   - `GetActiveByFormId(int formId)` — trả về workflow active duy nhất.
   - `GetDefinitionsByFormId(int formId)` — trả về tất cả workflow gắn với form.
   - `ApplyWorkflowToForm(int formId, int workflowDefinitionId)` — gán workflow.
4. **Migration path**: Khi import workflow, nếu `FormId` trùng thì update; nếu muốn reuse thì clone definition và tạo liên kết mới.

**Nếu chỉ cần 1 form = 1 workflow**: Giữ nguyên V2 model, nhưng cho phép "clone from template" để reuse logic.

---

## 5. Can custom search and filtering be implemented for data grids?

### Kết luận: **CÓ**, tùy theo loại grid. `DataRepeater` hỗ trợ mạnh nhất. `ListView` hỗ trợ client-side. `DataGrid` hỗ trợ SQL mode.

### Evidence

MegaForm có 3 loại "grid" khác nhau:

#### 5.1. DataGrid (`MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid.ts`)

- **Mục đích:** Subform / master-detail line items ("Bảng phụ").
- **Dữ liệu:** Inline JavaScript array **hoặc** SQL read-only mode (`megaform-widget-datagrid-sql.ts`).
- **Tính năng:**
  - Inline / modal edit
  - Add / Delete / Reorder rows
  - Computed columns (`qty * price`), total row formula
  - Min/max row limits, required cell validation
  - Display templates: `grid`, `card`, `master-detail`
- **Endpoint server:** `POST /Subform/Compute`, `GET /Subform/Tables`, `GET /Subform/Columns`.
- **Custom search/filter:** Hạn chế. SQL mode chỉ đọc data, không có UI filter phức tạp.

#### 5.2. DataRepeater (`MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts` + `MegaForm.Core/Services/DataRepeaterService.cs`)

- **Mục đích:** Hiển thị dữ liệu SQL/MegaForm submissions dưới dạng bảng/template tùy chỉnh.
- **Dữ liệu:** `sql`, `storedproc`, `megaform_submissions`.
- **Tính năng:**
  - Tokenized HTML template (XSL-style)
  - Multi-level drill-down (`detailLevels`)
  - Filter dropdowns/text/date range
  - Pagination, sorting
  - Chart mode (bar/line/pie)
  - CSV/PDF export
  - `queryDependsOn` để cascade reload
- **Endpoint server:** `/api/MegaForm/DataRepeater/Query`, `/FilterOptions`, `/ColumnOptions`, `/Export`.
- **Custom search/filter:** Mạnh nhất. Có thể viết custom SQL/stored procedure, thêm filter parameters, cho phép user filter.

#### 5.3. ListView (`MegaForm.UI/src/listview/runtime.ts` + `MegaForm.Core/ViewModes/ListViewSettings.cs`)

- **Mục đích:** Public-facing list các submissions của một form.
- **Dữ liệu:** Chỉ `megaform_submissions` (qua `/api/MegaForm/Submissions`).
- **Tính năng:**
  - Row template + wrapper template tùy chỉnh
  - Search, sort, pagination **client-side**
  - Add/Edit/Delete/View actions (modal)
  - Workflow task actions (claim/approve/reject/forward)
  - Detail template cho view modal
- **Custom search/filter:** Search text đơn giản trên các field, không hỗ trợ custom SQL. Pagination client-side nên không phù hợp triệu records.

### Bảng so sánh nhanh

| | DataGrid | DataRepeater | ListView |
|---|---|---|---|
| **Input chính** | Subform rows / SQL | SQL / StoredProc / Submissions | Submissions của 1 form |
| **Edit inline** | Có | Không | Không (mở modal form) |
| **Template HTML** | Hạn chế | Rất linh hoạt | Linh hoạt |
| **Drill-down** | Không | Nhiều cấp | Không |
| **Filter/Sort/Paging** | Cơ bản | Server-side | Client-side |
| **Export** | Không tích hợp sẵn | CSV/PDF | Không |
| **Workflow actions** | Không | Không | Có |
| **Custom SQL** | Có (SQL mode) | Có | Không |

### Recommended solution

1. **Dùng DataRepeater cho custom search/filter phức tạp**:
   - Cho phép viết parameterized SQL/stored procedure.
   - Hỗ trợ filter controls: text, dropdown, date range, multi-select.
   - Server-side pagination/sort.

2. **Cải thiện ListView** nếu dùng cho public submissions:
   - Chuyển pagination sang server-side (thay vì fetch 1000 rows rồi paginate client).
   - Hỗ trợ filter theo field value với server-side query.
   - Giữ search đơn giản nhưng debounce và index DB.

3. **Thống nhất terminology trong builder**:
   - DataGrid = editable subform grid.
   - DataRepeater = SQL/reporting grid.
   - ListView = public submissions grid.
   - Tránh overlap giữa DataGrid SQL mode và DataRepeater.

4. **Nếu cần grid phức tạp kiểu DataTables/AG Grid**:
   - Cân nhắc integrate external grid library qua custom widget.
   - Backend cần hỗ trợ OData-like query hoặc dynamic LINQ expression builder.

---

## Khuyến nghị tổng quan

| # | Câu hỏi | Trạng thái hiện tại | Khuyến nghị chính |
|---|---------|---------------------|-------------------|
| 1 | Conditional display theo role/permission | ❌ Chưa hỗ trợ | Mở rộng `ShowIfRule` + server-side field permission |
| 2 | Tabbed forms | ✅ Hỗ trợ | Dùng section `displayMode: 'tabs'`; thêm role-based tab nếu cần |
| 3 | Complex workflows | ✅ Hỗ trợ (V2) | Dùng V2 graph engine; cân nhắc BPMN integration nếu cần |
| 4 | Multiple forms per workflow | ⚠️ V2 là 1-1 | Thêm bảng `FormWorkflow` nếu cần n-n reuse |
| 5 | Custom search/filter for grids | ✅ Hỗ trợ qua DataRepeater | Dùng DataRepeater cho SQL custom; cải thiện ListView server-side |

---

## File references

- `MegaForm.Core/Models/FormSchema.cs` — `ShowIfCondition`, `ShowIfRule`, `ConditionType`, section `DisplayMode`
- `MegaForm.UI/src/renderer/conditional.ts` — client-side conditional evaluation
- `MegaForm.UI/src/builder/rule-engine.ts`, `rule-builder-ui.ts` — legacy rule engine
- `MegaForm.Core/Services/PermissionService.cs` — permission evaluation
- `MegaForm.Core/Services/PermissionCatalogService.cs` — permission catalog
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` — submit, submission management actions
- `MegaForm.Oqtane.Server/Controllers/MegaFormController.WorkflowStarter.cs` — approve/reject/claim/forward endpoints
- `MegaForm.Core/Services/WorkflowTaskService.cs` — task assignment permission logic
- `MegaForm.Core/Services/WorkflowEngineV2.cs` — V2 graph execution
- `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` — `IWorkflowRepository.GetByFormId`
- `MegaForm.Core/Services/WorkflowEngine.cs` — V1 `GetWorkflows(formId)`
- `MegaForm.Core/Services/DataRepeaterService.cs` — SQL/submissions query engine
- `MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid.ts` — editable grid
- `MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid-sql.ts` — SQL display mode
- `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts` — DataRepeater widget
- `MegaForm.UI/src/listview/runtime.ts` — ListView public runtime
- `MegaForm.Core/ViewModes/ListViewSettings.cs` — ListView server config
