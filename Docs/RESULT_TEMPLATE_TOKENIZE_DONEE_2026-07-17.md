# KẾT QUẢ: Chuẩn hoá + tokenize 17 template DONEE + theme inheritance (2026-07-17)

Trạng thái: **SHIPPED trên nhánh `feat/theme-designer-picker-wizard-gallery-1.7.45` (commit `4c1cc6d..304e7fd`, chưa push) + LIVE :5125.**
Kế hoạch nền: `Docs/PLAN_TEMPLATE_THEME_UNIFICATION_2026-07-17.md`. Phương án owner duyệt: 3 template brand = **locked**, phạm vi = **chuẩn hoá + tokenize**, **sync wwwroot + archive**, **commit từng bước path hẹp**.

## 1. Đã làm

### P0 — Tooling + baseline (commit `4c1cc6d`)
- `tools/template-lint/`: lint (shape/duplicate/hardcode), normalize (manifest v2), css-io (extract/inject để sửa CSS trong file .css thật, không escape JSON tay), qa-server (harness renderer thật, comparator khử map iframe + font-race + preview-chrome), qa-shot (CDP screenshot), qa-diff (PIL pixel diff), verify-live / shot-url (chụp Oqtane live).
- Baseline 26 ảnh (17 template, gồm từng bước multi-step) tại `Docs/_qa_template_baseline_20260717/`.

### P1 — Chuẩn hoá cấu trúc (commit `7de04e8`) — parity 0.0000%
- Dedupe `customCss`/`customHtml` (8/17 file có 2 bản top-level vs settings **lệch byte thật**); giữ đúng bytes đang serve (top-level camelCase ưu tiên, mirror `BuilderTemplateCatalogStore.Normalize`).
- Xoá key dual-case `CustomHtml`; gắn `manifestVersion:2` + `settings.themeCompatibility` (policy tokenized ×6 / hybrid ×8 / locked ×3).

### Tokenize CSS (commit `6fc3689`) — parity 0.0000% cả 26 ảnh
14 template non-locked chuyển palette sang **dual-channel chain**:
```css
--tab-accent: var(--mf-page-primary, var(--mf-preset-primary, #4338ca));
```
- **PAGE channel** thắng (khi bật "Color source = From page" → borrow `--bs-*` host: surface + text + input + border + button đồng bộ).
- **PRESET channel** kế (khi chọn preset MegaForm).
- Hex authored cuối → **mặc định pixel-identical**.
- Immutable giữ nguyên: nút brand Facebook/GitHub (member-login), ảnh hero + gradient identity + màu status + rgba shadow. 3 template locked (festa-italiana, americana-journey, bulgaria-discovery) KHÔNG đụng CSS.
- Bằng chứng: reshoot độc lập cùng môi trường original vs tokenized = **26/26 ảnh 0 pixel đổi** (`Docs/_qa_template_parity_20260717/`).

### Runtime (commit `304e7fd`)
- `ThemeFirstPaintCssService`: manifest `themeCompatibility.policy` điều khiển borrow (locked giữ palette; tokenized/hybrid opt-in dù có premium palette vars). Emit `--mf-page-*` channel (primary/surface/wash/text/heading/muted/border/input-bg/focus-soft) + `--mf-cal-muted` khi From-page bật — **undefined mặc định** nên authored fallback render y hệt.
- `megaform.css`: datepicker `.mf-cal`/`.mf-ms`/`.mf-mccb` chain hover/border/text/bg qua `--mfv-*` (mọi literal giữ làm fallback) → **đọc được trên nền tối/màu**; mặc định không đổi.

## 2. Live QA :5125 (Fresh1804)

| Ảnh | Nội dung |
|---|---|
| `_qa_live_5125_20260717/04-gallery.png` | Gallery 17 template shape v2, thumbnail render sống |
| `_qa_live_5125_20260717/borrow/10-home-quartz-outback-borrowOFF.png` | Outback trên trang Quartz hồng, **borrow OFF** = giữ identity cát/kem |
| `_qa_live_5125_20260717/borrow/11-home-quartz-outback-borrowON.png` | **borrow ON** = card→tím Quartz, tiêu đề→trắng, nút→hồng `--bs-primary`, bước→hồng; **ảnh outback (immutable) giữ nguyên** |
| `scratchpad/cal-verify.png` | Datepicker nền tối: chữ ngày **trắng rõ** (trước = đen-trên-đen vô hình) |

## 3. CÒN LẠI (phiên sau)
- **Formalize Oqtane pack**: `wwwroot/Modules/MegaForm/Templates` bị gitignore; hiện sync tay từ DONEE. Nên thêm bước pack copy DONEE→wwwroot (giống `BuildPackage-DNN.ps1` đã làm) để 1 nguồn.
- **P4 client twin**: Web/Umbraco/builder-preview chưa có borrow (SSR-only) — switch From-page vẫn no-op ở đó.
- **ThemeIntegrationPolicy đầy đủ** (strip preset khi page mode) + fix `markNative()` ép `inheritPageColors=false`.
- P5 (Web 131 tpl + AI KB 178), Theme Registry hợp nhất id, server-validate theme id, wizard clobber fix.
- **Form 18 + 19 trên :5125 đã bị sửa để demo** (CSS tokenized + borrow ON); backup ở `scratchpad/form18_*.bak.json`. Là form test rác ("sdf"/"dfdd"), có thể để nguyên hoặc restore.

## 4. Cách xem lại
- Gallery: `http://localhost:5125` → Form Dashboard → New Form → Template Gallery.
- Borrow live: trang chủ (Quartz hồng) hiện form 19 outback borrow ON.
- Toggle borrow từng form: Settings popup → Page integration → Color source = MegaForm | From page.
