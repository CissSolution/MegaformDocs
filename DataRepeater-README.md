# MegaForm DataRepeater Widget — v20260428-01

## Tổng quan

Widget hiển thị dữ liệu từ SQL database với template XSL-style tokenized,
hỗ trợ drill-down multi-level, filters, pagination, chart, và export.

**Display-only** — `collect()` trả `null`, không lưu data khi submit form.

## Files mới (6 files)

| File | Lines | Mô tả |
|---|---|---|
| `MegaForm.Core/Models/DataRepeaterModels.cs` | 131 | Models shared tất cả platforms |
| `MegaForm.Core/Services/DataRepeaterService.cs` | 460 | Core service: execute queries, template, export |
| `MegaForm.Web/Controllers/DataRepeaterController.cs` | 129 | Web/Oqtane API endpoints |
| `MegaForm.DNN/WebApi/DataRepeaterApiController.cs` | 152 | DNN mirror controller |
| `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts` | 966 | TS frontend widget (Phase 1+2+3) |
| `Assets/css/plugins/megaform-widget-data-repeater.css` | 272 | CSS (prefix .mfdr-) |

## Files chỉnh sửa (3 files — MINIMAL CHANGE)

| File | Thay đổi |
|---|---|
| `MegaForm.UI/src/widgets/plugins/tsconfig.json` | +1 dòng trong `include` |
| `MegaForm.UI/src/shared/platform-host.ts` | +1 dòng trong `EMBED_PLUGIN_JS` |
| `MegaForm.DNN/WebApi/MegaFormApiController.cs` | +18 dòng routes trước catch-all |

## CSS copies (auto-sync by build, pre-copied for convenience)

- `MegaForm.Web/wwwroot/megaform/css/plugins/megaform-widget-data-repeater.css`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/css/plugins/megaform-widget-data-repeater.css`
- `DesktopModules/MegaForm/Assets/css/plugins/megaform-widget-data-repeater.css`

## Build

```bash
# 1. TS Plugin → JS (standalone tsc, không qua Vite)
tsc --project MegaForm.UI/src/widgets/plugins/tsconfig.json
# Output: Assets/js/plugins/megaform-widget-data-repeater.js

# 2. Hoặc chạy full build (sẽ auto-sync tất cả platforms)
BuildTS.bat widgets
```

## DI — Không cần thêm

`DataRepeaterController` tự tạo `DataRepeaterService` từ injected `IConnectionRegistry` + `IFormRepository`
— cả hai đã registered sẵn trong `Program.cs`.

## Verify Badge

Mở DevTools Console:
```js
console.log(window.__MF_DATA_REPEATER_BADGE__);
// Kỳ vọng: "DataRepeater v20260428-01"
```

## Phases đã implement

### Phase 1 — MVP
- ✅ Master query + template rendering ({token} replacement)
- ✅ 1-level drill-down (click → expand → AJAX load detail)
- ✅ Auto-generate template từ columns nếu không có custom template
- ✅ SQLite + SQL Server + PostgreSQL + MySQL support

### Phase 2 — Enhanced
- ✅ Conditional formatting: `{if:col op value}...{/if}`
- ✅ Pagination (page buttons + status bar)
- ✅ Auto-refresh (`refreshInterval` seconds)
- ✅ Export CSV (server-side) + PDF (client-side print)
- ✅ Badges: `{col|badge:green}`, `{col|badge:red}`

### Phase 3 — Advanced
- ✅ Multi-level recursive drill-down (n levels deep)
- ✅ Filter widgets (dropdown from SQL, text input, date range)
- ✅ Chart visualization (bar, line, pie — canvas-based, zero deps)
- ✅ Stored procedure support (`dataSource: "storedproc"`)
- ✅ Column sorting (click header)

## Security

1. Client KHÔNG gửi raw SQL — chỉ `formId` + `widgetKey`
2. SQL đọc từ form schema server-side (widgetProps)
3. Connection strings từ `IConnectionRegistry` (server Settings, KHÔNG từ client)
4. DDL/DML blocked — chỉ SELECT allowed (regex whitelist)
5. Row cap: max 5000 server-side
6. Parameters luôn parameterized (`:parentId`, `:filterValue`)
7. Query timeout: 30 seconds

## Template Syntax

```html
<!-- Basic token -->
{column_name}

<!-- With pipe formatters -->
{price|number}           → locale number format
{created|date}           → locale date format  
{player_name|link:detail} → clickable drill-down link
{url|raw}                → no HTML escaping
{status|badge:green}     → colored badge

<!-- Conditional blocks -->
{if:score < 72}class="birdie"{/if}
{if:status == 'active'}✅{/if}
{if:name contains 'Kim'}⭐{/if}

<!-- Special tokens -->
{#index}  → row index (0-based)
{#num}    → row number (1-based)

<!-- Repeater block -->
{#each row}
  <tr><td>{pos}</td><td>{player|link:detail}</td></tr>
{/each}
```

## API Endpoints

| Method | URL | Mô tả |
|---|---|---|
| GET | `/api/MegaForm/DataRepeater/Query` | Execute master/detail query |
| GET | `/api/MegaForm/DataRepeater/FilterOptions` | Get filter dropdown options |
| GET | `/api/MegaForm/DataRepeater/Export` | Export CSV |

DNN: thay `/api/MegaForm/` bằng `/DesktopModules/MegaForm/API/`

## widgetProps Schema (Builder config)

```json
{
  "dataSource": "sql",
  "connectionKey": "DashboardDatabase",
  "databaseType": "",
  "masterQuery": "SELECT pos, player, r1, r2, r3, total FROM leaderboard",
  "masterTemplate": "<table>...</table>",
  "detailLevels": [
    {
      "query": "SELECT hole, par, score FROM scorecard WHERE player_id = :parentId",
      "template": "<table>...</table>",
      "triggerCol": "player"
    }
  ],
  "filters": [
    {
      "key": "flight",
      "label": "Flight",
      "filterType": "dropdown",
      "query": "SELECT DISTINCT flight FROM leaderboard",
      "paramName": "flight"
    }
  ],
  "pageSize": 50,
  "refreshInterval": 0,
  "emptyMessage": "No data found.",
  "allowExportCsv": true,
  "chartType": "bar",
  "chartLabelCol": "player",
  "chartValueCol": "total"
}
```
