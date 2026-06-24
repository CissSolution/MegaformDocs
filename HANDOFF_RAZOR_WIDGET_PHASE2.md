# Razor Widget — Phase 2 + 3 Handoff (2026-05-31)

## TL;DR

Shipped 6 new starter templates, 3 new endpoints (Action / Compile / Export), the Preview page, Roslyn JIT compile for customer overrides, and host-only gate. 18 KB entries seeded on both DNN10322_MegaF and Oqtane_MSSQL databases. End-to-end verified via `/Preview` page.

## Acceptance check

Visit one URL on each platform to confirm everything renders:

| Platform | URL | Expected |
|---|---|---|
| Oqtane companion | `http://localhost:5050/api/MegaFormPopup/RazorWidget/Preview` | 8 built-in templates + 1 customer "HelloWorld" rendered |
| DNN proxy        | `http://DNN10322_MegaF.AI/DesktopModules/MegaForm/API/RazorWidget/Preview` | same content via proxy |
| Studio (in DNN Builder) | `dnn10322_megaf.ai/xx?mfFormId=281#mf-builder` → click `✨ Razor Studio` on a Razor field | 4 tabs: Catalog (9 templates), Source (read .razor), New Template (Compile button + Save as override), Live Preview (iframe) |

## What shipped

### New .razor templates (6)
- `EditableList.razor` — CRUD-enabled SQL list with Add/Edit/Delete buttons backed by server whitelist
- `MasterDetailList.razor` — parent rows with drill-down child query
- `CalendarFromSQL.razor` — month grid from a date column
- `ImageGallery.razor` — responsive image card grid (1-6 columns)
- `LiveChart.razor` — bar / line / pie chart as inline SVG (no JS lib)
- `EmailTemplate.razor` — HTML email body for autoresponder / webhook payloads

### New endpoints
- `POST /api/MegaFormPopup/RazorWidget/Action` — CRUD whitelist runner. Body `{actionSql, parameters, connectionKey}`. Uses parameterized binding (`:name → @name`). Client never sends arbitrary SQL — TS plugin reads `widgetProps.actions[name].sql` from local form schema and forwards.
- `POST /api/MegaFormPopup/RazorWidget/Compile` — Roslyn JIT. Body `{templateName, source}`. Runs Razor SDK → C# → CSharpCompilation → in-memory Assembly → registers `[RazorTemplate]` Type in registry. Returns `{success, sourceHash, errors:[{line,col,severity,code,message}]}`. **Host-only.**
- `POST /api/MegaFormPopup/RazorWidget/Export` — CSV download from a row set. Body `{fileName, sqlRows}`. Returns `text/csv` with `Content-Disposition: attachment`.
- `GET  /api/MegaFormPopup/RazorWidget/Preview` — smoke-test HTML page. Renders every registered template against synthetic data. One-URL deploy verification.

DNN proxies for all 4 added at the same `/DesktopModules/MegaForm/API/RazorWidget/{action}` paths.

### Roslyn JIT compile pipeline
- `Services/RazorCompilationService.cs` (new) — `Microsoft.AspNetCore.Razor.Language` 6.0.36 + `Microsoft.CodeAnalysis.CSharp` 4.10.0. Walks `TRUSTED_PLATFORM_ASSEMBLIES` + every `AssemblyLoadContext.All` + `AppContext.BaseDirectory/*.dll` for references (Oqtane uses custom load contexts so AppDomain alone is insufficient). Compiles → loads → reflects `[RazorTemplate]` → `registry.Override(meta)` makes it live. LRU cache of 100 by sha256(source).
- `Services/RazorActionService.cs` (new) — parameterized SQL execution wrapping `IMfSqlExecutor`. SELECT-shaped → returns rows; UPDATE/INSERT/DELETE → returns affected count.
- `Services/RazorWidgetRegistry.cs` (modified) — now `ConcurrentDictionary` + `Override()` + `ExtractParametersPublic()`.
- `Services/RazorWidgetStubServices.cs` (modified) — `StubSqlExecutor` is now `RegistrySqlExecutor` (real ADO via `IConnectionRegistry`) so /Action can mutate.

### Studio (popup) — 4 tabs now
- Catalog — list with category/SQL/Emits-value chips, click → param table
- Source — read-only .razor source viewer
- New Template — author with skeleton + **Compile button** (calls JIT) + **Save as override** (writes to widgetProps.razorSourceOverride)
- Live Preview — iframe of `/Preview` so admin sees every template render side-by-side

### Plugin row-action bridge
- Button clicks with `data-mf-razor-action="insert|update|delete|loadDetail"` dispatched via plugin
- Insert/Update → open inline-edit modal seeded from row + POST /Action with the SQL from `widgetProps.actions[name]`
- Delete → confirm + POST /Action
- loadDetail (MasterDetailList) → GET DataRepeater with parentId → render child rows inline

### Host-only gate on /Compile
`User.IsInRole("Administrators" | "Host")` OR `claim IsHost=True`. Otherwise 403 "Razor compile requires Host role." Server-side enforcement — even if the Studio button is reachable, the endpoint refuses non-host writes.

### KB seed (18 entries on each DB)
- 11 new entries added: 6 widget entries (one per new template) + 5 designer entries (action endpoint, compile endpoint, export endpoint, preview page, Studio + Roslyn flow).
- Both `DNN10322_MegaF` and `Oqtane_MSSQL` databases re-seeded with `ai-knowledge-razor-widget.sql` (idempotent MERGE).

## What was NOT shipped (and why)

| Item | Reason | Suggested path |
|---|---|---|
| #9 PrintPdf.razor + headless PDF endpoint | Requires Chromium / wkhtmltopdf external dep | Phase 4 — integrate IronPdf or PuppeteerSharp (~80MB) |
| #10 MapPicker.razor (OSM) | Needs Leaflet / OSM tiles + client JS lib | Phase 4 — bundle leaflet.js (~150KB) |
| #11 Monaco editor in Studio | 500KB+ bundle, complex AMD loader | Phase 4 — lazy-load on Studio first open |
| #12 Sort/filter UI on SqlTablePivot | Most users export to CSV + sort in Excel | Phase 4 — add data-attrs + JS sort hooks |
| #13 Roslyn analyzer sandbox | Deep Roslyn DiagnosticAnalyzer API work | Phase 4 — pin to `Microsoft.CodeAnalysis.NetAnalyzers` + custom analyzer ruleset rejecting `Process.Start` / `WebClient` / raw `SqlConnection` outside `Sql.QueryAsync` |

Phase 3 security gate (#14 Host-only on /Compile) **did ship** — that's the most load-bearing part of the security story until the analyzer arrives. Customers can still write malicious Razor but only a Host user can deploy it.

## File reference

```
NEW (Razor templates):
  MegaForm.Oqtane.Server/RazorWidgets/EditableList.razor
  MegaForm.Oqtane.Server/RazorWidgets/MasterDetailList.razor
  MegaForm.Oqtane.Server/RazorWidgets/CalendarFromSQL.razor
  MegaForm.Oqtane.Server/RazorWidgets/ImageGallery.razor
  MegaForm.Oqtane.Server/RazorWidgets/LiveChart.razor
  MegaForm.Oqtane.Server/RazorWidgets/EmailTemplate.razor

NEW (Services):
  MegaForm.Oqtane.Server/Services/RazorCompilationService.cs
  MegaForm.Oqtane.Server/Services/RazorActionService.cs

MODIFIED:
  MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj
    + 2 NuGet refs (Razor.Language 6.0.36, CodeAnalysis.CSharp 4.10.0)
    + 6 EmbeddedResource entries for new .razor sources
  MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs
    + Action / Compile / Export / Preview endpoints
    + Host-only gate on Compile
  MegaForm.Oqtane.Server/Services/Startup.cs
    + IRazorActionService + RazorCompilationService DI
  MegaForm.Oqtane.Server/Services/RazorWidgetRegistry.cs
    + ConcurrentDictionary + Override() + ExtractParametersPublic()
  MegaForm.Oqtane.Server/Services/RazorWidgetStubServices.cs
    + RegistrySqlExecutor (real ADO)
  MegaForm.DNN/WebApi/RazorWidgetController.cs
    + Action / Compile / Export / Preview proxy methods
  MegaForm.UI/src/widgets/plugins/megaform-widget-razor.ts
    + bindRowActions / openInlineForm / runWriteAction
    + loadDetail (master-detail expand)
  MegaForm.UI/src/widgets/plugins/megaform-razor-studio.ts
    + Compile button on New Template tab
    + Live Preview tab (iframe)
  MegaForm.DNN/Views/FormView.ascx.cs
    + cache V=20260530-RZ4
  MegaForm.Core/Seed/ai-knowledge-razor-widget.sql
    + 11 new KB entries
```

## Quick verify (curl)

```bash
# 9 templates in /List (8 built-in + the HelloWorld customer override from prior compile)
curl -s http://localhost:5050/api/MegaFormPopup/RazorWidget/List | jq '.[].name'

# Compile a customer template (Host-only — anonymous returns 403 in production)
curl -X POST http://localhost:5050/api/MegaFormPopup/RazorWidget/Compile \
  -H 'Content-Type: application/json' \
  -d '{"templateName":"X","source":"@using MegaForm.Oqtane.Server.RazorWidgets\n@inherits MfRazorWidgetBase\n@attribute [MegaForm.Core.Interfaces.RazorTemplate(\"X\")]\n@code{[Parameter] public string N{get;set;}=\"y\";}\n<div>Hi @N</div>"}'

# CSV export
curl -X POST http://localhost:5050/api/MegaFormPopup/RazorWidget/Export \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"demo","sqlRows":[{"a":1,"b":2}]}' \
  -o demo.csv

# Preview page (open in browser)
open http://localhost:5050/api/MegaFormPopup/RazorWidget/Preview
```

## Deferred phase 4 backlog

1. Roslyn analyzer sandbox + dangerous-API reject set
2. Monaco editor in Studio (lazy-loaded)
3. PDF render template + headless PDF endpoint
4. MapPicker.razor + bundled Leaflet
5. Sort/filter UI overlay for SqlTablePivot
6. More starter templates: KanbanBoard, TimelineFromSQL, NestedTree
7. AI tool `write_razor_template(name, prompt)` that drives the Compile endpoint from the chat
