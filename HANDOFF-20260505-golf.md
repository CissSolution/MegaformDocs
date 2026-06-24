# HANDOFF — MegaForm Golf Tournament Dashboard

**Ngày:** 2026-05-05
**Người ban giao:** Hung (daotuanhung@gmail.com)
**Mục tiêu:** Build form Golf scoreboard giống GolfGenius, chạy trên DNN 10.3.2.2 site `http://dnn10322_megaf.ai/`, đọc dữ liệu từ DB `Golf` (cross-DB từ DashboardDatabase).

---

## 1. Cấu trúc solution

### Canonical (chỉ sửa ở đây)
```
E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\
├── MegaForm.Core\                     # Models, services (cross-platform .NET)
├── MegaForm.UI\src\                   # TypeScript widget plugins, builder, designers
│   ├── widgets\plugins\
│   │   ├── megaform-widget-data-repeater.ts    (76 KB) — chính
│   │   └── megaform-widget-golf-scorecard.ts   (52 KB)
│   ├── view-designer\
│   │   ├── golf-designer.ts
│   │   └── datarepeater-designer.ts
│   └── builder\, loader\, themes\, ...
├── MegaForm.DNN\                      # DNN-specific: ascx views, WebApi controllers
│   ├── Views\FormView.ascx.cs                  # Render hub, BuildAssetManifest
│   └── WebApi\DataRepeaterApiController.cs     # /API/DataRepeater/Query, FilterOptions, Export
├── MegaForm.Oqtane.Server\            # Oqtane parallel (mirror các fix DNN sang đây)
├── MegaForm.Web\                      # Standalone web (test bench)
├── MegaForm.Umbraco\                  # Umbraco bridge
└── Assets\                            # Build outputs (auto-sync via Vite plugin)
    ├── js\bundles\megaform-builder.js
    ├── js\plugins\megaform-widget-*.js
    ├── js\megaform-*-designer.js
    └── css\plugins\megaform-widget-*.css
```

### Deploy targets (KHÔNG sửa trực tiếp)
```
E:\DNN_SITES\DNN10322_MegaF\Website\
├── bin\MegaForm.DNN.dll                               # mirror MegaForm.DNN/bin/Release/net472/
├── bin\MegaForm.Core.dll                              # mirror MegaForm.Core/bin/Release/net472/
└── DesktopModules\MegaForm\Assets\                    # mirror MegaFormSolution_280_Oqtane_um\Assets\
```

---

## 2. Build + deploy

### Build TS bundles
```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.UI"
npm install                  # chỉ chạy lần đầu hoặc khi đổi package.json
npm run build                # full chain (loader, i18n, widgets, renderer, builder, ...)
npm run build:golf-designer
npm run build:datarepeater-designer
cd src\widgets\plugins
npx tsc -p tsconfig.json     # rebuild plugin scripts
```
Vite plugin `sync-platforms` tự copy bundle sang **4 đích** trong canonical:
- `Assets/`
- `MegaForm.Web/wwwroot/megaform/`
- `MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/`
- `DesktopModules/MegaForm/Assets/` (in-tree mirror)

### Build C#
```powershell
cd "E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um\MegaForm.DNN"
dotnet build -c Release --nologo
```
DLL ở `bin\Release\net472\MegaForm.DNN.dll`.

### Deploy lên DNN site
```powershell
$src = 'E:\DNNDEFENDER AND AI DESIGNES\AI DESIGNES\MegaFormSolution_280_Oqtane_um'
$dst = 'E:\DNN_SITES\DNN10322_MegaF\Website'
# DLL
Copy-Item "$src\MegaForm.DNN\bin\Release\net472\MegaForm.DNN.dll" "$dst\bin\MegaForm.DNN.dll" -Force
Copy-Item "$src\MegaForm.Core\bin\Release\net472\MegaForm.Core.dll" "$dst\bin\MegaForm.Core.dll" -Force
# Assets (loại trừ source maps, .ts)
robocopy "$src\Assets" "$dst\DesktopModules\MegaForm\Assets" /E /XF *.ts *.map *.tsx /NFL /NDL /NP /R:1 /W:1
```
DNN tự recycle app pool khi `bin\*.dll` thay đổi.

### Smoke test
```powershell
$base = 'http://dnn10322_megaf.ai'
Invoke-WebRequest "$base/DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js" -UseBasicParsing |
  Select-Object -Expand Content | Select-String 'CreateFieldGuard v20260504-12','ImportFormGuard v20260504-12'
```

---

## 3. Form đang làm: **GOLF v17 (FormId 240)**

### URL
`http://dnn10322_megaf.ai/RederHost?formid=240`

### Cấu trúc
3 DataRepeater fields:
| Key | Mục đích | Source |
|---|---|---|
| `dr_leaderboard` | Leaderboard chính, group theo Flight (accordion), drill xuống scorecard | `Golf.dbo.resultGame` + drill `Golf.dbo.CardResultNew + EventCourse` |
| `dr_skins_gross` | Bảng Gross Skins | `Golf.dbo.Skins WHERE SkinsType='GROSS'` |
| `dr_skins_net` | Bảng Net Skins | `Golf.dbo.Skins WHERE SkinsType='NET'` |

Filter dropdown: `filter1Param=eventDate` — list 200 events mới nhất, label `[year] - [date] - [game]`.

### SQL pattern (quan trọng)
- DataRepeaterService **chặn** `INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE/EXEC/EXECUTE/GRANT/REVOKE/MERGE` (regex ở `MegaForm.Core\Services\DataRepeaterService.cs:34`).
- **Không gọi được sproc** qua `EXEC` — phải inline body sproc dưới dạng `SELECT`.
- Các sproc của Bob (`usp_GetEventsForYear`, `usp_ScoringGameLiveEventDate`, `usp_ScoringSkinsNew`) thực chất chỉ `SELECT * FROM <table> WHERE ...` → đã được rewrite thành SELECT trực tiếp.
- Param syntax: dùng `:paramName` trong SQL → service tự đổi sang `@paramName` trước khi exec (`_tokenParam` regex line 38).
- `:eventDate` lấy từ filter1, `:parentId` từ click drill-down.

### Lookup keys
- `resultGame.DisplayName` = surname-only (vd "Edwards")
- `CardResultNew.LastName` = surname (vd "Edwards"), `CardResultNew.DisplayName` = full name (vd "Robert Edwards")
- → **Drill cá nhân join `c.LastName = :parentId`** (không dùng DisplayName)
- Drill team: `c.Team = TRY_CAST(REPLACE(:parentId, 'T', '') AS int)` (DrillKey set là `'T<n>'` khi `Team>0 AND IsIndividualGame=0`)
- Customer Bob nói sẽ populate `GhinNo` vào CardResultNew → khi đó nên đổi join sang `GhinNo` cho chuẩn

### Demo user (test mark CSS)
Đã insert vào `Golf.dbo.CardResultNew` + `Golf.dbo.resultGame` (event mới nhất `2026-04-26`):
- Tên: `ZZZ Demo Player` (LastName: `Demo`, Flight 9 Position 99 → cuối list)
- Scores phủ đủ 5 class: eagle, birdie, par, bogey, dblbogey (xem chi tiết bảng dưới)
- Để xoá: `DELETE FROM Golf.dbo.CardResultNew WHERE LastName='Demo'; DELETE FROM Golf.dbo.resultGame WHERE DisplayName LIKE 'ZZZ%';`

| h | par | sc | class       | h | par | sc | class       |
|---|----:|---:|-------------|---|----:|---:|-------------|
| 1 | 4 | 2 | eagle | 10 | 4 | 7 | dblbogey (triple) |
| 2 | 5 | 3 | eagle | 11 | 3 | 5 | dblbogey |
| 3 | 3 | 2 | birdie | 12 | 4 | 4 | par |
| 4 | 4 | 3 | birdie | 13 | 5 | 4 | birdie |
| 5 | 4 | 4 | par | 14 | 4 | 3 | birdie |
| 6 | 3 | 3 | par | 15 | 4 | 6 | dblbogey |
| 7 | 5 | 6 | bogey | 16 | 3 | 4 | bogey |
| 8 | 4 | 5 | bogey | 17 | 5 | 5 | par |
| 9 | 4 | 6 | dblbogey | 18 | 4 | 5 | bogey |

---

## 4. Mock UI tham chiếu

| URL | Layout |
|---|---|
| https://lbgf-2026seniorchampionship1.golfgenius.com/pages/12640022580808414882 | Individual stroke-play, multi-round R1/R2/R3, vòng đỏ birdie + vuông navy bogey |
| https://www.golfgenius.com/pages/5155134566574327893 | Pair (2-person), full Yardage/Par/SI rows |

CSS đã match: `.mfgs-birdie/.mfgs-eagle` = vòng đỏ `#c0392b`, `.mfgs-bogey/.mfgs-dblbogey` = vuông navy `#2c3e50`. Eagle/dblbogey thêm `box-shadow inset` để có hiệu ứng double outline.

---

## 5. Vấn đề ĐANG DANG DỞ

### ❌ Year-picker dropdown chained
**Hiện trạng:** chỉ 1 dropdown event, label có year prefix nên user phải scroll trong 200 options. User yêu cầu **2 dropdown chuỗi** (chọn Year → refresh Event dropdown).

**Lý do chưa làm:**
- `DataRepeaterApiController.FilterOptions` không nhận tham số từ client
- `DataRepeaterService.ExecuteFilterQuery` chỉ chạy `filter.Query` cố định, không bind biến

**Cần làm:**
1. Sửa `DataRepeaterApiController.cs:85-95` để accept `?contextJson={...}`
2. Sửa `DataRepeaterService.cs:136-176` `ExecuteFilterQuery` parse `contextJson`, bind `:year` (hoặc các param khác) vào filter SQL
3. Sửa TS `MegaForm.UI/src/widgets/plugins/megaform-widget-data-repeater.ts:1188-1207` — listen `change` trên filter1 select → refetch filter2 với `contextJson={filter1: value}`
4. Build + deploy DLL + JS bundle

### ❌ Dropdown chỉ hiển thị "All" khi mở
**Trạng thái:** API `/DataRepeater/FilterOptions?formId=240&widgetKey=dr_leaderboard&filterKey=filter1` trả về 200 options OK (verified). Nhưng user báo dropdown trên page không xổ — có thể browser cache JS cũ hoặc race với async load. **Test lại sau khi hard-refresh**.

### ❌ Dropdown 2 dropdowns chuỗi (year + event)
Xem mục trên.

### ⚠️ ClosestToPin (CTP)
Bob nói table chưa tạo ("this is new so you do not have a table for it in database"). Khi có table sẽ thêm 1 DataRepeater nữa, conditional empty.

### ⚠️ Drill team game
Đã handle `'T<n>'` cho DrillKey nhưng **chưa test với event team-game thật** (mới chỉ test individual). Mock 2 (https://www.golfgenius.com/pages/5155134566574327893) là pair format — cần test với event date có pair game.

### ⚠️ Multi-round scorecard
Drill query hiện chỉ trả 1 round (event đã chọn). Mock 1 (Senior Championship) hiển thị 3 rounds liên tiếp R1/R2/R3 — cần đổi `WHERE c.EventDate = sd.d` thành `WHERE c.EventDate IN (TOP 3 dates DESC)` cho multi-round event.

---

## 6. Bug-list đã fix gần đây

| Bug | Fix | Marker |
|---|---|---|
| `EXEC` bị chặn → query trả empty | Inline sproc body thành SELECT | — |
| Drill 0 rows do join `DisplayName` | Đổi sang `LastName` | form 240 schema |
| Score mark méo (rectangle thay vì square) | Render emit `<span class="mfgs-birdie">` không có `mfgs-mark` → CSS base size không apply. Fix: gộp 5 variant class cùng selector base | `.mfgs-eagle, .mfgs-birdie, ... { width:24px; height:24px }` |
| Page chỉ hiện emoji, widget không render | customCss `[id^='mf-fields-container-'] > div { display:block; ... }` phá layout container | Bỏ override |
| `BuildAssetManifest` thiếu cases datarepeater/golfscorecard/subform/contentslider/qrcode | Thêm cases ở `FormView.ascx.cs` + `MegaFormController.cs` (Oqtane mirror) | `CoreAssetManifest v20260504-05` |
| Filter1 API call dùng `filterKey=eventDate` (param name) thay vì `filterKey=filter1` (registered key) | FE đã dùng đúng (`filter1`) — chỉ khi test bằng tay mới sai | — |
| App Pool không có quyền cross-DB Golf | Grant `IIS APPPOOL\DNN10322_MegaF.AI_nvQuickSite` `db_datareader` + `EXECUTE on schema::dbo` Golf DB | `E:\DNN_SITES\DNN10322_MegaF\grant_apppool_to_golf.sql` |

---

## 7. Versioning convention

Mọi TS file thay đổi phải bump 1 badge constant `<Name> vYYYYMMDD-NN` để verify served bytes có đúng version mới hay không. Sau build + deploy, smoke test bằng:
```powershell
(Invoke-WebRequest 'http://dnn10322_megaf.ai/DesktopModules/MegaForm/Assets/js/plugins/megaform-widget-data-repeater.js' -UseBasicParsing).Content |
  Select-String 'DataRepeater v20260504-10'
```
Hiện tại các badge mới nhất:
- `CreateFieldGuard v20260504-12` (builder/core.ts)
- `ImportFormGuard v20260504-12` (builder/templates.ts)
- `ImportButton v20260504-12` (builder/dom.ts)
- `DataRepeater v20260504-10` (widgets/plugins/data-repeater.ts)
- `GolfScorecard v20260504-10` (widgets/plugins/golf-scorecard.ts)
- `PopupOverlayBuilderFix v20260504-08` (view-designer/shared.ts)
- `GolfDesigner v20260504-01`, `DataRepeaterDesigner v20260504-06`
- `CoreAssetManifest v20260504-05` (FormView.ascx.cs + MegaFormController.cs)

---

## 8. Connection registry

DataRepeater dùng `connectionKey: 'DashboardDatabase'`. Map ở **DNN portal settings** (qua admin UI). Hiện trỏ về connection có cross-DB access tới `Golf`. Nếu add connection mới → đăng ký qua `MegaForm Settings → Connections`.

---

## 9. Form history (newest first)

| FormId | Title | Notes |
|---:|---|---|
| **240** | GOLF v17 - Clean (no customHtml, year-prefixed event dropdown) | **Hiện hành** |
| 239 | GOLF v16.2 - Bob queries inlined | Bị render fail (do customHtml + customCss `[id^='...']` override) |
| 237 | GOLF v15 - DrillKey hidden + simpler detail | Tham chiếu cũ — drill join `LastName` (đúng) |
| 222 | GOLF v11 - Event dropdown fix | Snapshot cũ |
| 216 | Golf Tournament - Individual (v9, customer DB schema) | Snapshot trước khi rewrite |

Form 232–238 là test/inspect, có thể xoá để dọn.

---

## 10. Next steps (đề xuất ưu tiên)

1. **(P0)** Implement chained filter (year → event) — code change ở 3 chỗ kể trên (mục 5)
2. **(P1)** Test pair/team game với event date có team game thật — verify DrillKey `'T<n>'`
3. **(P1)** Multi-round scorecard cho championship event (TOP 3 dates)
4. **(P2)** ClosestToPin DataRepeater (chờ Bob tạo table)
5. **(P2)** Add export PDF cho leaderboard (current chỉ có CSV)
6. **(P3)** Replace Demo user bằng real player data sau khi verify CSS marks OK

---

## 11. Liên hệ + tài liệu

- **Customer (Bob)** cấp các sproc + DB schema. Email/issue tracker: <chưa có>
- **Memory file** của Claude Code: `C:\Users\Administrator\.claude\projects\e--DNNDEFENDER-AND-AI-DESIGNES-AI-DESIGNES-MegaFormSolution-260-Oqtane-um---CodeStester\memory\MEMORY.md` — note quan trọng:
  - Path đã chuyển từ `_260_…CodeStester` sang `_280_Oqtane_um` (2026-05-04)
  - Old tree là HISTORICAL, không sửa
- **Handoff trước:** `HANDOFF-20260504-rev3.md` (ở canonical root)
- **DB grant script:** `E:\DNN_SITES\DNN10322_MegaF\grant_apppool_to_golf.sql`

---

## 12. Quick troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Fix |
|---|---|---|
| DataRepeater trả `Only SELECT queries are allowed` | Query có `INSERT/EXEC/...` | Inline thành SELECT thuần |
| Drill 0 rows | Sai key join (DisplayName vs LastName) | Match `c.LastName = :parentId` |
| Page render trắng, chỉ thấy customHtml | customCss override `[id^='mf-fields-container-']` | Bỏ override |
| Score marks bị méo | Render emit class variant không có `mfgs-mark` base | Apply size lên 5 variant classes |
| Bundle không cập nhật sau deploy | Browser cache | Hard refresh (Ctrl+F5) hoặc bump cdv query string |
| App pool không thấy Golf DB | Quyền chưa cấp | Run `grant_apppool_to_golf.sql` |
| Cross-platform mismatch (Oqtane vs DNN) | Quên mirror C# fix sang `MegaForm.Oqtane.Server\Controllers\MegaFormController.cs` | Apply same fix vào cả 2 file |
