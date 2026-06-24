# HANDOFF — Public Submissions List View (SDK data-source + widget host)

**Date:** 2026-06-14
**Repo root:** `e:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um`
**Platforms:** Oqtane (Blazor, net8+) **and** DNN (net472, via Oqtane companion for Razor only)

## TL;DR

Build a **public, CMS-style list view of a form's submissions**, generic for any `formId`, on BOTH Oqtane and DNN. The data layer is the **standard SDK** (`IMegaFormClient.Submissions.FindAsync` → typed `SubmissionDto`, paged). The host shell is a **widget placed inside an empty form** (reuse DataRepeater + Razor widgets + the Unified Designer); we add a new `dataSource="megaform_submissions"` branch that bypasses SQL and reads submissions through the SDK. Public exposure is gated by an **admin-chosen field whitelist** (default hidden) + **status="published"** enforced **server-side**. Two widgets are supported: **DataRepeater** (token template, default/low-code) and **Razor** (C#, advanced).

**WARNING — three verdicts below are PARTIAL/REFUTED and MUST be fixed in GĐ0/GĐ1 before relying on the SDK:** (a) `FindAsync` does NOT scope by portal or user — no tenant/RLS isolation; (b) the Oqtane DataRepeater endpoint is *effectively anonymous but NOT decorated `[AllowAnonymous]`*, and applies no RLS for you; (c) the "AI authors SQL" seam does not exist — SQL is authored *deterministically* by the Data tab, and AI KB scoping is enforced **server-side**, not client-side. See §9.

---

## 0. STATUS 2026-06-14 — BUILT + LIVE-PROVEN on Oqtane (autonomous run)

**DONE + live-proven** (anonymous, real Playwright screenshot `tmp-qa/listview-oqtane-final.png`; live at `http://localhost:5000/test-template-page/aurora-style-consultation`, module 50 → host form 59 → lists form 56's 16 submissions; `email` + `phone` HIDDEN by whitelist; `GET /api/MegaForm/DataRepeater/Query?formId=59&widgetKey=results` → 200, 16 rows, no PII):

- **GĐ0/GĐ1 server** — `DataRepeaterService.ExecuteMegaformSubmissionsQuery` (new branch on `DataSource=="megaform_submissions"`). **Key adaptation vs this handoff:** Core CANNOT reference MegaForm.Sdk (circular — Sdk→Core), so the branch uses `ISubmissionRepository.List(...)` directly = the SAME call `IMegaFormClient.Submissions.FindAsync` makes. Config props added to `DataRepeaterModels.cs` (`SubmissionsFormId`/`StatusFilter`/`FieldWhitelist`/`FieldWhitelistCsv`, `DataRepeaterColumn.Label`). DI: `MegaFormController` 4 DataRepeater sites + DNN `DataRepeaterApiController.BuildService` pass the submission repo.
- **TENANT GUARD** = strict host-form-PortalId == target-form-PortalId (host form = `request.FormId`; NO portalId threading needed). **Negative test PROVEN:** cross-portal → "Cross-tenant access denied". (Review caught the original `!=0` wildcard fail-open — DNN default portal IS 0 — now strict equality.)
- **GĐ3 SSR fix (blocker F)** — `FormHtmlRenderer.ContainsHydrationWidget` + `Index.razor TryBuildSsrFormHtml` early-return → widget-only form skips SSR hydrate → JS full rebuild → widget paints.
- **Bonus fix** — `megaform-widget-data-repeater.ts getApiBase()` crashed on Oqtane (`window.$.ServicesFramework` of undefined); rewritten robust. **Root bug also in shared `types.js` MFUtil.getApiBase (affects ALL plugins on Oqtane) — not fixed at source.**
- **Review fixes applied** (9-agent adversarial review): tenant strict-equality, `if (s.IsSpam) continue` (never expose spam), server-side row cap, ExportCsv friendly-label header.
- **GĐ2 partial** — dataSource option + config fields wired into the plugin `properties` array + CSV-whitelist server tolerance. **REMAINING:** the DataRepeater builder uses the unified-shell ADAPTER (5 sub-tabs) — a "Form Submissions" tab there is the no-JSON config work; `PreviewSubmissions` endpoint + KB seed migration also remaining.

**NOT done:** GĐ3 Razor variant; DNN live QA (DNN site not running in this env — code is wired). **Revert the test fixture when done:** module 50 Setting FormId/MegaForm:FormId → 20; delete `MF_Forms` 59. See memory `project-listview-via-sdk-build`.

---

## 1. Bối cảnh & vì sao

### Vấn đề với listview hiện tại (in-form MFListView)
- Fragile: ba cache phải đồng bộ (MF_Views + Setting catalog snapshot + runtime branch); inline-save xóa template; thiếu designer; anonymous cache staleness.
- Đọc thẳng SQL/JSON trên submission store là non-standard và vỡ theo DB provider.

### Tại sao chọn SDK + widget
- `IMegaFormClient.Submissions.FindAsync` đã **live-proven** (SdkDemoView), typed (`SubmissionDto`), paged, cross-platform (net472 + net8/9/10), contract-tested.
- Widget host tái dùng renderer + AI designer sẵn có; **không** cần ModuleDefinition mới, **không** cần Surface Role mới.

### 5 quyết định đã chốt (FIXED — không bàn lại)
1. Public fields = **ADMIN-CHOSEN WHITELIST** (default hidden — privacy).
2. AI designer tạo **PRESENTATION TEMPLATE** trên `SubmissionDto` + field keys, **KHÔNG** phải SQL.
3. Host shell = **WIDGET trong một FORM RỖNG** (reuse widget + AI designer; chỉ đổi data source sang SDK; render qua form renderer — **NO** new ModuleDefinition, **NO** Surface Role).
4. Hỗ trợ **CẢ HAI** widget — **DataRepeater** (token template, low-code, default) và **Razor** (C#, advanced) — nối SDK source vào cả hai.
5. **Generic theo formId.**

### Cơ chế kỹ thuật chính
Thêm `dataSource="megaform_submissions"` vào widget config. Server **branch** sang `IMegaFormClient.Submissions.FindAsync` (scope anonymous `UserId=0`) thay vì chạy SQL.
`widgetProps = { formId, statusFilter:"published", fieldWhitelist:[...], pageSize, sort }`.
Server **enforce** whitelist (chỉ key trong whitelist rời server) và `status=published`. Giữ pagination + token/Razor template + AI designer.

---

## 2. Kiến trúc 3 tầng

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TẦNG 3 — DESIGN (build-time, admin)                                       │
│  Unified Designer shell (view-designer/shared/unified-shell.ts)            │
│   • Data tab: form-picker + field WHITELIST (checkbox) + sample-data       │
│   • Host "Templates" tab: presentation template (token {fieldKey} / Razor) │
│   • AI drawer: KB cards scoped surface='submission-template' (server-side)  │
│  → ghi field.widgetProps = { dataSource:'megaform_submissions',            │
│                              formId, fieldWhitelist[], statusFilter,        │
│                              pageSize, sort, masterTemplate }               │
└──────────────────────────────────────────────────────────────────────────┘
                                   │ saved into schema.fields[].widgetProps
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  TẦNG 2 — PRESENTATION (runtime, public page)                              │
│  Form renderer (megaform-renderer.ts) dispatch widget plugin →             │
│   DataRepeater plugin  → mount <div data-mfdr-form> → token template        │
│   Razor plugin         → mount <div data-formid> → server-rendered HTML     │
│  Client gửi CHỈ formId + widgetKey (+ page/sort) — KHÔNG bao giờ gửi data   │
└──────────────────────────────────────────────────────────────────────────┘
                                   │ GET DataRepeater/Query?formId&widgetKey…
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  TẦNG 1 — DATA (server)                                                     │
│  DataRepeaterService.ExecuteQuery                                          │
│   if config.DataSource=="megaform_submissions":                           │
│        ExecuteMegaformSubmissionsQuery(...)  ← NEW                          │
│          → IMegaFormClient.Submissions.FindAsync(                          │
│               {FormId, Status="published", Page, PageSize},                │
│               new MegaFormScope{PortalId=<tenant>, UserId=0})              │
│          → parse SubmissionDto.DataJson → project ONLY whitelisted keys    │
│          → return { Columns:[whitelisted keys], Rows:[object[]] }          │
│   else: existing SQL/storedproc path (IConnectionRegistry, SELECT-guard)   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Request/response flow (public read)
1. Anonymous visitor mở trang form rỗng (chỉ chứa 1 widget field).
2. Renderer paint mount div → plugin `bind(formId)` AJAX `GET <apiBase>DataRepeater/Query?formId=N&widgetKey=K&page=1&pageSize=…`.
3. Controller (Web `DataRepeaterController` / DNN `DataRepeaterApiController` / Oqtane `MegaFormController.DataRepeaterQuery`) → `DataRepeaterService.ExecuteQuery`.
4. Service đọc `widgetProps` từ SchemaJson (server-side), thấy `DataSource=="megaform_submissions"` → gọi SDK → project whitelist → trả `{ Columns, Rows }` (cùng shape như `ExecuteSql`).
5. Plugin render token template/Razor → list page.

---

## 3. Bản đồ code

### DataRepeater — config / service / controllers
| Vai trò | File | Line | Ghi chú |
|---|---|---|---|
| Config class (thêm props) | `MegaForm.Core/Models/DataRepeaterModels.cs` | 61-128 | `DataSource` cmt at **64**; ctor defaults **120-128** (`DataSource="sql"`, `PageSize=50`, `MaxRows=1000`) |
| Branch point (chèn nhánh mới) | `MegaForm.Core/Services/DataRepeaterService.cs` | **66-86** | `if(Level<=0…) sql = DataSource=="storedproc" ? … : MasterQuery` |
| SELECT-guard (phải bypass) | `MegaForm.Core/Services/DataRepeaterService.cs` | 94-99 | `IsDangerousQuery` |
| Exec + conn (phải bypass) | `MegaForm.Core/Services/DataRepeaterService.cs` | 113-122 | `_registry.GetConnection(...)` |
| Row shape contract | `MegaForm.Core/Services/DataRepeaterService.cs` | 420-542 | `ExecuteSql` → `result.Columns: List<DataRepeaterColumn>{Name,DataType}` + `result.Rows: List<object[]>` |
| Schema read (server-only) | `MegaForm.Core/Services/DataRepeaterService.cs` | 343-390 | `ExtractWidgetConfig` → `FindWidgetToken` → `_formRepo.GetForm(formId)` → `JObject.Parse(form.SchemaJson)` |
| Web/Oqtane controller (no SQL param) | `MegaForm.Web/Controllers/DataRepeaterController.cs` | 25-76 | `[Route("api/MegaForm/DataRepeater")]`, `Query`/`FilterOptions`/`Export` đều `[AllowAnonymous]`; ctor `new DataRepeaterService(registry, formRepo)` |
| Oqtane live endpoint (the deployed one) | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | **1136-1167** | `DataRepeaterQuery`: CHỈ `[HttpGet("DataRepeater/Query")]`, **không** `[AllowAnonymous]`; `new DataRepeaterService(_connectionRegistry, _formRepo)` at **1164** |
| DNN mirror controller | `MegaForm.DNN/WebApi/DataRepeaterApiController.cs` | 25-71 | class `[AllowAnonymous]`; `BuildService()` (44-50) `new DnnConnectionRegistry + DnnServiceLocator.Instance.FormRepo` |
| Interfaces | `MegaForm.Core/Interfaces/IWorkflowInterfaces.cs` 307-314 (`IConnectionRegistry`); `MegaForm.Core/Interfaces/ICoreInterfaces.cs` 19 (`IFormRepository.GetForm`), 34-37 (`ISubmissionRepository.List`) | | |

### DataRepeater — client runtime + editor (TypeScript)
| Vai trò | File | Line |
|---|---|---|
| Runtime mount (`data-mfdr-*`) | `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts` | 811-818 |
| `bind()` selector | same | 890-895 |
| Master fetch URL | same | 1152-1168 |
| Token engine (`{col}`,`{if}`,`{#each}`) | same | 256-325, 483-519 |
| `getProps()` flat→array reconstruct | same | 762-805 |
| `dataSource` select (2 options today) | same | 670-755 / 680-684 |
| `autoTemplate` (auto `<table>`) | same | 452-477; invoked 1186-1194 |
| `collect()=null`,`validate()=true`,`register('DataRepeater')` | same | 1661-1682 |
| Unified launcher (persist `field.widgetProps`) | `MegaForm.UI/src/widgets/plugins/megaform-datarepeater-launcher.ts` | 108-143 |
| Config adapter (5 sub-tabs) | `MegaForm.UI/src/widgets/plugins/megaform-datarepeater-adapter.ts` | 186-217 |
| **Q5 guard** `SQL_OWNED_KEYS` (drops `dataSource`!) | same | 62-69; `stripSqlKeys` 143-151 |
| Columns sub-tab (free-text JSON) | same | 266-305 |
| Templates sub-tab (`masterTemplate`) | same | 370-384 |
| Legacy popup (optional parity) | `MegaForm.UI/src/view-designer/datarepeater/editor.ts` | 33-36 (`DATA_SOURCE_OPTIONS`), 416-431, 139-146 |

### Razor widget
| Vai trò | File | Line |
|---|---|---|
| Client data branch (`if useSql && masterQuery`) | `MegaForm.UI/src/widgets/plugins/megaform-widget-razor.ts` | 309-314 |
| `fetchSqlRows` (GET DataRepeater/Query) | same | 129-167 |
| `sendRender` (POST RazorWidget/Render) | same | 260-307 |
| mount div / `validate()=true` | same | 553-567 / 591 |
| Oqtane render endpoint | `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` | 102-198; **SqlRows injection at 179-180** (`paramDict["SqlRows"] = req.SqlRows`) |
| Template base (`[Parameter] IEnumerable<dynamic> SqlRows`) | `MegaForm.Oqtane.Server/RazorWidgets/MfRazorWidgetBase.cs` | 27-41 |
| Row iteration pattern | `MegaForm.Oqtane.Server/RazorWidgets/EditableList.razor` | 57-70, 104-132 |
| DNN proxy (no native render) | `MegaForm.DNN/WebApi/RazorWidgetController.cs` | 1-116 |
| **NOTE — do NOT touch** the subset interpreter | `MegaForm.Core/Templating/MegaFormRazorInterpreter.cs` / `MegaFormRazorAdapter.cs` | — BYOM only; editing it has ZERO effect on the Razor widget |

### SDK data layer
| Vai trò | File | Line |
|---|---|---|
| `FindAsync` (paging real, **scope dropped**) | `MegaForm.Sdk/MegaFormClient.cs` | 117-133 |
| `ResolvePortalId` (presence-check, value discarded) | same | 44-50 |
| `ToDto(SubmissionInfo)` (verbatim DataJson) | same | 203-212 |
| `MegaFormScope{PortalId,UserId}` | `MegaForm.Sdk/Dtos.cs` | 12-19 |
| `SubmissionDto{SubmissionId,FormId,DataJson,Status,SubmittedOnUtc}` | `MegaForm.Sdk/Dtos.cs` | 84-148 (DataJson 93-94) |
| `SubmissionQuery{FormId,Status,Page,PageSize}` | `MegaForm.Sdk/Dtos.cs` | 110-123 |
| `FindAsync` signature | `MegaForm.Sdk/IMegaFormClient.cs` | 52-53 |
| DataJson build (dict keyed by field.Key) | `MegaForm.Core/Services/SubmissionProcessor.cs` | 228-232 |
| Field label source | `MegaForm.Core/Models/FormSchema.cs` | 62-71 (`Key`→`Label`) — flatten via `MegaFormUtils.FlattenFields` |
| Repo `List` (formId+status only) | `MegaForm.Oqtane.Server/Data/EfRepositories.cs` 138-150; `MegaForm.DNN/Data/FormRepository.cs` 179-241 |
| Oqtane DI register | `MegaForm.Oqtane.Server/Services/Startup.cs` | 71-74 (`AddMegaFormSdk`), 222-227 (`MegaFormSdk.Initialize`) |
| SDK registration shape | `MegaForm.Sdk/ServiceCollectionExtensions.cs` | 17-27 |
| DNN access (no DI) | `MegaForm.DNN/Services/DnnServiceLocator.cs` | 59 (`.Mega`), 135-137 (built with **platform=null**) |
| Proven consumer (`[Authorize(Admin)]`) | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | 2780-2808 (`SdkDemo`, scope `{PortalId}`) |
| Standalone Web host **missing** AddMegaFormSdk | `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs` | 186 |

### Form renderer + cache stamps
| Vai trò | File | Line |
|---|---|---|
| Widget dispatch (`default:` → `W.renderWidget`) | `MegaForm.UI/src/renderer/megaform-renderer.ts` | 2074-2078 |
| `bindWidgets` after paint | same | 1130 |
| widget registry / `window.MegaFormWidgets` | `MegaForm.UI/src/widgets/index.ts` | 76-92, 149-151 |
| validateForm (skips display-only) | `MegaForm.UI/src/renderer/megaform-renderer.ts` | 2521-2548 |
| SSR widget placeholder | `MegaForm.Core/Services/FormHtmlRenderer.cs` | 46-50 (`NativeTypes`), 307-312 (`mf-widget-host data-mf-widget-hydrate`) |
| Oqtane SSR fast-paint | `MegaForm.Oqtane.Client/Index.razor` | 1009-1052, 2527-2540, 1208-1209 (`mfssr=0`) |
| DNN client rebuild path (no SSR) | `MegaForm.DNN/Views/FormView.ascx` | 743-767; container 677 |
| DNN per-type asset switch | `MegaForm.DNN/Views/FormView.ascx.cs` | 1800-1820 |
| **DNN cache stamp** `const string V` | `MegaForm.DNN/Views/FormView.ascx.cs` | **378** (`?v=20260614-B160`) |
| **Oqtane Resource stamps** `?v=B161/B162` | `MegaForm.Oqtane.Client/Index.razor` | 1094-1119 |
| **Oqtane plugin boot badge** | `MegaForm.Oqtane.Client/Index.razor` | 3064-3070 (`OqtaneResourceBoot v…`) |
| **Builder bundle version** | `MegaForm.UI/src/loader/index.ts` | 24 (`BUILDER_BUNDLE_VERSION='20260614-B162'`) |
| Runtime plugin load (NO `?v=`!) | `MegaForm.UI/src/loader/index.ts` | 385 |

### Unified Designer + AI
| Vai trò | File | Line |
|---|---|---|
| Tab contract | `MegaForm.UI/src/view-designer/shared/unified-shell.ts` | 45-58 |
| Auto-prepend Current Settings + Data | same | 221-231 |
| Merge drafts → `onApply` | same | 538-581 |
| **Data tab** (the SQL editor to branch) | same | 741-805 |
| Stage slice (`applyDataView`) | same | 968-993 |
| table/column loaders | same | 892-915 |
| SQL preview | same | 917-940 |
| AI drawer (KB-search only) | same | 425-473; scope const 275-276 |
| AI KB scope filter **server-side** | `MegaForm.Web/Controllers/AiKnowledgeController.cs` 64-108; `MegaForm.Oqtane.Server/Controllers/AiKnowledgeController.cs`; `MegaForm.DNN/WebApi/AiKnowledgeController.cs` 120-133 |
| KB schema (Kind/WidgetType/Surface) | `MegaForm.Core/Models/AiKnowledgeModels.cs` | 16-31 |
| Function-calling tool catalog (separate MFAiChat) | `MegaForm.UI/src/ai-form-assistant/tools.ts` | 26-241 (defs), 323-443 (dispatch); `list_forms`/`get_form` at 416-419 |

### RLS / whitelist
| Vai trò | File | Line |
|---|---|---|
| FormField (no `IsPublic` flag today) | `MegaForm.Core/Models/FormSchema.cs` | 62-158 |
| Anon row→DTO (copies full DataJson) | `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs` | 3273-3297 (whitelist point ~3277) |
| DNN mirror | `MegaForm.DNN/...` ~1829 (per findings) | |

---

## 4. GĐ0 — SDK data-source foundation (server, both platforms)

**Goal:** `DataRepeater/Query` returns submission rows (projected through the field whitelist) when `widgetProps.dataSource=="megaform_submissions"`, on Oqtane + DNN, in the exact `{Columns, Rows}` shape the client already consumes.

### 0.1 Add config props
**Edit `MegaForm.Core/Models/DataRepeaterModels.cs`:**
- Line **64** — change comment to: `// "sql", "storedproc", "api", "megaform_submissions"`.
- After line 71 (master block) add:
  ```csharp
  // ── MegaForm Submissions source ──
  public int          SubmissionsFormId { get; set; }   // which form's submissions to list (0 = host form)
  public string       StatusFilter      { get; set; }   // enforced default "published"
  public List<string> FieldWhitelist    { get; set; }   // ONLY these field keys leave the server
  ```
- Ctor (120-128): add `FieldWhitelist = new List<string>(); StatusFilter = "published";`

### 0.2 Insert the new branch (the core change)
**Edit `MegaForm.Core/Services/DataRepeaterService.cs` at line 66** (immediately after `// 2. Determine which query to run`, BEFORE the `string sql;` block at 67-86). Add a short-circuit so it never builds SQL, never hits `IsDangerousQuery` (94-99), never calls `_registry.GetConnection` (113-122):
```csharp
// 2a. MegaForm Submissions source (SDK) — bypasses all SQL paths.
if (config.DataSource == "megaform_submissions")
{
    if (request.Level >= 1)            // master-only; no drill-down for this source
    { result.Error = "Submissions source does not support drill-down."; return result; }
    result = ExecuteMegaformSubmissionsQuery(config, request);
    sw.Stop();
    result.ExecutionMs = sw.ElapsedMilliseconds;
    return result;
}
```
Add the new method (read submissions via SDK, project whitelist, build label headers):
```csharp
private DataRepeaterQueryResult ExecuteMegaformSubmissionsQuery(
    DataRepeaterWidgetConfig config, DataRepeaterQueryRequest request)
{
    var result = new DataRepeaterQueryResult();
    int targetFormId = config.SubmissionsFormId > 0 ? config.SubmissionsFormId : request.FormId;

    // SERVER-SIDE whitelist + status enforcement (never trust the client).
    var whitelist = (config.FieldWhitelist ?? new List<string>())
                    .Where(k => !string.IsNullOrWhiteSpace(k)).ToList();
    string status = string.IsNullOrWhiteSpace(config.StatusFilter) ? "published" : config.StatusFilter;
    if (whitelist.Count == 0) { result.Columns = new(); result.Rows = new(); result.TotalRows = 0; return result; }

    // key -> label from the TARGET form schema
    var labels = BuildFieldLabelMap(targetFormId, whitelist);   // helper, see 0.4

    int page = Math.Max(1, request.Page);
    int pageSize = request.PageSize > 0 ? request.PageSize : (config.PageSize > 0 ? config.PageSize : 50);

    var paged = _mega.Submissions.FindAsync(
        new MegaForm.Sdk.SubmissionQuery { FormId = targetFormId, Status = status, Page = page, PageSize = pageSize },
        new MegaForm.Sdk.MegaFormScope { PortalId = _portalId, UserId = 0 }   // anonymous; _portalId from ctor — see 0.3
    ).GetAwaiter().GetResult();

    // *** GĐ1 SECURITY GUARD (see §9 item A) ***
    // Verify the target form belongs to the resolved portal before returning rows.
    var form = _formRepo.GetForm(targetFormId);
    if (form == null /* || form.PortalId != _portalId */) { result.Columns = new(); result.Rows = new(); return result; }

    result.Columns = whitelist.Select(k => new DataRepeaterColumn {
        Name = labels.TryGetValue(k, out var lbl) ? lbl : k, DataType = "string"
    }).ToList();

    result.Rows = new List<object[]>();
    foreach (var dto in paged.Items)
    {
        var map = ParseDataJson(dto.DataJson);          // helper: JObject -> Dictionary<string,object>
        var row = new object[whitelist.Count];
        for (int i = 0; i < whitelist.Count; i++)
            row[i] = map != null && map.TryGetValue(whitelist[i], out var v) ? Stringify(v) : null;  // ONLY whitelisted keys
        result.Rows.Add(row);
    }
    result.TotalRows = paged.TotalCount;
    result.HasMore   = (page * pageSize) < paged.TotalCount;
    result.Page = page; result.PageSize = pageSize;
    return result;
}
```
> **Helpers to add in the same file:** `BuildFieldLabelMap(formId, keys)` (uses `_formRepo.GetForm(formId).SchemaJson` → deserialize `FormSchema` → `MegaFormUtils.FlattenFields` → key→Label, restricted to `keys`); `ParseDataJson(string)` (`JObject.Parse`, `null`-safe); `Stringify(object)` (scalar → string; for nested JObject/JArray return compact JSON so cells aren't blank). Treat unknown/missing keys as `null`.

### 0.3 DI wiring per platform (thread `IMegaFormClient` + `portalId` into the service)
`DataRepeaterService` is constructed **manually in three sites** — all three must change. Add ctor params (keep the old ctor or default them so nothing else breaks):
```csharp
public DataRepeaterService(IConnectionRegistry registry, IFormRepository formRepo,
                           MegaForm.Sdk.IMegaFormClient mega = null, int portalId = 0)
{ _registry = registry; _formRepo = formRepo; _mega = mega; _portalId = portalId; }
```
- **Oqtane** — `MegaForm.Oqtane.Server/Controllers/MegaFormController.cs:1164`: change `new DataRepeaterService(_connectionRegistry, _formRepo)` → `new DataRepeaterService(_connectionRegistry, _formRepo, _sdk, ResolvePortalId())`.
  - `IMegaFormClient` is DI-registered (Startup.cs:74). Inject it into the controller if not already (`SdkDemo` already uses `_sdk` — reuse the same field).
  - `_portalId`: use the alias→SiteId pattern at `MegaFormController.cs:2780-2808` / 2784-2785 (`alias?.SiteId`) to build the portal id. **There is NO ambient `IPlatformContext` in Oqtane** (verdict), so the scope MUST be explicit.
- **DNN** — `MegaForm.DNN/WebApi/DataRepeaterApiController.cs:44-50` (`BuildService`): change to
  `return new DataRepeaterService(registry, formRepo, DnnServiceLocator.Instance.Mega, PortalSettings.PortalId);`
  - `.Mega` is built with **platform=null** (`DnnServiceLocator.cs:135`) → scope is mandatory; we pass `PortalId` + `UserId=0` inside the service.
- **Web/standalone** — `MegaForm.Web/Controllers/DataRepeaterController.cs:31-36` ctor: only matters if this host actually serves the route. If so, add `services.AddMegaFormSdk();` to `MegaForm.AspNetCore.Component/MegaFormAspNetCoreExtensions.cs:186` (currently missing — verdict), inject `IMegaFormClient`, and pass it + a portalId (from `X-Portal-Id` header / `IPlatformContext`). If the standalone host does not mount this route, leave the old 2-arg ctor (defaulted nulls) — the submissions branch will just return empty there.

### 0.4 Acceptance (GĐ0)
- Add a contract/integration test (mirror `MegaForm.Sdk.Tests/MegaFormClientContractTests.cs:68-82` style): seed a form with 3 fields + 5 published submissions; call `ExecuteQuery` with a `megaform_submissions` config whitelisting 2 of 3 keys; assert `result.Columns.Count==2`, `result.Rows.Count==pageSize`, `result.TotalRows==5`, and that the third (non-whitelisted) key's value appears in NO row.
- Manual: `GET /api/MegaForm/DataRepeater/Query?formId=<emptyForm>&widgetKey=<k>` on Oqtane returns `{columns:[2 labels], rows:[...]}` with HTTP 200.

---

## 5. GĐ1 — Whitelist + public/anonymous policy

### 5.1 Storage
- Whitelist lives in `widgetProps.fieldWhitelist` (array of field **keys**), persisted into `schema.fields[].widgetProps` like every other widget prop (launcher write at `megaform-datarepeater-launcher.ts:108-143`). `statusFilter` + `pageSize` + `sort` likewise.
- (Optional, deferred) per-field `IsPublic` flag on `FormField` (`FormSchema.cs:62-158`) — NOT required for v1; the per-widget whitelist is the source of truth.

### 5.2 Server enforcement (MANDATORY — fixes the leak verdicts)
All enforcement is in `ExecuteMegaformSubmissionsQuery` (§0.2):
1. **Whitelist projection** — only keys in `config.FieldWhitelist` are read out of `DataJson`; everything else is dropped before leaving the server. Empty whitelist ⇒ empty result (privacy default).
2. **Status** — force `status="published"` (override any client value; client never supplies it anyway since query is schema-sourced).
3. **Anonymous scope** — pass `MegaFormScope{ PortalId=<resolved>, UserId=0 }`.
4. **Tenant guard (REQUIRED — see §9 A)** — `FindAsync` does NOT scope by portal. Add the guard shown in §0.2: fetch `_formRepo.GetForm(targetFormId)` and return empty if its `PortalId` ≠ resolved `_portalId`. (`FormInfo.PortalId` exists; `Forms.GetFormAsync` already does this check at `MegaFormClient.cs:78` — replicate it here because `FindAsync` does not.)
5. **Never echo PII columns** — do NOT add `UserId`/`IpAddress`/`Email` to `Columns` unless they are explicitly whitelisted field keys.

### 5.3 Acceptance (GĐ1)
- **Non-whitelisted fields NEVER appear in the payload:** seed a submission containing a `secret` field NOT in the whitelist; assert the JSON response contains no column named `secret` and no row value equal to the secret's value (string-search the raw HTTP body).
- Cross-tenant: with `SubmissionsFormId` pointing at a form in a different portal, assert the response is empty (tenant guard).
- `status="draft"` submissions never appear (only `published`).

---

## 6. GĐ2 — Re-point the AI designer to author the presentation template

> **Reality check (verdict REFUTED):** there is NO "AI authoring SQL" to re-point. The **Data tab authors SQL deterministically** (table picker → `SELECT` → `applyDataView` stages `useSql/masterQuery`). The **AI drawer is KB-search-only** (renders read-only cards; never stages/`onApply`). KB scope is filtered **server-side**. So GĐ2 = (a) branch the *deterministic* Data tab into a form-picker + whitelist + sample-data view, and (b) **seed** new KB rows (server) so the AI drawer surfaces template-authoring guidance. The presentation **template** itself is authored in the existing host "Templates"/"Recipe" tab — no new authoring surface needed.

### 6.1 Add the `megaform_submissions` option to the widget enum
- `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts:680-684` — add `{ label:'Form Submissions', value:'megaform_submissions' }` to the `dataSource` options (defaults 641-642).
- Legacy popup parity (optional): `MegaForm.UI/src/view-designer/datarepeater/editor.ts:33-36` add `['submissions','MegaForm Submissions']`; extend `RepeaterDraft` in `view-designer/datarepeater/types.ts` with `submissionsFormId`/`fieldWhitelist`.

### 6.2 Branch the Data tab on `dataSource`
**`MegaForm.UI/src/view-designer/shared/unified-shell.ts`:**
- In `buildDataTab().render` (741-805): read `var mode = String(initial.dataSource || (initial.useSql?'sql':''))`. If `mode==='megaform_submissions'`, render an **alternate left rail** = form-picker (call `list_forms`/`get_form` via the AiTools/Forms endpoint) + a **checkbox whitelist** of that form's field keys (from `get_form` field list), and a **right pane** = read-only sample submissions table. Keep the existing Connection/DB/SQL markup as the `else` branch.
- Replace loaders (892-915) and SQL preview (917-940) **only in submissions mode** with `loadForms()`/`loadFormFields(formId)` (hit Forms/Form) and `previewSubmissions(formId)` (new `AiTools/PreviewSubmissions`, see 6.4). Leave `Subform/Tables` + `AiTools/PreviewSql` untouched for `sql` mode.
- In `applyDataView` (968-993): when `mode==='megaform_submissions'`, stage
  `{ dataSource:'megaform_submissions', useSql:false, submissionsFormId:<picked>, fieldWhitelist:[...checked], statusFilter:'published', pageSize:<n> }`
  and **do NOT emit `masterQuery`/`useSql:true`** (otherwise the runtime tries to run SQL and 500s — verdict risk).

> **Guard the auto-prepend:** the Data tab is prepended for EVERY widget (`unified-shell.ts:228-231`). Gate the new branch strictly on `currentProps.dataSource==='megaform_submissions'` (or on the widget kind) so SQL widgets are not regressed.

### 6.3 Whitelist staging vs the Q5 guard (highest-risk trap)
If the whitelist UI is placed in the **adapter Config tab** instead of the Data tab, `stage()`/`getDraft()` call `stripSqlKeys()` which DROPS `dataSource`/`masterQuery`/`connectionKey` (`megaform-datarepeater-adapter.ts:62-69, 143-151`). **Preferred:** put the source+whitelist in `buildDataTab()` (it owns `dataSource`). If you must use the adapter, add `submissionsFormId`/`fieldWhitelist` to `COLUMN_KEYS`/`OWNED_KEYS` and ensure they are NOT in `SQL_OWNED_KEYS`.

### 6.4 Server preview endpoint (both platforms)
Add `PreviewSubmissions` next to existing `PreviewSql`/`DryRunValidate` in **both** AiTools controllers (route divergence is real — missing one ⇒ 404 on that platform):
- `MegaForm.Web/Controllers/AiToolsController.cs` (+ DNN mirror) **and** `MegaForm.Oqtane.Server/Controllers/AiToolsController.cs`.
- Body: `{ formId, pageSize }`. Calls `IMegaFormClient.Submissions.FindAsync({FormId,PageSize}, scope)`, flattens `SubmissionDto.DataJson` → `{ columns:[fieldKeys], rows:[...] }` in the SAME shape `PreviewSql` returns so `renderPreview` (`unified-shell.ts:942-966`) reuses its table renderer. **Gate this admin-only** (`[Authorize(Roles=Admin)]`) — it's a build-time designer tool, distinct from the public runtime endpoint.

### 6.5 Re-scope the AI drawer (KB) — server seed required
- `unified-shell.ts:275-276` / 450-455: when `opts.currentProps.dataSource==='megaform_submissions'`, set `aiSurface='submission-template'`.
- **Server-side** (verdict — scoping is NOT client-side): seed `MF_AI_Knowledge` rows with `Surface='submission-template'`, `Kind='row_template'` describing how to author `masterTemplate` over `SubmissionDto` field keys (token reference: `{fieldKey}`, `{if:key …}`, `{#each row}`). Add an EF migration like the existing `01060031_AddAiKnowledgeWidgetSurface.cs`. `SearchScoped` (`AiKnowledgeController.cs:64-108`) already filters by `Surface` — no query change, only seed. (Note: `Surface=NULL` rows still match, so tag precisely.)
- (Optional) For the function-calling MFAiChat (`ai-form-assistant/tools.ts`): add `preview_form_submissions` + `validate_template` tool defs (323-443) and down-rank SQL tools when `dataSource==='megaform_submissions'`. This is prompt/scope only; cheap/local providers without function-calling ignore it (per MEMORY).

### 6.6 Acceptance (GĐ2)
- In the designer, pick `Form Submissions` → choose a target form → checkbox 2 of N fields → sample table shows those 2 columns with real data → Apply writes `field.widgetProps.dataSource==='megaform_submissions'` + `fieldWhitelist:[2 keys]` (inspect `MegaFormBuilder.state.schema`).
- AI drawer returns at least one `submission-template` KB card.

---

## 7. GĐ3 — Both widgets + QA + deploy

### 7.1 Place the widget in an empty form (the host shell)
- Create a new form with **one** field of type `DataRepeater` (default) — no inputs, no required fields. A widget IS a field, so the renderer proceeds (`megaform-renderer.ts:1051`); `collect()=null`+`validate()=true` ⇒ submit never blocked.
- Set its `widgetProps` via the designer (GĐ2) to `dataSource:'megaform_submissions'`.
- For the **Razor** variant: field type `Razor`; in `megaform-widget-razor.ts:309-314` add `else if (props.dataSource === 'megaform_submissions')` — prefer **server-side sourcing**: pass `dataSource`/`sourceFormId`/`statusFilter` in the `sendRender` body and let `RazorWidgetController.Render` set `paramDict["SqlRows"]` from `IMegaFormClient.Submissions.FindAsync` (mirror the SqlRows injection at `RazorWidgetController.cs:179-180`; resolve SDK via `_services.GetService(typeof(IMegaFormClient))`, scope `{PortalId, UserId=0}`). Flatten `DataJson` → `Dictionary<string,object>` per row, **whitelisted keys only**. Templates (EditableList etc.) consume `SqlRows` with zero changes. DNN forwards the body verbatim to the Oqtane companion — no DNN change needed.

### 7.2 Oqtane SSR caveat (verdict PARTIAL — must handle)
A widget-only form on Oqtane with prerender ON renders the **static `mf-widget-host` placeholder** and the JS takes the **no-rebuild hydrate** branch — so a non-native widget body (DataRepeater/Razor) **silently won't render**. Two fix options (pick one in GĐ3):
- **(A)** In `FormHtmlRenderer.cs` (46-50 / 307-312): when the schema contains a non-native widget, return empty/non-hydratable SSR so the JS does a full client rebuild (which calls `renderWidget`+`bind`).
- **(B)** Add a JS hydrator that scans `[data-mf-widget-hydrate]` post-init and calls `MegaFormWidgets.renderWidget`+`bind` into each `mf-widget-host`.
- Quick unblock for QA: append `?mfssr=0` (Index.razor:1208-1209) to force client rebuild. DNN is unaffected (no SSR hydrate path; FormView ships an empty container and rebuilds client-side).

### 7.3 Per-platform plugin load
- **DNN** — `FormView.ascx.cs:1800-1820`: ensure `case "datarepeater"` / `case "razor"` already add the plugin bundles (they do). No new case needed (we reuse existing widget types).
- **Oqtane** — `Index.razor:3064-3070`: the resource-boot streams the same plugin list by type. No new plugin file (reusing DataRepeater/Razor).

### 7.4 Cache-stamp bumps (bump ALL that apply, together)
- Editor/designer changes (vite `builder` bundle) → `MegaForm.UI/src/loader/index.ts:24` `BUILDER_BUNDLE_VERSION`.
- Runtime DataRepeater plugin (`tsc`, NOT vite; loaded WITHOUT `?v=` at `loader/index.ts:385`) → bump internal badge `megaform-widget-data-repeater.ts:24` (and consider adding `?v=`+`BUILDER_BUNDLE_VERSION` at line 385) + hard refresh.
- DNN public bundles → `FormView.ascx.cs:378` `const string V`.
- Oqtane public bundles → `Index.razor:1094-1119` `?v=B16x`; plugin scripts → `Index.razor:3064-3070` `oqtaneResourceBootBadge`.

### 7.5 Build + deploy
- `tsc` (plugin runtime) per `MegaForm.UI/src/widgets/plugins/tsconfig.json` (target ES5 — no modern syntax in the runtime file) → `Assets/js/plugins/`.
- `vite` build (`builder` entry) → `Assets/js/bundles/megaform-builder.js`.
- `dotnet build` Core + Oqtane.Server + DNN; copy DLLs/assets per `reference_megaform_build_deploy`; restart `Oqtane.Server` (clean shutdown — see `reference_oqtane_deploy_quirk_b51`).

### 7.6 Headless QA — both platforms
Use `MegaForm.UI/tools/mf-hb.cjs` (playwright-core, in-process login). On Oqtane host (see `reference_local_oqtane_host`) and DNN (`reference_dnn_megaf_site`):
1. Open the empty-form page **as anonymous** (logged out).
2. Assert the list renders rows for the target form.
3. Assert the response body contains ONLY whitelisted column names (string-search for a known non-whitelisted key → must be absent).
4. Assert `status=draft` rows are absent.
5. Repeat for the Razor variant.

### 7.7 Acceptance (GĐ3)
DataRepeater + Razor list pages both render publicly on Oqtane (SSR fix applied) and DNN; whitelist + status enforced; non-whitelisted/draft data absent in the raw payload; pagination works (`TotalRows`/`HasMore` correct).

---

## 8. Rủi ro & phải verify (REFUTED / PARTIAL verdicts → checklist)

- [ ] **A — `FindAsync` does NOT scope by portal (REFUTED sub-claim).** `MegaForm.Sdk/MegaFormClient.cs:117-133`: `ResolvePortalId(scope)` is a presence-check only; the value is discarded; `ISubmissionRepository.List` filters by `formId`+`status` only. **Cross-tenant leak risk.** FIX in §0.2/§5.2: add the `_formRepo.GetForm(targetFormId).PortalId == _portalId` guard. (Optionally also add a `portalId` param to `ISubmissionRepository.List` across all repos — `EfRepositories.cs:138-150`, `DNN FormRepository.cs:179-241`, Web, Umbraco — and join `MF_Submissions`→`MF_Forms`.)
- [ ] **B — `FindAsync` ignores `MegaFormScope.UserId` (REFUTED sub-claim).** No per-user/RLS filter; `UserId=0` is never consulted. For v1 the list is public-by-whitelist so this is acceptable, but **do not** assume "anonymous-only" filtering exists. If "my submissions" is ever needed, extend `SubmissionQuery` (`Dtos.cs:110-123`) + repo `List` with a `UserId` param.
- [ ] **C — `FindAsync` has NO auth gate (gap).** The SDK never checks auth; the public runtime endpoint inherits no RLS. Enforcement is entirely the whitelist+status+tenant guard we add. Verify the GĐ1 acceptance tests pass before exposing publicly.
- [ ] **D — Oqtane DataRepeater endpoint is NOT `[AllowAnonymous]`-decorated (PARTIAL).** `MegaFormController.DataRepeaterQuery` (1136-1167) has only `[HttpGet]`; the class is `[IgnoreAntiforgeryToken]` with no class-level auth. It is *effectively* reachable anonymously but the endpoint does **no** RLS for you. Do not write code assuming the framework gates it.
- [ ] **E — "AI authors SQL" seam does not exist (REFUTED).** Data tab authors SQL deterministically; AI drawer is KB-search-only; KB scope is **server-side**. GĐ2 must seed `MF_AI_Knowledge` (migration) — a client-only change will NOT change AI behavior. Files: `unified-shell.ts:425-473`, `AiKnowledgeController.cs:64-108`.
- [ ] **F — Oqtane SSR hides non-native widget bodies (PARTIAL).** Widget-only form on Oqtane (prerender ON) shows only the placeholder; nothing consumes `data-mf-widget-hydrate`. Apply §7.2 fix (A or B). DNN unaffected.
- [ ] **G — `IMegaFormClient` is NOT wired into the DataRepeater path today (PARTIAL).** It's registered on Oqtane DI and reachable on DNN via `DnnServiceLocator.Mega`, but no DataRepeater controller injects it. §0.3 threads it through all three `DataRepeaterService` construction sites. Forgetting any one breaks that platform silently.
- [ ] **H — No ambient `IPlatformContext` on Oqtane; DNN client has `platform=null`.** `ResolvePortalId` THROWS without an explicit scope. Always pass `MegaFormScope{PortalId,UserId=0}` (verified `MegaFormClient.cs:44-50`).
- [ ] **I — Standalone Web host missing `AddMegaFormSdk` (gap).** `MegaFormAspNetCoreExtensions.cs:186`. If that host serves the route, inject would fail at DI resolution. Add `services.AddMegaFormSdk()` there or keep the defaulted 2-arg ctor.
- [ ] **J — Q5 `stripSqlKeys` drops `dataSource` (risk).** If whitelist/source UI lives in the adapter Config tab it's silently lost on Apply (`megaform-datarepeater-adapter.ts:62-69`). Put it in `buildDataTab()` (preferred) or update the ownership matrices.
- [ ] **K — `applyDataView` always stages `useSql:true`+`masterQuery` (risk).** In submissions mode you MUST clear those or the runtime runs SQL and 500s (`unified-shell.ts:968-993`).
- [ ] **L — Dual build + no-`?v=` runtime stamp (risk).** Runtime plugin = `tsc` (ES5); editor = vite. Bump BOTH and all cache stamps in §7.4, or you ship a half-feature / stale JS (`loader/index.ts:385` loads runtime WITHOUT `?v=`).
- [ ] **M — Two AiTools controllers (DNN/Web + Oqtane).** Add `PreviewSubmissions` to BOTH or it 404s on one platform.
- [ ] **N — DataJson flattening correctness.** Nested objects / arrays / file-field shapes → blank/garbled cells. `Stringify` must compact-JSON non-scalars. Verify with a form containing a Row/multi-value field.

---

## 9. Tham chiếu

- `Docs/HANDOFF_20260614_MYINBOX_FIX_AND_SSR_FORMLOAD.md` — line 67 marks widget-hydrate SSR as a PENDING (never-run) QA item; directly relevant to §7.2.
- `Docs/UNIFIED_WIDGET_DESIGNER_SPEC.json` — line 371 claims "no new server code for v1" (true ONLY if reusing existing surfaces; new KB surface needs a migration — see §6.5).
- Memory: `project_sdk_consumer_demo` — `IMegaFormClient.Files` + list-view demo (`?mfpanel=sdkdemo` / `api/SdkDemo` / DNN Razor host), LIVE-PROVEN 2026-06-13 — the SDK precedent this feature builds on.
- Memory: `project_future_sdk_and_docs` — `MegaForm.Sdk` API-stability strategy + contract tests (`MegaForm.Sdk.Tests/MegaFormClientContractTests.cs`).
- Memory: `project_portal_rls_poc` — `isPublicListView` RLS-bypass security bug history; reinforces the tenant guard in §5.2.
- Memory: `reference_megaform_build_deploy`, `reference_oqtane_deploy_quirk_b51`, `feedback_oqtane_asset_cache_versions` — build/deploy + cache-stamp mechanics for §7.
- Memory: `reference_local_oqtane_host`, `reference_dnn_megaf_site` — QA hosts/credentials for `mf-hb.cjs`.
- AI KB migration precedent: `MegaForm.*/.../01060031_AddAiKnowledgeWidgetSurface.cs` (WidgetType/Surface columns) — pattern for the `submission-template` seed in §6.5.
