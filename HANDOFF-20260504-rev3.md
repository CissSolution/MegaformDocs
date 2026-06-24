# MegaForm — Handoff 2026-05-04 (rev 3, golf templates v2)

Tổng cộng **4 sửa đổi nguồn** + **2 templates Golf** (Individual + Pair, mô phỏng
chính xác 2 mock GolfGenius) + **bundle đã rebuild và đồng bộ sẵn sang 5 mirror**.

## 1. Các sửa đổi TS/ASCX

### a) `MegaForm.UI/src/builder/core.ts` — `CreateFieldGuard v20260504-12`
WidgetPropsGuard strip key root-level khỏi widgetProps khi phát hiện template
JSON bị nhồi nhầm (defense against the corruption pattern).

### b) `MegaForm.UI/src/builder/templates.ts` — `ImportFormGuard v20260504-12`
Auto-recover khi import file có shape lỗi + toast warning.

### c) `MegaForm.UI/src/builder/dom.ts` — `ImportButton v20260504-12`
Thêm nút **"Import JSON…"** vào gallery `tpl-bar` + emit badge
`__MF_IMPORT_BUTTON_BADGE__` để diagnose deploy.

### d) `MegaForm.DNN/Views/FormView.ascx` — `AdminDashboardModeGate v20260504-12`
Cho phép admin shell hiển thị bất kể DNN Edit Mode khi module set Admin
Dashboard mode. Trước đây admin phải click pencil mỗi lần — bug đã fix.

## 2. Templates Golf — 2 patterns mô phỏng từ GolfGenius

### `golf-tournament-individual.json` (Mock 1)
Mô phỏng: https://lbgf-2026seniorchampionship1.golfgenius.com/pages/12640022580808414882

**Pattern phát hiện trong DOM thực:**
- Leaderboard 8 cols: Pos | Player | To Par Gross | R1 | R2 SKY | R3 Eldo | Total Gross
- Score cell có course code suffix (SKY=Skylinks, Eldo=El Dorado)
- Detail expand: header "Wed, April 22 — El Dorado Park Golf Course (Blue - Men)"
  + tee header + score row (1 row per round, **KHÔNG có yardage/par/SI rows**)
- CSS classes mô phỏng: `simple_circle`/`double_circle` (birdie/eagle red),
  `simple_square`/`double_square` (bogey/dblbogey navy), par plain

**Layout config:** SLIM mode — `customCss` ẩn `.mfgs-yardage`, `.mfgs-par-row`,
`.mfgs-si-row`, `.mfgs-slope`. Chỉ show round header + score row.

**SQL:** master pivots TOP 3 EventDates → R1/R2/R3 cols; detail joins course
metadata + filters cùng TOP 3 dates qua CTE.

### `golf-tournament-pair.json` (Mock 2)
Mô phỏng: https://www.golfgenius.com/pages/5155134566574327893

**Pattern phát hiện trong DOM thực:**
- Leaderboard cols: Pos | Players ("Tina + Mark Smith Prestwick GC") |
  To Baseline Par | Best Net | Net Total
- Detail expand: tee_header + Strokes label + tee_data (Red - Ladies Tee /
  Slope) + **yardage_row + par_row + handicap_row (Stroke Index)** +
  1 net-line per player (2 lines per pair)
- Score cells có dấu `●` (handicap stroke) prefix + class `birdie-hole`
  /`eagle-hole`/`par-hole`/`plus1-hole`/`plus2-hole`. Eagle có `●●`.

**Layout config:** FULL mode — giữ Yardage/Par/SI rows visible + 1 row per player.

**SQL:** master pairs adjacent same-flight players (placeholder logic — replace
với pair-table thật khi có); detail accepts `:parentId` = "Player1 + Player2",
splits trên ` + ` và returns 2 rows (one per player).

## 3. Locations (cả 2 templates ship vào 3 folder)

```
MegaForm.Web/App_Data/MegaForm/Templates/golf-tournament-individual.json
MegaForm.Web/App_Data/MegaForm/Templates/golf-tournament-pair.json
MegaForm.UI/templates/golf-tournament-individual.json
MegaForm.UI/templates/golf-tournament-pair.json
DesktopModules/MegaForm/Templates/golf-tournament-individual.json
DesktopModules/MegaForm/Templates/golf-tournament-pair.json
```

Template scanner sẽ pickup tự động — sẽ hiện trong gallery với 2 cards riêng,
icon ⛳ (individual) và 👥 (pair).

## 4. Bundle JS đã rebuild + sync 5 mirrors

```
MegaForm.Web/wwwroot/megaform/js/bundles/megaform-builder.js                ✓
DesktopModules/MegaForm/Assets/js/bundles/megaform-builder.js               ✓
MegaForm.Umbraco/wwwroot/js/bundles/megaform-builder.js                    ✓
MegaForm.Oqtane.Server/wwwroot/Modules/MegaForm/js/bundles/megaform-builder.js ✓
Assets/js/bundles/megaform-builder.js                                       ✓
```

Verified all 5 contain badges:
`CreateFieldGuard v20260504-12`, `ImportFormGuard v20260504-12`,
`ImportButton v20260504-12`, `tpl-import-btn`, `__MF_IMPORT_BUTTON_BADGE__`.

## 5. Deploy & Test

1. Sync solution lên DNN site root; bump cache.
2. Mở `M1` (không cần click pencil) — Admin Dashboard hiện ngay.
3. Templates → gallery sẽ có 2 templates Golf (search "golf" → 2 results).
4. Tạo form mới từ template "Individual" → Save → Publish → test RederHost
   Phải hiện: leaderboard accordion theo Flight, click player → expand inline 3
   round scorecards SLIM (chỉ score row, không yardage/par/SI), score marks
   circle (under par) / plain (par) / square (over par).
5. Tạo form mới từ template "Pair" → tương tự nhưng FULL layout với Yardage/
   Par/Stroke Index rows + 1 row per player.

## 6. Known limitation — Pair template SQL

Pair master query hiện tại pairs adjacent same-flight players bằng row_number
(placeholder logic — không phản ánh real teams). Khi user có pair table thật
(ví dụ `dbo.PairRegistrations` với pair_id, p1_member_id, p2_member_id), thay
master SQL bằng query đúng. Detail SQL chỉ cần parsing trên ` + ` của parentId.

