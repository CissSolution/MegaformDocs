# Razor Widget — Phase 0 + 1 Handoff (2026-05-30)

## TL;DR

Full XMod Pro replacement — first-class .razor templates rendered server-side via Blazor HtmlRenderer on Oqtane, transparent HTTP proxy on DNN — shipped and verified end-to-end on both platforms.

## Smoke tests (all PASS)

```bash
# Oqtane companion (native render via HtmlRenderer)
GET  http://localhost:5050/api/MegaFormPopup/RazorWidget/List          → 2 templates
GET  http://localhost:5050/api/MegaFormPopup/RazorWidget/Source?name=… → embedded .razor source
POST http://localhost:5050/api/MegaFormPopup/RazorWidget/Render        → HTML with correct math

# DNN proxy (forwards to Oqtane companion)
GET  http://DNN10322_MegaF.AI/DesktopModules/MegaForm/API/RazorWidget/List  → forwarded
POST http://DNN10322_MegaF.AI/DesktopModules/MegaForm/API/RazorWidget/Render → forwarded
```

## What ships

### Phase 0 — server foundation (Oqtane)
- `MegaForm.Core/Models/FormSchema.cs` — `FieldType.Razor`
- `MegaForm.Core/Interfaces/IRazorWidgetServices.cs` — IMf* interfaces + `RazorTemplateAttribute`
- `MegaForm.Oqtane.Server/RazorWidgets/MfRazorWidgetBase.cs` — base class
- `MegaForm.Oqtane.Server/RazorWidgets/SqlTablePivot.razor` — display template w/ LINQ aggregation
- `MegaForm.Oqtane.Server/RazorWidgets/InteractiveCalculator.razor` — interactive emit-value template
- `MegaForm.Oqtane.Server/Services/RazorWidgetRegistry.cs` — singleton scan + `[Parameter]` introspection
- `MegaForm.Oqtane.Server/Services/RazorWidgetStubServices.cs` — Phase 0 stub IMf* impls
- `MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs` — `[List/Source/Render]` + `[IgnoreAntiforgeryToken]` + JsonElement parameter unwrap
- `MegaForm.Oqtane.Server/Services/Startup.cs` — DI registrations

### Phase 1A — DNN cross-platform proxy
- `MegaForm.DNN/WebApi/RazorWidgetController.cs` — `[List/Render]` proxy to Oqtane companion via `HttpClient`. URL configurable via portal setting `MegaForm_RazorWidget_OqtaneUrl` (default `http://localhost:5050`).
- `MegaForm.DNN/WebApi/AiToolsController.cs` — `[RazorTemplateSource]` proxy (for AI `get_razor_template_source` tool).
- `MegaForm.DNN/Views/FormView.ascx.cs` — `case "razor":` in asset manifest.

### Phase 1B — TS plugin (Builder + form view)
- `MegaForm.UI/src/widgets/plugins/megaform-widget-razor.ts` — registers `Razor` field type, sidebar entry, render+dependsOn+emit-bridge.
- `Assets/css/plugins/megaform-widget-razor.css` — wrapper styles.
- `MegaForm.UI/src/widgets/plugins/tsconfig.json` — include entry.
- `MegaForm.UI/src/loader/index.ts` — preload JS + CSS.

### Phase 1C — Asset manifest
- `MegaForm.Core/Services/FormAssetManifestService.cs` — `case "razor":` adds plugin assets.
- `MegaForm.DNN/Views/FormView.ascx.cs` — mirror DNN-side.

### Phase 1D — AI integration + KB
- `MegaForm.UI/src/ai-form-assistant/tools.ts` — 2 new tools: `list_razor_templates`, `get_razor_template_source` + dispatcher + `razorListUrl` helper.
- `MegaForm.Core/Seed/ai-knowledge-razor-widget.sql` — idempotent MERGE script seeding 7 KB entries (overview, 2 templates, vs-DynamicLabel pattern, emit protocol, cascade pattern, XMod migration map).

### Phase 1E — Deploy + verify
- Oqtane `:5050` — DLL + plugin JS/CSS copied to `E:\DNN_SITES\OqtaneSites\Oqtane.MSSQL\`. All 3 endpoints verified.
- DNN `DNN10322_MegaF.AI` — DLL + plugin JS/CSS copied to `E:\DNN_SITES\DNN10322_MegaF\Website\`. Proxy verified — `/List` and `/Render` forward correctly to companion.

## Architecture decisions locked

1. **Storage**: `widgetProps.razorSourceOverride` (per-form, string) — Phase 1.5
2. **Compile**: Roslyn JIT on save — Phase 1.5
3. **Editor**: plain textarea + server syntax check — Phase 1.5
4. **Cross-platform**: DNN ships a transparent proxy to the Oqtane companion (default `http://localhost:5050`). Customers with both platforms get full Razor immediately. Pure-DNN customers run the Oqtane companion alongside (~50MB self-contained), or wait for Phase 2 native classic-Razor renderer.
5. **Sandboxing**: host-only edit + Roslyn analyzer for dangerous APIs — Phase 1.5
6. **Migration tool from XMod**: NOT shipping (customer self-rewrites; KB entry `form_pattern-xmod-to-razor-migration` documents the mapping).
7. **Catalog scope**: starter templates only (SqlTablePivot, InteractiveCalculator). Customer codes the rest per Phase 1.5 Roslyn JIT.
8. **Output contract**: emit-if-needed. Display templates skip; interactive templates emit `{displayValue, rawValue, ...}` minimum.

## Operator runbook

### Install fresh on a new DNN site
1. Copy the latest `MegaForm.DNN.dll` + `MegaForm.Core.dll` to `bin/`.
2. Copy `megaform-widget-razor.js` + `megaform-widget-razor.css` to `DesktopModules/MegaForm/Assets/{js,css}/plugins/`.
3. If running an Oqtane companion on a non-default URL, set portal setting `MegaForm_RazorWidget_OqtaneUrl` to its base URL.
4. Run `ai-knowledge-razor-widget.sql` against the site DB (adds 7 KB entries for the AI assistant).

### Install on Oqtane companion
1. Copy `MegaForm.Oqtane.Server.Oqtane.dll` to the site root.
2. Copy plugin JS/CSS to `wwwroot/Modules/MegaForm/{js,css}/plugins/`.
3. Restart Oqtane.Server.exe.

### Customer wants to write their own Razor template (Phase 1.5)
Pending — defer until Phase 1.5 ships Roslyn JIT + `razorSourceOverride` flow. For now, customers fork the .razor file in source + redeploy MegaForm.Oqtane.Server.

## What's NOT yet built

- **Roslyn JIT compile service** (Phase 1.5) — for customer `razorSourceOverride` field
- **Monaco editor** (Phase 2) — plain textarea works but is rough
- **6 more starter templates** — MapPicker, CalendarFromSQL, ImageGallery, LiveChart, BlankSqlDisplay, BlankInteractive
- **Native classic-Razor renderer on DNN** (Phase 2) — for pure-DNN customers without Oqtane companion
- **Email + Print/PDF Razor templates** (Phase 2) — XMod parity
- **Visual QA on actual form** — endpoints verified, plugin deployed, but no test form yet uses Razor field. Next session: create a form with FieldType.Razor + masterQuery, drag into builder, save, open form view, verify pivot renders.
- **MegaForm 01.06.28 install package** — current change set warrants a new install zip; reuse the build process from `project_megaform_install_01_06_25.md`.

## Files reference (this session)

```
NEW:
  MegaForm.DNN/WebApi/RazorWidgetController.cs                                  (~85 lines)
  MegaForm.UI/src/widgets/plugins/megaform-widget-razor.ts                      (~330 lines)
  Assets/css/plugins/megaform-widget-razor.css                                  (~25 lines)
  MegaForm.Core/Seed/ai-knowledge-razor-widget.sql                              (7-row MERGE script)
  HANDOFF_RAZOR_WIDGET_PHASE1.md                                                (this file)

MODIFIED:
  MegaForm.Oqtane.Server/Controllers/RazorWidgetController.cs                   (+IgnoreAntiforgeryToken, +Source endpoint, +JsonElement param unwrap)
  MegaForm.Oqtane.Server/MegaForm.Oqtane.Server.csproj                          (+EmbeddedResource for .razor files)
  MegaForm.DNN/WebApi/AiToolsController.cs                                      (+RazorTemplateSource action)
  MegaForm.DNN/Views/FormView.ascx.cs                                           (+case "razor" in asset manifest)
  MegaForm.UI/src/widgets/plugins/tsconfig.json                                 (+include entry)
  MegaForm.UI/src/loader/index.ts                                               (+preload JS + CSS)
  MegaForm.UI/src/ai-form-assistant/tools.ts                                    (+2 tool defs + dispatcher cases + razorListUrl helper)
  MegaForm.Core/Services/FormAssetManifestService.cs                            (+case "razor")
```

## Quick verification

```bash
# Should return 2 templates
curl -s http://localhost:5050/api/MegaFormPopup/RazorWidget/List | jq '.[].name'
# → "InteractiveCalculator"
# → "SqlTablePivot"

# Should return embedded .razor source
curl -s 'http://localhost:5050/api/MegaFormPopup/RazorWidget/Source?name=SqlTablePivot' | jq -r '.source' | head -5
# → @* … *@ block

# Should return HTML with correct math
curl -s -X POST http://localhost:5050/api/MegaFormPopup/RazorWidget/Render \
  -H 'Content-Type: application/json' \
  -d '{"templateName":"SqlTablePivot","parameters":{"RowGroupColumn":"R","ColGroupColumn":"C","ValueColumn":"V","Aggregator":"sum"},"sqlRows":[{"R":"a","C":"x","V":1}]}' \
  | jq -r '.html' | head -3
# → <div class="mf-razor-pivot"><table>…

# Same via DNN proxy (forwards to companion)
curl -s -H 'Host: DNN10322_MegaF.AI' http://127.0.0.1/DesktopModules/MegaForm/API/RazorWidget/List | jq '.[].name'
```
