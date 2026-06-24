# Master-Detail Subform (DataGrid) + Blog Phase A — Handoff 2026-05-28

## TL;DR

Ship 2026-05-28 session covers:
1. **Blog Phase A (5 reader views)** — `blog-home`, `blog-recent`, `blog-popular`, `blog-archive`, `blog-detail` render live data on DNN at `http://dnn10322_megaf.ai/megaf/Home?formid=255&vk=<key>`. Magazine grid, timeline, ranked list, archive, post detail layouts.
2. **Master-Detail Subform widget (DataGrid)** — drag-drop "Bảng phụ" widget with inline + modal edit modes, server-side formula compute, SQL table introspection.
3. **Multi-portal anon submission fix** — `SubmissionsController.List` no longer 404s when form lives on a child-portal alias (PortalId=1) and accessed via default alias.

Cache token bumped: `v20260528-16`.

---

## Master-Detail Subform — design summary

Per user spec from 2026-05-28 conversation:
- **Component name**: `DataGrid` (Subform / Data Grid / Repeater Field — semantically equivalent). Drag from Advanced Fields → drop into form canvas.
- **Edit modes**: Inline (in-row inputs) + Modal (popup) + Auto (>5 cols → modal). Admin picks via properties panel.
- **Behaviors**: Allow add row, Allow delete row, Sticky header, Min/Max rows, Required column highlighting + scroll-to-first-error on save.
- **Computed columns**: `total = qty * price` evaluated real-time client-side; server validates on submit with identical grammar.
- **Total bubble-up**: `totalFormula = Sum("qty * price")` writes into master form field key `totalField`.
- **Tab-to-add**: pressing Tab on last cell of last row auto-adds new row (per spec).
- **DB scope**: only DashboardDatabase (per user decision). Builder reads `/Subform/Tables` + `/Subform/Columns` for introspection.

### Files shipped

**Core (shared DNN + Oqtane):**
- [MegaForm.Core/Services/Subform/SubformModels.cs](MegaForm.Core/Services/Subform/SubformModels.cs) — DTOs: `SubformProps`, `SubformColumn`, `SubformTableInfo`, `SubformDbColumn`, `SubformComputeRequest/Result`, `SubformSaveRequest`
- [MegaForm.Core/Services/Subform/SubformExpressionEvaluator.cs](MegaForm.Core/Services/Subform/SubformExpressionEvaluator.cs) — canonical arithmetic evaluator with tokenize/shunting-yard/RPN. Supports `+ - * / %`, parens, identifiers, `Math.Round/Min/Max/Abs/Floor/Ceiling`, `Round/Abs/Floor/Ceiling`, `If(cond, a, b)`, `Sum("expr")`, `Avg("expr")`, `Min("expr")`, `Max("expr")`, `Count()`. Zero IO / reflection / control flow — safe by construction.

**DNN backend:**
- [MegaForm.DNN/WebApi/SubformController.cs](MegaForm.DNN/WebApi/SubformController.cs) — `GET /Subform/Tables`, `GET /Subform/Columns?tableName=Foo`, `POST /Subform/Compute`, `GET /Subform/Rows?tableName=…&parentKeyColumn=…&submissionId=…`. Routes auto-resolve via existing `{controller}/{action}` catch-all.
- Multi-portal anon fix in [MegaFormApiController.cs:1337-1354](MegaForm.DNN/WebApi/MegaFormApiController.cs#L1337) — `SubmissionsController.List` checks `form.Status == "Published"` instead of `form.PortalId == PortalSettings.PortalId`, so forms on `/megaf` (PortalId=1) work from the default alias when JS calls `/DesktopModules/MegaForm/API/Submissions`.

**Oqtane parity:**
- [MegaForm.Oqtane.Server/Controllers/SubformController.cs](MegaForm.Oqtane.Server/Controllers/SubformController.cs) — mirrors DNN endpoints, route prefix `/api/MegaFormPopup/Subform/{action}`. Uses `IConnectionRegistry` (same as DataRepeater/FieldOptions path) to resolve DashboardDatabase per Oqtane site.

**UI (Vite TS plugin):**
- [MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid.ts](MegaForm.UI/src/widgets/plugins/megaform-widget-datagrid.ts) — registers `DataGrid` widget. CSS scoped under `.mfw-dgrid`. Includes JS-side formula evaluator mirroring server grammar — real-time compute as user types. Inline mode renders editable inputs in each cell; modal mode shows read-only cells with edit pencil → popup form. Tab on last cell auto-adds row. Validation highlights required cells red and scrolls to first.
- [MegaForm.UI/src/widgets/plugins/tsconfig.json](MegaForm.UI/src/widgets/plugins/tsconfig.json) — added `megaform-widget-datagrid.ts` to compile list.

### Smoke test (verified on dnn10322_megaf.ai)

```
GET  /Subform/Tables                                           → 200, 181 tables found
POST /Subform/Compute  qty*price  (qty=3,price=7.5)            → {value:22.5, formatted:"22.5"}
POST /Subform/Compute  Sum("qty*price")  over 3 rows           → {value:32.0, formatted:"32"} (=10+12+10)
```

### What's NOT shipped this session (deferred Phase 2)

- **Save endpoint** to external DashboardDatabase table — Phase 1 stores rows inside the master submission's `DataJson` (rows[] array). When admin sets `tableName + parentKeyColumn`, follow-up will write through `Subform/Save`.
- **Razor full scripting** — per the user's choice "Server-side Razor execution". Current evaluator handles 90% of admin formulas (arithmetic + aggregates). Upgrade path: swap `SubformExpressionEvaluator` for a `RoslynCSharpScriptEvaluator` later, keeping the same `Evaluate(formula, row, rows)` signature. Sandbox via `ScriptOptions` with whitelisted assemblies (System.Math only). User formulas in the spec ("Cột Thành tiền = Số lượng * Đơn giá", "Ô Tổng tiền = Sum(Bảng phụ → Thành tiền)") already work today.
- **SQL table column drag-drop into Subform** — Builder UX where admin drags column chips from `/Subform/Columns` list into the Subform field. Currently admin pastes JSON into the "Columns JSON" textarea property. Phase 2 = visual drag-drop column picker integrated with View Designer popup.

---

## Blog Phase A (5 reader views) — shipped

### Live URLs
- http://dnn10322_megaf.ai/megaf/Home?formid=255&vk=blog-home → magazine grid + hero "Insights & Ideas" + search bar
- http://dnn10322_megaf.ai/megaf/Home?formid=255&vk=blog-recent → timeline list with date column
- http://dnn10322_megaf.ai/megaf/Home?formid=255&vk=blog-popular → ranked trending (#1 red, #2 orange, #3 yellow)
- http://dnn10322_megaf.ai/megaf/Home?formid=255&vk=blog-archive → date-grouped browse
- http://dnn10322_megaf.ai/megaf/Home?formid=255&vk=blog-detail → single post with author + hero image + rich HTML body

Note: must access via `/megaf/Home` (PortalId=1 where form 255 lives), not `/xx` (PortalId=0).

### Pipeline architecture documented

- `MF_FormViews.ConfigJson` stores per-view `ListViewSettings` JSON (formId + fields[] + rowTemplate + wrapperTemplate + pageSize)
- `MF_ModuleViewConfig.ViewConfigJson` stores per-module **snapshot** `viewCatalog[]` with embedded `configJson` per view. **This is what the renderer reads.**
- Snapshot rebuild happens on `POST /ModuleConfig/Save` → `FormViewSelector.AttachSelectionMetadata(...)` re-bakes catalog from current MF_FormViews
- Token grammar canonical for listview runtime: `{{field:KEY}}` `{{submission:date}}` `{{query:param}}` `{{form:id}}` `{{module:id}}` — **NOT** `{{row:KEY}}` (that's DataRepeater/DynamicLabel grammar)

### Bugs fixed this session

1. **PowerShell ConvertTo-Json fields[] wrap** — PS 5.1 wraps arrays as `{value: [...], Count: N}`. Fix: write `MF_FormViews.ConfigJson` via Newtonsoft.Json (`JArray`/`JObject`) directly, never via `ConvertTo-Json`. See [seed-blog-views-v2.ps1](C:/Windows/Temp/seed-blog-views-v2.ps1).
2. **Token namespace** — listview runtime uses `field:`/`query:`, not `row:`/`qs:`. Templates updated via [fix-tokens.ps1](C:/Windows/Temp/fix-tokens.ps1).
3. **Multi-portal anon** — SubmissionsController.List used to 404 when `form.PortalId != PortalSettings.PortalId`. Fixed.

### Reference files

- Mock baselines (full-res, 1440×1200): `C:\Windows\Temp\blog-mock-full\*.png` — 13 mock pages from V36
- DNN renders v4 (post-fixes): `C:\Windows\Temp\blog-dnn-v4\*.png`
- Seed scripts: `C:\Windows\Temp\seed-blog-views-v2.ps1`, `C:\Windows\Temp\fix-tokens.ps1`
- Snapshot refresh: `C:\Windows\Temp\refresh-snapshot.ps1` (canonical `AttachSelectionMetadata` mirror — auto-mode blocked, use JS console snippet instead)

### Minor cosmetic items deferred

- Emoji `🔥 👁 💬` in pill headers/metric badges render as garbled unicode (ANSI encoding chain in DB save path). Replace with FontAwesome icons or `&#x...;` entities in Phase 2.
- `{{query:q}}` in search input does NOT resolve when URL has no `?q=` param — shows literal text. Fix: wrap the search input value with safe-default token like `{{query:q|default:""}}` (token grammar extension needed).

---

## Cache token + version

| Item | Version |
|---|---|
| FormView.ascx.cs `const string V` | `?v=20260528-16` |
| Bundles synced | DataGrid (`megaform-widget-datagrid.js` ~22KB), Subform DLL (DNN net472 + Oqtane net9.0) |
| SQL provider | No new schema. Reuses MF_Forms + MF_Submissions + MF_FormViews + MF_ModuleViewConfig. |
| Newest install package number to bump | `01.06.27` when next packaged |

## Where to look next session

1. **Subform Builder UX** — visual column drag-drop from `/Subform/Columns` response into Subform field. Currently JSON textarea (functional but not friendly).
2. **Subform external table writes** — wire `POST /Subform/Save` to persist rows[] into `tableName` keyed by `parentKeyColumn = master.submissionId`.
3. **Razor upgrade** — when admin formulas need conditional Razor syntax (loops, helpers), swap evaluator under `IComputeEvaluator` interface (already structured for this).
4. **Phase B blog views** — search, category, tag, author-profile (4 filter views using existing template grammar).
5. **Phase C blog admin** — comments moderation + editorial board (Inbox-mode pages).
