# HANDOFF 2026-07-10 — Advanced filter: z-index bug thật, i18n 18 locale, preset persist

## 1. Root cause của "nút không drop" (KHÔNG phải cache)

Handoff phiên trước kết luận sai. Cache-buster B382 **không** sửa được gì.

- `.mf-advf-pop` (popover của All fields / Add filter / Presets) được **portal vào `document.body`** với
  `position:absolute; z-index:1200`.
- Panel admin của Oqtane render trong `.mf-oq-surface.is-fs` — `MegaForm.Oqtane.Client/Index.razor:391`:
  ```css
  .mf-oq-surface.is-fs { position: fixed; inset: 0; z-index: 10000; overflow: auto; }
  ```
- `10000 > 1200` + nền đục `#f8fafc` ⇒ popover **được tạo, đúng toạ độ, nhưng bị surface phủ lên**.
  Không lỗi console. `document.elementFromPoint()` tại tâm popover trả về `TH.mf-th-sortable` (bảng bên dưới).

### Vì sao QA headless phiên trước "pass"
`IsPanelInline => _panelInline || IsEditMode` (`Index.razor:1302`). Fullscreen là **opt-in, persist qua
localStorage `mf-surface-fs`**. Playwright context sạch ⇒ luôn `is-inline` ⇒ popover hiện bình thường.
Người dùng thật đã bật fullscreen (nút góc phải hiện **"Windowed"**) ⇒ `is-fs` ⇒ popover chìm.

> **QA gotcha:** mọi visual QA panel admin phải chạy **cả 2 mode** `is-inline` và `is-fs`.
> Bật bằng cách click `.mf-fs-toggle`.

`Manage Columns` vẫn chạy vì nó render *inline trong surface*, không portal ra body.

## 2. Đã sửa

| File | Thay đổi |
|---|---|
| `MegaForm.UI/src/styles/megaform-submissions-ts.css` | `.mf-advf-pop` → `position:fixed; z-index:200000`. Thêm `.mf-advf-preset-row` / `.mf-advf-preset-del`. |
| `MegaForm.UI/src/submissions/submission-advanced-filter.ts` | `openPopover.reposition()` dùng toạ độ **viewport** (bỏ `window.scrollX/Y`) + **flip lên** khi tràn đáy viewport. Preset **persist**. i18n toàn bộ. Escape label field trong chip. |
| `MegaForm.UI/src/submissions/SubmissionsShell.ts` | `advDeps().getFormKey()` → bucket `f<formId>` / `all`. |

**Tầng z-index có sẵn** (đừng phá): surface `is-fs` 10000 → **popover 200000** → `.mf-modal-overlay` 200001
→ detail sheet 200030 (set inline ở `SubmissionsShell.ts:1426`) → `.mf-tip` 200060 → dialog `.mf-sat-*` 2147483600.
Một dev trước đã vá tay đúng bug này cho sheet — nay popover theo cùng tầng.

## 3. Preset "không lưu được" → đã persist

Trước: `advState.presets` chỉ là module state ⇒ reload là mất.
Nay: `localStorage['mf-subs-presets-v1']` = map `bucket → AdvSavedPreset[]`, **đúng convention của
`mf-subs-columns-v4`** (per-form, không rò rỉ filter giữa các form).

- Preset mặc định (`preset-new`) **không lưu** → tên luôn theo locale hiện tại.
- `isValidPreset()` loại dữ liệu hỏng/hand-edit (đã test: `'garbage'`, `null`, `filters:'nope'` → bỏ, không crash).
- Thêm **nút xoá** (icon `trash`, hiện khi hover) — vì preset giờ sống mãi, phải có đường thoát.

Verified trên :5122: lưu → reload → còn nguyên → load lại đúng chip + 50 rows → xoá → `{"f2":[]}`.

## 4. i18n — 18 locale × 44 key

Phạm vi anh chốt: **en-US + 11 REQUIRED (de, pt-BR, it, nl, pl, ru, tr, th, id, hi, ar) + 6 beta
(es, fr, ja, ko, vi, zh)**. 20 locale còn lại fallback tiếng Anh (không vỡ build).

- 40 key mới `subs.advf.*` (kể cả **nhãn toán tử**: contains / is exactly / before…) + `subs.range_90d`.
- 4 key `subs.*` **đã bị tham chiếu mà chưa bao giờ có trong en-US** (drift phiên trước, làm gate đỏ):
  `subs.col_submitted_by`, `subs.col_device`, `subs.filtered_count`, `subs.filtered_count_hint`.
- Dùng lại key có sẵn `subs.response_fields`, `subs.range_*` thay vì tạo trùng.
- `value_ph = "Lọc theo {field}…"` — nội suy, **không nối chuỗi** (trật tự từ khác nhau theo ngôn ngữ).

Nguồn: `MegaForm.UI/public/i18n/*.json`. **`sync-platforms` KHÔNG copy JSON i18n** (chỉ bundle) → đã
mirror tay sang 9 thư mục (`Assets/js/{i18n,builder/i18n,bundles/i18n,plugins/i18n}`, Oqtane wwwroot ×4,
Web ×2). Script dùng: xem `scratchpad/add-advf-i18n.cjs`.

Gate `node tools/i18n-check.cjs`: Check 1/3/4 **OK toàn bộ REQUIRED**.

## 5. Còn nợ (KHÔNG do phiên này)

1. **`i18n-check` vẫn FAIL**: 23 key `vd.set.*` (view-designer `settings-popup.ts`) được tham chiếu nhưng
   thiếu trong en-US. Drift có sẵn từ phiên trước (HEAD không có ref nào). Chặn `npm run build` (full),
   **không** chặn `npm run build:<entry>`.
2. **AssetVersion vẫn `B382`** → hot-swap **không đổi `?v`**. Tab khác của anh có thể còn cache bản cũ:
   **Ctrl+Shift+R**. Muốn ship phải bump `MegaFormAssetVersion` (B383) + `ModuleInfo.Version` + repack.
3. **`tsc` lỗi có sẵn**: `src/builder/workflow/wf-app.ts(785,3) TS1128`. Không liên quan.
4. **Form 2 (:5122) KHÔNG có field Priority/Category** — trái với handoff trước. Xác minh bằng DB:
   - `SchemaJson` chỉ có 5 field: `ticketNumber, requesterName, email, subject, description` (đều Text/Email/Textarea).
   - Chữ `category` trong schema chỉ là `eventCategory` của Google Analytics (dương tính giả).
   - Nhưng **200/200 submission có `priority` trong `DataJson`**.
   - `getResponseFieldDefs()` (`SubmissionsShell.ts:254`) **ưu tiên schema khi có** ⇒ Priority không bao giờ
     xuất hiện trong "Add filter". Muốn test `Priority=Urgent` phải thêm field `priority`/`category`
     (type Select + options) vào `MF_Forms.SchemaJson` của FormId 2.
   - Hệ quả: nhánh **value-pills cho field select vẫn chưa được test end-to-end**.

## 6. Verify đã chạy (browser thật, CDP :9222, `is-fs`)

- 4 popover (scope / add-filter / presets / chip-edit): mở, `z=200000`, `elementFromPoint` trúng popover ở
  cả 3 điểm probe, nằm trong viewport.
- Flip-up: viewport 460px → popover đáng lẽ tràn tới 641px, bị kẹp về `top=137,bottom=452`, vẫn click được.
- Bám anchor khi **scroll trong surface**: anchor 320→230, gap giữ nguyên 6px (listener `scroll` capture).
- Anti-regression `is-inline`: flip lên khi thiếu chỗ, quay xuống khi đủ, luôn trong viewport.
- Lọc E2E: `Requester Name contains 24873` → 50 rows → 1 row, badge "1 of 50 on this page".
- vi-VN: toàn bộ chuỗi dịch (ảnh: "Thêm bộ lọc", "Mẫu lọc 2", "Bài gửi mới · 0 bộ lọc · 7 ngày qua").
- Console: **0 error / 0 warn**.
