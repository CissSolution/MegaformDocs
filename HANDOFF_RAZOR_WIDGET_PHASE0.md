# Razor Widget — Phase 0 Handoff (2026-05-30 evening)

## TL;DR

Built the **server-side foundation** for the Razor widget — XMod Pro replacement with first-class Razor C# + IntelliSense workflow. Compiles cleanly on Oqtane.Server (net9.0 Release). **Phase 1 work (TS plugin, Builder UI, AI integration, KB seed, deploy, visual QA) is multi-session scope** — handoff for next turn.

## What's built (Phase 0 — server foundation)

### MegaForm.Core
- **[Models/FormSchema.cs](MegaForm.Core/Models/FormSchema.cs)** — `FieldType` enum extended with `Razor` value
- **[Interfaces/IRazorWidgetServices.cs](MegaForm.Core/Interfaces/IRazorWidgetServices.cs)** — 5 service interfaces + metadata classes:
  - `IMfFormContext` — read current formData + submission + form metadata + URL query
  - `IMfUserContext` — user id, email, roles, IsHost, IsAdmin, IsInRole
  - `IMfSiteContext` — portalId, siteId, locale, GetSetting
  - `IMfSqlExecutor` — QueryAsync, ExecuteScalarAsync, StoredProcAsync
  - `IMfRazorEmitter` — EmitValueAsync, DispatchEventAsync, RefreshFieldAsync
  - `RazorTemplateAttribute` — metadata annotation: Name, Category, Description, EmitsValue, ValueShape, SupportsSql, RequiresInteractive

### MegaForm.Oqtane.Server
- **[RazorWidgets/MfRazorWidgetBase.cs](MegaForm.Oqtane.Server/RazorWidgets/MfRazorWidgetBase.cs)** — base class all templates inherit. Provides standard injected services + SqlRows/SqlQueries/WidgetKey/ExtraParameters parameters.
- **[RazorWidgets/SqlTablePivot.razor](MegaForm.Oqtane.Server/RazorWidgets/SqlTablePivot.razor)** — first SQL-display starter template. Pivots SQL rows by row/column groups with sum/avg/count/min/max aggregation. ~170 lines including CSS. Demonstrates LINQ + Razor pattern that XMod Pro tag-language cannot do.
- **[RazorWidgets/InteractiveCalculator.razor](MegaForm.Oqtane.Server/RazorWidgets/InteractiveCalculator.razor)** — first interactive starter template. Reads cascading form fields, computes total, emits `{displayValue, rawValue, breakdown}` into formData[widgetKey]. Demonstrates output protocol via `Emitter.EmitValueAsync`.
- **[Services/RazorWidgetRegistry.cs](MegaForm.Oqtane.Server/Services/RazorWidgetRegistry.cs)** — singleton. Scans all loaded assemblies at construction for `[RazorTemplate(...)]` attributed types. Exposes `List()` + `Get(name)`. Reflects `[Parameter]` properties into `RazorParameterInfo`.
- **[Controllers/RazorWidgetController.cs](MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs)** — REST endpoints:
  - `GET /api/MegaFormPopup/RazorWidget/List` — returns catalog with metadata + param info
  - `POST /api/MegaFormPopup/RazorWidget/Render` — accepts `{templateName, parameters, sqlRows, widgetKey}` → returns rendered HTML via Blazor's `HtmlRenderer`
- **[Services/RazorWidgetStubServices.cs](MegaForm.Oqtane.Server/Services/RazorWidgetStubServices.cs)** — Phase 0 stub implementations of the 5 services. Form context stores live dictionary; user/site/sql/emitter are placeholders (Phase 1 will wire to real Oqtane authn + connection registry + JS bridge).
- **[Services/Startup.cs](MegaForm.Oqtane.Server/Services/Startup.cs)** — DI registration block:
  ```csharp
  services.AddSingleton<RazorWidgetRegistry>();
  services.AddScoped<HtmlRenderer>();
  services.AddScoped<IMfFormContext, StubFormContext>();
  services.AddScoped<IMfUserContext, StubUserContext>();
  services.AddScoped<IMfSiteContext, StubSiteContext>();
  services.AddScoped<IMfSqlExecutor, StubSqlExecutor>();
  services.AddScoped<IMfRazorEmitter, StubEmitter>();
  ```

### Build status
```
$ dotnet build MegaForm.Oqtane.Server -c Release
Build succeeded.
    0 Error(s)
```

## What's NOT yet built (Phase 1 — multi-session scope)

### Frontend (TS) — ~2-3 days of work
1. **[MegaForm.UI/src/widgets/plugins/megaform-widget-razor.ts](MegaForm.UI/src/widgets/plugins/megaform-widget-razor.ts)** — new file. Plugin renders the widget in form view + builder canvas:
   - On form load: POST `/api/MegaFormPopup/RazorWidget/Render` with `{templateName, parameters, sqlRows, widgetKey, submissionId}` → set field slot `innerHTML = response.html`
   - Watch `dependsOn[]` fields → re-fetch + swap HTML on change (debounce 300ms)
   - Bridge `Emitter.EmitValueAsync` outputs back into `formData[widgetKey]` for submit
2. **[MegaForm.UI/src/builder/](MegaForm.UI/src/builder/)** — sidebar entry + right-panel:
   - Add `⚡ Razor Widget` card to BASIC tab (purple gradient)
   - Right-panel template picker dropdown (calls /List endpoint)
   - Auto-generated param inputs from `RazorParameterInfo` metadata
   - SQL section (useSql checkbox + masterQuery textarea + queryDependsOn chips)
   - Plain textarea for `razorSourceOverride` + Compile button (defers to Phase 1.5 Roslyn JIT)

### Cross-platform (DNN) — ~1-2 days
3. **[MegaForm.DNN/WebApi/RazorWidgetController.cs](MegaForm.DNN/WebApi/RazorWidgetController.cs)** — mirror Oqtane controller. DNN doesn't have native Blazor but server-render via `HtmlRenderer` works in any ASP.NET host — just need DI wired up in DNN's `IocConfig`.
4. **Umbraco/Web standalone** — hide field per architectural decision (no .NET runtime).

### Roslyn JIT compile — ~2-3 days
5. **[MegaForm.Oqtane.Server/Services/RazorCompilationService.cs](MegaForm.Oqtane.Server/Services/RazorCompilationService.cs)** — JIT compile customer `razorSourceOverride`:
   - Wrap source in `@inherits MfRazorWidgetBase` if missing
   - Compile via `Microsoft.AspNetCore.Mvc.Razor.RuntimeCompilation` or direct `Microsoft.CodeAnalysis.CSharp`
   - Cache compiled Type by `(templateName + sourceHash)` with LRU eviction (max 100 in-memory)
   - Return assembly hash + errors via `POST /Compile`

### AI integration — ~1-2 days
6. **[MegaForm.UI/src/ai-form-assistant/tools.ts](MegaForm.UI/src/ai-form-assistant/tools.ts)** — 2 new AI tools:
   - `list_razor_templates()` — returns catalog with use case hints
   - `get_razor_template_source(name)` — returns the .razor source for AI to read+suggest edits
7. **System prompt** — strengthen with rule: "When user asks for advanced display (pivot, calendar, gallery) or interactive (calc, map, chart) widget, prefer Razor widget over standard fields"
8. **KB seed SQL** — 7 entries:
   - `widget-razor-overview` — when to use, runtime API, output contract
   - `widget-razor-sql-tablepivot` — SqlTablePivot params + use case
   - `widget-razor-interactive-calculator` — Calculator params + emit pattern
   - `form_pattern-razor-cascade` — dependsOn pattern parallel to SQL cascade
   - `form_pattern-razor-emit-protocol` — `{displayValue, rawValue}` shape conventions
   - `form_pattern-xmod-to-razor-migration` — `[[Token]]` → `@Property` mapping for customers coming from XMod
   - `widget-razor-runtime-api` — IMfFormContext / IMfSqlExecutor / etc. cheat sheet

### Additional templates — ~3-5 days
9. Ship more starters:
   - `MapPicker.razor` — OpenStreetMap location picker, emit lat/lng
   - `CalendarFromSQL.razor` — render SQL events on calendar grid (XMod parity)
   - `ImageGallery.razor` — image grid from SQL rows (XMod parity)
   - `LiveChart.razor` — interactive chart (bar/line/pie) from SQL with drill-down events
   - `BlankSqlDisplay.razor` — minimal `<table><tbody>@foreach (var r in SqlRows)</tbody></table>` starter for customer fork+edit
   - `BlankInteractive.razor` — minimal interactive starter with 1 button + EmitValueAsync

### Deploy + visual QA — ~1 day
10. Deploy to:
    - DNN `dnn10322_megaf.ai` — copy bundles + DLLs
    - Oqtane `localhost:5050/business` — copy bundles + DLLs + restart server
    - Oqtane `localhost:5005/business` — pending manual page/module add
11. Visual QA per platform:
    - Open builder, drag Razor widget into form
    - Pick SqlTablePivot template, configure SQL query, verify rendered table
    - Save form, open form view, verify HTML renders with real data
    - Pick InteractiveCalculator, configure deps, change field values, verify emit + submission JSON includes value

## Phase 1.5 / Phase 2 (later)
- Customer .razor file drop into `wwwroot/Modules/MegaForm/RazorWidgets/` → auto-discover at startup (without rebuild)
- Customer catalog table `MF_RazorWidgets` for save-as
- Monaco editor (instead of plain textarea) — adds ~500 KB bundle but huge UX upgrade
- Email Razor template (XMod parity)
- Print/PDF Razor template (XMod parity)
- AI tool `write_razor_widget` (modify widget at runtime)
- Sandboxing: Roslyn analyzer to reject `Process.Start`, network exfil, raw SQL allowlist
- Master-detail pattern starter
- XMod template auto-converter (Phase 2 — user declined for now)

## Files reference

```
NEW FILES:
  MegaForm.Core/Interfaces/IRazorWidgetServices.cs                    (5 interfaces + attribute, ~150 lines)
  MegaForm.Oqtane.Server/RazorWidgets/MfRazorWidgetBase.cs            (~50 lines)
  MegaForm.Oqtane.Server/RazorWidgets/SqlTablePivot.razor             (~190 lines incl. CSS)
  MegaForm.Oqtane.Server/RazorWidgets/InteractiveCalculator.razor     (~120 lines incl. CSS)
  MegaForm.Oqtane.Server/Services/RazorWidgetRegistry.cs              (~110 lines)
  MegaForm.Oqtane.Server/Services/RazorWidgetStubServices.cs          (~95 lines)
  MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs         (~115 lines)

MODIFIED:
  MegaForm.Core/Models/FormSchema.cs               (added Razor to FieldType enum)
  MegaForm.Oqtane.Server/Services/Startup.cs       (added 6 DI registrations)
```

## Architecture decisions locked in (per user)

1. Storage: `widgetProps.razorSourceOverride` (per-form, string)
2. Compile: Roslyn JIT on save
3. Editor: plain textarea + server syntax check (Monaco deferred)
4. Cross-platform: hide field on Umbraco/Web (no .NET runtime)
5. Sandboxing: host-only edit + Roslyn analyzer for dangerous APIs (Phase 1.5)
6. Migration tool from XMod: NOT shipping (customer self-rewrites)
7. Catalog scope: starter templates (not exhaustive built-ins) — customer codes the rest
8. Output contract: emit-if-needed (not mandatory) — display templates skip; interactive templates emit `{displayValue, rawValue, ...}` minimum

## How to continue (next session)

1. **Visual QA first** before more code: deploy current build to Oqtane `:5050`, hit `/api/MegaFormPopup/RazorWidget/List` to verify registry scan works, then call `/Render` with a synthetic SQL row set to verify SqlTablePivot HTML output. This proves architecture before frontend investment.
2. Build the TS plugin (`megaform-widget-razor.ts`) — fetch render endpoint, mount HTML into field slot.
3. Add the sidebar BASIC card + right-panel template picker UI.
4. Wire AI tools + seed KB entries.
5. Roslyn JIT compile service for `razorSourceOverride`.
6. Add more starter templates incrementally.

The risky/load-bearing decisions are now LOCKED via the interfaces in `IRazorWidgetServices.cs`. Frontend + AI work can iterate without churning the contract.
